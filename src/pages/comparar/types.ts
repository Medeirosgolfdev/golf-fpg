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

/** Campo mínimo necessário para filtrar uma ronda pelo período. */
export interface RoundLike {
  dateSort: number;
  scoreId: string;
}

/** Predicate: devolve true se a ronda pertence ao período seleccionado. */
export type RoundInPeriod = (r: RoundLike) => boolean;

/**
 * Constrói o selector para um período. Contém uma correcção crítica vs
 * versões anteriores: em modos "20r"/"10r" usa um Set<scoreId> em vez de um
 * cutoff por data — evita que empates de data (p.ex. 2 rondas no mesmo dia,
 * comuns em torneios) deixem passar rondas extra. Garante EXACTAMENTE N rondas.
 */
export function buildPeriodSelector(key: PeriodKey, allRounds: RoundLike[]): RoundInPeriod {
  const now = Date.now();
  if (key === "2y" || key === "1y" || key === "6m") {
    const days = key === "2y" ? 730 : key === "1y" ? 365 : 183;
    const cutoff = now - days * 86400000;
    return (r) => r.dateSort >= cutoff;
  }
  if (key === "20r" || key === "10r") {
    const n = key === "20r" ? 20 : 10;
    if (allRounds.length <= n) return () => true;
    // Desempate estável: por dateSort DESC, depois por scoreId para tornar
    // determinístico quando há empates de data.
    const sorted = [...allRounds].sort((a, b) => {
      if (b.dateSort !== a.dateSort) return b.dateSort - a.dateSort;
      return a.scoreId.localeCompare(b.scoreId);
    });
    const ids = new Set(sorted.slice(0, n).map(r => r.scoreId));
    return (r) => ids.has(r.scoreId);
  }
  // "all" ou desconhecido → sem filtro
  return () => true;
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
export const PAR_COLOR    = "var(--border)";
export const BOGEY_COLOR  = "var(--color-info)";
export const DBL_COLOR    = "var(--color-info)";
