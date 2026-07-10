/**
 * scripts/lib/drive-points.cjs — ESPELHO Node de src/constants/drivePoints.ts
 * (o Node não importa .ts; precedente: course-aliases.cjs ↔ courseAliases.ts).
 * ⚠ MANTER SINCRONIZADO com src/constants/drivePoints.ts.
 *
 * Tabela oficial FPG/DataGolf do ranking Drive (Gross e Net).
 * 8º = 35 (corrigido 2026-07-10 contra o RankingsClassifLST oficial).
 */
"use strict";

const DRIVE_POINTS = {
  1: 250, 2: 165, 3: 94, 4: 75, 5: 64, 6: 53, 7: 45,
  8: 35, 9: 33, 10: 30, 11: 27, 12: 26, 13: 24, 14: 23,
  15: 22, 16: 21, 17: 20, 18: 19, 19: 18,
};

function drivePoints(pos) {
  if (pos == null) return 0;
  const n = Number(pos);
  if (isNaN(n) || n <= 0) return 0;
  return DRIVE_POINTS[n] ?? 0;
}

module.exports = { DRIVE_POINTS, drivePoints };
