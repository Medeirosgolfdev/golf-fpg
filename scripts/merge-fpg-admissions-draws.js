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
const BACKUP  = path.resolve(__dirname, "..", "data-archive", "fpg-admissions-draws.backup.json");

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

// Backup — usar Buffer explícito para evitar truncamento em Windows com caracteres UTF-8
fs.writeFileSync(BACKUP, Buffer.from(JSON.stringify(base, null, 2), "utf8"));
console.log(`Backup: ${BACKUP}`);

/** Comparação de datas — se diferem por >30 dias é reutilização de tcode. */
function daysBetween(a, b) {
  const pa = Date.parse(a), pb = Date.parse(b);
  if (isNaN(pa) || isNaN(pb)) return null;
  return Math.round(Math.abs(pa - pb) / 86400000);
}
function isSuspect(pageDate, expectedDate) {
  if (!pageDate || !expectedDate) return false;
  const d = daysBetween(pageDate, expectedDate);
  return d != null && d > 30;
}

/** Score do admissions. Suspect por data OU por _suspect flag → score negativo.
 *  tournDate é a data esperada do torneio (do cache). */
function admScore(a, tournDate) {
  if (!a || a.error) return 0;
  if (a._suspect) return -1;
  if (isSuspect(a.date, tournDate)) return -1;
  return (a.players?.length ?? 0);
}
function drawsScore(d, tournDate) {
  if (!d) return 0;
  let total = 0, suspect = false;
  for (const dr of Object.values(d)) {
    if (dr?._suspect) suspect = true;
    else if (isSuspect(dr?.date, tournDate)) suspect = true;
    if (dr?.groups?.length > 0) total += dr.groups.length;
  }
  return suspect ? -1 : total;
}

// Index base
const baseIdx = new Map();
for (const t of (base.tournaments || [])) baseIdx.set(key(t), { ...t });

// Aplicar admissions new (se existe)
/** Apaga dados suspect de um objecto admissions (dados errados não devem ser mostrados). */
function cleanSuspectAdm(a, tournDate) {
  if (!a || a.error) return a;
  if (a._suspect || isSuspect(a.date, tournDate)) {
    const d = daysBetween(a.date, tournDate);
    return {
      error: `dados suspect apagados: tcode reutilizado pela FPG (página=${a.date} name="${a.name||""}", esperada=${tournDate}, ${d||"?"}d)`,
      players: [],
    };
  }
  return a;
}
function cleanSuspectDraws(draws, tournDate) {
  if (!draws) return {};
  const out = {};
  for (const [r, d] of Object.entries(draws)) {
    if (d?._suspect || isSuspect(d?.date, tournDate)) {
      const diff = daysBetween(d?.date, tournDate);
      out[r] = {
        groups: [],
        error: `dados suspect apagados: tcode reutilizado (página=${d?.date} name="${d?.name||""}", esperada=${tournDate}, ${diff||"?"}d)`,
      };
    } else {
      out[r] = d;
    }
  }
  return out;
}

let stats = { admReplaced: 0, admKept: 0, admSuspect: 0, admNewOnly: 0, admCleaned: 0 };
function applyAdmissions(src) {
  if (!src?.tournaments) return;
  for (const n of src.tournaments) {
    const k = key(n);
    const b = baseIdx.get(k);
    const tournDate = b?.date || n.date;
    if (!b) {
      const cleaned = cleanSuspectAdm(n.admissions, tournDate);
      if (cleaned !== n.admissions) stats.admCleaned++;
      baseIdx.set(k, { ...n, admissions: cleaned, draws: cleanSuspectDraws(n.draws || {}, tournDate) });
      stats.admNewOnly++;
      continue;
    }
    // Limpar suspect em base (caso antigo)
    const bClean = cleanSuspectAdm(b.admissions, tournDate);
    if (bClean !== b.admissions) { b.admissions = bClean; stats.admCleaned++; }
    const bScore = admScore(b.admissions, tournDate);
    const nScore = admScore(n.admissions, tournDate);
    if (nScore > bScore) {
      b.admissions = n.admissions;
      stats.admReplaced++;
    } else if (nScore === -1 && bScore > 0) {
      stats.admSuspect++;
    } else if (nScore === -1 && bScore <= 0) {
      // Ambos suspect/vazios — limpar de vez
      b.admissions = cleanSuspectAdm(n.admissions, tournDate);
      stats.admCleaned++;
    } else {
      stats.admKept++;
    }
    if (n.name && !b.name) b.name = n.name;
    if (n.date && !b.date) b.date = n.date;
    if (n.expectedYear && !b.expectedYear) b.expectedYear = n.expectedYear;
  }
}

let drawStats = { drReplaced: 0, drKept: 0, drSuspect: 0, drNewOnly: 0, drCleaned: 0 };
function applyDraws(src) {
  if (!src?.tournaments) return;
  for (const n of src.tournaments) {
    const k = key(n);
    const b = baseIdx.get(k);
    const tournDate = b?.date || n.date;
    if (!b) {
      baseIdx.set(k, { ...n, admissions: n.admissions || null, draws: cleanSuspectDraws(n.draws || {}, tournDate) });
      drawStats.drNewOnly++;
      continue;
    }
    // Limpar suspect em base (para casos já merged antes do fix)
    const bCleanDraws = cleanSuspectDraws(b.draws || {}, tournDate);
    let cleanedFlag = false;
    for (const [r, d] of Object.entries(bCleanDraws)) {
      if (d !== (b.draws || {})[r]) cleanedFlag = true;
    }
    if (cleanedFlag) { b.draws = bCleanDraws; drawStats.drCleaned++; }

    const bScore = drawsScore(b.draws, tournDate);
    const nScore = drawsScore(n.draws, tournDate);
    if (nScore > bScore) {
      b.draws = cleanSuspectDraws(n.draws, tournDate);
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

// Escrita final — Buffer UTF-8 explícito para evitar truncamento em Windows
fs.writeFileSync(BASE_FILE, Buffer.from(JSON.stringify(out, null, 2), "utf8"));

console.log("\n─── Resumo ───");
console.log(`Total após merge:    ${merged.length}`);
console.log(`Admissions actualizados: ${stats.admReplaced} | mantidos: ${stats.admKept} | rejeitados-suspect: ${stats.admSuspect} | só no novo: ${stats.admNewOnly} | dados suspect apagados: ${stats.admCleaned}`);
console.log(`Draws actualizados:      ${drawStats.drReplaced} | mantidos: ${drawStats.drKept} | rejeitados-suspect: ${drawStats.drSuspect} | só no novo: ${drawStats.drNewOnly} | dados suspect apagados: ${drawStats.drCleaned}`);
console.log(`\n✓ Escrito: ${BASE_FILE}`);
