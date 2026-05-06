/**
 * scripts/build-ffgolf-resultats-index.js
 *
 * Cria manifest `public/data/ffgolf-resultats-index.json` agregando todos os
 * JSONs gerados pelo scrape-ffgolf-resultats.js (excepto os _index-* internos).
 *
 * Output:
 * {
 *   generatedAt: ISO,
 *   total: N,
 *   tournaments: [
 *     {
 *       file, trnId, name, formule, date, dateIso, year,
 *       typeCompetition, ligue,
 *       seriesCount, totalPlayers, divisions: [{serieId, players}]
 *     }
 *   ]
 * }
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../public/data/ffgolf-resultats");
const OUT = path.resolve(__dirname, "../public/data/ffgolf-resultats-index.json");

if (!fs.existsSync(ROOT)) {
  console.error("❌ public/data/ffgolf-resultats não existe. Corre primeiro scrape-ffgolf-resultats.js");
  process.exit(1);
}

// Converte "DD/MM/YYYY" → "YYYY-MM-DD"
function dateToIso(s) {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const files = fs.readdirSync(ROOT)
  .filter((f) => /^\d{2}-\d{2}-\d+\.json$/.test(f))
  .sort();

console.log(`📋 A indexar ${files.length} ficheiros FFG Resultats`);

const tournaments = [];
for (const file of files) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf-8"));
    // file pattern: TT-LL-<trnId>.json
    const m = file.match(/^(\d{2})-(\d{2})-(\d+)\.json$/);
    if (!m) continue;
    const [, typeCompetition, ligue, trnId] = m;
    const dateIso = dateToIso(j.date);
    const year = dateIso ? parseInt(dateIso.slice(0, 4), 10) : null;
    const series = (j.details?.series || []).map((s) => ({
      serieId: s.serieId,
      label: s.label,
      players: s.players?.length || 0,
    }));
    const totalPlayers = series.reduce((sum, s) => sum + s.players, 0);
    tournaments.push({
      file,
      trnId,
      name: j.name,
      formule: j.formule || "Simple",
      date: j.date,
      dateIso,
      year,
      typeCompetition,
      ligue,
      seriesCount: series.length,
      totalPlayers,
      divisions: series,
    });
  } catch (e) {
    console.error(`⚠ ${file}: ${e.message}`);
  }
}

// Ordenar por dateIso DESC (mais recente primeiro)
tournaments.sort((a, b) => (b.dateIso || "").localeCompare(a.dateIso || ""));

const out = {
  generatedAt: new Date().toISOString(),
  source: "scripts/build-ffgolf-resultats-index.js",
  total: tournaments.length,
  tournaments,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf-8");
console.log(`✅ ${OUT}`);
console.log(`   ${tournaments.length} torneios · ${tournaments.reduce((s, t) => s + t.totalPlayers, 0)} jogadores total`);
const byYear = {};
tournaments.forEach((t) => { byYear[t.year || "?"] = (byYear[t.year || "?"] || 0) + 1; });
console.log("   por ano:", JSON.stringify(byYear));
