/**
 * driveTypes.ts — Drive-specific types
 *
 * Re-exports core types from fpgTypes.ts for backward compatibility.
 * Drive-specific extensions and domain types are defined here.
 */

// Re-export core types from fpgTypes for Drive domain
import type { Player, Tournament } from "../data/fpgTypes";
export type {  Player, Tournament };

export interface DriveData {
  lastUpdated: string;
  source: string;
  totalTournaments: number;
  totalPlayers: number;
  totalScorecards: number;
  tournaments: Tournament[];
}

export type SDLookup = Record<string, number>;

export type EscLookup = Map<string, string>; // fedCode -> normalized escalao ("Sub 12")

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

interface TournResult {
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
