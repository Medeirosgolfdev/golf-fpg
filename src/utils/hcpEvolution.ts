/**
 * hcpEvolution.ts — Métricas de análise de evolução de HCP (funções puras)
 *
 * Usadas pela secção de evolução da /jogadores-por-ano. Separadas do componente
 * para serem testáveis sem render (ver hcpEvolution.test.ts).
 */
import { linearSlopeXY, meanArr, round1 } from "./mathUtils";
import type { HcpPoint } from "../data/hcpHistoryLoader";

const MS_MONTH = 30.44 * 86400000;

export interface EvoMetrics {
  nPts: number;
  start: number;        // HCP no início da janela
  end: number;          // HCP no fim da janela (mais recente)
  delta: number;        // end − start (negativo = melhorou)
  best: number;         // melhor (menor) HCP na janela
  worst: number;        // pior (maior) HCP na janela
  slopePerMonth: number | null; // declive da regressão (pts HCP / mês; negativo = a melhorar)
  firstDate: number;    // ms do primeiro ponto
  lastDate: number;     // ms do último ponto
  nSD: number;          // voltas com SD oficial na janela
  bestSD: number | null;     // melhor (menor) SD da janela
  bestSDDate: number | null; // ms do dia do melhor SD
  avgSD: number | null;      // SD médio da janela (1 casa)
}

/** Pontos de um jogador dentro da janela [cutoff, ∞). cutoff=0 → tudo. */
export function pointsInWindow(pts: HcpPoint[] | undefined, cutoff: number): HcpPoint[] {
  if (!pts || pts.length === 0) return [];
  const f = cutoff > 0 ? pts.filter(p => p.d >= cutoff) : pts.slice();
  f.sort((a, b) => a.d - b.d);
  return f;
}

/** Métricas de evolução para uma janela. Devolve null se < 2 pontos. */
export function computeEvoMetrics(pts: HcpPoint[] | undefined, cutoff: number): EvoMetrics | null {
  const w = pointsInWindow(pts, cutoff);
  if (w.length < 2) return null;
  const hs = w.map(p => p.h);
  const start = w[0].h;
  const end = w[w.length - 1].h;
  const slopePerMonth = linearSlopeXY(w.map(p => ({ x: p.d / MS_MONTH, y: p.h })));
  let bestSD: number | null = null, bestSDDate: number | null = null;
  const sds: number[] = [];
  for (const p of w) for (const sd of p.sds ?? []) {
    sds.push(sd);
    if (bestSD == null || sd < bestSD) { bestSD = sd; bestSDDate = p.d; }
  }
  const avg = meanArr(sds);
  return {
    nPts: w.length,
    start,
    end,
    delta: Math.round((end - start) * 10) / 10,
    best: Math.min(...hs),
    worst: Math.max(...hs),
    slopePerMonth: slopePerMonth == null ? null : Math.round(slopePerMonth * 100) / 100,
    firstDate: w[0].d,
    lastDate: w[w.length - 1].d,
    nSD: sds.length,
    bestSD,
    bestSDDate,
    avgSD: avg == null ? null : round1(avg),
  };
}
