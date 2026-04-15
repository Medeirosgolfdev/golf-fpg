// diagnose-hcp2.js — simula exactamente o que process-data.js faz
const fs = require("fs");
const path = require("path");
const FED = "52884";

// Inline helpers
function parseDotNetDate(s) { const m = typeof s === "string" && s.match(/\/Date\((\d+)\)\//); return m ? new Date(Number(m[1])) : null; }
function toNum(x) { const n = Number(x); return Number.isFinite(n) ? n : null; }

// 1) Ler whs-list.json
const whsPath = path.join("output", FED, "whs-list.json");
const whs = JSON.parse(fs.readFileSync(whsPath, "utf-8"));
const rows = whs?.Records || [];
console.log("WHS rows:", rows.length);

// 2) Apply melhorias (simular)
const melh = JSON.parse(fs.readFileSync("melhorias.json", "utf-8"));
const patches = melh[FED];
if (patches) {
  let c = 0;
  for (const r of rows) {
    const p = patches[String(r.score_id)];
    if (p && p.whs) {
      const before = r.new_handicap;
      Object.assign(r, p.whs);
      if (r.new_handicap !== before) {
        console.log("!! Melhoria alterou new_handicap no score_id=" + r.score_id + ": " + before + " -> " + r.new_handicap);
      }
      c++;
    }
  }
  console.log("Melhorias WHS aplicadas:", c);
}

// 3) Ordenar exactamente como process-data.js faz (linhas 515-518)
const sortedRows = [...rows].sort((a, b) => {
  const da = parseDotNetDate(a.played_at || a.hcp_date) || new Date(0);
  const db = parseDotNetDate(b.played_at || b.hcp_date) || new Date(0);
  return db - da;
});

const newestRow = sortedRows[0] || {};
const current = toNum(newestRow.new_handicap) ?? null;

console.log("\nNewest row:");
console.log("  score_id:", newestRow.score_id);
console.log("  played_at:", newestRow.played_at);
console.log("  hcp_date:", newestRow.hcp_date);
console.log("  parsed date:", parseDotNetDate(newestRow.played_at || newestRow.hcp_date)?.toISOString());
console.log("  new_handicap (raw):", JSON.stringify(newestRow.new_handicap), "typeof:", typeof newestRow.new_handicap);
console.log("  toNum result:", current);

// 4) Procurar rows sem data DotNet valida
const badDate = rows.filter(r => !parseDotNetDate(r.played_at || r.hcp_date));
if (badDate.length) {
  console.log("\n!! " + badDate.length + " rows sem data DotNet valida:");
  for (const r of badDate.slice(0, 5)) {
    console.log("  score_id=" + r.score_id + " played_at=" + JSON.stringify(r.played_at) + " hcp_date=" + JSON.stringify(r.hcp_date) + " new_hcp=" + r.new_handicap);
  }
}

// 5) Procurar rows com new_handicap=54
const with54 = rows.filter(r => toNum(r.new_handicap) === 54);
console.log("\nRows com new_handicap=54:", with54.length);
for (const r of with54) {
  const d = parseDotNetDate(r.played_at || r.hcp_date);
  console.log("  score_id=" + r.score_id + " date=" + (d ? d.toISOString().slice(0,10) : "NO DATE") + " played_at=" + JSON.stringify(r.played_at)?.substring(0,30));
}
