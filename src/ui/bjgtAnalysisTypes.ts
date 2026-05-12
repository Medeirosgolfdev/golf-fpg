/**
 * Shared types for BJGT Analysis components
 */

export interface TournResult {
  p: number | string;
  t: number | null;
  tp: number | null;
  rd: number[];
}

export interface RivalPlayer {
  n: string;
  co: string;
  isM?: boolean;
  r: Record<string, TournResult>;
  up: string[];
  dob?: string;
}

export interface TournDef {
  id: string;
  name: string;
  short: string;
  date: string;
  rounds: number;
  par: number;
  field: number;
  nations: number;
  intendedRounds?: number;
  url: string;
  /** Buracos por ronda (9 ou 18). Default 18 se ausente. */
  holes?: number;
}

/** Shape of a single hole sample for distance-band analysis */
export interface HoleSample {
  ds: number;
  par: number;
  meters: number | null;
  gross: number;
}

/** Shape of a distance band definition */
export interface BandDef {
  par: number;
  minM: number;
  maxM: number;
  label: string;
}

/** Filtered band result */
export interface FilteredBand {
  key?: string;
  label: string;
  n: number;
  avg: number;
  pob: number;
  dbl: number;
  pobPct?: number;
  dblPct?: number;
  par?: number;
  minM?: number;
  maxM?: number;
  samples?: HoleSample[];
  allAvg?: number;
  allN?: number;
  col?: string;
}

/** Monthly stats entry */
export interface MonthStat {
  key: string;
  label: string;
  avgGross: number;
  n: number;
  grossStdDev: number;
  avgSD?: number;
  parOrBetter: number;
  doubleOrWorse: number;
  bounceRate: number | null;
  bestRound?: number;
  birdieRate?: number;
  bestStreak?: number;
  first3VsPar?: number;
  last3VsPar?: number;
  last3Avg?: number;
}

/** Coach monthly entry */
export interface CoachMonth {
  key: string;
  label: string;
  avgGross: number;
  n: number;
  grossStdDev: number;
}

/** Round average entry */
export type RoundAvg = { m: number; s: number } | null;
