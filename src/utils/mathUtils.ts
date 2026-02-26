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
