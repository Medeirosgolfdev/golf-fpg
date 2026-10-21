/**
 * detailTabs.ts — que aba o TournamentDetail abre.
 *
 * Ordem de decisão: a do URL (`?tab=`), se existir neste torneio; senão a aba
 * inicial que a página pede (`defaultTab` — ex.: «grupos» nos torneios de
 * clubes), se existir; senão a fase mais avançada do torneio (`fallbackIdx`,
 * calculada pelo TournamentDetail: Inscrições → Draw → R1 → … → Resumo).
 */
export function initialTabIndex(
  tabs: { key: string }[],
  urlKey: string | null | undefined,
  defaultKey: string | undefined,
  fallbackIdx: number,
): number {
  const byUrl = urlKey ? tabs.findIndex(t => t.key === urlKey) : -1;
  if (byUrl >= 0) return byUrl;
  const byDefault = defaultKey ? tabs.findIndex(t => t.key === defaultKey) : -1;
  return byDefault >= 0 ? byDefault : fallbackIdx;
}
