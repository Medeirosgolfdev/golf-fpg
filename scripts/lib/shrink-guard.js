/**
 * scripts/lib/shrink-guard.js — Guarda anti-encolhimento + escrita atómica.
 *
 * Regra do projecto (CLAUDE.md): nunca gravar um ficheiro muito mais pequeno
 * do que o que está em disco sem `--force` — as fontes às vezes respondem 200
 * com lixo (lista vazia, página de erro, metade dos resultados).
 *
 * Uso:
 *   const { writeJsonGuarded } = require("./lib/shrink-guard");
 *   const r = writeJsonGuarded(outPath, data, {
 *     count: (d) => d.players.length,   // medida a comparar (default: bytes do JSON)
 *     maxDrop: 0.3,                     // fracção máxima de perda aceite (default 0.5)
 *     force: process.argv.includes("--force"),
 *     label: "players",
 *   });
 *   if (!r.written) process.exit(2);    // ou 1, consoante o script
 *
 * A escrita é sempre atómica com fsync (lib/atomic-write.js da raiz).
 * Ficheiro anterior ausente ou ilegível → grava (não há com que comparar).
 */

const fs = require("fs");
const path = require("path");
const hardened = require("../../lib/atomic-write");

/** true se `next` perde mais do que `maxDrop` (fracção) face a `prev`. */
function wouldShrink(prev, next, maxDrop = 0.5) {
  if (typeof prev !== "number" || !(prev > 0)) return false;
  if (typeof next !== "number" || !Number.isFinite(next)) return true;
  return next < prev * (1 - maxDrop);
}

/** Lê e conta o ficheiro em disco. null se não existir ou não se conseguir ler/contar. */
function countExisting(filePath, count) {
  if (!fs.existsSync(filePath)) return null;
  if (!count) {
    try { return fs.statSync(filePath).size; } catch { return null; }
  }
  try {
    let txt = fs.readFileSync(filePath, "utf8");
    if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
    const n = count(JSON.parse(txt));
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function hasForceFlag(argv = process.argv) {
  return argv.includes("--force");
}

/**
 * Grava `data` como JSON em `filePath` (atómico, fsync) excepto se encolher
 * mais do que `maxDrop` face ao que está em disco.
 *
 * @returns {{written:boolean, prev:number|null, next:number, reason?:string}}
 */
function writeJsonGuarded(filePath, data, opts = {}) {
  const {
    count = null,
    maxDrop = 0.5,
    force = hasForceFlag(),
    spaces = 2,
    trailingNewline = false,
    label = path.basename(filePath),
    log = console,
  } = opts;
  const txt = JSON.stringify(data, null, spaces) + (trailingNewline ? "\n" : "");
  const next = count ? count(data) : Buffer.byteLength(txt, "utf8");
  const prev = countExisting(filePath, count);
  if (!force && wouldShrink(prev, next, maxDrop)) {
    const unit = count ? "" : " bytes";
    const reason = `${label}: ${prev}${unit} em disco → ${next}${unit} novos (perda > ${Math.round(maxDrop * 100)}%). Não gravado — usar --force se for intencional.`;
    (log.error || log.log).call(log, `[shrink-guard] ${reason}`);
    return { written: false, prev, next, reason };
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  hardened.writeAtomic(filePath, txt, "utf-8");
  return { written: true, prev, next };
}

module.exports = { wouldShrink, countExisting, writeJsonGuarded, hasForceFlag };
