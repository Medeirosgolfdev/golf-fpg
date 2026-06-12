/**
 * scripts/lib/atomic-write.js — Escrita atómica de JSON.
 *
 * Escreve para um .tmp e renomeia no fim — um crash a meio da escrita
 * (ou um scrape interrompido) nunca deixa um JSON truncado no destino.
 * (Exactamente o bug que corrompeu drive-data-2026-06.json em 2026-06-12.)
 *
 * Uso:
 *   const { writeJsonAtomic } = require("./lib/atomic-write");
 *   writeJsonAtomic(outPath, data);
 */

const fs = require("fs");

function writeJsonAtomic(filePath, data, { spaces = 2 } = {}) {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, spaces));
  fs.renameSync(tmp, filePath);
}

module.exports = { writeJsonAtomic };
