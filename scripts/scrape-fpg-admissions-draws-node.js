#!/usr/bin/env node
/**
 * scripts/scrape-fpg-admissions-draws-node.js (2026-04-22)
 * ═════════════════════════════════════════════════════════════════════════
 * Substitui os browser-scripts:
 *   - browser-scrape-fpg-admissions-draws.js (F12 em scoring.datagolf.pt)
 *   - browser-scrape-fpg-draws-only.js       (F12 em scoring-pt.datagolf.pt)
 *   - scrape-fpg-admissions-draws.js         (legacy Node, não funcionava)
 *
 * Usa o gateway canónico linkpage.aspx (ack universal) em modo Node puro,
 * com cookies de scoring.fpg.pt capturadas pelo refresh-all-cookies.js.
 *
 * URLs (ambos redirigem para as páginas alvo com sessão aquecida):
 *   admissions: /lists/linkpage.aspx?page=admissions&club=X&tourn=Y&ack=XH256YF450
 *   draw:       /lists/linkpage.aspx?page=draw&club=X&tourn=Y&round=N&ack=8428ACK987
 *
 * SCOPE: scripts/fpg-admissions-scope.json (333 torneios)
 *
 * OUTPUT: public/data/fpg-admissions-draws.json
 *   Formato idêntico ao gerado por merge-fpg-admissions-draws.js — mantém
 *   compatibilidade total com a UI existente.
 *
 * MERGE LOGIC (aditivo, preserva bons):
 *   - Nunca descarta dados bons existentes
 *   - Rejeita admissions/draws "_suspect" (tcode reutilizado pela FPG:
 *     data da página difere da esperada por >30 dias)
 *   - Substitui vazio por bom; nunca bom por vazio
 *
 * COOKIES:
 *   FPG_ADMISSIONS_COOKIES (env) OU api/.fpg-admissions-cookies.json
 *
 * USAGE:
 *   node scripts/scrape-fpg-admissions-draws-node.js            # full scope
 *   node scripts/scrape-fpg-admissions-draws-node.js --tcodes 10941,10937,10935
 *   node scripts/scrape-fpg-admissions-draws-node.js --since 2026-01-01  # só torneios >= esta data
 *   node scripts/scrape-fpg-admissions-draws-node.js --year 2026
 *   node scripts/scrape-fpg-admissions-draws-node.js --concurrency 3     # default
 *
 * EXIT CODES (compatíveis com GitHub Actions):
 *   0 — há novidades / dados novos (faz commit)
 *   1 — erro fatal (workflow falha)
 *   2 — sem novidades (não commita, mas não é erro)
 * ═════════════════════════════════════════════════════════════════════════
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { parseAdmissions, parseDraw } = require("./fpg-admissions-draw-parser.js");

/* ── Paths ──────────────────────────────────────────────────────────────── */
const REPO = path.resolve(__dirname, "..");
const SCOPE_FILE  = path.join(__dirname, "fpg-admissions-scope.json");
const OUT_FILE    = path.join(REPO, "public", "data", "fpg-admissions-draws.json");
const BACKUP_FILE = path.join(REPO, "public", "data", "fpg-admissions-draws.backup.json");

