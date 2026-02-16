// lib/cross-stats.js — Cross-analysis: extract stats for all players
const fs = require("fs");
const path = require("path");
const { applyMelhorias, applyMelhoriasScorecard } = require("./melhorias");
const {
  norm, toNum, isMeaningful, pickHcpFromRow, pickScorecardRec,
  getCourse, getTee, getPlayedAt, pickEventName, courseAlias,
  pickGrossFromWHS, parseDotNetDate, fmtDate
} = require("./helpers");
const { normKey } = require("./tee-colors");
const { holeCountFromRec, parTotalFromRec } = require("./scorecard-fragment");

function extractPlayerStats(fed, outputRoot) {
  const baseDir = path.join(outputRoot, fed);
  const whsPath = path.join(baseDir, "whs-list.json");
  const scorecardsDir = path.join(baseDir, "scorecards");
  if (!fs.existsSync(whsPath)) return null;

  const whs = JSON.parse(fs.readFileSync(whsPath, "utf-8"));
  const rows = (whs?.d ?? whs)?.Records || whs?.Records || [];
  applyMelhorias(rows, fed, true);

  const whsByScoreId = new Map();
  for (const r of rows) {
    if (r?.score_id != null) whsByScoreId.set(String(r.score_id), r);
  }

  const cardByScoreId = new Map();
  if (fs.existsSync(scorecardsDir)) {
    for (const f of fs.readdirSync(scorecardsDir).filter(f => f.endsWith(".json"))) {
      try {
        const json = JSON.parse(fs.readFileSync(path.join(scorecardsDir, f), "utf-8"));
        const rec = pickScorecardRec(json);
        if (rec) {
          const sid = path.basename(f, ".json");
          applyMelhoriasScorecard(rec, fed, sid);
          cardByScoreId.set(sid, rec);
        }
      } catch {}
    }
  }

  const rounds = [];
  for (const [scoreId, whsRow] of whsByScoreId.entries()) {
    const rec = cardByScoreId.get(scoreId) || null;
    const dateObj = getPlayedAt(rec, whsRow);
    const course = getCourse(rec, whsRow);
    const eventName = pickEventName(whsRow, rec);
    let gross = pickGrossFromWHS(whsRow);
    if ((gross === "" || gross == null) && rec) {
      const cand = toNum(rec?.gross_total) ?? toNum(rec?.GrossTotal) ?? null;
      if (cand != null) gross = cand;
      else {
        const hc = holeCountFromRec(rec);
        let s = 0, c = 0;
        for (let i = 1; i <= hc; i++) {
          const v = toNum(rec?.[`gross_${i}`]);
          if (isMeaningful(v)) { s += v; c++; }
        }
        if (c > 0) gross = s;
      }
    }
    const hc = rec ? holeCountFromRec(rec) : (toNum(whsRow?.holes) || 18);
    const displayCourse = courseAlias(course, hc, rec);
    const tee = getTee(rec, whsRow) || "";
    rounds.push({
      dateSort: dateObj ? dateObj.getTime() : 0,
      date: fmtDate(dateObj),
      course: displayCourse,
      courseKey: norm(displayCourse),
      tee: tee,
      teeKey: normKey(tee),
      gross: toNum(gross),
      par: rec ? parTotalFromRec(rec) : null,
      sd: toNum(whsRow.sgd ?? whsRow.SD ?? whsRow.sd ?? ""),
      hi: toNum(pickHcpFromRow(whsRow)),
      eventName: eventName || "",
      holeCount: hc,
      scoreOrigin: whsRow.score_origin || ""
    });
  }

  rounds.sort((a, b) => b.dateSort - a.dateSort);

  const sortedRows = rows.length > 0 ? [...rows].sort((a, b) => {
    const da = parseDotNetDate(a.played_at) || new Date(0);
    const db = parseDotNetDate(b.played_at) || new Date(0);
    return db - da;
  }) : [];

  const last20 = rounds.slice(0, 20);
  const validGross20 = last20.map(r => r.gross).filter(v => v != null);
  const validSD20 = last20.map(r => r.sd).filter(v => v != null);
  const avgGross20 = validGross20.length ? validGross20.reduce((a, b) => a + b, 0) / validGross20.length : null;
  const avgSD20 = validSD20.length ? validSD20.reduce((a, b) => a + b, 0) / validSD20.length : null;
  const lastSD = validSD20.length ? validSD20[0] : null;
  // currentHcp: post-round value from most recent WHS row
  const currentHcp = (() => {
    // Sort WHS rows by date descending to find most recent
    const sorted = [...rows].sort((a, b) => {
      const da = parseDotNetDate(a.hcp_date || a.mov_date || a.played_at);
      const db = parseDotNetDate(b.hcp_date || b.mov_date || b.played_at);
      return (db || 0) - (da || 0);
    });
    const newest = sorted[0];
    if (!newest) return null;
    const nh = toNum(newest.new_handicap);
    const eh = toNum(newest.exact_handicap);
    if (nh == null) return eh ?? null;
    if (eh != null && Math.floor(eh) === nh) return eh;
    return nh;
  })();

  const hcpHistory = rounds.filter(r => r.hi != null && r.dateSort > 0)
    .sort((a, b) => a.dateSort - b.dateSort)
    .map(r => ({ d: r.dateSort, h: r.hi }));

  const eventSet = new Set(rounds.filter(r => r.eventName).map(r => norm(r.eventName)));
  const numEDS = rounds.filter(r => r.scoreOrigin === 'EDS' || r.scoreOrigin === 'Indiv').length;

  const courseTeeStats = {};
  for (const r of rounds) {
    if (r.gross == null || r.holeCount !== 18) continue;
    if (!r.course || r.course.toUpperCase() === 'NONE' || !r.course.trim()) continue;
    const ctk = r.courseKey + '|' + r.teeKey;
    if (!courseTeeStats[ctk]) courseTeeStats[ctk] = {
      course: r.course, tee: r.tee, courseKey: r.courseKey, teeKey: r.teeKey,
      rounds: []
    };
    courseTeeStats[ctk].rounds.push({
      gross: r.gross, par: r.par, sd: r.sd, hi: r.hi,
      date: r.date, dateSort: r.dateSort, event: r.eventName
    });
  }
  const courseTeeAvg = {};
  for (const [ctk, cs] of Object.entries(courseTeeStats)) {
    const grosses = cs.rounds.map(r => r.gross).sort((a, b) => a - b);
    const avg = grosses.reduce((a, b) => a + b, 0) / grosses.length;
    cs.rounds.sort((a, b) => b.dateSort - a.dateSort);
    courseTeeAvg[ctk] = {
      course: cs.course, tee: cs.tee, courseKey: cs.courseKey, teeKey: cs.teeKey,
      avg: Math.round(avg * 10) / 10,
      count: grosses.length,
      best: grosses[0],
      worst: grosses[grosses.length - 1],
      rounds: cs.rounds
    };
  }

  const validDates = rounds.filter(r => r.dateSort > 0);
  const firstDate = validDates.length > 0
    ? validDates.reduce((a, b) => a.dateSort < b.dateSort ? a : b).date
    : null;
  const now = new Date();
  const currentYearStart = new Date(now.getFullYear(), 0, 1).getTime();
  const lastYearStart = new Date(now.getFullYear() - 1, 0, 1).getTime();
  const twoYearsAgoStart = new Date(now.getFullYear() - 2, 0, 1).getTime();
  const threeYearsAgoStart = new Date(now.getFullYear() - 3, 0, 1).getTime();
  const roundsCurrentYear = rounds.filter(r => r.dateSort >= currentYearStart).length;
  const roundsLastYear = rounds.filter(r => r.dateSort >= lastYearStart && r.dateSort < currentYearStart).length;
  const rounds2YearsAgo = rounds.filter(r => r.dateSort >= twoYearsAgoStart && r.dateSort < lastYearStart).length;
  const rounds3YearsAgo = rounds.filter(r => r.dateSort >= threeYearsAgoStart && r.dateSort < twoYearsAgoStart).length;

  return {
    fed, numRounds: rounds.length, numTournaments: eventSet.size, numEDS,
    currentHcp, avgGross20, avgSD20, lastSD, hcpHistory,
    courseTee: courseTeeAvg, firstDate,
    rounds3YearsAgo, rounds2YearsAgo, roundsLastYear, roundsCurrentYear
  };
}

function extractAllPlayerStats(allPlayers, outputRoot) {
  const stats = {};
  for (const p of allPlayers) {
    try {
      const s = extractPlayerStats(p.fed, outputRoot);
      if (s) {
        s.name = p.name;
        s.escalao = p.escalao || "";
        s.birthYear = p.birthYear || "";
        s.sex = p.sex || "";
        s.club = p.club || "";
        stats[p.fed] = s;
      }
    } catch (e) {
      console.error(`  ⚠ Erro ao extrair stats de ${p.name} (${p.fed}):`, e.message);
    }
  }
  return stats;
}

module.exports = { extractPlayerStats, extractAllPlayerStats };
