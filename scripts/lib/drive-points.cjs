/**
 * scripts/lib/drive-points.cjs — ESPELHO Node de src/constants/drivePoints.ts
 * (o Node não importa .ts; precedente: course-aliases.cjs ↔ courseAliases.ts).
 * ⚠ MANTER SINCRONIZADO com src/constants/drivePoints.ts.
 *
 * Tabelas oficiais FPG/DataGolf do ranking Drive — POR SÉRIE (2026-07-10):
 *   TOUR:      8º = 38, 20º = 18 (empírico, RankingsClassifLST)
 *   CHALLENGE: 8º = 35
 */
"use strict";

const BASE = {
  1: 250, 2: 165, 3: 94, 4: 75, 5: 64, 6: 53, 7: 45,
  9: 33, 10: 30, 11: 27, 12: 26, 13: 24, 14: 23,
  15: 22, 16: 21, 17: 20, 18: 19, 19: 18,
  20: 18,  // observado nos oficiais em AMBAS as séries
};

const DRIVE_POINTS_TOUR = { ...BASE, 8: 38 };
const DRIVE_POINTS_CHALLENGE = { ...BASE, 8: 35 };
const DRIVE_POINTS = DRIVE_POINTS_CHALLENGE;  // retro-compat

function drivePoints(pos, series) {
  if (pos == null) return 0;
  const n = Number(pos);
  if (isNaN(n) || n <= 0) return 0;
  const table = (series === "tour" || series === "aquapor") ? DRIVE_POINTS_TOUR : DRIVE_POINTS_CHALLENGE;
  return table[n] ?? 0;
}

const FINAL_WEIGHT = 1.5;

function isFinalEvent(name) {
  return /\bfinal\b/i.test(String(name || ""));
}

function isNacionalFinal(name) {
  return isFinalEvent(name) && /nacional/i.test(String(name || ""));
}

function finalPoints(pos, series) {
  return Math.round(drivePoints(pos, series) * FINAL_WEIGHT);
}

/** Empate que o countback não separa: os `count` jogadores partilham a posição
 *  `pos` e recebem a MÉDIA dos pontos dos lugares que ocupam (pos..pos+count-1).
 *  Confirmado no oficial: 2 empatados no 14º → (23+22)/2 = 22.5 cada.
 *  Sem arredondamento — o oficial publica mesmo meios pontos. */
function sharedPoints(pos, count, series) {
  const n = Math.max(1, Number(count) || 1);
  if (n === 1) return drivePoints(pos, series);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += drivePoints(Number(pos) + i, series);
  // O oficial publica com 1 decimal (3 empatados no 12º → (26+24+23)/3 = 24.3).
  return Math.round((sum / n) * 10) / 10;
}

module.exports = {
  DRIVE_POINTS, DRIVE_POINTS_TOUR, DRIVE_POINTS_CHALLENGE, drivePoints,
  FINAL_WEIGHT, isFinalEvent, isNacionalFinal, finalPoints, sharedPoints,
};
