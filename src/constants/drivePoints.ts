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

/* ── Finais ──────────────────────────────────────────────────────────────
   Descoberto 2026-07-19 (código RFDC_26M18G, ranking final Madeira Sub 18):
   o Drive Challenge tem DOIS rankings por zona/escalão —
     · `DC_*`   = FASE REGULAR: melhores 4 provas, as Finais NÃO entram
     · `RFDC_*` = RANKING FINAL: total da fase regular + a Final a ×1.5
   Verificado: 1º 250→375 · 2º 165→248 (247,5) · 3º 94→141 · 4º 75→113 (112,5).
   Arredondamento a meio para cima (Math.round). ────────────────────────── */
export const FINAL_WEIGHT = 1.5;

/** A prova é uma Final (regional ou nacional)? */
export function isFinalEvent(name: string | null | undefined): boolean {
  return /\bfinal\b/i.test(String(name || ""));
}

/** Final NACIONAL — não entra nos rankings regionais (nem na fase regular,
 *  nem no ranking final da zona). */
export function isNacionalFinal(name: string | null | undefined): boolean {
  return isFinalEvent(name) && /nacional/i.test(String(name || ""));
}

/** Pontos de uma Final: tabela normal × 1.5, arredondado. */
export function finalPoints(pos: number | string | null, series?: string | null): number {
  return Math.round(drivePoints(pos, series) * FINAL_WEIGHT);
}

/** Empate não desfeito pelo countback: os `count` jogadores partilham a posição
 *  e recebem a MÉDIA dos pontos dos lugares ocupados (pos..pos+count-1).
 *  Confirmado no oficial: 2 empatados no 14º → (23+22)/2 = 22,5 cada. */
export function sharedPoints(pos: number | string | null, count: number, series?: string | null): number {
  const n = Math.max(1, Number(count) || 1);
  if (n === 1) return drivePoints(pos, series);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += drivePoints(Number(pos) + i, series);
  // O oficial publica com 1 decimal (3 empatados no 12º → (26+24+23)/3 = 24,3).
  return Math.round((sum / n) * 10) / 10;
}
