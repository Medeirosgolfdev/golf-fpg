/**
 * buildFPGTournament — monta o `Tournament` que o TournamentDetail lê a partir
 * dos dados de uma fonte de fora da FPG (BlueGolf, GolfGenius, GJGL, …). Cada
 * página só traduz a sua fonte para `IntlPlayerIn` (nome, voltas, país…); as
 * regras comuns vivem aqui: roundScores por volta, SI/metros só quando cobrem
 * todos os buracos, ±par pelas voltas jogadas, WD por voltas em falta e o
 * destaque PT pelo país.
 */
import type { Tournament, Player, RoundScore } from "./fpgTypes";
import { isPtCountry } from "../utils/flagUtils";

/** Campo de uma volta: par por buraco e, quando a fonte os dá, SI, metros, tee e CR/Slope. */
export interface IntlCourse {
  par: number[];
  si?: number[] | null;
  meters?: number[] | null;
  teeName?: string;
  courseRating?: number;
  slope?: number;
  /** Nome do percurso (linha de stats). */
  course?: string;
}

export interface IntlRoundIn {
  gross: number | null;
  scores?: (number | null)[] | null;
}

export interface IntlPlayerIn {
  id: string;
  name: string;
  pos?: number | string | null;
  /** Texto da coluna Clube/País (já com bandeira, se for o caso). */
  club?: string;
  /** País — só para o destaque PT. */
  country?: string | null;
  total?: number | null;
  /** ±par da fonte (null = sem ±par); omitido, total − par × voltas jogadas. */
  toPar?: number | null;
  rounds: IntlRoundIn[];
  /** Não terminou; por omissão, quem tem menos voltas que o torneio. */
  wd?: boolean;
  hcp?: number | null;
  /** Campo próprio do jogador (ex.: tee por sexo), por cima do do torneio. */
  course?: Partial<IntlCourse>;
  /** Campos próprios da página (_classYear, _hcpEst, …). */
  extra?: Record<string, unknown>;
}

const full = (arr: number[] | null | undefined, n: number): number[] | undefined =>
  arr && arr.length >= n && n > 0 ? arr : undefined;

export function buildFPGTournament(
  meta: { name: string; tcode: string; date?: string; campo?: string; rounds?: number },
  course: IntlCourse,
  players: IntlPlayerIn[],
): Tournament {
  const withRounds = players.filter((p) => p.rounds.length > 0);
  const nR = meta.rounds ?? Math.max(0, ...withRounds.map((p) => p.rounds.length));
  const out: Player[] = withRounds.map((p) => {
    const c: IntlCourse = { ...course, ...p.course, par: p.course?.par ?? course.par };
    const n = c.par.length;
    const parTotal = c.par.reduce((a, b) => a + b, 0);
    const si = full(c.si, n), meters = full(c.meters, n);
    const roundScores: RoundScore[] = p.rounds.map((r, ri) => ({
      round: ri + 1,
      gross: r.gross ?? 0,
      scores: (r.scores ?? []).map((x) => x ?? 0),
      pars: c.par,
      si: si ?? [],
      meters: meters ?? [],
      teeName: c.teeName,
      courseRating: c.courseRating,
      slope: c.slope,
    }) as RoundScore);
    const played = p.rounds.length;
    const toPar = p.toPar !== undefined ? p.toPar
      : p.total != null && parTotal > 0 ? p.total - parTotal * played : null;
    return {
      scoreId: p.id,
      pos: p.pos ?? null,
      name: p.name,
      club: p.club ?? "",
      grossTotal: p.total ?? null,
      toPar,
      nholes: n || 18,
      parTotal,
      scores: roundScores[0]?.scores,
      par: c.par,
      si,
      meters,
      teeName: c.teeName,
      course: c.course,
      courseRating: c.courseRating,
      slope: c.slope,
      hcpExact: p.hcp ?? undefined,
      roundScores,
      _wd: p.wd ?? played < nR,
      _roundsPlayed: played,
      _isPortuguese: isPtCountry(p.country),
      ...p.extra,
    } as unknown as Player;
  });
  return {
    name: meta.name,
    tcode: meta.tcode,
    date: meta.date ?? "",
    campo: meta.campo ?? "",
    rounds: nR,
    playerCount: out.length,
    players: out,
  } as Tournament;
}
