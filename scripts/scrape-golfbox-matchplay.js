#!/usr/bin/env node
/**
 * scrape-golfbox-matchplay.js — Scraper Node-puro para o MATCH PLAY (brackets de
 * equipas) das European Team Championships hospedadas no GolfBox Livescoring
 * (scores.golfbox.dk). Complementa `scrape-golfbox.js` (que só faz a stroke play
 * individual): o match play vive numa competição KnockOut SEPARADA, ligada à
 * stroke play por `MainCompetition.ID`.
 *
 * Ex.: EBTC Div. 2 2026 → stroke play = 5731554 (2 voltas qualif.),
 *      match play = 5739276 ("…- Flight A", Type=KnockOut).
 *
 * Handlers JSONP públicos (sem cookies), descobertos no widget da EGA
 * (`scores.golfbox.dk/Scripts/pages/pages.js`):
 *   /Handlers/TeamMatchplayBracketHandler/GetTeamMatchplayScores/CompetitionId/{id}/language/2057/
 *     → estrutura por ronda: Home/Away + resultado por confronto de equipa
 *   /Handlers/TeamMatchHandler/GetTeamMatch/CompetitionId/{id}/TeamMatchId/{tmid}/language/2057/
 *     → jogos individuais (foursome/single) c/ NOMES dos jogadores + hole-by-hole
 *
 * Output: public/data/{slug}_matchplay_{ano}.json  (schema próprio, ver README no fim).
 *
 * USO:
 *   node scripts/scrape-golfbox-matchplay.js 5739276
 *   node scripts/scrape-golfbox-matchplay.js 5739276 --slug ebtc2 --name "European Boys' Team Championship, Div. 2"
 *   node scripts/scrape-golfbox-matchplay.js --scope scripts/golfbox-matchplay-scope.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { fetchJsonp, parseGbDate, getCompetition } = require('./scrape-golfbox.js');
const { writeJsonAtomic } = require('./lib/atomic-write.js');

const HOST = 'https://scores.golfbox.dk';
const LCID = 2057; // en-GB
const OUT = path.join(__dirname, '..', 'public', 'data');
const INT_MIN = -2147483648;

const getScores = (id) =>
  fetchJsonp(`${HOST}/Handlers/TeamMatchplayBracketHandler/GetTeamMatchplayScores/CompetitionId/${id}/language/${LCID}/?callback=x`);
const getTeamMatch = (id, tmid) =>
  fetchJsonp(`${HOST}/Handlers/TeamMatchHandler/GetTeamMatch/CompetitionId/${id}/TeamMatchId/${tmid}/language/${LCID}/?callback=x`);

function slugify(s) {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'golfbox';
}

/** Nome legível de um jogador a partir de uma Entry {FirstName,LastName}. */
function playerName(entry) {
  const n = `${(entry.FirstName || '').trim()} ${(entry.LastName || '').trim()}`.replace(/\s+/g, ' ').trim();
  return n || null;
}

/** Lado (Home/Away) de um jogo individual → { players[], result, won }. */
function gameSide(teamObj) {
  if (!teamObj) return null;
  const players = (teamObj.Entries || []).map(playerName).filter(Boolean);
  const mr = teamObj.MatchResult || {};
  return {
    teamId: teamObj.TeamID ?? null,
    name: teamObj.Name || null,
    players,
    result: (mr.ActualText || '').trim() || null,     // "1UP", "3&2", ""
    won: Number.isFinite(mr.ActualValue) && mr.ActualValue > 0,
  };
}

/** Hole-by-hole (perspectiva da equipa `lead`) de um jogo: [{hole,par,status}]. */
function gameHoles(leadTeam) {
  if (!leadTeam || !Array.isArray(leadTeam.Holes)) return undefined;
  const holes = [];
  for (const h of leadTeam.Holes) {
    const par = Number.isFinite(h.Par) && h.Par > 0 && h.Par !== INT_MIN ? h.Par : null;
    const status = h.MatchResult && h.MatchResult.ProgressiveText ? h.MatchResult.ProgressiveText : null; // "A/S","1UP","2DN"
    if (par == null && status == null) continue;
    holes.push({ hole: h.Number ?? h.ActualNumber ?? holes.length + 1, par, status });
  }
  return holes.length ? holes : undefined;
}

