const fs = require("fs");
const path = require("path");
const FED = "52884";
const whsPath = path.join("output", FED, "whs-list.json");
if (!fs.existsSync(whsPath)) { console.log("Nao encontrei", whsPath); process.exit(1); }
function pd(s) { const m = typeof s === "string" && s.match(/\/Date\((\d+)\)\//); return m ? new Date(Number(m[1])) : null; }
const rows = (JSON.parse(fs.readFileSync(whsPath, "utf-8"))?.Records) || [];
console.log("Total WHS Records:", rows.length);
const sorted = [...rows].sort((a, b) => { const da = pd(a.played_at || a.hcp_date) || new Date(0); const db = pd(b.played_at || b.hcp_date) || new Date(0); return db - da; });
console.log("\n--- Top 10 por data (mais recente primeiro) ---");
for (let i = 0; i < Math.min(10, sorted.length); i++) { const r = sorted[i]; const d = pd(r.played_at || r.hcp_date); console.log("  #"+(i+1)+": id="+r.score_id+"  date="+(d ? d.toISOString().slice(0,10) : "?")+"  new_hcp="+r.new_handicap+"  exact="+r.exact_handicap+"  tourn="+(r.tourn_name||"").substring(0,50)); }
const c = sorted[0]?.new_handicap != null ? Number(sorted[0].new_handicap) : null;
console.log("\nHCP_INFO.current:", c);
if (c === 54) { console.log("BUG: new_handicap=54!"); const ok = sorted.filter(r => r.new_handicap != null && Number(r.new_handicap) !== 54); if (ok.length) { const d = pd(ok[0].played_at || ok[0].hcp_date); console.log("Sem 54, seria:", ok[0].new_handicap, "de", d ? d.toISOString().slice(0,10) : "?"); } }
