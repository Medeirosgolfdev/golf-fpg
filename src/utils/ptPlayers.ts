/**
 * ptPlayers — detecção de jogadores PORTUGUESES por nome.
 *
 * Alguns miúdos portugueses competem federados noutro país (o circuito lista-os
 * com bandeira FR/ES) — a nacionalidade dos dados não chega para os destacar.
 * Esta lista de excepções é a fonte ÚNICA desse conhecimento: era local à
 * FFGPage e por isso o match play (MatchplayView, partilhado com a /major) não
 * a via e o jogador perdia o destaque a meio da mesma página.
 *
 * Um nome bate se TODAS as palavras da entrada existirem no nome normalizado —
 * assim apanha variantes de ordem e nomes do meio ("Castro Ferreira Ricardo",
 * "Ricardo Castro Ferreira").
 */
const PT_NAME_EXCEPTIONS: ReadonlyArray<string[]> = [
  ["castro", "ferreira", "ricardo"], // Ricardo Castro Ferreira — St Germain (FR) desde 2026
];

export const ptNorm = (s: string | null | undefined): string =>
  String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Português pela lista de excepções de nome (independente da bandeira). */
export function isPTByName(name: string | null | undefined): boolean {
  const n = ptNorm(name);
  if (!n) return false;
  return PT_NAME_EXCEPTIONS.some((tokens) => tokens.every((t) => n.includes(t)));
}

/** Detecta jogador português via nacionalidade ISO-3 (PRT) ou variantes, ou via
 *  a lista de excepções de nome (jogadores PT federados noutro país). */
export const isPT = (nat: string | null | undefined, flag?: string | null, name?: string | null): boolean =>
  /^(PRT|POR|PT|PORTUGAL)$/i.test(String(nat || flag || "").trim()) || isPTByName(name);
