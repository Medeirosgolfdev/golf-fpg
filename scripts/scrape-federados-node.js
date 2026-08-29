#!/usr/bin/env node
/**
 * scrape-federados-node.js — Refresh COMPLETO de federados.json (~15.600)
 *                            via Node puro (sem browser console).
 *
 * Versão Node-puro do antigo `scripts/scrape-federados.js` (browser console
 * em scoring.datagolf.pt). Cookies (ASP.NET_SessionId + DG_Lists_URL) via
 * env DATAGOLF_SCORING_COOKIES (Actions) ou ficheiro local
 * `api/.scoring-datagolf-cookies.json` (dev).
 *
 * Útil quando:
 *   - A FPG actualiza fotos de jogadores (paths antigos passam a 404)
 *   - Há novos federados ou mudanças de clube/HCP
 *   - Geral: refresh periódico para manter players.json + federados.json
 *     sincronizados com o estado actual da FPG.
 *
 * Características:
 *   - Endpoint: POST /pt/FederatedsList_V2.aspx/HandicapsLST
 *   - jtPageSize=100 (200+ → HTTP 500), ~156 páginas, ~30s total
 *   - Filtros default: FedStat=9 (activos), todos os clubes, género, escalão
 *   - .NET /Date(ms)/ → ISO YYYY-MM-DD para 4 campos
 *   - Compara byte-a-byte com federados.json existente; só grava se mudou
 *   - Exit code 0 = ficheiro actualizado, 2 = sem alterações, 1 = erro
 *
 * Uso:
 *   node scripts/scrape-federados-node.js                 # full refresh, grava se mudou
 *   node scripts/scrape-federados-node.js --check-only    # não grava, só compara
 *   node scripts/scrape-federados-node.js --max-pages 5   # limite (debug)
 *   node scripts/scrape-federados-node.js --out ./fed.json
 *
 * Pré-requisito: api/.scoring-datagolf-cookies.json com cookies frescos do
 * Chrome 90 (ver CLAUDE.md "Cenário 1: Os cookies expiraram").
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const { loadCookieHeader } = require("./lib/cookies");
const { lisbonCivilDayStr } = require("../lib/helpers");

const ROOT = path.resolve(__dirname, "..");
const COOKIES_PATH   = path.join(ROOT, "api", ".scoring-datagolf-cookies.json");
const FEDERADOS_PATH = path.join(ROOT, "public", "data", "federados.json");

const ENDPOINT = "https://scoring.datagolf.pt/pt/FederatedsList_V2.aspx/HandicapsLST";

// ── Args CLI ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argVal = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const checkOnly = args.includes("--check-only");
const force     = args.includes("--force");
// Bug fix 2026-05-05: parseInt("Infinity") devolve NaN → loop `page < NaN`
// nunca corre → script gravava 0 registos por cima de federados.json bom.
// Sem default explícito, só limitar quando o user passa --max-pages.
const maxPagesRaw = argVal("--max-pages");
const maxPages    = maxPagesRaw ? parseInt(maxPagesRaw, 10) : Number.MAX_SAFE_INTEGER;
const outPath   = argVal("--out") || FEDERADOS_PATH;
const pageSize  = parseInt(argVal("--page-size") || "100", 10);
const delayMs   = parseInt(argVal("--delay-ms") || "150", 10);

if (Number.isNaN(maxPages)) {
  console.error(`✗ --max-pages inválido: "${maxPagesRaw}" — esperava um inteiro.`);
  process.exit(1);
}

// ── Cookies ──────────────────────────────────────────────────────
// Fonte (por ordem): env DATAGOLF_SCORING_COOKIES (Actions) → ficheiro
// api/.scoring-datagolf-cookies.json (dev local). Via lib partilhada.
function loadCookies() {
  return loadCookieHeader({
    envVars: ["DATAGOLF_SCORING_COOKIES"],
    file: COOKIES_PATH,
    label: "[federados]",
  });
}

// ── .NET /Date(ms)/ → ISO YYYY-MM-DD (dia civil de Lisboa) ────────
// Os epochs codificam meia-noite em hora de Lisboa; converter via
// toISOString() dava o dia -1 no horário de verão (Abril-Outubro).
function parseNetDate(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/^\/Date\((-?\d+)\)\/$/);
  return m ? lisbonCivilDayStr(parseInt(m[1], 10)) : null;
}

const DATE_FIELDS = new Set(["birthdate", "admission_date", "last_hcp_date", "dt_aniv"]);
function normalize(r) {
  const out = {};
  for (const k of Object.keys(r)) {
    out[k] = DATE_FIELDS.has(k) ? parseNetDate(r[k]) : r[k];
  }
  return out;
}

// User-Agent do Chrome 90 — o mesmo browser que minta estes cookies (ver
// CLAUDE.md, "Chrome 90 — setup detalhado") e o mesmo que o test-datagolf-node
// usa para validar o secret.
const UA = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36";

// ── Warm-up da sessão ────────────────────────────────────────────
/* ⚠ Este endpoint NÃO responde a um POST directo com sessão fria.
 *
 * Medido a 2026-08-29, com cookies frescos e válidos (o cookie-health passou
 * nos 3 conjuntos no mesmo minuto): `HandicapsLST` devolvia HTTP 500 logo no
 * startIndex=0, três tentativas seguidas, enquanto o `TournamentsLST` — mesmo
 * domínio, mesmos cookies, sem warm-up — respondia perfeitamente.
 *
 * A assimetria explica-se: o cookie `DG_Lists_URL` é capturado a navegar a
 * lista de TORNEIOS (`page=tournlist`), por isso o servidor tem contexto para
 * essa página e não para a dos federados. É a armadilha que o CLAUDE.md já
 * documentava para admissions/classif ("linkpage.aspx é o gateway canónico —
 * não ir directo às páginas alvo"), e este era o único scraper que ia directo.
 *
 * Enquanto os cookies eram capturados à mão e usados minutos depois, a sessão
 * ainda vinha quente do browser e isto passava despercebido — funcionou às
 * 14:09 de 26/08 e falhou às 19:09 do mesmo dia, sem uma linha de código pelo
 * meio. Era o estado server-side a arrefecer, não os cookies a expirar.
 *
 * A ordem importa: aquece-se o entry-gate primeiro (repõe o contexto de
 * listas), depois a própria página dos federados, adoptando pelo caminho
 * qualquer cookie que o servidor devolva. Se ele nos entregar uma sessão
 * nova, a antiga estava morta e é a nova que tem de ser aquecida — daí
 * adoptar ANTES do passo seguinte, e não no fim.
 */
