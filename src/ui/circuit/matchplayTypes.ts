/**
 * src/ui/circuit/matchplayTypes.ts
 *
 * Tipos do ficheiro de MATCH PLAY (brackets de equipas) das European Team
 * Championships, gerado por `scripts/scrape-golfbox-matchplay.js` →
 * `public/data/{slug}_matchplay_{ano}.json`. Complementa a stroke play
 * (JobFile) — ver `scrape-golfbox.js`. Modelo genérico do CircuitShell:
 * `CircuitDivision.matchplay` → aba "Match Play" no fim da barra, renderizada
 * pelo <MatchplayView> (a MajorPage anexa-o às fontes ETC via
 * GOLFBOX_MATCHPLAY_SOURCES em loadDivisionsFor).
 */
import { isPTByName } from "../../utils/ptPlayers";
import { isPtCountry } from "../../utils/flagUtils";

/** Jogador com identidade e resultado (opcional) — quando a fonte os dá
 *  (ex.: Regional de Clubes da FPG: federado, gross e ±par do dia). Com `fed`,
 *  o nome liga à ficha /jogadores/:fed. */
export interface MatchplayPlayerRef {
  name: string;
  fed?: string | null;
  gross?: number | null;
  toPar?: number | null;
}

export interface MatchplaySide {
  teamId: number | null;
  name: string | null;         // "PORTUGAL"
  iso: string | null;          // "PT" (flag-icon)
  country: string | null;      // "Portugal"
  points: number | null;       // 5.5
  isLead: boolean;
  seed?: number | null;        // cabeça de série (quadros individuais da FPG)
  shortName?: string | null;   // "SdS" — nos jogos de um confronto a N
  /** Jogadores que representam o lado NESTE confronto (3-way de clubes: 1 por clube). */
  playerRefs?: MatchplayPlayerRef[];
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
  /** Os mesmos jogadores de `players`, com federado/gross/±par quando há. */
  playerRefs?: MatchplayPlayerRef[];
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
  /** Confronto a N lados (3-way match play): TODOS os lados, com os pontos de
   *  cada um; `home`/`away` ficam com os dois primeiros. Os jogos são os
   *  duelos de cada par de lados. Com isto a ronda desenha-se com uma coluna
   *  por lado em vez de Casa/Fora. */
  sides?: MatchplaySide[];
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
  /** Com isto, a vista avisa dos confrontos sem resultado (`isSettled` falso)
   *  e explica porquê com este texto. */
  pendingNote?: string;
}

/** Um lado é português? (para destaque na UI). Equipas trazem iso/nome do país;
 *  nos brackets individuais (FFG) não há país nenhum — aí vale a lista de
 *  jogadores PT federados noutro país (`utils/ptPlayers`). */
export function sideIsPt(s: MatchplaySide | MatchplayGameSide | null): boolean {
  if (!s) return false;
  const iso = (s as MatchplaySide).iso;
  if (iso) return isPtCountry(iso);
  if (/portugal/i.test(s.name || "")) return true;
  const players = (s as MatchplayGameSide).players;
  if (players?.some((p) => isPTByName(p))) return true;
  return isPTByName(s.name);
}
