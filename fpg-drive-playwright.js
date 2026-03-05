#!/usr/bin/env node
/**
 * fpg-drive-playwright.js
 * Recolhe torneios e classificações DRIVE via golf-portugal.pt/api
 *
 * Fluxo:
 *  1. Playwright visita golf-portugal.pt (público) e extrai sessão do localStorage
 *  2. Usa essa sessão como header para chamar golf-portugal.pt/api
 *  3. golf-portugal.pt faz proxy para scoring.datagolf.pt
 *
 * Uso:
 *   node fpg-drive-playwright.js
 *   node fpg-drive-playwright.js --year 2026
 *   node fpg-drive-playwright.js --force
 */

const { chromium } = require("playwright");
const https = require("https");
const fs    = require("fs");
const path  = require("path");

const BASE          = "https://golf-portugal.pt";
const driveDataPath = path.join(__dirname, "public", "data", "drive-data.json");

const args       = process.argv.slice(2);
const forceFlag  = args.includes("--force");
const yearArg    = args.find(a => /^\d{4}$/.test(a));
const filterYear = yearArg ? parseInt(yearArg) : new Date().getFullYear();

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m";
const C = "\x1b[36m", D = "\x1b[2m",  X = "\x1b[0m", B = "\x1b[1m";

const DRIVE_CLUBS = { "982": "Madeira", "983": "Acores", "985": "Tejo", "987": "Norte", "988": "Sul" };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function classifyTournament(name) {
  const lc = name.toLowerCase();
  const series = lc.includes("challenge") ? "challenge" : "tour";
  let region = "outro";
  if (lc.includes("madeira") || lc.includes("palheiro"))                        region = "madeira";
  else if (lc.includes("norte") || lc.includes("estela") || lc.includes("pis")) region = "norte";
  else if (lc.includes("tejo") || lc.includes("montado"))                       region = "tejo";
  else if (lc.includes("sul")  || lc.includes("laguna") || lc.includes("vila sol") || lc.includes("boavista") || lc.includes("benamor") || lc.includes("quinta")) region = "sul";
  else if (lc.includes("acor") || lc.includes("açor") || lc.includes("terceira")) region = "acores";
  const em = lc.match(/sub\s*(\d+)/i);
  const escalao = em ? "Sub " + em[1] : null;
  const nm = name.match(/(\d+)[º°]/);
  const num = nm ? parseInt(nm[1]) : null;
  return { series, region, escalao, num };
}

function parseDate(ts) {
  const m = String(ts || "").match(/(\d+)/);
  return m ? new Date(parseInt(m[1])).toISOString().split("T")[0] : null;
}

