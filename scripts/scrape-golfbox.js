#!/usr/bin/env node
/**
 * scrape-golfbox.js — Scraper Node-puro (SEM Playwright) para torneios juvenis
 * hospedados no GolfBox Livescoring (scores.golfbox.dk). Output: JobFile (o mesmo
 * formato dos GolfGenius FSGA/UA/México), consumido pela `MajorPage` via
 * `buildGgJobEntries` → tabs flat Draw R{n} · R{n} · Resumo · Scorecards.
 *
 * A app pública `www.golfbox.dk/livescoring/tour/` é uma SPA que carrega tudo de
 * `scores.golfbox.dk/Handlers/*` em JSONP. Um único `GetLeaderboard` por CLASSE
 * traz TUDO: metadados do torneio, entries com info do jogador (nome,
 * nacionalidade, ANO DE NASCIMENTO, clube, HCP), rondas com tee-time + buraco de
 * saída (→ draw) e scorecard buraco-a-buraco, e os campos com par/SI/comprimento
 * por buraco e por tee.
 *
 * Endpoints (JSONP, wrapper `callback(...)`, corpo é literal JS com `!0`/`!1`):
 *   GET /Handlers/CompetitionHandler/GetCompetition/CompetitionId/{id}/?callback=x
 *   GET /Handlers/LeaderboardHandler/GetLeaderboard/CompetitionId/{id}/ClassId/{cid}/RoundNumber/0/language/2057/?callback=x
 *
 * USO:
 *   node scripts/scrape-golfbox.js 5388972
 *   node scripts/scrape-golfbox.js "https://www.golfbox.dk/livescoring/tour/?language=2057#/competition/5388972/players/0/all"
 *   node scripts/scrape-golfbox.js 5388972 --slug avtrophy --name "Belgian Intl U14 — Albert Vermeiren Trophy"
 *
 * Output: public/data/{slug}_{ano}.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const HOST = 'https://scores.golfbox.dk';
const LCID = 2057; // en-GB
const OUT = path.join(__dirname, '..', 'public', 'data');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const INT_MIN = -2147483648; // sentinela GolfBox para "sem valor"

// Slug/nome legível por competição (fallback = slugify do nome do torneio).
const SLUG_OVERRIDES = [
  { re: /albert vermeiren|boys & girls u14|boys and girls u14/i, slug: 'avtrophy', name: 'Belgian International Golf Championship U14 — Albert Vermeiren Trophy' },
  { re: /young masters/i, slug: 'eym', name: 'European Young Masters' },
];

function slugify(s) {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'golfbox';
}

function writeJsonAtomic(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, Accept: '*/*' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return httpGet(new URL(res.headers.location, url).href).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} — ${url}`)); }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (buf += d));
      res.on('end', () => resolve(buf));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
  });
}

/** Descarrega um endpoint JSONP e desembrulha o literal JS (`!0`/`!1`, sentinelas). */
async function fetchJsonp(url) {
  const raw = (await httpGet(url)).trim();
  const body = raw.replace(/^[a-zA-Z_$][\w$]*\(/, '').replace(/\);?\s*$/, '');
  // eslint-disable-next-line no-new-func
  return new Function('return (' + body + ')')();
}

const getCompetition = (id) =>
  fetchJsonp(`${HOST}/Handlers/CompetitionHandler/GetCompetition/CompetitionId/${id}/?callback=x`);
const getLeaderboard = (id, classId) =>
  fetchJsonp(`${HOST}/Handlers/LeaderboardHandler/GetLeaderboard/CompetitionId/${id}/ClassId/${classId}/RoundNumber/0/language/${LCID}/?callback=x`);
const getInfo = (id) =>
  fetchJsonp(`${HOST}/Handlers/InfoHandler/GetInfo/CompetitionId/${id}/language/${LCID}/?callback=x`);

