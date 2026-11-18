/**
 * Ordem alfabética dos campos nas listas (Campos, Simulador, Comparar).
 *
 * O artigo inglês do início não conta: «The Els Club Vilamoura» fica no «E»,
 * «The Alto Club» no «A» — como «San Roque - Old Course» ao lado do New
 * (18/11/2026: o Old parecia faltar na lista do simulador por estar no «T»).
 * O nome mostrado não muda.
 */
export function nomeCampoParaOrdenar(nome: string): string {
  return nome.trim().replace(/^the\s+/i, "");
}

export function compareNomeCampo(a: string, b: string): number {
  return nomeCampoParaOrdenar(a).localeCompare(nomeCampoParaOrdenar(b), "pt", { sensitivity: "base" });
}
