// lib/atomic-write.js — Escrita atómica para evitar corrupção por race conditions
//
// Problema observado várias vezes: ficheiros como players.json,
// inscricoes_nacionais.json, JogadoresPage.tsx, output/{fed}/analysis/data.json
// ficavam truncados a meio (corte limpo + às vezes padding de NULLs no fim).
//
// Causas conhecidas:
//   1. Vite watch-mode ou outro processo lê ficheiro enquanto outro escreve.
//   2. Múltiplos processos a escrever ficheiro em paralelo.
//   3. Editor + script a escrever simultaneamente.
//   4. ⚠ MAIS COMUM em mounts Windows com ficheiros grandes (>4MB):
//      writeFileSync + renameSync sem fsync → o rename acontece antes do
//      conteúdo estar completamente flushed ao disco → ficheiro truncado.
//
// Solução: write→fsync→tmp + rename.
//   - fsync força o OS a escrever todo o buffer pendente ao disco antes de
//     deixar o rename prosseguir. Resolve o caso #4.
//   - O rename é atómico no NTFS e POSIX, logo ou se vê a versão antiga
//     inteira ou a nova inteira, nunca a meio. Resolve casos #1, #2, #3.
//
// Uso:
//   const { writeAtomic, writeJsonAtomic } = require("../lib/atomic-write");
//   writeAtomic("file.json", "content", "utf-8");
//   writeJsonAtomic("file.json", { x: 1 });

const fs = require("fs");
const path = require("path");

let _tmpCounter = 0;

/** Escrita atómica de string/buffer. Default encoding: utf-8.
 *  Garante fsync ao tmp antes do rename — crítico em mounts Windows
 *  para evitar truncagem em ficheiros >4MB.
 */
function writeAtomic(target, content, encoding) {
  if (encoding == null) encoding = "utf-8";
  const dir = path.dirname(target);
  const tmp = path.join(dir, "." + path.basename(target) + ".tmp." + process.pid + "." + (++_tmpCounter) + "." + Date.now());
  let fd = null;
  try {
    fd = fs.openSync(tmp, "w");
    if (typeof content === "string") {
      const buf = Buffer.from(content, encoding);
      fs.writeSync(fd, buf, 0, buf.length, 0);
    } else {
      fs.writeSync(fd, content, 0, content.length, 0);
    }
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, target);
  } catch (e) {
    if (fd != null) { try { fs.closeSync(fd); } catch (_) {} }
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw e;
  }
}

/** Escrita atómica de JSON (auto-stringify, indent 2 por default). */
function writeJsonAtomic(target, obj, indent) {
  if (indent == null) indent = 2;
  writeAtomic(target, JSON.stringify(obj, null, indent), "utf-8");
}

/** Verifica se um ficheiro JSON é parseável. */
function verifyJsonFile(filePath) {
  try {
    const txt = fs.readFileSync(filePath, "utf-8");
    JSON.parse(txt.charCodeAt(0) === 0xFEFF ? txt.slice(1) : txt);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 120) };
  }
}

/** Escrita atómica de JSON com verificação pós-write. Re-tenta uma vez
 *  se a verificação falhar (defesa contra mounts Windows que truncam
 *  intermitentemente). Em ambientes saudáveis nunca re-tenta. */
function writeJsonAtomicVerified(target, obj, indent) {
  if (indent == null) indent = 2;
  for (let attempt = 1; attempt <= 2; attempt++) {
    writeJsonAtomic(target, obj, indent);
    const v = verifyJsonFile(target);
    if (v.ok) return;
    if (attempt === 1) {
      console.warn("[atomic-write] Ficheiro truncado após escrita (" + target + "): " + v.error + ". A re-tentar...");
      continue;
    }
    throw new Error("[atomic-write] Falha ao escrever " + target + " após 2 tentativas: " + v.error);
  }
}

module.exports = { writeAtomic, writeJsonAtomic, writeJsonAtomicVerified, verifyJsonFile };