/** GetTeamMatch → lista de jogos individuais (foursomes/singles) de um confronto. */
async function fetchGames(compId, teamMatchId) {
  let data;
  try { data = await getTeamMatch(compId, teamMatchId); }
  catch { return { games: [], roundName: null }; }
  const tm = data && data.TeamMatch;
  if (!tm) return { games: [], roundName: null };
  const games = [];
  for (const m of Object.values(tm.Matches || {})) {
    const teams = m.Teams || [];
    const lead = teams.find((t) => t.IsLead) || teams[0];
    const other = teams.find((t) => t !== lead);
    games.push({
      matchNo: m.MatchNo ?? null,
      order: m.OrderNo ?? null,
      format: m.Format || null,               // "foursome" | "single"
      result: (m.Result || '').trim() || null, // "1UP", "19th", "3&2"
      playedHoles: Number.isFinite(m.PlayedHoles) ? m.PlayedHoles : null,
      startTime: parseGbDate(m.StartTime).time,
      isFinal: !!m.IsFinal,
      home: gameSide(lead),
      away: gameSide(other),
      holes: gameHoles(lead),
    });
  }
  games.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.matchNo ?? 0) - (b.matchNo ?? 0));
  return { games, roundName: tm.TeamMatchRoundName || null };
}

/** Um lado de um confronto de equipa → { teamId, name, iso, country, points, isLead }. */
function teamSide(side) {
  if (!side) return null;
  const r = side.Result || {};
  return {
    teamId: side.TeamID ?? null,
    name: side.Name || null,
    iso: side.CountryIsoCode || null,
    country: side.Country || null,
    points: Number.isFinite(r.FinalizedValue) && r.FinalizedValue !== INT_MIN ? r.FinalizedValue : null,
    isLead: !!side.IsLead,
  };
}

/** Scrape de UM flight (competição KnockOut) → objecto flight (com jogos). */
async function scrapeFlight(compId, opts = {}) {
  const comp = await getCompetition(compId);
  const cd = comp.CompetitionData || {};
  const name = cd.Name || `Flight ${compId}`;
  const flightName = opts.flightName || (/-\s*(Flight\s*\w+)/i.exec(name) || [])[1] || name;
  const format = cd.Type || null; // "KnockOut"
  const parentId = cd.MainCompetition ? cd.MainCompetition.ID : null;

  const scores = await getScores(compId);
  const clsObj = Object.values((scores && scores.Matchplay) || {})[0];
  if (!clsObj) return { competitionId: Number(compId), name: flightName, format, parentId, rounds: [] };

  const rounds = [];
  const roundKeys = Object.keys(clsObj.Rounds || {}).sort((a, b) => (clsObj.Rounds[a].Number || 0) - (clsObj.Rounds[b].Number || 0));
  for (const rk of roundKeys) {
    const r = clsObj.Rounds[rk];
    const matches = [];
    let roundName = null;
    for (const tm of Object.values(r.TeamMatches || {})) {
      if (tm.IsBye) continue;
      const home = teamSide(tm.Home);
      const away = teamSide(tm.Away);
      const { games, roundName: rn } = await fetchGames(compId, tm.TeamMatchID);
      if (!roundName && rn) roundName = rn;
      const winner = home && away && home.points != null && away.points != null
        ? (home.points > away.points ? 'home' : away.points > home.points ? 'away' : null) : null;
      matches.push({
        teamMatchId: tm.TeamMatchID ?? null,
        matchNo: tm.MatchNo ?? null,
        startTime: parseGbDate(tm.StartTime).time,
        result: (tm.Result || '').trim() || null,
        isSettled: !!tm.IsSettled,
        isStarted: !!tm.IsStarted,
        home, away, winner, games,
      });
    }
    matches.sort((a, b) => (a.matchNo ?? 0) - (b.matchNo ?? 0));
    rounds.push({
      number: r.Number ?? (Number(rk.replace(/\D/g, '')) || rounds.length + 1),
      name: roundName,
      date: parseGbDate(r.RoundStartDate || r.StartDate).date,
      matches,
    });
  }

  return {
    competitionId: Number(compId),
    name: flightName,
    format,
    parentId: parentId != null ? Number(parentId) : null,
    isCompleted: !!clsObj.IsCompleted,
    source: `https://scores.golfbox.dk/livescoring/tour/?language=${LCID}#/competition/${compId}/matchplay/bracket/all`,
    rounds,
  };
}

