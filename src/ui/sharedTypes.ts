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
  /** SD OFICIAL da FPG nesta volta — o `sgd` do WHS do jogador, escrito pelo
   *  scripts/backfill-sd.js. É o único SD que o site mostra: nunca se calcula. */
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
  /** SD oficial da volta nos jogadores em formato flat (ver BaseRoundScore.sd). */
  sd?: number | null;
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
