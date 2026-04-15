#!/usr/bin/env node
/**
 * fpg-scrape-node.js — Scraper Node puro para my.fpg.pt (breakthrough 2026-04-14)
 *
 * Descarrega WHS + scorecards de um ou mais federados usando os cookies
 * capturados do Chrome 90/Firefox. Zero Playwright, zero login — só fetch.
 *
 * Fonte dos cookies (por ordem):
 *   1. env FPG_COOKIES ou DATAGOLF_COOKIES (produção/Actions)
 *   2. api/.datagolf-cookies.json (dev local)
 *
 * Uso:
 *   node scripts/fpg-scrape-node.js 52884                    # um jogador
 *   node scripts/fpg-scrape-node.js 52884 47078 59252        # vários
 *   node scripts/fpg-scrape-node.js --all                    # todos de players.json
 *   node scripts/fpg-scrape-node.js --new-only 52884         # só scorecards novos
 *   node scripts/fpg-scrape-node.js --concurrency 4 --all    # 4 jogadores em paralelo
 *
 * Output por jogador (em output/{fed}/):
 *   whs.json          — lista de rondas (formato my.fpg.pt)
 *   scorecards.json   — hole-by-hole de cada ronda
 *   summary.json      — totais + timestamp
 *
 * Exit codes:
 *   0 — sucesso com novidades (há scorecards novos desde última corrida)
 *   2 — sucesso sem novidades (não é erro)
 *   1 — erro real
 */

"use strict";
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(REPO_ROOT, "output");
const PLAYERS_JSON = path.join(REPO_ROOT, "players.json");
const BASE_URL = "https://my.fpg.pt/Home";

// ─── Args ──────────────────────────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = f => argv.includes(f);
const getArg = (f, def) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : def; };
const ALL = hasFlag("--all");
const NEW_ONLY = hasFlag("--new-only");
const CONCURRENCY = Number(getArg("--concurrency", 2));

// Flags que consomem valor — para não apanhar esses valores como feds
const VALUE_FLAGS = new Set(["--concurrency", "--output-dir"]);
const explicitFeds = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (VALUE_FLAGS.has(a)) { i++; continue; }  // saltar valor do flag
  if (a.startsWith("--")) continue;            // saltar outros flags
  if (/^\d+$/.test(a)) explicitFeds.push(a);
}

// ─── Cores ─────────────────────────────────────────────────
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m", X = "\x1b[0m";
const log = m => console.log(`${C}[fpg-scrape]${X} ${m}`);
const ok  = m => console.log(`${G}[fpg-scrape] ✓${X} ${m}`);
const warn = m => console.log(`${Y}[fpg-scrape] ⚠${X} ${m}`);

// ─── Cookies ──────────────────────────────────────────────
function loadCookies() {
  const env = process.env.FPG_COOKIES || process.env.DATAGOLF_COOKIES;
  if (env) { log("cookies de env"); return env; }
  const fp = path.join(REPO_ROOT, "api", ".datagolf-cookies.json");
  if (fs.existsSync(fp)) {
    const j = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (j.cookieHeader) { log(`cookies de ${path.relative(REPO_ROOT, fp)}`); return j.cookieHeader; }
  }
  console.error(`${R}ERRO: sem cookies — define FPG_COOKIES ou cria api/.datagolf-cookies.json${X}`);
  process.exit(1);
}
const COOKIE = loadCookies();

// ─── FPG fetch helpers ────────────────────────────────────
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0";
async function fpgPost(pathname, bodyObj, queryString = "") {
  const url = `${BASE_URL}/${pathname}${queryString ? "?" + queryString : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Origin": "https://my.fpg.pt",
      "Referer": "https://my.fpg.pt/Home/PlayerWHS.aspx?no=52884",
      "User-Agent": UA,
      "Cookie": COOKIE,
    },
    body: JSON.stringify(bodyObj),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${pathname}`);
  const json = await res.json();
  const d = json.d || json;
  if (d.Result === "ERROR") throw new Error(`FPG: ${d.Message || "unknown"}`);
  return d;
}

async function fetchWhsAll(fed) {
  const PAGE = 100;
  const all = [];
  let start = 0, total = Infinity;
  while (all.length < total && start < (total === Infinity ? 1 : total)) {
    const qs = `fed_code=${fed}&pp=N&jtStartIndex=${start}&jtPageSize=${PAGE}`;
    const body = { fed_code: String(fed), pp: "N", jtStartIndex: String(start), jtPageSize: String(PAGE) };
    const d = await fpgPost("PlayerWHS.aspx/HCPWhsFederLST", body, qs);
    const recs = d.Records || [];
    if (total === Infinity) total = Number(d.TotalRecordCount || recs.length);
    all.push(...recs);
    if (recs.length < PAGE) break;
    start += PAGE;
  }
  return all;
}

