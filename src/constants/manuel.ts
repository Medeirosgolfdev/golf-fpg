/**
 * Constantes e helpers relativos ao Manuel — referência única partilhada
 * entre páginas. Inclui DOB, IDs USKids (actual + legacy), federação FPG, e
 * detecção por nome ou ID.
 *
 * Centraliza valores que estavam dispersos por:
 *        MANUEL_BIRTH_YEAR em KIDSdataLoader, MANUEL_KNOWN_TIDS em KIDSPage,
 *        normalização de nome em vários sítios, etc.
 */

import { normName } from "../utils/normName";

/** Federação FPG. */
export const MANUEL_FED = "52884";

/**
 * IDs USKids do Manuel — actual + legacy (conta abandonada após El Prat 2023).
 * Histórico, confrontos H2H e progressão de escalões mergeam os dois como um
 * único jogador.
 */
const MANUEL_PLAYER_IDS = ["630106", "605933"] as const;

/** TIDs USKids conhecidos onde o Manuel jogou (preenchido conforme descoberto).
 *  Set para lookup O(1) via `.has()` — consumido por playerMatchesFilter. */
export const MANUEL_KNOWN_TIDS = new Set<string>();

/**
 * Data de nascimento.
 * Atenção: MANUEL_DOB.month é 0-indexed (Abril = 3) para uso directo com
 * `new Date(year, month, day)`.
 */
export const MANUEL_DOB = { year: 2014, month: 3, day: 29 } as const;

/** Ano de nascimento. Conveniência para cálculo de idade USKids. */
export const MANUEL_BIRTH_YEAR = MANUEL_DOB.year;

/**
 * Calcula o escalão USKids do Manuel numa determinada data de torneio.
 * Aceita ISO "YYYY-MM-DD" ou americano "M/D/YYYY".
 */
export function escalaoManuelParaData(dataT: Date | string): number {
  const d = typeof dataT === "string"
    ? (dataT.includes("/")
        ? (() => { const [mm, dd, yy] = dataT.split("/").map(Number); return new Date(yy, mm - 1, dd); })()
        : new Date(dataT))
    : dataT;
  const anoT = d.getFullYear();
  const aniversarioNesse = new Date(anoT, MANUEL_DOB.month, MANUEL_DOB.day);
  const anos = anoT - MANUEL_DOB.year - (d < aniversarioNesse ? 1 : 0);
  return anos;
}

/**
 * Detecta se um memberID USKids é do Manuel — actual ou legacy.
 */
function isManuelUskidsMid(mid: string | number | null | undefined): boolean {
  if (mid == null) return false;
  const s = String(mid);
  return MANUEL_PLAYER_IDS.includes(s as any);
}

/**
 * Detecta se um NOME é do Manuel. Aceita variantes:
 *   • "Manuel Medeiros"
 *   • "Manuel Francisco Medeiros"
 *   • "Manuel Goulartt Medeiros"
 *   • "Manuel Francisco Goulartt De Medeiros" (conta USKids antiga)
 *
 * Rejeita falsos positivos como "Manuel Joao Medeiros" (outros primeiros).
 */
export function isManuelByName(name: string): boolean {
  if (!name) return false;
  const n = normName(name);
  if (!/\bmanuel\b/.test(n)) return false;
  if (!/\bmedeiros\b/.test(n)) return false;
  // Reject if has different primary first name after "Manuel"
  if (/\b(joao|antonio|jose|pedro|miguel|ricardo|luis|carlos)\b/.test(n)) return false;
  return true;
}

/**
 * Detector universal — testa fed code, nome ou USKids memberID.
 */
export function isManuel(p: {
  name?: string;
  n?: string;
  fed?: string;
  fedCode?: string;
  memberId?: string | number;
  uskidsMid?: string | number;
  isM?: boolean;
}): boolean {
  if (p.isM) return true;
  const fed = p.fed || p.fedCode;
  if (fed && String(fed) === MANUEL_FED) return true;
  const mid = p.memberId ?? p.uskidsMid;
  if (mid != null && isManuelUskidsMid(mid)) return true;
  const name = p.name || p.n;
  if (name && isManuelByName(name)) return true;
  return false;
}
