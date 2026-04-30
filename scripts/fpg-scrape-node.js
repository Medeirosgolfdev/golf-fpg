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
 *   node scripts/fpg-scrape-node.js 52884                    # um jogador (só rondas novas)
 *   node scripts/fpg-scrape-node.js 52884 47078 59252        # vários
 *   node scripts/fpg-scrape-node.js --all                    # todos de players.json
 *   node scripts/fpg-scrape-node.js --full 52884             # re-fetch de tudo (lento)
 *   node scripts/fpg-scrape-node.js --concurrency 4 --all    # 4 jogadores em paralelo
 *
 * Por DEFAULT só descarrega scorecards de rondas novas (rápido).
 * Use --full / --full-rebuild para forçar re-download completo.
 *
 * Output por jogador (em output/{fed}/):
 *   whs.json          — lista de rondas (formato my.fpg.pt)
 *   scorecards.json   — hole-by-hole de cada ronda
 *   summary.json      — totais + timestamp
 *
 * No fim, se houve scorecards novos, dispara automaticamente:
 *   node pipeline.js --skip-import <feds_com_novidades>
 * que gera data.json, players.json, player-stats.json e away-courses.json
 * SÓ para os jogadores que mudaram. Para reprocessar todos, correr
 * manualmente `node pipeline.js --skip-import --all`.
 *
 * Exit codes:
 *   0 — sucesso com novidades (scrape OK + pipeline OK)
 *   2 — sucesso sem novidades (não é erro)
 *   1 — erro real (scrape ou pipeline)
 */

"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { writeJsonAtomic, writeJsonAtomicVerified } = require("../lib/atomic-write");

const REPO_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(REPO_ROOT, "output");
const PLAYERS_JSON = path.join(REPO_ROOT, "players.json");
const BASE_URL = "https://my.fpg.pt/Home";

// ─── Args ──────────────────────────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = f => argv.includes(f);
const getArg = (f, def) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : def; };
const ALL = hasFlag("--all");
// Por DEFAULT só descarregamos rondas novas (rápido, comportamento normal).
// --full-rebuild força re-fetch de TUDO (lento, ~12s por jogador, usar só se
// suspeitamos de scorecards corrompidos ou queremos re-snapshot completo).
const FULL_REBUILD = hasFlag("--full-rebuild") || hasFlag("--full");
const CONCURRENCY = Number(getArg("--concurrency", 3));

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
      // Réplica completa dos headers que o Firefox envia (cURL real do user)
      "User-Agent": UA,
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest",
      "Origin": "https://my.fpg.pt",
      "DNT": "1",
      "Referer": "https://my.fpg.pt/Home/PlayerWHS.aspx?no=52884",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
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

async function fetchScorecard(round) {
  // CRÍTICO: o endpoint ScoreCard quer o campo `score_id` (~4244840),
  // NÃO o campo `id` (~2875259, que é o ID interno da entry WHS).
  // Usar o errado retorna "An error occurred while processing this request"
  // silenciosamente. Descoberto 2026-04-15.
  const scoreId = round.score_id;
  if (!scoreId) {
    console.error(`  ⚠ round sem score_id (id=${round.id}) — saltar`);
    return null;
  }
  const scoringType = round.scoring_type_id ?? round.scoringtype ?? 1;
  const competitionType = round.competition_type_id ?? round.competitiontype ?? 10;
  try {
    // IMPORTANTE (descoberto 2026-04-15 via cURL do Firefox): my.fpg.pt exige
    // que scoringtype + competitiontype estejam TAMBÉM na URL (não chega no body).
    const qs = `score_id=${scoreId}&scoringtype=${scoringType}&competitiontype=${competitionType}&pp=N`;
    const body = {
      score_id: String(scoreId),
      scoringtype: String(scoringType),
      competitiontype: String(competitionType),
      pp: "N",
    };
    const d = await fpgPost("PlayerWHS.aspx/ScoreCard", body, qs);
    return (d.Records && d.Records[0]) || null;
  } catch (e) {
    console.error(`  ⚠ scorecard ${scoreId} (scoringType=${scoringType}, competitionType=${competitionType}) falhou: ${e.message}`);
    return null;
  }
}

