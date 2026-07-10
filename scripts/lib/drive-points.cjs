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

module.exports = { DRIVE_POINTS, DRIVE_POINTS_TOUR, DRIVE_POINTS_CHALLENGE, drivePoints };
