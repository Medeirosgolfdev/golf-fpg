#!/usr/bin/env node
/**
 * scrape-crj-madeira-historico.js
 *
 * Scrape pontual de torneios históricos do CRJ Madeira que não aparecem
 * na pesquisa "Jovens" da TournamentsLST (provavelmente porque são pré-2020
 * e foram descritos sem essa palavra no nome).
 *
 * Targets:
 *   2019 — 007/10236..10240 (Santo da Serra) — Sub 10/12/14/16/18
 *   2020 — 059/10208 (Sub 12 e 14 combined), 059/10209 (Sub 10) (Palheiro)
 *
 * Output: public/data/jovens_2019.json e public/data/jovens_2020.json
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeAtomic } = require("../lib/atomic-write");

// Optional proxy support — used when running inside sandboxes that only
// allow outbound traffic via HTTPS proxy (ex: Cowork sandbox).
try {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxyUrl) {
    const { ProxyAgent, setGlobalDispatcher } = require("undici");
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    console.log(`[proxy] using ${proxyUrl}`);
  }
} catch (e) { /* undici não instalado — OK em ambiente normal */ }

const REPO_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(REPO_ROOT, "public", "data");
const BASE_URL = "https://scoring.datagolf.pt/pt";
const UA = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36";
const DELAY = 120;

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m", X = "\x1b[0m";
const log  = m => console.log(`${C}[crj-historico]${X} ${m}`);
const ok   = m => console.log(`${G}[crj-historico] ✓${X} ${m}`);
const warn = m => console.log(`${Y}[crj-historico] ⚠${X} ${m}`);
const info = m => console.log(`  ${m}`);

function loadCookies() {
  if (process.env.DATAGOLF_SCORING_COOKIES) return process.env.DATAGOLF_SCORING_COOKIES;
  const fp = path.join(REPO_ROOT, "api", ".scoring-datagolf-cookies.json");
  if (fs.existsSync(fp)) {
    const j = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (j.cookieHeader) return j.cookieHeader;
  }
  console.error(`${R}ERRO: nenhum cookie configurado.${X}`);
  process.exit(1);
}
const COOKIE = loadCookies();

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function dgPost(pathname, bodyObj, queryString = "", retries = 2) {
  const url = `${BASE_URL}/${pathname}${queryString ? "?" + queryString : ""}`;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "Origin": "https://scoring.datagolf.pt",
          "Referer": `${BASE_URL}/tournaments.aspx`,
          "User-Agent": UA,
          "Cookie": COOKIE,
        },
        body: JSON.stringify(bodyObj),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 500 && attempt < retries) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        throw new Error(`HTTP ${res.status} em ${pathname}: ${txt.slice(0, 200)}`);
      }
      const json = await res.json();
      const d = json.d || json;
      if (d.Result === "ERROR") throw new Error(`FPG erro: ${d.Message}`);
      return d;
    } catch (e) {
      lastErr = e;
      if (!String(e.message).includes("HTTP 500") || attempt >= retries) throw e;
    }
  }
  throw lastErr;
}

async function tournLookupByCode(ccode, tcode) {
  const body = {
    ClubCode: String(ccode || "0"), dtIni: "", dtFim: "",
    CourseName: "", TournCode: String(tcode), TournName: "",
    jtStartIndex: "0", jtPageSize: "10", jtSorting: "started_at DESC",
  };
  const qs = `jtStartIndex=0&jtPageSize=10&jtSorting=${encodeURIComponent("started_at DESC")}`;
  const d = await dgPost("tournaments.aspx/TournamentsLST", body, qs);
  return (d.Records || []).find(r => String(r.code) === String(tcode)) || null;
}