/* ── CLI ────────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
function argVal(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : def;
}
const FILTER_TCODES = (argVal("--tcodes", "") || "").split(",").map(s => s.trim()).filter(Boolean);
let   FILTER_SINCE  = argVal("--since", null);
// Aceitar sintaxe "Nd" (N dias atrás) além de YYYY-MM-DD. Exemplo: --since 4d
if (FILTER_SINCE && /^\d+d$/i.test(FILTER_SINCE)) {
  const days = parseInt(FILTER_SINCE, 10);
  const isoDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  console.log(`[adm-draws] --since ${FILTER_SINCE} → ${isoDate}`);
  FILTER_SINCE = isoDate;
}
const FILTER_YEAR   = argVal("--year", null);
const CONCURRENCY   = parseInt(argVal("--concurrency", "3"), 10);
const MAX_ROUNDS    = parseInt(argVal("--max-rounds", "3"), 10);
const DELAY_MS      = parseInt(argVal("--delay", "150"), 10);
const AUTO_EXTEND   = args.includes("--auto-extend");

const ACK_ADMISSIONS = "XH256YF450";
const ACK_DRAW       = "8428ACK987";
const ACK_TOURNLIST  = "XH256YF45T";  // entry-gate scoring-pt.datagolf.pt

/* ── Cookies ────────────────────────────────────────────────────────────── */
function loadCookies() {
  if (process.env.FPG_ADMISSIONS_COOKIES) {
    console.log("[adm-draws] cookies de env FPG_ADMISSIONS_COOKIES");
    return process.env.FPG_ADMISSIONS_COOKIES;
  }
  const fp = path.join(REPO, "api", ".fpg-admissions-cookies.json");
  if (fs.existsSync(fp)) {
    try {
      const j = JSON.parse(fs.readFileSync(fp, "utf8"));
      if (j.cookieHeader) {
        console.log("[adm-draws] cookies de api/.fpg-admissions-cookies.json");
        return j.cookieHeader;
      }
    } catch (e) { /* ignora */ }
  }
  console.error("[adm-draws] ERRO: sem cookies. Define FPG_ADMISSIONS_COOKIES ou cria api/.fpg-admissions-cookies.json via refresh-all-cookies.js");
  process.exit(1);
}
const COOKIE = loadCookies();

/* ── Scope (construído em main para suportar --auto-extend async) ───────── */
if (!fs.existsSync(SCOPE_FILE)) {
  console.error(`[adm-draws] ERRO: scope em falta: ${SCOPE_FILE}`);
  process.exit(1);
}
const manualScope = JSON.parse(fs.readFileSync(SCOPE_FILE, "utf8"));
console.log(`[adm-draws] Scope manual: ${manualScope.length} torneios`);

/* ── HTTP ───────────────────────────────────────────────────────────────── */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BASE_HEADERS = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Cookie": COOKIE,
  "Upgrade-Insecure-Requests": "1",
  "Referer": "https://scoring.fpg.pt/",
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchLinkpage(ccode, tcode, page, round) {
  const ack = page === "admissions" ? ACK_ADMISSIONS : ACK_DRAW;
  let url = `https://scoring.fpg.pt/lists/linkpage.aspx?page=${page}&club=${ccode}&tourn=${tcode}&ack=${ack}`;
  if (round) url += `&round=${round}`;
  try {
    const res = await fetch(url, { headers: BASE_HEADERS, redirect: "follow" });
    const txt = await res.text();
    const paramErr = /Param_Errors|Err=999|<title>Param Error/.test(txt);
    return { ok: res.ok, status: res.status, html: txt, paramErr, url };
  } catch (e) {
    return { ok: false, error: e.message, url };
  }
}

/* ── Suspect detection ──────────────────────────────────────────────────── */
function daysBetween(a, b) {
  if (!a || !b) return null;
  const pa = Date.parse(a), pb = Date.parse(b);
  if (isNaN(pa) || isNaN(pb)) return null;
  return Math.round(Math.abs(pa - pb) / 86400000);
}
function markSuspect(parsed, expectedDate) {
  if (!parsed || parsed.error) return parsed;
  if (!parsed.date || !expectedDate) return parsed;
  const d = daysBetween(parsed.date, expectedDate);
  if (d != null && d > 30) {
    parsed._suspect = true;
    parsed._suspectDays = d;
  }
  return parsed;
}

/* ── Scrape uma admissions ──────────────────────────────────────────────── */
async function scrapeAdmissions(t) {
  const r = await fetchLinkpage(t.ccode, t.tcode, "admissions", null);
  if (!r.ok || r.paramErr) {
    return { error: r.paramErr ? "param-errors" : `http-${r.status || "err"}`, players: [] };
  }
  const parsed = parseAdmissions(r.html);
  return markSuspect(parsed, t.date);
}

