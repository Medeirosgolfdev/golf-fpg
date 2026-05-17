/**
 * tournamentMerge.ts — Merge e dedup de torneios de múltiplas fontes.
 *
 * Funções puras reusáveis. Nenhuma depende de React/state.
 */
import type { Tournament } from "./fpgTypes";
import { buildDisplayList } from "./fpgUtils";

/** Chave canónica para dedup: `{ccode}/{tcode}`. */
export function tournamentKey(t: Tournament): string {
  return (t.ccode || "?") + "/" + String(t.tcode ?? "?");
}

/**
 * Faz merge de N arrays de torneios (vindos de fontes diferentes), aplicando
 * dedup por `{ccode}/{tcode}` — primeira ocorrência ganha. Mantém a ordem
 * relativa do primeiro array, depois adiciona apenas os novos do segundo, etc.
 *
 * Usado no FPGPage para fundir tournaments (pull-torneios + clubes) com
 * jovensTournaments (jovens_YYYY.json + Nacional 2026 sintético).
 *
 * Política intencional: torneios já presentes em `tournaments` ganham mesmo
 * que `jovensTournaments` tenha o mesmo ccode/tcode com dados mais recentes.
 * Isto mantém a navegação estável durante reloads parciais. Para inverter a
 * prioridade, chamar com a ordem inversa: dedupTournaments(jovens, base).
 */
export function dedupTournaments(...sources: Tournament[][]): Tournament[] {
  const map = new Map<string, Tournament>();
  for (const arr of sources) {
    for (const t of arr) {
      const k = tournamentKey(t);
      if (!map.has(k)) map.set(k, t);
    }
  }
  return [...map.values()];
}

/**
 * Constrói a `displayList` — versão deduplicada e expandida (multi-round
 * agrupado) pronta para alimentar a sidebar e tabs do FPGPage.
 *
 * @param sources — N arrays de torneios; primeira ocorrência ganha por dedup
 * @returns array final pós-dedup + buildDisplayList (multi-round merge)
 */
export function buildMergedDisplayList(...sources: Tournament[][]): Tournament[] {
  return buildDisplayList(dedupTournaments(...sources));
}

/**
 * Indexa um array de torneios por `{ccode}/{tcode}` para lookup O(1).
 * Útil quando se quer juntar dados de admissions/draws a torneios existentes.
 */
export function indexTournaments(arr: Tournament[]): Map<string, Tournament> {
  const m = new Map<string, Tournament>();
  for (const t of arr) m.set(tournamentKey(t), t);
  return m;
}
