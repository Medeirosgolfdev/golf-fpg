/**
 * src/utils/roundFilters.ts
 *
 * Filtros partilhados para classificação de rondas.
 * Extraído de CompararPage — usado também por JogadoresPage e futuras análises.
 */

import type { RoundData } from "../data/playerDataLoader";

/** Ronda válida de torneio: 18 buracos, não-EDS, não-Treino, não-Indiv, gross credível */
export function isTournamentRound(r: RoundData): boolean {
  if (r.holeCount !== 18 || r._isTreino || r.gross == null || Number(r.gross) <= 50) return false;
  const o = (r.scoreOrigin || "").trim();
  if (o === "EDS" || o === "Indiv" || o === "Treino") return false;
  const ev = (r.eventName || "").trim();
  if (ev === "EDS" || ev === "Indiv") return false;
  return true;
}
