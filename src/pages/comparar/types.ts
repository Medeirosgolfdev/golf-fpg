/* Types partilhados entre CompararPage e sub-componentes */

import type { Player } from "../../data/types";
import type { PlayerPageData } from "../../data/playerDataLoader";
import type { PlayerStatsDb, PlayerStats } from "../../data/playerStatsTypes";
import { SC } from "../../utils/scoreDisplay";

export type { PlayerStatsDb, PlayerStats };

export interface Slot {
  fed: string; player: Player;
  data: PlayerPageData | null; loading: boolean; error: string | null;
}

export interface AggStats {
  totalStrokesOverPar: number;
  parOrBetterPct: number;
  dblOrWorsePct: number;
  byPar: Record<number, { avgVsPar: number; slPerRound: number }>;
  nRounds: number;
  nRoundsWithCard: number;
  scoreDist: { eagle: number; birdie: number; par: number; bogey: number; double: number; triple: number; total: number };
  avgGross: number | null;
  bestGross: number | null;
  f9sl: number | null;
  b9sl: number | null;
  avgSD: number | null;
  bestSD: number | null;
  best8of20SD: number | null;
  last5AvgSD: number | null;
  grossStdDev: number | null;
  sdStdDev: number | null;
  longestStreak: number;
  grossSeries: number[];
  sdSeries: { sd: number; dateSort: number; event: string }[];
}

export interface HoleBucket {
  n: number; sumDiff: number;
  eagle: number; birdie: number; parScore: number;
  bogey: number; double: number; triple: number;
}

export type HoleProfile = Map<string, HoleBucket>;

/* ── Constantes visuais partilhadas ── */

export const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
export const COLORS_LIGHT = ["var(--bg-success-strong)", "var(--bg-info-strong)", "var(--bg-danger-strong)", "var(--bg-warn-strong)"];

export const BIRDIE_COLOR = SC.good;
export const PAR_COLOR    = "var(--border-medium)";
export const BOGEY_COLOR  = "var(--color-info)";
export const DBL_COLOR    = "var(--color-info)";