const ACK_TOURNLIST = "XH256YF45T";
const WARMUP_URLS = [
  `https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=${ACK_TOURNLIST}`,
  "https://scoring.datagolf.pt/pt/FederatedsList_V2.aspx",
];

/** Junta ao header os cookies que o servidor mandou (os novos ganham). */
function mergeCookies(cookieHeader, setCookies) {
  if (!setCookies || !setCookies.length) return cookieHeader;
  const jar = new Map();
  for (const part of cookieHeader.split(";")) {
    const kv = part.trim();
    if (!kv) continue;
    const i = kv.indexOf("=");
    if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1));
  }
  let mudou = false;
  for (const sc of setCookies) {
    const first = String(sc).split(";")[0];
    const i = first.indexOf("=");
    if (i <= 0) continue;
    const k = first.slice(0, i).trim();
    const v = first.slice(i + 1);
    if (!v || v === "deleted") continue;
    if (jar.get(k) !== v) mudou = true;
    jar.set(k, v);
  }
  if (mudou) console.log("  (o servidor devolveu cookies novos — adoptados)");
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function warmup(cookieHeader) {
  let cookie = cookieHeader;
  for (const url of WARMUP_URLS) {
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Referer": "https://scoring.datagolf.pt/",
          "Cookie": cookie,
        },
        redirect: "follow",
      });
      await r.text();
      const set = typeof r.headers.getSetCookie === "function"
        ? r.headers.getSetCookie()
        : (r.headers.get("set-cookie") ? [r.headers.get("set-cookie")] : []);
      cookie = mergeCookies(cookie, set);
      console.log(`  warm-up ${new URL(url).pathname} → HTTP ${r.status}`);
    } catch (e) {
      // Um warm-up falhado não é fatal: o POST a seguir dirá se chega ou não.
      console.warn(`  warm-up ${url} falhou: ${e.message}`);
    }
  }
  return cookie;
}

