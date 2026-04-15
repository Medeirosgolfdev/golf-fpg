/**
 * constants/config.ts — App-level configuration constants (consolidated)
 *
 * Merged from:
 *   - constants/tournaments.ts (FPG tournament config)
 *   - constants/tierDisplay.ts (tier labels + trend icons)
 *
 * Manuel-specific constants live in constants/manuel.ts.
 * Auth/password-gate constants live in utils/authConstants.ts.
 */

import { SC } from "../utils/scoreDisplay";

/* ═══════════════════════════════════════════════════════════════
   FPG TOURNAMENTS (from tournaments.ts)
   ═══════════════════════════════════════════════════════════════ */

export interface TorneioConfig {
  tcode: string;
  nome: string;
  escalao: string;
  sex: "M" | "F";
}

/** Torneios do circuito nacional juvenil FPG (Sub-10 a Sub-18, H e S) */
export const TORNEIOS_CONFIG: TorneioConfig[] = [
  { tcode: "10935", nome: "Sub-18 H", escalao: "Sub-18", sex: "M" },
  { tcode: "10936", nome: "Sub-18 S", escalao: "Sub-18", sex: "F" },
  { tcode: "10937", nome: "Sub-16 H", escalao: "Sub-16", sex: "M" },
  { tcode: "10938", nome: "Sub-16 S", escalao: "Sub-16", sex: "F" },
  { tcode: "10939", nome: "Sub-14 H", escalao: "Sub-14", sex: "M" },
  { tcode: "10940", nome: "Sub-14 S", escalao: "Sub-14", sex: "F" },
  { tcode: "10941", nome: "Sub-12 H", escalao: "Sub-12", sex: "M" },
  { tcode: "10942", nome: "Sub-12 S", escalao: "Sub-12", sex: "F" },
  { tcode: "10943", nome: "Sub-10 H", escalao: "Sub-10", sex: "M" },
  { tcode: "10944", nome: "Sub-10 S", escalao: "Sub-10", sex: "F" },
];

/* ═══════════════════════════════════════════════════════════════
   TIER DISPLAY (from tierDisplay.ts)
   ═══════════════════════════════════════════════════════════════ */

/** Labels traduzidos dos tiers de jogador */
export const TIER_L: Record<string, string> = {
  elite: "Elite", strong: "Forte", solid: "Sólido",
  developing: "Em Desenv.", beginner: "Iniciante",
};

/** Ícones e cores dos indicadores de tendência */
export const TR_I: Record<string, { i: string; c: string }> = {
  up2:    { i: "▲▲", c: SC.good },
  up:     { i: "▲",  c: "var(--score-par-seg)" },
  stable: { i: "●",  c: "var(--text-muted)" },
  down:   { i: "▼",  c: SC.warn },
  down2:  { i: "▼▼", c: SC.danger },
};
