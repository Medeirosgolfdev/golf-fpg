#!/usr/bin/env node
/**
 * fpg-bridge-drive.js — Unified DRIVE scraper + player downloader
 *
 * Faz TUDO numa só passagem via browser (scoring.fpg.pt):
 *   Fase 1: Scrape torneios DRIVE (classificações + scorecards)
 *   Fase 2: Download perfis de jogadores DRIVE (WHS + scorecards FPG)
 *   Fase 3: Construir drive-sd-lookup.json (cruzar scoreIds com SD oficial)
 *
 * Uso:
 *   node fpg-bridge-drive.js [opções]
 *
 * Opções:
 *   --tournaments     Scrape torneios DRIVE (Fase 1)
 *   --players         Download perfis de jogadores (Fase 2)
 *   --all-players     Todos os jogadores encontrados nos torneios
 *   --new-players     Só jogadores que NÃO estão em players.json
 *   --recommended     Só os 27 jogadores recomendados (recommended-feds-download.txt)
 *   --feds 123 456    Jogadores específicos
 *   --refresh         Saltar jogadores se WHS count não mudou
 *   --force           Re-descarregar tudo
 *   --qualif-only     Só rondas qualificativas HCP
 *   --skip-sd         Não construir SD lookup no fim
 *   --concurrency N   Downloads paralelos (default: 8)
 *
 * Exemplos:
 *   node fpg-bridge-drive.js --tournaments --players --new-players
 *   node fpg-bridge-drive.js --tournaments --players --all-players --refresh
 *   node fpg-bridge-drive.js --players --recommended
 *   node fpg-bridge-drive.js --players --feds 47078 59252
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

// ── Parse args ──
const args = process.argv.slice(2);
let doTournaments = false, doPlayers = false;
let allPlayersFlag = false, newPlayersFlag = false, recommendedFlag = false;
let refreshFlag = false, forceFlag = false, qualifOnly = false, skipSD = false;
let concurrency = 8;
const explicitFeds = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--tournaments")   { doTournaments = true; continue; }
  if (a === "--players")       { doPlayers = true; continue; }
  if (a === "--all-players")   { allPlayersFlag = true; doPlayers = true; continue; }
  if (a === "--new-players")   { newPlayersFlag = true; doPlayers = true; continue; }
  if (a === "--recommended")   { recommendedFlag = true; doPlayers = true; continue; }
  if (a === "--refresh")       { refreshFlag = true; continue; }
  if (a === "--force")         { forceFlag = true; continue; }
  if (a === "--qualif-only")   { qualifOnly = true; continue; }
  if (a === "--skip-sd")       { skipSD = true; continue; }
  if (a === "--concurrency")   { concurrency = parseInt(args[++i]) || 8; continue; }
  if (a === "--feds")          { while (i + 1 < args.length && /^\d+$/.test(args[i + 1])) explicitFeds.push(args[++i]); continue; }
  if (/^\d+$/.test(a))         { explicitFeds.push(a); continue; }
}

if (!doTournaments && !doPlayers && explicitFeds.length === 0) {
  console.log("Uso: node fpg-bridge-drive.js --tournaments --players --new-players");
  console.log("     node fpg-bridge-drive.js --players --recommended");
  console.log("     node fpg-bridge-drive.js --players --feds 47078 59252");
  process.exit(1);
}

// ── Colors ──
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m", B = "\x1b[1m", D = "\x1b[2m", X = "\x1b[0m";

// ── DRIVE Tournament list (same as scraper v6) ──
const DRIVE_TOURNAMENTS = [
  { name: "3º Torneio Drive Tour Norte – Vale Pisão", ccode: "987", tcode: "10208", date: "2026-02-28", clube: "FPG_DNorte", campo: "Vale Pisão" },
  { name: "2º Torneio Drive Tour Madeira - Santo da Serra", ccode: "982", tcode: "10199", date: "2026-02-07", clube: "FPG_DM", campo: "Santo da Serra" },
  { name: "2º Torneio Drive Tour Sul – Vila Sol", ccode: "988", tcode: "10293", date: "2026-02-01", clube: "FPG_DRIVE", campo: "Vila Sol" },
  { name: "1º Torneio Drive Tour Sul – Laguna G.C.", ccode: "988", tcode: "10292", date: "2026-01-11", clube: "FPG_DRIVE", campo: "Vilamoura - Laguna" },
  { name: "1º Torneio Drive Tour Tejo – Montado", ccode: "985", tcode: "10202", date: "2026-01-04", clube: "FPG_DTejo", campo: "Montado" },
  { name: "1º Torneio Drive Tour Norte – Estela GC", ccode: "987", tcode: "10206", date: "2026-01-04", clube: "FPG_DNorte", campo: "Estela" },
  { name: "1º Torneio Drive Tour Madeira - Palheiro Golf", ccode: "982", tcode: "10198", date: "2026-01-03", clube: "FPG_DM", campo: "Palheiro Golf" },
  { name: "2º Torneio Drive Challenge Açores-Terceira-Sub 18", ccode: "983", tcode: "10154", date: "2026-02-28", clube: "FPG_DAT", campo: "Terceira" },
  { name: "2º Torneio Drive Challenge Açores-Terceira-Sub 16", ccode: "983", tcode: "10153", date: "2026-02-28", clube: "FPG_DAT", campo: "Terceira" },
  { name: "2º Torneio Drive Challenge Açores-Terceira-Sub 14", ccode: "983", tcode: "10152", date: "2026-02-28", clube: "FPG_DAT", campo: "Terceira" },
  { name: "2º Torneio Drive Challenge Açores-Terceira-Sub 12", ccode: "983", tcode: "10151", date: "2026-02-28", clube: "FPG_DAT", campo: "Terceira" },
  { name: "2º Torneio Drive Challenge Açores-Terceira-Sub 10", ccode: "983", tcode: "10150", date: "2026-02-28", clube: "FPG_DAT", campo: "Terceira" },
  { name: "2º Torneio Drive Challenge Tejo-Montado - Sub 18", ccode: "985", tcode: "10215", date: "2026-02-22", clube: "FPG_DTejo", campo: "Montado" },
  { name: "2º Torneio Drive Challenge Tejo-Montado - Sub 16", ccode: "985", tcode: "10214", date: "2026-02-22", clube: "FPG_DTejo", campo: "Montado" },
  { name: "2º Torneio Drive Challenge Tejo-Montado - Sub 14", ccode: "985", tcode: "10213", date: "2026-02-22", clube: "FPG_DTejo", campo: "Montado" },
  { name: "2º Torneio Drive Challenge Tejo-Montado - Sub 12", ccode: "985", tcode: "10212", date: "2026-02-22", clube: "FPG_DTejo", campo: "Montado" },
  { name: "2º Torneio Drive Challenge Tejo-Montado - Sub 10", ccode: "985", tcode: "10211", date: "2026-02-22", clube: "FPG_DTejo", campo: "Montado" },
  { name: "2º Torneio Drive Challenge Sul - Laguna Sub 18", ccode: "988", tcode: "10297", date: "2026-02-21", clube: "FPG_DRIVE", campo: "Vilamoura - Laguna" },
  { name: "2º Torneio Drive Challenge Sul - Laguna Sub 16", ccode: "988", tcode: "10300", date: "2026-02-21", clube: "FPG_DRIVE", campo: "Vilamoura - Laguna" },
  { name: "2º Torneio Drive Challenge Sul - Laguna Sub 14", ccode: "988", tcode: "10296", date: "2026-02-21", clube: "FPG_DRIVE", campo: "Vilamoura - Laguna" },
  { name: "2º Torneio Drive Challenge Sul - Laguna Sub 12", ccode: "988", tcode: "10295", date: "2026-02-21", clube: "FPG_DRIVE", campo: "Vilamoura - Laguna" },
  { name: "2º Torneio Drive Challenge Sul - Laguna Sub 10", ccode: "988", tcode: "10294", date: "2026-02-21", clube: "FPG_DRIVE", campo: "Vilamoura - Laguna" },
  { name: "2º Torn.Drive Challenge Madeira-Sub18", ccode: "982", tcode: "10211", date: "2026-02-08", clube: "FPG_DM", campo: "Santo da Serra" },
  { name: "2º Torn.Drive Challenge Madeira-Sub16", ccode: "982", tcode: "10210", date: "2026-02-08", clube: "FPG_DM", campo: "Santo da Serra" },
  { name: "2º Torn.Drive Challenge Madeira-Sub14", ccode: "982", tcode: "10209", date: "2026-02-08", clube: "FPG_DM", campo: "Santo da Serra" },
  { name: "2º Torn.Drive Challenge Madeira-Sub12", ccode: "982", tcode: "10208", date: "2026-02-08", clube: "FPG_DM", campo: "Santo da Serra" },
  { name: "2º Torn.Drive Challenge Madeira-Sub10", ccode: "982", tcode: "10207", date: "2026-02-08", clube: "FPG_DM", campo: "Santo da Serra" },
  { name: "1º Torneio Drive Challenge Açores-Terceira-Sub 18", ccode: "983", tcode: "10149", date: "2026-01-24", clube: "FPG_DAT", campo: "Terceira" },
  { name: "1º Torneio Drive Challenge Açores-Terceira-Sub 16", ccode: "983", tcode: "10148", date: "2026-01-24", clube: "FPG_DAT", campo: "Terceira" },
  { name: "1º Torneio Drive Challenge Açores-Terceira-Sub 14", ccode: "983", tcode: "10147", date: "2026-01-24", clube: "FPG_DAT", campo: "Terceira" },
  { name: "1º Torneio Drive Challenge Açores-Terceira-Sub 12", ccode: "983", tcode: "10146", date: "2026-01-24", clube: "FPG_DAT", campo: "Terceira" },
  { name: "1º Torneio Drive Challenge Açores-Terceira-Sub 10", ccode: "983", tcode: "10145", date: "2026-01-24", clube: "FPG_DAT", campo: "Terceira" },
  { name: "1º Torneio Drive Challenge Madeira-Palheiro-Sub 18", ccode: "982", tcode: "10205", date: "2026-01-04", clube: "FPG_DM", campo: "Palheiro Golf" },
  { name: "1º Torneio Drive Challenge Madeira-Palheiro-Sub 16", ccode: "982", tcode: "10206", date: "2026-01-04", clube: "FPG_DM", campo: "Palheiro Golf" },
  { name: "1º Torneio Drive Challenge Madeira-Palheiro-Sub 14", ccode: "982", tcode: "10204", date: "2026-01-04", clube: "FPG_DM", campo: "Palheiro Golf" },
  { name: "1º Torneio Drive Challenge Madeira-Palheiro-Sub 12", ccode: "982", tcode: "10203", date: "2026-01-04", clube: "FPG_DM", campo: "Palheiro Golf" },
  { name: "1º Torneio Drive Challenge Madeira-Palheiro-Sub 10", ccode: "982", tcode: "10202", date: "2026-01-04", clube: "FPG_DM", campo: "Palheiro Golf" },
];

function classify(name, clube) {
  const lc = name.toLowerCase();
  const series = lc.includes("challenge") ? "challenge" : "tour";
  let region = "outro";
  if (lc.includes("madeira") || lc.includes("palheiro") || clube === "FPG_DM") region = "madeira";
  else if (lc.includes("norte") || lc.includes("estela") || lc.includes("vale pis") || clube === "FPG_DNorte") region = "norte";
  else if (lc.includes("tejo") || lc.includes("montado") || clube === "FPG_DTejo") region = "tejo";
  else if (lc.includes("sul") || lc.includes("laguna") || lc.includes("vila sol") || clube === "FPG_DRIVE") region = "sul";
  else if (lc.includes("acor") || lc.includes("terceira") || clube === "FPG_DAT") region = "acores";
  let escalao = null;
  const em = lc.match(/sub\s*(\d+)/);
  if (em) escalao = "Sub " + em[1];
  const nm = name.match(/(\d+)\s*[^\d]/);
  const num = nm ? parseInt(nm[1]) : null;
  return { series, region, escalao, num };
}

// ── State ──
const PORT = 3456;
const BATCH_SIZE = 20;
let phase = "idle";  // "idle" | "tournaments" | "players" | "done"
let tournamentIdx = 0;
let playerIdx = 0;
let playerFeds = [];
let driveData = null;       // scraped tournament data (phase 1 result)
let driveFeds = new Set();  // all feds found in DRIVE
let sdLookup = {};          // scoreId → SD (built in phase 3)
let startTime = Date.now();

// Stats
let stats = {
  tournamentsScraped: 0, totalScorecards: 0,
  playersProcessed: 0, playersSkipped: 0, playersFailed: 0,
  newScorecards: 0, sdMatched: 0
};

// Load existing data
const playersJsonPath = path.join(process.cwd(), "players.json");
const playersDB = fs.existsSync(playersJsonPath) ? JSON.parse(fs.readFileSync(playersJsonPath, "utf-8")) : {};
const driveDataPath = path.join(process.cwd(), "public", "data", "drive-data.json");
const existingDrive = fs.existsSync(driveDataPath) ? JSON.parse(fs.readFileSync(driveDataPath, "utf-8")) : null;

// ── Determine player list ──
function resolvePlayerList() {
  if (explicitFeds.length > 0) return explicitFeds;

  // If we just scraped tournaments, use those feds
  const source = driveData || existingDrive;
  if (!source) { console.error(`${R}Sem drive-data.json para determinar jogadores${X}`); return []; }

  const allFeds = new Set();
  for (const t of source.tournaments) {
    for (const p of t.players) {
      if (p.fed) allFeds.add(p.fed);
    }
  }

  if (recommendedFlag) {
    const recPath = path.join(process.cwd(), "recommended-feds-download.txt");
    if (fs.existsSync(recPath)) {
      const lines = fs.readFileSync(recPath, "utf-8").split("\n").map(l => l.trim()).filter(l => /^\d+$/.test(l));
      console.log(`  ${C}Recomendados: ${lines.length} jogadores${X}`);
      return lines;
    }
    console.log(`  ${Y}recommended-feds-download.txt não encontrado, usando --new-players${X}`);
    newPlayersFlag = true;
  }

  if (newPlayersFlag) {
    const missing = [...allFeds].filter(f => !playersDB[f]);
    console.log(`  ${C}Novos jogadores: ${missing.length} (de ${allFeds.size} total)${X}`);
    return missing;
  }

  if (allPlayersFlag) {
    console.log(`  ${C}Todos os jogadores DRIVE: ${allFeds.size}${X}`);
    return [...allFeds];
  }

  return [];
}

function getExistingScoreIds(fed) {
  const dir = path.join(process.cwd(), "output", fed, "scorecards");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => f.replace(".json", ""));
}

function getExistingWHSCount(fed) {
  const p = path.join(process.cwd(), "output", fed, "whs-list.json");
  if (!fs.existsSync(p)) return 0;
  try { return JSON.parse(fs.readFileSync(p, "utf-8"))?.Records?.length || 0; } catch { return 0; }
}

function collectBody(req, cb) {
  let body = ""; req.on("data", (c) => body += c); req.on("end", () => cb(body));
}

// ── Phase 3: Build SD lookup ──
// NOTE: scoreIds from scoring.datagolf.pt (ClassifLST) are NOT the same as
// scoreIds from scoring.fpg.pt (PlayerWHS). We match by fed + date + gross.
function driveToFpgDate(d) {
  // "2026-01-24" → "24-01-2026"
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

function buildSDLookup() {
  if (skipSD) return;
  console.log(`\n${B}═══ Fase 3: SD Lookup ═══${X}`);

  const source = driveData || existingDrive;
  if (!source) { console.log(`  ${Y}Sem drive-data para cruzar${X}`); return; }

  // Collect DRIVE entries: driveScoreId → { fed, fpgDate, gross, nholes }
  const driveEntries = [];
  const fedSet = new Set();
  for (const t of source.tournaments) {
    const fpgDate = driveToFpgDate(t.date);
    for (const p of t.players) {
      if (!p.fed || !p.scoreId) continue;
      const g = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal;
      if (g >= 900 || isNaN(g)) continue;
      driveEntries.push({
        driveScoreId: String(p.scoreId), fed: p.fed, fpgDate, gross: g,
        nholes: p.nholes || (p.scores?.length) || 18
      });
      fedSet.add(p.fed);
    }
  }

  let matched = 0, noFile = 0;

  for (const fed of fedSet) {
    const candidates = [
      path.join(process.cwd(), "output", fed, "analysis", "data.json"),
      path.join(process.cwd(), "public", fed, "analysis", "data.json"),
    ];
    const dataFile = candidates.find(f => fs.existsSync(f));
    if (!dataFile) { noFile++; continue; }

    let pdata;
    try { pdata = JSON.parse(fs.readFileSync(dataFile, "utf-8")); } catch { continue; }

    // Build round index: "date|gross" → [{ sd, holes }]
    const roundIndex = new Map();
    for (const course of (pdata.DATA || [])) {
      for (const r of (course.rounds || [])) {
        if (r.sd == null || r.sd === "" || r.sd === undefined) continue;
        const gross = typeof r.gross === "string" ? parseInt(r.gross) : r.gross;
        if (!gross || isNaN(gross)) continue;
        const date = r.date || "";
        if (!date) continue;
        const holes = r.holeCount || r.holes || 18;
        const key = `${date}|${gross}`;
        if (!roundIndex.has(key)) roundIndex.set(key, []);
        roundIndex.get(key).push({ sd: Number(r.sd), holes });
      }
    }

    // Match DRIVE entries for this fed
    for (const entry of driveEntries.filter(e => e.fed === fed)) {
      const key = `${entry.fpgDate}|${entry.gross}`;
      const matches = roundIndex.get(key);
      if (!matches || matches.length === 0) continue;
      const best = matches.find(c => c.holes === entry.nholes) || matches[0];
      sdLookup[entry.driveScoreId] = best.sd;
      matched++;
    }
  }

  stats.sdMatched = matched;

  // Save lookup
  const lookupPath = path.join(process.cwd(), "public", "data", "drive-sd-lookup.json");
  const lookupDir = path.dirname(lookupPath);
  if (!fs.existsSync(lookupDir)) fs.mkdirSync(lookupDir, { recursive: true });
  fs.writeFileSync(lookupPath, JSON.stringify(sdLookup, null, 2));
  console.log(`  ${G}✓${X} SD lookup: ${matched} scoreIds matched (${noFile} jogadores sem data.json)`);
  console.log(`  ${G}✓${X} Guardado: ${lookupPath}`);
}

// ── Final report ──
function printReport() {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const mins = (elapsed / 60).toFixed(1);
  console.log(`\n${B}╔══════════════════════════════════════════╗${X}`);
  console.log(`${B}║       DRIVE Pipeline — Relatório         ║${X}`);
  console.log(`${B}╠══════════════════════════════════════════╣${X}`);
  if (doTournaments) {
    console.log(`${B}║${X}  Torneios:    ${String(stats.tournamentsScraped).padEnd(26)}${B}║${X}`);
    console.log(`${B}║${X}  Scorecards:  ${String(stats.totalScorecards).padEnd(26)}${B}║${X}`);
  }
  if (doPlayers) {
    console.log(`${B}║${X}  Jogadores:   ${String(stats.playersProcessed + " (" + stats.playersSkipped + " saltados)").padEnd(26)}${B}║${X}`);
    console.log(`${B}║${X}  SC novos:    ${String(stats.newScorecards).padEnd(26)}${B}║${X}`);
  }
  if (!skipSD) {
    console.log(`${B}║${X}  SD matched:  ${String(stats.sdMatched).padEnd(26)}${B}║${X}`);
  }
  console.log(`${B}║${X}  Tempo:       ${(mins + " min").padEnd(26)}${B}║${X}`);
  console.log(`${B}╚══════════════════════════════════════════╝${X}`);
}

// ── HTTP Server ──
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // GET /next-task — unified task dispatcher
  if (req.method === "GET" && req.url === "/next-task") {
    // Phase 1: Tournaments
    if (phase === "tournaments" && tournamentIdx < DRIVE_TOURNAMENTS.length) {
      const t = DRIVE_TOURNAMENTS[tournamentIdx];
      const info = classify(t.name, t.clube);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        phase: "tournament",
        index: tournamentIdx,
        total: DRIVE_TOURNAMENTS.length,
        tournament: { ...t, ...info }
      }));
      tournamentIdx++;
      return;
    }

    // Transition: tournaments done → players
    if (phase === "tournaments") {
      phase = doPlayers ? "players-init" : "done";
    }

    // Init players phase
    if (phase === "players-init") {
      playerFeds = resolvePlayerList();
      playerIdx = 0;
      phase = playerFeds.length > 0 ? "players" : "done";
      console.log(`\n${B}═══ Fase 2: Jogadores (${playerFeds.length}) ═══${X}`);
    }

    // Phase 2: Players
    if (phase === "players" && playerIdx < playerFeds.length) {
      const fed = playerFeds[playerIdx];
      const existing = forceFlag ? [] : getExistingScoreIds(fed);
      const oldWHS = getExistingWHSCount(fed);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        phase: "player",
        fed, index: playerIdx, total: playerFeds.length,
        existingScoreIds: existing, oldWHSCount: oldWHS,
        refresh: refreshFlag, force: forceFlag, qualifOnly, concurrency
      }));
      playerIdx++;
      return;
    }

    // Done
    if (phase === "players") phase = "done";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ phase: "done" }));
    return;
  }

  // POST /save-drive-data — save tournament data from browser
  if (req.method === "POST" && req.url === "/save-drive-data") {
    collectBody(req, (body) => {
      try {
        const data = JSON.parse(body);
        driveData = data;
        stats.tournamentsScraped = data.tournaments?.length || 0;
        stats.totalScorecards = data.totalScorecards || 0;

        // Save drive-data.json
        const outPath = path.join(process.cwd(), "public", "data", "drive-data.json");
        const outDir = path.dirname(outPath);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
        console.log(`  ${G}✓${X} drive-data.json: ${data.tournaments?.length || 0} torneios, ${data.totalScorecards || 0} SC`);

        // Collect feds
        driveFeds = new Set();
        for (const t of data.tournaments) {
          for (const p of t.players) {
            if (p.fed) driveFeds.add(p.fed);
          }
        }
        console.log(`  ${C}Jogadores únicos: ${driveFeds.size}${X}`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // POST /save-whs — save player WHS list
  if (req.method === "POST" && req.url?.startsWith("/save-whs")) {
    collectBody(req, (body) => {
      try {
        const { fed, data, count } = JSON.parse(body);
        const outDir = path.join(process.cwd(), "output", fed);
        fs.mkdirSync(outDir, { recursive: true });
        const records = data?.Records || [];
        for (const r of records) {
          if (!r.score_id && r.id) r.score_id = r.id;
          if (!r.id && r.score_id) r.id = r.score_id;
        }
        fs.writeFileSync(path.join(outDir, "whs-list.json"), JSON.stringify(data, null, 2), "utf-8");
        const oldCount = getExistingWHSCount(fed);
        const diff = count - oldCount;
        const tag = diff > 0 ? `${G}+${diff} novos${X}` : `${D}=${count}${X}`;
        process.stdout.write(`  ${G}✓${X} [${fed}] WHS: ${count} (${tag})\n`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // POST /save-scorecards-batch
  if (req.method === "POST" && req.url?.startsWith("/save-scorecards-batch")) {
    collectBody(req, (body) => {
      try {
        const { fed, scorecards } = JSON.parse(body);
        const dir = path.join(process.cwd(), "output", fed, "scorecards");
        fs.mkdirSync(dir, { recursive: true });
        let saved = 0;
        for (const [id, data] of Object.entries(scorecards)) {
          fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data, null, 2), "utf-8");
          saved++;
        }
        stats.newScorecards += saved;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, saved }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // POST /player-done
  if (req.method === "POST" && req.url?.startsWith("/player-done")) {
    collectBody(req, (body) => {
      try {
        const { fed, skipped, scOk, scFailed } = JSON.parse(body);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const pct = ((playerIdx / playerFeds.length) * 100).toFixed(0);
        if (skipped) {
          stats.playersSkipped++;
          process.stdout.write(`  ${D}[${playerIdx}/${playerFeds.length}] ${pct}% · ${elapsed}s · [${fed}] saltado${X}\n`);
        } else {
          stats.playersProcessed++;
          process.stdout.write(`  ${D}[${playerIdx}/${playerFeds.length}] ${pct}% · ${elapsed}s · [${fed}] SC: +${scOk || 0}, ${scFailed || 0} fail${X}\n`);
        }
      } catch {}
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // POST /all-done — browser signals completion
  if (req.method === "POST" && req.url === "/all-done") {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));

    // Phase 3: Build SD lookup
    buildSDLookup();

    // Final report
    printReport();

    // Run processing pipeline
    console.log(`\n${B}A processar dados...${X}`);
    try {
      const { execSync } = require("child_process");
      const processedFeds = playerFeds.length > 0 ? playerFeds.join(" ") : "";
      if (processedFeds) {
        execSync(`node golf-all.js --skip-download ${processedFeds}`, { stdio: "inherit", cwd: process.cwd(), maxBuffer: 50 * 1024 * 1024 });
      }
    } catch (e) { console.log(`${Y}⚠ Pipeline com erros (parcial)${X}`); }

    // Rebuild SD lookup after processing (now data.json files exist)
    if (!skipSD && playerFeds.length > 0) {
      console.log(`\n${B}Rebuild SD lookup (pós-processamento)...${X}`);
      sdLookup = {};
      buildSDLookup();
    }

    setTimeout(() => { server.close(); process.exit(0); }, 1000);
    return;
  }

  // GET /browser-script.js — serve the browser script
  if (req.method === "GET" && req.url === "/browser-script.js") {
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    res.end(BROWSER_SCRIPT);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

// ── Browser Script ──
const BROWSER_SCRIPT = `
(async () => {
  const SERVER = "http://localhost:${PORT}";
  const BATCH_SIZE = ${BATCH_SIZE};
  const DELAY = 300;
  const SC_DELAY = 150;

  const log = (m) => console.log("%c[DRIVE] " + m, "color:#16a34a;font-weight:bold");
  const logOk = (m) => console.log("%c[DRIVE] " + m, "color:green;font-weight:bold;font-size:13px");
  const logErr = (m) => console.log("%c[DRIVE] " + m, "color:red");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Detect which site we're on
  const isMy = location.host.includes("my.fpg");
  const isScoring = location.host.includes("scoring");

  const fpgPost = async (endpoint, params) => {
    const qs = Object.entries(params).map(([k,v]) => k + "=" + encodeURIComponent(v)).join("&");
    const url = endpoint + "?" + qs;
    const bodyObj = {};
    for (const [k,v] of Object.entries(params)) bodyObj[k] = String(v);

    if (isMy && window.jQuery) {
      return new Promise((resolve) => {
        window.jQuery.ajax({
          url, type: "POST", contentType: "application/json; charset=utf-8", dataType: "json",
          data: JSON.stringify(bodyObj),
          success: (data) => resolve({ ok: true, data: data?.d ?? data }),
          error: () => resolve({ ok: false })
        });
      });
    }
    return fetch(url, {
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest", "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(bodyObj)
    }).then(async (r) => {
      if (r.status !== 200) return { ok: false };
      const j = await r.json();
      return { ok: true, data: j?.d ?? j };
    }).catch(() => ({ ok: false }));
  };

  // Tournament scorecard fetch (via classif.aspx)
  const fetchScorecard = async (scoreId, ccode, tcode) => {
    const params = { score_id: scoreId, tclub: ccode, tcode: tcode, scoringtype: "1", classiftype: "I", classifround: "1", jtStartIndex: 0, jtPageSize: 10, jtSorting: "" };
    if (window.jQuery) {
      return new Promise((resolve) => {
        jQuery.ajax({
          url: "classif.aspx/ScoreCard", type: "POST", dataType: "json", contentType: "application/json; charset=utf-8",
          data: JSON.stringify(params),
          success: (json) => {
            const d = json.d || json;
            if (!d || d.Result !== "OK" || !d.Records?.length) { resolve(null); return; }
            const r = d.Records[0]; const nh = r.nholes || 18;
            const scores = [], par = [], si = [], meters = [];
            for (let h = 1; h <= nh; h++) { scores.push(r["gross_" + h] || 0); par.push(r["par_" + h] || 0); si.push(r["stroke_index_" + h] || 0); meters.push(r["meters_" + h] || 0); }
            resolve({ name: r.player_name || "", fed: r.federated_code || "", club: r.player_acronym || "", hcpExact: r.exact_hcp, hcpPlay: r.play_hcp, grossTotal: r.gross_total, parTotal: r.par_total, course: r.course_description || "", courseRating: r.course_rating, slope: r.slope, teeName: r.tee_name || "", nholes: nh, scores, par, si, meters });
          },
          error: () => resolve(null)
        });
      });
    }
    // fetch fallback
    const res = await fpgPost("/pt/classif.aspx/ScoreCard", params);
    if (!res.ok || !res.data?.Records?.length) return null;
    const r = res.data.Records[0]; const nh = r.nholes || 18;
    const scores = [], par = [], si = [], meters = [];
    for (let h = 1; h <= nh; h++) { scores.push(r["gross_" + h] || 0); par.push(r["par_" + h] || 0); si.push(r["stroke_index_" + h] || 0); meters.push(r["meters_" + h] || 0); }
    return { name: r.player_name || "", fed: r.federated_code || "", club: r.player_acronym || "", hcpExact: r.exact_hcp, hcpPlay: r.play_hcp, grossTotal: r.gross_total, parTotal: r.par_total, course: r.course_description || "", courseRating: r.course_rating, slope: r.slope, teeName: r.tee_name || "", nholes: nh, scores, par, si, meters };
  };

  log("DRIVE Pipeline — " + (isMy ? "my.fpg.pt" : "scoring.fpg.pt"));
  const t0 = Date.now();

  while (true) {
    let task;
    try { task = await (await fetch(SERVER + "/next-task")).json(); }
    catch (e) { logErr("Servidor não responde: " + e.message); break; }

    if (task.phase === "done") {
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      logOk("CONCLUÍDO em " + Math.round(secs / 60) + " min!");
      await fetch(SERVER + "/all-done", { method: "POST" });
      break;
    }

    // ═══ TOURNAMENT PHASE ═══
    if (task.phase === "tournament") {
      const t = task.tournament;
      log("[T " + (task.index + 1) + "/" + task.total + "] " + t.name);

      // Fetch classification
      const classifRes = await fpgPost("/pt/classif.aspx/ClassifLST", {
        Classi: "1", tclub: t.ccode, tcode: t.tcode,
        classiforder: "1", classiftype: "I", classifroundtype: "D",
        scoringtype: "1", round: "1", members: "0", playertypes: "0",
        gender: "0", minagemen: "0", maxagemen: "999",
        minageladies: "0", maxageladies: "999",
        minhcp: "-8", maxhcp: "99", idfilter: "-1",
        jtStartIndex: 0, jtPageSize: 200, jtSorting: "score_id DESC"
      });

      const classif = [];
      if (classifRes.ok && classifRes.data?.Result === "OK") {
        for (const r of (classifRes.data.Records || [])) {
          classif.push({ scoreId: String(r.score_id), pos: r.classif_pos, name: r.player_name || "", club: r.player_club_description || "" });
        }
      }
      log("  " + classif.length + " jogadores");

      // Fetch scorecards
      const players = [];
      for (let j = 0; j < classif.length; j++) {
        const c = classif[j];
        const sc = await fetchScorecard(c.scoreId, t.ccode, t.tcode);
        if (sc) {
          sc.scoreId = c.scoreId; sc.pos = c.pos;
          players.push(sc);
        } else {
          players.push({ scoreId: c.scoreId, pos: c.pos, name: c.name, club: c.club, grossTotal: 999, toPar: 0, scores: [] });
        }
        await sleep(SC_DELAY);
        if ((j + 1) % 10 === 0) log("  SC: " + (j + 1) + "/" + classif.length);
      }

      // Store tournament data locally, will be sent at end
      if (!window._driveData) window._driveData = [];
      window._driveData.push({
        name: t.name, ccode: t.ccode, tcode: t.tcode, date: t.date, campo: t.campo, clube: t.clube,
        series: t.series, region: t.region, escalao: t.escalao, num: t.num,
        playerCount: players.length, players: players
      });

      log("  ✔ " + players.filter(p => p.scores?.length > 0).length + "/" + players.length + " scorecards");
      await sleep(DELAY);

      // If last tournament, send all data to server
      if (task.index === task.total - 1) {
        const allData = window._driveData;
        const totalSC = allData.reduce((a, t) => a + t.players.filter(p => p.scores?.length > 0).length, 0);
        const output = {
          lastUpdated: new Date().toISOString().split("T")[0],
          source: "scoring.datagolf.pt",
          totalTournaments: allData.length,
          totalPlayers: allData.reduce((a, t) => a + t.players.length, 0),
          totalScorecards: totalSC,
          tournaments: allData
        };
        await fetch(SERVER + "/save-drive-data", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(output)
        });
        logOk("Torneios: " + allData.length + " | SC: " + totalSC);
      }
      continue;
    }

    // ═══ PLAYER PHASE ═══
    if (task.phase === "player") {
      const { fed, index, total, existingScoreIds, oldWHSCount, refresh, force, qualifOnly, concurrency } = task;
      const existingSet = new Set(existingScoreIds);
      const ppParams = isMy ? { pp: "N" } : {};

      log("[P " + (index + 1) + "/" + total + "] Federado " + fed);

      // WHS list
      const hcpRecords = [];
      let hcpIdx = 0, hcpOk = true;
      while (true) {
        const res = await fpgPost("PlayerWHS.aspx/HCPWhsFederLST", { fed_code: fed, ...ppParams, jtStartIndex: hcpIdx, jtPageSize: 100 });
        if (!res.ok || res.data?.Result !== "OK") { hcpOk = false; break; }
        const recs = res.data.Records || [];
        hcpRecords.push(...recs);
        if (recs.length < 100) break;
        hcpIdx += 100;
      }
      for (const r of hcpRecords) { if (!r.score_id && r.id) r.score_id = r.id; if (!r.id && r.score_id) r.id = r.score_id; }
      const hcpIdSet = new Set(hcpRecords.map(r => String(r.score_id || r.id)));

      let extraRecords = [];
      if (!qualifOnly) {
        let startIdx = 0;
        while (true) {
          const res = await fpgPost("PlayerResults.aspx/ResultsLST", { fed_code: fed, ...ppParams, jtStartIndex: startIdx, jtPageSize: 100 });
          if (!res.ok || res.data?.Result !== "OK") break;
          const recs = res.data.Records || [];
          for (const r of recs) { if (!r.score_id && r.id) r.score_id = r.id; if (!r.id && r.score_id) r.id = r.score_id; }
          extraRecords.push(...recs.filter(r => !hcpIdSet.has(String(r.score_id || r.id))));
          if (recs.length < 100) break;
          startIdx += 100;
        }
      }

      const allRecords = [...hcpRecords, ...extraRecords];
      if (!hcpOk || allRecords.length === 0) {
        log("[" + fed + "] WHS falhou, a saltar");
        await fetch(SERVER + "/player-done", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fed, skipped: true }) });
        continue;
      }

      // Refresh check
      if (refresh && !force && allRecords.length === oldWHSCount) {
        const newIds = allRecords.filter(r => !existingSet.has(String(r.score_id || r.id)) && r.score_origin_id !== 7);
        if (newIds.length === 0) {
          await fetch(SERVER + "/player-done", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fed, skipped: true }) });
          continue;
        }
      }

      await fetch(SERVER + "/save-whs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fed, data: { Result: "OK", Records: allRecords }, count: allRecords.length }) });

      // Scorecards
      const toFetch = allRecords.filter(r => {
        if (r.score_origin_id === 7) return false;
        if (qualifOnly && r.hcp_qualifying_round !== 1) return false;
        if (!force && existingSet.has(String(r.score_id || r.id))) return false;
        return true;
      });

      let scOk = 0, scFailed = 0;
      let batch = {}, batchCount = 0;
      const flush = async () => {
        if (batchCount === 0) return;
        try { await fetch(SERVER + "/save-scorecards-batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fed, scorecards: batch }) }); } catch {}
        batch = {}; batchCount = 0;
      };

      for (let i = 0; i < toFetch.length; i += concurrency) {
        const chunk = toFetch.slice(i, i + concurrency);
        const results = await Promise.allSettled(chunk.map(async (r) => {
          const sid = String(r.score_id || r.id);
          const res = await fpgPost("PlayerResults.aspx/ScoreCard", { score_id: sid, scoringtype: r.scoring_type_id, competitiontype: r.competition_type_id, ...ppParams });
          if (res.ok && res.data?.Result === "OK") return { id: sid, data: res.data };
          return null;
        }));
        for (const r of results) {
          if (r.status === "fulfilled" && r.value) { batch[r.value.id] = r.value.data; batchCount++; scOk++; if (batchCount >= BATCH_SIZE) await flush(); }
          else scFailed++;
        }
      }
      await flush();

      await fetch(SERVER + "/player-done", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fed, scOk, scFailed }) });
    }
  }
})();
`;

// ── Start ──
// Determine initial phase
if (doTournaments) {
  phase = "tournaments";
  console.log(`${B}═══ Fase 1: Torneios DRIVE (${DRIVE_TOURNAMENTS.length}) ═══${X}`);
} else if (doPlayers) {
  phase = "players-init";
} else {
  phase = "done";
}

server.listen(PORT, () => {
  const modeDesc = [];
  if (doTournaments) modeDesc.push("Torneios");
  if (doPlayers) {
    if (newPlayersFlag) modeDesc.push("Jogadores novos");
    else if (recommendedFlag) modeDesc.push("Jogadores recomendados");
    else if (allPlayersFlag) modeDesc.push("Todos os jogadores");
    else if (explicitFeds.length) modeDesc.push(`${explicitFeds.length} jogadores`);
  }

  console.log(`
${B}╔══════════════════════════════════════════════════════╗${X}
${B}║     FPG Bridge DRIVE — Pipeline Unificado            ║${X}
${B}╠══════════════════════════════════════════════════════╣${X}
${B}║${X}  Modo:        ${modeDesc.join(" + ").padEnd(38)}${B}║${X}
${B}║${X}  Torneios:    ${String(doTournaments ? DRIVE_TOURNAMENTS.length : "—").padEnd(38)}${B}║${X}
${B}║${X}  Refresh:     ${(forceFlag ? "Forçar tudo" : refreshFlag ? "Só novos" : "Normal").padEnd(38)}${B}║${X}
${B}║${X}  Paralelos:   ${String(concurrency).padEnd(38)}${B}║${X}
${B}║${X}  SD Lookup:   ${(skipSD ? "Não" : "Sim").padEnd(38)}${B}║${X}
${B}╠══════════════════════════════════════════════════════╣${X}
${B}║${X}  players.json: ${String(Object.keys(playersDB).length + " jogadores").padEnd(37)}${B}║${X}
${B}║${X}  drive-data:   ${String(existingDrive ? existingDrive.tournaments.length + " torneios" : "não existe").padEnd(37)}${B}║${X}
${B}╚══════════════════════════════════════════════════════╝${X}

${Y}No Firefox (em scoring.fpg.pt ou my.fpg.pt), cola na consola:${X}

  ${G}fetch("http://localhost:${PORT}/browser-script.js").then(r=>r.text()).then(eval)${X}
`);
});
