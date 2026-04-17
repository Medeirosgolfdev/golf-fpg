#!/usr/bin/env node
/**
 * scripts/scrape-fpg-admissions-draws.js
 *
 * Descarrega inscrições + draws (pairings) de torneios FPG a partir das páginas
 * do scoring.fpg.pt e scoring-pt.datagolf.pt. Node puro — sem Playwright.
 *
 * USA O MESMO PADRÃO DE AUTENTICAÇÃO QUE /api/inscricoes.js (Vercel function):
 *   - Cookies capturados em Chrome 90 em api/.fpg-admissions-cookies.json
 *   - Fallback: session-borrow de golf-portugal.pt (ASP.NET_SessionId rotativo)
 *   - Fallback: tentar sem cookie (sessão implícita, ocasionalmente funciona)
 *
 * URLs canónicas (públicas mas gated por session cookies):
 *   Admissions: https://scoring.fpg.pt/lists/tournAdmissions.aspx?ccode={ccode}&tcode={tcode}
 *   Draw:       https://scoring-pt.datagolf.pt/scripts/draw.asp?club={ccode}&tourn={tcode}&round_number={n}&LANG_TXT=PT&ack=XH256YF45T
 *
 * Cookies necessários: ASP.NET_SessionId + DG_Lists_URL (ver docs/api-fpg-endpoints.md)
 *
 * Output: um JSON por torneio em public/data/fpg-admissions-draws/{ccode}-{tcode}.json
 *
 * Uso:
 *   node scripts/scrape-fpg-admissions-draws.js                # usa scope "all" (default)
 *   node scripts/scrape-fpg-admissions-draws.js --scope drive2026
 *   node scripts/scrape-fpg-admissions-draws.js --scope jovens
 *   node scripts/scrape-fpg-admissions-draws.js --scope nacional2026
 *   node scripts/scrape-fpg-admissions-draws.js --tcode 10941 --ccode 000
 *   node scripts/scrape-fpg-admissions-draws.js --force        # re-scrape tudo
 *   node scripts/scrape-fpg-admissions-draws.js --debug        # dump de HTML errors em tmp/
 *
 * Exit codes: 0=sucesso c/ mudanças, 2=nada novo, 1=erro.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { parseAdmissions, parseDraw } = require("./fpg-admissions-draw-parser.js");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "data", "fpg-admissions-draws");
const DATA_DIR = path.join(ROOT, "public", "data");
const API_DIR = path.join(ROOT, "api");

/* URLs canónicos */
const ADM_BASE  = "https://scoring.fpg.pt/lists/tournAdmissions.aspx";
const DRAW_BASE = "https://scoring-pt.datagolf.pt/scripts/draw.asp";
const DRAW_ACK  = "XH256YF45T";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36";
const REFERER = "https://competicoes.fpg.pt/evento/campeonato-nacional-de-jovens-sub10-12-14-16-18-pga-aroeira/";

const BASE_HEADERS = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-PT,pt;q=0.9",
  "Upgrade-Insecure-Requests": "1",
  "Referer": REFERER,
};

/* ═══════════════════════════════════════════════════════
   COOKIES (mesmo padrão de api/inscricoes.js)
   ═══════════════════════════════════════════════════════ */

/** Carrega cookies de api/.fpg-admissions-cookies.json (ou env var FPG_ADMISSIONS_COOKIES). */
function loadAdmissionsCookies() {
  if (process.env.FPG_ADMISSIONS_COOKIES) {
    return { cookie: process.env.FPG_ADMISSIONS_COOKIES, source: "env FPG_ADMISSIONS_COOKIES" };
  }
  try {
    const fp = path.join(API_DIR, ".fpg-admissions-cookies.json");
    if (fs.existsSync(fp)) {
      const j = JSON.parse(fs.readFileSync(fp, "utf8"));
      if (j.cookieHeader) return { cookie: j.cookieHeader, source: "api/.fpg-admissions-cookies.json" };
    }
  } catch (e) { /* ignore */ }
  return null;
}

/** Carrega cookies de api/.scoring-datagolf-cookies.json (para draws em scoring-pt.datagolf.pt). */
function loadScoringDatagolfCookies() {
  if (process.env.DATAGOLF_SCORING_COOKIES) {
    return { cookie: process.env.DATAGOLF_SCORING_COOKIES, source: "env DATAGOLF_SCORING_COOKIES" };
  }
  try {
    const fp = path.join(API_DIR, ".scoring-datagolf-cookies.json");
    if (fs.existsSync(fp)) {
      const j = JSON.parse(fs.readFileSync(fp, "utf8"));
      if (j.cookieHeader) return { cookie: j.cookieHeader, source: "api/.scoring-datagolf-cookies.json" };
    }
  } catch (e) { /* ignore */ }
  return null;
}

