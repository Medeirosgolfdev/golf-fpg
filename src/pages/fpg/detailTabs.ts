/**
 * detailTabs.ts — que aba o TournamentDetail abre.
 *
 * Ordem de decisão: a do URL (`?tab=`), se existir neste torneio; senão a aba
 * inicial que a página pede (`defaultTab` — ex.: «grupos» nos torneios de
 * clubes), se existir; senão a fase mais avançada do torneio (`fallbackIdx`,
 * calculada pelo TournamentDetail: Inscrições → Draw → R1 → … → Resumo).
 *
 * E até quando se mostra o «Draw estimado» da volta seguinte (`provaAindaDecorre`).
 */
import { addDaysIso, diaIso } from "../../utils/dias";

/** Dias depois do último dia previsto da prova em que ainda se mostra o «Draw
 *  estimado» da volta seguinte (os resultados de uma volta chegam com o scrape
 *  do fim-de-semana, e há provas de clube com as voltas em sábados seguidos). */
export const DIAS_DRAW_ESTIMADO = 7;

/**
 * A prova ainda pode estar a decorrer? Conta-se uma volta por dia a partir da
 * data da prova, mais `DIAS_DRAW_ESTIMADO` de folga. Passado isso, ou a volta
 * seguinte se jogou e a FPG tem o draw verdadeiro, ou não se jogou — em nenhum
 * dos casos uma estimativa do draw serve (10/11/2026: a Taça João Salazar de
 * Sousa, de 12/09, mostrava «Draw R2 estimado» dois meses depois). Sem data
 * legível não se sabe: não decorre.
 */
export function provaAindaDecorre(date: string | null | undefined, nRounds: number, hoje: string): boolean {
  const inicio = diaIso(date);
  if (!inicio) return false;
  return hoje <= addDaysIso(inicio, Math.max(1, nRounds) - 1 + DIAS_DRAW_ESTIMADO);
}

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
