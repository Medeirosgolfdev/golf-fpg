#!/usr/bin/env node
/**
 * scripts/merge-fpg-admissions-draws.js
 *
 * Merge ADITIVO. Lê (o que existir):
 *   public/data/fpg-admissions-draws.json      (BASE existente — nunca descarta)
 *   public/data/fpg-admissions-new.json        (novo scrape de admissions)
 *   public/data/fpg-draws-new.json             (novo scrape de draws)
 *   (legacy: public/data/fpg-admissions-draws-new.json — unified)
 *
 * Regras:
 *   • Preserva sempre dados existentes bons.
 *   • Não substitui bons por vazios, por erros, nem por _suspect.
 *   • Junta admissions novas e draws novos separadamente (cada tem o seu scrape).
 *   • Cria backup automático da base antes de escrever.
 */

"use strict";
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(__dirname, "..", "public", "data");
const BASE_FILE = path.join(DATA_DIR, "fpg-admissions-draws.json");
const NEW_ADM   = path.join(DATA_DIR, "fpg-admissions-new.json");
const NEW_DRAWS = path.join(DATA_DIR, "fpg-draws-new.json");
const LEGACY_UNIFIED = path.join(DATA_DIR, "fpg-admissions-draws-new.json");
const BACKUP  = path.join(DATA_DIR, "fpg-admissions-draws.backup.json");

function readJSafe(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}
function key(t) { return `${t.ccode}-${t.tcode}`; }

const base = readJSafe(BASE_FILE) || { tournaments: [] };
const admNew = readJSafe(NEW_ADM);
const drawsNew = readJSafe(NEW_DRAWS);
const unified = readJSafe(LEGACY_UNIFIED);

console.log(`Base:              ${base.tournaments?.length ?? 0} torneios`);
console.log(`fpg-admissions-new:  ${admNew?.tournaments?.length ?? "(ausente)"}`);
console.log(`fpg-draws-new:       ${drawsNew?.tournaments?.length ?? "(ausente)"}`);
if (unified) console.log(`fpg-admissions-draws-new (legacy unified): ${unified.tournaments?.length ?? 0}`);

// Backup
fs.writeFileSync(BACKUP, JSON.stringify(base, null, 2));
console.log(`Backup: ${BACKUP}`);

function admScore(a) {
  if (!a || a.error) return 0;
  if (a._suspect) return -1;
  return (a.players?.length ?? 0);
}
function drawsScore(d) {
  if (!d) return 0;
  let total = 0, suspect = false;
  for (const dr of Object.values(d)) {
    if (dr?._suspect) suspect = true;
    if (dr?.groups?.length > 0) total += dr.groups.length;
  }
  return suspect ? -1 : total;
}

// Index base
const baseIdx = new Map();
for (const t of (base.tournaments || [])) baseIdx.set(key(t), { ...t });

// Aplicar admissions new (se existe)
let stats = { admReplaced: 0, admKept: 0, admSuspect: 0, admNewOnly: 0 };
function applyAdmissions(src) {
  if (!src?.tournaments) return;
  for (const n of src.tournaments) {
    const k = key(n);
    const b = baseIdx.get(k);
    if (!b) {
      baseIdx.set(k, { ...n, draws: n.draws || {} });
      stats.admNewOnly++;
      continue;
    }
    const bScore = admScore(b.admissions);
    const nScore = admScore(n.admissions);
    if (nScore > bScore) {
      b.admissions = n.admissions;
      stats.admReplaced++;
    } else if (nScore === -1 && bScore > 0) {
      stats.admSuspect++;
    } else {
      stats.admKept++;
    }
    if (n.name && !b.name) b.name = n.name;
    if (n.date && !b.date) b.date = n.date;
    if (n.expectedYear && !b.expectedYear) b.expectedYear = n.expectedYear;
  }
}

// Aplicar draws new (se existe)
let drawStats = { drReplaced: 0, drKept: 0, drSuspect: 0, drNewOnly: 0 };
function applyDraws(src) {
  if (!src?.tournaments) return;
  for (const n of src.tournaments) {
    const k = key(n);
    const b = baseIdx.get(k);
    if (!b) {
      baseIdx.set(k, { ...n, admissions: n.admissions || null });
      drawStats.drNewOnly++;
      continue;
    }
    const bScore = drawsScore(b.draws);
    const nScore = drawsScore(n.draws);
    if (nScore > bScore) {
      b.draws = n.draws;
      drawStats.drReplaced++;
    } else if (nScore === -1 && bScore > 0) {
      drawStats.drSuspect++;
    } else {
      drawStats.drKept++;
    }
  }
}

// Se há unified legacy, trata como ambos
if (unified) {
  applyAdmissions(unified);
  applyDraws(unified);
}
if (admNew)   applyAdmissions(admNew);
if (drawsNew) applyDraws(drawsNew);

if (!admNew && !drawsNew && !unified) {
  console.error("⚠ Nenhum ficheiro novo encontrado. Esperado um de:");
  console.error(`  ${NEW_ADM}`);
  console.error(`  ${NEW_DRAWS}`);
  console.error(`  ${LEGACY_UNIFIED}`);
  process.exit(1);
}

const merged = [...baseIdx.values()].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

const out = {
  scrapedAt: new Date().toISOString(),
  total: merged.length,
  source: "merged (additive)",
  tournaments: merged,
};

fs.writeFileSync(BASE_FILE, JSON.stringify(out, null, 2));

console.log("\n─── Resumo ───");
console.log(`Total após merge:    ${merged.length}`);
console.log(`Admissions actualizados: ${stats.admReplaced} | mantidos: ${stats.admKept} | rejeitados-suspect: ${stats.admSuspect} | só no novo: ${stats.admNewOnly}`);
console.log(`Draws actualizados:      ${drawStats.drReplaced} | mantidos: ${drawStats.drKept} | rejeitados-suspect: ${drawStats.drSuspect} | só no novo: ${drawStats.drNewOnly}`);
console.log(`\n✓ Escrito: ${BASE_FILE}`);
