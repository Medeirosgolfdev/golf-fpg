/**
 * src/pages/major/matchplayTypes.ts
 *
 * Tipos do ficheiro de MATCH PLAY (brackets de equipas) das European Team
 * Championships, gerado por `scripts/scrape-golfbox-matchplay.js` →
 * `public/data/{slug}_matchplay_{ano}.json`. Complementa a stroke play
 * (JobFile) — ver `scrape-golfbox.js`. Consumido pela `MajorPage` (tab
 * "Match Play" dentro do torneio EBTC/ETC).
 */

export interface MatchplaySide {
  teamId: number | null;
  name: string | null;         // "PORTUGAL"
  iso: string | null;          // "PT" (flag-icon)
  country: string | null;      // "Portugal"
  points: number | null;       // 5.5
  isLead: boolean;
}

export interface MatchplayGameHole {
  hole: number;
  par: number | null;
  status: string | null;       // "A/S", "1UP", "2DN" (perspectiva do lado `home`)
}

export interface MatchplayGameSide {
  teamId: number | null;
  name: string | null;
  players: string[];           // ["Francisco Reis", "Luis Antonio Silva"]
  result: string | null;       // "1UP", "3&2", ""
  won: boolean;
}

export interface MatchplayGame {
  matchNo: number | null;
  order: number | null;
  format: string | null;       // "foursome" | "single"
  result: string | null;       // "1UP", "19th", "3&2"
  playedHoles: number | null;
  startTime: string | null;
  isFinal: boolean;
  home: MatchplayGameSide | null;
  away: MatchplayGameSide | null;
  holes?: MatchplayGameHole[];
}

export interface MatchplayTeamMatch {
  teamMatchId: number | null;
  matchNo: number | null;
  startTime: string | null;    // "07:40"
  result: string | null;       // "5.5 - 1.5"
  isSettled: boolean;
  isStarted: boolean;
  home: MatchplaySide | null;
  away: MatchplaySide | null;
  winner: "home" | "away" | null;
  games: MatchplayGame[];
}

export interface MatchplayRound {
  number: number;
  name: string | null;         // "Quarter Final"
  date: string | null;         // "2026-07-09"
  matches: MatchplayTeamMatch[];
}

export interface MatchplayFlight {
  competitionId: number;
  name: string;                // "Flight A"
  format: string | null;       // "KnockOut"
  parentId: number | null;
  isCompleted: boolean;
  source: string;
  rounds: MatchplayRound[];
}

export interface MatchplayFile {
  tournament: string | null;
  slug: string;
  year: number | null;
  format: string | null;
  parentCompetitionId: number | null;
  startDate?: string;
  endDate?: string;
  flights: MatchplayFlight[];
  scrapedAt: string;
}

/** Um lado é português? (para destaque na UI). */
export function sideIsPt(s: MatchplaySide | MatchplayGameSide | null): boolean {
  if (!s) return false;
  const iso = (s as MatchplaySide).iso;
  if (iso) return iso.toUpperCase() === "PT";
  return /portugal/i.test(s.name || "");
}
