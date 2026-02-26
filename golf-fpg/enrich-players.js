#!/usr/bin/env node
/**
 * enrich-players.js — Compute per-player stats for sidebar
 *
 * Uses extractPlayerStats (which already does correct date parsing via
 * parseDotNetDate) and derives period counts from its output.
 *
 * Usage:
 *   node enrich-players.js                  # All players
 *   node enrich-players.js 42205 52884      # Specific players
 */

const fs = require("fs");
const path = require("path");
const { extractPlayerStats } = require("./lib/cross-stats");

const args = process.argv.slice(2);
const fedFilter = args.filter(a => /^\d+$/.test(a));

const playersPath = path.join(__dirname, "players.json");
const outputRoot = path.join(__dirname, "output");
const statsOutPath = path.join(__dirname, "public", "player-stats.json");

let txt = fs.readFileSync(playersPath, "utf-8");
if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
const players = JSON.parse(txt);
const allFeds = Object.keys(players);
const targetFeds = fedFilter.length > 0 ? fedFilter : allFeds;

console.log(`📊 Enriching ${targetFeds.length} of ${allFeds.length} players...`);

let existing = {};
if (fs.existsSync(statsOutPath)) {
  try {
    let t = fs.readFileSync(statsOutPath, "utf-8");
    if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
    existing = JSON.parse(t);
  } catch {}
}

const now = Date.now();
const MS_DAY = 86400000;
const MS_3M = 91 * MS_DAY;
const MS_6M = 183 * MS_DAY;
const MS_12M = 366 * MS_DAY;

let processed = 0, skipped = 0;

for (const fed of targetFeds) {
  if (!players[fed]) { skipped++; continue; }

  const raw = extractPlayerStats(fed, outputRoot);
  if (!raw) { skipped++; continue; }

  /*
   * raw.courseTee: { "key|tee": { rounds: [{ gross, sd, hi, dateSort, ... }] } }
   * raw.hcpHistory: [{ d: timestamp, h: hcp }] sorted asc
   * raw: numRounds, currentHcp, avgGross20, avgSD20, lastSD, ...
   */

  /* ── Collect ALL round timestamps from courseTee (these are 18H named-course rounds) ── */
  const allRounds = [];
  for (const ct of Object.values(raw.courseTee)) {
    for (const r of ct.rounds) {
      if (r.dateSort > 0) allRounds.push(r);
    }
  }
  allRounds.sort((a, b) => b.dateSort - a.dateSort);

  /* ── Also use hcpHistory for broader activity (includes 9H and unnamed) ── */
  const allDates = (raw.hcpHistory || []).map(h => h.d).filter(d => d > 0);

  /* ── Period counts (use hcpHistory for wider coverage) ── */
  const roundsLast3m = allDates.filter(d => now - d <= MS_3M).length;
  const roundsLast6m = allDates.filter(d => now - d <= MS_6M).length;
  const roundsLast12m = allDates.filter(d => now - d <= MS_12M).length;
  const lastDate = allDates.length > 0 ? Math.max(...allDates) : 0;
  const lastRoundDate = lastDate > 0 ? new Date(lastDate).toISOString().slice(0, 10) : null;

  /* ── SD stats from 18H rounds ── */
  const sds = allRounds.filter(r => r.sd != null).map(r => r.sd);
  const sds5 = sds.slice(0, 5);
  const sds20 = sds.slice(0, 20);
  const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const avgSD5 = avg(sds5);
  const best8 = sds20.length > 0
    ? [...sds20].sort((a, b) => a - b).slice(0, Math.min(8, sds20.length))
    : [];
  const avgSD8 = avg(best8);

  /* ── Gross stats ── */
  const grosses = allRounds.filter(r => r.gross != null).map(r => r.gross);
  const avgGross5 = avg(grosses.slice(0, 5));
  const grosses12m = allRounds.filter(r => r.gross != null && now - r.dateSort <= MS_12M).map(r => r.gross);
  const bestGross = grosses12m.length > 0 ? Math.min(...grosses12m) : null;

  /* ── HCP Trend ── */
  let hcpTrend = "stable", hcpDelta3m = null;
  const hh = raw.hcpHistory || [];
  if (hh.length >= 2) {
    const recent = hh[hh.length - 1]?.h;
    const cutoff = now - MS_3M;
    const older = hh.filter(h => h.d <= cutoff);
    const old = older.length > 0 ? older[older.length - 1]?.h : hh[0]?.h;
    if (recent != null && old != null) {
      hcpDelta3m = Math.round((recent - old) * 10) / 10;
      if (hcpDelta3m <= -1.5) hcpTrend = "up";
      else if (hcpDelta3m >= 1.5) hcpTrend = "down";
    }
  }

  /* ── Form Alert ── */
  let formAlert = null;
  if (sds20.length >= 5) {
    const mean = avg(sds20);
    const sigma = Math.sqrt(sds20.reduce((s, v) => s + (v - mean) ** 2, 0) / sds20.length);
    const last3 = sds20.slice(0, 3);
    if (last3.length >= 3 && sigma > 0) {
      if (last3.every(sd => sd < mean - sigma * 0.5)) formAlert = "hot";
      else if (last3.every(sd => sd > mean + sigma * 0.5)) formAlert = "cold";
    }
  }

  const r = v => v != null ? Math.round(v * 10) / 10 : null;

  existing[fed] = {
    lastRoundDate,
    roundsTotal: raw.numRounds,
    roundsLast3m, roundsLast6m, roundsLast12m,
    avgSD5: r(avgSD5), avgSD8: r(avgSD8), avgSD20: r(raw.avgSD20),
    lastSD: r(raw.lastSD), currentHcp: r(raw.currentHcp),
    hcpTrend, hcpDelta3m, formAlert,
    bestGross, avgGross5: r(avgGross5), avgGross20: r(raw.avgGross20),
  };
  processed++;
}

const outDir = path.dirname(statsOutPath);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(statsOutPath, JSON.stringify(existing, null, 2), "utf-8");

console.log(`✅ ${processed} enriched, ${skipped} skipped`);
console.log(`📄 ${statsOutPath}`);

// Diagnostic
const vals = Object.values(existing);
const withSD = vals.filter(v => v.avgSD8 != null).length;
const act3 = vals.filter(v => v.roundsLast3m > 0).length;
const act12 = vals.filter(v => v.roundsLast12m > 0).length;
const hot = vals.filter(v => v.formAlert === "hot").length;
const cold = vals.filter(v => v.formAlert === "cold").length;
console.log(`   ${withSD} com SD · ${act3} activos 3m · ${act12} activos 12m · ${hot} 🔥 · ${cold} ❄️`);
// Sample one player
const sample = Object.entries(existing).find(([,v]) => v.roundsLast12m > 0);
if (sample) console.log(`   Amostra [${sample[0]}]:`, JSON.stringify(sample[1]));
