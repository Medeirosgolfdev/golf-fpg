#!/usr/bin/env node
/**
 * build-drive-sd-lookup.js v2
 *
 * Cross-references drive-data.json with FPG player data.json files
 * to get official SD values.
 *
 * IMPORTANT: The scoreId in drive-data.json (from ClassifLST on scoring.datagolf.pt)
 * is NOT the same as the scoreId in data.json (from PlayerWHS on scoring.fpg.pt).
 * They are completely different ID systems!
 *
 * So we match by: fed + date + gross (+ nholes as tiebreaker)
 *
 * Output: { "driveScoreId": fpgSD, ... }
 *
 * Usage: node build-drive-sd-lookup.js
 * Reads: public/data/drive-data.json + public/{fed}/analysis/data.json (or output/{fed}/analysis/data.json)
 * Writes: public/data/drive-sd-lookup.json
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');

// Try multiple locations for drive-data.json
const driveFile = [
  path.join(PUBLIC, 'data', 'drive-data.json'),
  path.join(ROOT, 'drive-data.json'),
].find(f => fs.existsSync(f));

if (!driveFile) {
  console.error('drive-data.json não encontrado!');
  process.exit(1);
}

const outputFile = path.join(PUBLIC, 'data', 'drive-sd-lookup.json');

// 1. Load drive-data.json
const drive = JSON.parse(fs.readFileSync(driveFile, 'utf8'));
console.log(`DRIVE: ${drive.tournaments.length} torneios`);

// 2. Collect all DRIVE entries: driveScoreId → { fed, date, gross, nholes }
// date in drive-data is YYYY-MM-DD, in data.json is DD-MM-YYYY
function driveToFpgDate(d) {
  // "2026-01-24" → "24-01-2026"
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
}

const driveEntries = []; // { driveScoreId, fed, fpgDate, gross, nholes }
const fedSet = new Set();

for (const t of drive.tournaments) {
  const fpgDate = driveToFpgDate(t.date);
  for (const p of t.players) {
    if (!p.fed || !p.scoreId) continue;
    const g = typeof p.grossTotal === 'string' ? parseInt(p.grossTotal) : p.grossTotal;
    if (g >= 900 || isNaN(g)) continue; // DNS
    driveEntries.push({
      driveScoreId: String(p.scoreId),
      fed: p.fed,
      fpgDate,
      gross: g,
      nholes: p.nholes || (p.scores?.length) || 18,
      name: p.name,
      tournament: t.name.substring(0, 50)
    });
    fedSet.add(p.fed);
  }
}

console.log(`Entries: ${driveEntries.length} scorecards from ${fedSet.size} players`);

// 3. For each fed, load data.json and build a lookup: "date|gross" → sd
const lookup = {};
let matched = 0, noFile = 0, ambiguous = 0;

for (const fed of fedSet) {
  // Try multiple locations for data.json
  const candidates = [
    path.join(PUBLIC, fed, 'analysis', 'data.json'),
    path.join(ROOT, 'output', fed, 'analysis', 'data.json'),
  ];
  const dataFile = candidates.find(f => fs.existsSync(f));
  if (!dataFile) { noFile++; continue; }

  let pdata;
  try { pdata = JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
  catch { continue; }

  // Build round index: "date|gross" → [{ sd, holes, scoreId }]
  const roundIndex = new Map();

  const courses = pdata.DATA || pdata.courses || [];
  for (const course of courses) {
    const rounds = course.rounds || [];
    for (const r of rounds) {
      if (r.sd == null || r.sd === '' || r.sd === undefined) continue;
      const gross = typeof r.gross === 'string' ? parseInt(r.gross) : r.gross;
      if (!gross || isNaN(gross)) continue;
      const date = r.date || '';
      if (!date) continue;
      const holes = r.holeCount || r.holes || 18;
      const key = `${date}|${gross}`;
      if (!roundIndex.has(key)) roundIndex.set(key, []);
      roundIndex.get(key).push({ sd: Number(r.sd), holes, scoreId: r.scoreId });
    }
  }

  // Match DRIVE entries for this fed
  const fedEntries = driveEntries.filter(e => e.fed === fed);
  for (const entry of fedEntries) {
    const key = `${entry.fpgDate}|${entry.gross}`;
    const matches = roundIndex.get(key);
    if (!matches || matches.length === 0) continue;

    // Prefer match with same nholes
    let best = matches.find(c => c.holes === entry.nholes) || matches[0];

    if (matches.length > 1) {
      ambiguous++;
      const holesMatch = matches.filter(c => c.holes === entry.nholes);
      if (holesMatch.length === 1) best = holesMatch[0];
    }

    lookup[entry.driveScoreId] = best.sd;
    matched++;
  }
}

console.log(`\nResults:`);
console.log(`  Matched:   ${matched}/${driveEntries.length} scorecards`);
console.log(`  No file:   ${noFile} players without data.json`);
console.log(`  Ambiguous: ${ambiguous} (multiple rounds same date+gross, used nholes tiebreaker)`);

// Show some examples
const examples = driveEntries.filter(e => lookup[e.driveScoreId] != null).slice(0, 5);
if (examples.length) {
  console.log(`\nExamples:`);
  for (const e of examples) {
    console.log(`  ${e.fed} ${e.name.substring(0, 25).padEnd(25)} | ${e.fpgDate} | Gross ${e.gross} | SD=${lookup[e.driveScoreId]}`);
  }
}

// Show unmatched
const unmatched = driveEntries.filter(e => lookup[e.driveScoreId] == null);
if (unmatched.length > 0 && unmatched.length <= 20) {
  console.log(`\nUnmatched (${unmatched.length}):`);
  for (const e of unmatched) {
    const hasFile = [
      path.join(PUBLIC, e.fed, 'analysis', 'data.json'),
      path.join(ROOT, 'output', e.fed, 'analysis', 'data.json'),
    ].some(f => fs.existsSync(f));
    const reason = hasFile ? 'date/gross mismatch' : 'no data.json';
    console.log(`  ${e.fed} ${e.name.substring(0, 25).padEnd(25)} | ${e.fpgDate} | Gross ${e.gross} | ${reason}`);
  }
} else if (unmatched.length > 20) {
  const noFileCount = unmatched.filter(e => {
    return ![
      path.join(PUBLIC, e.fed, 'analysis', 'data.json'),
      path.join(ROOT, 'output', e.fed, 'analysis', 'data.json'),
    ].some(f => fs.existsSync(f));
  }).length;
  console.log(`\nUnmatched: ${unmatched.length} (${noFileCount} no data.json, ${unmatched.length - noFileCount} date/gross mismatch)`);
}

// Save
const outDir = path.dirname(outputFile);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(lookup, null, 2));
console.log(`\nWritten: ${outputFile} (${Object.keys(lookup).length} entries)`);
