/**
 * src/utils/parJogado.ts — pancadas e ±par só dos buracos JOGADOS (10/11/2026).
 *
 * Um cartão com buracos em branco (cartão incompleto na fonte, volta a decorrer,
 * 9 buracos guardados em 18 posições) não se compara com o par dos 18: «75 em 13
 * buracos» contra par 72 dava «+3». Cada tabela fazia a sua conta (ScorecardTable,
 * ScorecardLB, comparação de voltas da ficha) — a regra vive aqui.
 *
 * Só tipos e funções puras, sem imports.
 */

type Num = number | null | undefined;

export interface ResumoJogado {
  /** Soma das pancadas dos buracos com resultado. */
  pancadas: number;
  /** Par dos buracos com resultado (os que têm par conhecido). */
  par: number;
  /** Quantos buracos têm resultado. */
  jogados: number;
  /** Quantos buracos tem o troço pedido. */
  buracos: number;
  /** Todos os buracos do troço têm resultado. */
  completo: boolean;
  /** Pancadas − par dos buracos jogados; null sem buracos jogados ou sem o par deles. */
  toPar: number | null;
}

const jogado = (v: Num): v is number => typeof v === "number" && v > 0;

/** Resumo do troço [from, to) de um cartão. Buraco a 0/null = não jogado. */
export function resumoJogado(scores: readonly Num[], pars: readonly Num[] | null | undefined, from = 0, to = scores.length): ResumoJogado {
  let pancadas = 0, par = 0, jogados = 0, semPar = false;
  const fim = Math.max(from, to);
  for (let i = from; i < fim; i++) {
    const s = scores[i];
    if (!jogado(s)) continue;
    jogados++;
    pancadas += s;
    const p = pars?.[i];
    if (jogado(p)) par += p; else semPar = true;
  }
  const temPar = jogados > 0 && !semPar;
  return {
    pancadas,
    par,
    jogados,
    buracos: fim - from,
    completo: jogados === fim - from && jogados > 0,
    toPar: temPar ? pancadas - par : null,
  };
}

/** Par só dos buracos jogados (atalho do `resumoJogado`). */
export function parDosJogados(scores: readonly Num[], pars: readonly Num[] | null | undefined, from = 0, to = scores.length): number {
  return resumoJogado(scores, pars, from, to).par;
}
