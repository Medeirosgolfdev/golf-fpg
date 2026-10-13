#!/usr/bin/env node
/**
 * scripts/scrape-fpg-matchplay.js (2026-10-13)
 * ═════════════════════════════════════════════════════════════════════════
 * Quadros de MATCH PLAY da FPG (Taça da Federação) → public/data/fpg-matchplay.json
 *
 * Fonte: `scoring-pt.datagolf.pt/scripts/matchplay.asp?club=000&tourn=NNNNN`
 * (HTML público, sem cookies). Só traz o quadro: nomes, cabeças de série,
 * resultados, tee e hora — os cartões são só os da qualificação stroke play.
 *
 * ⚠ O `tourn` do quadro é uma numeração PRÓPRIA (00018…00023) e NÃO é o tcode
 * da classificação (o 00023 da classif é o Nacional de Seniores 2.ª Cat.). Cada
 * quadro fica pendurado na sua qualificação (`ccode-tcode`), que é o torneio
 * que a /FPG já mostra; a lista está em SOURCES. Edição nova: acrescentar aqui
 * (os quadros novos seguem a numeração: H e S consecutivos).
 *
 * OUTPUT: { lastUpdated, source, tournaments: { "000-10918": MatchplayFile } }
 * Merge aditivo: um quadro que falhe ou venha vazio mantém o que estava.
 *
 * USAGE:
 *   node scripts/scrape-fpg-matchplay.js
 *   node scripts/scrape-fpg-matchplay.js --only 000-10918
 *
 * EXIT CODES: 0 gravou · 2 nada de novo · 1 erro · 3 FPG em baixo
 * ═════════════════════════════════════════════════════════════════════════
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { parseMatchplayHtml } = require("./lib/fpg-matchplay-parse");
const { writeJsonAtomic } = require("./lib/atomic-write");

const REPO = path.resolve(__dirname, "..");
const OUT_FILE = path.join(REPO, "public", "data", "fpg-matchplay.json");
const BASE = "https://scoring-pt.datagolf.pt/scripts/matchplay.asp";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

/** Quadro (mpClub/mpTourn) → qualificação stroke play na /FPG (ccode-tcode). */
const SOURCES = [
  { key: "000-10798", year: 2024, mpClub: "000", mpTourn: "00018" }, // 38.ª Taça · Homens
  { key: "000-10799", year: 2024, mpClub: "000", mpTourn: "00019" }, // 38.ª Taça · Senhoras
  { key: "000-10851", year: 2025, mpClub: "000", mpTourn: "00020" }, // 39.ª Taça · Homens
  { key: "000-10852", year: 2025, mpClub: "000", mpTourn: "00021" }, // 39.ª Taça · Senhoras
  { key: "000-10918", year: 2026, mpClub: "000", mpTourn: "00022" }, // 40.ª Taça · Homens
  { key: "000-10919", year: 2026, mpClub: "000", mpTourn: "00023" }, // 40.ª Taça · Senhoras
];

const args = process.argv.slice(2);
const only = (() => { const i = args.indexOf("--only"); return i >= 0 ? args[i + 1] : null; })();

async function fetchBracket(src) {
  const url = `${BASE}?club=${src.mpClub}&tourn=${src.mpTourn}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  const buf = new Uint8Array(await res.arrayBuffer());
  return parseMatchplayHtml(buf, {
    slug: `fpg-matchplay-${src.mpClub}-${src.mpTourn}`,
    year: src.year,
    source: url,
    scrapedAt: new Date().toISOString(),
  });
}

/** Compara sem o carimbo de hora (para o exit 2 quando nada mudou). */
const semCarimbo = (mp) => JSON.stringify(mp, (k, v) => (k === "scrapedAt" ? undefined : v));

(async () => {
  let prev = { tournaments: {} };
  try { prev = JSON.parse(fs.readFileSync(OUT_FILE, "utf8")); } catch { /* primeiro run */ }
  const out = { ...prev, tournaments: { ...(prev.tournaments || {}) } };

  let changed = 0, failed = 0, down = 0;
  for (const src of SOURCES) {
    if (only && src.key !== only) continue;
    try {
      const mp = await fetchBracket(src);
      if (!mp) { console.log(`[matchplay] ${src.key} (${src.mpTourn}): sem quadro — mantém o anterior`); failed++; continue; }
      const nJogos = mp.flights[0].rounds.reduce((n, r) => n + r.matches.length, 0);
      const old = out.tournaments[src.key];
      if (old && semCarimbo(old) === semCarimbo(mp)) {
        console.log(`[matchplay] ${src.key} (${src.mpTourn}): igual`);
        continue;
      }
      out.tournaments[src.key] = mp;
      changed++;
      console.log(`[matchplay] ${src.key} (${src.mpTourn}): ${mp.tournament} · ${nJogos} jogos · campeão: ${mp.champion || "—"}`);
    } catch (e) {
      failed++;
      if (e.status >= 500 || /fetch failed|ECONN|ETIMEDOUT/i.test(String(e.message))) down++;
      console.log(`[matchplay] ${src.key} (${src.mpTourn}): erro ${e.message} — mantém o anterior`);
    }
  }

  if (!changed) {
    if (down && down === failed && failed === SOURCES.filter((s) => !only || s.key === only).length) process.exit(3);
    console.log("[matchplay] nada de novo");
    process.exit(2);
  }
  out.lastUpdated = new Date().toISOString();
  out.source = "scoring-pt.datagolf.pt/scripts/matchplay.asp";
  writeJsonAtomic(OUT_FILE, out);
  console.log(`[matchplay] ✓ gravado ${path.relative(REPO, OUT_FILE)} (${changed} actualizados)`);
  process.exit(0);
})().catch((e) => { console.error("[matchplay] erro fatal:", e); process.exit(1); });