/** Tenta "pedir emprestada" uma sessão do golf-portugal.pt (fallback). */
async function borrowSessionFromGP() {
  try {
    const r = await fetch("https://golf-portugal.pt/api/clubs/144/players/52884/results?startIndex=0&limit=1", {
      headers: { "Accept": "application/json", "User-Agent": UA, "Referer": "https://golf-portugal.pt/" },
    });
    if (r.ok) {
      const xs = r.headers.get("x-cookie-session-id");
      if (xs && xs.startsWith("ASP.NET_SessionId=")) return xs;
    }
  } catch (e) { /* ignore */ }
  return null;
}

/* ═══════════════════════════════════════════════════════
   FETCH com múltiplas estratégias
   ═══════════════════════════════════════════════════════ */

/** Detecta se o HTML devolvido é uma página de erro de parâmetros. */
function isErrorPage(html) {
  if (!html) return true;
  if (/Param_Errors|Err=999/.test(html)) return true;
  // Página de erro ASP.NET genérica
  if (/Runtime Error/.test(html) && html.length < 5000) return true;
  return false;
}

/** Dump HTML a tmp/ para debug. */
function dumpDebugHTML(url, status, body) {
  const debugDir = path.join(ROOT, "tmp", "fpg-scrape-debug");
  if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
  const fname = `${Date.now()}-${status}-${encodeURIComponent(url).slice(0, 80)}.html`;
  fs.writeFileSync(path.join(debugDir, fname), body || "");
  return fname;
}

/**
 * Fetch HTML com múltiplas estratégias de cookie (em ordem):
 *   1. Cookies manuais de api/.fpg-admissions-cookies.json (primário para scoring.fpg.pt)
 *   2. Cookies manuais de api/.scoring-datagolf-cookies.json (primário para scoring-pt.datagolf.pt)
 *   3. Session borrow do golf-portugal.pt
 *   4. Sem cookie (sessão implícita, raramente funciona mas tenta)
 */
