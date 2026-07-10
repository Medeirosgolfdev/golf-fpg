/* ═══════════════════════════════════════════════════════
   DRIVE TOUR / DRIVE CHALLENGE — Tabelas de pontos do ranking
   ─────────────────────────────────────────────────────────
   FONTE ÚNICA DE VERDADE (espelho Node: scripts/lib/drive-points.cjs —
   manter sincronizado).

   ⚠ Descoberta 2026-07-10 (comparação empírica com o RankingsClassifLST
   oficial, todas as zonas/escalões, via scripts/verify-drive-rankings.js):
   as séries têm tabelas DIFERENTES no 8º lugar —
     · TOUR:      8º = 38 (12 amostras oficiais) e 20º = 18
     · CHALLENGE: 8º = 35 (112 amostras oficiais)
   O ranking OFICIAL conta apenas os MELHORES N resultados (tipicamente 4;
   o verify detecta o N por ranking) — o site ainda soma tudo.
   ═══════════════════════════════════════════════════════ */

const BASE: Record<number, number> = {
  1: 250, 2: 165, 3: 94, 4: 75, 5: 64, 6: 53, 7: 45,
  9: 33, 10: 30, 11: 27, 12: 26, 13: 24, 14: 23,
  15: 22, 16: 21, 17: 20, 18: 19, 19: 18,
  20: 18,  // observado nos oficiais em AMBAS as séries (RDTN26 + DC_NOR_*)
};

export const DRIVE_POINTS_TOUR: Record<number, number> = {
  ...BASE, 8: 38,
};

export const DRIVE_POINTS_CHALLENGE: Record<number, number> = {
  ...BASE, 8: 35,
};

/** Retro-compat: tabela "default" (= Challenge). Preferir drivePoints(pos, series). */
export const DRIVE_POINTS = DRIVE_POINTS_CHALLENGE;

/** Pontos do ranking para uma posição final, conforme a série.
 *  `series`: "tour" | "aquapor" → tabela Tour; resto → Challenge.
 *  Posições fora da tabela → 0. */
export function drivePoints(pos: number | string | null, series?: string | null): number {
  if (pos == null) return 0;
  const n = Number(pos);
  if (isNaN(n) || n <= 0) return 0;
  const table = (series === "tour" || series === "aquapor") ? DRIVE_POINTS_TOUR : DRIVE_POINTS_CHALLENGE;
  return table[n] ?? 0;
}
