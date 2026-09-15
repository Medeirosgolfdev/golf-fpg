/**
 * src/utils/whsCalc.ts
 *
 * ÚNICO sítio da app onde se fazem contas de handicap (WHS). Nenhuma página ou
 * componente deve reescrever estas fórmulas — se falta uma conta, acrescenta-se
 * aqui (decisão 2026-09-15: vários sítios a calcular davam números diferentes).
 *
 * Duas partes:
 *   1. POR VOLTA — Course/Playing Handicap, pancadas por buraco, Net Double
 *      Bogey, AGS e o Score Differential (`scoreDifferential` / `roundDifferential`).
 *      Numa volta JOGADA o SD mostrado é o oficial da FPG quando existe
 *      (scripts/backfill-sd.js); só sem ele se usa o `roundDifferential`, com o
 *      HCP da inscrição (computeSD).
 *   2. JANELA / ÍNDICE — as melhores N de 20, extraordinários, caps e a
 *      projecção de uma volta nova no HI (score-alvo, simulador "E se?").
 *
 * Validado contra os SD oficiais da FPG (`sgd` do WHS de 207 jogadores, cruzado
 * com os cartões dos torneios, 2026-09-15):
 *   18 buracos ................................. 99,4% iguais à décima
 *   9 buracos desde 2024 (Expected SD) ......... 91,3%
 *   9 buracos antes de 2024 (net par + 1) ...... 77%
 * e o HI calculado a partir da janela bate com o oficial em 178 de 207.
 */

export const round1 = (v: number): number => Math.round(v * 10) / 10;

/* ═══════════════════════════ 1. POR VOLTA ═══════════════════════════ */

/** Score Differential "cru": (113 / Slope) × (Score − CR − PCC). Sem
 *  arredondar e sem a conversão de 9 buracos — para isso `scoreDifferential`. */
export function calcSD(score: number, cr: number, slope: number, pcc = 0): number {
  return (113 / slope) * (score - cr - pcc);
}

/** Inverso de `calcSD`: Score = SD × (Slope / 113) + CR + PCC */
export function calcScore(sd: number, cr: number, slope: number, pcc = 0): number {
  return sd * (slope / 113) + cr + pcc;
}

/** Course Handicap = HI × (Slope / 113) + (CR − Par). Em 9 buracos usa-se
 *  metade do HI (com o CR/Slope/Par de 9 buracos). */
export function calcCourseHcp(hi: number, slope: number, cr: number, par: number, is9 = false): number {
  return (is9 ? hi / 2 : hi) * (slope / 113) + (cr - par);
}

/** Playing Handicap = Course Handicap × Allowance (1 = 100%). Serve o Net
 *  Score em competição; o Net Double Bogey usa sempre o Course Handicap. */
export function calcPlayingHcp(
  hi: number, slope: number, cr: number, par: number, allowance = 1, is9 = false,
): number {
  return calcCourseHcp(hi, slope, cr, par, is9) * allowance;
}

/** Pancadas de handicap num buraco com este Stroke Index: 1 com SI ≤ CH, uma
 *  2.ª com SI ≤ CH−18, uma 3.ª com SI ≤ CH−36. */
export function strokesOnHole(si: number, courseHcp: number): number {
  const ch = Math.round(courseHcp);
  let s = 0;
  if (si <= Math.min(ch, 18)) s++;
  if (ch > 18 && si <= Math.min(ch - 18, 18)) s++;
  if (ch > 36 && si <= Math.min(ch - 36, 18)) s++;
  return s;
}

/** Máximo por buraco para o AGS (Net Double Bogey = par + 2 + pancadas).
 *  Em 9 buracos, os SI de 1 a 18 ordenam-se e as pancadas distribuem-se pelos
 *  9 buracos jogados. */
export function ndbCaps(par: number[], si: number[], courseHcp: number, nholes: number): number[] {
  const n = Math.min(nholes, par.length, si.length);
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => si[a] - si[b]);
  const strokes = new Array(n).fill(0);
  let rem = Math.max(0, Math.round(courseHcp));
  while (rem > 0 && n > 0) { for (const idx of order) { if (rem <= 0) break; strokes[idx]++; rem--; } }
  return par.slice(0, n).map((p, i) => p + 2 + strokes[i]);
}

