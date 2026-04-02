/**
 * multiRoundTypes.ts — tipos e constantes do MultiRoundLeaderboard
 * Separados do componente para evitar conflitos de Fast Refresh.
 */

export interface MRRound {
  roundKey: string;
  label: string;
  gross: number | null;
  toPar: number | null;
  pts?: number | null;
  scorecardId?: string | null;
}

export interface MultiRoundRow {
  name: string;
  fed?: string;
  fedCode?: string;
  toPar: number | null;
  gross: number | null;
  pos: number;
  rounds: MRRound[];
  esc?: string;
  tee?: string;
  sex?: string;
  club?: string;
  hcp?: number | null;
}

export interface PlayerFilter {
  name: string;
  escs: string[];
  tees: string[];
  club: string;
}

export const EMPTY_FILTER: PlayerFilter = { name: "", escs: [], tees: [], club: "" };
