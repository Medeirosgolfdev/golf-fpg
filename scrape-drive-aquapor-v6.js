#!/usr/bin/env node
// ============================================================
// scrape-drive-aquapor-v6.js — Node.js (com Playwright)
// ============================================================
// Versão Node.js do script de browser.
// Usa Playwright para obter os cookies de scoring.datagolf.pt
// e depois chama as mesmas APIs directamente.
//
// Uso:
//   node scrape-drive-aquapor-v6.js
//   node scrape-drive-aquapor-v6.js --year 2025
//
// Requisitos:
//   npm install playwright
//   npx playwright install chromium
// ============================================================

const { chromium } = require("playwright");
const fs   = require("fs");
const path = require("path");

const BASE_URL   = "https://scoring.datagolf.pt/pt/";
const YEAR       = (() => {
  const a = process.argv.find(x => /^\d{4}$/.test(x));
  return a ? parseInt(a) : new Date().getFullYear();
})();
const DELAY      = 150;
const OUTPUT_DIR = path.join(__dirname, "public", "data");

// Cores ANSI para Node.js (em vez de %c do browser)
const BLU  = "\x1b[34m";
const GRN  = "\x1b[32m";
const YLW  = "\x1b[33m";
const PRP  = "\x1b[35m";
const DIM  = "\x1b[2m";
const BLD  = "\x1b[1m";
const RST  = "\x1b[0m";

const log  = m => console.log(`${BLU}[v6]${RST} ${m}`);
const ok   = m => console.log(`${GRN}[v6] ✓${RST} ${m}`);
const warn = m => console.log(`${YLW}[v6] ⚠${RST} ${m}`);
const info = m => console.log(`${DIM}[v6]   ${m}${RST}`);

