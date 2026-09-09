/**
 * scripts/scrape-wagr.js — Scraper Node-puro do World Amateur Golf Ranking.
 *
 * wagr.com é Next.js com render NO SERVIDOR e uma API REST PÚBLICA (sem login,
 * sem chave, sem cookies). Scrapa-se com `fetch` puro — NÃO precisa de browser.
 *
 * ⚠ O CLAUDE.md/histórico dizia "WAGR ⛔ depende de JavaScript" (secção
 *   "Sites e links de dados"). Era uma conclusão tirada em 2026 a partir do HTML
 *   cru à procura de DATAS. Está ERRADA e foi corrigida a 2026-09-09: os dados
 *   vêm todos ou da API ou do `__NEXT_DATA__` do SSR.
 *
 * Três vistas:
 *   1. RANKING  — GET /api/wagr/rankings/getRankings?rankingsType=0|1
 *                 `rankingsType=0` homens (~5.000), `=1` senhoras (~3.300).
 *                 pageSize grande devolve tudo numa request. Dá rank, variação,
 *                 país, divisor e pontos médios.
 *   2. EVENTS   — GET /api/wagr/events/getEvents?year=Y&pageSize=5000
 *                 TODOS os eventos do ano do MUNDO numa request (~4.000/ano):
 *                 id, nome, datas, país, tipo, power, campo(s) e vencedor.
 *   3. LEADERBOARD — o endpoint de resultados por evento NÃO existe na API; os
 *                 resultados vêm no `__NEXT_DATA__` de
 *                 https://www.wagr.com/events/{slug}-{id}.
 *                 ⚠ O SLUG É DECORATIVO — só o id final conta. Usa-se
 *                 `/events/x-{id}`, por isso não é preciso guardar slugs.
 *
 * ⚠ O leaderboard é PARCIAL por natureza: só aparecem os jogadores que
 *   pontuaram no WAGR, não o campo todo. Um Nacional de Jovens com 60
 *   inscritos pode dar 4 linhas. É um leaderboard DE RANKING.
 * ⚠ NÃO há data de nascimento em lado nenhum (nem escalão do jogador) — o
 *   escalão é do EVENTO (`eventType`: Junior/All Ages/Collegiate/...).
 *   → matching no kids2 seria FRACO (nome+país), como o EGR.
 * ⚠ O Manuel NÃO está no WAGR (pesquisa "Medeiros" = 0). É base de RIVAIS e de
 *   contexto — com a diferença de que o WAGR inclui as provas da FPG e o Faldo.
 *
 * Outputs:
 *   public/data/wagr-ranking.json              (ranking consolidado M+F)
 *   public/data/wagr/wagr-events-index.json    (índice: meta por ano + scraped)
 *   public/data/wagr/events/wagr_{id}.json     (1 por evento, leaderboard)
 *   public/data/wagr/player-events/wagr-player-events-NN.json  (rollup em 16 shards)
 *
 * CLI:
 *   node scripts/scrape-wagr.js                        # ranking + eventos (ano corrente e anterior)
 *   node scripts/scrape-wagr.js --ranking              # só o ranking
 *   node scripts/scrape-wagr.js --events --year 2025 --year 2026
 *   node scripts/scrape-wagr.js --events --skip-existing   # só os que ainda não têm leaderboard
 *   node scripts/scrape-wagr.js --events --no-leaderboards # só o índice de eventos
 *   node scripts/scrape-wagr.js --events --type Junior     # filtra por eventType
 *   node scripts/scrape-wagr.js --events --country Portugal
 *   node scripts/scrape-wagr.js --concurrency 8 --limit 50
 *
 * Exit codes: 0 = ok (há output), 2 = sem novidades, 1 = erro.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");

const API = "https://worldgolfranking2021api.wagr.com/api/wagr";
const SITE = "https://www.wagr.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) golf-fpg-wagr-scraper";
const DATA_DIR = path.resolve(__dirname, "..", "public", "data");
const WAGR_DIR = path.join(DATA_DIR, "wagr");
const EVENTS_DIR = path.join(WAGR_DIR, "events");

/** rankingsType da API: 0 = homens, 1 = senhoras (2 e 3 devolvem senhoras). */
const RANKING_TYPES = [{ type: 0, sex: "M" }, { type: 1, sex: "F" }];

