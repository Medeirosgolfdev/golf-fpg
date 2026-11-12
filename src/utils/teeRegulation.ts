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
 * 2nd Castro Marim Portuguese International U14 Championship (Quinta do Vale,
 * 3-6/12/2026) — Termos de Competição da FPG, ponto c): «played from the
 * Tee 54 (Boys) and Tee 47 (Girls)», com Course Rating M 70,6 / L 72,4 e
 * Slope M 127 / L 128 (5500 m / 5000 m arredondados). No campo são:
 *   Rapazes (todos os escalões, também os Sub12) → Amarelas (5487 m, CR 70,6, Slope 127)
 *   Raparigas → Vermelhas (4789 m, CR 72,4, Slope 128 — rating de senhoras)
 */
export const CASTRO_MARIM_U14_TEE_RULE: TeeRule = (_n, sex) => (sex === "F" ? "Vermelhas" : "Amarelas");

/**
 * Quinta do Lago Junior Open 2026 (Laranjal, 27-29/12/2026) — Terms of
 * Competition do clube, «Teeing Areas»:
 *   U21 e U16 — Boys Black  ; Girls Gold
 *   U14       — Boys Gold   ; Girls Silver
 *   U12       — Boys Silver ; Girls Green
 * No scoring da FPG os tees do Laranjal chamam-se Pretas, Douradas, Brancas,
 * Laranjas e Verdes: o «Silver» dos Termos é o «Brancas» (nos draws de 2024 e
 * 2025 — 962/10067-10069 e 10078-10080 — as raparigas U14 e os rapazes U12
 * saíram das Brancas, com a mesma escada de tees).
 */
export const QDL_JUNIOR_OPEN_TEE_RULE: TeeRule = (n, sex) => {
  if (n != null && n <= 12) return sex === "F" ? "Verdes" : "Brancas";
  if (n != null && n <= 14) return sex === "F" ? "Brancas" : "Douradas";
  return sex === "F" ? "Douradas" : "Pretas";
};

/**
 * Registo de regras por torneio, chaveado por `{ccode}-{tcode}`.
 *
 * O Miramar 2026 já usa os tcodes REAIS descobertos nas Classifications da FPG
 * a 2026-08-19: U25 = 10652, Sub-10 = 10653.
 */
const TEE_RULES_BY_TOURNAMENT: Record<string, TeeRule> = {
  "003-10652": MIRAMAR_U25_TEE_RULE, // U25 (Sub12→Sub25) — tcode real
  "003-10653": MIRAMAR_U25_TEE_RULE, // Sub-10 (competição separada, 9 buracos/dia) → Roxas — tcode real
  // Castro Marim U14 2026 — tcodes PROVISÓRIOS das listas em PDF
  // (featuredTournaments.ts) e o REAL que a FPG abriu no scoring (10946,
  // rapazes e raparigas juntos). Os provisórios saem quando a prova passar
  // toda para o real.
  "000-90872": CASTRO_MARIM_U14_TEE_RULE, // Rapazes
  "000-90873": CASTRO_MARIM_U14_TEE_RULE, // Raparigas
  "000-10946": CASTRO_MARIM_U14_TEE_RULE, // tcode real
  // Quinta do Lago Junior Open 2026 — tcodes PROVISÓRIOS da Entry List em PDF
  // (featuredTournaments.ts); trocar pelos reais quando a FPG abrir a prova.
  "962-90912": QDL_JUNIOR_OPEN_TEE_RULE, // U12
  "962-90914": QDL_JUNIOR_OPEN_TEE_RULE, // U14
  "962-90916": QDL_JUNIOR_OPEN_TEE_RULE, // U16
  "962-90921": QDL_JUNIOR_OPEN_TEE_RULE, // U21
};

/** Resolve a regra de tees de um torneio (undefined = usar tabela genérica). */
export function teeRuleFor(ccode?: string | null, tcode?: string | null): TeeRule | undefined {
  if (!ccode || !tcode) return undefined;
  return TEE_RULES_BY_TOURNAMENT[`${ccode}-${tcode}`];
}
