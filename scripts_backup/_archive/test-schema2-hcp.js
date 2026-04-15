// test-schema2-hcp.js — Testa a derivação de HCP para Schema 2
const fs = require("fs");
const path = require("path");
function pd(s) { const m = typeof s === "string" && s.match(/\/Date\((\d+)\)\//); return m ? new Date(Number(m[1])) : null; }
function toNum(x) { const n = Number(x); return Number.isFinite(n) ? n : null; }

const FED = process.argv[2] || "52393";
const whsPath = path.join("output", FED, "whs-list.json");
if (!fs.existsSync(whsPath)) { console.log("Nao encontrei", whsPath); process.exit(1); }

const rows = JSON.parse(fs.readFileSync(whsPath, "utf-8"))?.Records || [];

// Schema 2 normalization
for (const r of rows) {
  if (!r.score_id && r.id) r.score_id = r.id;
  if (!r.tourn_name && r.tournament_description) r.tourn_name = r.tournament_description;
  if (r.sgd == null && r.score_differential != null) r.sgd = r.score_differential;
  if (r.exact_handicap == null && r.exact_hcp != null) r.exact_handicap = r.exact_hcp;
  if (!r.hcp_date && r.score_date) r.hcp_date = r.score_date;
  if (!r.played_at && r.score_date) r.played_at = r.score_date;
}

// Get qualifying rounds sorted oldest first
const qualif = rows
  .filter(r => r.hcp_qualifying_round === 1 || (r.hcp_qualifying_name || "").toLowerCase() === "sim")
  .sort((a, b) => {
    const da = pd(a.played_at || a.hcp_date) || new Date(0);
    const db = pd(b.played_at || b.hcp_date) || new Date(0);
    return da - db;
  });

console.log("Qualifying rounds:", qualif.length);
console.log("\nLast 20 qualifying SDs:");
const last20 = qualif.slice(-20);
const sds = [];
for (const r of last20) {
  const sd = toNum(r.sgd) ?? toNum(r.score_differential);
  const d = pd(r.played_at || r.hcp_date);
  console.log("  " + (d ? d.toISOString().slice(0,10) : "?") + " SD=" + sd + " exact_hcp=" + r.exact_hcp + " " + (r.tourn_name||"").substring(0,40));
  if (sd != null) sds.push(sd);
}

// WHS calc
const _whsCalcCount = [0,0,0,1,1,1,2,2,2,3,3,3,4,4,4,5,5,6,6,7,8];
const _whsAdjust = [0,0,0,-2,-1,0,-1,0,0,0,0,0,0,0,0,0,0,0,0,0,0];

if (sds.length >= 3) {
  const n = _whsCalcCount[Math.min(sds.length, 20)];
  const adj = _whsAdjust[Math.min(sds.length, 20)];
  const bestN = [...sds].sort((a, b) => a - b).slice(0, n);
  const avg = bestN.reduce((a, b) => a + b, 0) / bestN.length;
  const hcp = Math.round((avg + adj) * 10) / 10;
  
  console.log("\nCalculo WHS:");
  console.log("  Total qualifying SDs:", sds.length);
  console.log("  Melhores " + n + " SDs:", bestN.join(", "));
  console.log("  Media:", (avg).toFixed(1));
  console.log("  Ajuste:", adj);
  console.log("  HCP calculado:", hcp);
  console.log("  exact_hcp (pre-round) do ultimo:", qualif[qualif.length-1]?.exact_hcp);
}

// Also check data.json if exists
const djPath = path.join("output", FED, "analysis", "data.json");
if (fs.existsSync(djPath)) {
  const dj = JSON.parse(fs.readFileSync(djPath, "utf-8"));
  console.log("\ndata.json HCP_INFO:", JSON.stringify(dj.HCP_INFO, null, 2));
}
