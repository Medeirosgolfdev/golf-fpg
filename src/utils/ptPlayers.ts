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
import { isPtCountry } from "./flagUtils";

const PT_NAME_EXCEPTIONS: ReadonlyArray<string[]> = [
  ["castro", "ferreira", "ricardo"], // Ricardo Castro Ferreira — St Germain (FR) desde 2026
  // Jogam em Portugal (federados FPG) mas a USKids dá-lhes bandeira GB (20/11/2026, Mariana:
  // «não são portugueses, mas jogam em Portugal, podes colocá-los como portugueses?! deixa a
  // bandeira deles»). Linha destacada; a bandeira continua a da fonte.
  ["benji", "botham"],   // FPG 59860 (Holywood, Irlanda do Norte, na USKids)
  ["zeyn", "lababedi"],  // FPG 55498 (St Albans, na USKids)
  ["ziyang", "guo"],     // FPG 57904 — Estoril, PJA; bandeira CN na USKids (Mariana, 20/11/2026)
  // Portuguesa (FPG 48971) que joga em Espanha com licença RFEG AM25371959 (Costa Ballena) — a
  // RFEG não lhe dá país (23/11/2026, Mariana: «identifica a sabrina como portuguesa para
  // conseguirmos sempre a encontrar, e ela estar destacada colorida… como as regras para todos
  // os outros portugueses»).
  ["sabrina", "crisostomo"],
];

export const ptNorm = (s: string | null | undefined): string =>
  String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Português pela lista de excepções de nome (independente da bandeira). */
export function isPTByName(name: string | null | undefined): boolean {
  const n = ptNorm(name);
  if (!n) return false;
  return PT_NAME_EXCEPTIONS.some((tokens) => tokens.every((t) => n.includes(t)));
}

/** O país pela regra comum (`isPtCountry`) OU a lista de excepções de nome
 *  (vale mesmo com outra bandeira — não é um recurso para país em falta).
 *  Usada na FFG (decisão de 22/10/2026), desde 20/11/2026 a pedido da
 *  Mariana na USKids (quem joga em Portugal com bandeira estrangeira) e, desde
 *  23/11/2026, em Espanha (`rfegPlayerFlag`). */
export const isPT = (nat: string | null | undefined, flag?: string | null, name?: string | null): boolean =>
  isPtCountry(nat || flag) || isPTByName(name);
