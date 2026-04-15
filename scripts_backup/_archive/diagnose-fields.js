// diagnose-fields.js — Mostra os diferentes schemas nos records WHS
const fs = require("fs");
const path = require("path");

const FED = process.argv[2] || "52884";
const whsPath = path.join("output", FED, "whs-list.json");
if (!fs.existsSync(whsPath)) { console.log("Nao encontrei", whsPath); process.exit(1); }

function pd(s) { const m = typeof s === "string" && s.match(/\/Date\((\d+)\)\//); return m ? new Date(Number(m[1])) : null; }

const rows = JSON.parse(fs.readFileSync(whsPath, "utf-8"))?.Records || [];
console.log("Total records:", rows.length);

// Group by unique key sets
const schemas = new Map();
for (const r of rows) {
  const keys = Object.keys(r).sort().join(",");
  if (!schemas.has(keys)) schemas.set(keys, []);
  schemas.get(keys).push(r);
}

console.log("\nSchemas encontrados:", schemas.size);
let si = 0;
for (const [keys, recs] of schemas) {
  si++;
  const d0 = pd(recs[0].played_at || recs[0].hcp_date);
  const dLast = pd(recs[recs.length-1].played_at || recs[recs.length-1].hcp_date);
  console.log(`\n=== Schema ${si} (${recs.length} records, ${d0?.toISOString().slice(0,10)||'?'} ... ${dLast?.toISOString().slice(0,10)||'?'}) ===`);
  console.log("Campos:", keys.split(",").join(", "));
  
  // Show first record as example
  const ex = recs[0];
  console.log("\nExemplo (score_id=" + ex.score_id + "):");
  for (const k of Object.keys(ex).sort()) {
    const v = ex[k];
    const display = typeof v === "string" && v.length > 60 ? v.substring(0, 60) + "..." : JSON.stringify(v);
    console.log("  " + k + ": " + display);
  }
}

// Check specifically for HCP-related fields
console.log("\n\n=== HCP fields per record (ultimos 10) ===");
const sorted = [...rows].sort((a, b) => {
  const da = pd(a.played_at || a.hcp_date) || new Date(0);
  const db = pd(b.played_at || b.hcp_date) || new Date(0);
  return db - da;
});
for (let i = 0; i < Math.min(10, sorted.length); i++) {
  const r = sorted[i];
  const d = pd(r.played_at || r.hcp_date);
  console.log(`\n#${i+1} id=${r.score_id} date=${d?.toISOString().slice(0,10)||'?'} tourn=${(r.tourn_name||r.tournament_description||'?').substring(0,40)}`);
  console.log("  new_handicap=" + JSON.stringify(r.new_handicap) + " exact_handicap=" + JSON.stringify(r.exact_handicap));
  console.log("  hcp_qualifying_round=" + JSON.stringify(r.hcp_qualifying_round) + " hcp_qualifying_name=" + JSON.stringify(r.hcp_qualifying_name));
  console.log("  played_at=" + JSON.stringify(r.played_at)?.substring(0,30) + " hcp_date=" + JSON.stringify(r.hcp_date)?.substring(0,30));
}
