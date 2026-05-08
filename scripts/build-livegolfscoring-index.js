const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "../public/data/rfegolf-livegolfscoring");
const OUT = path.resolve(__dirname, "../public/data/rfegolf-livegolfscoring-index.json");

const entries = [];
for (const f of fs.readdirSync(ROOT).filter(x => /^\d+\.json$/.test(x))) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf-8"));
    if (!d.ok) continue;
    const name = d.meta?.name || "";
    const m = name.match(/\b(20\d{2})\b/);
    let year = m ? parseInt(m[1], 10) : null;
    if (!year && d.scrapedAt) year = parseInt(d.scrapedAt.slice(0, 4), 10);
    let category = null;
    if (/Sub[\s-]?(\d+)/i.test(name)) category = "Sub-" + name.match(/Sub[\s-]?(\d+)/i)[1];
    else if (/Alev[íi]n/i.test(name)) category = "Alevín";
    else if (/Benjam[íi]n/i.test(name)) category = "Benjamín";
    else if (/Infantil/i.test(name)) category = "Infantil";
    else if (/Cadete/i.test(name)) category = "Cadete";
    else if (/Junior/i.test(name)) category = "Junior";
    else if (/Juvenil/i.test(name)) category = "Juvenil";
    let sex = null;
    if (/Masculino/i.test(name)) sex = "M";
    else if (/Femenino/i.test(name)) sex = "F";
    const totalPlayers = d.rounds?.[0]?.players?.length || 0;
    entries.push({
      id: d.id,
      file: `${d.id}.json`,
      filePath: `rfegolf-livegolfscoring/${d.id}.json`,
      name, year, category, sex,
      course: d.meta?.course,
      dateRange: d.meta?.dateRange,
      nRounds: d.rounds?.length || 0,
      players: totalPlayers,
      scrapedAt: d.scrapedAt,
    });
  } catch (e) {}
}
entries.sort((a, b) => (b.year || 0) - (a.year || 0) || (b.id - a.id));
const byYear = {}, byCategory = {};
for (const e of entries) {
  if (e.year) byYear[e.year] = (byYear[e.year] || 0) + 1;
  if (e.category) byCategory[e.category] = (byCategory[e.category] || 0) + 1;
}
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), total: entries.length, byYear, byCategory, entries }, null, 2));
console.log(`Built: ${entries.length} entries → ${OUT}`);
console.log(`byYear:`, byYear);
