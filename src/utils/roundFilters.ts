/**
 * src/utils/roundFilters.ts
 *
 * Filtros partilhados para classificação de rondas.
 * Extraído de CompararPage — usado também por JogadoresPage e futuras análises.
 */

import type { RoundData } from "../data/playerDataLoader";

/** Gross máximo credível para 18 buracos (coincide com MAX_CREDIBLE_GROSS em CompararPage) */
const MAX_CREDIBLE_GROSS = 130;

/** Ronda válida de torneio: 18 buracos, não-EDS, não-Treino, não-Indiv, não-equipa, gross credível */
export function isTournamentRound(r: RoundData): boolean {
  if (r.holeCount !== 18 || r._isTreino || r._isTeamEvent) return false;
  if (r.gross == null) return false;
  const g = Number(r.gross);
  if (g <= 50 || g > MAX_CREDIBLE_GROSS) return false;
  const o = (r.scoreOrigin || "").trim();
  if (o === "EDS" || o === "Indiv" || o === "Treino") return false;
  const ev = (r.eventName || "").trim();
  if (ev === "EDS" || ev === "Indiv") return false;
  return true;
}
