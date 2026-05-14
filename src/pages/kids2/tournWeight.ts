/**
 * kids2/tournWeight.ts
 *
 * Peso de prestígio de torneio (★ a ★★★★★) calculado a partir dos canónicos.
 *
 * Equivalente ao `getTournWeight` antigo de KIDSPage:84-112, mas sem T_WEIGHTS_BASE
 * hardcoded. Usa só:
 *   • tournament.rounds (ou nº inferido pelas results[0].rounds.length)
 *   • Σ flights[].fieldSize  (acumula todos os escalões do torneio)
 *   • tournament.extra.nationsCount  (preenchido pelo aggregator — PR4.1)
 *
 * Fórmula: 0.40 · roundsNorm + 0.35 · fieldNorm + 0.25 · nationsNorm
 *
 * Quando o aggregator não tem nationsCount ainda, degrada graciosamente para
 * 2 termos (rounds + field) usando 0.60/0.40.
 */

import type { Tournament } from "./data";

// Normalizadores baseados em juvenil internacional típico
const MAX_ROUNDS = 4;
const MAX_FIELD = 300;
const MAX_NATIONS = 20;

export interface TournWeight {
  /** Score 0–1 (pode ultrapassar 1 em torneios excepcionais). */
  score: number;
  /** Nº de estrelas (1–5). */
  stars: number;
  /** Componentes individuais para debug/tooltip. */
  parts: { rounds: number; field: number; nations: number | null };
}

export function getTournWeight(t: Tournament): TournWeight {
  // 1) Rondas — prefere campo explícito, senão infere do 1º resultado com rounds[]
  let rounds = typeof t.rounds === "number" ? t.rounds : null;
  if (rounds == null) {
    for (const f of t.flights || []) {
      const r = f.results?.[0];
      if (r?.rounds?.length) { rounds = r.rounds.length; break; }
    }
  }
  if (rounds == null) rounds = 1;

  // 2) Field size — soma de TODOS os flights do torneio
  let totalField = 0;
  let hasFieldData = false;
  for (const f of t.flights || []) {
    if (typeof f.fieldSize === "number" && f.fieldSize > 0) {
      totalField += f.fieldSize;
      hasFieldData = true;
    }
  }
  // Fallback: se nenhum flight tem fieldSize, usa nº de results conhecidos
  if (!hasFieldData) {
    for (const f of t.flights || []) totalField += (f.results || []).length;
  }

  // 3) Nationalities — só disponível se aggregator pré-calculou
  const nationsCount = typeof (t.extra as any)?.nationsCount === "number"
    ? (t.extra as any).nationsCount as number
    : null;

  // Normalizar (cap a 1.0 para evitar dominância de outliers)
  const rNorm = Math.min(rounds / MAX_ROUNDS, 1.0);
  const fNorm = Math.min(totalField / MAX_FIELD, 1.0);
  const nNorm = nationsCount != null ? Math.min(nationsCount / MAX_NATIONS, 1.0) : null;

  let score: number;
  if (nNorm != null) {
    score = 0.40 * rNorm + 0.35 * fNorm + 0.25 * nNorm;
  } else {
    // Sem nations — pesa rounds (60%) + field (40%)
    score = 0.60 * rNorm + 0.40 * fNorm;
  }

  // Estrelas (5 buckets calibrados para a distribuição esperada)
  let stars: number;
  if (score >= 0.85) stars = 5;
  else if (score >= 0.65) stars = 4;
  else if (score >= 0.45) stars = 3;
  else if (score >= 0.25) stars = 2;
  else stars = 1;

  return {
    score,
    stars,
    parts: { rounds: rNorm, field: fNorm, nations: nNorm },
  };
}

/** Devolve string "★★★★☆" (5 caracteres, total/empty). */
export function formatStars(stars: number): string {
  const full = "★".repeat(Math.max(0, Math.min(5, stars)));
  const empty = "☆".repeat(Math.max(0, 5 - stars));
  return full + empty;
}
