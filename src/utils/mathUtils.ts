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