// ─── IO helpers ───────────────────────────────────────────
function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function writeJson(file, obj) { writeJsonAtomic(file, obj); }
// Para ficheiros críticos cuja corrupção silenciosa já bateu (whs.json, scorecards.json):
// usa a versão que parseia depois de escrever e re-tenta uma vez se vier truncado.
// Causa histórica: em mounts Windows, renameSync(tmp, target) pode falhar
// silenciosamente se o target estiver com handle aberto (Vite hot-reload, app a ler) —
// o tmp é movido mas o conteúdo final fica como o do target antigo. Resultado:
// summary.json e scorecards.json actualizam, mas whs.json mantém a versão Apr 15
// truncada. A versão "verified" parseia e detecta isto.
function writeJsonVerified(file, obj) { writeJsonAtomicVerified(file, obj); }
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

  // 1) Lista de rondas — chave de identificação é o campo `id` do WHS entry
  //    (sempre único; pode haver múltiplas WHS entries para o mesmo score_id
  //    se houver correções/recálculos)
  const rounds = await fetchWhsAll(fed);
  const existingRounds = readJsonIfExists(whsFile) || [];
  const existingIds = new Set(existingRounds.map(r => r.id));
  const newRounds = rounds.filter(r => !existingIds.has(r.id));

  // 2) Scorecards — baixar QUALQUER scorecard em falta (não só de rondas novas).
  //    Indexamos por `score_id` (o ID do scorecard, NÃO o `id` da WHS entry).
  //
  //    Bug histórico (corrigido): antes a condição era "só rondas com id novo",
  //    o que falhava se o whs.json estivesse populado mas scorecards.json vazio
  //    (ex: corrida interrompida, primeira execução com erro). Resultado:
  //    scorecards nunca eram baixados em corridas seguintes porque nenhuma
  //    ronda era "nova". Agora baixamos qualquer scorecard em falta.
  //
  //    --full / --full-rebuild: força re-download de TODOS os scorecards
  //    (sobrescreve existingSC). Útil se suspeitares que estão corrompidos.
  const existingSC = readJsonIfExists(scFile) || {};
  const roundsToFetch = FULL_REBUILD
    ? rounds.filter(r => r.score_id)
    : rounds.filter(r => r.score_id && !existingSC[String(r.score_id)]);

  const scorecards = { ...existingSC };
  let newScorecards = 0;
  for (const round of roundsToFetch) {
    if (!round.score_id) continue;
    const sc = await fetchScorecard(round);
    if (sc) { scorecards[String(round.score_id)] = sc; newScorecards++; }
    await new Promise(r => setTimeout(r, 80)); // throttle
  }

  // 3) Escrever — whs.json e scorecards.json com verificação pós-escrita
  //    (detecta + re-tenta truncagem silenciosa em mounts Windows)
  writeJsonVerified(whsFile, rounds);
  writeJsonVerified(scFile, scorecards);

  // 4) Detectar se data.json (output do pipeline/render) está em falta.
  //    Se sim, marcar para reprocessar mesmo sem scorecards novos —
  //    senão jogadores recém-scrapeados (sem novidades subsequentes)
  //    nunca passariam pelo render e o site não os mostraria.
  const dataJsonPath = path.join(dir, "analysis", "data.json");
  const needsRender = !fs.existsSync(dataJsonPath);

  writeJson(sumFile, {
    fed, lastRun: new Date().toISOString(),
    totalRounds: rounds.length,
    totalScorecards: Object.keys(scorecards).length,
    newRoundsThisRun: newRounds.length,
    newScorecardsThisRun: newScorecards,
  });

  return { fed, rounds: rounds.length, newRounds: newRounds.length, newScorecards, needsRender };
}

