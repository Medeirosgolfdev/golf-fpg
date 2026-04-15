/**
 * driveTypes.ts — Drive-specific types
 *
 * Re-exports core types from fpgTypes.ts for backward compatibility.
 * Drive-specific extensions and domain types are defined here.
 */

// Re-export core types from fpgTypes for Drive domain
export type { RoundScore, Player, Tournament } from "../data/fpgTypes";

export interface DriveData {
  lastUpdated: string;
  source: string;
  totalTournaments: number;
  totalPlayers: number;
  totalScorecards: number;
  tournaments: Tournament[];
}

export type SDLookup = Record<string, number>;

export type EscLookup = Map<string, string>; // fedCode → normalized escalão ("Sub 12")

export interface TStats {
  pos: number | string | null;
  gross: number;
  toPar: number;
  sd18: number | null;
  sdSource: "fpg" | "ags" | "raw" | null;
  nholes: number;
  birdies: number;
  pars: number;
  bogeys: number;
}

export interface TournGroup {
  key: string;
  label: string; // tab label
  campo: string;
  num: number;
  date: string;
  escalao: string | null; // para Challenge single-escalão ou null quando evento agrupa vários
  isMulti: boolean; // multi-ronda (R1/R2/Total)
  isEvent: boolean; // Challenge: vários escalões no mesmo dia/campo → tabs por escalão
  totalRounds: number;
  entries: Tournament[]; // 1 para single, N+1 para multi-ronda, N escalões para isEvent
}

export interface Sub12Row {
  fed: string;
  name: string;
  club: string;
  region: string;
  sex: string;
  hcp: number | null;
  results: TournResult[];
  avgGross: number | null;
  avgSD: number | null;
  bestGross: number | null;
  bestSD: number | null;
  tourneiosPlayed: number;
  totalBird: number;
  totalPars: number;
  totalBog: number;
  totalPts: number;
}

export interface TournResult {
  tournKey: string;
  pos: number | string | null;
  gross: number;
  toPar: number;
  sd: number | null;
  sdSource: "fpg" | "ags" | "raw" | null;
  nholes: number;
  birdies: number;
  pars: number;
  bogeys: number;
}