function apiGet(urlPath, sessionId, version) {
  return new Promise((resolve, reject) => {
    const url = BASE + urlPath;
    const opts = {
      headers: {
        "Content-Type": "application/json",
        "x-cookie-datagolf-session-id": sessionId,
        "x-cookie-datagolf-version": version,
      }
    };
    https.get(url, opts, res => {
      let data = "";
      res.on("data", d => data += d);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON error: ${data.substring(0, 100)}`)); }
      });
    }).on("error", reject);
  });
}

let existingDrive = null;
if (fs.existsSync(driveDataPath)) {
  try { existingDrive = JSON.parse(fs.readFileSync(driveDataPath, "utf8")); } catch {}
}

async function getSession() {
  console.log(`  ${C}▸ A obter sessão via golf-portugal.pt...${X}`);
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const ctx  = await browser.newContext({ locale: "pt-PT" });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/tournaments`, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Aguardar que o localStorage seja preenchido
  await page.waitForFunction(
    () => localStorage.getItem("session_provider_DATAGOLF") !== null,
    { timeout: 15000 }
  ).catch(() => {});

  const raw = await page.evaluate(() => localStorage.getItem("session_provider_DATAGOLF"));
  await browser.close();

  if (!raw) throw new Error("session_provider_DATAGOLF não encontrado no localStorage");

  const parsed = JSON.parse(raw);
  console.log(`  ${G}✓${X} Sessão obtida (expira em ${Math.round(parsed.ttl/60000)} min)`);
  return { sessionId: parsed.value, version: parsed.version };
}

async function main() {
  const startTime = Date.now();

  console.log(`\n${B}╔══════════════════════════════════════════════════════╗${X}`);
  console.log(`${B}║     FPG Drive Playwright — Fase 1 Automática         ║${X}`);
  console.log(`${B}╠══════════════════════════════════════════════════════╣${X}`);
  console.log(`${B}║${X}  Ano:      ${String(filterYear).padEnd(43)}${B}║${X}`);
  console.log(`${B}║${X}  Force:    ${(forceFlag?"sim":"não").padEnd(43)}${B}║${X}`);
  console.log(`${B}║${X}  Output:   ${driveDataPath.slice(-43).padEnd(43)}${B}║${X}`);
  console.log(`${B}╚══════════════════════════════════════════════════════╝${X}\n`);

  // Torneios já processados
  const existingMap = new Map();
  if (existingDrive && !forceFlag) {
    for (const t of existingDrive.tournaments || []) {
      existingMap.set(`${t.ccode}_${t.tcode}`, t);
    }
    console.log(`  ${D}Torneios já processados: ${existingMap.size}${X}`);
  }

  // Obter sessão
  const { sessionId, version } = await getSession();

  // Listar torneios de todos os clubes DRIVE
  console.log(`\n  ${C}▸ A listar torneios DRIVE ${filterYear}...${X}`);
  const yearStart = new Date(`${filterYear}-01-01`).getTime();
  const yearEnd   = new Date(`${filterYear + 1}-01-01`).getTime();

  const allFound = [];
  for (const [ccode, regionName] of Object.entries(DRIVE_CLUBS)) {
    try {
      const data = await apiGet(`/api/clubs/${ccode}/tournaments`, sessionId, version);
      const records = data?.Records || [];
      const filtered = records.filter(t => {
        const m = String(t.started_at || "").match(/(\d+)/);
        if (!m) return false;
        const ts = parseInt(m[1]);
        if (ts < yearStart || ts >= yearEnd) return false;
        return (t.description || "").toLowerCase().includes("drive");
      });
      console.log(`  ${D}${regionName} (${ccode}): ${filtered.length} torneios DRIVE${X}`);
      allFound.push(...filtered.map(t => ({ ...t, ccode })));
    } catch (e) {
      console.log(`  ${Y}${regionName} (${ccode}): erro — ${e.message}${X}`);
    }
    await sleep(150);
  }

  // Filtrar novos
  const targetTournaments = allFound.filter(t =>
    forceFlag || !existingMap.has(`${t.ccode}_${t.code}`)
  );

  console.log(`\n  ${B}Total encontrados: ${allFound.length} | A processar: ${targetTournaments.length}${X}`);

  if (targetTournaments.length === 0) {
    console.log(`  ${Y}Nenhum torneio novo. Usa --force para re-processar.${X}`);
    process.exit(0);
  }

  // Processar classificações
  const processedTournaments = [];

  for (let i = 0; i < targetTournaments.length; i++) {
    const t = targetTournaments[i];
    const info = classifyTournament(t.description);
    const date = parseDate(t.started_at);

    process.stdout.write(`  [${i+1}/${targetTournaments.length}] ${C}${t.description}${X}\n  `);

    try {
      const classif = await apiGet(
        `/api/clubs/${t.ccode}/tournaments/${t.id}/classification?rounds=1&scoringType=stroke-play&gender=all`,
        sessionId, version
      );

      const entries = Array.isArray(classif) ? classif : (classif?.Records || []);
      process.stdout.write(`${D}${entries.length} jog${X} `);

      const players = entries.map(c => ({
        scoreId:    String(c.score_id || ""),
        pos:        c.classif_pos,
        name:       c.player_name || "",
        club:       c.player_club_description || "",
        hcpExact:   c.exact_hcp,
        hcpPlay:    c.play_hcp,
        grossTotal: c.gross_total,
        toPar:      c.to_par_total,
        scores:     [],
      }));

      process.stdout.write(`${G}✓${X}\n`);

      processedTournaments.push({
        id:          t.id,
        tcode:       String(t.code),
        ccode:       String(t.ccode),
        name:        t.description,
        date,
        campo:       t.course_description || "",
        series:      info.series,
        region:      info.region,
        escalao:     info.escalao,
        num:         info.num,
        playerCount: players.length,
        players,
      });

    } catch (e) {
      process.stdout.write(`${R}erro: ${e.message}${X}\n`);
    }

    await sleep(150);
  }

  // Guardar
  const existingList = forceFlag ? [] : (existingDrive?.tournaments || []);
  const kept = existingList.filter(t =>
    !processedTournaments.some(p => p.ccode === t.ccode && p.tcode === t.tcode)
  );
  const allTournaments = [...kept, ...processedTournaments];
  allTournaments.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const output = {
    lastUpdated:      new Date().toISOString().split("T")[0],
    source:           "golf-portugal.pt → scoring.datagolf.pt",
    filterYear,
    totalTournaments: allTournaments.length,
    totalPlayers:     allTournaments.reduce((s, t) => s + (t.players?.length || 0), 0),
    totalScorecards:  0,
    tournaments:      allTournaments,
  };

  if (output.totalPlayers === 0 && (existingDrive?.totalPlayers || 0) > 0) {
    console.log(`\n  ${R}AVISO: 0 jogadores — a recusar gravação para proteger dados existentes${X}`);
    process.exit(1);
  }

  const dir = path.dirname(driveDataPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(driveDataPath, JSON.stringify(output, null, 2));

  const elapsed = Math.ceil((Date.now() - startTime) / 1000);
  console.log(`\n${B}╔══════════════════════════════════════════╗${X}`);
  console.log(`${B}║     Concluido ${G}OK${X}${B}                         ║${X}`);
  console.log(`${B}╠══════════════════════════════════════════╣${X}`);
  console.log(`${B}║${X}  Torneios novos:  ${String(processedTournaments.length).padEnd(24)}${B}║${X}`);
  console.log(`${B}║${X}  Total acumulado: ${String(allTournaments.length + " torneios").padEnd(24)}${B}║${X}`);
  console.log(`${B}║${X}  Jogadores:       ${String(output.totalPlayers).padEnd(24)}${B}║${X}`);
  console.log(`${B}║${X}  Tempo:           ${String(elapsed + "s").padEnd(24)}${B}║${X}`);
  console.log(`${B}╚══════════════════════════════════════════╝${X}`);
}

main().catch(e => {
  console.error(`${R}ERRO: ${e.message}${X}`);
  process.exit(1);
});
