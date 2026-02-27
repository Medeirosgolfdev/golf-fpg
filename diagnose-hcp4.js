// diagnose-hcp4.js — Monkey-patch process-data.js para encontrar o bug
const path = require("path");
const fs = require("fs");

function pd(s) { const m = typeof s === "string" && s.match(/\/Date\((\d+)\)\//); return m ? new Date(Number(m[1])) : null; }
function toNum(x) { const n = Number(x); return Number.isFinite(n) ? n : null; }

const FED = "52884";
const whsPath = path.join("output", FED, "whs-list.json");
const whs = JSON.parse(fs.readFileSync(whsPath, "utf-8"));
const rows = whs?.Records || [];

// 1) ANTES de applyMelhorias: verificar newest
function checkNewest(label) {
  const sorted = [...rows].sort((a, b) => {
    const da = pd(a.played_at || a.hcp_date) || new Date(0);
    const db = pd(b.played_at || b.hcp_date) || new Date(0);
    return db - da;
  });
  const n = sorted[0];
  console.log(`[${label}] newest: id=${n?.score_id} new_hcp=${JSON.stringify(n?.new_handicap)} (typeof ${typeof n?.new_handicap})`);
  return n;
}

checkNewest("1-ANTES melhorias");

// 2) Aplicar melhorias
const { applyMelhorias } = require("./lib/melhorias");
applyMelhorias(rows, FED, true);
checkNewest("2-DEPOIS melhorias");

// 3) Verificar se alguma melhoria tem new_handicap como campo
const melh = JSON.parse(fs.readFileSync("melhorias.json", "utf-8"));
const patches = melh[FED];
for (const [sid, p] of Object.entries(patches)) {
  if (sid.startsWith("_")) continue;
  if (p?.whs && "new_handicap" in p.whs) {
    console.log("!! Melhoria " + sid + " tem new_handicap no whs:", p.whs.new_handicap);
  }
}

// 4) Verificar score 4212437 especificamente
const target = rows.find(r => String(r.score_id) === "4212437");
if (target) {
  console.log("\nScore 4212437 detalhes:");
  console.log("  new_handicap:", JSON.stringify(target.new_handicap), typeof target.new_handicap);
  console.log("  exact_handicap:", target.exact_handicap);
  console.log("  calc_low_hcp:", target.calc_low_hcp);
  console.log("  calc_score_avg:", target.calc_score_avg);
}

// 5) Verificar se algum row tem new_handicap >= 54
for (const r of rows) {
  const nh = toNum(r.new_handicap);
  if (nh != null && nh >= 50) {
    const d = pd(r.played_at || r.hcp_date);
    console.log("!! Row com HCP alto: id=" + r.score_id + " new_hcp=" + r.new_handicap + " date=" + (d ? d.toISOString().slice(0,10) : "?"));
  }
}

// 6) Agora SIMULAR exactamente linhas 515-531 de process-data.js
console.log("\n=== Simulacao exacta do codigo process-data.js ===");
const sortedRows = rows.length > 0 ? [...rows].sort((a, b) => {
  const da = pd(a.played_at || a.hcp_date) || new Date(0);
  const db = pd(b.played_at || b.hcp_date) || new Date(0);
  return db - da;
}) : [];
const newestRow = sortedRows[0] || {};
console.log("newestRow.score_id:", newestRow.score_id);
console.log("newestRow.new_handicap:", JSON.stringify(newestRow.new_handicap), typeof newestRow.new_handicap);
console.log("toNum(newestRow.new_handicap):", toNum(newestRow.new_handicap));
const current = toNum(newestRow.new_handicap) ?? null;
console.log("current (final):", current);

// 7) Agora correr preparePlayerData e comparar
const { discoverPlayers } = require("./lib/players");
const { extractAllPlayerStats } = require("./lib/cross-stats");
const { preparePlayerData } = require("./lib/process-data");
const outputRoot = path.join(process.cwd(), "output");
const allPlayers = discoverPlayers(outputRoot, FED);
const crossStats = extractAllPlayerStats(allPlayers, outputRoot);
const data = preparePlayerData(FED, allPlayers, crossStats);
console.log("\npreparePlayerData result:", data.hcpInfo.current);

// 8) Verificar rows DEPOIS de preparePlayerData (mutação?)
console.log("\n=== DEPOIS de preparePlayerData, re-check rows ===");
const whs2 = JSON.parse(fs.readFileSync(whsPath, "utf-8"));
const rows2 = whs2?.Records || [];
const t2 = rows2.find(r => String(r.score_id) === "4212437");
console.log("Fresh read 4212437 new_handicap:", t2?.new_handicap);
