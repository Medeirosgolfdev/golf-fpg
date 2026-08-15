/**
 * Listas de escalões partilhadas — única fonte para as reimplementações que
 * eram IDÊNTICAS em ≥2 sítios. ⚠ Listas específicas de uma página (com Sub-24/
 * Sénior/Absoluto/Sub-25 próprios, ou ordens distintas) ficam LOCAIS de
 * propósito: não são duplicados, são conjuntos diferentes por contexto.
 */

/** Escalões Drive/Aquapor (espaço, Sub 10→18). Usado por DrivePage + driveCircuitData. */
export const ESCALOES_DRIVE = ["Sub 10", "Sub 12", "Sub 14", "Sub 16", "Sub 18"];

/** Escalões jovens FPG (hífen, Sub-10→21). */
export const ESCALOES_JOVENS = ["Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18", "Sub-21"];

/** Ordem completa de escalões FPG (hífen, jovens → seniores).
 *  Usado por JogadoresPage + JogadoresPorAnoPage. */
export const ESC_ORDER_FULL = ["Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18", "Sub-21", "Sub-24", "Absoluto", "MidAmateur", "Sénior", "SuperSenior", "Outros"];

/** Escalões "seniores" no sentido da JogadoresPage (ocultos por defeito no
 *  tracking júnior). NÃO inclui Sub-24 (ainda é escalão jovem alargado). */
export const ESCALOES_SENIORES = ["Absoluto", "MidAmateur", "Sénior", "SuperSenior"];

const ESCALOES_SENIORES_SET = new Set(ESCALOES_SENIORES);

export function isSeniorEscalao(esc: string | null | undefined): boolean {
  return esc != null && ESCALOES_SENIORES_SET.has(esc);
}

/** Coerção de escalão inválido/vazio para "Absoluto" — a mesma regra do merge
 *  players×federados (mergePlayersWithFederados) aplicada aos fallbacks. */
export function coerceEscalao(esc: string | null | undefined): string {
  return (!esc || esc === "?" || esc === "Outros") ? "Absoluto" : esc;
}