// ── Fetch dum batch ──────────────────────────────────────────────
async function fetchPage(cookieHeader, startIndex, batchSize) {
  const body = {
    name: "", fedno: "", ClubCode: "0", FedStat: "9", Gender: "0",
    Agelev: "0", HcpStat: "0", FHcp: "", THcp: "", ProAm: "0",
    IniFlag: "0", FAge: "", TAge: "", Permit: "", MaxResults: "0",
    MessMax: "Demasiados resultados. Por favor refine a pesquisa.",
    jtStartIndex: String(startIndex),
    jtPageSize:   String(batchSize),
    jtSorting:    "name ASC",
  };

  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": UA,
      "Origin":  "https://scoring.datagolf.pt",
      "Referer": "https://scoring.datagolf.pt/pt/FederatedsList_V2.aspx",
      "Cookie":  cookieHeader,
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) throw new Error(`HTTP ${r.status} @ startIndex=${startIndex}`);
  const json = await r.json();
  const d = json.d || json;
  if (d.Result !== "OK") throw new Error(`Result=${d.Result} msg=${d.Message || "(vazio)"}`);
  return { records: d.Records || [], total: d.TotalRecordCount };
}

// ── Comparação byte-a-byte ignorando timestamps ─────────────────
function jsonEqualIgnoringTimestamps(a, b) {
  if (!a || !b) return false;
  if ((a.players || []).length !== (b.players || []).length) return false;
  // Comparar players canonicamente: ordenar por federation_code e stringify
  const canon = (file) => {
    const sorted = [...(file.players || [])].sort(
      (x, y) => String(x.federation_code).localeCompare(String(y.federation_code))
    );
    return JSON.stringify(sorted);
  };
  return canon(a) === canon(b);
}

