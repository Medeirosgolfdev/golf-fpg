#!/usr/bin/env node
/**
 * build-fpg-files-index.js — escreve `public/data/fpg-files-index.json` com os
 * ficheiros de torneios da FPG que existem de facto:
 *   - pull-torneiosNNN.json        (FPGPage)
 *   - drive-data-YYYY-MM.json      (FPGPage → Ranking PJA, DrivePage)
 *   - aquapor-data-YYYY-MM.json    (idem)
 *
 * Porquê: as páginas sondavam os nomes às cegas (pull-torneios000… até falharem
 * dois seguidos; todos os meses de drive/aquapor desde o 1.º ano) e cada
 * ficheiro em falta era um 404 na consola e no Vercel. Com o índice, só se pede
 * o que existe.
 *
 * Gerado — NÃO vai para o git (.gitignore). Corre no `predev` e no `prebuild`
 * (o Vercel corre o `npm run build`, por isso cada deploy leva o índice certo,
 * também quando um workflow acrescenta um mês novo). À mão:
 *     node scripts/build-fpg-files-index.js
 *
 * Sem data de geração no ficheiro, de propósito: o conteúdo só muda quando os
 * ficheiros mudam.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeAtomic } = require("./lib/atomic-write");

const DATA_DIR = path.join(__dirname, "..", "public", "data");
const OUT_FILE = path.join(DATA_DIR, "fpg-files-index.json");

const SERIES = {
  "pull-torneios": /^pull-torneios\d{3}\.json$/,
  "drive-data": /^drive-data-\d{4}-\d{2}\.json$/,
  "aquapor-data": /^aquapor-data-\d{4}-\d{2}\.json$/,
};

/** Nomes de ficheiro (sem pasta) → índice por série, cada lista ordenada. */
function buildIndex(names) {
  const out = { _gerado: "scripts/build-fpg-files-index.js" };
  for (const [key, re] of Object.entries(SERIES)) {
    out[key] = names.filter((n) => re.test(n)).sort();
  }
  return out;
}

function main() {
  const index = buildIndex(fs.readdirSync(DATA_DIR));
  if (index["pull-torneios"].length === 0) {
    console.error("[fpg-files-index] nenhum pull-torneios*.json em public/data — índice não gravado");
    process.exit(1);
  }
  const json = JSON.stringify(index, null, 1) + "\n";
  const prev = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, "utf8") : null;
  if (prev !== json) writeAtomic(OUT_FILE, json);
  console.log(`[fpg-files-index] ${Object.keys(SERIES).map((k) => `${k}: ${index[k].length}`).join(" · ")}`);
}

if (require.main === module) main();

module.exports = { buildIndex, SERIES };
