#!/usr/bin/env node
/**
 * fpg-drive-playwright.js — Fase 1 DRIVE totalmente automatizada
 *
 * Usa Playwright para abrir um browser headless real, obter sessão válida
 * de scoring.datagolf.pt, e descarregar todos os torneios DRIVE + scorecards.
 *
 * Não precisa de intervenção manual. Ideal para GitHub Actions.
 *
 * Uso:
 *   node fpg-drive-playwright.js
 *   node fpg-drive-playwright.js --year 2025
 *   node fpg-drive-playwright.js --force
 *   node fpg-drive-playwright.js --year 2025 --force
 *
 * Instalar dependência (uma vez):
 *   npm install playwright
 *   npx playwright install chromium
 */

const { chromium } = require("playwright");
const fs   = require("fs");
const path = require("path");

// ── Args ──
const args = process.argv.slice(2);
const forceFlag  = args.includes("--force");
const yi = args.indexOf("--year");
const filterYear = yi !== -1 ? parseInt(args[yi+1]) : new Date().getFullYear();

// ── Cores ──
const G="\x1b[32m",R="\x1b[31m",Y="\x1b[33m",C="\x1b[36m",B="\x1b[1m",D="\x1b[2m",X="\x1b[0m";

// ── Configuração ──
const DRIVE_CLUBS = {
  "982": "FPG_DM",
  "983": "FPG_DAT",
  "985": "FPG_DTejo",
  "987": "FPG_DNorte",
  "988": "FPG_DRIVE",
};

// URL de entrada pública que estabelece ccode=All na sessão
// Este URL específico é necessário para o servidor definir o contexto "todos os clubes"
const ENTRY_URL = "https://scoring.datagolf.pt/pt/1EntryPage.aspx?user=fpguser&dt=5450&page=tournlist&hash=53f11d30ef5b83b66479e5323ba9ac64f92cd0a7&ccode=All&pagelang=PT&callcontext=direct";

// Caminhos de output
const driveDataPath = path.join(process.cwd(), "public", "data", "drive-data.json");
const existingDrive = fs.existsSync(driveDataPath)
  ? JSON.parse(fs.readFileSync(driveDataPath, "utf-8"))
  : null;

function parseDate(val) {
  const m = String(val||"").match(/(\d+)/);
  if (!m) return "";
  return new Date(parseInt(m[1])).toISOString().split("T")[0];
}