async function fetchHTMLWithFallback(url, opts = {}) {
  const host = new URL(url).host;
  const isFPGHost = host === "scoring.fpg.pt";
  const isDGHost = host === "scoring-pt.datagolf.pt" || host === "scoring.datagolf.pt";

  // Build strategies list (em ordem de preferência)
  const strategies = [];
  if (isFPGHost) {
    const c1 = loadAdmissionsCookies();
    if (c1) strategies.push({ name: "fpg-admissions-cookies", cookie: c1.cookie });
  }
  if (isDGHost) {
    const c2 = loadScoringDatagolfCookies();
    if (c2) strategies.push({ name: "scoring-datagolf-cookies", cookie: c2.cookie });
    // Fallback cruzado: admissions cookies podem também servir para draws
    const c1 = loadAdmissionsCookies();
    if (c1) strategies.push({ name: "fpg-admissions-cookies (cross)", cookie: c1.cookie });
  }
  strategies.push({ name: "no-cookie", cookie: null });

  let lastStatus = 0;
  let lastBody = "";
  for (const s of strategies) {
    try {
      const headers = { ...BASE_HEADERS };
      if (s.cookie) headers.Cookie = s.cookie;
      const res = await fetch(url, { headers, redirect: "follow" });
      const body = await res.text();
      lastStatus = res.status;
      lastBody = body;
      // Em debug mode, guardar SEMPRE a resposta
      if (opts.debug) {
        const fname = dumpDebugHTML(`${s.name}-${url}`, res.status, body);
        console.log(`      via ${s.name}: HTTP ${res.status} (${body.length} chars) → tmp/fpg-scrape-debug/${fname}`);
      }
      if (res.ok && !isErrorPage(body)) {
        if (opts.debug) console.log(`        ✓ aceite`);
        return { ok: true, html: body, status: res.status, via: s.name };
      }
      if (opts.debug && res.ok && isErrorPage(body)) {
        console.log(`        ✗ rejeitado por isErrorPage (200 mas content match Param_Errors|Err=999|Runtime Error)`);
      }
    } catch (e) {
      if (opts.debug) console.log(`      via ${s.name}: erro ${e.message}`);
    }
  }

  return { ok: false, html: lastBody, status: lastStatus, via: "all-failed" };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ═══════════════════════════════════════════════════════
   ARGS
   ═══════════════════════════════════════════════════════ */
function parseArgs(argv) {
  const a = { scope: null, tcode: null, ccode: null, file: null, force: false, delay: 500, maxRounds: 3, debug: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--scope") { a.scope = v; i++; }
    else if (k === "--tcode") { a.tcode = v; i++; }
    else if (k === "--ccode") { a.ccode = v; i++; }
    else if (k === "--file") { a.file = v; i++; }
    else if (k === "--force") { a.force = true; }
    else if (k === "--debug") { a.debug = true; }
    else if (k === "--delay") { a.delay = parseInt(v, 10) || 500; i++; }
    else if (k === "--max-rounds") { a.maxRounds = parseInt(v, 10) || 3; i++; }
    else if (k === "--help" || k === "-h") { printHelp(); process.exit(0); }
  }
  return a;
}

function printHelp() {
  console.log(`Scrape FPG admissions + draws (usa cookies de api/.fpg-admissions-cookies.json).

Uso:
  node scripts/scrape-fpg-admissions-draws.js [opções]

Scopes pré-definidos:
  --scope drive2026    Drive/Aquapor 2026 (~86)
  --scope jovens       Jovens em pull-torneios (~11)
  --scope nacional2026 Nacional Jovens Aroeira Maio 2026 (10 escalões)
  --scope all          Combinação (default)
  --tcode X --ccode Y  Um só torneio
  --file FILE          Lista JSON com {ccode, tcode, ...}

Opções:
  --force              Re-scrape mesmo se JSON já existir
  --debug              Log detalhado + dump de HTMLs errados em tmp/
  --delay MS           Delay entre requests (default 500)
  --max-rounds N       Max rondas a tentar (default 3)
  --help               Mostra ajuda
`);
}

/* ═══════════════════════════════════════════════════════
   SCOPE LOADERS
   ═══════════════════════════════════════════════════════ */
function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function uniqByKey(arr) {
  const m = new Map();
  for (const t of arr) {
    if (!t.ccode || !t.tcode) continue;
    const k = `${t.ccode}-${t.tcode}`;
    if (!m.has(k)) m.set(k, t);
  }
  return [...m.values()];
}

function loadDrive2026() {
  const files = fs.readdirSync(DATA_DIR).filter(f => /^(drive-data|aquapor-data)-2026-\d+\.json$/.test(f));
  const out = [];
  for (const f of files) {
    const j = readJsonSafe(path.join(DATA_DIR, f));
    if (j && Array.isArray(j.tournaments)) out.push(...j.tournaments);
  }
  return uniqByKey(out);
}

function loadJovens() {
  const files = fs.readdirSync(DATA_DIR).filter(f => /^pull-torneios\d+\.json$/.test(f));
  const out = [];
  for (const f of files) {
    const j = readJsonSafe(path.join(DATA_DIR, f));
    if (!j || !Array.isArray(j.tournaments)) continue;
    for (const t of j.tournaments) {
      const name = (t.name || "").toLowerCase();
      const esc = (t.escalao || "").toLowerCase();
      if (/sub[\s-]?\d+/i.test(esc) || /\bjovens\b/i.test(name) || /sub[\s-]?\d+/i.test(name)) {
        out.push(t);
      }
    }
  }
  return uniqByKey(out);
}

function loadNacional2026() {
  return [
    { ccode: "000", tcode: "10935", name: "Campeonato Nacional de Jovens Sub 18 M", date: "2026-05-01" },
    { ccode: "000", tcode: "10936", name: "Campeonato Nacional de Jovens Sub 18 F", date: "2026-05-01" },
    { ccode: "000", tcode: "10937", name: "Campeonato Nacional de Jovens Sub 16 M", date: "2026-05-01" },
    { ccode: "000", tcode: "10938", name: "Campeonato Nacional de Jovens Sub 16 F", date: "2026-05-01" },
    { ccode: "000", tcode: "10939", name: "Campeonato Nacional de Jovens Sub 14 M", date: "2026-05-01" },
    { ccode: "000", tcode: "10940", name: "Campeonato Nacional de Jovens Sub 14 F", date: "2026-05-01" },
    { ccode: "000", tcode: "10941", name: "Campeonato Nacional de Jovens Sub 12 M", date: "2026-05-01" },
    { ccode: "000", tcode: "10942", name: "Campeonato Nacional de Jovens Sub 12 F", date: "2026-05-01" },
    { ccode: "000", tcode: "10943", name: "Campeonato Nacional de Jovens Sub 10 M", date: "2026-05-01" },
    { ccode: "000", tcode: "10944", name: "Campeonato Nacional de Jovens Sub 10 F", date: "2026-05-01" },
  ];
}

function resolveScope(args) {
  if (args.tcode && args.ccode) return [{ ccode: args.ccode, tcode: args.tcode, name: "(custom)", date: null }];
  if (args.file) {
    const j = readJsonSafe(args.file);
    if (!j) throw new Error(`Não consegui ler ${args.file}`);
    return Array.isArray(j) ? j : (j.toScrape || j.tournaments || []);
  }
  const scope = args.scope || "all";
  if (scope === "drive2026") return loadDrive2026();
  if (scope === "jovens") return loadJovens();
  if (scope === "nacional2026") return loadNacional2026();
  if (scope === "all") return uniqByKey([...loadDrive2026(), ...loadJovens(), ...loadNacional2026()]);
  throw new Error(`Scope desconhecido: ${scope}`);
}

/* ═══════════════════════════════════════════════════════
   SCRAPE UM TORNEIO
   ═══════════════════════════════════════════════════════ */
async function scrapeTournament(t, opts) {
  const { ccode, tcode } = t;
  const out = {
    ccode, tcode,
    name: t.name || null,
    date: t.date || null,
    admissions: null,
    draws: {},
    scrapedAt: new Date().toISOString(),
  };

  // Admissions
  const admUrl = `${ADM_BASE}?ccode=${ccode}&tcode=${tcode}`;
  const admRes = await fetchHTMLWithFallback(admUrl, { debug: opts.debug });
  if (admRes.ok) {
    out.admissions = parseAdmissions(admRes.html);
    out.admissions._fetchVia = admRes.via;
    if (out.admissions.name && !out.name) out.name = out.admissions.name;
    if (out.admissions.date && !out.date) out.date = out.admissions.date;
  } else {
    out.admissions = { error: `HTTP ${admRes.status} via ${admRes.via}` };
  }

  // Draws
  for (let r = 1; r <= opts.maxRounds; r++) {
    const drawUrl = `${DRAW_BASE}?club=${ccode}&tourn=${tcode}&round_number=${r}&LANG_TXT=PT&ack=${DRAW_ACK}`;
    await sleep(opts.delay);
    const drawRes = await fetchHTMLWithFallback(drawUrl, { debug: opts.debug });
    if (drawRes.ok) {
      const draw = parseDraw(drawRes.html);
      draw._fetchVia = drawRes.via;
      if (draw.groups && draw.groups.length > 0) {
        out.draws[r] = draw;
      } else {
        if (r === 1) out.draws[1] = { groups: [], note: "sem draw disponível", _fetchVia: drawRes.via };
        break;
      }
    } else {
      out.draws[r] = { error: `HTTP ${drawRes.status} via ${drawRes.via}` };
      break;
    }
  }

  return out;
}

/* ═══════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════ */
async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const scope = resolveScope(args);
  console.log(`Scope: ${scope.length} torneios`);
  if (scope.length === 0) { console.log("Nada para scrapear."); process.exit(2); }

  // Info sobre cookies disponíveis
  const admC = loadAdmissionsCookies();
  const dgC = loadScoringDatagolfCookies();
  console.log(`Cookies: admissions=${admC ? "✓ " + admC.source : "✗ em falta"} | scoring-datagolf=${dgC ? "✓ " + dgC.source : "✗ em falta"}`);
  if (!admC) {
    console.log("⚠  Sem cookies de admissions — provavelmente vai falhar. Refrescar em api/.fpg-admissions-cookies.json via Chrome 90.");
  }

  let ok = 0, skipped = 0, errors = 0, changed = 0;

  for (let i = 0; i < scope.length; i++) {
    const t = scope[i];
    const outFile = path.join(OUT_DIR, `${t.ccode}-${t.tcode}.json`);
    const exists = fs.existsSync(outFile);
    if (exists && !args.force) {
      skipped++;
      if (i < 5 || i % 20 === 0) console.log(`  [${i+1}/${scope.length}] SKIP ${t.ccode}/${t.tcode} (usa --force)`);
      continue;
    }
    try {
      process.stdout.write(`  [${i+1}/${scope.length}] ${t.ccode}/${t.tcode} ${(t.name||"").slice(0,50)}... `);
      const result = await scrapeTournament(t, { delay: args.delay, maxRounds: args.maxRounds, debug: args.debug });
      let oldJson = null;
      try { oldJson = fs.readFileSync(outFile, "utf8"); } catch {}
      const newJson = JSON.stringify(result, null, 2);
      const stripTime = s => s ? s.replace(/"scrapedAt":\s*"[^"]+"/g, "\"scrapedAt\":\"\"") : s;
      const different = !oldJson || stripTime(oldJson) !== stripTime(newJson);
      fs.writeFileSync(outFile, newJson);
      const admN = result.admissions?.players?.length ?? 0;
      const drawsN = Object.values(result.draws || {}).filter(d => d.groups && d.groups.length > 0).length;
      const admErr = result.admissions?.error ? " [adm ERR]" : "";
      console.log(`OK (${admN} inscritos, ${drawsN} draws)${admErr}${different ? " [changed]" : ""}`);
      ok++;
      if (different) changed++;
    } catch (e) {
      console.log(`ERRO: ${e.message || e}`);
      errors++;
    }
    await sleep(args.delay);
  }

  console.log(`\nResumo: ${ok} ok, ${skipped} skipped, ${errors} erros, ${changed} com mudanças.`);
  process.exit(changed > 0 ? 0 : 2);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { scrapeTournament, resolveScope, loadAdmissionsCookies };
