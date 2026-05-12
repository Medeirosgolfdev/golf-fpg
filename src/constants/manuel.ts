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

/**
 * USKids player ID actual (conta criada depois da migração ~2024).
 * É o memberID global que o KIDSdataLoader usa como sonda canónica.
 */
export const MANUEL_PLAYER_ID = "630106";

/**
 * IDs USKids do Manuel — ACTUAL + LEGACY.
 *
 * ⚠️ HISTÓRICO IMPORTANTE: o Manuel jogou em 2023 (incluindo Real Club de Golf
 * El Prat tcode 15573, Boys 9, gross 44, place 3) com uma conta USKids ANTIGA.
 * Depois fizeram conta nova e o player_id mudou para 630106. Os dois IDs
 * apontam para a mesma pessoa e o sistema deve tratá-los como UM jogador para
 * efeitos de histórico, confrontos H2H, e progressão de escalões.
 *
 * Validação 2026-05-13: o mid legacy é `605933` — confirmado via
 * GetTournamentPlayers&t=15573&f=198807 + GetMemberTournamentResults&m=605933,
 * que devolve exactamente 1 torneio (El Prat 2023) com (Boys 9, gross 44,
 * place 3). Conta abandonada após esse evento. Script de validação:
 * `scripts/verify-manuel-legacy-mid.js`.
 */
export const MANUEL_PLAYER_IDS: readonly string[] = [
  "630106",  // conta actual (Manuel Goulartt Medeiros, Madeira / Santo da Serra)
  "605933",  // conta legacy (única aparição: El Prat 2023, Boys 9, gross 44, place 3)
];

/** Conjunto-set para lookup rápido */
export const MANUEL_PLAYER_ID_SET: ReadonlySet<string> = new Set(MANUEL_PLAYER_IDS);

/**
 * Verifica se um memberID USKids (string ou number) é o Manuel — actual ou legacy.
 */
export function isManuelUskidsMid(mid: string | number | null | undefined): boolean {
  if (mid == null) return false;
  return MANUEL_PLAYER_ID_SET.has(String(mid));
}

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
 * Detecta se um jogador é o Manuel — por fed, memberID USKids (actual ou legacy)
 * ou nome.
 *
 * Aceita variantes do nome USKids: "Manuel Medeiros", "Manuel Francisco
 * Medeiros", "Manuel Goulartt Medeiros", e "Manuel Francisco Goulartt De
 * Medeiros" (este último era o nome usado na conta USKids ANTIGA, visível
 * em torneios como El Prat 2023).
 */
export function isManuel(p: { name?: string; fed?: string; fedCode?: string; memberId?: string | number; uskidsId?: string | number }): boolean {
  const fed = p.fed || p.fedCode;
  if (fed === MANUEL_FED) return true;
  if (isManuelUskidsMid(p.memberId)) return true;
  if (isManuelUskidsMid(p.uskidsId)) return true;
  const n = p.name || "";
  return n.includes("Manuel") && (n.includes("Medeiros") || n.includes("Goulartt"));
}

/** Variante por nome — para contextos USKids onde só temos a string do nome.
 *  Case-insensitive, suporta displayName() e nomes em CAPS.
 *  Apanha também a forma antiga "Manuel Francisco Goulartt De Medeiros". */
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