/** Caps do Net Double Bogey de um cartão, a partir do HI (Course Handicap de
 *  9 buracos quando `nholes` ≤ 9). null se faltar par/SI. */
export function ndbCapsForRound(
  par: number[], si: number[], cr: number, slope: number, hi: number, nholes: number,
): number[] | null {
  if (par.length < nholes || si.length < nholes) return null;
  const parT = par.slice(0, nholes).reduce((a, b) => a + b, 0);
  const ch = calcCourseHcp(hi, slope, cr, parT, nholes <= 9);
  return ndbCaps(par, si, ch, nholes);
}

/** Adjusted Gross Score: cada buraco limitado ao Net Double Bogey. */
export function calcAGS(
  scores: number[], parArr: number[], si: number[],
  cr: number, slope: number, hi: number, nholes: number,
): number {
  const caps = scores.length >= nholes ? ndbCapsForRound(parArr, si, cr, slope, hi, nholes) : null;
  if (!caps) return scores.reduce((a, b) => a + b, 0);
  let adj = 0;
  for (let i = 0; i < nholes; i++) adj += Math.min(scores[i], caps[i]);
  return adj;
}

/** Pancadas e máximo (NDB) por buraco, para mostrar num cartão. */
export function calcStrokesPerHole(
  holes: { hole: number; par: number; si: number }[],
  ch: number,
): { hole: number; par: number; si: number; strokes: number; maxScore: number }[] {
  return holes
    .filter(h => h.par != null && h.si != null)
    .map(h => {
      const strokes = strokesOnHole(h.si, ch);
      return { hole: h.hole, par: h.par, si: h.si, strokes, maxScore: h.par + 2 + strokes };
    })
    .sort((a, b) => a.hole - b.hole);
}

/** Expected Score Differential de 9 buracos (WHS 2024): 0,52 × HI + 1,2, com
 *  as décimas do HI. ⚠ Não usar a tabela por HI inteiro: bate em 63% das
 *  voltas oficiais contra 91% da fórmula. */
export function expectedSD9(hi: number): number {
  return 0.52 * Math.min(54, Math.max(0, hi)) + 1.2;
}

/** A partir desta data a FPG converte as voltas de 9 buracos com o Expected SD
 *  (revisão WHS 2024). Antes, os 9 buracos não jogados contavam net par + 1. */
export const WHS_9H_EXPECTED_FROM = "2024-01-01";

export interface DifferentialInput {
  /** AGS (ou gross, se não houver cartão buraco a buraco). */
  score: number;
  cr: number;
  slope: number;
  pcc?: number;
  is9?: boolean;
  /** HI antes da volta — obrigatório em 9 buracos. */
  hi?: number | null;
  /** Par dos 9 buracos — só o método antigo (antes de 2024) precisa. */
  par?: number | null;
  /** Data da volta (ISO). Sem data usa-se o método actual. */
  date?: string | null;
}

export interface Differential {
  /** SD a 18 buracos, arredondado à décima — é este que entra na janela. */
  sd: number;
  /** Em 9 buracos: o SD dos 9 jogados (para mostrar). */
  sd9: number | null;
  /** Em 9 buracos, método actual: o Expected SD somado. */
  exp9: number | null;
}

/** Score Differential de uma volta, como a FPG o calcula.
 *  - 18 buracos: (113/Slope) × (score − CR − PCC).
 *  - 9 buracos desde 2024: (113/Slope) × (score − CR − ½PCC) + Expected SD(HI).
 *  - 9 buracos antes de 2024: os 9 não jogados contam par + CH de 9 buracos + 1,
 *    e o SD é o de 18 buracos com o CR a dobrar.
 *  null quando falta o que o método precisa (HI em 9 buracos, par no antigo). */
