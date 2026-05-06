/**
 * scripts/build-lgpidf-index.js
 *
 * Cria um manifest `public/data/ffgolf-lgpidf-index.json` com todos os JSONs
 * LGPIDF (Paris-Île-de-France) gerados pelo parse-pdfs.js. A FFGPage usa este
 * manifest para descobrir e carregar os torneios PDF-only no browser.
 *
 * Output:
 * {
 *   generatedAt: ISO,
 *   tournaments: [
 *     { file, slug, year, tournament, divisions[], inscritosCount, playersCount, hasTeeTimes, hasCourseMap }
 *   ]
 * }
 */
const fs = require("fs");
const path = require("path");

const FFGOLF_DIR = path.resolve(__dirname, "../public/data/ffgolf");
const OUT_PATH = path.resolve(__dirname, "../public/data/ffgolf-lgpidf-index.json");

if (!fs.existsSync(FFGOLF_DIR)) {
  console.error("❌ public/data/ffgolf não existe — corre primeiro parse-pdfs.js");
  process.exit(1);
}

const files = fs.readdirSync(FFGOLF_DIR)
  .filter((f) => f.startsWith("lgpidf-") && f.endsWith(".json"))
  .sort();

console.log(`📋 Indexar ${files.length} ficheiros LGPIDF`);

const tournaments = [];
for (const file of files) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(FFGOLF_DIR, file), "utf-8"));
    const inscritosCount = (j.inscritosPdfs || []).reduce((s, p) => s + (p.players?.length || 0), 0);
    tournaments.push({
      file,
      slug: j.slug,
      year: j.year,
      tournament: j.tournament,
      section: j.section || "lgpidf",
      source: j.source || "",
      divisions: j.divisions || [],
      rounds: j.rounds || 1,
      inscritosCount,
      playersCount: (j.players || []).length,
      teeTimePdfsCount: (j.teeTimePdfs || []).length,
      courseMapPdfsCount: (j.courseMapPdfs || []).length,
      scrapedAt: j.scrapedAt,
    });
  } catch (e) {
    console.error(`⚠ ${file}: ${e.message}`);
  }
}

// Ordenar por ano DESC, depois por slug
tournaments.sort((a, b) => (b.year - a.year) || a.slug.localeCompare(b.slug));

const out = {
  generatedAt: new Date().toISOString(),
  source: "scripts/build-lgpidf-index.js",
  total: tournaments.length,
  tournaments,
};

fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf-8");
console.log(`✅ ${OUT_PATH} (${tournaments.length} torneios)`);
console.log(`   Inscritos total: ${tournaments.reduce((s, t) => s + t.inscritosCount, 0)}`);
console.log(`   Players total: ${tournaments.reduce((s, t) => s + t.playersCount, 0)}`);
