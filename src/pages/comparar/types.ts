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

export interface ScoreDistBucket {
  eagle: number; birdie: number; par: number; bogey: number; double: number; triple: number; total: number;
}

/** Estatística por buraco (índice 1..18) agregada ao longo de todas as rondas com scorecard. */
export interface PerHoleStat {
  avg: number | null;     // média de gross no buraco
  parAvg: number | null;  // par médio (normalmente inteiro; fica média quando os campos têm pars diferentes por ronda)
  n: number;              // nº de rondas contabilizadas
}

export interface AggStats {
  totalStrokesOverPar: number;
  parOrBetterPct: number;
  dblOrWorsePct: number;
  byPar: Record<number, { avgVsPar: number; slPerRound: number }>;
  nRounds: number;
  nRoundsWithCard: number;
  scoreDist: ScoreDistBucket;
  /** Distribuições por tipo de par (3/4/5). */
  distByPar: Record<3 | 4 | 5, ScoreDistBucket>;
  /** Distribuições F9 vs B9. Só contabiliza holes com par e gross definidos. */
  f9dist: ScoreDistBucket;
  b9dist: ScoreDistBucket;
  /** Média de (gross − par) por F9 e por B9 ronda a ronda. `f9sl`/`b9sl` já existiam com este valor — mantidos para compat. */
  f9toParAvg: number | null;
  b9toParAvg: number | null;
  /** Média de gross por F9 e B9 (quando as 9 foram jogadas). */
  f9grossAvg: number | null;
  b9grossAvg: number | null;
  /** Média por buraco índice 1..18 ao longo de todas as rondas com scorecard. */
  perHoleAvg: PerHoleStat[];
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

/* ── Período de análise (single source of truth) ── */

export type PeriodKey = "all" | "2y" | "1y" | "6m" | "20r" | "10r";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "all",  label: "Todos os jogos" },
  { key: "2y",   label: "Últimos 2 anos" },
  { key: "1y",   label: "Último ano" },
  { key: "6m",   label: "Últimos 6 meses" },
  { key: "20r",  label: "Últimas 20 rondas" },
  { key: "10r",  label: "Últimas 10 rondas" },
];

/**
 * Calcula o cutoff temporal para o período escolhido.
 * Para modos "20r"/"10r" precisa de receber todas as rondas do jogador — devolve
 * undefined se o jogador tem ≤ N rondas (todas passam).
 */
export function periodCutoff(key: PeriodKey, allRounds: { dateSort: number }[]): number | undefined {
  const now = Date.now();
  if (key === "2y")  return now - 2 * 365.25 * 86400000;
  if (key === "1y")  return now - 365.25 * 86400000;
  if (key === "6m")  return now - 182.5 * 86400000;
  if (key === "20r" || key === "10r") {
    const n = key === "20r" ? 20 : 10;
    const sorted = [...allRounds].sort((a, b) => b.dateSort - a.dateSort);
    if (sorted.length <= n) return undefined;
    return sorted[n - 1].dateSort;
  }
  return undefined;
}

export function periodLabel(key: PeriodKey): string {
  return PERIOD_OPTIONS.find(o => o.key === key)?.label ?? key;
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
