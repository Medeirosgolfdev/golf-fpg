/**
 * hcpEvolution.ts — Métricas de análise de evolução de HCP (funções puras)
 *
 * Usadas pela secção de evolução da /jogadores-por-ano. Separadas do componente
 * para serem testáveis sem render (ver hcpEvolution.test.ts).
 */
import { linearSlopeXY } from "./mathUtils";
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
  };
}