// ── Diff resumo: quantos players têm campo X diferente ──────────
function summarizeChanges(prev, next) {
  if (!prev) return { newPlayers: (next.players || []).length, photoChanges: 0, hcpChanges: 0, clubChanges: 0 };
  const prevByFed = new Map((prev.players || []).map(p => [String(p.federation_code), p]));
  const nextByFed = new Map((next.players || []).map(p => [String(p.federation_code), p]));
  let photoChanges = 0, hcpChanges = 0, clubChanges = 0, newPlayers = 0, removed = 0;
  for (const [fed, n] of nextByFed) {
    const p = prevByFed.get(fed);
    if (!p) { newPlayers++; continue; }
    if ((p.photo || null) !== (n.photo || null)) photoChanges++;
    if ((p.hcp_exact ?? null) !== (n.hcp_exact ?? null)) hcpChanges++;
    if ((p.club_code || "") !== (n.club_code || "")) clubChanges++;
  }
  for (const fed of prevByFed.keys()) if (!nextByFed.has(fed)) removed++;
  return { newPlayers, removed, photoChanges, hcpChanges, clubChanges };
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  let cookieHeader = loadCookies();
  console.log(`→ Endpoint: ${ENDPOINT}`);
  console.log(`→ jtPageSize=${pageSize}, delay=${delayMs}ms, max-pages=${maxPages === Infinity ? "∞" : maxPages}`);
  console.log(`→ Warm-up da sessão (este endpoint recusa POST a frio)...`);
  cookieHeader = await warmup(cookieHeader);
  console.log(`→ A iniciar...`);

  const t0 = Date.now();
  const all = [];
  let total = null;
  let page = 0;

  while (page < maxPages) {
    const startIndex = page * pageSize;
    // O scoring.datagolf.pt atira HTTP 500 esporádicos (é por isso que o
    // scripts/lib/fpg-http.js também tem retry a 500). Com uma só repetição a
    // 2s, um soluço do servidor na PRIMEIRA página abortava o run inteiro com
    // 0 registos — foi o que aconteceu a 2026-08-20. Três tentativas com
    // espera crescente distinguem melhor o soluço da sessão morta; se forem
    // mesmo cookies expirados, todas falham e o run acaba na mesma (só ~8s
    // mais tarde), com a guarda dos 0 registos a impedir a gravação.
    const RETRY_WAITS_MS = [2000, 6000];
    let data;
    for (let attempt = 0; ; attempt++) {
      try {
        data = await fetchPage(cookieHeader, startIndex, pageSize);
        break;
      } catch (e) {
        const wait = RETRY_WAITS_MS[attempt];
        if (wait == null) {
          console.error(`  Falha em ${RETRY_WAITS_MS.length + 1} tentativas na página ${page}: ${e.message} — abortar com ${all.length} recolhidos.`);
          break;
        }
        console.warn(`  Falha na página ${page} (${startIndex}): ${e.message} — retry em ${wait / 1000}s`);
        await new Promise(r => setTimeout(r, wait));
        // Um 500 é o sintoma de sessão fria, não só de soluço do servidor: se
        // a primeira repetição não chegou, re-aquecer antes da última. Uma
        // sessão pode arrefecer a meio de um run longo.
        if (attempt >= 0 && /HTTP 500/.test(e.message)) {
          cookieHeader = await warmup(cookieHeader);
        }
      }
    }
    if (!data) break;
    total = data.total;
    if (!data.records.length) break;

    for (const r of data.records) all.push(normalize(r));

    const pct = total ? ((all.length / total) * 100).toFixed(1) : "?";
    process.stdout.write(`\r  Página ${page + 1} · ${all.length}/${total ?? "?"} (${pct}%) · ${((Date.now() - t0) / 1000).toFixed(1)}s   `);

    page++;
    if (total && all.length >= total) break;
    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
  }
  process.stdout.write("\n");

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`✓ Recolhidos ${all.length} de ${total ?? "?"} federados em ${elapsed}s (${page} páginas)`);

  // ── Estatísticas resumo ─────────────────────────────────────────
  const byAge = {}, byCountry = {}, byGender = { M: 0, F: 0 };
  let withBirthdate = 0, withPhoto = 0;
  for (const p of all) {
    byAge[p.age_level] = (byAge[p.age_level] || 0) + 1;
    byCountry[p.country_prefix] = (byCountry[p.country_prefix] || 0) + 1;
    if (p.gender) byGender[p.gender] = (byGender[p.gender] || 0) + 1;
    if (p.birthdate) withBirthdate++;
    if (p.photo) withPhoto++;
  }
  console.log(`  Com fotografia:    ${withPhoto} / ${all.length} (${(withPhoto / all.length * 100).toFixed(1)}%)`);
  console.log(`  Com data nasc.:    ${withBirthdate} / ${all.length}`);
  console.log(`  Por género:        M=${byGender.M}, F=${byGender.F}`);

  // ── Output ──────────────────────────────────────────────────────
  const out = {
    generated: new Date().toISOString(),
    source: "scoring.datagolf.pt/pt/FederatedsList_V2.aspx",
    totalReported: total,
    totalScraped: all.length,
    players: all,
  };

  // Carregar versão prévia para comparar
  let prev = null;
  if (fs.existsSync(outPath)) {
    try {
      prev = JSON.parse(fs.readFileSync(outPath, "utf8"));
    } catch (e) {
      console.warn(`  Aviso: não consegui ler ${outPath} — assumir primeiro run.`);
    }
  }

  const changes = summarizeChanges(prev, out);
  console.log();
  console.log(`Diff vs ${path.basename(outPath)}:`);
  console.log(`  Jogadores novos:   ${changes.newPlayers}`);
  console.log(`  Jogadores fora:    ${changes.removed ?? 0}`);
  console.log(`  Fotos alteradas:   ${changes.photoChanges}`);
  console.log(`  HCP alterado:      ${changes.hcpChanges}`);
  console.log(`  Clube alterado:    ${changes.clubChanges}`);

  const isUnchanged = prev && jsonEqualIgnoringTimestamps(prev, out);
  if (isUnchanged) {
    console.log(`✓ Sem alterações reais — skip gravação.`);
    process.exit(2);
  }

  // ── Sanity guards para impedir overwrite com dados parciais/vazios ──
  // Aprendido em 2026-05-05 quando um bug do --max-pages NaN gravou 0
  // registos por cima de 15600 bons. Estas guardas só podem ser
  // ultrapassadas com --force.

  // Guard 1: nunca gravar 0 registos.
  if (all.length === 0) {
    // ⚠ Esta mensagem já disse "provável falha de cookies" para tudo, e custou
    // caro: a 29/08 os cookies estavam válidos (cookie-health verde nos 3
    // conjuntos) e a causa era sessão fria — HTTP 500. A pista tem de separar
    // os dois casos, senão manda quem lê refrescar cookies que estão bons.
    console.error(`✗ Recolhidos 0 registos — recusar gravar.`);
    console.error(`  HTTP 500 mesmo depois do warm-up → o endpoint recusou a sessão;`);
    console.error(`  Result=ERROR / Param_Errors / Erro 999 → aí sim, cookies expirados.`);
    console.error(`  Validar primeiro com: node scripts/test-datagolf-node.js`);
    process.exit(1);
  }

  // Guard 2: se o scrape parou antes de chegar ao total reportado E o
  // user não passou --max-pages explicitamente, é run incompleto — recusar.
  const isCappedRun = total && all.length < total;
  if (isCappedRun && !maxPagesRaw && !force) {
    console.error(`✗ Run incompleto: ${all.length} de ${total} (parou aos ${page} pages sem --max-pages).`);
    console.error(`  Refazer ou usar --force se intencional.`);
    process.exit(1);
  }

  // Guard 3: se o resultado é DRASTICAMENTE menor que o anterior (>10% de
  // perda), recusar — provavelmente run parcial / max-pages baixo.
  if (prev && prev.players && prev.players.length > 0) {
    const ratio = all.length / prev.players.length;
    if (ratio < 0.9 && !force) {
      console.error(`✗ Recolhidos ${all.length} mas anterior tinha ${prev.players.length} — perda de ${((1 - ratio) * 100).toFixed(1)}%.`);
      console.error(`  Recusar gravar sem --force (provável run parcial via --max-pages).`);
      console.error(`  Se intencional, correr com --force.`);
      process.exit(1);
    }
  }

  // Guard 4: se foi um run com --max-pages explícito, avisar mas permitir
  // (com --force ou sem) — user sabe que está a fazer scrape parcial.
  if (maxPagesRaw && all.length < (total ?? Infinity)) {
    console.warn(`⚠ Run com --max-pages=${maxPagesRaw} (${all.length}/${total} federados).`);
    if (!force) {
      console.error(`✗ Recusar gravar federados.json parcial — usar --force se intencional, ou --out para outro ficheiro.`);
      process.exit(1);
    }
    console.warn(`  --force activo: vai gravar ficheiro PARCIAL. CUIDADO — vai destruir dados.`);
  }

  if (checkOnly) {
    console.log(`(check-only) Alterações detectadas mas não foi gravado.`);
    process.exit(0);
  }

  console.log(`→ A gravar ${outPath}...`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(0);
  console.log(`✓ Gravado: ${outPath} (${sizeKb} KB)`);
  process.exit(0);
}

main().catch(err => {
  console.error(`✗ Erro fatal: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
