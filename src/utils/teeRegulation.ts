/**
 * src/utils/teeRegulation.ts
 * ═══════════════════════════════════════════════════════════════════════
 * Regras de "área de partida" (tee de saída) por torneio.
 *
 * Alguns torneios definem o tee no regulamento em função do ESCALÃO + SEXO
 * do jogador — e essa regra difere da tabela FPG genérica. Como esses
 * torneios costumam ser multi-escalão (Sub10→Sub25 na mesma prova), o tee
 * TEM de ser calculado POR JOGADOR (do escalão dele à data + sexo), não do
 * escalão global do torneio.
 *
 * Uma `TeeRule` mapeia (nº do escalão, sexo) → nome da cor do tee
 * ("Brancas", "Amarelas", "Roxas", …). O nome é depois resolvido para uma
 * cor real por `getTeeHex`/`TeeDot` (ver shared/tee-colors.json).
 *
 * O `AdmissionsTab` usa a regra quando o TournamentDetail lha passa
 * (resolvida por ccode/tcode em `teeRuleFor`). Sem regra, cai no
 * comportamento genérico (`teeNameFor`, definido neste módulo).
 * ═══════════════════════════════════════════════════════════════════════
 */

import { norm } from "./format";

export type TeeSex = "M" | "F";

/** (nº do escalão — 10/12/14/16/18/21/24…, ou null p/ absoluto; sexo) → cor do tee. */
export type TeeRule = (subNum: number | null, sex?: TeeSex) => string | undefined;

/** Tee genérico da FPG por escalão+sexo (fallback quando não há TeeRule própria).
 *  Sub10→Verdes · Sub12→Vermelhas · Sub14 M→Amarelas/F→Vermelhas · Sub16/18 M→Brancas/F→Azuis. */
export function teeNameFor(escalao?: string, sex?: TeeSex): string | undefined {
  if (!escalao) return undefined;
  const n = norm(escalao);
  if (/sub\s*10/.test(n)) return "Verdes";
  if (/sub\s*12/.test(n)) return "Vermelhas";
  if (/sub\s*14/.test(n)) return sex === "F" ? "Vermelhas" : "Amarelas";
  if (/sub\s*16/.test(n) || /sub\s*18/.test(n)) return sex === "F" ? "Azuis" : "Brancas";
  return undefined;
}

/** Extrai o nº do escalão de um label "Sub 14" → 14. "Absoluto"/sem nº → null. */
export function parseSubNumber(escalao?: string | null): number | null {
  if (!escalao) return null;
  const m = /(\d{1,2})/.exec(escalao);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * VIII Miramar Internacional Open U25 (CGM) — regulamento MJO 2026, ponto d):
 *   Sub25/Sub18/Sub16 — Homens → Brancas ; Senhoras → Amarelas
 *   Sub14 — Homens → Amarelas ; Senhoras → Vermelhas
 *   Sub12 — Homens e Senhoras → Vermelhas
 *   Sub10 — Homens e Senhoras → Roxas
 */
export const MIRAMAR_U25_TEE_RULE: TeeRule = (n, sex) => {
  if (n != null && n <= 10) return "Roxas";
  if (n != null && n <= 12) return "Vermelhas";
  if (n != null && n <= 14) return sex === "F" ? "Vermelhas" : "Amarelas";
  // Sub16/18/21/24 (e absoluto ≤25 = null) → Homens Brancas / Senhoras Amarelas
  return sex === "F" ? "Amarelas" : "Brancas";
};

/**
 * Registo de regras por torneio, chaveado por `{ccode}-{tcode}`.
 *
 * O U25 do Miramar já usa o tcode REAL (10652), descoberto no live scoring a
 * 2026-08-19. O do Sub-10 continua a ser o placeholder sintético `90004` —
 * quando aparecer, actualizar aqui EM CONJUNTO com featuredTournaments.ts,
 * fpg-admissions-draws.json e fpg-admissions-scope.json.
 */
const TEE_RULES_BY_TOURNAMENT: Record<string, TeeRule> = {
  "003-10652": MIRAMAR_U25_TEE_RULE, // U25 (Sub12→Sub25) — tcode real
  "003-90004": MIRAMAR_U25_TEE_RULE, // Sub-10 (competição separada, 9 buracos/dia) → Roxas
};

/** Resolve a regra de tees de um torneio (undefined = usar tabela genérica). */
export function teeRuleFor(ccode?: string | null, tcode?: string | null): TeeRule | undefined {
  if (!ccode || !tcode) return undefined;
  return TEE_RULES_BY_TOURNAMENT[`${ccode}-${tcode}`];
}