/** Scrape de um EVENTO (1+ flights) → objecto de output. */
async function scrapeEvent(ev) {
  const flightIds = ev.flights ? ev.flights.map((f) => ({ id: String(f.competitionId).match(/(\d+)/)?.[1], flightName: f.name }))
    : [{ id: String(ev.competitionId).match(/(\d+)/)?.[1], flightName: ev.flightName }];
  console.log(`\n${'═'.repeat(60)}\n🏆  Match Play · ${ev.name || flightIds[0].id}`);

  const flights = [];
  let year = ev.year || null, name = ev.name || null, startDate = null, endDate = null;
  for (const { id, flightName } of flightIds) {
    if (!id) continue;
    process.stdout.write(`   · flight ${flightName || id} (${id})… `);
    const comp = await getCompetition(id);
    const cd = comp.CompetitionData || {};
    if (!year) year = cd.StartDate ? Number(parseGbDate(cd.StartDate).date.slice(0, 4)) : new Date().getFullYear();
    if (!name) name = (cd.Name || '').replace(/\s*[-;]\s*Flight\s*\w+.*$/i, '').trim() || cd.Name;
    const s = parseGbDate(cd.StartDate).date, e = parseGbDate(cd.EndDate).date;
    if (s && (!startDate || s < startDate)) startDate = s;
    if (e && (!endDate || e > endDate)) endDate = e;
    const fl = await scrapeFlight(id, { flightName });
    const nMatches = fl.rounds.reduce((a, r) => a + r.matches.length, 0);
    console.log(`${fl.rounds.length} rondas, ${nMatches} confrontos`);
    flights.push(fl);
  }

  const slug = ev.slug || slugify(name);
  const out = {
    tournament: name,
    slug,
    year,
    format: flights[0] ? flights[0].format : 'KnockOut',
    parentCompetitionId: flights[0] ? flights[0].parentId : null,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    flights,
    scrapedAt: new Date().toISOString(),
  };
  return { out, file: path.join(OUT, `${slug}_matchplay_${year}.json`) };
}

function outputChanged(file, out) {
  if (!fs.existsSync(file)) return true;
  try {
    const strip = (o) => { const c = { ...o }; delete c.scrapedAt; return JSON.stringify(c); };
    return strip(JSON.parse(fs.readFileSync(file, 'utf8'))) !== strip(out);
  } catch { return true; }
}

function readScope(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(raw) ? raw : (raw.events || []);
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const scopeFile = getArg('--scope');

  let events;
  if (scopeFile) {
    events = readScope(scopeFile);
  } else {
    const ids = args.filter((a) => !a.startsWith('--') && /\d/.test(a))
      .map((a) => (a.match(/competition\/(\d+)/) || a.match(/(\d{5,})/) || [])[1]).filter(Boolean);
    if (!ids.length) {
      console.error('Uso:\n  node scripts/scrape-golfbox-matchplay.js <competitionId|url> [--slug X] [--name Y] [--year N]\n  node scripts/scrape-golfbox-matchplay.js --scope scripts/golfbox-matchplay-scope.json');
      process.exit(1);
    }
    events = [{ flights: ids.map((competitionId) => ({ competitionId })), slug: getArg('--slug'), name: getArg('--name'), year: getArg('--year') ? Number(getArg('--year')) : null }];
  }

  let changed = 0, failed = 0;
  for (const ev of events) {
    try {
      const { out, file } = await scrapeEvent(ev);
      if (outputChanged(file, out)) {
        writeJsonAtomic(file, out);
        changed++;
        console.log(`   ✅ GRAVADO → ${file}`);
      } else {
        console.log('   ⏭️  sem alterações (não gravado)');
      }
    } catch (e) {
      failed++;
      console.log(`   ❌ erro: ${e.message}`);
    }
  }
  console.log(`\n🏁 ${changed} gravado(s) · ${failed} erro(s).`);
  process.exit(failed && !changed ? 1 : changed ? 0 : 2);
}

if (require.main === module) main();
module.exports = { scrapeFlight, scrapeEvent, fetchGames, teamSide };
