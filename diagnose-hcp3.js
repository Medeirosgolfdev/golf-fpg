// diagnose-hcp3.js — Chama preparePlayerData exactamente como make-scorecards-ui.js
const path = require("path");
const { discoverPlayers } = require("./lib/players");
const { extractAllPlayerStats } = require("./lib/cross-stats");
const { preparePlayerData } = require("./lib/process-data");

const FED = "52884";
const outputRoot = path.join(process.cwd(), "output");
const allPlayers = discoverPlayers(outputRoot, FED);
const crossStats = extractAllPlayerStats(allPlayers, outputRoot);

const data = preparePlayerData(FED, allPlayers, crossStats);
const hi = data.hcpInfo;

console.log("\n=== hcpInfo retornado por preparePlayerData ===");
console.log(JSON.stringify(hi, null, 2));

if (hi.current === 54 || hi.current === null) {
  console.log("\n!! BUG: current=" + hi.current);
  
  // Agora simular o mesmo calculo manualmente
  const fs = require("fs");
  function pd(s) { const m = typeof s === "string" && s.match(/\/Date\((\d+)\)\//); return m ? new Date(Number(m[1])) : null; }
  function toNum(x) { const n = Number(x); return Number.isFinite(n) ? n : null; }
  
  const whs = JSON.parse(fs.readFileSync(path.join(outputRoot, FED, "whs-list.json"), "utf-8"));
  const rows = whs?.Records || [];
  
  // Apply melhorias like process-data does
  const { applyMelhorias } = require("./lib/melhorias");
  applyMelhorias(rows, FED, true);
  
  const sorted = [...rows].sort((a, b) => {
    const da = pd(a.played_at || a.hcp_date) || new Date(0);
    const db = pd(b.played_at || b.hcp_date) || new Date(0);
    return db - da;
  });
  
  const newest = sorted[0];
  console.log("\nManual check newest row:");
  console.log("  score_id:", newest?.score_id);
  console.log("  new_handicap:", newest?.new_handicap, "typeof:", typeof newest?.new_handicap);
  console.log("  toNum:", toNum(newest?.new_handicap));
  
  // Check if process-data modified the rows array
  console.log("\nTotal rows after preparePlayerData:", rows.length);
  const all54 = rows.filter(r => toNum(r.new_handicap) === 54);
  console.log("Rows with 54:", all54.length);
  for (const r of all54) {
    console.log("  score_id=" + r.score_id + " played_at=" + JSON.stringify(r.played_at)?.substring(0,30) + " hcp_date=" + JSON.stringify(r.hcp_date)?.substring(0,30));
  }
} else {
  console.log("\nOK! current=" + hi.current);
}
