/**
 * intlCommon.ts — peças IGUAIS entre os conversores das fontes de fora da FPG
 * (MAJOR, França, Espanha, Catalunha). Só entra aqui o que é exactamente a
 * mesma regra em todas as fontes que o usam; as regras que diferem de fonte
 * para fonte (destaque PT, normalização de nomes, escalão por idade, «sem
 * cartão») ficam em cada conversor até a Mariana decidir.
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

/* ── Campo ── */

/** Nº de buracos de um par/cartão: 9 ou 18 quando o array tem esse tamanho,
 *  senão null (par em falta ou incompleto). */
export function holesOf(arr: readonly unknown[] | null | undefined): 9 | 18 | null {
  return arr && (arr.length === 18 || arr.length === 9) ? (arr.length as 9 | 18) : null;
}

/* ── País ── */

/** Célula «bandeira + país» da coluna Clube/País: `🇵🇹 Portugal`. `label`
 *  troca o texto (clube, cidade…) mantendo a bandeira do país. Sem trim: quem
 *  o fazia continua a fazê-lo. */
export function intlCountryCell(country: string, label: string = normPaisDisplay(country)): string {
  return `${gf(country)} ${label}`;
}
