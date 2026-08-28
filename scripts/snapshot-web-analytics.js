#!/usr/bin/env node
/**
 * scripts/snapshot-web-analytics.js
 * Retrato dos dados do Vercel Web Analytics, guardado no repo.
 *
 * ─── Porquê ────────────────────────────────────────────────────────────
 * O plano Hobby do Vercel só guarda 30 DIAS de histórico. Passado esse
 * prazo os dados desaparecem e não há como os recuperar. Este script
 * copia-os para o repo antes disso, para se poder comparar épocas (ex:
 * "quantas visitas tivemos no Nacional de Jovens de 2026 vs 2027?").
 *
 * Dois formatos, ambos gravados:
 *   diário  → data-archive/analytics/daily/YYYY-MM-DD.json
 *   mensal  → data-archive/analytics/monthly/YYYY-MM.json
 *
 * O diário é a fonte de verdade (granularidade máxima, e um dia tem poucos
 * caminhos distintos, por isso nunca bate no tecto de 100 da API). O mensal
 * é a vista cómoda para ler de uma vez.
 *
 * ─── Autenticação ──────────────────────────────────────────────────────
 * Precisa de VERCEL_TOKEN (token de conta, criado em
 * vercel.com/account/tokens). Em GitHub Actions vem do secret com o mesmo
 * nome. O projectId e o teamId NÃO são segredos — são identificadores
 * públicos — e ficam aqui como default, sobreponíveis por env var.
 *
 * ─── Uso ───────────────────────────────────────────────────────────────
 *   node scripts/snapshot-web-analytics.js                  # ontem (UTC)
 *   node scripts/snapshot-web-analytics.js --day 2026-08-28
 *   node scripts/snapshot-web-analytics.js --month          # mês anterior
 *   node scripts/snapshot-web-analytics.js --month 2026-08
 *   node scripts/snapshot-web-analytics.js --backfill 30    # últimos 30 dias
 *   node scripts/snapshot-web-analytics.js --day 2026-08-28 --dry-run
 *
 * Exit codes (convenção da casa):
 *   0 = gravou algo novo   2 = sem alterações   1 = erro
 */

const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");

const API_BASE = "https://api.vercel.com/v1/query/web-analytics/visits";
const PROJECT_ID = process.env.VERCEL_PROJECT_ID || "prj_e5dXWDKRiKaiVD8fYxOMQAnCEfpE";
const TEAM_ID = process.env.VERCEL_TEAM_ID || "team_uiEIyOXbh4OhlNWQpjnVrVID";
const TOKEN = process.env.VERCEL_TOKEN || "";

const OUT_ROOT = path.join(__dirname, "..", "data-archive", "analytics");

/**
 * Dimensões simples. "route" só vem preenchido em apps Next.js — aqui o
 * pacote é o React genérico, por isso deve vir vazio. Guarda-se na mesma:
 * custa uma chamada e, se um dia mudar, o histórico fica coerente.
 */
const DIMENSIONS = [
  "requestPath",
  "route",
  "country",
  "deviceType",
  "browserName",
  "osName",
  "referrerHostname",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
];

/** Cruzamentos de 2 dimensões (o máximo que a API aceita). */
const PAIRS = [
  ["requestPath", "country"],
  ["requestPath", "deviceType"],
  ["requestPath", "referrerHostname"],
];

/** Cruzamentos só do retrato mensal (precisam do eixo do tempo). */
const MONTHLY_PAIRS = [
  ["day", "requestPath"],
  ["day", "country"],
  ["day", "deviceType"],
];

const LIMIT = 100; // tecto da API; acima disso o resto cai em "Others"

// ══════════════════════════════════════════════════════════════════════
// HTTP
// ══════════════════════════════════════════════════════════════════════

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Uma chamada à API, com retry em erros transitórios.
 *
 * ⚠ A forma de passar duas dimensões em `by` não está documentada de forma
 * inequívoca. Tenta-se primeiro o parâmetro repetido (by=a&by=b), que é o
 * que a API do Vercel usa noutros sítios, e cai-se para a lista separada
 * por vírgulas se o servidor recusar. Sem isto, uma mudança de convenção
 * do lado deles partia os cruzamentos em silêncio.
 */
