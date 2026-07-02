/**
 * scripts/lib/atomic-write.js — Escrita atómica de JSON.
 *
 * Shim de compatibilidade: delega na versão ENDURECIDA de lib/atomic-write.js
 * (raiz), que faz write em chunks + fsync no fd + verificação de tamanho +
 * fsync na directoria após rename. Antes existiam aqui 2 implementações
 * divergentes — a local não tinha fsync e podia truncar JSONs grandes em
 * mounts Windows/virtiofs (o bug que corrompeu drive-data-2026-06.json em
 * 2026-06-12). Unificado em 2026-07-02.
 *
 * Uso (assinatura preservada):
 *   const { writeJsonAtomic } = require("./lib/atomic-write");
 *   writeJsonAtomic(outPath, data);
 *   writeJsonAtomic(outPath, data, { spaces: 0 });
 */

const hardened = require("../../lib/atomic-write");

function writeJsonAtomic(filePath, data, { spaces = 2 } = {}) {
  hardened.writeJsonAtomic(filePath, data, spaces);
}

module.exports = {
  writeJsonAtomic,
  writeAtomic: hardened.writeAtomic,
  writeJsonAtomicVerified: hardened.writeJsonAtomicVerified,
  verifyJsonFile: hardened.verifyJsonFile,
};
