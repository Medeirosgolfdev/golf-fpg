#!/usr/bin/env node
/**
 * build-ffg-list-index.js — escreve `public/data/ffg-list-index.json`: a lista
 * da /ffg para os torneios GolfGenius e LGPIDF, já filtrada (gémeos do portal,
 * duplicados LGPIDF, eventos não-franceses), fundida (escalões do mesmo
 * campeonato → `gg:evt:…`) e com o que a sidebar e os filtros leem.
 *
 * Porquê: a /ffg descarregava no arranque todos os ficheiros GolfGenius do
 * catálogo e todos os LGPIDF (~6 MB) só para montar a lista. Com o índice,
 * cada ficheiro só se pede quando o torneio se abre.
 *
 * A lógica vive em TypeScript (`src/data/ffg/listIndex.ts`, as mesmas funções
 * que o browser usa ao abrir o torneio); este script empacota-a com o esbuild
 * (vem com o Vite) e dá-lhe os ficheiros de `public/data`.
 *
 * Gerado — NÃO vai para o git (.gitignore). Corre no `predev` e no `prebuild`
 * (o Vercel corre o `npm run build`, por isso cada deploy leva o índice certo,
 * também quando um workflow acrescenta ou muda um torneio). À mão:
 *     node scripts/build-ffg-list-index.js
 *
 * Ficheiro em falta = fonte opcional (como no browser); JSON ilegível = erro.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeAtomic } = require("./lib/atomic-write");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const OUT_FILE = path.join(DATA_DIR, "ffg-list-index.json");

/** Lê um JSON de public/data como o `cachedFetchJson`: em falta → null; ilegível → erro. */
function readData(rel) {
  const p = path.join(DATA_DIR, rel);
  if (!fs.existsSync(p)) return null;
  const txt = fs.readFileSync(p, "utf8").replace(/\0+/g, "");
  try { return JSON.parse(txt); } catch (e) { throw new Error(`${rel} ilegível: ${e.message}`); }
}

/** `src/data/ffg/listIndex.ts` empacotado para Node (CommonJS, em memória). */
function loadListIndexModule() {
  const esbuild = require("esbuild");
  const res = esbuild.buildSync({
    entryPoints: [path.join(ROOT, "src", "data", "ffg", "listIndex.ts")],
    bundle: true, platform: "node", format: "cjs", target: "node20",
    write: false, logLevel: "silent",
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", res.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
}

function readInputs() {
  const ffgResIndex = readData("ffgolf-resultats-index.json");
  const ggCatalog = readData("ffgolf-catalog.json");
  const ggData = new Map();
  for (const t of ggCatalog?.tournaments ?? []) {
    if (!t.gg_page) continue;
    const key = `${t.year}_${t.slug}`;
    const td = readData(`ffgolf/${key}.json`);
    if (td) ggData.set(key, td);
  }
  const tw = readData("ffgolf-gg-twins.json");
  const ggTwins = new Set(tw?.twins ? Object.keys(tw.twins) : []);
  const lgpidfIndex = readData("ffgolf-lgpidf-index.json");
  const lgpidfData = new Map();
  for (const t of lgpidfIndex?.tournaments ?? []) {
    const td = readData(`ffgolf/${t.file}`);
    if (td) lgpidfData.set(`${t.year}_${t.slug}`, td);
  }
  return { ffgResIndex, lgpidfIndex, lgpidfData, ggCatalog, ggData, ggTwins };
}

function main() {
  const { buildFfgListIndex } = loadListIndexModule();
  const input = readInputs();
  if (!input.ffgResIndex) {
    console.error("[ffg-list-index] falta public/data/ffgolf-resultats-index.json — índice não gravado");
    process.exit(1);
  }
  const index = buildFfgListIndex(input);
  const json = JSON.stringify(index) + "\n";
  const prev = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, "utf8") : null;
  if (prev !== json) writeAtomic(OUT_FILE, json);
  const n = (k) => index.items.filter((i) => i[k]).length;
  console.log(`[ffg-list-index] GolfGenius: ${n("gg")} · LGPIDF: ${n("lgpidf")} · ${(json.length / 1024).toFixed(0)} KB`);
}

if (require.main === module) main();

module.exports = { loadListIndexModule, readInputs };