/* ── Scrape draw r1/r2/r3 ───────────────────────────────────────────────── */
async function scrapeDraws(t, maxRounds) {
  const out = {};
  for (let round = 1; round <= maxRounds; round++) {
    const r = await fetchLinkpage(t.ccode, t.tcode, "draw", round);
    if (!r.ok || r.paramErr) {
      // round sem dados = não existe publicado (normal para torneios de poucas rondas)
      continue;
    }
    const parsed = parseDraw(r.html);
    if (parsed.error || (parsed.groups && parsed.groups.length === 0)) continue;
    out[round] = markSuspect(parsed, t.date);
    await sleep(DELAY_MS);
  }
  return out;
}

/* ── Concurrency pool ───────────────────────────────────────────────────── */
async function runPool(items, workerFn, concurrency) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        const r = await workerFn(items[i], i);
        results[i] = r;
      } catch (e) {
        results[i] = { error: e.message };
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/* ── Merge aditivo (preserva dados bons existentes) ─────────────────────── */
function admScore(a, tournDate) {
  if (!a || a.error) return 0;
  if (a._suspect) return -1;
  return a.players?.length ?? 0;
}
function drawsScore(d, tournDate) {
  if (!d) return 0;
  let total = 0, suspect = false;
  for (const dr of Object.values(d)) {
    if (dr?._suspect) suspect = true;
    if (dr?.groups?.length > 0) total += dr.groups.length;
  }
  return suspect ? -1 : total;
}
function cleanSuspectAdm(a, tournDate) {
  if (!a || a.error) return a;
  if (a._suspect) {
    return { error: `dados suspect apagados: tcode reutilizado (${a._suspectDays}d de delta)`, players: [] };
  }
  return a;
}
function cleanSuspectDraws(draws, tournDate) {
  if (!draws) return {};
  const out = {};
  for (const [r, d] of Object.entries(draws)) {
    if (!d || d._suspect) continue;
    out[r] = d;
  }
  return out;
}

/* ═════════════════════════════════════════════════════════════════════════
   AUTO-EXTEND — expande scope manual com 2 fontes extra:
     Fonte 2 (passiva): JSONs locais gerados por outros workflows
                        (drive-data, jovens, pull-torneios, SdS)
     Fonte 3 (activa):  POST a TournamentsLST com warmup obrigatório ao
                        entry-gate, filtrado por INCLUDES/EXCLUDES
   Devolve array normalizado: [{ccode, tcode, date, name, expectedYear, _src}]
   ═════════════════════════════════════════════════════════════════════════ */

/* Filtros da Fonte 3 (TournamentsLST): */
const INCLUDE_RX = [
  /\bjunior\b/i,
  /\bPJA\b/i,
  /\bjovens?\b/i,
  /\bsub[-\s]?(10|12|14|16|18|25)\b/i,
];
const INCLUDE_CCODES = new Set(["007"]);  // Santo da Serra: qualquer torneio
const EXCLUDE_RX = [
  /\bflint?stones?\b/i,
  /quarta.?feira.*europeia/i,
];

function matchesIncludes(name, ccode) {
  if (INCLUDE_CCODES.has(String(ccode).padStart(3, "0"))) return true;
  return INCLUDE_RX.some(rx => rx.test(name || ""));
}
function matchesExcludes(name) {
  return EXCLUDE_RX.some(rx => rx.test(name || ""));
}

/* Parsear timestamp .NET "/Date(1772323200000)/" → YYYY-MM-DD */
function dotNetToIsoDate(s) {
  if (!s) return null;
  const m = String(s).match(/\d+/);
  if (!m) return null;
  const ms = parseInt(m[0], 10);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/* Fonte 2: scan de JSONs locais (torneios já descobertos por outros workflows).
   Aceita filtro `sinceDate` para evitar carregar histórico irrelevante. */
function scanLocalJsons(sinceDate = null) {
  const DATA_DIR = path.join(REPO, "public", "data");
  const patterns = [
    /^drive-data-\d{4}-\d{2}\.json$/,
    /^aquapor-data-\d{4}-\d{2}\.json$/,
    /^jovens_\d{4}\.json$/,
    /^pull-torneios.*\.json$/,
    /^santo-da-serra-tournaments\.json$/,
  ];
  const seen = new Map();
  let files = [];
  try { files = fs.readdirSync(DATA_DIR).filter(f => patterns.some(rx => rx.test(f))); }
  catch { return []; }

  let totalRead = 0, totalKept = 0;
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
      const arr = Array.isArray(j) ? j : (j.tournaments || j.torneios || []);
      for (const t of arr) {
        totalRead++;
        const ccode = String(t.ccode || t.club_code || "").padStart(3, "0");
        const tcode = String(t.tcode || t.code || "");
        const name  = t.name || t.description || t.nome || "";
        const date  = t.date || t.data || dotNetToIsoDate(t.started_at);
        if (!ccode || !tcode || !date) continue;
        // Filtro temporal interno — evita carregar histórico irrelevante
        if (sinceDate && date < sinceDate) continue;
        const key = `${ccode}/${tcode}`;
        // Preserva o mais recente se duplicado (datas podem divergir entre fontes)
        if (!seen.has(key) || (seen.get(key).date || "") < date) {
          seen.set(key, {
            ccode, tcode, name, date,
            expectedYear: date.slice(0, 4),
            _src: `json:${f}`,
          });
          totalKept++;
        }
      }
    } catch (e) {
      console.warn(`[adm-draws] scanLocalJsons: falhou a ler ${f}: ${e.message}`);
    }
  }
  if (sinceDate) {
    console.log(`[adm-draws] auto-extend Fonte 2: ${seen.size} torneios (filtro interno date >= ${sinceDate}; ${totalRead} examinados)`);
  }
  return [...seen.values()];
}

