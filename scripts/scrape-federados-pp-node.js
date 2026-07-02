#!/usr/bin/env node
/**
 * scrape-federados-pp-node.js — Dump COMPLETO dos federados com handicap
 *                               Pitch & Putt (~3.450 activos) via Node puro.
 *
 * O "mundo alternativo" do P&P vive num subsistema de scoring paralelo ao
 * /lists/ normal: `scoring.fpg.pt/listspp/`. A página pública de pesquisa
 * (Federatedsearch.aspx) alimenta-se do PageMethod:
 *
 *     POST /listspp/FederatedSearch.aspx/HandicapsLST
 *
 * É PÚBLICO (sem login) — basta uma sessão ASP.NET aquecida pelo linkpage.
 * Cada federado traz fed_code, nome, género, data de nascimento, clube,
 * hcp P&P (hcp_type="PP"), escalão, e — crucial para "quem é muito activo" —
 * `rounds_current_year` (cartões P&P entregues no ano civil).
 *
 * Mecânica descoberta 2026-06-14:
 *   - `MaxResults` é um TETO server-side: se o total exceder, devolve
 *     Result:"ERROR" ("Demasiados resultados"). Pôr alto (999999) anula-o.
 *   - jtPageSize máximo 100 (150+ → HTTP 500). ~35 páginas.
 *   - O servidor FPG é frágil a acesso programático repetido de um IP "frio"
 *     (datacenter) → HTTP 500. Daí: warmup de sessão + delays + retry/backoff
 *     com RE-WARM. De um IP residencial / com cookies de browser aquecido
 *     (FPG_PP_COOKIES) é estável.
 *
 * Cookies (OPCIONAIS — endpoint público):
 *   - Por defeito o script aquece a própria sessão via linkpage.aspx.
 *   - Se o auto-warmup for bloqueado (500 persistente), fornecer cookies de um
 *     browser real de `scoring.fpg.pt` via env FPG_PP_COOKIES (ou
 *     FPG_ADMISSIONS_COOKIES) ou ficheiro api/.fpg-pp-cookies.json.
 *
 * Output: public/data/federados-pp.json
 *   { generated, source, totalReported, totalScraped, players:[ {fed,name,
 *     sex,dob,clubCode,club,acronym,hcp,hcpExact,hcpStatus,hcpType,age,
 *     country,roundsYear,admission,lastHcp} ] }
 *
 * Exit codes: 0 = actualizado, 2 = sem alterações, 1 = erro.
 *
 * Uso:
 *   node scripts/scrape-federados-pp-node.js                 # full, grava se mudou
 *   node scripts/scrape-federados-pp-node.js --check-only    # compara, não grava
 *   node scripts/scrape-federados-pp-node.js --max-pages 3   # debug (parcial → exige --force p/ gravar)
 *   node scripts/scrape-federados-pp-node.js --out ./pp.json
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const { loadCookieHeader } = require("./lib/cookies");
const { writeJsonAtomic }  = require("./lib/atomic-write");
const { lisbonCivilDayStr } = require("../lib/helpers");

const ROOT = path.resolve(__dirname, "..");
const OUT_DEFAULT  = path.join(ROOT, "public", "data", "federados-pp.json");
const COOKIES_PATH = path.join(ROOT, "api", ".fpg-pp-cookies.json");

const HOST    = "https://scoring.fpg.pt/listspp";
const SEARCH  = `${HOST}/FederatedSearch.aspx/HandicapsLST`;
const LINKPAGE = `${HOST}/linkpage.aspx?page=searchfed&club=All&ack=8428ACK987`;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ── Args CLI ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argVal = (flag) => { const i = args.indexOf(flag); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
const checkOnly = args.includes("--check-only");
const force     = args.includes("--force");
const maxPagesRaw = argVal("--max-pages");
const maxPages    = maxPagesRaw ? parseInt(maxPagesRaw, 10) : Number.MAX_SAFE_INTEGER;
const outPath   = argVal("--out") || OUT_DEFAULT;
const pageSize  = parseInt(argVal("--page-size") || "100", 10);
const delayMs   = parseInt(argVal("--delay-ms") || "300", 10);

if (Number.isNaN(maxPages)) { console.error(`✗ --max-pages inválido: "${maxPagesRaw}"`); process.exit(1); }

// ── Cookies (opcionais) ──────────────────────────────────────────
// Endpoint é público; só usamos cookies externos se fornecidos. Não falha se
// ausentes — o auto-warmup trata da sessão.
function loadOptionalCookies() {
  const fromEnv = process.env.FPG_PP_COOKIES || process.env.FPG_ADMISSIONS_COOKIES;
  if (fromEnv) { console.log("[fed-pp] cookies de env (FPG_PP_COOKIES/FPG_ADMISSIONS_COOKIES)"); return fromEnv; }
  if (fs.existsSync(COOKIES_PATH)) {
    return loadCookieHeader({ envVars: [], file: COOKIES_PATH, label: "[fed-pp]", exitOnFail: false });
  }
  return null;
}

// ── Cookie jar simples (acumula Set-Cookie entre hops) ───────────
function addSetCookies(jar, res) {
  const arr = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const sc of arr) {
    const first = sc.split(";")[0];
    const eq = first.indexOf("=");
    if (eq > 0) jar[first.slice(0, eq).trim()] = first.slice(eq + 1).trim();
  }
}
function cookieHeader(jar, extra) {
  const parts = Object.entries(jar).map(([k, v]) => `${k}=${v}`);
  if (extra) parts.unshift(extra);
  return parts.join("; ");
}

// ── Warmup: GET linkpage (segue redirects manualmente p/ capturar cookies) ─
async function warmup(jar, extraCookie) {
  let url = LINKPAGE;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9",
        "Cookie": cookieHeader(jar, extraCookie),
        "Referer": `${HOST}/`,
      },
      redirect: "manual",
    });
    addSetCookies(jar, res);
    const loc = res.headers.get("location");
    if ([301, 302, 303, 307, 308].includes(res.status) && loc) { url = new URL(loc, url).href; continue; }
    await res.text().catch(() => {});
    return res.status;
  }
  return -1;
}

// ── .NET /Date(ms)/ → ISO YYYY-MM-DD (dia civil de Lisboa) ────────
// toISOString() dava o dia -1 no horário de verão (Abril-Outubro).
function netDate(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/\/Date\((-?\d+)\)\//);
  return m ? lisbonCivilDayStr(parseInt(m[1], 10)) : null;
}

function trim(r) {
  return {
    fed:        r.federation_code,
    name:       r.name,
    sex:        r.gender,
    dob:        netDate(r.birthdate),
    clubCode:   r.club_code,
    club:       r.club_name,
    acronym:    r.acronym,
    hcp:        r.hcp_index,
    hcpExact:   r.hcp_exact,
    hcpStatus:  (r.hcp_status || "").trim(),
    hcpType:    r.hcp_type,        // "PP"
    age:        r.age_level,
    country:    r.country_prefix,
    roundsYear: r.rounds_current_year,
    admission:  netDate(r.admission_date),
    lastHcp:    netDate(r.last_hcp_date),
  };
}

// ── Fetch dum batch (com retry + re-warm em 500) ─────────────────
function searchBody(start, size) {
  return {
    name: "", fedno: "", ClubCode: "0", FedStat: "9", Gender: "",
    Agelev: "-1", HcpStat: "-1", FHcp: "-99", THcp: "-99", ProAm: "0",
    IniFlag: "0", FAge: "0", TAge: "999", Permit: "", MaxResults: "999999",
    MessMax: "Demasiados resultados. Por favor refine a pesquisa.",
    jtStartIndex: String(start), jtPageSize: String(size), jtSorting: "name ASC",
  };
}

async function fetchPage(jar, extraCookie, start, size) {
  const qs = `jtStartIndex=${start}&jtPageSize=${size}&jtSorting=${encodeURIComponent("name ASC")}`;
  const res = await fetch(`${SEARCH}?${qs}`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Origin": "https://scoring.fpg.pt",
      "Referer": `${HOST}/Federatedsearch.aspx`,
      "Cookie": cookieHeader(jar, extraCookie),
    },
    body: JSON.stringify(searchBody(start, size)),
  });
  if (!res.ok) { const t = await res.text().catch(() => ""); const e = new Error(`HTTP ${res.status}`); e.status = res.status; e.body = t.slice(0, 120); throw e; }
  const json = await res.json();
  const d = json.d || json;
  if (d.Result !== "OK") throw new Error(`Result=${d.Result} (${d.Message || "sem msg"})`);
  return { records: d.Records || [], total: d.TotalRecordCount };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchPageResilient(jar, extraCookie, start, size, label) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fetchPage(jar, extraCookie, start, size);
    } catch (e) {
      const transient = e.status === 500 || /Result=ERROR/.test(e.message);
      console.warn(`  [${label}] tentativa ${attempt + 1} falhou: ${e.message}${e.status === 500 ? " — re-warm + backoff" : ""}`);
      if (!transient || attempt === 3) throw e;
      // re-aquecer a sessão (provável que o servidor a tenha deitado fora)
      await sleep(800 * (attempt + 1));
      await warmup(jar, extraCookie);
    }
  }
  throw new Error("inalcançável");
}

// ── Comparação ignorando timestamps ──────────────────────────────
function canonPlayers(file) {
  const sorted = [...(file.players || [])].sort((a, b) => String(a.fed).localeCompare(String(b.fed)));
  return JSON.stringify(sorted);
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const extraCookie = loadOptionalCookies();
  console.log(`→ Endpoint: ${SEARCH}`);
  console.log(`→ jtPageSize=${pageSize}, delay=${delayMs}ms, max-pages=${maxPages === Number.MAX_SAFE_INTEGER ? "∞" : maxPages}, cookies=${extraCookie ? "sim" : "auto-warmup"}`);

  const jar = {};
  const wStatus = await warmup(jar, extraCookie);
  console.log(`→ Warmup linkpage: HTTP ${wStatus}, sessão=${Object.keys(jar).join(",") || "(via cookies fornecidos)"}`);

  const t0 = Date.now();
  const all = [];
  let total = null, page = 0;

  while (page < maxPages) {
    const start = page * pageSize;
    let data;
    try {
      data = await fetchPageResilient(jar, extraCookie, start, pageSize, `pág ${page + 1}`);
    } catch (e) {
      console.error(`  ✗ Falha definitiva na página ${page + 1} (start=${start}): ${e.message}`);
      console.error(`    Dica: IP frio (datacenter) é frequentemente bloqueado pela FPG. Correr do PC,`);
      console.error(`    ou fornecer cookies de browser via FPG_PP_COOKIES / api/.fpg-pp-cookies.json.`);
      break;
    }
    total = data.total;
    if (!data.records.length) break;
    for (const r of data.records) all.push(trim(r));
    const pct = total ? ((all.length / total) * 100).toFixed(1) : "?";
    process.stdout.write(`\r  Página ${page + 1} · ${all.length}/${total ?? "?"} (${pct}%) · ${((Date.now() - t0) / 1000).toFixed(1)}s   `);
    page++;
    if (total && all.length >= total) break;
    if (delayMs) await sleep(delayMs);
  }
  process.stdout.write("\n");
  console.log(`✓ Recolhidos ${all.length} de ${total ?? "?"} federados P&P em ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Estatísticas
  const withHcp = all.filter(p => p.hcpExact != null && p.hcpExact < 99 && !/sem hcp/i.test(p.hcpStatus)).length;
  const activeYear = all.filter(p => (p.roundsYear || 0) > 0).length;
  const juniors = all.filter(p => /^SUB/i.test(p.age || "")).length;
  console.log(`  Com HCP P&P válido: ${withHcp} · Activos este ano: ${activeYear} · Juniores (Sub-*): ${juniors}`);

  const out = {
    generated: new Date().toISOString(),
    source: "scoring.fpg.pt/listspp/FederatedSearch.aspx (pesquisa pública P&P)",
    totalReported: total,
    totalScraped: all.length,
    players: all,
  };

  // Comparar com versão prévia
  let prev = null;
  if (fs.existsSync(outPath)) {
    try { prev = JSON.parse(fs.readFileSync(outPath, "utf8")); }
    catch { console.warn(`  Aviso: ${outPath} ilegível — assumir primeiro run.`); }
  }
  if (prev && canonPlayers(prev) === canonPlayers(out)) {
    console.log(`✓ Sem alterações reais — skip gravação.`);
    process.exit(2);
  }

  // ── Guardas anti-overwrite ──
  if (all.length === 0) {
    console.error(`✗ 0 registos — recusar gravar (provável bloqueio/erro de sessão).`);
    process.exit(1);
  }
  const cappedRun = total && all.length < total;
  if (cappedRun && !maxPagesRaw && !force) {
    console.error(`✗ Run incompleto: ${all.length}/${total}. Refazer ou usar --force.`);
    process.exit(1);
  }
  if (prev && (prev.players || []).length > 0) {
    const ratio = all.length / prev.players.length;
    if (ratio < 0.9 && !force) {
      console.error(`✗ ${all.length} vs anterior ${prev.players.length} (perda ${((1 - ratio) * 100).toFixed(1)}%) — recusar sem --force.`);
      process.exit(1);
    }
  }
  if (maxPagesRaw && cappedRun && !force) {
    console.error(`✗ Run com --max-pages (${all.length}/${total}) é parcial — usar --force ou --out p/ outro ficheiro.`);
    process.exit(1);
  }
  if (checkOnly) { console.log(`(check-only) Alterações detectadas, não gravado.`); process.exit(0); }

  console.log(`→ A gravar ${outPath}...`);
  writeJsonAtomic(outPath, out);
  const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
  console.log(`✓ Gravado: ${outPath} (${kb} KB)`);
  process.exit(0);
}

main().catch(err => { console.error(`✗ Erro fatal: ${err.message}`); console.error(err.stack); process.exit(1); });