// ─── Main ─────────────────────────────────────────────────
async function main() {
  let feds = explicitFeds;
  if (ALL) {
    if (!fs.existsSync(PLAYERS_JSON)) { console.error(`${R}players.json não encontrado${X}`); process.exit(1); }
    const players = JSON.parse(fs.readFileSync(PLAYERS_JSON, "utf8"));
    // Filtrar tags negativas — jogadores com "no-scrape" são saltados pelo automação
    // (ficam visíveis na UI mas não são re-descarregados — para reduzir custo de
    // chamadas FPG em jogadores que sabemos que estão inactivos ou não interessam)
    const skipTags = new Set(["no-scrape", "hidden"]);
    let total = 0, skipped = 0;
    for (const [fed, p] of Object.entries(players)) {
      total++;
      const tags = p.tags || [];
      if (tags.some(t => skipTags.has(t))) { skipped++; continue; }
      feds.push(fed);
    }
    log(`players.json: ${total} total, ${G}${feds.length}${X} a processar (${Y}${skipped} saltados${X} por tag no-scrape/hidden)`);
  }
  if (feds.length === 0) { console.error("Uso: node scripts/fpg-scrape-node.js <fed>... | --all"); process.exit(1); }

  log(`${feds.length} jogador(es) a processar — concurrency=${CONCURRENCY}, mode=${FULL_REBUILD ? "full-rebuild" : "missing-only"}`);

  let totals = { rounds: 0, newRounds: 0, newScorecards: 0, ok: 0, failed: 0, needsRender: 0 };
  const fedsToProcess = new Set(); // feds que precisam de render: scorecards novos OU data.json em falta

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
        if (v.newScorecards > 0 || v.needsRender) fedsToProcess.add(String(fed));
        if (v.needsRender) totals.needsRender++;
        const marker = v.newScorecards > 0 ? `${G}NOVO${X}` : v.needsRender ? `${Y}RNDR${X}` : "    ";
        const tag = v.needsRender && v.newScorecards === 0 ? " (sem data.json — render forçado)" : "";
        console.log(`  ${marker} ${fed}: ${v.rounds} rondas (${v.newRounds} novas, ${v.newScorecards} scorecards novos)${tag}`);
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
  if (totals.needsRender > 0) {
    console.log(`  Sem data.json (render forçado): ${Y}${totals.needsRender}${X}`);
  }

  if (fedsToProcess.size > 0) {
    const feds_arr = [...fedsToProcess];
    ok(`${feds_arr.length} jogador(es) a render: ${totals.newScorecards} scorecards novos + ${totals.needsRender} sem data.json`);

    // ─── Pipeline pós-scrape ───
    // Render data.json + sync players.json + enrich player-stats + extract away-courses
    // SÓ para os jogadores que precisam (não --all) — evita reprocessar 215 jogadores
    // de cada vez. extract-courses.js corre globalmente de qualquer maneira.
    //
    // ALTERNATIVA: se algum dia precisares de reprocessar TODOS (ex: mudou
    // formato de data.json, alteraste make-scorecards-ui.js, etc.):
    //   node pipeline.js --skip-import --all
    log(`A correr pipeline (render + sync + enrich + extract) para ${feds_arr.length} jogador(es)...`);
    try {
      execSync(`node pipeline.js --skip-import ${feds_arr.join(" ")}`, {
        stdio: "inherit",
        cwd: REPO_ROOT,
        maxBuffer: 50 * 1024 * 1024,
      });
      ok(`Pipeline concluído — seguro committar`);
    } catch (e) {
      warn(`Pipeline retornou erro (output acima): ${e.message}`);
      process.exit(1);
    }
    process.exit(0);
  }
  console.log(`${Y}Nada de novo — sem commit${X}`);
  process.exit(2);
}

main().catch(e => {
  console.error(`${R}ERRO FATAL:${X}`, e.stack || e.message);
  process.exit(1);
});
