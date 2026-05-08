/**
 * scripts/build-livegolfscoring-map.js
 *
 * Cruza:
 *   - public/data/rfegolf-livegolfscoring/*.json (HTML hbh — fonte primária)
 *   - public/data/rfegolf-resultats/*.json (microsite RFEGolf — CompId + meta)
 *
 * E gera public/data/livegolfscoring-map.json com:
 *   { compIdToLgs: { 15956: 322, ... },
 *     lgsToCompId: { 322: 15956, ... } }
 *
 * Matching: nome normalizado + ano coincidente.
 */
const fs = require("fs");
const path = require("path");

const LGS_DIR = path.resolve(__dirname, "../public/data/rfegolf-livegolfscoring");
const RFEG_DIR = path.resolve(__dirname, "../public/data/rfegolf-resultats");
const OUT = path.resolve(__dirname, "../public/data/livegolfscoring-map.json");

function norm(s) {
  if (!s) return "";
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
function extractYear(s) {
  const m = String(s || "").match(/\b(20\d{2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

const lgs = [];
for (const f of fs.readdirSync(LGS_DIR).filter(x => x.endsWith(".json"))) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(LGS_DIR, f), "utf-8"));
    if (!d.ok) continue;
    const name = d.meta?.name || "";
    let year = extractYear(name);
    if (!year && d.scrapedAt) year = parseInt(d.scrapedAt.slice(0, 4), 10);
    lgs.push({ id: d.id, name, normName: norm(name), year, course: d.meta?.course });
  } catch (e) { /* skip */ }
}

const rfeg = [];
for (const f of fs.readdirSync(RFEG_DIR).filter(x => x.endsWith(".json"))) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(RFEG_DIR, f), "utf-8"));
    if (!d.ok || !d.meta) continue;
    const name = d.meta.name || "";
    let year = extractYear(name);
    if (!year && d.meta.dateStart) {
      const m = /\d{1,2}\/\d{1,2}\/(\d{4})/.exec(d.meta.dateStart);
      if (m) year = parseInt(m[1], 10);
    }
    rfeg.push({ compId: d.compId, name, normName: norm(name), year, course: d.meta.course });
  } catch (e) { /* skip */ }
}

console.log(`livegolfscoring: ${lgs.length}, rfegolf: ${rfeg.length}`);

// Estratégia de match:
//   1. Exact normName + year
//   2. Substring overlap >= 60% + same year
function tokenSet(s) { return new Set(s.split(/\s+/).filter(t => t.length >= 3)); }
function jaccard(a, b) {
  const A = tokenSet(a), B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

const compIdToLgs = {};
const lgsToCompId = {};
const matched = [];
const unmatched = [];

for (const r of rfeg) {
  let best = null, bestScore = 0;
  for (const l of lgs) {
    if (r.year && l.year && Math.abs(r.year - l.year) > 1) continue;
    if (r.normName === l.normName && r.year === l.year) {
      best = l; bestScore = 1.0; break;
    }
    const j = jaccard(r.normName, l.normName);
    if (j > bestScore) { bestScore = j; best = l; }
  }
  if (best && bestScore >= 0.7 && r.year === best.year) {
    compIdToLgs[r.compId] = best.id;
    lgsToCompId[best.id] = r.compId;
    matched.push({ compId: r.compId, lgsId: best.id, score: bestScore.toFixed(2), name: r.name });
  } else {
    unmatched.push({ compId: r.compId, name: r.name, year: r.year });
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  totalLgs: lgs.length,
  totalRfeg: rfeg.length,
  matched: matched.length,
  unmatched: unmatched.length,
  compIdToLgs,
  lgsToCompId,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`Matched: ${matched.length}, unmatched: ${unmatched.length}`);
console.log(`Output: ${OUT}`);
console.log("Top 5 matches:");
for (const m of matched.slice(0, 5)) console.log(`  RFEG ${m.compId} ↔ LGS ${m.lgsId} (${m.score}) — ${m.name.slice(0, 60)}`);
