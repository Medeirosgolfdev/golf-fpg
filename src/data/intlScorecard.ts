import type { ScorecardOptions } from "./fpgTypes";

/** Opções do scorecard das provas fora da FPG: sem ESC/FED/TEE (não há
 *  federado nosso), clube = «País», HCP só quando a fonte o traz e SD decidido
 *  pelos dados (CR/Slope) — regra única, 14/10/2026. Cada página acrescenta só
 *  o que é seu. */
export function intlScorecardOptions(over: Partial<ScorecardOptions> = {}): ScorecardOptions {
  return { hideHCP: true, hideSD: false, hideEsc: true, hideFed: true, hideTee: true, clubLabel: "País", ...over };
}
