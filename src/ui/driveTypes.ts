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

export type EscLookup = Map<string, string>; // fedCode -> normalized escalao ("Sub 12")

export interface TStats {
  pos: number | string | null;
  gross: number;
  toPar: number;
  sd18: number | null;
  nholes: number;
  birdies: number;
  pars: number;
  bogeys: number;
}

/** Uma prova de um jogador no Ranking Sub-12 do Drive. */
export interface TournResult {
  tournKey: string; tournName: string; tournShort: string;
  date: string; dateSort: number; campo: string; region: string;
  series: "tour" | "challenge" | "aquapor";
  gross: number; toPar: number; sd: number | null;
  pos: number | string | null; totalPlayers: number;
  /** Pontos oficiais desta prova (já com empates partilhados; nas Finais é o
   *  valor SIMPLES — o ×1.5 é aplicado pelo rankingTotal). */
  pts: number;
  nholes: number; birdies: number; pars: number; bogeys: number;
}

/** Linha (jogador) do Ranking Sub-12 do Drive. */
export interface Sub12Row {
  fed: string; name: string; club: string; region: string; sex: string; hcp: number | null;
  results: TournResult[];
  avgGross: number | null; avgSD: number | null; bestGross: number | null; bestSD: number | null; tourneiosPlayed: number;
  totalBird: number; totalPars: number; totalBog: number; totalPts: number;
  /** Escalão do jogador no torneio mais recente do ranking. */
  esc?: string;
}
