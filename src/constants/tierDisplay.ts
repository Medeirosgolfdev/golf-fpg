/**
 * constants/tierDisplay.ts
 *
 * Labels de tier e ícones de tendência para classificação de rivais.
 * Antes: TIER_L e TR_I duplicados em KIDSPage e BJGTAnalysisPage.
 */
import { SC } from "../utils/scoreDisplay";

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
