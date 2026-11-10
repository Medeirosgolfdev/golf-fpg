/**
 * src/utils/playerKey.ts — «quem é este jogador» dentro de uma prova, num só
 * sítio (10/11/2026). Antes cada peça indexava à sua maneira (Scout e ScoutProva
 * pelo nome, «Quem repete» pelo nome com os tokens ordenados, o modelo da FPG por
 * federado-senão-nome) e dois homónimos com federados diferentes ficavam com os
 * dados um do outro (Torneio de Aniversário Estela 2025: dois «Pedro Aires»).
 *
 * Regra (CLAUDE.md, «dados da própria prova»): o federado manda; o nome só serve
 * quando um dos lados não traz federado, e nunca junta duas pessoas cujos
 * federados FPG se contradizem.
 */
import { vetKey } from "./normName";

const limpa = (fed: unknown): string => String(fed ?? "").trim();

/** É um número de federado da FPG? Só dígitos, até 6 («52884»). Uma licença de
 *  fora («CMA8989869» da RFEG, os 9 dígitos da FFG) e as chaves virtuais
 *  («kids:…») não são — e não se comparam com federados FPG. */
export function isFedFpg(fed: unknown): boolean {
  return /^\d{1,6}$/.test(limpa(fed));
}

/** O federado FPG, ou null quando o que a prova traz é outra coisa (licença
 *  estrangeira, chave virtual, vazio). */
export function fedFpg(fed: unknown): string | null {
  return isFedFpg(fed) ? limpa(fed) : null;
}

/** Chave de um jogador numa lista: o federado/licença quando há, senão o nome
 *  (tolerante a «Apelido, Nome» — `vetKey`). Vazia se não há nem um nem outro. */
export function playerKey(fed: unknown, name: string | null | undefined): string {
  const f = limpa(fed);
  if (f) return `f:${f}`;
  const n = vetKey(name || "");
  return n ? `n:${n}` : "";
}

/** Dois federados que provam que são pessoas diferentes: ambos FPG e diferentes.
 *  (Licenças de fora não contradizem: a mesma pessoa aparece com a licença
 *  espanhola numa lista e o número da FPG noutra.) */
function contradiz(a: string, b: string): boolean {
  return isFedFpg(a) && isFedFpg(b) && a !== b;
}

export interface PlayerIndex<T> {
  /** O registo deste jogador: pelo federado; senão pelo nome — nunca o de um
   *  homónimo com OUTRO federado FPG, e nenhum quando o nome é de várias pessoas
   *  e o pedido não diz qual. */
  get(fed: unknown, name: string | null | undefined): T | undefined;
}

/** Índice de uma lista de jogadores (uma edição, as linhas de uma tabela) para
 *  procurar por federado-senão-nome com as guardas de homónimos. */
export function indexPlayers<T>(
  items: readonly T[],
  fedOf: (x: T) => unknown,
  nameOf: (x: T) => string | null | undefined,
): PlayerIndex<T> {
  const byFed = new Map<string, T>();
  const byName = new Map<string, T[]>();
  for (const x of items) {
    const f = limpa(fedOf(x));
    if (f && !byFed.has(f)) byFed.set(f, x);
    const n = vetKey(nameOf(x) || "");
    if (n) (byName.get(n) ?? byName.set(n, []).get(n)!).push(x);
  }
  return {
    get(fed, name) {
      const f = limpa(fed);
      const exacto = f ? byFed.get(f) : undefined;
      if (exacto) return exacto;
      const cands = (byName.get(vetKey(name || "")) ?? []).filter((x) => !contradiz(f, limpa(fedOf(x))));
      if (!cands.length) return undefined;
      if (!isFedFpg(f)) {
        const pessoas = new Set(cands.map((x) => limpa(fedOf(x))).filter(isFedFpg));
        if (pessoas.size > 1) return undefined;
      }
      return cands[0];
    },
  };
}
