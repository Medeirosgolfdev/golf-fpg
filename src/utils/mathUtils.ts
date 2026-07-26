/**
 * src/utils/mathUtils.ts
 *
 * Funções matemáticas/estatísticas genéricas.
 * Centraliza helpers que estavam inline no JogadoresPage.
 */

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
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, v) => a + (v - m) ** 2, 0) / (vals.length - 1);
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

/** Classifica score numa escala de performance relativa (z-score vs stats do grupo) */
export function zTier(
  score: number | null | undefined,
  stats: { m: number; s: number } | null | undefined
): "elite" | "strong" | "solid" | "developing" | "beginner" | null {
  if (score == null || !stats || stats.s === 0) return null;
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
  return zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : null;
}

/** Toggle de valor num array — adiciona se ausente, remove se presente */
export function toggleArr<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
}
