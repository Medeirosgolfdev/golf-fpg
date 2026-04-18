/**
 * analysisStats.ts
 *
 * Funções puras de agregação usadas pela secção de Análise (estilo Masters)
 * na KIDSPage. Todas recebem dados hole-by-hole e devolvem métricas derivadas.
 *
 * Nenhuma destas funções depende de React, data-loaders, ou state global —
 * para poderem ser testadas isoladamente e reutilizadas noutras páginas.
 */

export interface ScoringDist {
  eagles: number;   // -2 ou melhor
  birdies: number;  // -1
  pars: number;     // 0
  bogeys: number;   // +1
  dbPlus: number;   // +2 ou pior
  total: number;    // buracos contabilizados
}

export const emptyDist = (): ScoringDist =>
  ({ eagles: 0, birdies: 0, pars: 0, bogeys: 0, dbPlus: 0, total: 0 });

/** Percentagens da distribuição (0–100, somam 100 quando total>0). */
export function distPct(d: ScoringDist): { eagles: number; birdies: number; pars: number; bogeys: number; dbPlus: number } {
  if (d.total === 0) return { eagles: 0, birdies: 0, pars: 0, bogeys: 0, dbPlus: 0 };
  return {
    eagles:  (d.eagles  / d.total) * 100,
    birdies: (d.birdies / d.total) * 100,
    pars:    (d.pars    / d.total) * 100,
    bogeys:  (d.bogeys  / d.total) * 100,
    dbPlus:  (d.dbPlus  / d.total) * 100,
  };
}

/** Soma acumulada de distribuições (usado para agregar field). */
export function addDist(a: ScoringDist, b: ScoringDist): ScoringDist {
  return {
    eagles:  a.eagles  + b.eagles,
    birdies: a.birdies + b.birdies,
    pars:    a.pars    + b.pars,
    bogeys:  a.bogeys  + b.bogeys,
    dbPlus:  a.dbPlus  + b.dbPlus,
    total:   a.total   + b.total,
  };
}

/**
 * Classifica cada buraco de um round em relação ao par e produz a distribuição.
 * Filtra zeros (buracos não jogados) e garante par[i] > 0.
 */
export function distFromRound(scores: readonly number[], par: readonly number[]): ScoringDist {
  const d = emptyDist();
  const n = Math.min(scores.length, par.length);
  for (let i = 0; i < n; i++) {
    const s = scores[i];
    const p = par[i];
    if (!s || s <= 0 || !p || p <= 0) continue;
    const dv = s - p;
    if      (dv <= -2) d.eagles++;
    else if (dv === -1) d.birdies++;
    else if (dv === 0)  d.pars++;
    else if (dv === 1)  d.bogeys++;
    else                d.dbPlus++;
    d.total++;
  }
  return d;
}

/** Distribuição agregada ao longo de várias rondas (todas com o mesmo par). */
export function distFromRounds(rounds: readonly (readonly number[])[], par: readonly number[]): ScoringDist {
  return rounds.reduce<ScoringDist>((acc, r) => addDist(acc, distFromRound(r, par)), emptyDist());
}

/* ─────────────────────────────────────────────────────────────────
   PER-ROUND: uma distribuição por cada R1, R2, R3 …
   ───────────────────────────────────────────────────────────────── */

export interface PerRoundDist {
  label: string;  // "R1", "R2", …
  dist: ScoringDist;
  gross: number | null;  // total bruto da ronda (null se incompleta)
  toPar: number | null;  // gross − par total
}

export function perRoundDists(rounds: readonly (readonly number[])[], par: readonly number[]): PerRoundDist[] {
  const parTotal = par.reduce((a, b) => a + (b || 0), 0);
  return rounds.map((r, i) => {
    const dist = distFromRound(r, par);
    const gross = r.reduce((a, v) => a + (v > 0 ? v : 0), 0);
    const complete = dist.total >= 18;
    return {
      label: `R${i + 1}`,
      dist,
      gross: complete ? gross : null,
      toPar: complete && parTotal > 0 ? gross - parTotal : null,
    };
  });
}

/* ─────────────────────────────────────────────────────────────────
   FRONT 9 vs BACK 9
   ───────────────────────────────────────────────────────────────── */

