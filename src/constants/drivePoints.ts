/* ═══════════════════════════════════════════════════════
   DRIVE TOUR / DRIVE CHALLENGE — Tabela de pontos do ranking
   ─────────────────────────────────────────────────────────
   FONTE ÚNICA DE VERDADE. Espelha a tabela oficial publicada
   pela FPG/DataGolf (ranking Gross). Antes existiam duas cópias
   divergentes (DrivePage.tsx e ResumoTable.tsx) — a do ResumoTable
   estava desatualizada (1→100) e fazia o painel "Temporada" calcular
   pontos a menos (ex: 4 vitórias = 400 em vez de 1000). Manter aqui.

   Validado contra o ranking oficial DC Madeira Sub-12 2026:
   Nicolau Rodrigues = 648 = 250+165+94+75+64 (pos 1-5).

   ⚠ Correcção 2026-07-10 (comparação com RankingsClassifLST oficial em
   todas as zonas/escalões): 8º lugar = 35, NÃO 38 — confirmado por
   jogadores com prova única (ex: Maria Almeida Santos, Dinis Campos:
   oficial 35). Os "diff +3/+6/+9" sistemáticos vinham daqui.
   Nota: o ranking OFICIAL conta apenas os MELHORES 4 resultados — o site
   ainda soma tudo (drive-rankings.json tem os totais oficiais p/ comparar).
   ═══════════════════════════════════════════════════════ */
export const DRIVE_POINTS: Record<number, number> = {
  1: 250, 2: 165, 3: 94, 4: 75, 5: 64, 6: 53, 7: 45,
  8: 35, 9: 33, 10: 30, 11: 27, 12: 26, 13: 24, 14: 23,
  15: 22, 16: 21, 17: 20, 18: 19, 19: 18,
};

/** Pontos do ranking para uma posição final. Posições fora da tabela → 0. */
export function drivePoints(pos: number | string | null): number {
  if (pos == null) return 0;
  const n = Number(pos);
  if (isNaN(n) || n <= 0) return 0;
  return DRIVE_POINTS[n] ?? 0;
}