async function fetchClassif(tclub, tcode, round) {
  const allRecords = [];
  let startIndex = 0;
  const pageSize = 150;
  while (true) {
    const body = {
      Classi: "1", tclub: String(tclub), tcode: String(tcode),
      classiforder: "1", classiftype: "I", classifroundtype: "D",
      scoringtype: "1", round: String(round || 1),
      members: "0", playertypes: "0", gender: "0",
      minagemen: "0", maxagemen: "999",
      minageladies: "0", maxageladies: "999",
      minhcp: "-8", maxhcp: "99", idfilter: "-1",
      jtStartIndex: String(startIndex), jtPageSize: String(pageSize),
      jtSorting: "score_id DESC",
    };
    const qs = `jtStartIndex=${startIndex}&jtPageSize=${pageSize}&jtSorting=${encodeURIComponent("score_id DESC")}`;
    try {
      const d = await dgPost("classif.aspx/ClassifLST", body, qs);
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
  const qs = `score_id=${scoreId}&tclub=${tclub}&tcode=${tcode}&scoringtype=1&classiftype=I&classifround=${round}`;
  const body = {
    score_id: String(scoreId), tclub: String(tclub), tcode: String(tcode),
    scoringtype: "1", classiftype: "I", classifround: String(round),
  };
  try {
    const d = await dgPost("classif.aspx/ScoreCard", body, qs);
    return (d.Records && d.Records[0]) || null;
  } catch { return null; }
}

async function fetchScorecardAggregate(scoreId, tclub, tcode) {
  const qs = `score_id=${scoreId}&tclub=${tclub}&tcode=${tcode}&scoringtype=1&classiftype=I&classifround=`;
  const body = {
    score_id: String(scoreId), tclub: String(tclub), tcode: String(tcode),
    scoringtype: "1", classiftype: "I", classifround: "",
  };
  try {
    const d = await dgPost("classifAgregate.aspx/ScoreCard", body, qs);
    return d.Records || null;
  } catch { return null; }
}

function extractHoleData(rec) {
  const n = rec.nholes || 18;
  const scores = [], pars = [], si = [], meters = [];
  for (let h = 1; h <= n; h++) {
    scores.push(rec[`gross_${h}`] != null ? Number(rec[`gross_${h}`]) : 0);
    pars.push(rec[`par_${h}`]     != null ? Number(rec[`par_${h}`])   : 0);
    si.push(rec[`stroke_index_${h}`] != null ? Number(rec[`stroke_index_${h}`]) : 0);
    meters.push(rec[`meters_${h}`] != null ? Number(rec[`meters_${h}`]) : 0);
  }
  return { scores, pars, si, meters };
}

function mapPlayer(r) {
  const pos = r.classif_pos;
  const grossStr = r.gross_total;
  const toParStr = r.to_par_total;
  const isNS = pos === "NS" || grossStr === "NS" || r.score_status_id === 99;

  let grossNum = null;
  if (grossStr && !["NS", "NR", "DQ"].includes(grossStr)) {
    grossNum = parseInt(grossStr);
    if (isNaN(grossNum)) grossNum = null;
  }
  let toParNum = null;
  if (toParStr && !["NS", "NR", "DQ", "PAR"].includes(toParStr)) {
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
    hcpPlay: r.play_hcp != null ? Number(r.play_hcp) : undefined,
    fedCode: null, courseRating: null, slope: null,
    teeName: null, teeColorId: null,
    parTotal: null, nholes: null, course: null,
    roundScores: [],
  };
}

// Targets: cada um com metadata override caso a API não devolva tournLookup
const TARGETS = [
  // 2019 Santo da Serra (ccode 007)
  { ccode: "007", tcode: "10236", year: 2019, name: "Campeonato Regional de Jovens Sub 10 2019", escalao: "Sub 10", date: "2019-07-13", campo: "Santo da Serra" },
  { ccode: "007", tcode: "10237", year: 2019, name: "Campeonato Regional de Jovens Sub 12 2019", escalao: "Sub 12", date: "2019-07-13", campo: "Santo da Serra" },
  { ccode: "007", tcode: "10238", year: 2019, name: "Campeonato Regional de Jovens Sub 14 2019", escalao: "Sub 14", date: "2019-07-13", campo: "Santo da Serra" },
  { ccode: "007", tcode: "10239", year: 2019, name: "Campeonato Regional de Jovens Sub 16 2019", escalao: "Sub 16", date: "2019-07-13", campo: "Santo da Serra" },
  { ccode: "007", tcode: "10240", year: 2019, name: "Campeonato Regional de Jovens Sub 18 2019", escalao: "Sub 18", date: "2019-07-13", campo: "Santo da Serra" },
  // 2020 Palheiro (ccode 059)
  { ccode: "059", tcode: "10208", year: 2020, name: "Campeonato Regional de Jovens Sub 12 e 14 2020", escalao: null, tabLabel: "Sub 12 e 14", combined: true, date: "2020-09-12", campo: "Palheiro" },
  { ccode: "059", tcode: "10209", year: 2020, name: "Campeonato Regional de Jovens Sub 10 2020", escalao: "Sub 10", date: "2020-09-12", campo: "Palheiro" },
];

async function processTarget(t, label) {
  // Tentar lookup para confirmar metadata (date/campo/rounds)
  let probMeta = null;
  try {
    probMeta = await tournLookupByCode(t.ccode, t.tcode);
  } catch (e) {
    warn(`${label} probMeta erro: ${e.message}`);
  }

  let date = t.date;
  let campo = t.campo;
  let rounds = 1;
  let nameFromApi = null;
  if (probMeta) {
    const ms = parseInt((probMeta.started_at || "").match(/\d+/)?.[0] || "0");
    if (ms > 0) date = new Date(ms).toISOString().split("T")[0];
    if (probMeta.course_description) campo = probMeta.course_description;
    rounds = probMeta.rounds || 1;
    nameFromApi = probMeta.description;
    info(`${label} probMeta OK: name="${nameFromApi}" date=${date} campo=${campo} rounds=${rounds}`);
  } else {
    info(`${label} probMeta=null — usar overrides do script (${date}, ${campo})`);
  }

  // Fetch classif R1
  const r1 = await fetchClassif(t.ccode, t.tcode, 1);
  if (r1.error) { warn(`${label} classif R1: ${r1.error}`); return null; }
  if (r1.records.length === 0) { warn(`${label} 0 jogadores`); return null; }

  // Probe R2
  if (rounds <= 1) {
    await sleep(DELAY);
    const probe = await fetchClassif(t.ccode, t.tcode, 2);
    if (!probe.error && probe.records.length > 0) rounds = 2;
  }

  const players = r1.records.map(mapPlayer);
  info(`${label} ${players.length} jog${rounds > 1 ? ` (${rounds}R)` : ""}`);

  for (const p of players) {
    if (["NS", "DQ", "WD"].includes(p.pos) || !p.scoreId || p.scoreId === "0") continue;

    if (rounds > 1) {
      const recs = await fetchScorecardAggregate(p.scoreId, t.ccode, t.tcode);
      if (recs?.length > 0) {
        const sc0 = recs[0];
        if (!p.fedCode && sc0.federated_code) {
          p.fedCode = sc0.federated_code;
          p.courseRating = sc0.course_rating; p.slope = sc0.slope;
          p.teeName = sc0.tee_name; p.teeColorId = sc0.tee_color_id;
          p.parTotal = sc0.par_total; p.nholes = sc0.nholes; p.course = sc0.course_description;
        }
        recs.forEach((sc, idx) => {
          const hd = extractHoleData(sc);
          p.roundScores.push({
            round: idx + 1, gross: sc.gross_total,
            scores: hd.scores, pars: hd.pars, si: hd.si, meters: hd.meters,
            courseRating: sc.course_rating, slope: sc.slope,
            teeName: sc.tee_name, teeColorId: sc.tee_color_id,
          });
        });
      }
    } else {
      const sc = await fetchScorecard(p.scoreId, t.ccode, t.tcode, 1);
      if (sc) {
        const hd = extractHoleData(sc);
        if (!p.fedCode && sc.federated_code) {
          p.fedCode = sc.federated_code;
          p.courseRating = sc.course_rating; p.slope = sc.slope;
          p.teeName = sc.tee_name; p.teeColorId = sc.tee_color_id;
          p.parTotal = sc.par_total; p.nholes = sc.nholes; p.course = sc.course_description;
        }
        p.roundScores.push({
          round: 1, gross: sc.gross_total,
          scores: hd.scores, pars: hd.pars, si: hd.si, meters: hd.meters,
          courseRating: sc.course_rating, slope: sc.slope,
          teeName: sc.tee_name, teeColorId: sc.tee_color_id,
        });
      }
    }
    await sleep(DELAY);

    if (rounds > 1 && p.roundScores.length > 1) {
      const sumGross = p.roundScores.reduce((s, r) => s + (r.gross || 0), 0);
      const parT = p.parTotal || 0;
      p.grossTotal = sumGross;
      p.toPar = sumGross - (parT * p.roundScores.length);
    }
  }

  const out = {
    name: t.name,
    ccode: t.ccode, tcode: t.tcode,
    date, campo, clube: t.ccode,
    circuit: "tour", series: "jovens",
    region: "madeira",
    escalao: t.escalao || null,
    sex: null,
    num: null,
    rounds,
    playerCount: players.length,
    players,
  };
  if (t.tabLabel) out._tabLabel = t.tabLabel;
  return out;
}

(async () => {
  log(`═══ Scrape CRJ Madeira histórico (2019+2020) ═══`);
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const byYear = { 2019: [], 2020: [] };

  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    const label = `[${i + 1}/${TARGETS.length}] ${t.ccode}/${t.tcode}`;
    try {
      const tour = await processTarget(t, label);
      if (tour) byYear[t.year].push(tour);
    } catch (e) {
      warn(`${label} ERRO: ${e.message}`);
    }
    await sleep(DELAY);
  }

  for (const year of [2019, 2020]) {
    const tournaments = byYear[year].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const totalPlayers = tournaments.reduce((s, t) => s + (t.playerCount || 0), 0);
    const totalScorecards = tournaments.reduce((s, t) => s + t.players.reduce((a, p) => a + (p.roundScores?.length || 0), 0), 0);
    const now = new Date();
    const lastUpdated = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    const data = {
      lastUpdated,
      source: "scoring.datagolf.pt (histórico CRJ Madeira)",
      circuit: "jovens",
      year,
      searchTerm: "Jovens (lookup directo por tcode)",
      totalTournaments: tournaments.length,
      totalPlayers,
      totalScorecards,
      tournaments,
    };
    const fp = path.join(OUTPUT_DIR, `jovens_${year}.json`);
    writeAtomic(fp, JSON.stringify(data, null, 2));
    ok(`Escrito ${path.basename(fp)} — ${tournaments.length}T / ${totalPlayers}J / ${totalScorecards}SC`);
  }
})().catch(err => {
  console.error(`${R}ERRO FATAL:${X} ${err.stack || err.message}`);
  process.exit(1);
});