export interface NineSplit {
  front: ScoringDist;
  back:  ScoringDist;
  frontAvg: number | null;  // média de gross dos F9s
  backAvg:  number | null;
  frontToParAvg: number | null;  // média de (gross − par) F9
  backToParAvg:  number | null;
}

export function nineSplit(rounds: readonly (readonly number[])[], par: readonly number[]): NineSplit {
  const front = emptyDist(), back = emptyDist();
  const frontGs: number[] = [], backGs: number[] = [];
  const frontTps: number[] = [], backTps: number[] = [];
  const fp = par.slice(0, 9).reduce((a, b) => a + (b || 0), 0);
  const bp = par.slice(9, 18).reduce((a, b) => a + (b || 0), 0);

  for (const r of rounds) {
    const f9 = r.slice(0, 9);
    const b9 = r.slice(9, 18);
    const p9 = par.slice(0, 9);
    const bpar = par.slice(9, 18);

    const df = distFromRound(f9, p9);
    const db = distFromRound(b9, bpar);

    Object.assign(front, addDist(front, df));
    Object.assign(back,  addDist(back,  db));

    // Só conta totais quando as 9 foram jogadas
    if (df.total === 9) {
      const g = f9.reduce((a, v) => a + v, 0);
      frontGs.push(g);
      if (fp > 0) frontTps.push(g - fp);
    }
    if (db.total === 9) {
      const g = b9.reduce((a, v) => a + v, 0);
      backGs.push(g);
      if (bp > 0) backTps.push(g - bp);
    }
  }

  const avg = (a: number[]): number | null => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  return {
    front, back,
    frontAvg: avg(frontGs),
    backAvg:  avg(backGs),
    frontToParAvg: avg(frontTps),
    backToParAvg:  avg(backTps),
  };
}

/* ─────────────────────────────────────────────────────────────────
   SCORING vs PAR POR BURACO
   ───────────────────────────────────────────────────────────────── */

export interface HoleStat {
  hole: number;       // 1–18
  par: number;
  n: number;          // nº de rondas com score válido neste buraco
  avg: number | null; // média de strokes
  toPar: number | null;  // avg − par
}

export function holeByHoleStats(rounds: readonly (readonly number[])[], par: readonly number[]): HoleStat[] {
  const nh = Math.min(par.length, 18);
  const out: HoleStat[] = [];
  for (let i = 0; i < nh; i++) {
    let sum = 0, n = 0;
    for (const r of rounds) {
      const s = r[i];
      if (s && s > 0) { sum += s; n++; }
    }
    const avg = n > 0 ? sum / n : null;
    const p = par[i] || 0;
    out.push({
      hole: i + 1,
      par: p,
      n,
      avg,
      toPar: avg != null && p > 0 ? avg - p : null,
    });
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────
   FIELD AGGREGATION
   ───────────────────────────────────────────────────────────────── */

export interface ScorecardLite {
  normName: string;
  par: readonly number[];
  rounds: readonly (readonly number[])[];
}

/**
 * Agrega o field de um torneio/escalão (excluindo o próprio jogador).
 * Soma todas as distribuições e calcula a média por buraco.
 */
export function aggregateField(
  fieldCards: readonly ScorecardLite[],
  excludeNormName: string,
): { dist: ScoringDist; holeAvg: (number | null)[]; nRounds: number } {
  let dist = emptyDist();
  const holeSum = new Array<number>(18).fill(0);
  const holeN   = new Array<number>(18).fill(0);
  let nRounds = 0;

  for (const sc of fieldCards) {
    if (sc.normName === excludeNormName) continue;
    for (const r of sc.rounds) {
      const d = distFromRound(r, sc.par);
      if (d.total === 0) continue;
      dist = addDist(dist, d);
      nRounds++;
      for (let i = 0; i < Math.min(18, r.length); i++) {
        const s = r[i];
        if (s && s > 0) { holeSum[i] += s; holeN[i]++; }
      }
    }
  }
  const holeAvg = holeSum.map((s, i) => holeN[i] > 0 ? s / holeN[i] : null);
  return { dist, holeAvg, nRounds };
}