/** Course Rating + Slope por campo e por sexo (do InfoHandler/GetInfo).
 *  As Courses do GetInfo vêm keyed `C{courseID}T{tee}`, cada uma com
 *  `RatingMen`/`RatingWomen` (só o sexo dessa tee é não-nulo). Devolve
 *  `{ [courseID]: { men:{rating,slope}|null, women:{rating,slope}|null } }`. */
function parseRatings(info) {
  const byCourse = {};
  const courses = (info && info.Courses) || {};
  for (const c of Object.values(courses)) {
    const cid = c.CourseID;
    if (cid == null) continue;
    if (!byCourse[cid]) byCourse[cid] = { men: null, women: null };
    const rm = c.RatingMen, rw = c.RatingWomen;
    if (rm && Number.isFinite(rm.Rating)) byCourse[cid].men = { rating: rm.Rating, slope: Number(rm.Slope) || null };
    if (rw && Number.isFinite(rw.Rating)) byCourse[cid].women = { rating: rw.Rating, slope: Number(rw.Slope) || null };
  }
  return byCourse;
}

/** "20260702T131000" → { date: "2026-07-02", time: "13:10" }. */
function parseGbDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(s || '');
  if (!m) return { date: null, time: null };
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}

/** Nome de divisão a partir do nome da classe + escalão do torneio.
 *  "Boys Class" + "U14" → "Boys U14"; "Girls Class" → "Girls U14". */
function divisionLabel(className, ageTag) {
  const gender = /girl/i.test(className) ? 'Girls' : /boy/i.test(className) ? 'Boys' : className.replace(/\s*class$/i, '').trim();
  return ageTag ? `${gender} ${ageTag}` : gender;
}

/** Extrai o escalão ("U14"/"U16"/…) do nome do torneio, se existir. */
function ageTagFromName(name) {
  const m = /\bU\s?-?\s?(\d{2})\b/i.exec(name || '');
  return m ? `U${m[1]}` : null;
}

/** Par/SI/comprimento (18) de um campo para um dado tee. */
function courseArraysForTee(course, teeKey) {
  const par = [], si = [], meters = [];
  for (let h = 1; h <= 18; h++) {
    const hole = course.Holes[`H${h}`];
    if (!hole) { par.push(null); si.push(null); meters.push(null); continue; }
    const tee = hole.Tees && (hole.Tees[teeKey] || Object.values(hole.Tees)[0]);
    par.push(tee && Number.isFinite(tee.Par) ? tee.Par : null);
    si.push(Number.isFinite(hole.Index) ? hole.Index : null);
    meters.push(tee && Number.isFinite(tee.Length) ? tee.Length : null);
  }
  return { par, si, meters };
}

/** Scorecard buraco-a-buraco de uma ronda: só buracos com strokes reais. */
function roundScores(round) {
  const hs = round.HoleScores || {};
  const scores = [];
  let complete = true;
  for (let h = 1; h <= 18; h++) {
    const cell = hs[`H${h}`];
    const v = cell && cell.Score ? cell.Score.Value : undefined;
    if (Number.isFinite(v) && v > 0 && v !== INT_MIN) scores.push(v);
    else complete = false;
  }
  return { scores, complete };
}

function sum(a) { return a.reduce((x, y) => x + y, 0); }

