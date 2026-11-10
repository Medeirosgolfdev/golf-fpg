/**
 * src/utils/signupanytime.ts — o endereço da signupanytime (USKids), num só sítio
 * (10/11/2026). Antes cada página escrevia o URL à mão e a /draws ficou sem o
 * `/plugins/links` no caminho e com o `ax` errado no El Prat.
 *
 * O `ax` é a conta do organizador na signupanytime: 1129 serve quase tudo
 * (internacional); as excepções conhecidas estão em SIGNUP_AX_POR_TCODE.
 * Usar SEMPRE `signupanytimeUrl` — nunca escrever o endereço à mão.
 */

/** `ax` por omissão — a conta internacional da USKids. */
export const SIGNUP_AX_INTL = 1129;

/** Torneios cujo `ax` não é o internacional (tcode → ax). */
export const SIGNUP_AX_POR_TCODE: Readonly<Record<string, number>> = {
  "18438": 2739, // Marco Simone Invitational 2025
  "15573": 2760, // Real Club de Golf El Prat 2023
};

/** Vistas públicas da signupanytime: resultados ou lista de inscritos. */
export type SignupVista = "results" | "field";

/** O `ax` certo para um torneio (o da excepção, senão o internacional). */
export function signupAx(tcode: string | number): number {
  return SIGNUP_AX_POR_TCODE[String(tcode).trim()] ?? SIGNUP_AX_INTL;
}

/**
 * URL público de um torneio na signupanytime.
 *   signupanytimeUrl(21080)              → resultados, ax 1129
 *   signupanytimeUrl(15573)              → resultados, ax 2760 (El Prat)
 *   signupanytimeUrl(21080, "field")     → inscritos
 * `ax` só se passa quando o chamador sabe que é outro (ex.: vem nos dados).
 */
export function signupanytimeUrl(tcode: string | number, vista: SignupVista = "results", ax?: number): string {
  const t = String(tcode).trim();
  return `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=${vista}&fmt=nohead&ax=${ax ?? signupAx(t)}&t=${encodeURIComponent(t)}`;
}