export function scoreDifferential(x: DifferentialInput): Differential | null {
  const pcc = x.pcc ?? 0;
  if (!x.slope || !(x.cr > 0)) return null;
  if (!x.is9) return { sd: round1(calcSD(x.score, x.cr, x.slope, pcc)), sd9: null, exp9: null };
  if (x.hi == null) return null;
  const sd9 = round1(calcSD(x.score, x.cr, x.slope, pcc / 2));
  if (x.date && x.date < WHS_9H_EXPECTED_FROM) {
    if (x.par == null) return null;
    const ch9 = Math.round(calcCourseHcp(x.hi, x.slope, x.cr, x.par, true));
    const sd = round1((113 / x.slope) * (x.score + x.par + ch9 + 1 - 2 * x.cr - pcc / 2));
    return { sd, sd9, exp9: null };
  }
  const e = expectedSD9(x.hi);
  return { sd: round1(calcSD(x.score, x.cr, x.slope, pcc / 2) + e), sd9, exp9: round1(e) };
}

/** Inverso de `scoreDifferential` (método actual): o score que dá este SD. */
export function scoreForDifferential(
  sd: number, x: { cr: number; slope: number; pcc?: number; is9?: boolean; hi?: number | null },
): number | null {
  const pcc = x.pcc ?? 0;
  if (!x.is9) return calcScore(sd, x.cr, x.slope, pcc);
  if (x.hi == null) return null;
  return calcScore(sd - expectedSD9(x.hi), x.cr, x.slope, pcc / 2);
}

/** SD a 18 buracos a partir de um SD de 9 já calculado (método actual). */
export function sd18FromSd9(sd9: number, hi: number): number {
  return round1(sd9 + expectedSD9(hi));
}
export interface RoundInput {
  /** Buraco a buraco (0 ou em falta = por jogar). */
  scores?: number[];
  par?: number[];
  si?: number[];
  cr?: number | null;
  slope?: number | null;
  /** HI antes da volta (o da inscrição). */
  hi?: number | null;
  pcc?: number | null;
  /** Gross oficial da volta. */
  gross: number | null;
  nholes?: number | null;
  date?: string | null;
}

export interface RoundSD { sd: number | null; source: "ags" | "raw" | null }

/** Score Differential de uma volta a partir do cartão — usado só quando a volta
 *  ainda não tem o SD OFICIAL da FPG (ver computeSD). AGS quando há par/SI/HI;
 *  senão o gross. Recusa: sem CR/Slope, cartão por entregar (gross ≥ 900: 998
 *  ND/NR e 999 NS/WD) e volta a decorrer (buracos por jogar e gross = soma dos
 *  jogados). Um gross MAIOR que a soma é um cartão truncado na fonte e conta. */
export function roundDifferential(r: RoundInput): RoundSD {
  const none: RoundSD = { sd: null, source: null };
  const { cr, slope, gross } = r;
  if (!cr || !slope || gross == null || isNaN(gross) || gross >= 900) return none;
  const scores = r.scores ?? [];
  const par = r.par ?? [];
  const si = r.si ?? [];
  const nh = r.nholes || scores.length || par.length || 18;
  const is9 = nh <= 9;
  const played = scores.filter((v) => v > 0);
  const playedSum = played.reduce((a, b) => a + b, 0);
  if (played.length > 0 && played.length < nh && gross <= playedSum) return none;
  const parT = par.length >= nh ? par.slice(0, nh).reduce((a, b) => a + b, 0) : null;
  const common = { cr, slope, pcc: r.pcc ?? 0, is9, hi: r.hi ?? null, par: parT, date: r.date ?? null };
  // AGS só com o cartão COMPLETO: num cartão truncado os buracos em branco
  // entravam como 0 (dava SD −36 com gross 80). Aí vale o gross oficial.
  const fullCard = scores.length >= nh && scores.slice(0, nh).every((v) => v > 0);
  if (r.hi != null && fullCard && si.length >= nh && par.length >= nh) {
    const d = scoreDifferential({ ...common, score: calcAGS(scores, par, si, cr, slope, r.hi, nh) });
    if (d) return { sd: d.sd, source: "ags" };
  }
  const d = scoreDifferential({ ...common, score: gross });
  return d ? { sd: d.sd, source: "raw" } : none;
}