// ─────────────────────────────────────────────────────────── CLI parsing ──

function parseArgs(argv) {
  const o = {
    ranking: false, events: false,
    years: [], types: [], countries: [],
    skipExisting: false, noLeaderboards: false,
    concurrency: 6, limit: null, help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ranking") o.ranking = true;
    else if (a === "--events") o.events = true;
    else if (a === "--year") o.years.push(parseInt(argv[++i], 10));
    else if (a === "--type") o.types.push(String(argv[++i]));
    else if (a === "--country") o.countries.push(String(argv[++i]));
    else if (a === "--skip-existing") o.skipExisting = true;
    else if (a === "--no-leaderboards") o.noLeaderboards = true;
    else if (a === "--concurrency") o.concurrency = Math.max(1, parseInt(argv[++i], 10) || 6);
    else if (a === "--limit") o.limit = parseInt(argv[++i], 10);
    else if (a === "--help" || a === "-h") o.help = true;
  }
  if (!o.ranking && !o.events) { o.ranking = true; o.events = true; }
  if (!o.years.length) { const y = new Date().getFullYear(); o.years = [y, y - 1]; }
  o.years = [...new Set(o.years.filter((y) => Number.isFinite(y)))].sort();
  return o;
}

// ────────────────────────────────────────────────────────────── HTTP ──────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpGet(url, { retries = 3, json = false } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: json ? "application/json" : "text/html", "Accept-Language": "en" },
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return json ? await res.json() : await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(600 * (attempt + 1));
    }
  }
  throw new Error(`GET ${url} falhou: ${lastErr && lastErr.message}`);
}

const apiGet = (pathname, params) => {
  const qs = new URLSearchParams(params || {}).toString();
  return httpGet(`${API}/${pathname}${qs ? `?${qs}` : ""}`, { json: true });
};