/* Fonte 3: POST a TournamentsLST com warmup obrigatório + filtros */
async function scanFpgTournamentsLst() {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  // Scoring.datagolf.pt é o domínio gémeo; usar cookies do .scoring-datagolf-cookies.json
  let dgCookie = "";
  try {
    if (process.env.DATAGOLF_SCORING_COOKIES) {
      dgCookie = process.env.DATAGOLF_SCORING_COOKIES;
    } else {
      const fp = path.join(REPO, "api", ".scoring-datagolf-cookies.json");
      if (fs.existsSync(fp)) {
        const j = JSON.parse(fs.readFileSync(fp, "utf8"));
        if (j.cookieHeader) dgCookie = j.cookieHeader;
      }
    }
  } catch { /* ignora */ }
  if (!dgCookie) {
    console.warn("[adm-draws] auto-extend Fonte 3 skipped — sem cookies scoring.datagolf.pt");
    return [];
  }

  // 1) WARMUP obrigatório via entry-gate (documentado CLAUDE.md):
  //    scoring-pt.datagolf.pt seta cookies nos dois subdomínios + valida sessão
  const warmupUrl = `https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=${ACK_TOURNLIST}`;
  try {
    const r = await fetch(warmupUrl, {
      headers: {
        "User-Agent": UA, "Cookie": dgCookie,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9",
      },
      redirect: "follow",
    });
    await r.text();
    console.log(`[adm-draws] auto-extend warmup entry-gate HTTP ${r.status}`);
  } catch (e) {
    console.warn(`[adm-draws] auto-extend warmup falhou: ${e.message} — abortar Fonte 3`);
    return [];
  }

  // Helper: chamada paginada a TournamentsLST. Devolve array de records.
  async function callTournamentsLst({ clubCode, dtIni }) {
    const all = [];
    let startIndex = 0;
    const pageSize = 200;
    while (true) {
      const qs = `jtStartIndex=${startIndex}&jtPageSize=${pageSize}&jtSorting=` + encodeURIComponent("started_at DESC");
      const body = {
        ClubCode: String(clubCode),
        dtIni: dtIni || "",
        dtFim: "",
        CourseName: "", TournCode: "", TournName: "",
        jtStartIndex: String(startIndex), jtPageSize: String(pageSize), jtSorting: "started_at DESC",
      };
      try {
        const r = await fetch(`https://scoring.datagolf.pt/pt/tournaments.aspx/TournamentsLST?${qs}`, {
          method: "POST",
          headers: {
            "User-Agent": UA,
            "Content-Type": "application/json; charset=utf-8",
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Origin": "https://scoring.datagolf.pt",
            "Referer": "https://scoring.datagolf.pt/pt/tournaments.aspx",
            "Cookie": dgCookie,
          },
          body: JSON.stringify(body),
        });
        if (!r.ok) return all;
        const j = await r.json();
        const d = j.d || j;
        if (d.Result !== "OK") return all;
        const page = d.Records || [];
        all.push(...page);
        if (page.length < pageSize) break;  // esgotou
        startIndex += pageSize;
        if (startIndex >= 2000) break;  // limite de segurança (10 páginas)
      } catch { return all; }
    }
    return all;
  }

  // 2) Query PRINCIPAL — todos os clubes, últimos N dias
  const defaultDaysBack = 30;
  const filterDaysBack = FILTER_SINCE
    ? Math.max(defaultDaysBack, Math.ceil((Date.now() - new Date(FILTER_SINCE).getTime()) / 86400000))
    : defaultDaysBack;
  const dtIni = new Date(Date.now() - filterDaysBack * 86400000).toISOString().slice(0, 10);
  let records = await callTournamentsLst({ clubCode: "0", dtIni });
  console.log(`[adm-draws] TournamentsLST (ClubCode=0, dtIni=${dtIni}): ${records.length} torneios`);

  // 2b) Queries DEDICADAS por ccode em INCLUDE_CCODES — apanha TODOS os
  //     torneios desses clubes, sem filtro temporal, com paginação. Importante
  //     para clubes com muitos torneios semanais (ex: CGSS Santo da Serra)
  //     que ficariam truncados pela query principal.
  for (const ccode of INCLUDE_CCODES) {
    const extra = await callTournamentsLst({ clubCode: ccode, dtIni: "" });
    console.log(`[adm-draws] TournamentsLST (ClubCode=${ccode}, sem filtro): ${extra.length} torneios`);
    records = records.concat(extra);
  }

  // 3) Deduplicar por ccode/tcode (queries principal + dedicadas podem sobrepor-se)
  const seenKey = new Set();
  const uniqueRecords = [];
  for (const rec of records) {
    const k = `${rec.club_code}/${rec.code}`;
    if (seenKey.has(k)) continue;
    seenKey.add(k);
    uniqueRecords.push(rec);
  }

  // 4) Filtrar por INCLUDE/EXCLUDE
  const out = [];
  let inc = 0, exc = 0;
  for (const rec of uniqueRecords) {
    const ccode = String(rec.club_code || "").padStart(3, "0");
    const tcode = String(rec.code || "");
    const name  = rec.description || "";
    const date  = dotNetToIsoDate(rec.started_at);
    if (!ccode || !tcode || !date) continue;
    if (matchesExcludes(name)) { exc++; continue; }
    if (!matchesIncludes(name, ccode)) continue;
    inc++;
    out.push({
      ccode, tcode, name, date,
      expectedYear: date.slice(0, 4),
      _src: "tournamentsLst",
    });
  }
  console.log(`[adm-draws] auto-extend Fonte 3: ${records.length} torneios do TournamentsLST (${uniqueRecords.length} únicos) → ${inc} incluídos (${exc} excluídos)`);
  return out;
}