/** Constrói uma divisão JobFile a partir de uma classe da leaderboard. */
function buildDivision(cls, courses, ageTag, sourceUrl, ratingsByCourse = {}) {
  const entries = Object.values((cls.Leaderboard && cls.Leaderboard.Entries) || {});
  const label = divisionLabel(cls.Name || '', ageTag);
  const isGirls = /girl/i.test(cls.Name || '');

  // Tee dominante da divisão (rapazes/raparigas jogam tees diferentes).
  const teeCount = new Map();
  let courseRefId = null;
  for (const e of entries) for (const r of Object.values(e.Rounds || {})) {
    if (r.TeeID) teeCount.set(`T${r.TeeID}`, (teeCount.get(`T${r.TeeID}`) || 0) + 1);
    if (r.CourseRefID && !courseRefId) courseRefId = r.CourseRefID;
  }
  const teeKey = [...teeCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const course = (courseRefId && courses[`C${courseRefId}`]) || Object.values(courses)[0];
  const { par, si, meters } = course ? courseArraysForTee(course, teeKey) : { par: null, si: null, meters: null };
  const parTotal = par && par.every((x) => x != null) ? sum(par) : null;
  const metersTotal = meters && meters.every((x) => x != null) ? sum(meters) : null;
  const teeName = course && teeKey && course.Holes['H-TOTAL'] && course.Holes['H-TOTAL'].Tees[teeKey]
    ? `Tee ${course.Holes['H-TOTAL'].Tees[teeKey].Length}m` : 'Tee';

  // Course Rating + Slope da tee jogada por esta divisão: rapazes → rating dos
  // homens, raparigas → rating das senhoras (cada tee só publica o do seu sexo).
  const ratings = ratingsByCourse[courseRefId] || Object.values(ratingsByCourse)[0] || {};
  const rating = isGirls ? ratings.women : ratings.men;
  const courseRating = rating ? rating.rating : null;
  const slope = rating ? rating.slope : null;

  // Nº de rondas do setup (para saber quando o total é fiável).
  const roundNums = new Set();
  for (const e of entries) for (const k of Object.keys(e.Rounds || {})) roundNums.add(k);
  const scheduledRounds = roundNums.size;

  const players = [];
  const drawMap = new Map(); // roundNumber → Map(slotKey → {date,time,startHole,players[]})

  for (const e of entries) {
    const name = `${(e.FirstName || '').trim()} ${(e.LastName || '').trim()}`.replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const roundsArr = [];
    let allComplete = true;
    const roundKeys = Object.keys(e.Rounds || {}).sort((a, b) => (e.Rounds[a].Number || 0) - (e.Rounds[b].Number || 0));
    for (const rk of roundKeys) {
      const r = e.Rounds[rk];
      const { scores, complete } = roundScores(r);
      const { date, time } = parseGbDate(r.StartDateTime);
      // Draw: agrupar jogadores por (ronda, tee-time, buraco de saída).
      if (time != null) {
        const rn = String(r.Number);
        if (!drawMap.has(rn)) drawMap.set(rn, new Map());
        const slot = `${time}|${r.StartHoleNumber}`;
        const g = drawMap.get(rn);
        if (!g.has(slot)) g.set(slot, { date, time, startHole: r.StartHoleNumber ?? null, order: (r.MatchNumber || 0), players: [] });
        g.get(slot).players.push({ name });
      }
      if (scores.length === 0) { allComplete = false; continue; }
      if (!complete) allComplete = false;
      const f9 = sum(scores.slice(0, 9));
      const b9 = scores.length > 9 ? sum(scores.slice(9, 18)) : 0;
      roundsArr.push({
        day: r.Number, scores, f9, ...(scores.length > 9 ? { b9 } : {}),
        gross: sum(scores), startingHole: r.StartHoleNumber ?? undefined,
      });
    }
    const roundGross = roundsArr.map((r) => r.gross);
    // Total fiável só quando o jogador completou TODAS as rondas do setup.
    const finishedAll = roundsArr.length >= scheduledRounds && allComplete && roundsArr.length > 0;
    const total = finishedAll ? sum(roundGross) : null;
    const toPar = finishedAll && parTotal != null ? total - parTotal * roundsArr.length : null;
    const posText = (e.Position && (e.Position.Calculated || e.Position.Actual)) || null;
    players.push({
      pos: posText != null ? String(posText) : null,
      name,
      country: e.Nationality || e.Country || null,
      club: e.ClubName || null,
      birthYear: Number.isFinite(e.BirthYear) && e.BirthYear > 1900 ? e.BirthYear : null,
      // HCP exacto: GolfBox guarda o índice ×10000 (ex: -16000 = +1.6 plus,
      // 3000 = 0.3). Negativo = handicap "plus" (melhor que scratch).
      hcp: (e.HCP !== '' && e.HCP != null && Number.isFinite(Number(e.HCP))) ? Number(e.HCP) / 10000 : null,
      team: e.TeamName || null,
      detailId: e.RefID != null ? `gb${e.RefID}` : null,
      toPar, total, roundGross, rounds: roundsArr,
    });
  }

  // Draws → objecto por ronda, grupos ordenados por hora depois buraco.
  const draws = {};
  for (const [rn, slots] of [...drawMap.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const groups = [...slots.values()]
      .sort((a, b) => (a.time || '').localeCompare(b.time || '') || (a.startHole || 0) - (b.startHole || 0))
      .map((g) => ({ time: g.time, startHole: g.startHole, players: g.players }));
    if (groups.length) draws[rn] = { round: Number(rn), date: groups[0].date || undefined, groups };
  }

  players.sort((a, b) => {
    const pa = parseInt(String(a.pos).replace(/^T/i, ''), 10) || 9999;
    const pb = parseInt(String(b.pos).replace(/^T/i, ''), 10) || 9999;
    return pa - pb;
  });

  return {
    division: label,
    source: sourceUrl,
    par, parTotal, meters, si, teeName, metersTotal,
    courseRating, slope,
    players,
    ...(Object.keys(draws).length ? { draws } : {}),
  };
}

/** Compara o novo output com o ficheiro existente, ignorando `scrapedAt`.
 *  Devolve true se há alterações reais (ou o ficheiro não existe). */
function outputChanged(file, out) {
  if (!fs.existsSync(file)) return true;
  try {
    const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
    const strip = (o) => { const c = { ...o }; delete c.scrapedAt; return JSON.stringify(c); };
    return strip(prev) !== strip(out);
  } catch { return true; }
}

/** Scrape de UMA competição GolfBox → objecto JobFile (não grava). */
async function scrapeOne(compId, opts = {}) {
  const sourceUrl = `https://www.golfbox.dk/livescoring/tour/?language=${LCID}#/competition/${compId}/players/0/all`;
  console.log(`\n${'═'.repeat(60)}\n🏌️  GolfBox · competição ${compId}`);
  const comp = await getCompetition(compId);
  const cd = comp.CompetitionData || {};
  const tournamentName = cd.Name || 'GolfBox Event';
  const startDate = parseGbDate(cd.StartDate).date;   // ISO "YYYY-MM-DD" ou null
  const endDate = parseGbDate(cd.EndDate).date;
  const year = opts.year || (startDate ? Number(startDate.slice(0, 4)) : new Date().getFullYear());
  const ageTag = ageTagFromName(tournamentName);
  console.log(`   ${tournamentName} · ${year}${ageTag ? ` · ${ageTag}` : ''}`);

  // Course Rating + Slope por campo/sexo (endpoint separado InfoHandler/GetInfo).
  let ratingsByCourse = {};
  try { ratingsByCourse = parseRatings(await getInfo(compId)); }
  catch (e) { console.log(`   ⚠ GetInfo falhou (${e.message}) — sem CR/Slope`); }

  // Classes de jogadores (ignora TeamClass — a MajorPage é individual).
  const playerClasses = (Array.isArray(cd.Classes) ? cd.Classes : [])
    .filter((c) => (c.ClassType || 'PlayerClass') === 'PlayerClass');
  if (!playerClasses.length) throw new Error('nenhuma PlayerClass encontrada em CompetitionData.Classes');

  const divisions = [];
  let courseName = null;
  for (const c of playerClasses) {
    process.stdout.write(`   · classe ${c.Name} (${c.Id})… `);
    const lb = await getLeaderboard(compId, c.Id);
    const clsObj = Object.values(lb.Classes || {})[0];
    if (!clsObj) { console.log('sem dados'); continue; }
    if (!courseName) {
      const cc = (lb.CompetitionData && lb.CompetitionData.CourseColours) || [];
      courseName = (cc[0] && cc[0].Name) || (Object.values(lb.Courses || {})[0] || {}).Name || null;
    }
    const dv = buildDivision(clsObj, lb.Courses || {}, ageTag, sourceUrl, ratingsByCourse);
    const nSc = dv.players.filter((p) => (p.rounds || []).some((r) => (r.scores || []).length)).length;
    console.log(`${dv.players.length} jogadores (${nSc} com scorecard, ${Object.keys(dv.draws || {}).length} rondas de draw)`);
    divisions.push(dv);
  }

  let slug = opts.slug, name = opts.name || tournamentName;
  if (!slug) for (const o of SLUG_OVERRIDES) if (o.re.test(tournamentName)) { slug = o.slug; if (!opts.name) name = o.name; break; }
  if (!slug) slug = slugify(tournamentName);

  const out = {
    tournament: name,
    year,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    source: sourceUrl,
    course: courseName,
    divisions,
    scrapedAt: new Date().toISOString(),
  };
  return { out, file: path.join(OUT, `${slug}_${year}.json`), name };
}

/** Lê a lista de competições de um scope file `[{ competitionId, slug?, name?, year? }]`. */
function readScope(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const arr = Array.isArray(raw) ? raw : (raw.competitions || []);
  return arr
    .map((e) => (typeof e === 'object' ? e : { competitionId: e }))
    .map((e) => ({ ...e, competitionId: String(e.competitionId).match(/(\d+)/)?.[1] }))
    .filter((e) => e.competitionId);
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const scopeFile = getArg('--scope');

  // Alvos: do scope file OU dos IDs/URLs posicionais (com --slug/--name/--year
  // a aplicar ao único alvo posicional).
  let targets;
  if (scopeFile) {
    targets = readScope(scopeFile);
  } else {
    const ids = args.filter((a) => !a.startsWith('--') && /\d/.test(a))
      .map((a) => (a.match(/competition\/(\d+)/) || a.match(/(\d{5,})/) || [])[1])
      .filter(Boolean);
    const yr = getArg('--year') ? parseInt(getArg('--year'), 10) : null;
    targets = ids.map((competitionId) => ({ competitionId, slug: getArg('--slug'), name: getArg('--name'), year: yr }));
  }
  if (!targets.length) {
    console.error('Uso:');
    console.error('  node scripts/scrape-golfbox.js <competitionId|url> [--slug X] [--name Y] [--year N]');
    console.error('  node scripts/scrape-golfbox.js --scope scripts/golfbox-scope.json');
    process.exit(1);
  }

  let changed = 0, failed = 0;
  for (const t of targets) {
    try {
      const { out, file, name } = await scrapeOne(t.competitionId, t);
      if (outputChanged(file, out)) {
        writeJsonAtomic(file, out);
        changed++;
        console.log(`   ✅ ${name} — ${out.divisions.length} divisão(ões) · GRAVADO → ${file}`);
      } else {
        console.log(`   ⏭️  ${name} — sem alterações (não gravado)`);
      }
    } catch (e) {
      failed++;
      console.error(`   ❌ competição ${t.competitionId}: ${e.message}`);
    }
  }

  console.log(`\n🏁 ${changed} gravado(s) · ${targets.length - changed - failed} sem alterações · ${failed} erro(s).`);
  if (failed && !changed) process.exit(1);   // tudo falhou → erro real
  process.exit(changed ? 0 : 2);             // 0 = houve novidades · 2 = nada novo
}

if (require.main === module) main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
module.exports = { fetchJsonp, buildDivision, parseGbDate, scrapeOne, getCompetition, getLeaderboard };