async function fetchScorecard(scoreId) {
  try {
    // my.fpg.pt exige pp=N tanto na URL como no body (como o WHS list)
    const qs = `score_id=${scoreId}&pp=N`;
    const body = { score_id: String(scoreId), pp: "N", scoringtype: "1", competitiontype: "10" };
    const d = await fpgPost("PlayerWHS.aspx/ScoreCard", body, qs);
    return (d.Records && d.Records[0]) || null;
  } catch (e) {
    // Já não é silencioso — os erros aparecem no stderr para debug
    console.error(`  ⚠ scorecard ${scoreId} falhou: ${e.message}`);
    return null;
  }
}

// ─── IO helpers ───────────────────────────────────────────
function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function writeJson(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }
function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

// ─── Core per-player ──────────────────────────────────────
async function processPlayer(fed) {
  const dir = path.join(OUTPUT_DIR, String(fed));
  ensureDir(dir);
  const whsFile = path.join(dir, "whs.json");
  const scFile  = path.join(dir, "scorecards.json");
  const sumFile = path.join(dir, "summary.json");

  // 1) Lista de rondas
  const rounds = await fetchWhsAll(fed);
  const existingRounds = readJsonIfExists(whsFile) || [];
  const existingIds = new Set(existingRounds.map(r => r.id || r.score_id));
  const newRounds = rounds.filter(r => !existingIds.has(r.id || r.score_id));

  // 2) Scorecards (dos novos se NEW_ONLY, senão de todos os em falta)
  const existingSC = readJsonIfExists(scFile) || {};
  const toFetch = NEW_ONLY
    ? newRounds.map(r => r.id || r.score_id)
    : rounds.filter(r => !existingSC[String(r.id || r.score_id)]).map(r => r.id || r.score_id);

  const scorecards = { ...existingSC };
  let newScorecards = 0;
  for (const scoreId of toFetch) {
    if (!scoreId) continue;
    const sc = await fetchScorecard(scoreId);
    if (sc) { scorecards[String(scoreId)] = sc; newScorecards++; }
    await new Promise(r => setTimeout(r, 80)); // throttle
  }

  // 3) Escrever
  writeJson(whsFile, rounds);
  writeJson(scFile, scorecards);
  writeJson(sumFile, {
    fed, lastRun: new Date().toISOString(),
    totalRounds: rounds.length,
    totalScorecards: Object.keys(scorecards).length,
    newRoundsThisRun: newRounds.length,
    newScorecardsThisRun: newScorecards,
  });

  return { fed, rounds: rounds.length, newRounds: newRounds.length, newScorecards };
}

// ─── Main ─────────────────────────────────────────────────
async function main() {
  let feds = explicitFeds;
  if (ALL) {
    if (!fs.existsSync(PLAYERS_JSON)) { console.error(`${R}players.json não encontrado${X}`); process.exit(1); }
    const players = JSON.parse(fs.readFileSync(PLAYERS_JSON, "utf8"));
    feds = Object.keys(players);
  }
  if (feds.length === 0) { console.error("Uso: node scripts/fpg-scrape-node.js <fed>... | --all"); process.exit(1); }

  log(`${feds.length} jogador(es) a processar — concurrency=${CONCURRENCY}, new-only=${NEW_ONLY}`);

  let totals = { rounds: 0, newRounds: 0, newScorecards: 0, ok: 0, failed: 0 };

  // Processar em batches paralelos
  for (let i = 0; i < feds.length; i += CONCURRENCY) {
    const batch = feds.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(processPlayer));
    results.forEach((r, idx) => {
      const fed = batch[idx];
      if (r.status === "fulfilled") {
        const v = r.value;
        totals.ok++;
        totals.rounds += v.rounds;
        totals.newRounds += v.newRounds;
        totals.newScorecards += v.newScorecards;
        const marker = v.newScorecards > 0 ? `${G}NOVO${X}` : "   ";
        console.log(`  ${marker} ${fed}: ${v.rounds} rondas (${v.newRounds} novas, ${v.newScorecards} scorecards novos)`);
      } else {
        totals.failed++;
        warn(`${fed}: ${r.reason?.message || r.reason}`);
      }
    });
  }

  console.log("");
  log(`═══ RESUMO ═══`);
  console.log(`  Jogadores processados: ${G}${totals.ok}${X} (${totals.failed} falhas)`);
  console.log(`  Rondas totais: ${totals.rounds}`);
  console.log(`  Rondas novas nesta corrida: ${G}${totals.newRounds}${X}`);
  console.log(`  Scorecards novos nesta corrida: ${G}${totals.newScorecards}${X}`);

  if (totals.newScorecards > 0) {
    ok(`Há ${totals.newScorecards} scorecards novos — seguro committar`);
    process.exit(0);
  }
  console.log(`${Y}Nada de novo — sem commit${X}`);
  process.exit(2);
}

main().catch(e => {
  console.error(`${R}ERRO FATAL:${X}`, e.stack || e.message);
  process.exit(1);
});