async function buildAutoExtendedScope(manual, sinceDate = null) {
  const local = scanLocalJsons(sinceDate);
  const fpg = await scanFpgTournamentsLst();
  if (!sinceDate) {
    console.log(`[adm-draws] auto-extend Fonte 2 (JSONs locais): ${local.length} torneios`);
  }
  // Union deduplicada por ccode/tcode. Scope manual tem prioridade (preserva
  // campos extra como expectedYear que vieram do browser-script original).
  const byKey = new Map();
  for (const t of manual) {
    byKey.set(`${t.ccode}/${t.tcode}`, { ...t, _src: t._src || "manual" });
  }
  let addedLocal = 0, addedFpg = 0;
  for (const t of local) {
    const k = `${t.ccode}/${t.tcode}`;
    if (!byKey.has(k)) { byKey.set(k, t); addedLocal++; }
  }
  for (const t of fpg) {
    const k = `${t.ccode}/${t.tcode}`;
    if (!byKey.has(k)) { byKey.set(k, t); addedFpg++; }
  }
  console.log(`[adm-draws] auto-extend total: ${byKey.size} torneios (manual=${manual.length} + local=${addedLocal} novos + fpg=${addedFpg} novos)`);
  return [...byKey.values()];
}

/* ── Main ───────────────────────────────────────────────────────────────── */
(async () => {
  console.log(`[adm-draws] Concurrency=${CONCURRENCY} MaxRounds=${MAX_ROUNDS} Delay=${DELAY_MS}ms AutoExtend=${AUTO_EXTEND}`);

  // 1) Construir scope base (manual, opcionalmente expandido).
  //    Passa FILTER_SINCE para as fontes auto-descobertas limitarem o que
  //    trazem (evita carregar histórico irrelevante de drive-data).
  let scope = AUTO_EXTEND
    ? await buildAutoExtendedScope(manualScope, FILTER_SINCE)
    : manualScope.slice();

  // 2) Aplicar filtros CLI sobre o scope (ordem: tcodes → since → year)
  if (FILTER_TCODES.length > 0) {
    scope = scope.filter(t => FILTER_TCODES.includes(String(t.tcode)));
    console.log(`[adm-draws] Filtro --tcodes: ${scope.length} torneios`);
  }
  if (FILTER_SINCE) {
    scope = scope.filter(t => t.date >= FILTER_SINCE);
    console.log(`[adm-draws] Filtro --since ${FILTER_SINCE}: ${scope.length} torneios`);
  }
  if (FILTER_YEAR) {
    scope = scope.filter(t => String(t.expectedYear) === String(FILTER_YEAR));
    console.log(`[adm-draws] Filtro --year ${FILTER_YEAR}: ${scope.length} torneios`);
  }
  if (scope.length === 0) {
    console.error("[adm-draws] Scope vazio após filtros — nada para scrapar");
    process.exit(2);  // sem novidades
  }

  console.log(`[adm-draws] A começar scrape de ${scope.length} torneios...`);

  // Ler base actual (para merge)
  const base = fs.existsSync(OUT_FILE)
    ? (() => { try { return JSON.parse(fs.readFileSync(OUT_FILE, "utf8")); } catch { return { tournaments: [] }; } })()
    : { tournaments: [] };
  const baseIdx = new Map();
  for (const t of (base.tournaments || [])) baseIdx.set(`${t.ccode}-${t.tcode}`, t);
  console.log(`[adm-draws] Base actual: ${base.tournaments?.length ?? 0} torneios`);

  // Scrape tudo em paralelo
  const t0 = Date.now();
  const scraped = await runPool(scope, async (t, i) => {
    const [admissions, draws] = await Promise.all([
      scrapeAdmissions(t),
      scrapeDraws(t, MAX_ROUNDS),
    ]);
    const admCount = admissions.players?.length ?? 0;
    const drawCount = Object.values(draws).reduce((s, d) => s + (d.groups?.length ?? 0), 0);
    const suspect = admissions._suspect || Object.values(draws).some(d => d._suspect);
    const progress = `[${i + 1}/${scope.length}]`;
    const suspectFlag = suspect ? " ⚠ SUSPECT" : "";
    const errFlag = admissions.error ? ` (adm:${admissions.error})` : "";
    console.log(`${progress} ${t.ccode}/${t.tcode} · adm=${admCount} drawGroups=${drawCount}${suspectFlag}${errFlag}  — ${t.name?.slice(0, 50) || ""}`);
    return { tournament: t, admissions, draws };
  }, CONCURRENCY);

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[adm-draws] Scrape terminado em ${dt}s`);

  // Merge aditivo — por cada torneio do scope actualizar só se o novo é melhor que o base
  let improved = 0, unchanged = 0, kept = 0;
  for (const s of scraped) {
    const { tournament, admissions, draws } = s;
    const key = `${tournament.ccode}-${tournament.tcode}`;
    const prev = baseIdx.get(key) || { ...tournament, admissions: null, draws: {} };

    // ADMISSIONS: comparar scores; novo wins se >= anterior E não é suspect
    const newAdm = cleanSuspectAdm(admissions, tournament.date);
    const prevAdm = prev.admissions;
    const nAdm = admScore(newAdm, tournament.date);
    const pAdm = admScore(prevAdm, tournament.date);
    const finalAdm = (nAdm >= pAdm && nAdm > 0) ? newAdm
                   : (pAdm > 0 ? prevAdm : newAdm);  // mantém o actual se o novo é pior/vazio

    // DRAWS: merge ronda a ronda (cada ronda pode vir de scrape diferente)
    const newDraws = cleanSuspectDraws(draws, tournament.date);
    const prevDraws = prev.draws || {};
    const finalDraws = {};
    for (const r of ["1", "2", "3"]) {
      const nD = newDraws[r];
      const pD = prevDraws[r];
      const nScore = nD?.groups?.length ?? 0;
      const pScore = pD?.groups?.length ?? 0;
      if (nScore > 0) finalDraws[r] = nD;
      else if (pScore > 0) finalDraws[r] = pD;
    }

    // Medir se houve improvement
    const changedAdm = JSON.stringify(finalAdm) !== JSON.stringify(prevAdm);
    const changedDraws = JSON.stringify(finalDraws) !== JSON.stringify(prevDraws);
    if (changedAdm || changedDraws) improved++;
    else unchanged++;
    if (nAdm < pAdm || (nAdm === 0 && pAdm > 0)) kept++;  // preservámos dados antigos contra um novo vazio/suspect

    // Preferir o nome REAL da FPG (vindo da página de admissions/draws) sobre
    // o nome do scope manual. Alguns scopes têm nomes genéricos tipo
    // "Campeonato Nacional Jovens 10935" — a página FPG dá o escalão correcto
    // ("Sub 18 H", etc.). Também apanhar nome vindo dos draws se admissions
    // vazia. Fallback: scope manual ou entrada existente.
    const bestName = (finalAdm && finalAdm.name)
      || (Object.values(finalDraws || {})[0]?.name)
      || (prev && prev.name && prev.name !== `Campeonato Nacional Jovens ${tournament.tcode}` ? prev.name : null)
      || tournament.name;
    // Preferir data REAL do servidor (FPG) em vez da do scope. Scope tem datas
    // genéricas tipo "2026-05-01" para todos os Nacionais; a FPG dá data exacta.
    const bestDate = (finalAdm && finalAdm.date)
      || (Object.values(finalDraws || {})[0]?.date)
      || tournament.date;
    baseIdx.set(key, {
      ccode: tournament.ccode,
      tcode: tournament.tcode,
      name: bestName,
      date: bestDate,
      expectedYear: tournament.expectedYear,
      admissions: finalAdm,
      draws: finalDraws,
    });
  }

  // Preservar torneios da base que não estavam no scope actual (não se mexe neles)
  const tournaments = [...baseIdx.values()].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const output = {
    scrapedAt: new Date().toISOString(),
    total: tournaments.length,
    source: "scrape-fpg-admissions-draws-node.js (linkpage cross-domain)",
    tournaments,
  };

  console.log(`[adm-draws] Merge: ${improved} melhorados · ${unchanged} inalterados · ${kept} preservados contra novo vazio/suspect`);

  // Backup antes de escrever
  if (fs.existsSync(OUT_FILE)) {
    fs.copyFileSync(OUT_FILE, BACKUP_FILE);
  }

  // Só escreve se algo mudou
  if (improved === 0) {
    console.log(`[adm-draws] ✓ Sem novidades — ficheiro não actualizado (exit 2)`);
    process.exit(2);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  console.log(`[adm-draws] ✓ Gravado ${OUT_FILE}  (${tournaments.length} torneios, ${improved} melhorados)`);
  console.log(`[adm-draws] ✓ Backup em ${BACKUP_FILE}`);
  process.exit(0);
})().catch(e => {
  console.error("[adm-draws] ERRO fatal:", e);
  process.exit(1);
});
