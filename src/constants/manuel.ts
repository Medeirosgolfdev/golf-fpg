/**
 * constants/manuel.ts
 *
 * Dados centralizados do Manuel Medeiros.
 * Antes: MANUEL_FED em tournamentPrimitives, MANUEL_BIRTHDAY_* em USKIDSPage,
 *        MANUEL_BIRTH_YEAR em KIDSdataLoader, MANUEL_KNOWN_TIDS em KIDSPage,
 *        MANUEL_POS em rivalData.
 */

/** Código de federado FPG */
export const MANUEL_FED = "52884";

/** USKids player ID */
export const MANUEL_PLAYER_ID = "630106";

/** USKids account UID */
export const MANUEL_ACCOUNT_UID = "762810";

/** Data de nascimento: 29/04/2014 */
export const MANUEL_DOB = { year: 2014, month: 3 /* 0-indexed (Abril) */, day: 29 } as const;

/** Alias para retro-compatibilidade com KIDSdataLoader */
export const MANUEL_BIRTH_YEAR = MANUEL_DOB.year;

/**
 * Calcula o escalão USKids do Manuel numa determinada data de torneio.
 * Aceita ISO "YYYY-MM-DD" ou americano "M/D/YYYY".
 */
export function escalaoManuelParaData(dateStr: string): string {
  const iso = dateStr?.includes("-") ? dateStr : (() => {
    const [m, d, y] = (dateStr || "").split("/");
    return `${y}-${(m || "1").padStart(2, "0")}-${(d || "1").padStart(2, "0")}`;
  })();
  const data = new Date(iso);
  const anoT = data.getFullYear();
  const aniversarioNesse = new Date(anoT, MANUEL_DOB.month, MANUEL_DOB.day);
  const anos = anoT - MANUEL_DOB.year - (data < aniversarioNesse ? 1 : 0);
  if (anos <= 9) return "Boys 9";
  if (anos <= 10) return "Boys 10";
  if (anos <= 11) return "Boys 11";
  return "Boys 12";
}

/**
 * Detecta se um jogador é o Manuel (por fed ou nome).
 */
export function isManuel(p: { name?: string; fed?: string; fedCode?: string }): boolean {
  const fed = p.fed || p.fedCode;
  if (fed === MANUEL_FED) return true;
  const n = p.name || "";
  return n.includes("Manuel") && (n.includes("Medeiros") || n.includes("Goulartt"));
}

/** Variante por nome — para contextos USKids onde só temos a string do nome.
 *  Case-insensitive, suporta displayName() e nomes em CAPS. */
export function isManuelByName(nome: string): boolean {
  const n = nome.toLowerCase();
  return n.includes("manuel") && (n.includes("medeiros") || n.includes("francisco") || n.includes("goulartt"));
}

/**
 * Tids onde o Manuel tem resultados (para detectar confrontos directos na KIDSPage).
 */
export const MANUEL_KNOWN_TIDS = new Set([
  "wjgc25", "wjgc26", "wjgc26_1213", "brjgt25",
  "eowagr25",
  "venice25", "rome25", "marco26", "qdl25", "gg26", "doral25",
]);
