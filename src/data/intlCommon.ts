/**
 * intlCommon.ts — peças IGUAIS entre os conversores das fontes de fora da FPG
 * (MAJOR, França, Espanha, Catalunha). Só entra aqui o que é exactamente a
 * mesma regra em todas as fontes que o usam; as regras que diferem de fonte
 * para fonte (destaque PT, normalização de nomes, escalão por idade) ficam em
 * cada conversor até a Mariana decidir.
 */
import { gf, normPaisDisplay } from "../utils/flagUtils";

/* ── Lookups por licença (Espanha/Catalunha) ── */

export interface DobLookupEntry { name: string | null; dob: string; dobIso: string; sex: string | null; club: string | null; catEdad: string | null; licencia?: string | null }
export type DobLookup = Record<string, DobLookupEntry>;
export interface DobLookupFile {
  generatedAt: string;
  totalLicencias: number;
  lookup: DobLookup;
}

/** Lookup global de HCP por licença (gerado por build-licencia-hcp-lookup.js).
 *  Usado para preencher HCP em falta nos players (cross-reference entre torneios). */
export interface HcpLookupEntry { hcp: number; source: string; tourneyId?: number; dateIso?: string | null }
export type HcpLookup = Record<string, HcpLookupEntry>;
export interface HcpLookupFile {
  generatedAt: string;
  total: number;
  lookup: HcpLookup;
}

/** O lookup por licença indexado por NOME normalizado (quem não traz licença
 *  cruza-se pelo nome). Num nome repetido ganha a última licença. */
export function dobLookupByName(dobLookup: DobLookup | undefined, norm: (s: string) => string): Record<string, DobLookupEntry> {
  const out: Record<string, DobLookupEntry> = {};
  if (dobLookup) for (const e of Object.values(dobLookup)) if (e.name) out[norm(e.name)] = e;
  return out;
}

/* ── Sem cartão ── */

/** Gross ≥ 900 (998, 999…) = «sem cartão» — regra da casa (decisão da Mariana,
 *  22/10/2026) em TODAS as fontes de fora e nos draws: a volta não conta como
 *  jogada, não pontua e não entra em médias, posições nem ±par. */
export const NO_CARD_FROM = 900;
export function isNoCardGross(gross: number | null | undefined): gross is number {
  return typeof gross === "number" && gross >= NO_CARD_FROM;
}

/* ── ±par ── */

/**
 * ±par pelas voltas que o jogador JOGOU: total − soma do par de CADA volta
 * jogada (10/11/2026). Regra única — antes cada fonte fazia a sua e o erro
 * voltava (par × voltas da PROVA: 82 numa volta de uma série de 2 dava «−62»;
 * par do torneio para quem joga outro par: GJGL raparigas +40 em vez de +31).
 * null quando não há total, o total é «sem cartão», não jogou volta nenhuma ou
 * falta o par de alguma volta — nunca se inventa.
 */
export function toParPlayed(
  total: number | null | undefined,
  parDeCadaVolta: readonly (number | null | undefined)[],
): number | null {
  if (typeof total !== "number" || !(total > 0) || isNoCardGross(total)) return null;
  if (!parDeCadaVolta.length) return null;
  let par = 0;
  for (const p of parDeCadaVolta) {
    if (typeof p !== "number" || !(p > 0)) return null;
    par += p;
  }
  return total - par;
}

/** O mesmo, quando o par é igual em todas as voltas: total − par × voltas JOGADAS. */
export function toParByRounds(
  total: number | null | undefined,
  parPorVolta: number | null | undefined,
  voltasJogadas: number,
): number | null {
  return toParPlayed(total, Array.from({ length: Math.max(0, voltasJogadas) }, () => parPorVolta));
}

/* ── Campo ── */

/** Nº de buracos de um par/cartão: 9 ou 18 quando o array tem esse tamanho,
 *  senão null (par em falta ou incompleto). */
export function holesOf(arr: readonly unknown[] | null | undefined): 9 | 18 | null {
  return arr && (arr.length === 18 || arr.length === 9) ? (arr.length as 9 | 18) : null;
}

/**
 * Buracos por volta de uma divisão, pela MAIORIA dos cartões (9 ou 18). Nunca
 * por «algum cartão tem 9»: numa divisão de 18 basta um jogador que desistiu a
 * meio para a marcar toda como 9 buracos (FM 2026 «13 & 14»: 328 voltas de 18 +
 * 1 de 9), e uma de 9 que sai do buraco 1 não se apanha pelo `startingHole`
 * (Doral, raparigas 7–11). Regra única desde 10/11/2026 (J13).
 */
export function holesByMajority(cards: Iterable<readonly unknown[] | null | undefined>): 9 | 18 {
  let n9 = 0, n18 = 0;
  for (const c of cards) {
    if (c?.length === 9) n9++;
    else if (c?.length === 18) n18++;
  }
  return n9 > n18 ? 9 : 18;
}

/* ── País ── */

/** Célula «bandeira + país» da coluna Clube/País: `🇵🇹 Portugal`. `label`
 *  troca o texto (clube, cidade…) mantendo a bandeira do país. Sem trim: quem
 *  o fazia continua a fazê-lo. */
export function intlCountryCell(country: string, label: string = normPaisDisplay(country)): string {
  return `${gf(country)} ${label}`;
}
