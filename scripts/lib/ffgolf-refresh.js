/**
 * scripts/lib/ffgolf-refresh.js — quando voltar a recolher um torneio FFG que
 * já está em disco (14/10/2026).
 *
 * Os scrapers correm com --skip-existing; um torneio apanhado A MEIO (Grand
 * Prix Jeunes de Rennes 2026: recolhido a 11/10 09:36 UTC, no 2.º dia) ficava
 * para sempre só com a R1. Regra: os torneios dos últimos RECENT_DAYS dias
 * recolhem-se sempre, e nunca se grava por cima uma versão com menos
 * jogadores ou menos voltas jogadas (a fonte às vezes responde vazio).
 */
const fs = require("fs");

const RECENT_DAYS = 7;

/** "10/10/2026" ou "2026-10-10" → Date (meio-dia UTC) ou null. */
function parseData(s) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 12));
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  return null;
}

/** Torneio começado há menos de RECENT_DAYS dias (pode ter voltas por recolher). */
function isRecent(dateStr, now = new Date()) {
  const d = parseData(dateStr);
  if (!d) return false;
  const dias = (now - d) / 864e5;
  return dias >= -1 && dias <= RECENT_DAYS;
}

/** Jogadores e voltas jogadas (cartões com scores) de um `details` FFG. */
function contar(details) {
  let players = 0, rounds = 0;
  for (const s of details?.series || []) for (const p of s.players || []) {
    players++;
    for (const k of ["scoresR1", "scoresR2", "scoresR3", "scoresR4"]) if (Array.isArray(p[k]) && p[k].some((x) => x > 0)) rounds++;
  }
  return { players, rounds };
}

/** O que está em disco tem mais do que a versão nova? Então não se grava. */
function wouldShrink(outPath, newDetails) {
  if (!fs.existsSync(outPath)) return false;
  let old;
  try { old = JSON.parse(fs.readFileSync(outPath, "utf8")); } catch { return false; }
  const a = contar(old.details), b = contar(newDetails);
  return b.players < a.players || b.rounds < a.rounds;
}

/** Saltar um ficheiro existente com --skip-existing? Só se não for recente. */
function skipExistingFile(outPath, dateStr, skipExisting) {
  return !!skipExisting && fs.existsSync(outPath) && !isRecent(dateStr);
}

module.exports = { RECENT_DAYS, isRecent, wouldShrink, skipExistingFile, contar };