function classifyTournament(name, clubCode) {
  const lc = name.toLowerCase();
  const club = DRIVE_CLUBS[clubCode] || "";
  const series = lc.includes("challenge") ? "challenge" : "tour";
  let region = "outro";
  if (club==="FPG_DM"     || lc.includes("madeira") || lc.includes("palheiro"))   region="madeira";
  else if (club==="FPG_DAT"    || lc.includes("acor") || lc.includes("terceira")) region="acores";
  else if (club==="FPG_DTejo"  || lc.includes("tejo") || lc.includes("montado"))  region="tejo";
  else if (club==="FPG_DNorte" || lc.includes("norte") || lc.includes("estela") || lc.includes("vale pis")) region="norte";
  else if (club==="FPG_DRIVE"  || lc.includes("sul") || lc.includes("laguna") || lc.includes("vila sol"))   region="sul";
  const em = lc.match(/sub[\s-]*(\d+)/);
  const escalao = em ? "Sub "+em[1] : null;
  const nm = name.match(/^(\d+)[ºª°]/);
  const num = nm ? parseInt(nm[1]) : null;
  return { series, region, escalao, num, clube: club };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const startTime = Date.now();

  console.log(`
\x1b[1m╔══════════════════════════════════════════════════════╗\x1b[0m
\x1b[1m║     FPG Drive Playwright — Fase 1 Automática         ║\x1b[0m
\x1b[1m╠══════════════════════════════════════════════════════╣\x1b[0m
\x1b[1m║\x1b[0m  Ano:      ${String(filterYear).padEnd(43)}\x1b[1m║\x1b[0m
\x1b[1m║\x1b[0m  Force:    ${(forceFlag?"sim":"não").padEnd(43)}\x1b[1m║\x1b[0m
\x1b[1m║\x1b[0m  Output:   ${driveDataPath.slice(-43).padEnd(43)}\x1b[1m║\x1b[0m
\x1b[1m╚══════════════════════════════════════════════════════╝\x1b[0m
`);

  const existingTcodes = new Set();
  if (existingDrive && !forceFlag) {
    for (const t of existingDrive.tournaments||[]) existingTcodes.add(t.tcode);
    console.log(`  \x1b[2mTorneios já processados: ${existingTcodes.size}\x1b[0m`);
  }

  // ── Lançar browser headless ──
  console.log(`\n  \x1b[36m▸ A lançar browser headless...\x1b[0m`);
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    locale: "pt-PT",
  });
  const page = await context.newPage();

  // ── Interceptar TournamentsLST antes de navegar ──
  console.log(`  \x1b[36m▸ A preparar intercepção de TournamentsLST...\x1b[0m`);
  let listData = null;
  let captureResolve;
  const capturePromise = new Promise(r => { captureResolve = r; });

  await page.route("**/TournamentsLST**", async (route) => {
    console.log(`  \x1b[2mInterceptado: ${route.request().url()}\x1b[0m`);
    const resp = await route.fetch();
    const text = await resp.text();
    try {
      const j = JSON.parse(text);
      listData = j?.d ?? j;
      console.log(`  \x1b[32m✓\x1b[0m TournamentsLST interceptado: ${listData?.Records?.length||0} registos`);
    } catch(e) {
      console.log(`  \x1b[33mTournamentsLST parse error: ${text.substring(0,100)}\x1b[0m`);
    }
    captureResolve();
    await route.fulfill({ response: resp, body: text });
  });

  // Navegar directamente para tournaments.aspx — sem EntryPage (hash expira)
  // O TournamentsLST devolve todos os torneios; filtramos por club_code do lado cliente
  console.log(`  \x1b[36m▸ A navegar para tournaments.aspx...\x1b[0m`);
  await page.goto("https://scoring.datagolf.pt/pt/tournaments.aspx", { waitUntil: "domcontentloaded", timeout: 30000 });
  const pgTitle = await page.title();
  console.log(`  \x1b[2mTítulo: ${pgTitle}\x1b[0m`);

  // Aguardar intercepção até 25s
  await Promise.race([capturePromise, new Promise(r => setTimeout(r, 25000))]);
  await page.unroute("**/TournamentsLST**");

  const ck = await context.cookies();
  const sess = ck.find(c => c.name === "ASP.NET_SessionId");
  console.log(`  \x1b[32m✓\x1b[0m Sessão: ${sess?.value?.substring(0,8)||"?"}...`);

  // ── Listar torneios DRIVE ──
  console.log(`\n  \x1b[36m▸ A listar torneios DRIVE ${filterYear}...\x1b[0m`);

  if (!listData?.Records) {
    console.log(`  \x1b[31m✗ TournamentsLST não interceptado — sem dados\x1b[0m`);
    await browser.close();
    process.exit(1);
  }

  console.log(`  \x1b[32m✓\x1b[0m Total recebido: ${listData.Records.length} torneios`);

  const yearStart = new Date(`${filterYear}-01-01`).getTime();
  const yearEnd   = new Date(`${filterYear+1}-01-01`).getTime();
  const driveCcodes = new Set(Object.keys(DRIVE_CLUBS));

  const allFound = listData.Records.filter(t => {
    if (!driveCcodes.has(String(t.club_code))) return false;
    const ts = parseInt(String(t.started_at||"").match(/(\d+)/)?.[1]||"0");
    return ts >= yearStart && ts < yearEnd;
  }).map(t => ({
    id: t.id, ccode: String(t.club_code), tcode: String(t.code),
    name: t.description, date: parseDate(t.started_at),
    campo: t.course_description, clube: DRIVE_CLUBS[String(t.club_code)],
    rounds: t.rounds||1
  }));

  for (const [cc, cn] of Object.entries(DRIVE_CLUBS)) {
    const n = allFound.filter(t => t.ccode===cc).length;
    if (n > 0) console.log(`  \x1b[32m✓\x1b[0m ${cn}: ${n} torneios`);
  }

  const newTournaments = forceFlag ? allFound : allFound.filter(t => !existingTcodes.has(t.tcode));
  console.log(`\n  \x1b[1mEncontrados: ${allFound.length} | Novos: ${newTournaments.length}\x1b[0m`);

  if (newTournaments.length === 0) {
    console.log(`  \x1b[33mNenhum torneio novo. Usa --force para re-processar.\x1b[0m`);
    await browser.close();
    process.exit(0);
  }

  // ── Helper POST via page.evaluate ──
  const post = async (url, body) => {
    return page.evaluate(async ({ url, body }) => {
      try {
        const r = await fetch(url, {
          method: "POST", credentials: "include",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/javascript, */*",
          },
          body: JSON.stringify(body),
        });
        const text = await r.text();
        if (!r.ok) return { ok: false, status: r.status, raw: text.substring(0, 200) };
        try { const j = JSON.parse(text); return { ok: true, data: j?.d ?? j }; }
        catch { return { ok: false, status: r.status, raw: text.substring(0, 200) }; }
      } catch(e) { return { ok: false, error: e.message }; }
    }, { url, body });
  };

  // ── Scorecards por torneio ──
  const processedTournaments = [];
  let totalScorecards = 0;

  for (let i = 0; i < newTournaments.length; i++) {
    const t = newTournaments[i];
    const info = classifyTournament(t.name, t.ccode);
    process.stdout.write(`  [${i+1}/${newTournaments.length}] \x1b[36m${t.name}\x1b[0m `);

    const classifRes = await post(
      "/pt/classif.aspx/ClassifLST?jtStartIndex=0&jtPageSize=200&jtSorting=",
      { Classi:"1", tclub:t.ccode, tcode:t.tcode,
        classiforder:"1", classiftype:"I", classifroundtype:"D",
        scoringtype:"1", round:"1", members:"0", playertypes:"0",
        gender:"0", minagemen:"0", maxagemen:"999",
        minageladies:"0", maxageladies:"999",
        minhcp:"-8", maxhcp:"99", idfilter:"-1",
        jtStartIndex:0, jtPageSize:200, jtSorting:"score_id DESC" }
    );

    const entries = (classifRes.ok && classifRes.data?.Result==="OK") ? (classifRes.data.Records||[]) : [];
    process.stdout.write(`${entries.length} jog `);

    const players = [];
    let scOk = 0;

    for (const c of entries) {
      const scRes = await post(
        "/pt/classif.aspx/ScoreCard?",
        { score_id: String(c.score_id), tclub: t.ccode, tcode: t.tcode,
          scoringtype:"1", classiftype:"I", classifround:"1",
          jtStartIndex:0, jtPageSize:10, jtSorting:"" }
      );

      if (scRes.ok && scRes.data?.Result==="OK" && scRes.data.Records?.length) {
        const r = scRes.data.Records[0];
        const nh = r.nholes||18;
        const scores=[],par=[],si=[],meters=[];
        for (let h=1; h<=nh; h++) {
          scores.push(r[`gross_${h}`]||0);
          par.push(r[`par_${h}`]||0);
          si.push(r[`stroke_index_${h}`]||0);
          meters.push(r[`meters_${h}`]||0);
        }
        players.push({
          scoreId:String(c.score_id), pos:c.classif_pos,
          name:r.player_name||"", fed:r.federated_code||"",
          club:r.player_acronym||"",
          hcpExact:r.exact_hcp, hcpPlay:r.play_hcp,
          grossTotal:r.gross_total, parTotal:r.par_total,
          course:r.course_description||"",
          courseRating:r.course_rating, slope:r.slope,
          teeName:r.tee_name||"", nholes:nh,
          scores, par, si, meters
        });
        scOk++;
      } else {
        players.push({ scoreId:String(c.score_id), pos:c.classif_pos,
          name:c.player_name||"", club:c.player_club_description||"",
          grossTotal:999, scores:[] });
      }
      await sleep(80);
    }

    console.log(`\x1b[32m✓\x1b[0m ${scOk} SC`);
    totalScorecards += scOk;
    processedTournaments.push({ ...t, ...info, playerCount:players.length, players });
    await sleep(200);
  }

  await browser.close();

  // ── Guardar ──
  const allProcessed = forceFlag
    ? processedTournaments
    : [...(existingDrive?.tournaments||[]), ...processedTournaments];
  allProcessed.sort((a,b) => (b.date||"").localeCompare(a.date||""));

  const output = {
    lastUpdated: new Date().toISOString().split("T")[0],
    source: "scoring.datagolf.pt", filterYear,
    totalTournaments: allProcessed.length,
    totalPlayers: allProcessed.reduce((s,t) => s+(t.players?.length||0), 0),
    totalScorecards: allProcessed.reduce((s,t) => s+(t.players?.filter(p=>p.scores?.length>0).length||0), 0),
    tournaments: allProcessed
  };

  const dir = path.dirname(driveDataPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(driveDataPath, JSON.stringify(output, null, 2));

  const elapsed = Math.ceil((Date.now()-startTime)/1000/60);
  console.log(`
\x1b[1m╔══════════════════════════════════════════╗\x1b[0m
\x1b[1m║     Concluído                            ║\x1b[0m
\x1b[1m╠══════════════════════════════════════════╣\x1b[0m
\x1b[1m║\x1b[0m  Torneios novos:  ${String(newTournaments.length).padEnd(24)}\x1b[1m║\x1b[0m
\x1b[1m║\x1b[0m  Scorecards:      ${String(totalScorecards).padEnd(24)}\x1b[1m║\x1b[0m
\x1b[1m║\x1b[0m  Total acumulado: ${String(allProcessed.length+" torneios").padEnd(24)}\x1b[1m║\x1b[0m
\x1b[1m║\x1b[0m  Tempo:           ${String(elapsed+" min").padEnd(24)}\x1b[1m║\x1b[0m
\x1b[1m╚══════════════════════════════════════════╝\x1b[0m`);
}
main().catch(e => {
  console.error(`${"\x1b[31m"}ERRO: ${e.message}${"\x1b[0m"}`);
  process.exit(1);
});
