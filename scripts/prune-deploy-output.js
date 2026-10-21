#!/usr/bin/env node
/**
 * prune-deploy-output.js — corre DEPOIS do `vite build`, SÓ no Vercel.
 * ═══════════════════════════════════════════════════════════════════════
 * A pasta `output/` é ao mesmo tempo o `outDir` do Vite e a pasta onde o
 * scraper escreve (`output/{fed}/…`, versionada). Como o Vercel clona o repo e
 * publica o Output Directory inteiro, os ficheiros INTERMÉDIOS do scraper
 * entram no deployment e são servidos publicamente — mesmo sem ninguém os
 * pedir. Medido a 2026-09-06 em produção: `golf-fpg.vercel.app/52884/
 * scorecards.json` devolvia 3,9 MB.
 *
 * A app só lê `/{fed}/analysis/data.json` (ver `src/data/playerDataLoader.ts`);
 * o resto é entrada do pipeline, precisa de estar no repo mas não no deploy.
 *
 * Corre só quando `VERCEL` está definido: em local apagaria dados de que o
 * `pipeline.js` precisa (e que estão em git).
 * ═══════════════════════════════════════════════════════════════════════
 */
"use strict";

const fs = require("fs");
const path = require("path");

if (!process.env.VERCEL) {
  console.log("ℹ️  prune-deploy-output: fora do Vercel — nada a fazer.");
  process.exit(0);
}

const OUTPUT = path.join(process.cwd(), "output");
/* Ficheiros/pastas por federado que a app NUNCA pede. */
const LIXO_POR_FED = ["whs.json", "whs-list.json", "scorecards.json", "summary.json", "scorecards"];
/* Caches do pipeline, à raiz do output/. */
const LIXO_RAIZ = ["extract-courses-cache.json", "cross-stats-cache.json"];
/* Ficheiros de public/data que a app NUNCA pede (auditoria 20/10/2026, R2) —
 * confirmado com grep em src/ e api/: o nome não aparece (a não ser nos rótulos
 * do DataSources.tsx). São entradas/caches de scripts e workflows, por isso
 * ficam em public/data no repo (mudar-lhes o caminho obrigava a mexer nos
 * scrapers e no agregador); só saem do deployment. Se a app passar a pedir
 * um destes, TIRÁ-LO daqui — senão dá 404 em produção e funciona em local. */
const LIXO_DATA = [
  "ffgolf-juniors-slim.json",          // 12,5 MB — entrada do agregador (sources/ffgolf.js)
  "uskids-field-sizes.json",           // 6,8 MB — agregador (sources/uskids.js)
  /^england_.*\.json$/,                // ~11 MB, 36 ficheiros — agregador; a /england foi arquivada a 13/10
  "england-golf-catalog.json",         // catálogo do scrape-england-golf
  "gg_ffgolf_all.json",                // scrape-golfgenius-generic
  "worldjrgirls_2024.json",            // scrape-junior-orange-bowl
  "t_de_tournaments_do_uskids.json",   // agregador
  "uskids-player-scoring-stats.json",  // build-player-scoring-stats
  "uskids-tcode-catalog.json",         // cache do fetch-uskids-field
  "uskids-pid-anchors.json",           // cache do fetch-uskids-field
  "fpg-draws.json",                    // legado dos scrapers de draws
  "nacional-2026-forma.json",          // build-forma-data / build-form-report
  "juniors-overrides.json",            // entrada do agregador
  "drive-rankings.json",               // scrape/verify-drive-rankings (a app tem os pontos em constants/)
  "drive-rankings-check.json",         // relatório do verify-drive-rankings
  "fpg-tournaments-tracking.json",     // scope do update-classif
  "recent-tournaments-scrape-scope.json", // scope do update-classif
];

let bytes = 0, n = 0;
const tamanho = (p) => {
  let s = 0;
  const walk = (q) => {
    const st = fs.statSync(q);
    if (!st.isDirectory()) { s += st.size; return; }
    for (const e of fs.readdirSync(q)) walk(path.join(q, e));
  };
  try { walk(p); } catch {}
  return s;
};
const apagar = (p) => {
  if (!fs.existsSync(p)) return;
  bytes += tamanho(p);
  fs.rmSync(p, { recursive: true, force: true });
  n++;
};

if (fs.existsSync(OUTPUT)) {
  for (const d of fs.readdirSync(OUTPUT)) {
    if (!/^\d+$/.test(d)) continue;
    for (const alvo of LIXO_POR_FED) apagar(path.join(OUTPUT, d, alvo));
  }
  for (const f of LIXO_RAIZ) apagar(path.join(OUTPUT, f));
  const DATA = path.join(OUTPUT, "data");
  if (fs.existsSync(DATA)) {
    for (const f of fs.readdirSync(DATA)) {
      if (LIXO_DATA.some((a) => (a instanceof RegExp ? a.test(f) : a === f))) apagar(path.join(DATA, f));
    }
  }
}

console.log(`🧹 prune-deploy-output: ${n} ficheiros/pastas removidos do deployment (${(bytes / 1048576).toFixed(1)} MB)`);
