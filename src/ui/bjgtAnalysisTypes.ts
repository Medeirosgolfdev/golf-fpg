/**
 * Shared types for BJGT Analysis components
 */

interface TournResult {
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

/** Round average entry */
export type RoundAvg = { m: number; s: number } | null;
