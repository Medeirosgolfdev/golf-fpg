/**
 * scripts/split-nextcaddy-scope.js
 *
 * Divide um nextcaddy-scope JSON em N chunks. Cada chunk pode ser corrido em
 * paralelo numa janela PowerShell separada — isto dá paralelismo REAL (cada
 * processo Node tem o seu próprio HTTP keep-alive pool, sem contenção).
 *
 * Uso:
 *   node scripts/split-nextcaddy-scope.js scripts/nextcaddy-juvenil.json 4
 *
 * Output: scripts/nextcaddy-juvenil.chunk-1.json, .chunk-2.json, .chunk-3.json, .chunk-4.json
 */

const fs = require("fs");
const path = require("path");

const inputPath = process.argv[2];
const numChunks = parseInt(process.argv[3] || "4", 10);

if (!inputPath) {
  console.log("Uso: node scripts/split-nextcaddy-scope.js <scope.json> <numChunks>");
  process.exit(1);
}

const sc = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const tours = sc.tours || sc.tournaments || [];
const baseName = path.basename(inputPath).replace(/\.json$/, "");
const dir = path.dirname(inputPath);

// Distribute tours round-robin (so each chunk has mix of small/large tours)
const chunks = Array.from({ length: numChunks }, () => []);
tours.forEach((t, i) => chunks[i % numChunks].push(t));

for (let i = 0; i < numChunks; i++) {
  const out = path.join(dir, `${baseName}.chunk-${i + 1}.json`);
  fs.writeFileSync(out, JSON.stringify({
    ...sc,
    tours: chunks[i],
    total: chunks[i].length,
    chunk: { index: i + 1, totalChunks: numChunks },
  }, null, 2));
  console.log(`  Chunk ${i + 1}: ${chunks[i].length} tours → ${out}`);
}

console.log(`\nPara correr em paralelo, abre ${numChunks} PowerShell windows e em cada uma:`);
for (let i = 0; i < numChunks; i++) {
  console.log(`  Window ${i + 1}: node scripts\\scrape-nextcaddy.js --scope scripts\\${baseName}.chunk-${i + 1}.json --scorecards --concurrency 1`);
}