/** Obtém ratings de 9 buracos (front ou back) de um tee.
 *
 *  Aceita qualquer objecto com `ratings.holes9Front` / `ratings.holes9Back`
 *  do shape `{ courseRating?, slopeRating?, par? }` — compatível com o tipo
 *  `Tee` (data/types.ts) e com qualquer subset estrutural. */
type Maybe<T> = T | null | undefined;
type RatingsLike = { courseRating?: Maybe<number>; slopeRating?: Maybe<number>; par?: Maybe<number> };

export function get9hRatings(
  tee: {
    ratings?: {
      holes9Front?: Maybe<RatingsLike>;
      holes9Back?: Maybe<RatingsLike>;
    };
  },
  nine: "front9" | "back9"
): { cr: number; slope: number; par: number } | null {
  const r = nine === "front9" ? tee.ratings?.holes9Front : tee.ratings?.holes9Back;
  if (!r?.courseRating || !r?.slopeRating) return null;
  return { cr: r.courseRating, slope: r.slopeRating, par: r.par ?? 36 };
}

/* ═════════════════════════ 2. JANELA / ÍNDICE ═════════════════════════
 * A janela vai do resultado mais recente (índice 0) para o mais antigo (19):
 * uma volta nova entra à cabeça e empurra o mais antigo para fora. */

/** Quantos dos melhores SDs contam, conforme o nº de resultados (tabela 5.2a). */
export function whsQtyCalc(nSds: number): number {
  if (nSds <= 5) return 1;
  if (nSds <= 8) return 2;
  if (nSds <= 11) return 3;
  if (nSds <= 14) return 4;
  if (nSds <= 16) return 5;
  if (nSds <= 18) return 6;
  if (nSds === 19) return 7;
  return 8;
}

/** Ajuste da tabela 5.2a para quem ainda não tem 20 resultados. */
export function tableAdjustment(nSds: number): number {
  return nSds === 3 ? -2 : nSds === 4 ? -1 : nSds === 6 ? -1 : 0;
}

/** Máximo do Handicap Index no WHS. */
export const MAX_HI = 54;

/** Resultado extraordinário (Regra 5.9): −1 com SD 7,0–9,9 abaixo do HI,
 *  −2 com 10,0 ou mais abaixo. */
export function exceptionalAdjustment(hi: number, sd: number): 0 | -1 | -2 {
  const diff = hi - sd;
  return diff >= 10 ? -2 : diff >= 7 ? -1 : 0;
}

/** Soft cap e hard cap (Regra 5.8) em relação ao Low HI: acima de Low+3 a
 *  subida conta metade, e nunca passa de Low+5. Sem Low HI (menos de 20
 *  resultados) só se aplica o máximo de 54. */
export function applyCaps(hi: number, lowHI?: number | null): number {
  let v = hi;
  if (lowHI != null && lowHI > 0) {
    const soft = lowHI + 3;
    if (v > soft) v = soft + (v - soft) / 2;
    v = Math.min(v, lowHI + 5);
  }
  return Math.min(v, MAX_HI);
}

/** Ajustes de resultado extraordinário que a FPG JÁ aplicou à janela actual:
 *  cada volta extraordinária baixa-se a si própria e às 19 anteriores (as que
 *  estavam na janela nesse dia). `window` vai do mais recente para o mais
 *  antigo; `hi` é o índice ANTES da volta (o campo `hi` das voltas do site).
 *  Sem isto o HI do pai (54907) saía 24,9 em vez de 23,3. */
export function historicExceptionalAdj(window: { sd: number; hi: number | null }[]): number[] {
  const adj = window.map(() => 0);
  window.forEach((r, j) => {
    if (r.hi == null || isNaN(Number(r.hi))) return;
    const a = exceptionalAdjustment(Number(r.hi), r.sd);
    if (!a) return;
    for (let k = j; k < Math.min(window.length, j + 20); k++) adj[k] += a;
  });
  return adj;
}