async function apiGet(kind, params, { byStyle = "repeat" } = {}) {
  const url = new URL(`${API_BASE}/${kind}`);
  url.searchParams.set("projectId", PROJECT_ID);
  if (TEAM_ID) url.searchParams.set("teamId", TEAM_ID);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (k === "by" && Array.isArray(v)) {
      if (byStyle === "repeat") for (const d of v) url.searchParams.append("by", d);
      else url.searchParams.set("by", v.join(","));
    } else {
      url.searchParams.set(k, String(v));
    }
  }

  let lastErr = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
      });
    } catch (e) {
      lastErr = new Error(`rede: ${e.message}`);
      await sleep(1500 * attempt);
      continue;
    }

    if (res.ok) return res.json();

    const body = await res.text().catch(() => "");

    // 400 num cruzamento de 2 dimensões → tentar a outra convenção.
    if (res.status === 400 && Array.isArray(params.by) && params.by.length > 1 && byStyle === "repeat") {
      return apiGet(kind, params, { byStyle: "comma" });
    }
    // Erros de credenciais/permissão não melhoram com retry.
    if (res.status === 401 || res.status === 403) {
      throw new Error(`HTTP ${res.status} — token inválido ou sem acesso ao projecto. ${body.slice(0, 300)}`);
    }
    if (res.status === 400) {
      throw new Error(`HTTP 400 — pedido recusado (${JSON.stringify(params)}). ${body.slice(0, 300)}`);
    }

    lastErr = new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * attempt);
      continue;
    }
    throw lastErr;
  }
  throw lastErr || new Error("falhou sem erro registado");
}

// ══════════════════════════════════════════════════════════════════════
// DATAS — tudo em UTC, que é o fuso em que a API responde
// ══════════════════════════════════════════════════════════════════════

const pad = (n) => String(n).padStart(2, "0");
const isDay = (s) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s);
const isMonth = (s) => /^[0-9]{4}-[0-9]{2}$/.test(s);

function dayBounds(dayStr) {
  return { since: `${dayStr}T00:00:00.000Z`, until: `${dayStr}T23:59:59.999Z` };
}

function monthBounds(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // dia 0 do mês seguinte
  return {
    since: `${monthStr}-01T00:00:00.000Z`,
    until: `${monthStr}-${pad(last)}T23:59:59.999Z`,
  };
}

