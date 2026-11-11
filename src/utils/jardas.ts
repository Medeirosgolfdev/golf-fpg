/**
 * src/utils/jardas.ts — jardas ↔ metros, num só sítio (10/11/2026 — o `× 0.9144`
 * estava escrito à mão em 17 sítios: campos, USKids, BlueGolf, Kids).
 *
 * A USKids, a BlueGolf e os cartões ingleses/americanos dão distâncias em JARDAS;
 * o site mostra sempre METROS, arredondados ao metro.
 */

/** 1 jarda = 0,9144 m (exacto, por definição). */
export const METROS_POR_JARDA = 0.9144;

/** Jardas → metros, arredondado ao metro. */
export function jardasParaMetros(jardas: number): number {
  return Math.round(jardas * METROS_POR_JARDA);
}

/** Metros → jardas, arredondado à jarda. */
export function metrosParaJardas(metros: number): number {
  return Math.round(metros / METROS_POR_JARDA);
}

/** Jardas por buraco → metros por buraco. Buraco sem distância (0, vazio) fica 0. */
export function jardasParaMetrosPorBuraco(jardas: readonly (number | null | undefined)[]): number[] {
  return jardas.map((y) => (typeof y === "number" && y > 0 ? jardasParaMetros(y) : 0));
}