export interface WhsPoolEntry { eid: string; sd: number; adj: number }

/** Média das melhores N da janela (já com os ajustes) — o "score average"
 *  que a FPG publica (`calc_score_avg`). */
export function windowAverage(pool: WhsPoolEntry[]): number | null {
  const vals = pool.map((e) => e.sd + e.adj).filter((v) => !isNaN(v)).sort((a, b) => a - b);
  const top = vals.slice(0, whsQtyCalc(pool.length));
  if (!top.length) return null;
  return top.reduce((s, v) => s + v, 0) / top.length;
}

/** Índice "cru" da janela: média das melhores N + tabela 5.2a (antes dos caps). */
function rawIndex(pool: WhsPoolEntry[]): number | null {
  const avg = windowAverage(pool);
  return avg == null ? null : avg + tableAdjustment(pool.length);
}

/** Handicap Index a partir da janela, como a FPG o calcula. `window` vai do
 *  mais recente para o mais antigo; `hi` é o índice ANTES de cada volta (para
 *  os extraordinários já aplicados). Tabela 5.2a e caps com o Low HI.
 *  null com menos de 3 resultados (o WHS só dá índice a partir de 3). */
export function indexFromWindow(
  window: { sd: number; hi: number | null }[], lowHI?: number | null,
): { hi: number; scoreAvg: number; qtyScores: number; qtyCalc: number } | null {
  const w = window.filter((r) => Number.isFinite(r.sd)).slice(0, 20);
  if (w.length < 3) return null;
  const adj = historicExceptionalAdj(w);
  const pool = w.map((r, i) => ({ eid: String(i), sd: r.sd, adj: adj[i] }));
  const avg = windowAverage(pool)!;
  return {
    hi: round1(applyCaps(avg + tableAdjustment(pool.length), lowHI)),
    scoreAvg: avg,
    qtyScores: pool.length,
    qtyCalc: whsQtyCalc(pool.length),
  };
}

/** O que o cálculo da janela não explica do HI oficial (arredondamentos, ou
 *  algo que a FPG fez e o site não sabe). Com a janela bem montada é ~0. */
export function hiAdjustment(pool: WhsPoolEntry[], currentHI: number, lowHI?: number | null): number {
  const raw = rawIndex(pool);
  return raw == null ? 0 : currentHI - applyCaps(raw, lowHI);
}

export interface PoolStep<E extends WhsPoolEntry> {
  /** Janela depois da volta (mais recente primeiro). */
  pool: E[];
  /** Resultado que saiu da janela (o mais antigo), se ela já tinha 20. */
  displaced: E | null;
  exceptionalAdj: 0 | -1 | -2;
  entersTop: boolean;
  topRank: number | null;
  newHI: number;
}

/** Posição (1…N) de cada resultado que conta para o HI (as melhores N da janela). */
export function topRanks(pool: WhsPoolEntry[]): Map<string, number> {
  const ranked = [...pool].sort((a, b) => a.sd + a.adj - (b.sd + b.adj));
  return new Map(ranked.slice(0, whsQtyCalc(pool.length)).map((e, i) => [e.eid, i + 1]));
}

/** Ids dos resultados que contam para o HI (as melhores N da janela). */
export function topIds(pool: WhsPoolEntry[]): Set<string> {
  return new Set(topRanks(pool).keys());
}

/** Junta uma volta à janela e recalcula o HI. `entry.adj` é ignorado: o
 *  ajuste de resultado extraordinário é calculado aqui e aplicado à janela
 *  inteira. `totalAdjustment` é o resíduo de `hiAdjustment`. */