function shiftDay(dayStr, delta) {
  const d = new Date(`${dayStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function yesterdayUtc(now) {
  return shiftDay(now.toISOString().slice(0, 10), -1);
}

function previousMonthUtc(now) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

// ══════════════════════════════════════════════════════════════════════
// RECOLHA
// ══════════════════════════════════════════════════════════════════════

async function collect(since, until, { withTime }) {
  const out = { total: null, dimensoes: {}, cruzamentos: {}, avisos: [] };

  const count = await apiGet("count", { since, until });
  out.total = count && count.data ? count.data : count;

  const singles = withTime ? ["day", "hour", ...DIMENSIONS] : ["hour", ...DIMENSIONS];
  for (const dim of singles) {
    try {
      const r = await apiGet("aggregate", { since, until, by: [dim], limit: LIMIT });
      const rows = Array.isArray(r && r.data) ? r.data : [];
      out.dimensoes[dim] = rows;
      if (rows.length >= LIMIT) {
        out.avisos.push(`${dim}: atingiu o tecto de ${LIMIT} — o excedente foi agrupado em "Others" pela API.`);
      }
    } catch (e) {
      out.dimensoes[dim] = null;
      out.avisos.push(`${dim}: falhou (${e.message})`);
    }
    await sleep(250); // gentileza com o rate limit
  }

  const pairs = withTime ? [...MONTHLY_PAIRS, ...PAIRS] : PAIRS;
  for (const pair of pairs) {
    const key = pair.join(" x ");
    try {
      const r = await apiGet("aggregate", { since, until, by: pair, limit: LIMIT });
      const rows = Array.isArray(r && r.data) ? r.data : [];
      out.cruzamentos[key] = rows;
      if (rows.length >= LIMIT) {
        out.avisos.push(`${key}: atingiu o tecto de ${LIMIT} — ver os retratos diários para o detalhe completo.`);
      }
    } catch (e) {
      out.cruzamentos[key] = null;
      out.avisos.push(`${key}: falhou (${e.message})`);
    }
    await sleep(250);
  }

  return out;
}

// ══════════════════════════════════════════════════════════════════════
// ESCRITA
// ══════════════════════════════════════════════════════════════════════

/** Compara ignorando o carimbo temporal — só grava se o conteúdo mudou. */
function mudou(outPath, novo) {
  if (!fs.existsSync(outPath)) return true;
  try {
    const velho = JSON.parse(fs.readFileSync(outPath, "utf8"));
    const limpa = (o) => {
      const c = { ...o };
      delete c.geradoEm;
      return JSON.stringify(c);
    };
    return limpa(velho) !== limpa(novo);
  } catch {
    return true; // ficheiro ilegível → reescrever
  }
}

async function snapshot({ tipo, chave, dryRun }) {
  const { since, until } = tipo === "day" ? dayBounds(chave) : monthBounds(chave);
  const dados = await collect(since, until, { withTime: tipo === "month" });

  const registo = {
    tipo,
    periodo: chave,
    since,
    until,
    projeto: PROJECT_ID,
    fonte: "Vercel Web Analytics (v1/query/web-analytics/visits)",
    nota: "Visitantes e páginas vistas do golf-fpg. Dados agregados — a API não expõe IPs nem identifica pessoas.",
    geradoEm: new Date().toISOString(),
    ...dados,
  };

  const dir = path.join(OUT_ROOT, tipo === "day" ? "daily" : "monthly");
  const outPath = path.join(dir, `${chave}.json`);

  const v = registo.total || {};
  const resumo = `${chave}: ${v.visitors ?? "?"} visitantes, ${v.pageviews ?? "?"} páginas`;

  if (dryRun) {
    console.log(`[dry-run] ${resumo} → ${path.relative(process.cwd(), outPath)}`);
    if (registo.avisos.length) registo.avisos.forEach((a) => console.log(`  aviso: ${a}`));
    return { gravou: false, resumo };
  }

  if (!mudou(outPath, registo)) {
    console.log(`sem alterações — ${resumo}`);
    return { gravou: false, resumo };
  }

  fs.mkdirSync(dir, { recursive: true });
  writeJsonAtomic(outPath, registo);
  console.log(`gravado — ${resumo} → ${path.relative(process.cwd(), outPath)}`);
  if (registo.avisos.length) registo.avisos.forEach((a) => console.log(`  aviso: ${a}`));
  return { gravou: true, resumo };
}

// ══════════════════════════════════════════════════════════════════════
// CLI
// ══════════════════════════════════════════════════════════════════════

function parseArgs(argv) {
  const o = { dryRun: false, alvos: [] };
  const now = new Date();

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const proximo = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;

    if (a === "--dry-run") o.dryRun = true;
    else if (a === "--day") {
      o.alvos.push({ tipo: "day", chave: proximo || yesterdayUtc(now) });
      if (proximo) i++;
    } else if (a === "--month") {
      o.alvos.push({ tipo: "month", chave: proximo || previousMonthUtc(now) });
      if (proximo) i++;
    } else if (a === "--backfill") {
      const n = Number(proximo || 30);
      if (proximo) i++;
      const hoje = now.toISOString().slice(0, 10);
      for (let d = n; d >= 1; d--) o.alvos.push({ tipo: "day", chave: shiftDay(hoje, -d) });
    } else if (a === "--help" || a === "-h") {
      o.ajuda = true;
    }
  }

  if (!o.alvos.length && !o.ajuda) o.alvos.push({ tipo: "day", chave: yesterdayUtc(now) });
  return o;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.ajuda) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^#!.*\n/, ""));
    process.exit(0);
  }

  if (!TOKEN) {
    console.error("ERRO: falta VERCEL_TOKEN.");
    console.error("  Local:   $env:VERCEL_TOKEN = '...'   (criar em vercel.com/account/tokens)");
    console.error("  Actions: secret VERCEL_TOKEN no repositório");
    process.exit(1);
  }

  for (const alvo of opts.alvos) {
    const ok = alvo.tipo === "day" ? isDay(alvo.chave) : isMonth(alvo.chave);
    if (!ok) {
      console.error(`ERRO: '${alvo.chave}' não é ${alvo.tipo === "day" ? "uma data YYYY-MM-DD" : "um mês YYYY-MM"}.`);
      process.exit(1);
    }
  }

  let gravou = 0;
  for (const alvo of opts.alvos) {
    const r = await snapshot({ ...alvo, dryRun: opts.dryRun });
    if (r.gravou) gravou++;
  }

  if (gravou === 0) {
    console.log("Nada de novo para gravar.");
    process.exit(2);
  }
  console.log(`${gravou} retrato(s) gravado(s).`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("ERRO:", e.message);
    process.exit(1);
  });
}

module.exports = { dayBounds, monthBounds, shiftDay, yesterdayUtc, previousMonthUtc, parseArgs, mudou };
