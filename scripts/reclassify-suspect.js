#!/usr/bin/env node
/**
 * scripts/reclassify-suspect.js
 *
 * Passagem retroactiva sobre public/data/fpg-admissions-draws.json.
 * Compara `date` do HTML scraped com `date` esperada do torneio (cache).
 * Se diferença > 30 dias → é reutilização de tcode (FPG sobreposto).
 *
 * Por defeito **APAGA os dados suspect** (admissions fica com error,
 * draws fica com {groups:[], note:"dados suspect apagados"}).
 * A UI já não mostra dados errados — simplesmente diz que não há dados.
 *
 * Flags:
 *   --flag-only    Só marca _suspect, não apaga dados
 *   --keep-data    Apaga _suspect mas preserva dados (inverso)
 *   --clear        Remove todos os _suspect antes de processar
 */
"use strict";
const fs = require("fs");
const path = require("path");
const FILE = path.resolve(__dirname, "..", "public", "data", "fpg-admissions-draws.json");

const args = process.argv.slice(2);
const FLAG_ONLY = args.includes("--flag-only");
const KEEP_DATA = args.includes("--keep-data");
const CLEAR = args.includes("--clear");
const TOLERANCE_DAYS = 30;

const j = JSON.parse(fs.readFileSync(FILE, "utf8"));

function daysBetween(a, b) {
  const pa = Date.parse(a), pb = Date.parse(b);
  if (isNaN(pa) || isNaN(pb)) return null;
  return Math.round(Math.abs(pa - pb) / 86400000);
}

let flaggedAdm = 0, flaggedDraws = 0, deletedAdm = 0, deletedDraws = 0;
let clearedAdm = 0, clearedDraws = 0;

for (const t of (j.tournaments || [])) {
  const expected = t.date;

  if (t.admissions) {
    if (CLEAR) {
      if (t.admissions._suspect) clearedAdm++;
      delete t.admissions._suspect;
      delete t.admissions._suspectReason;
    }
    if (expected && t.admissions.date) {
      const d = daysBetween(t.admissions.date, expected);
      if (d !== null && d > TOLERANCE_DAYS) {
        flaggedAdm++;
        if (FLAG_ONLY) {
          t.admissions._suspect = true;
          t.admissions._suspectReason = `página=${t.admissions.date}, esperada=${expected} (${d}d)`;
        } else {
          // APAGAR dados — substitui por error descritivo
          const origDate = t.admissions.date;
          const origName = t.admissions.name;
          t.admissions = {
            error: `dados suspect apagados: tcode reutilizado pela FPG (página=${origDate} name="${origName||""}", esperada=${expected}, ${d}d)`,
            players: [],
          };
          deletedAdm++;
        }
      }
    }
  }

  for (const [r, dd] of Object.entries(t.draws || {})) {
    if (CLEAR) {
      if (dd._suspect) clearedDraws++;
      delete dd._suspect;
      delete dd._suspectReason;
    }
    if (expected && dd.date) {
      const d = daysBetween(dd.date, expected);
      if (d !== null && d > TOLERANCE_DAYS) {
        flaggedDraws++;
        if (FLAG_ONLY) {
          dd._suspect = true;
          dd._suspectReason = `página=${dd.date}, esperada=${expected} (${d}d)`;
        } else {
          // APAGAR flights — substitui por placeholder com erro
          const origDate = dd.date;
          const origName = dd.name;
          t.draws[r] = {
            groups: [],
            error: `dados suspect apagados: tcode reutilizado pela FPG (página=${origDate} name="${origName||""}", esperada=${expected}, ${d}d)`,
          };
          deletedDraws++;
        }
      }
    }
  }
}

fs.writeFileSync(FILE, Buffer.from(JSON.stringify(j, null, 2), "utf8"));

console.log(`Tolerância: ${TOLERANCE_DAYS} dias`);
if (CLEAR) console.log(`Flags _suspect limpos antes: admissions=${clearedAdm}, draws=${clearedDraws}`);
if (FLAG_ONLY) {
  console.log(`Flagged (--flag-only): admissions=${flaggedAdm}, draws=${flaggedDraws}`);
} else {
  console.log(`APAGADOS (reutilização detectada): admissions=${deletedAdm}, draws=${deletedDraws}`);
}
console.log(`✓ Escrito: ${FILE}`);
