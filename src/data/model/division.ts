/**
 * src/data/model/division.ts — o modelo comum (formato, estado, buracos, cut,
 * par) de uma divisão do CircuitShell, a partir dos DADOS que ela traz:
 * `results` (torneio no formato FPG), `totals` (só totais), `matchplay`
 * (brackets) e `admissions`/`roundDraws` (por disputar).
 *
 * Tipos estruturais (sem importar o `CircuitDivision` da UI) para os loaders e
 * os scripts Node poderem usar isto sem React.
 */
import type { Tournament } from "../fpgTypes";
import type { MatchplayFile } from "../../ui/circuit/matchplayTypes";
import type { ParOrigin, TournamentFormat, TournamentModel, TournamentStatus } from "./types";
import { tournamentModel } from "./tournament";

/** O que o modelo lê de uma divisão. */
export interface DivisionData extends TournamentModel {
  results?: Tournament;
  totals?: { players: { rounds: (number | null)[]; total?: number | null; toPar?: number | null }[]; parPerRound: number | null };
  matchplay?: MatchplayFile;
  /** Desenho à medida, sem dados (Escócia): só se sabe que há resultados. */
  customResults?: unknown;
  admissions?: { players?: unknown[] };
  roundDraws?: unknown[];
}

/** Match play por equipas ou individual: um confronto com vários jogos (ou a
 *  N lados) é de equipas. */
export function matchplayFormat(mp: MatchplayFile): TournamentFormat {
  const team = mp.flights.some((f) => f.rounds.some((r) => r.matches.some((m) => (m.games?.length ?? 0) > 1 || (m.sides?.length ?? 0) > 2)));
  return team ? "matchplay-team" : "matchplay-ind";
}

/** Estado de um match play: todos os quadros fechados → `finished`; algum
 *  confronto começado → `live`; senão `future`. */
export function matchplayStatus(mp: MatchplayFile): TournamentStatus {
  if (mp.flights.length && mp.flights.every((f) => f.isCompleted)) return "finished";
  const started = mp.flights.some((f) => f.rounds.some((r) => r.matches.some((m) => m.isStarted || m.isSettled)));
  return started ? "live" : "future";
}

/** Modelo de uma divisão. `results` manda (é o leaderboard que se desenha);
 *  sem ele, só totais → `totals`; só brackets → match play; só inscrições ou
 *  draws → `future` sem formato conhecido. */
export function divisionModel(d: DivisionData): TournamentModel {
  if (d.results) return tournamentModel(d.results);
  if (d.totals) {
    const played = d.totals.players.some((p) => p.total != null || p.rounds.some((g) => g != null && g > 0));
    const parOrigin: ParOrigin = d.totals.parPerRound != null || d.totals.players.some((p) => typeof p.toPar === "number") ? "total-only" : "none";
    return { format: "totals", status: played ? "finished" : "future", holes: null, cut: null, parOrigin };
  }
  if (d.matchplay && d.matchplay.flights.length) {
    return { format: matchplayFormat(d.matchplay), status: matchplayStatus(d.matchplay) };
  }
  if (d.customResults) return { status: "finished" };
  return { status: "future" };
}

/** A divisão com os campos do modelo preenchidos (objecto novo). O que a
 *  divisão já traz (o conversor sabe melhor) não é substituído. */
export function withDivisionModel<D extends DivisionData>(d: D): D & TournamentModel {
  const m = divisionModel(d);
  const out: D & TournamentModel = { ...d };
  for (const k of ["format", "status", "holes", "cut", "parOrigin"] as const) {
    if (out[k] === undefined && m[k] !== undefined) (out as TournamentModel)[k] = m[k] as never;
  }
  return out;
}
