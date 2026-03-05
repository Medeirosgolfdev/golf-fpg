#!/usr/bin/env node
/**
 * fpg-drive-playwright.js — abordagem correcta
 * Lista hardcoded + Classifications.aspx (sem TournamentsLST, sem EntryPage)
 *
 * Uso:
 *   node fpg-drive-playwright.js
 *   node fpg-drive-playwright.js --year 2026
 *   node fpg-drive-playwright.js --force
 */

const { chromium } = require("playwright");
const fs   = require("fs");
const path = require("path");

const BASE_URL      = "https://scoring.datagolf.pt";
const driveDataPath = path.join(__dirname, "public", "data", "drive-data.json");
const args       = process.argv.slice(2);
const forceFlag  = args.includes("--force");
const yearArg    = args.find(a => /^\d{4}$/.test(a));
const filterYear = yearArg ? parseInt(yearArg) : new Date().getFullYear();

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m";
const C = "\x1b[36m", D = "\x1b[2m",  X = "\x1b[0m", B = "\x1b[1m";

const DRIVE_TOURNAMENTS = [
  // 2026
  { name: "3º Torneio Drive Tour Norte - Vale Pisão",            ccode: "987", tcode: "10208", date: "2026-02-28", campo: "Vale Pisão" },
  { name: "2º Torneio Drive Tour Madeira - Santo da Serra",      ccode: "982", tcode: "10199", date: "2026-02-07", campo: "Santo da Serra" },
  { name: "2º Torneio Drive Tour Sul - Vila Sol",                ccode: "988", tcode: "10293", date: "2026-02-01", campo: "Vila Sol" },
  { name: "1º Torneio Drive Tour Sul - Laguna G.C.",             ccode: "988", tcode: "10292", date: "2026-01-11", campo: "Vilamoura - Laguna" },
  { name: "1º Torneio Drive Tour Tejo - Montado",                ccode: "985", tcode: "10202", date: "2026-01-04", campo: "Montado" },
  { name: "1º Torneio Drive Tour Norte - Estela GC",             ccode: "987", tcode: "10206", date: "2026-01-04", campo: "Estela" },
  { name: "1º Torneio Drive Tour Madeira - Palheiro Golf",       ccode: "982", tcode: "10198", date: "2026-01-03", campo: "Palheiro Golf" },
  { name: "2º Drive Challenge Acores-Terceira-Sub 18",           ccode: "983", tcode: "10154", date: "2026-02-28", campo: "Terceira" },
  { name: "2º Drive Challenge Acores-Terceira-Sub 16",           ccode: "983", tcode: "10153", date: "2026-02-28", campo: "Terceira" },
  { name: "2º Drive Challenge Acores-Terceira-Sub 14",           ccode: "983", tcode: "10152", date: "2026-02-28", campo: "Terceira" },
  { name: "2º Drive Challenge Acores-Terceira-Sub 12",           ccode: "983", tcode: "10151", date: "2026-02-28", campo: "Terceira" },
  { name: "2º Drive Challenge Acores-Terceira-Sub 10",           ccode: "983", tcode: "10150", date: "2026-02-28", campo: "Terceira" },
  { name: "2º Drive Challenge Tejo-Montado - Sub 18",            ccode: "985", tcode: "10215", date: "2026-02-22", campo: "Montado" },
  { name: "2º Drive Challenge Tejo-Montado - Sub 16",            ccode: "985", tcode: "10214", date: "2026-02-22", campo: "Montado" },
  { name: "2º Drive Challenge Tejo-Montado - Sub 14",            ccode: "985", tcode: "10213", date: "2026-02-22", campo: "Montado" },
  { name: "2º Drive Challenge Tejo-Montado - Sub 12",            ccode: "985", tcode: "10212", date: "2026-02-22", campo: "Montado" },
  { name: "2º Drive Challenge Tejo-Montado - Sub 10",            ccode: "985", tcode: "10211", date: "2026-02-22", campo: "Montado" },
  { name: "2º Drive Challenge Sul - Laguna Sub 18",              ccode: "988", tcode: "10297", date: "2026-02-21", campo: "Vilamoura - Laguna" },
  { name: "2º Drive Challenge Sul - Laguna Sub 16",              ccode: "988", tcode: "10300", date: "2026-02-21", campo: "Vilamoura - Laguna" },
  { name: "2º Drive Challenge Sul - Laguna Sub 14",              ccode: "988", tcode: "10296", date: "2026-02-21", campo: "Vilamoura - Laguna" },
  { name: "2º Drive Challenge Sul - Laguna Sub 12",              ccode: "988", tcode: "10295", date: "2026-02-21", campo: "Vilamoura - Laguna" },
  { name: "2º Drive Challenge Sul - Laguna Sub 10",              ccode: "988", tcode: "10294", date: "2026-02-21", campo: "Vilamoura - Laguna" },
  { name: "2º Drive Challenge Madeira-Sub18",                    ccode: "982", tcode: "10211", date: "2026-02-08", campo: "Santo da Serra" },
  { name: "2º Drive Challenge Madeira-Sub16",                    ccode: "982", tcode: "10210", date: "2026-02-08", campo: "Santo da Serra" },
  { name: "2º Drive Challenge Madeira-Sub14",                    ccode: "982", tcode: "10209", date: "2026-02-08", campo: "Santo da Serra" },
  { name: "2º Drive Challenge Madeira-Sub12",                    ccode: "982", tcode: "10208", date: "2026-02-08", campo: "Santo da Serra" },
  { name: "2º Drive Challenge Madeira-Sub10",                    ccode: "982", tcode: "10207", date: "2026-02-08", campo: "Santo da Serra" },
  { name: "1º Drive Challenge Acores-Terceira-Sub 18",           ccode: "983", tcode: "10149", date: "2026-01-24", campo: "Terceira" },
  { name: "1º Drive Challenge Acores-Terceira-Sub 16",           ccode: "983", tcode: "10148", date: "2026-01-24", campo: "Terceira" },
  { name: "1º Drive Challenge Acores-Terceira-Sub 14",           ccode: "983", tcode: "10147", date: "2026-01-24", campo: "Terceira" },
  { name: "1º Drive Challenge Acores-Terceira-Sub 12",           ccode: "983", tcode: "10146", date: "2026-01-24", campo: "Terceira" },
  { name: "1º Drive Challenge Acores-Terceira-Sub 10",           ccode: "983", tcode: "10145", date: "2026-01-24", campo: "Terceira" },
  { name: "1º Drive Challenge Madeira-Palheiro-Sub 18",          ccode: "982", tcode: "10205", date: "2026-01-04", campo: "Palheiro Golf" },
  { name: "1º Drive Challenge Madeira-Palheiro-Sub 16",          ccode: "982", tcode: "10206", date: "2026-01-04", campo: "Palheiro Golf" },
  { name: "1º Drive Challenge Madeira-Palheiro-Sub 14",          ccode: "982", tcode: "10204", date: "2026-01-04", campo: "Palheiro Golf" },
  { name: "1º Drive Challenge Madeira-Palheiro-Sub 12",          ccode: "982", tcode: "10203", date: "2026-01-04", campo: "Palheiro Golf" },
  { name: "1º Drive Challenge Madeira-Palheiro-Sub 10",          ccode: "982", tcode: "10202", date: "2026-01-04", campo: "Palheiro Golf" },
  // 2025 — adicionar aqui os torneios de 2025
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function classifyTournament(name) {
  const lc = name.toLowerCase();
  const series = lc.includes("challenge") ? "challenge" : "tour";
  let region = "outro";
  if (lc.includes("madeira") || lc.includes("palheiro"))           region = "madeira";
  else if (lc.includes("norte") || lc.includes("estela") || lc.includes("pisao")) region = "norte";
  else if (lc.includes("tejo") || lc.includes("montado"))          region = "tejo";
  else if (lc.includes("sul") || lc.includes("laguna") || lc.includes("vila sol")) region = "sul";
  else if (lc.includes("acor") || lc.includes("terceira"))         region = "acores";
  const em = lc.match(/sub\s*(\d+)/);
  const escalao = em ? "Sub " + em[1] : null;
  const nm = name.match(/(\d+)[º°]/);
  const num = nm ? parseInt(nm[1]) : null;
  return { series, region, escalao, num };
}

let existingDrive = null;
if (fs.existsSync(driveDataPath)) {
  try { existingDrive = JSON.parse(fs.readFileSync(driveDataPath, "utf8")); } catch {}
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

  // Filtrar por ano e novos
  const targetTournaments = DRIVE_TOURNAMENTS.filter(t => {
    if (!t.date.startsWith(String(filterYear))) return false;
    if (!forceFlag && existingMap.has(`${t.ccode}_${t.tcode}`)) return false;
    return true;
  });

  console.log(`  ${B}Torneios a processar: ${targetTournaments.length}${X}`);

  if (targetTournaments.length === 0) {
    console.log(`  ${Y}Nenhum torneio novo para ${filterYear}. Usa --force para re-processar.${X}`);
    process.exit(0);
  }

  // Lançar browser
  console.log(`\n  ${C}▸ A lançar browser headless...${X}`);
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    locale: "pt-PT",
  });
  const page = await context.newPage();

  // Navegar para o primeiro torneio (estabelece sessão sem precisar de EntryPage)
  const firstT = targetTournaments[0];
  const initUrl = `${BASE_URL}/pt/Classifications.aspx?ccode=${firstT.ccode}&tcode=${firstT.tcode}`;
  console.log(`  ${C}▸ A estabelecer sessão via Classifications.aspx...${X}`);
  await page.goto(initUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  const initTitle = await page.title();
  console.log(`  ${D}Título: ${initTitle}${X}`);

  const ck = await context.cookies();
  const sess = ck.find(c => c.name === "ASP.NET_SessionId");
  console.log(`  ${G}✓${X} Sessão: ${sess?.value?.substring(0,8)||"anónima"}...\n`);

  // Helper POST
  const post = async (url, body) => {
    return page.evaluate(async ({ url, body }) => {
      try {
        const r = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/javascript, */*",
          },
          body: JSON.stringify(body),
        });
        const text = await r.text();
        if (!r.ok) return { ok: false, status: r.status, raw: text.substring(0, 200) };
        try {
          const j = JSON.parse(text);
          return { ok: true, data: j?.d ?? j };
        } catch {
          return { ok: false, status: r.status, raw: text.substring(0, 200) };
        }
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }, { url, body });
  };

  // Processar torneios
  const processedTournaments = [];
  let totalScorecards = 0;

  for (let i = 0; i < targetTournaments.length; i++) {
    const t = targetTournaments[i];
    const info = classifyTournament(t.name);

    process.stdout.write(`  [${i+1}/${targetTournaments.length}] ${C}${t.name}${X}\n  `);

    // Navegar para a página do torneio
    const tournUrl = `${BASE_URL}/pt/Classifications.aspx?ccode=${t.ccode}&tcode=${t.tcode}`;
    await page.goto(tournUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // ClassifLST
    const classifRes = await post(
      `${BASE_URL}/pt/classif.aspx/ClassifLST?jtStartIndex=0&jtPageSize=200&jtSorting=`,
      {
        Classi: "1", tclub: t.ccode, tcode: t.tcode,
        classiforder: "1", classiftype: "I", classifroundtype: "D",
        scoringtype: "1", round: "1", members: "0", playertypes: "0",
        gender: "0", minagemen: "0", maxagemen: "999",
        minageladies: "0", maxageladies: "999",
        minhcp: "-8", maxhcp: "99", idfilter: "-1",
        jtStartIndex: 0, jtPageSize: 200, jtSorting: "score_id DESC"
      }
    );

    const entries = (classifRes.ok && classifRes.data?.Result === "OK")
      ? (classifRes.data.Records || [])
      : [];

    if (!classifRes.ok) {
      process.stdout.write(`${Y}ClassifLST erro: ${classifRes.raw||classifRes.error}${X}\n  `);
    } else {
      process.stdout.write(`${D}${entries.length} jog${X} `);
    }

    // ScoreCards
    const players = [];
    let scOk = 0;

    for (const c of entries) {
      const scRes = await post(
        `${BASE_URL}/pt/classif.aspx/ScoreCard?score_id=${c.score_id}&tclub=${t.ccode}&tcode=${t.tcode}&scoringtype=1&classiftype=I&classifround=1`,
        { jtStartIndex: 0, jtPageSize: 10, jtSorting: "" }
      );

      if (scRes.ok && scRes.data?.Result === "OK" && scRes.data.Records?.length) {
        const r = scRes.data.Records[0];
        const nh = r.nholes || 18;
        const scores = [], par = [], si = [], meters = [];
        for (let h = 1; h <= nh; h++) {
          scores.push(r[`gross_${h}`] || 0);
          par.push(r[`par_${h}`] || 0);
          si.push(r[`stroke_index_${h}`] || 0);
          meters.push(r[`meters_${h}`] || 0);
        }
        players.push({
          scoreId: String(c.score_id), pos: c.classif_pos,
          name: r.player_name || "", fed: r.federated_code || "",
          club: r.player_acronym || "",
          hcpExact: r.exact_hcp, hcpPlay: r.play_hcp,
          grossTotal: r.gross_total, parTotal: r.par_total,
          course: r.course_description || "",
          courseRating: r.course_rating, slope: r.slope,
          teeName: r.tee_name || "", nholes: nh,
          scores, par, si, meters,
        });
        scOk++;
      } else {
        players.push({
          scoreId: String(c.score_id), pos: c.classif_pos,
          name: c.player_name || "", club: c.player_club_description || "",
          grossTotal: 999, scores: [],
        });
      }
      await sleep(80);
    }

    process.stdout.write(`${G}✓${X} ${scOk}/${entries.length} SC\n`);
    totalScorecards += scOk;

    processedTournaments.push({
      tcode: t.tcode, ccode: t.ccode,
      name: t.name, date: t.date, campo: t.campo,
      series: info.series, region: info.region,
      escalao: info.escalao, num: info.num,
      playerCount: players.length, players,
    });

    await sleep(300);
  }

  await browser.close();

  // Guardar
  const existingList = forceFlag ? [] : (existingDrive?.tournaments || []);
  const kept = existingList.filter(t =>
    !processedTournaments.some(p => p.ccode === t.ccode && p.tcode === t.tcode)
  );
  const allTournaments = [...kept, ...processedTournaments];
  allTournaments.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const output = {
    lastUpdated:      new Date().toISOString().split("T")[0],
    source:           "scoring.datagolf.pt",
    filterYear,
    totalTournaments: allTournaments.length,
    totalPlayers:     allTournaments.reduce((s, t) => s + (t.players?.length || 0), 0),
    totalScorecards:  allTournaments.reduce((s, t) => s + (t.players?.filter(p => p.scores?.length > 0).length || 0), 0),
    tournaments:      allTournaments,
  };

  if (output.totalPlayers === 0 && (existingDrive?.totalPlayers || 0) > 0) {
    console.log(`\n  ${R}AVISO: 0 jogadores — a recusar gravação para proteger dados existentes${X}`);
    process.exit(1);
  }

  const dir = path.dirname(driveDataPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(driveDataPath, JSON.stringify(output, null, 2));

  const elapsed = Math.ceil((Date.now() - startTime) / 1000 / 60);
  console.log(`\n${B}╔══════════════════════════════════════════╗${X}`);
  console.log(`${B}║     Concluido ${G}OK${X}${B}                         ║${X}`);
  console.log(`${B}╠══════════════════════════════════════════╣${X}`);
  console.log(`${B}║${X}  Torneios novos:  ${String(processedTournaments.length).padEnd(24)}${B}║${X}`);
  console.log(`${B}║${X}  Scorecards:      ${String(totalScorecards).padEnd(24)}${B}║${X}`);
  console.log(`${B}║${X}  Total acumulado: ${String(allTournaments.length + " torneios").padEnd(24)}${B}║${X}`);
  console.log(`${B}║${X}  Tempo:           ${String(elapsed + " min").padEnd(24)}${B}║${X}`);
  console.log(`${B}╚══════════════════════════════════════════╝${X}`);
}

main().catch(e => {
  console.error(`${R}ERRO: ${e.message}${X}`);
  process.exit(1);
});
