/*
 * Logos que se podem juntar aos PNGs (em cima ou em baixo do desenho).
 * Ficheiros em public/img/overlay-logos/ — PNG com fundo transparente,
 * recortados às margens. `match` escolhe o logo à partida quando o nome do
 * torneio bate (o utilizador pode sempre mudar ou tirar).
 */
export type OverlayLogo = { id: string; label: string; src: string; match?: RegExp };

export const OVERLAY_LOGOS: OverlayLogo[] = [
  { id: "cgss-faldo-1", label: "CGSS + Faldo 1", src: "/img/overlay-logos/cgss-faldo-1.png", match: /faldo/i },
  { id: "cgss-faldo-2", label: "CGSS + Faldo 2", src: "/img/overlay-logos/cgss-faldo-2.png" },
  { id: "cgss-faldo-3", label: "CGSS + Faldo 3", src: "/img/overlay-logos/cgss-faldo-3.png" },
  { id: "cgss-faldo-4", label: "CGSS + Faldo 4", src: "/img/overlay-logos/cgss-faldo-4.png" },
];

/** Logo por omissão para um torneio (o 1º cujo `match` bate no nome). */
export function defaultLogoFor(event: string): string {
  return OVERLAY_LOGOS.find((l) => l.match && l.match.test(event))?.id ?? "";
}

/** Alturas do logo no PNG (px), por tamanho. */
export const LOGO_HEIGHTS = { S: 36, M: 52, L: 72 } as const;
export type LogoSize = keyof typeof LOGO_HEIGHTS;
