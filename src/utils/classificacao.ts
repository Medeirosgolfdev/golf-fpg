/**
 * src/utils/classificacao.ts — as regras de classificar jogadores, num só sítio
 * (10/11/2026). Antes cada página fazia a sua conta e os mesmos erros voltavam:
 * quem jogou MENOS voltas somava menos e ficava em 1.º (Top 10, AQUAPOR, «T5»
 * da Previsão, Rivais, evolução BJGT), as voltas «sem cartão» (≥ 900) contavam,
 * os empatados ficavam 3.º e 4.º, e «T4»/«CUT» lidos com `Number()` davam NaN.
 *
 * Usar SEMPRE estas funções quando se ordena ou numera uma classificação.
 */
import { isNoCardGross } from "../data/intlCommon";

type VoltaLike = number | null | undefined | { gross?: number | null };

const grossDe = (v: VoltaLike): number | null | undefined => (typeof v === "object" && v !== null ? v.gross : v);

/** Há cartão: gross > 0 e abaixo do sentinela «sem cartão» (≥ 900: 997/998/999). */
export function temCartao(gross: number | null | undefined): gross is number {
  return typeof gross === "number" && gross > 0 && !isNoCardGross(gross);
}

/** Quantas voltas com cartão — aceita números (`[74, 998, null]`) ou voltas com `gross`. */
export function voltasComCartao(voltas: readonly VoltaLike[] | null | undefined): number {
  return (voltas ?? []).filter((v) => temCartao(grossDe(v))).length;
}

/** Lugar de uma fonte: 4, "4", "T4" → 4; "CUT", "WD", "DQ", "", null → null. */
export function parsePos(pos: unknown): number | null {
  if (typeof pos === "number") return Number.isFinite(pos) && pos > 0 ? pos : null;
  const m = /^\s*T?\s*(\d+)\s*$/i.exec(String(pos ?? ""));
  return m ? parseInt(m[1], 10) : null;
}

/** Lugares com empates sobre uma lista JÁ ordenada: 1, 2, 2, 4… */
export function posicoesComEmpates<T>(ordenados: readonly T[], valor: (x: T) => number): Map<T, number> {
  const out = new Map<T, number>();
  let pos = 1;
  ordenados.forEach((x, i) => {
    if (i > 0 && valor(x) !== valor(ordenados[i - 1])) pos = i + 1;
    out.set(x, pos);
  });
  return out;
}

/**
 * Classificação por total, SÓ entre quem tem todas as voltas da prova (o máximo
 * de voltas com cartão no grupo) e um total válido. Quem jogou menos voltas, ou
 * ficou sem cartão, não entra (fica sem lugar). Devolve os classificados por
 * ordem e o lugar de cada um, com empates.
 */
export function classificarPorTotal<T>(
  itens: readonly T[],
  voltas: (x: T) => number,
  total: (x: T) => number | null | undefined,
): { ordenados: T[]; pos: Map<T, number>; voltasDaProva: number } {
  const voltasDaProva = Math.max(0, ...itens.map(voltas));
  const ordenados = itens
    .filter((x) => voltas(x) === voltasDaProva && temCartao(total(x) ?? null))
    .sort((a, b) => (total(a) as number) - (total(b) as number));
  return { ordenados, pos: posicoesComEmpates(ordenados, (x) => total(x) as number), voltasDaProva };
}
