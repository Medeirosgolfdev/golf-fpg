#!/usr/bin/env node
/**
 * scripts/reclassify-suspect.js
 *
 * Passagem retroactiva sobre public/data/fpg-admissions-draws.json:
 * compara a data do HTML scraped com a data esperada do torneio (campo `date`).
 * Se a diferença for > 30 dias, marca `_suspect` (reutilização de tcode).
 *
 * Use quando a lógica de detecção melhora e queremos re-analisar dados antigos
 * sem re-scrapar.
 *
 * Opcional: --clear  remove todos os _suspect antes de re-aplicar.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const FILE = path.resolve(__dirname, "..", "public", "data", "fpg-admissions-draws.json");

const args = process.argv.slice(2);
const CLEAR = args.includes("--clear");
const TOLERANCE_DAYS = 30;

const j = JSON.parse(fs.readFileSync(FILE, "utf8"));

function daysBetween(a, b) {
  const pa = Date.parse(a), pb = Date.parse(b);
  if (isNaN(pa) || isNaN(pb)) return null;
  return Math.round(Math.abs(pa - pb) / 86400000);
}

let flaggedAdm = 0, flaggedDraws = 0, clearedAdm = 0, clearedDraws = 0;

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
        t.admissions._suspect = true;
        t.admissions._suspectReason = `página=${t.admissions.date}, esperada=${expected} (${d}d)`;
        flaggedAdm++;
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
        dd._suspect = true;
        dd._suspectReason = `página=${dd.date}, esperada=${expected} (${d}d)`;
        flaggedDraws++;
      }
    }
  }
}

fs.writeFileSync(FILE, JSON.stringify(j, null, 2));

console.log(`Flags aplicados: admissions=${flaggedAdm}, draws=${flaggedDraws}`);
if (CLEAR) console.log(`Flags limpos antes: admissions=${clearedAdm}, draws=${clearedDraws}`);
console.log(`Tolerância: ${TOLERANCE_DAYS} dias`);
console.log(`✓ Escrito: ${FILE}`);
