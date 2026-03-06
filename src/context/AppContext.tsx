/**
 * src/context/AppContext.tsx
 *
 * Contexto global da aplicação — partilha dados entre todas as páginas.
 * Elimina fetches duplicados (ex: players.json carregado em DrivePage, BJGTPage, etc.)
 *
 * Uso:
 *   const { players, simCourses, calUnlocked } = useAppContext();
 */

import { createContext, useContext } from "react";
import type { MasterData, PlayersDb, Course } from "../data/types";
import type { MelhoriasJson } from "../data/melhoriasTypes";

// ── Tipos ──────────────────────────────────────────────────────────

export interface AppStats {
  courses: number;
  tees: number;
  players: number;
}

export interface AppContextValue {
  /** Dados de campos FPG (master-courses.json) */
  masterData: MasterData;
  /** Base de dados de jogadores (players.json) */
  players: PlayersDb;
  /** Todos os campos disponíveis: FPG + away + extra (com dedup por courseKey) */
  simCourses: Course[];
  /** Dados de melhorias dos jogadores */
  melhorias: MelhoriasJson;
  /** Estatísticas de topo (campos, tees, jogadores) */
  stats: AppStats;
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
