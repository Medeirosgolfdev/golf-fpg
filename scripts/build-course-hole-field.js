#!/usr/bin/env node
/**
 * build-course-hole-field.js — escreve `public/data/course-hole-field.json`: em
 * cada campo e tee, o que os NOSSOS jogadores seguidos (as fichas em
 * `output/{fed}/analysis/data.json`) fizeram em cada buraco — birdies ou
 * melhor, pares, bogeys ou pior. Sem o Manuel: é «quem jogou aqui», para pôr
 * ao lado do histórico dele no «🎯 Plano de jogo» da Previsão (04/11/2026,
 * Mariana: «estes valores são do Manuel? ou do que quem jogou fez neste
 * buraco? — podíamos ter as 2 coisas»).
 *
 *   { "_gerado": "...", "c": { courseKey: { TEE: { r: voltas, j: jogadores,
 *       h: [[n, birdies, pares, bogeys], …] } } } }   (h[0] = buraco 1)
 *
 * Num campo de 9 jogado 18, os buracos 10–18 ficam em h[9..17] (a 2.ª volta);
 * a página junta-os ao 1–9. Tees com menos de 3 voltas não entram.
 *
 * Gerado — NÃO vai para o git (.gitignore). Corre no `predev` e no `prebuild`
 * (o Vercel corre o `npm run build`). À mão: node scripts/build-course-hole-field.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeAtomic } = require("./lib/atomic-write");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "output");
const OUT_FILE = path.join(ROOT, "public", "data", "course-hole-field.json");
const MANUEL_FED = "52884";
const MIN_VOLTAS = 3;

/** Junta as voltas de uma ficha (`DATA` + `HOLES`) ao acumulador. */
function juntaFicha(acc, fed, d) {
  for (const c of d.DATA || []) {
    for (const r of c.rounds || []) {
      const key = r.courseKey;
      const tee = String(r.tee || "").trim().toUpperCase();
      const hs = d.HOLES && d.HOLES[r.scoreId];
      if (!key || !tee || !hs) continue;
      const g = hs.g || [], p = hs.p || [];
      let algum = false;
      const linha = [];
      for (let i = 0; i < g.length; i++) {
        const gi = g[i], pi = p[i];
        if (!(gi > 0) || !(pi > 0)) { linha.push(null); continue; }
        const v = gi - pi;
        if (v < -3 || v > 8) { linha.push(null); continue; } // lixo
        linha.push(v); algum = true;
      }
      if (!algum) continue;
      const porCampo = acc[key] || (acc[key] = {});
      const t = porCampo[tee] || (porCampo[tee] = { r: 0, jog: new Set(), h: [] });
      t.r++; t.jog.add(fed);
      linha.forEach((v, i) => {
        if (v == null) return;
        const h = t.h[i] || (t.h[i] = [0, 0, 0, 0]);
        h[0]++; h[v < 0 ? 1 : v === 0 ? 2 : 3]++;
      });
    }
  }
}

function buildField(outDir) {
  const acc = {};
  let fichas = 0;
  for (const fed of fs.readdirSync(outDir)) {
    if (!/^\d+$/.test(fed) || fed === MANUEL_FED) continue;
    const f = path.join(outDir, fed, "analysis", "data.json");
    if (!fs.existsSync(f)) continue;
    // Ficha ilegível é erro (nunca «vazio»).
    juntaFicha(acc, fed, JSON.parse(fs.readFileSync(f, "utf8")));
    fichas++;
  }
  const out = { _gerado: "scripts/build-course-hole-field.js", c: {} };
  for (const [key, tees] of Object.entries(acc)) {
    for (const [tee, t] of Object.entries(tees)) {
      if (t.r < MIN_VOLTAS) continue;
      (out.c[key] || (out.c[key] = {}))[tee] = { r: t.r, j: t.jog.size, h: Array.from(t.h, (x) => x || [0, 0, 0, 0]) };
    }
  }
  return { out, fichas };
}

function main() {
  const { out, fichas } = buildField(OUT_DIR);
  const campos = Object.keys(out.c).length;
  if (fichas > 0 && campos === 0) {
    console.error("[course-hole-field] fichas sem buraco a buraco — não gravado");
    process.exit(1);
  }
  const json = JSON.stringify(out) + "\n";
  const prev = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, "utf8") : null;
  if (prev !== json) writeAtomic(OUT_FILE, json);
  console.log(`[course-hole-field] ${fichas} fichas · ${campos} campos · ${(json.length / 1e6).toFixed(2)} MB`);
}

if (require.main === module) main();
module.exports = { buildField, juntaFicha };
