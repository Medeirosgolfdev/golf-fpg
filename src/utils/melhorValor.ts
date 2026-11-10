/**
 * src/utils/melhorValor.ts — destacar o melhor de uma linha de valores (10/11/2026).
 *
 * Antes cada tabela fazia a sua conta: uma lia o número de volta a partir do
 * TEXTO já formatado («+3.5» de handicap plus virava 3,5), outra dava o destaque
 * ao primeiro em caso de empate. A regra é uma só:
 *   - compara-se o NÚMERO (guardado ao lado do texto), nunca o texto;
 *   - vazios (null/NaN) não entram;
 *   - com menos de dois valores, ou todos iguais, ninguém é «o melhor»;
 *   - empatados no melhor ficam todos destacados.
 */

export type SentidoMelhor = "low" | "high";

/** Índices do(s) melhor(es) valor(es); vazio quando não há melhor. */
export function indicesDoMelhor(
  valores: readonly (number | null | undefined)[],
  sentido: SentidoMelhor = "low",
): number[] {
  const validos = valores.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (validos.length < 2) return [];
  const alvo = sentido === "high" ? Math.max(...validos) : Math.min(...validos);
  if (validos.every((v) => v === alvo)) return [];
  const out: number[] = [];
  valores.forEach((v, i) => { if (v === alvo) out.push(i); });
  return out;
}

/** Arredonda às casas com que o valor é MOSTRADO — 84,2 e 84,4 mostram-se «84» e
 *  não devem dar um «melhor». */
export function arredondar(v: number, casas = 0): number {
  const f = 10 ** casas;
  return Math.round(v * f) / f;
}
