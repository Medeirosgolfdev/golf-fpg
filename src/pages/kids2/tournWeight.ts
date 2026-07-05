/**
 * kids2/tournWeight.ts
 *
 * Peso de prestígio de torneio (★ a ★★★★★½) calculado a partir dos canónicos.
 *
 * Fórmula (com nationsCount):  0.35 · roundsNorm + 0.25 · fieldNorm + 0.40 · nationsNorm
 * Fórmula (sem nationsCount):  0.60 · roundsNorm + 0.40 · fieldNorm
 *
 * roundsNorm é NÃO-LINEAR: 1r→0.20, 2r→0.50, 3r→0.85, 4r→1.00
 * (torneios de 3 e 4 rondas são claramente superiores a 1-2 rondas)
 *
 * Referência com fieldSize do flight específico do jogador:
 *   WC  Boys 11 (4r, ~150, 30+ nações) → ★★★★★½ (5.5)  score≈0.825
 *   EC  Boys 11 (4r, ~60,  15  nações) → ★★★★★  (5.0)  score≈0.645
 *   WJGC       (4r, ~40,  20  nações) → ★★★★★  (5.0)  score≈0.647
 *   Venice     (4r, ~40,  10  nações) → ★★★★½  (4.5)  score≈0.597
 *   Marco Simone(1r,~15,   5  nações) → ★½      (1.5)  score≈0.127
 *   Local tour  (1r, ~20,  0  nações) → ★½      (1.5)  score≈0.147
 *
 * PRESTIGE OVERRIDES: alguns torneios recebem uma estrela mínima garantida
 * baseada na reputação do evento (independentemente de rounds/field/nations).
 *   doral → mínimo 4.5★  (First Tee Miami Junior Classic — evento PGA Tour)
 *
 * IMPORTANTE: quando chamado de computeCareerScore, passar sempre o fieldSize
 * do flight específico do jogador (não a soma de todos os escalões do torneio).
 * A soma inflaciona artificialmente local tours com muitos escalões.
 */

import type { Tournament } from "./data";

// Normalizadores
const MAX_FIELD = 300;
const MAX_NATIONS = 30;   // WC tem 30+ nações; WJGC ~20; EC ~15

// Pesos (com nações)
// Rounds + field determinam qualidade real da competição.
// Nations indica notoriedade/visibilidade do evento, não qualidade dos jogadores.
const W_R = 0.50;
const W_F = 0.35;
const W_N = 0.15;

// Pesos (sem nações)
const W_R2 = 0.60;
const W_F2 = 0.40;

/** Mapeamento não-linear de rondas: valoriza muito mais 3-4 rondas vs 1-2. */
function roundsNorm(r: number): number {
  if (r <= 1) return 0.20;
  if (r === 2) return 0.50;
  if (r === 3) return 0.85;
  return 1.00; // 4+
}

/**
 * Prestige mínimo garantido por sourceId do torneio.
 * A estrela calculada pela fórmula fica sempre >= este valor.
 */
const SOURCE_MIN_PRESTIGE: Record<string, number> = {
  // First Tee Miami Junior Classic — evento PGA Tour, maior torneio júnior dos EUA
  doral: 4.5,
};

export interface TournWeight {
  /** Score 0–1+ (componente contínua antes do mapeamento para estrelas). */
  score: number;
  /** Nº de estrelas em incrementos de 0.5 (1.0–5.5). */
  stars: number;
  /** Componentes individuais para debug/tooltip. */
  parts: { rounds: number; field: number; nations: number | null };
}

/**
 * @param t - torneio
 * @param fieldSizeOverride - fieldSize do flight ESPECÍFICO do jogador.
 *   Passar sempre de computeCareerScore para evitar inflação por soma de escalões.
 *   Se null/undefined, usa a soma de todos os flights (comportamento legado — display).
 */
export function getTournWeight(t: Tournament, fieldSizeOverride?: number | null): TournWeight {
  // 1) Rondas — prefere campo explícito, senão infere do 1º resultado com rounds[]
  let rounds = typeof t.rounds === "number" ? t.rounds : null;
  if (rounds == null) {
    for (const f of t.flights || []) {
      const r = f.results?.[0];
      if (r?.rounds?.length) { rounds = r.rounds.length; break; }
    }
  }
  if (rounds == null) rounds = 1;

  // 2) Field size — usa o flight específico quando disponível; fallback: soma de todos
  let totalField = 0;
  let hasFieldData = false;
  if (fieldSizeOverride != null && fieldSizeOverride > 0) {
    totalField = fieldSizeOverride;
    hasFieldData = true;
  } else {
    for (const f of t.flights || []) {
      if (typeof f.fieldSize === "number" && f.fieldSize > 0) {
        totalField += f.fieldSize;
        hasFieldData = true;
      }
    }
  }
  if (!hasFieldData) {
    for (const f of t.flights || []) totalField += (f.results || []).length;
  }

  // 3) Nationalities — só disponível se aggregator pré-calculou
  const nationsCount = typeof (t.extra as any)?.nationsCount === "number"
    ? (t.extra as any).nationsCount as number
    : null;

  const rNorm = Math.min(roundsNorm(rounds), 1.0);
  const fNorm = Math.min(totalField / MAX_FIELD, 1.0);
  const nNorm = nationsCount != null ? Math.min(nationsCount / MAX_NATIONS, 1.0) : null;

  let score: number;
  if (nNorm != null) {
    score = W_R * rNorm + W_F * fNorm + W_N * nNorm;
  } else {
    score = W_R2 * rNorm + W_F2 * fNorm;
  }

  // Meias-estrelas: 10 níveis (1.0 a 5.5 em incrementos de 0.5)
  let stars: number;
  if      (score >= 0.70) stars = 5.5;
  else if (score >= 0.56) stars = 5.0;
  else if (score >= 0.48) stars = 4.5;
  else if (score >= 0.38) stars = 4.0;
  else if (score >= 0.30) stars = 3.5;
  else if (score >= 0.24) stars = 3.0;
  else if (score >= 0.18) stars = 2.5;
  else if (score >= 0.14) stars = 2.0;
  else if (score >= 0.10) stars = 1.5;
  else                    stars = 1.0;

  // Prestige override: alguns torneios têm estrela mínima garantida
  const minPrestige = SOURCE_MIN_PRESTIGE[t.sourceId] ?? 0;
  if (minPrestige > stars) stars = minPrestige;

  return {
    score,
    stars,
    parts: { rounds: rNorm, field: fNorm, nations: nNorm },
  };
}

/**
 * Formata estrelas para display.
 * Exemplos: 5.5→"★★★★★½", 4.5→"★★★★½☆", 3→"★★★☆☆"
 * O display usa sempre 5 "posições" + ½ extra quando > 5.
 */
export function formatStars(stars: number): string {
  const capped = Math.min(stars, 5.5);
  const full = Math.floor(capped);
  const half = (capped - full) >= 0.5;
  const empty = Math.max(0, 5 - full - (half ? 1 : 0));
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(empty);
}