// Corre `tasks` (array de funções () => Promise) com concorrência limitada.
async function pool(tasks, concurrency, onProgress) {
  const results = new Array(tasks.length);
  let idx = 0, done = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      try { results[i] = await tasks[i](); }
      catch (err) { results[i] = { error: err.message }; }
      done++;
      if (onProgress) onProgress(done, tasks.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

// ───────────────────────────────────────────────────────────── helpers ────

const toNum = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
/** "2026-05-01T00:00:00" → "2026-05-01". Corta a hora SEM passar por Date, para
 *  não repetir o bug dos fusos (epochs à meia-noite davam −1 dia em UTC). */
const isoDay = (s) => (typeof s === "string" && s.length >= 10 ? s.slice(0, 10) : null);
/** "12" → 12; "T3" → 3; "Participant"/"MC" → null (mantém-se o texto em `pos`). */
const posNum = (v) => {
  const m = /^\s*T?(\d+)/i.exec(String(v ?? ""));
  return m ? parseInt(m[1], 10) : null;
};

/**
 * Score de golfe: 0 é AUSÊNCIA de score, não um score.
 *
 * ⚠ O WAGR devolve `totalScore: "0"` (e rondas a 0) nas linhas "Participant" —
 * match play, provas por equipas, quem pontuou só por participar. São ~3% das
 * linhas. Guardado como 0, o jogador aparecia com "0" na coluna TOTAL e subia
 * para o topo de qualquer ordenação por total.
 */
const score = (v) => {
  const n = toNum(v);
  return n === 0 ? null : n;
};

/** Dias a partir dos quais um evento sem classificados é dado por encerrado. */
const SETTLED_AFTER_DAYS = 60;

/**
 * O `--skip-existing` pode saltar este evento?
 *
 * ⚠ Não basta o ficheiro existir. Um evento AINDA POR JOGAR devolve
 * `results: []` e escreveria um ficheiro vazio — que com um `existsSync` puro
 * nunca mais seria re-fetchado, e o leaderboard nunca apareceria. Por isso:
 * salta-se se tem classificados OU se já acabou há mais de SETTLED_AFTER_DAYS
 * (aí o vazio é definitivo — ninguém daquela prova pontuou no WAGR).
 */
function isSettled(file) {
  if (!fs.existsSync(file)) return false;
  let d;
  try { d = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return false; }
  if ((d.players || []).length > 0) return true;
  const end = d.endDate || d.startDate;
  if (!end) return false;
  return (Date.now() - Date.parse(`${end}T12:00:00Z`)) / 86400000 > SETTLED_AFTER_DAYS;
}

// ──────────────────────────────────────────────────────────── RANKING ─────

async function scrapeRanking() {
  console.log("• Ranking WAGR (mundial, M+F)");
  const players = [];
  const totals = {};
  for (const { type, sex } of RANKING_TYPES) {
    const d = await apiGet("rankings/getRankings", {
      rankingsType: type, pageNumber: 1, pageSize: 100000,
      week: 0, year: 0, region: "0", countries: "", playerName: "",
      county: "", playerIDs: "", includeFirstStats: false,
    });
    const rows = d?.rankingLandingModels || [];
    totals[sex] = d?.rankingsTableSettings?.totalRecords ?? rows.length;
    for (const p of rows) {
      players.push({
        id: String(p.playerId),
        sex: p.gender || sex,
        name: p.playerFullName || `${p.firstName || ""} ${p.lastName || ""}`.trim(),
        firstName: p.firstName || null,
        lastName: p.lastName || null,
        country: p.nationality || null,
        rank: toNum(p.rankThisWeek),
        rankLastWeek: toNum(p.rankLastWeek),
        change: toNum(p.change),
        divisor: toNum(p.divisor),
        pointsAverage: toNum(p.pointsAverage),
        profileLink: p.playerProfileLink || null,
      });
    }
    console.log(`  ✔ ${sex}: ${rows.length} jogadores`);
  }
  const week = await httpGet(`${API}/getWeekRibbon`).catch(() => null);
  const out = {
    generated_at: new Date().toISOString(),
    week: week ? String(week).trim().replace(/^"|"$/g, "") : null,
    totalMen: totals.M ?? 0,
    totalWomen: totals.F ?? 0,
    players,
  };
  writeJsonAtomic(path.join(DATA_DIR, "wagr-ranking.json"), out, { spaces: 0 });
  console.log(`  ✔ ${players.length} jogadores → public/data/wagr-ranking.json (semana ${out.week || "?"})`);
  return players;
}

// ───────────────────────────────────────────────────────────── EVENTOS ────

/** Lista de eventos de um ano (metadata, sem resultados). 1 request por ano. */
async function fetchEventsOfYear(year) {
  const d = await apiGet("events/getEvents", {
    pageNumber: 1, pageSize: 5000, year,
    country: "", county: "", eventType: "", gender: "",
    powerLower: 0, powerUpper: 0, region: "", searchText: "",
    strength: "", tab: "", week: 0, sortString: "",
  });
  return (d?.events || []).map((e) => ({
    id: String(e.eventId),
    name: e.eventName || "",
    country: e.country || null,
    eventType: e.eventType || null,
    startDate: isoDay(e.eventStartDate),
    endDate: isoDay(e.eventEndDate),
    year,
    power: toNum(e.powerStrength ?? e.power),
    courses: Array.isArray(e.courses) ? e.courses.filter(Boolean) : (e.course ? [e.course] : []),
    winner: e.winner || null,
  }));
}

/** Leaderboard + detalhes de um evento, do `__NEXT_DATA__` da página SSR. */
function parseEventPage(html, id) {
  const m = /__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("sem __NEXT_DATA__");
  const props = JSON.parse(m[1])?.props?.pageProps || {};
  const det = props.eventDetailsData?.eventDetails || null;
  const res = props.eventResultsData?.eventResults?.results || [];
  const players = res.map((p) => {
    const rounds = {};
    for (const r of p.roundByRoundScores || []) {
      const n = parseInt(r.roundNumber, 10);
      if (n >= 1 && n <= 4) rounds[`r${n}`] = score(r.score);
    }
    return {
      id: p.playerId != null ? String(p.playerId) : null,
      pos: p.finishPosition ?? null,
      posNum: posNum(p.finishPosition),
      name: p.playerName || "",
      country: p.nationality || null,
      r1: rounds.r1 ?? null, r2: rounds.r2 ?? null, r3: rounds.r3 ?? null, r4: rounds.r4 ?? null,
      total: score(p.totalScore),
      points: toNum(p.points),
    };
  });
  return {
    id: String(id),
    name: det?.eventName || null,
    country: det?.country || null,
    region: det?.region || null,
    city: det?.city || null,
    eventType: det?.eventType || null,
    format: det?.format || null,
    sex: det?.gender === "M" || det?.gender === "F" ? det.gender : (det?.gender ? "Mixed" : null),
    organiser: det?.organiserName || null,
    startDate: isoDay(det?.eventStartDate),
    endDate: isoDay(det?.eventEndDate),
    week: det?.wagrWeek || null,
    power: toNum(det?.power),
    spRounds: toNum(det?.strokeplayRounds),
    mpRounds: toNum(det?.matchplayRounds),
    players,
  };
}

async function scrapeEvents(opts) {
  fs.mkdirSync(EVENTS_DIR, { recursive: true });

  // 1. Metadata de todos os eventos dos anos pedidos (1 request por ano).
  let archive = [];
  for (const year of opts.years) {
    const evs = await fetchEventsOfYear(year);
    console.log(`• ${year}: ${evs.length} eventos no calendário WAGR`);
    archive.push(...evs);
  }

  // 2. Alvos para leaderboard (filtros opcionais; por omissão é o mundo todo).
  let targets = archive;
  if (opts.types.length) {
    const want = new Set(opts.types.map((t) => t.toLowerCase()));
    targets = targets.filter((e) => want.has(String(e.eventType || "").toLowerCase()));
  }
  if (opts.countries.length) {
    const want = new Set(opts.countries.map((c) => c.toLowerCase()));
    targets = targets.filter((e) => want.has(String(e.country || "").toLowerCase()));
  }
  if (opts.limit) targets = targets.slice(0, opts.limit);

  let scraped = 0, skipped = 0, failed = 0;
  if (!opts.noLeaderboards) {
    console.log(`• Leaderboards: ${targets.length} eventos (concorrência ${opts.concurrency})`);
    const tasks = targets.map((e) => async () => {
      const outFile = path.join(EVENTS_DIR, `wagr_${e.id}.json`);
      if (opts.skipExisting && isSettled(outFile)) { skipped++; return { skipped: true }; }
      // ⚠ O slug é decorativo — só o id final conta. "x-" evita ter de o guardar.
      const url = `${SITE}/events/x-${e.id}`;
      const ev = parseEventPage(await httpGet(url), e.id);
      // O que a página do evento não traz vem do calendário.
      ev.name = ev.name || e.name;
      ev.country = ev.country || e.country;
      ev.eventType = ev.eventType || e.eventType;
      ev.startDate = ev.startDate || e.startDate;
      ev.endDate = ev.endDate || e.endDate;
      ev.power = ev.power ?? e.power;
      ev.year = e.year;
      ev.courses = e.courses;
      ev.winner = e.winner;
      ev.url = url;
      ev.scrapedAt = new Date().toISOString();
      writeJsonAtomic(outFile, ev, { spaces: 0 });
      scraped++;
      return { players: ev.players.length };
    });
    const out = await pool(tasks, opts.concurrency, (d, t) => {
      if (d % 25 === 0 || d === t) process.stdout.write(`\r  eventos ${d}/${t}   `);
    });
    process.stdout.write("\n");
    failed = out.filter((r) => r && r.error).length;
    if (failed) console.warn(`  ⚠ ${failed} eventos falharam (ficam para o próximo run)`);
  }

  // 3. Índice — MERGE com o que já lá está.
  //    ⚠ Substituir o índice inteiro apagava a meta dos eventos dos OUTROS anos
  //    (foi o bug do EGR a 2026-08-06: 753/754 eventos sem data e o dedup
  //    silenciosamente desligado). Aqui vale o mesmo: um run --year 2024 não
  //    pode levar à frente 2025/2026.
  const idxFile = path.join(WAGR_DIR, "wagr-events-index.json");
  const prev = fs.existsSync(idxFile) ? JSON.parse(fs.readFileSync(idxFile, "utf8")) : null;
  const merged = new Map((prev?.events || []).map((e) => [String(e.id), e]));
  for (const e of archive) merged.set(String(e.id), e);
  writeJsonAtomic(idxFile, {
    generated_at: new Date().toISOString(),
    years: [...new Set([...(prev?.years || []), ...opts.years])].sort(),
    totalArchive: merged.size,
    totalTargets: targets.length,
    scraped, skipped, failed,
    events: [...merged.values()].map((e) => ({
      ...e,
      scraped: fs.existsSync(path.join(EVENTS_DIR, `wagr_${e.id}.json`)),
    })),
  }, { spaces: 0 });
  console.log(`  ✔ ${scraped} escritos, ${skipped} saltados. Índice: public/data/wagr/wagr-events-index.json`);

  buildPlayerEventsRollup();
  return scraped + skipped;
}

/** Nº de shards do rollup jogador→eventos. ⚠ Espelhado na WAGRPage
 *  (`WAGR_PLAYER_SHARDS`) — mudar aqui obriga a mudar lá. */
const PLAYER_SHARDS = 16;
/** Shard de um jogador: os últimos dígitos do id, módulo PLAYER_SHARDS. */
const shardOf = (playerId) => Number(BigInt(String(playerId).replace(/\D/g, "") || "0") % BigInt(PLAYER_SHARDS));

/** Rollup jogador→eventos a partir de TODOS os wagr_{id}.json em disco.
 *  Alimenta o detalhe do jogador na /wagr sem obrigar a carregar milhares de
 *  ficheiros de evento.
 *
 *  ⚠ SHARDED, e não um ficheiro só: com o mundo inteiro são ~87.000 linhas
 *  (7.200 jogadores × ~12 provas) = **17 MB**, que o browser descarregaria
 *  inteiros para mostrar UM jogador. Em 16 shards são ~1 MB por clique. */
function buildPlayerEventsRollup() {
  const files = fs.existsSync(EVENTS_DIR) ? fs.readdirSync(EVENTS_DIR).filter((f) => /^wagr_\d+\.json$/.test(f)) : [];
  const byPlayer = {};
  for (const f of files) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(EVENTS_DIR, f), "utf8")); } catch { continue; }
    for (const p of d.players || []) {
      if (!p.id) continue;
      (byPlayer[p.id] = byPlayer[p.id] || []).push({
        eventId: d.id, name: d.name, date: d.startDate || null,
        country: d.country, eventType: d.eventType, sex: d.sex,
        power: d.power,
        pos: p.posNum != null ? p.posNum : p.pos,
        total: p.total,
        rounds: [p.r1, p.r2, p.r3, p.r4].filter((x) => x != null),
        points: p.points,
      });
    }
  }
  const shards = Array.from({ length: PLAYER_SHARDS }, () => ({}));
  for (const id of Object.keys(byPlayer)) {
    byPlayer[id].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    shards[shardOf(id)][id] = byPlayer[id];
  }
  const generated_at = new Date().toISOString();
  const dir = path.join(WAGR_DIR, "player-events");
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < PLAYER_SHARDS; i++) {
    writeJsonAtomic(path.join(dir, `wagr-player-events-${String(i).padStart(2, "0")}.json`), {
      generated_at,
      note: `Rollup jogador→eventos (shard ${i} de ${PLAYER_SHARDS}, por playerId % ${PLAYER_SHARDS}). Para o detalhe da /wagr.`,
      shard: i,
      shards: PLAYER_SHARDS,
      totalPlayers: Object.keys(shards[i]).length,
      players: shards[i],
    }, { spaces: 0 });
  }
  const total = Object.keys(byPlayer).length;
  console.log(`  ✔ rollup jogador→eventos: ${total} jogadores em ${PLAYER_SHARDS} shards → public/data/wagr/player-events/`);
}

// ────────────────────────────────────────────────────────────── main ──────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^\/\*\*?/, ""));
    return;
  }
  fs.mkdirSync(WAGR_DIR, { recursive: true });
  let produced = 0;
  try {
    if (opts.ranking) produced += (await scrapeRanking()).length;
    if (opts.events) produced += await scrapeEvents(opts);
  } catch (err) {
    console.error("✖ Erro:", err.message);
    process.exitCode = 1;
    return;
  }
  if (!produced) { console.log("Sem novidades."); process.exitCode = 2; return; }
  console.log("Concluído.");
  process.exitCode = 0;
}

if (require.main === module) main();

module.exports = { parseEventPage, posNum, isoDay, isSettled, SETTLED_AFTER_DAYS, shardOf, PLAYER_SHARDS };
