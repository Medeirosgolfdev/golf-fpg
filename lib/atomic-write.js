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
 *
 *  Defesas contra truncagem em mounts Windows/virtiofs com files grandes:
 *    1. Escrita em chunks de 1MB (em vez de single writeSync) — alguns
 *       file systems quebram writes >2-4MB.
 *    2. fsync no fd antes do close.
 *    3. Verificação de tamanho pós-write (size do tmp == buf.length).
 *    4. fsync na directoria pai após rename — força o entry de directoria
 *       a ser commitado (NTFS/APFS já são atómicos no rename mas virtiofs
 *       pode demorar a propagar).
 *    5. Re-leitura do tmp e comparação de tamanho antes do rename — última
 *       linha de defesa contra escritas parciais que passam fsync.
 */
function writeAtomic(target, content, encoding) {
  if (encoding == null) encoding = "utf-8";
  const dir = path.dirname(target);
  const tmp = path.join(dir, "." + path.basename(target) + ".tmp." + process.pid + "." + (++_tmpCounter) + "." + Date.now());
  const buf = typeof content === "string" ? Buffer.from(content, encoding) : content;
  const expectedSize = buf.length;
  const CHUNK = 1024 * 1024; // 1 MiB
  let fd = null;
  try {
    fd = fs.openSync(tmp, "w");
    // Escrever em chunks pequenos — alguns FS quebram writeSync grandes
    let written = 0;
    while (written < buf.length) {
      const n = Math.min(CHUNK, buf.length - written);
      const w = fs.writeSync(fd, buf, written, n, written);
      if (w !== n) throw new Error("Partial write: requested " + n + " got " + w + " at offset " + written);
      written += w;
    }
    if (written !== expectedSize) {
      throw new Error("Wrote " + written + " bytes, expected " + expectedSize);
    }
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    // Verificação de tamanho do tmp ANTES do rename
    const tmpStat = fs.statSync(tmp);
    if (tmpStat.size !== expectedSize) {
      throw new Error("Tmp file size mismatch: " + tmpStat.size + " ≠ expected " + expectedSize);
    }
    fs.renameSync(tmp, target);
    // Verificação de tamanho APÓS rename (defesa contra rename parcial)
    try {
      const targetStat = fs.statSync(target);
      if (targetStat.size !== expectedSize) {
        throw new Error("Target file size mismatch após rename: " + targetStat.size + " ≠ expected " + expectedSize);
      }
    } catch (statErr) {
      throw new Error("Erro a verificar tamanho final: " + statErr.message);
    }
    // fsync na directoria — força commit do directory entry (importante em virtiofs)
    try {
      const dirFd = fs.openSync(dir, "r");
      try { fs.fsyncSync(dirFd); } catch (_) {}
      fs.closeSync(dirFd);
    } catch (_) {
      // fsync de directoria não é suportado em todos os FS — ignorar
    }
  } catch (e) {
    if (fd != null) { try { fs.closeSync(fd); } catch (_) {} }
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw e;
  }
}

/** Sleep síncrono via Atomics.wait num SharedArrayBuffer dummy.
 *  Sem dependências, funciona em qualquer Node. */
function _sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  const ia = new Int32Array(sab);
  Atomics.wait(ia, 0, 0, ms);
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

/** Escrita atómica de JSON com verificação pós-write.
 *
 *  Re-tenta até 4 vezes com backoff exponencial. Cada tentativa:
 *    1. Escreve atomicamente (write → fsync → rename → fsync dir).
 *    2. Verifica tamanho pós-rename (já feito dentro de writeAtomic).
 *    3. Re-lê e parseia o JSON para confirmar que ficou válido.
 *
 *  Em ambientes saudáveis nunca re-tenta. Em mounts Windows/virtiofs
 *  com files >4MB, pode precisar de 1-2 retries.
 */
function writeJsonAtomicVerified(target, obj, indent) {
  if (indent == null) indent = 2;
  const MAX_ATTEMPTS = 4;
  const BACKOFF_MS = [0, 100, 500, 2000];
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) _sleepSync(BACKOFF_MS[attempt - 1]);
    try {
      writeJsonAtomic(target, obj, indent);
      const v = verifyJsonFile(target);
      if (v.ok) {
        if (attempt > 1) {
          console.warn("[atomic-write] " + target + " OK na tentativa " + attempt + " (após " + (attempt - 1) + " falha(s))");
        }
        return;
      }
      lastError = v.error;
      console.warn("[atomic-write] Tentativa " + attempt + "/" + MAX_ATTEMPTS + " falhou para " + target + ": " + v.error);
    } catch (writeErr) {
      lastError = writeErr.message || String(writeErr);
      console.warn("[atomic-write] Tentativa " + attempt + "/" + MAX_ATTEMPTS + " erro de escrita em " + target + ": " + lastError);
    }
  }
  throw new Error("[atomic-write] Falha ao escrever " + target + " após " + MAX_ATTEMPTS + " tentativas. Último erro: " + lastError);
}

module.exports = { writeAtomic, writeJsonAtomic, writeJsonAtomicVerified, verifyJsonFile };
