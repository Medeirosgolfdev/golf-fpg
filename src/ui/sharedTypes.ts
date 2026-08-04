/**
 * sharedTypes.ts — Base interfaces shared across domain types
 *
 * Provides common type foundations for Player, Tournament, and RoundScore
 * used by FPG, Drive, BJGT, and USKids modules.
 */

/** Base round scoring information */
export interface BaseRoundScore {
  round: number;
  gross: number;
  scores: number[];
  pars: number[];
  si: number[];
  meters: number[];
  courseRating?: number;
  slope?: number;
  /** SD oficial da ronda (fonte WHS). Usado como fallback quando não há
   *  CR/Slope para o cálculo local — ex.: recent-tournaments.json. */
  sd?: number | null;
  /** PCC oficial da FPG nesta volta (campo `cba` do ScoreCard; −1..+3).
   *  Entra no SD: (113/slope)×(AGS − CR − PCC). Ausente = 0. */
  pcc?: number;
  teeName?: string;
  teeColorId?: number;
  /** Buraco de saída desta ronda (1 ou 10 em saídas a dois tees). */
  startHole?: number;
}

/** Base player entry for tournaments */
export interface BasePlayer {
  name: string;
  pos: number | string | null;
  grossTotal: number | string | null;
  toPar: number | null;
  club?: string;
  courseRating?: number;
  slope?: number;
  /** PCC oficial da FPG (ver BaseRoundScore.pcc). */
  pcc?: number;
  teeName?: string;
  nholes?: number;
  /** Buraco de saída (1 ou 10 em saídas a dois tees). */
  startHole?: number;
}

/** Base tournament entry */
export interface BaseTournament {
  name: string;
  date: string;
  campo: string;
  players: BasePlayer[];
  tcode: string;
}
