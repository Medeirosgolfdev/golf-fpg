// lib/atomic-write.js — Escrita atómica para evitar corrupção por race conditions
//
// Problema observado várias vezes: ficheiros como players.json,
// inscricoes_nacionais.json, JogadoresPage.tsx ficavam truncados a meio
// (corte limpo + às vezes padding de NULLs no fim). Causa típica:
//   - Vite watch-mode lê ficheiro enquanto outro processo escreve
//   - Múltiplos processos a escrever ficheiro em paralelo
//   - Editor + script a escrever simultaneamente
//
// Solução: write→tmp + rename. O rename é atómico no NTFS e POSIX, logo
// ou se vê a versão antiga inteira ou a nova inteira, nunca a meio.
//
// Uso:
//   const { writeAtomic, writeJsonAtomic } = require("../lib/atomic-write");
//   writeAtomic("file.json", "content", "utf-8");
//   writeJsonAtomic("file.json", { x: 1 });

const fs = require("fs");
const path = require("path");

let _tmpCounter = 0;

/** Escrita atómica de string/buffer. Default encoding: utf-8. */
function writeAtomic(target, content, encoding = "utf-8") {
  const dir = path.dirname(target);
  // tmp no MESMO dir (cross-volume rename falha em alguns FS Windows)
  const tmp = path.join(dir, "." + path.basename(target) + ".tmp." + process.pid + "." + (++_tmpCounter) + "." + Date.now());
  try {
    fs.writeFileSync(tmp, content, encoding);
    fs.renameSync(tmp, target);
  } catch (e) {
    // Cleanup do .tmp se a operação falhar a meio
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
}

/** Escrita atómica de JSON (auto-stringify, indent 2 por default). */
function writeJsonAtomic(target, obj, indent = 2) {
  writeAtomic(target, JSON.stringify(obj, null, indent), "utf-8");
}

module.exports = { writeAtomic, writeJsonAtomic };
