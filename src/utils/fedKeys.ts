/**
 * fedKeys.ts — chaves virtuais de jogador
 *
 * Nem todos os jogadores têm número de federado português. Para os
 * internacionais, o `FPGPage` cria entradas VIRTUAIS no `playersDB` a partir
 * do nome, para que a app os consiga ligar às fontes /kids (USKids, WJGC,
 * Doral) e mostrar bandeira, escalão e o link ↗:
 *
 *   "intl:" + nome  ← kids-links.json      (curado)
 *   "kids:" + nome  ← kids-tracked-names.json (índice de nomes)
 *
 * Essas chaves são identificadores INTERNOS. Servem para procurar no
 * `playersDB` e para construir links — nunca para mostrar ao utilizador, que
 * não tem como distinguir `kids:diana_fraile_herrero` de um número de
 * federado. Uma coluna FED deve mostrar "–": a informação verdadeira é que
 * este jogador não tem federado, e o slug só a disfarça.
 *
 * O `DrawTab` já fazia esta distinção com um helper local; ficou aqui para
 * ser partilhada com o `AdmissionsTab`, onde faltava.
 */

/** True se a chave é virtual (derivada do nome), não um nº de federado real. */
export function isVirtualFed(fed: string | null | undefined): boolean {
  if (!fed) return false;
  return fed.startsWith("intl:") || fed.startsWith("kids:");
}

/**
 * O nº de federado a MOSTRAR, ou null quando não há um real.
 * Usar em qualquer célula que apresente o federado ao utilizador.
 */
export function displayFed(fed: string | null | undefined): string | null {
  if (!fed || isVirtualFed(fed)) return null;
  return fed;
}
