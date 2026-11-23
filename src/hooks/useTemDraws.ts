/**
 * Se um jogador tem Draws (companheiros de jogo) — vista «🤝 Draws» da ficha.
 *
 * O Manuel tem sempre (public/data/manuel-pairings.json); os outros jogadores
 * seguidos têm quando estão no índice public/data/pairings/index.json (os dois
 * gerados pelo scripts/pairings-build.js, 23/11/2026). Nunca se pede o ficheiro
 * de quem não está no índice: um ficheiro em falta não dá 404 em todo o lado
 * (o servidor de desenvolvimento devolve a página da app).
 *
 * Devolve `null` enquanto o índice não chegou.
 */
import { useJson } from "./useJson";
import { MANUEL_FED } from "../constants/manuel";

interface PairingsIndex { geradoEm: string; jogadores: Record<string, number> }

export function useTemDraws(fed: string): boolean | null {
  const eManuel = fed === MANUEL_FED;
  const { data, loading } = useJson<PairingsIndex>(eManuel ? null : "/data/pairings/index.json");
  if (eManuel) return true;
  if (loading) return null;
  return !!data?.jogadores[fed];
}

/** O ficheiro de Draws de um jogador. */
export const pairingsUrl = (fed: string) =>
  fed === MANUEL_FED ? "/data/manuel-pairings.json" : `/data/pairings/${fed}.json`;
