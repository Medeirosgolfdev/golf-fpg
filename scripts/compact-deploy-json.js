#!/usr/bin/env node
/**
 * compact-deploy-json.js — corre DEPOIS do `vite build`, SÓ no Vercel.
 * ═══════════════════════════════════════════════════════════════════════
 * Os JSON de `public/` estão no repo indentados (diffs legíveis, e há scripts
 * que os editam por splice ou que os regravam com `JSON.stringify(…, null, 2)`
 * — o pull-torneios tem ~10 escritores). Mas o browser não precisa de
 * indentação: o juniors.json passa de 52 para ~30 MB, o uskids-results de 23
 * para ~6 MB, o pull-torneios001 de 21 para ~6 MB. Medido a 21/10/2026 sobre
 * todo o `public/`: 42 054 JSON, 1 269 → 734 MB, ~11 s.
 *
 * Por isso a compactação faz-se na CÓPIA que vai para o deploy (`output/`,
 * o outDir do Vite), não nos ficheiros do repo nem nos geradores. Um ficheiro
 * que não seja JSON válido fica como está.
 *
 * Corre só quando `VERCEL` está definido (em local o `output/` é também a
 * pasta do scraper). Para experimentar: `node scripts/compact-deploy-json.js --dir <pasta>`.
 * ═══════════════════════════════════════════════════════════════════════
 */
"use strict";

const fs = require("fs");
const path = require("path");

/** Regrava compactos os .json de `dir` (recursivo). Devolve os totais. */
function compactDir(dir) {
  const r = { files: 0, compacted: 0, skipped: 0, before: 0, after: 0 };
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith(".json")) continue;
      r.files++;
      const raw = fs.readFileSync(p, "utf8");
      const size = Buffer.byteLength(raw, "utf8");
      r.before += size;
      let compact;
      try { compact = JSON.stringify(JSON.parse(raw)); } catch { r.skipped++; r.after += size; continue; }
      const nsize = Buffer.byteLength(compact, "utf8");
      if (nsize < size) { fs.writeFileSync(p, compact, "utf8"); r.compacted++; r.after += nsize; } else r.after += size;
    }
  };
  walk(dir);
  return r;
}

module.exports = { compactDir };

if (require.main === module) {
  const i = process.argv.indexOf("--dir");
  const dir = i > 0 ? process.argv[i + 1] : null;
  if (!dir && !process.env.VERCEL) {
    console.log("ℹ️  compact-deploy-json: fora do Vercel — nada a fazer.");
    process.exit(0);
  }
  const alvo = path.resolve(dir || path.join(process.cwd(), "output"));
  const t0 = Date.now();
  const r = compactDir(alvo);
  const mb = (b) => (b / 1024 / 1024).toFixed(0);
  console.log(`🗜️  compact-deploy-json: ${r.compacted}/${r.files} JSON compactados (${r.skipped} inválidos ficaram como estavam) · ` +
    `${mb(r.before)} → ${mb(r.after)} MB · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
