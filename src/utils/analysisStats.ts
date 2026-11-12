/**
 * analysisStats.ts — as contas sobre cartões buraco a buraco, num só sítio.
 *
 * ⛔ Contar eagles/birdies/pares/bogeys de um cartão, ou separá-lo por tipo de
 * buraco (par 3, 4, 5, 6), faz-se SEMPRE por aqui: `distFromRound` e
 * `parTypeStats`. Até 11/11/2026 havia dez sítios a contar à mão, cada um com
 * as suas guardas — a /drive Sub-12 contava como BIRDIE cada buraco por jogar
 * (zeros das voltas de 9), e o Resumo contava tudo como BOGEY quando não havia
 * par. Aqui um buraco só conta com pancadas > 0 E par > 0.
 *
 * Funções puras: sem React, sem loaders, sem estado — testáveis à parte.
 */
import { meanArr, soma, somaDe } from "./mathUtils";

export interface ScoringDist {
  eagles: number;   // -2 ou melhor
  birdies: number;  // -1
  pars: number;     // 0
  bogeys: number;   // +1
  dbPlus: number;   // +2 ou pior (= doubles + triplesPlus)
  doubles: number;      // +2
  triplesPlus: number;  // +3 ou pior
  total: number;    // buracos contabilizados
}

export const emptyDist = (): ScoringDist =>
  ({ eagles: 0, birdies: 0, pars: 0, bogeys: 0, dbPlus: 0, doubles: 0, triplesPlus: 0, total: 0 });

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
    doubles: a.doubles + b.doubles,
    triplesPlus: a.triplesPlus + b.triplesPlus,
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
    else { d.dbPlus++; if (dv === 2) d.doubles++; else d.triplesPlus++; }
    d.total++;
  }
  return d;
}

/** Um cartão: as pancadas de uma volta e o par dessa volta. */
export interface Cartao { scores: readonly number[]; par: readonly number[] }

/** Distribuição somada de vários cartões, cada um com o SEU par. */
export function distFromCards(cards: readonly Cartao[]): ScoringDist {
  return cards.reduce<ScoringDist>((acc, c) => addDist(acc, distFromRound(c.scores, c.par)), emptyDist());
}

/* POR TIPO DE BURACO (par 3, 4, 5 e 6) */

/** Os tipos de buraco que existem. O par 6 é raro mas existe (Otepää). */
export const PAR_TYPES = [3, 4, 5, 6] as const;

export interface ParTypeStat {
  par: number;
  holes: number;       // buracos jogados deste tipo
  strokes: number;     // pancadas somadas
  vsPar: number;       // ±par somado
  avgStrokes: number;  // média de pancadas por buraco
  avgVsPar: number;    // ±par médio por buraco
  dist: ScoringDist;
  scores: number[];    // as pancadas, pela ordem dos cartões
}

/** Os cartões separados por tipo de buraco — só os tipos que foram jogados, por
 *  ordem (par 3 primeiro). Buracos com par fora de 3–6 ficam de fora. */
export function parTypeStats(cards: readonly Cartao[]): ParTypeStat[] {
  const acc = new Map<number, { scores: number[]; pars: number[] }>();
  for (const c of cards) {
    const n = Math.min(c.scores.length, c.par.length);
    for (let i = 0; i < n; i++) {
      const sc = c.scores[i], p = c.par[i];
      if (!sc || sc <= 0 || !(PAR_TYPES as readonly number[]).includes(p)) continue;
      let g = acc.get(p);
      if (!g) { g = { scores: [], pars: [] }; acc.set(p, g); }
      g.scores.push(sc); g.pars.push(p);
    }
  }
  return PAR_TYPES.filter((p) => acc.has(p)).map((p) => {
    const g = acc.get(p)!;
    const strokes = soma(g.scores);
    const holes = g.scores.length;
    return {
      par: p, holes, strokes, vsPar: strokes - p * holes,
      avgStrokes: strokes / holes, avgVsPar: strokes / holes - p,
      dist: distFromRound(g.scores, g.pars), scores: g.scores,
    };
  });
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
  const parTotal = somaDe(par, b => (b || 0));
  return rounds.map((r, i) => {
    const dist = distFromRound(r, par);
    const gross = somaDe(r, v => (v > 0 ? v : 0));
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
  const fp = somaDe(par.slice(0, 9), b => (b || 0));
  const bp = somaDe(par.slice(9, 18), b => (b || 0));

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
      const g = soma(f9);
      frontGs.push(g);
      if (fp > 0) frontTps.push(g - fp);
    }
    if (db.total === 9) {
      const g = soma(b9);
      backGs.push(g);
      if (bp > 0) backTps.push(g - bp);
    }
  }

  return {
    front, back,
    frontAvg: meanArr(frontGs),
    backAvg:  meanArr(backGs),
    frontToParAvg: meanArr(frontTps),
    backToParAvg:  meanArr(backTps),
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