const regionMap = {
  "982": "madeira", "983": "acores", "985": "tejo",
  "987": "norte",   "988": "sul",    "000": "nacional",
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════
// Obter cookies de scoring.datagolf.pt via Playwright
// ═══════════════════════════════════════════════════════════
async function getDatagolfCookies() {
  console.log(`\n${BLD}╔════════════════════════════════════════╗${RST}`);
  console.log(`${BLD}║  A obter sessão scoring.datagolf.pt    ║${RST}`);
  console.log(`${BLD}╚════════════════════════════════════════╝${RST}\n`);
  log("A lançar browser...");

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const ctx  = await browser.newContext({ locale: "pt-PT" });
  const page = await ctx.newPage();

  // Visitar a página de torneios — esperar até a rede estabilizar
  log("A visitar scoring.datagolf.pt/pt/tournaments.aspx...");
  await page.goto(`${BASE_URL}tournaments.aspx`, {
    waitUntil: "networkidle",
    timeout: 30000,
  }).catch(() => {});

  // Aguardar um pouco para o JS carregar sessão
  await sleep(2000);

  const cookies = await ctx.cookies(BASE_URL);
  await browser.close();

  if (!cookies.length) {
    warn("Nenhum cookie obtido — os pedidos podem falhar por autenticação");
  } else {
    ok(`${cookies.length} cookies obtidos de scoring.datagolf.pt`);
  }

  return cookies.map(c => `${c.name}=${c.value}`).join("; ");
}

// ═══════════════════════════════════════════════════════════
// Funções de API — usam BASE_URL + cookies
// ═══════════════════════════════════════════════════════════
let _cookieHeader = "";

async function apiPost(endpoint, qs, body) {
  const url = BASE_URL + endpoint + "?" + qs;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest",
      ...((_cookieHeader) ? { "Cookie": _cookieHeader } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " para " + url);
  return res.json();
}

async function tournSearch(TournName, startIndex) {
  const body = {
    ClubCode: "0", dtIni: "", dtFim: "",
    CourseName: "", TournCode: "",
    TournName: TournName || "",
    jtStartIndex: String(startIndex || 0),
    jtPageSize: "50",
    jtSorting: "started_at DESC",
  };
  const qs = "jtStartIndex=" + (startIndex||0) + "&jtPageSize=50&jtSorting=" + encodeURIComponent("started_at DESC");
  const json = await apiPost("tournaments.aspx/TournamentsLST", qs, body);
  const d = json.d || json;
  return { records: d.Records || [], total: d.TotalRecordCount || 0 };
}

async function tournSearchAll(TournName) {
  const first = await tournSearch(TournName, 0);
  const all = [...first.records];
  const pages = Math.ceil(first.total / 50);
  info(TournName + ": " + first.total + " total (" + pages + " páginas)");
  let offset = 50;
  while (offset < first.total) {
    await sleep(DELAY);
    const page = await tournSearch(TournName, offset);
    all.push(...page.records);
    if (pages > 5 && (offset / 50) % 10 === 0) info("  pág " + (offset/50+1) + "/" + pages);
    offset += 50;
  }
  return all;
}

const is2026 = r => {
  const ms = parseInt((r.started_at || "").match(/\d+/)?.[0] || "0");
  return new Date(ms).getFullYear() === YEAR;
};

async function fetchClassif(tclub, tcode) {
  const allRecords = [];
  let startIndex = 0;
  const pageSize = 150;

  while (true) {
    const body = {
      Classi: "1",
      tclub: String(tclub),
      tcode: String(tcode),
      classiforder: "1",
      classiftype: "I",
      classifroundtype: "D",
      scoringtype: "1",
      round: "1",
      members: "0",
      playertypes: "0",
      gender: "0",
      minagemen: "0",
      maxagemen: "999",
      minageladies: "0",
      maxageladies: "999",
      minhcp: "-8",
      maxhcp: "99",
      idfilter: "-1",
      jtStartIndex: String(startIndex),
      jtPageSize: String(pageSize),
      jtSorting: "score_id DESC",
    };
    const qs = "jtStartIndex=" + startIndex + "&jtPageSize=" + pageSize + "&jtSorting=" + encodeURIComponent("score_id DESC");

    try {
      const json = await apiPost("classif.aspx/ClassifLST", qs, body);
      const d = json.d || json;
      if (d.Result !== "OK") return { records: allRecords, error: "Result=" + d.Result };
      const recs = d.Records || [];
      allRecords.push(...recs);
      if (recs.length < pageSize) break;
      startIndex += pageSize;
      await sleep(DELAY);
    } catch (e) {
      return { records: allRecords, error: e.message };
    }
  }
  return { records: allRecords, error: null };
}

async function fetchScorecard(scoreId, tclub, tcode, round) {
  const qs = "score_id=" + scoreId + "&tclub=" + tclub + "&tcode=" + tcode +
             "&scoringtype=1&classiftype=I&classifround=" + round;
  const body = {
    score_id: String(scoreId),
    tclub: String(tclub),
    tcode: String(tcode),
    scoringtype: "1",
    classiftype: "I",
    classifround: String(round),
  };
  try {
    const json = await apiPost("classif.aspx/ScoreCard", qs, body);
    const d = json.d || json;
    if (d.Result === "OK" && d.Records && d.Records.length > 0) return d.Records[0];
    return null;
  } catch {
    return null;
  }
}

function extractHoleData(rec) {
  const n = rec.nholes || 18;
  const scores = [], pars = [], si = [], meters = [];
  for (let h = 1; h <= n; h++) {
    scores.push(rec["gross_" + h] != null ? Number(rec["gross_" + h]) : 0);
    pars.push(rec["par_" + h]  != null ? Number(rec["par_" + h])  : 0);
    si.push(rec["stroke_index_" + h] != null ? Number(rec["stroke_index_" + h]) : 0);
    meters.push(rec["meters_" + h] != null ? Number(rec["meters_" + h]) : 0);
  }
  return { scores, pars, si, meters };
}

function parseTournament(raw, circuit) {
  const desc   = raw.description || "";
  const cc     = raw.club_code || "";
  const tc     = raw.code || "";
  const dateMs = parseInt((raw.started_at || "").match(/\d+/)?.[0] || "0");
  const dateStr = new Date(dateMs).toISOString().split("T")[0];

  let series = circuit === "aquapor" ? "aquapor" : "tour";
  if (/challenge/i.test(desc)) series = "challenge";

  let escalao = null;
  const escMatch = desc.match(/Sub\s*(\d+)/i);
  if (escMatch) escalao = "Sub " + escMatch[1];

  let num = 1;
  const numMatch = desc.match(/(\d+)º/);
  if (numMatch) num = parseInt(numMatch[1]);

  return {
    name: desc, ccode: cc, tcode: tc, date: dateStr,
    campo: raw.course_description || "",
    clube: cc, series,
    region: regionMap[cc] || "outro",
    escalao, num,
    rounds: raw.rounds || 1,
    playerCount: 0, players: [],
  };
}

function mapPlayer(r) {
  const pos     = r.classif_pos;
  const grossStr = r.gross_total;
  const toParStr = r.to_par_total;
  const isNS    = pos === "NS" || grossStr === "NS" || r.score_status_id === 99;

  let grossNum = null;
  if (grossStr && !["NS","NR","DQ"].includes(grossStr)) {
    grossNum = parseInt(grossStr);
    if (isNaN(grossNum)) grossNum = null;
  }

  let toParNum = null;
  if (toParStr && !["NS","NR","DQ","PAR"].includes(toParStr)) {
    toParNum = parseInt(String(toParStr).replace("+", ""));
    if (isNaN(toParNum)) toParNum = null;
  }
  if (toParStr === "PAR") toParNum = 0;

  return {
    scoreId: String(r.score_id || ""),
    pos: isNS ? "NS" : (isNaN(Number(pos)) ? pos : Number(pos)),
    name: (r.player_name || "").trim(),
    club: (r.player_club_description || "").trim(),
    grossTotal: isNS ? 999 : grossNum,
    toPar: isNS ? null : toParNum,
    hcpExact: r.exact_hcp != null ? Number(r.exact_hcp) : undefined,
    hcpPlay:  r.play_hcp  != null ? Number(r.play_hcp)  : undefined,
    fedCode: null, courseRating: null, slope: null,
    teeName: null, teeColorId: null,
    parTotal: null, nholes: null, course: null,
    roundScores: [],
  };
}

function buildOutput(tournaments, circuit) {
  let tp = 0, ts = 0;
  for (const t of tournaments) {
    tp += t.playerCount;
    for (const p of t.players) ts += p.roundScores.length;
  }
  tournaments.sort((a, b) => a.date.localeCompare(b.date));

  const now = new Date();
  const lastUpdated = String(now.getDate()).padStart(2,"0") + "/" +
    String(now.getMonth()+1).padStart(2,"0") + "/" + now.getFullYear();

  return {
    lastUpdated, source: "scoring.datagolf.pt", circuit,
    totalTournaments: tournaments.length,
    totalPlayers: tp, totalScorecards: ts,
    tournaments,
  };
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════
(async () => {
  const t0 = Date.now();

  // Obter cookies via Playwright
  _cookieHeader = await getDatagolfCookies();

  // ── FASE 1: Descobrir torneios ──
  log("═══ FASE 1: Descobrir torneios " + YEAR + " ═══");

  log("  Buscar torneios DRIVE...");
  const driveAll = await tournSearchAll("drive");
  const drive = driveAll.filter(is2026).filter(r => (r.acronym || "").startsWith("FPG_D"));
  ok("DRIVE " + YEAR + ": " + drive.length + " torneios (de " + driveAll.length + " total)");
  drive.forEach(r => info(r.club_code + "/" + r.code + " " + r.description));

  log("  Buscar torneios AQUAPOR...");
  const aquaporAll = await tournSearchAll("aquapor");
  const aquapor = aquaporAll.filter(is2026);
  ok("AQUAPOR " + YEAR + ": " + aquapor.length + " torneios (de " + aquaporAll.length + " total)");
  aquapor.forEach(r => info(r.club_code + "/" + r.code + " " + r.description));

  // ── FASE 2: Classificações + Scorecards ──
  log("");
  log("═══ FASE 2: Classificações + Scorecards ═══");

  const allTourns = [
    ...drive.map(r  => ({ raw: r, circuit: "drive"   })),
    ...aquapor.map(r => ({ raw: r, circuit: "aquapor" })),
  ];

  const driveTournaments   = [];
  const aquaporTournaments = [];
  let totalPlayers    = 0;
  let totalScorecards = 0;
  let classifErrors   = 0;

  for (let i = 0; i < allTourns.length; i++) {
    const { raw, circuit } = allTourns[i];
    const t = parseTournament(raw, circuit);
    const label = "[" + (i+1) + "/" + allTourns.length + "] " + t.ccode + "/" + t.tcode;

    // Classificação
    const { records, error } = await fetchClassif(t.ccode, t.tcode);

    if (error) {
      warn(label + " " + t.name + " → ERRO: " + error);
      classifErrors++;
      (circuit === "aquapor" ? aquaporTournaments : driveTournaments).push(t);
      await sleep(DELAY);
      continue;
    }

    if (records.length === 0) {
      info(label + " " + t.name + " → 0 jogadores (futuro?)");
      (circuit === "aquapor" ? aquaporTournaments : driveTournaments).push(t);
      await sleep(DELAY);
      continue;
    }

    t.players     = records.map(mapPlayer);
    t.playerCount = t.players.length;
    totalPlayers += t.playerCount;
    ok(label + " " + t.name + " → " + t.playerCount + " jogadores");

    // Scorecards
    const nRounds = t.rounds || 1;
    let scOk = 0, scFail = 0, scSkip = 0;

    for (let pi = 0; pi < t.players.length; pi++) {
      const p = t.players[pi];

      if (["NS","DQ","WD"].includes(p.pos) || !p.scoreId || p.scoreId === "0") {
        scSkip++;
        continue;
      }

      for (let rd = 1; rd <= nRounds; rd++) {
        const sc = await fetchScorecard(p.scoreId, t.ccode, t.tcode, rd);
        if (sc) {
          if (!p.fedCode && sc.federated_code) {
            p.fedCode     = sc.federated_code;
            p.courseRating = sc.course_rating;
            p.slope       = sc.slope;
            p.teeName     = sc.tee_name;
            p.teeColorId  = sc.tee_color_id;
            p.parTotal    = sc.par_total;
            p.nholes      = sc.nholes;
            p.course      = sc.course_description;
          }
          const hd = extractHoleData(sc);
          p.roundScores.push({
            round: rd,
            gross: sc.gross_total,
            scores: hd.scores,
            pars: hd.pars,
            si: hd.si,
            meters: hd.meters,
            courseRating: sc.course_rating,
            slope: sc.slope,
            teeName: sc.tee_name,
            teeColorId: sc.tee_color_id,
          });
          scOk++;
          totalScorecards++;
        } else {
          scFail++;
        }
        await sleep(DELAY);
      }

      if ((pi + 1) % 25 === 0) {
        info("  scorecards: " + (pi+1) + "/" + t.players.length + " (" + scOk + " ok, " + scFail + " falhas)");
      }
    }

    if (scOk > 0) info("  → " + scOk + " scorecards (" + scFail + " falhas, " + scSkip + " NS)");

    (circuit === "aquapor" ? aquaporTournaments : driveTournaments).push(t);
    await sleep(DELAY);
  }

  // ── FASE 3: Gravar ──
  log("");
  log("═══ FASE 3: Gravar ═══");

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const driveData   = buildOutput(driveTournaments,   "drive");
  const aquaporData = buildOutput(aquaporTournaments, "aquapor");

  const drivePath   = path.join(OUTPUT_DIR, "drive-data.json");
  const aquaporPath = path.join(OUTPUT_DIR, "aquapor-data.json");

  fs.writeFileSync(drivePath,   JSON.stringify(driveData,   null, 2));
  fs.writeFileSync(aquaporPath, JSON.stringify(aquaporData, null, 2));

  const elapsed = Math.ceil((Date.now() - t0) / 1000);

  console.log(`\n${BLD}╔══════════════════════════════════════════╗${RST}`);
  console.log(`${BLD}║     ${GRN}CONCLUÍDO!${RST}${BLD}                          ║${RST}`);
  console.log(`${BLD}╠══════════════════════════════════════════╣${RST}`);
  console.log(`${BLD}║${RST}  DRIVE:   ${String(driveData.totalTournaments + " torneios").padEnd(14)} ${String(driveData.totalPlayers + " jog").padEnd(10)} ${driveData.totalScorecards + " sc"}  ${BLD}║${RST}`);
  console.log(`${BLD}║${RST}  AQUAPOR: ${String(aquaporData.totalTournaments + " torneios").padEnd(14)} ${String(aquaporData.totalPlayers + " jog").padEnd(10)} ${aquaporData.totalScorecards + " sc"}  ${BLD}║${RST}`);
  if (classifErrors > 0) console.log(`${BLD}║${RST}  ${YLW}Erros de classificação: ${classifErrors}${RST}            ${BLD}║${RST}`);
  console.log(`${BLD}║${RST}  Tempo: ${elapsed}s                              ${BLD}║${RST}`);
  console.log(`${BLD}╠══════════════════════════════════════════╣${RST}`);
  console.log(`${BLD}║${RST}  → ${drivePath}  ${BLD}║${RST}`);
  console.log(`${BLD}║${RST}  → ${aquaporPath}  ${BLD}║${RST}`);
  console.log(`${BLD}╚══════════════════════════════════════════╝${RST}\n`);

})().catch(e => {
  console.error(`\x1b[31mERRO FATAL: ${e.message}\x1b[0m`);
  process.exit(1);
});
