/**
 * src/utils/chaveJogador.ts — chaves dos jogadores de uma prova SEM fundir
 * homónimos (10/11/2026). Complementa o `playerKey` (utils/playerKey.ts), que dá
 * a chave de UM jogador («federado, senão nome»): aqui vê-se a lista toda.
 *
 * Juntar as voltas de um jogador pelo nome funde homónimos: dois «Pedro Aires»
 * sem federado somavam as voltas um do outro e tiravam os restantes da lista
 * («Partilhar torneio»). Regra, na linha de «os dados da própria prova»:
 *   1. o federado/licença, quando existe, é a chave (`playerKey`);
 *   2. sem ele, o nome;
 *   3. se numa lista há dois sem federado com o MESMO nome, separa-os o clube;
 *   4. se nem o clube os distingue, ficam SEM chave (null) — não se ligam a nada,
 *      em vez de se adivinhar.
 */
import { normName } from "./normName";
import { playerKey } from "./playerKey";

export interface JogadorComChave {
  fed?: string | number | null;
  fedCode?: string | number | null;
  name?: string | null;
  n?: string | null;
  club?: string | null;
}

const fedDe = (p: JogadorComChave): string => String(p.fed || p.fedCode || "").trim();
const nomeDe = (p: JogadorComChave): string => String(p.name ?? p.n ?? "");
const clubeDe = (p: JogadorComChave): string => normName(String(p.club ?? ""));

/**
 * Chaves dos jogadores de uma prova, dadas as suas listas (uma por volta, ou uma
 * só). A mesma pessoa recebe a mesma chave em todas as listas; um nome repetido
 * sem federado em alguma delas passa a levar o clube em TODAS; par nome+clube
 * que ainda se repita fica null (ambíguo).
 */
export function chavesSemFundir<T extends JogadorComChave>(listas: readonly (readonly T[])[]): Map<T, string | null> {
  const semFed = (p: T) => !fedDe(p);
  const chaveNome = (p: T) => playerKey("", nomeDe(p));   // «n:…», ou "" sem nome
  // Nomes (e nome+clube) que aparecem 2+ vezes, sem federado, numa mesma lista.
  const nomesRepetidos = new Set<string>();
  const nomeClubeRepetidos = new Set<string>();
  for (const lista of listas) {
    const porNome = new Map<string, number>();
    const porNomeClube = new Map<string, number>();
    for (const p of lista) {
      if (!semFed(p)) continue;
      const n = chaveNome(p), nc = `${n}|${clubeDe(p)}`;
      porNome.set(n, (porNome.get(n) ?? 0) + 1);
      porNomeClube.set(nc, (porNomeClube.get(nc) ?? 0) + 1);
    }
    for (const [n, c] of porNome) if (c > 1) nomesRepetidos.add(n);
    for (const [nc, c] of porNomeClube) if (c > 1) nomeClubeRepetidos.add(nc);
  }
  const out = new Map<T, string | null>();
  for (const lista of listas) {
    for (const p of lista) {
      if (!semFed(p)) { out.set(p, playerKey(fedDe(p), nomeDe(p))); continue; }
      const n = chaveNome(p);
      if (!n) { out.set(p, null); continue; }
      if (!nomesRepetidos.has(n)) { out.set(p, n); continue; }
      const nc = `${n}|${clubeDe(p)}`;
      out.set(p, nomeClubeRepetidos.has(nc) ? null : nc);
    }
  }
  return out;
}
