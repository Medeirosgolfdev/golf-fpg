/*
 * Logos que se podem juntar aos PNGs (em cima ou em baixo do desenho).
 * Ficheiros na galeria de logos (public/Logos, a do 📁), fundo transparente.
 * O tamanho escolhe-se no painel (S/M/L) — basta UMA versão por cor de cada
 * logo. `match` escolhe-o à partida quando o nome do torneio bate.
 */
/** `dark`: logo claro (branco) — a miniatura do painel leva fundo escuro.
 *  `crop`: recorte (px do ficheiro) da margem transparente, feito só no
 *  desenho — o ficheiro da galeria fica como foi enviado. */
export type OverlayLogo = {
  id: string; label: string; src: string; match?: RegExp; dark?: boolean;
  crop?: { w: number; h: number; x0: number; y0: number; x1: number; y1: number };
};

export const OVERLAY_LOGOS: OverlayLogo[] = [
  // CGSS + Faldo: as 4 da galeria são 2 cores × 2 tamanhos — no painel só as 2 cores.
  { id: "cgss-faldo-1", label: "CGSS + Faldo (completo)", src: "/Logos/cgss-faldo-junior-tour-1.png", match: /faldo/i },
  { id: "cgss-faldo-3", label: "CGSS + Faldo (sem letras FALDO)", src: "/Logos/cgss-faldo-junior-tour-3.png" },
  { id: "drive-tour-fpg", label: "Drive Tour + Portugal Golf + FPG (branco)", src: "/Logos/drive-tour-portugal-golf-fpg-branco.webp",
    match: /final.*drive|drive.*final/i, dark: true, crop: { w: 2000, h: 555, x0: 141, y0: 144, x1: 1778, y1: 422 } },
];

/** Logo por omissão para um torneio (o 1º cujo `match` bate no nome). */
export function defaultLogoFor(event: string): string {
  return OVERLAY_LOGOS.find((l) => l.match && l.match.test(event))?.id ?? "";
}

/** Alturas do logo no PNG (px), por tamanho. */
export const LOGO_HEIGHTS = { S: 36, M: 52, L: 72 } as const;
export type LogoSize = keyof typeof LOGO_HEIGHTS;