export function addRoundToPool<E extends WhsPoolEntry>(
  pool: E[], entry: E, curHI: number, totalAdjustment: number, lowHI?: number | null,
): PoolStep<E> {
  const exceptionalAdj = exceptionalAdjustment(curHI, entry.sd);
  const newEntry: E = { ...entry, adj: exceptionalAdj };
  const kept = pool.slice(0, 19).map((e) => ({ ...e, adj: e.adj + exceptionalAdj }));
  const displaced = pool.length >= 20 ? { ...pool[19], adj: pool[19].adj + exceptionalAdj } : null;
  const newPool = [newEntry, ...kept];
  const idx = topRanks(newPool).get(entry.eid) ?? null;
  const raw = rawIndex(newPool);
  const newHI = raw != null ? round1(applyCaps(raw, lowHI) + totalAdjustment) : curHI;
  return {
    pool: newPool,
    displaced,
    exceptionalAdj,
    entersTop: idx != null,
    topRank: idx,
    newHI,
  };
}

export interface TeeForTargets { cr: number; slope: number; par: number; pcc: number; is9: boolean }

export interface GrossTargets<E extends WhsPoolEntry> {
  /** Maior resultado com que o HI desce (o SD dele e o HI que fica). */
  lower: { gross: number; sd: number; hi: number } | null;
  /** Maior resultado que entra nas melhores N. */
  enterTop: { gross: number; sd: number } | null;
  /** Menor resultado com que o HI sobe. */
  rise: { gross: number; sd: number; hi: number } | null;
  /** Maior resultado que ainda é extraordinário, por nível. */
  exceptional: { adj: -1 | -2; gross: number; sd: number }[];
  /** Quantas melhores contam depois da volta. */
  qty: number;
  /** Quantas melhores contam hoje. */
  qtyNow: number;
  /** Resultado que sai da janela com a volta nova, e a posição dele hoje nas
   *  melhores (null = não está nas melhores). */
  leaving: { entry: E; topRank: number | null } | null;
}

const TARGET_EID = "__target__";

/** Percorre os resultados possíveis num tee e devolve os limiares que
 *  interessam: a partir de onde o HI desce, entra nas melhores e sobe. */
export function grossTargets<E extends WhsPoolEntry>(
  pool: E[], curHI: number, totalAdjustment: number, tee: TeeForTargets, lowHI?: number | null,
): GrossTargets<E> {
  const par = Math.round(tee.par);
  const lo = Math.max(tee.is9 ? 9 : 18, par - (tee.is9 ? 8 : 15));
  const hi = par + (tee.is9 ? 30 : 60);
  let lower: GrossTargets<E>["lower"] = null;
  let enterTop: GrossTargets<E>["enterTop"] = null;
  let rise: GrossTargets<E>["rise"] = null;
  let ex1: { gross: number; sd: number } | null = null;
  let ex2: { gross: number; sd: number } | null = null;
  for (let g = lo; g <= hi; g++) {
    const d = scoreDifferential({ score: g, cr: tee.cr, slope: tee.slope, pcc: tee.pcc, is9: tee.is9, hi: curHI });
    if (!d) continue;
    const sd = d.sd;
    const step = addRoundToPool(pool, { eid: TARGET_EID, sd, adj: 0 } as E, curHI, totalAdjustment, lowHI);
    if (step.newHI < curHI - 0.05) lower = { gross: g, sd, hi: step.newHI };
    if (step.entersTop) enterTop = { gross: g, sd };
    if (!rise && step.newHI > curHI + 0.05) rise = { gross: g, sd, hi: step.newHI };
    if (step.exceptionalAdj === -2) ex2 = { gross: g, sd };
    if (step.exceptionalAdj === -1) ex1 = { gross: g, sd };
  }
  const exceptional: GrossTargets<E>["exceptional"] = [];
  if (ex1) exceptional.push({ adj: -1, ...ex1 });
  if (ex2) exceptional.push({ adj: -2, ...ex2 });
  const leavingEntry = pool.length >= 20 ? pool[19] : null;
  return {
    lower,
    enterTop,
    rise,
    exceptional,
    qty: whsQtyCalc(Math.min(pool.length + 1, 20)),
    qtyNow: whsQtyCalc(pool.length),
    leaving: leavingEntry
      ? { entry: leavingEntry, topRank: topRanks(pool).get(leavingEntry.eid) ?? null }
      : null,
  };
}
