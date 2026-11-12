/**
 * src/utils/mathUtils.ts
 *
 * Funções matemáticas/estatísticas genéricas.
 * Centraliza helpers que estavam inline no JogadoresPage.
 */

/** Arredondar a uma casa decimal — a definição é a do `whsCalc` (uma só no site);
 *  serve-se daqui para as contas que não são de handicap. */
export { round1 } from "./whsCalc";

/** Converte valor desconhecido para número, ou null se inválido */
export function numSafe(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace(",", "."));
  return isFinite(n) ? n : null;
}

/** Média de array com nulls (ignora nulls) */
export function meanArr(arr: (number | null | undefined)[]): number | null {
  let s = 0, c = 0;
  for (const v of arr) {
    const n = numSafe(v);
    if (n != null) { s += n; c++; }
  }
  return c ? s / c : null;
}

/** Desvio-padrão amostral de array com nulls */
export function stdevArr(arr: (number | null | undefined)[]): number | null {
  const vals: number[] = [];
  for (const v of arr) {
    const n = numSafe(v);
    if (n != null) vals.push(n);
  }
  if (vals.length < 2) return null;
  const m = soma(vals) / vals.length;
  const variance = somaDe(vals, (v) => (v - m) ** 2) / (vals.length - 1);
  return Math.sqrt(variance);
}

/** Mediana de uma lista de números (null se vazia). Robusta a valores atípicos:
 *  uma ronda catastrófica não distorce o resultado típico, ao contrário da média. */
export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Soma dos N melhores (menores) scores de uma lista — usado nos rankings por clube. */
export function bestN(scores: number[], n: number): number {
  if (!scores.length) return 0;
  return soma([...scores].sort((a, b) => a - b).slice(0, n));
}

/** Soma de uma lista: ignora vazios, e uma lista em falta vale 0. É A soma do
 *  site (11/11/2026 — havia nove `soma`/`sum` escritas ficheiro a ficheiro). */
export function soma(arr: readonly (number | null | undefined)[] | null | undefined): number {
  let s = 0;
  if (arr) for (const v of arr) if (v != null && Number.isFinite(v)) s += v;
  return s;
}

/** Soma de um valor tirado de cada elemento — `somaDe(jogadores, j => j.pontos)` — em vez de
 *  `reduce((s, j) => s + j.pontos, 0)` escrito à mão. Valores vazios ou não-numéricos não contam;
 *  lista vazia ou em falta dá 0. Também serve para contar: `somaDe(xs, x => x.ok ? 1 : 0)`. */
export function somaDe<T>(arr: readonly T[] | null | undefined, valor: (x: T, i: number) => number | null | undefined): number {
  let s = 0;
  if (arr) for (let i = 0; i < arr.length; i++) {
    const v = valor(arr[i], i);
    if (v != null && Number.isFinite(v)) s += v;
  }
  return s;
}

/** Soma elementos de array numérico entre índices [from, to) */
export function sumArr(arr: (number | null)[], from: number, to: number): number {
  let s = 0;
  for (let i = from; i < to; i++) if (arr[i] != null) s += arr[i]!;
  return s;
}

/** Mínimo de array numérico (ignora nulls) */
export function minArr(arr: (number | null | undefined)[]): number | null {
  let m: number | null = null;
  for (const v of arr) {
    const n = numSafe(v);
    if (n != null && (m == null || n < m)) m = n;
  }
  return m;
}

/** Máximo de array numérico (ignora nulls) */
export function maxArr(arr: (number | null | undefined)[]): number | null {
  let m: number | null = null;
  for (const v of arr) {
    const n = numSafe(v);
    if (n != null && (m == null || n > m)) m = n;
  }
  return m;
}

/** Declive de regressão linear para y igualmente espaçados (x = 0, 1, 2, …) */
export function linearSlope(ys: number[]): number | null {
  const n = ys.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += ys[i]; sxy += i * ys[i]; sx2 += i * i; }
  const d = n * sx2 - sx * sx;
  return d === 0 ? null : (n * sxy - sx * sy) / d;
}

/** Declive de regressão linear para pares (x, y) arbitrários */
export function linearSlopeXY(pts: { x: number; y: number }[]): number | null {
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of pts) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
  const d = n * sxx - sx * sx;
  return d === 0 ? null : (n * sxy - sx * sy) / d;
}

/** Classifica score numa escala de performance relativa (z-score vs stats do grupo).
 *  FONTE ÚNICA dos níveis por z-score (Rivais e Tabela global da /uskids): a
 *  TabelaGlobal tinha limiares próprios (−1,5/−0,8/0,2/1,0) e o mesmo miúdo
 *  aparecia com níveis diferentes conforme a tabela (auditoria 20/10/2026). */
export function zTier(
  score: number | null | undefined,
  stats: { m: number; s: number } | null | undefined
): "elite" | "strong" | "solid" | "developing" | "beginner" | null {
  if (score == null || !stats || !(stats.s > 0)) return null;
  const z = (score - stats.m) / (stats.s || 1);
  if (z <= -1.2) return "elite";
  if (z <= -0.4) return "strong";
  if (z <= 0.4) return "solid";
  if (z <= 1.2) return "developing";
  return "beginner";
}

/** Classifica tendência de resultados (slope da regressão linear) */
export function getTrend(
  p: { r: Record<string, { rd: number[] }> }
): "up" | "down" | "stable" {
  const rounds: number[] = [];
  for (const res of Object.values(p.r)) {
    for (const rd of res.rd) if (rd > 0) rounds.push(rd);
  }
  if (rounds.length < 3) return "stable";
  const n = rounds.length;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += rounds[i]; sxy += i * rounds[i]; sx2 += i * i; }
  const d = n * sx2 - sx * sx;
  const slope = d === 0 ? 0 : (n * sxy - sx * sy) / d;
  if (slope < -0.3) return "up";
  if (slope > 0.3) return "down";
  return "stable";
}

/** Média z-score de todos os resultados de um jogador */
export function getAvgZ(
  p: { r: Record<string, { rd: number[]; t?: number | null }> },
  stats: { m: number; s: number } | null | undefined
): number | null {
  if (!stats || stats.s === 0) return null;
  const zs: number[] = [];
  for (const res of Object.values(p.r)) {
    for (const rd of res.rd) {
      if (rd > 0) zs.push((rd - stats.m) / stats.s);
    }
  }
  return meanArr(zs);
}

/** Toggle de valor num array — adiciona se ausente, remove se presente */
export function toggleArr<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
}

/** Alterna um elemento num Set (devolve um Set novo — para setState). */
export function toggleSet<T>(set: ReadonlySet<T>, v: T): Set<T> {
  const n = new Set(set);
  if (n.has(v)) n.delete(v); else n.add(v);
  return n;
}
