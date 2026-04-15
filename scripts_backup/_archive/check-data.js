const fs = require("fs");
const p = "output/52884/analysis/data.json";
if (!fs.existsSync(p)) { console.log("Nao encontrei", p); process.exit(1); }
const d = JSON.parse(fs.readFileSync(p, "utf-8"));
console.log("HCP_INFO:", JSON.stringify(d.HCP_INFO, null, 2));
console.log("\nMETA:", JSON.stringify(d.META, null, 2));
// Last 5 rounds by date
const rounds = [];
for (const c of (d.DATA || [])) { for (const r of (c.rounds || [])) rounds.push({ ...r, _course: c.course }); }
rounds.sort((a, b) => (b.dateSort || 0) - (a.dateSort || 0));
console.log("\nUltimos 5 resultados no data.json:");
for (let i = 0; i < Math.min(5, rounds.length); i++) {
  const r = rounds[i];
  console.log("  " + r.date + " | " + r._course + " | gross=" + r.gross + " | sd=" + r.sd + " | hi=" + r.hi + " | " + r.eventName);
}
