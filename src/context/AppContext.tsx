/**
 * src/context/AppContext.tsx
 *
 * Contexto global da aplicação — partilha dados entre todas as páginas.
 * Elimina fetches duplicados (ex: players.json carregado em DrivePage, BJGTPage, etc.)
 *
 * Uso:
 *   const { players, calUnlocked } = useAppContext();
 *
 * Os campos (simCourses, tournamentCourses) NÃO estão aqui: carregam-se só nas
 * páginas que os usam — `CoursesGate` + `useCourses()` (CoursesContext.tsx).
 */

import { createContext, useContext } from "react";
import type { PlayersDb } from "../data/types";
import type { MelhoriasJson } from "../data/melhoriasTypes";

// ── Tipos ──────────────────────────────────────────────────────────

export interface AppContextValue {
  /** Base de dados de jogadores (players.json) */
  players: PlayersDb;
  /** Dados de melhorias dos jogadores */
  melhorias: MelhoriasJson;
  /** Nº de jogadores do players.json (estatística de topo da NavBar) */
  playerCount: number;
  /** Se o utilizador desbloqueou as secções com password */
  calUnlocked: boolean;
}

// ── Contexto ───────────────────────────────────────────────────────

export const AppContext = createContext<AppContextValue | null>(null);

/**
 * Hook para aceder ao contexto global.
 * Lança erro se usado fora do AppContext.Provider.
 */
export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext deve ser usado dentro de <AppContext.Provider>");
  }
  return ctx;
}
