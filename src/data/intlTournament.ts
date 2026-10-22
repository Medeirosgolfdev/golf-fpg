/**
 * buildFPGTournament — monta o `Tournament` que o TournamentDetail lê a partir
 * dos dados de uma fonte de fora da FPG (BlueGolf, GolfGenius, GJGL, FFG,
 * Espanha, MAJOR…). Cada fonte só traduz os seus dados para `IntlPlayerIn`
 * (nome, voltas, país…); as regras comuns vivem aqui: roundScores por volta,
 * SI/metros só quando cobrem todos os buracos, ±par pelas voltas jogadas, WD
 * por voltas em falta, «sem cartão» (gross ≥ 900, `isNoCardGross`) e o
 * destaque PT pelo país.
 *
 * O que muda de fonte para fonte entra por opção explícita (`IntlBuildOptions`)
 * ou pelo campo do jogador/volta — nunca por uma cópia do construtor.
 */
import type { Tournament, Player, RoundScore } from "./fpgTypes";
import { isPtCountry } from "../utils/flagUtils";
import { isNoCardGross } from "./intlCommon";

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
  /** Nº de buracos (por omissão o tamanho do par, ou 18). */
  holes?: number;
  /** Par total (por omissão a soma do par; null = sem par total). */
  parTotal?: number | null;
}

export interface IntlRoundIn {
  gross: number | null;
  scores?: (number | null)[] | null;
  /** Nº da volta (por omissão, a posição + 1). */
  round?: number;
  /** Cartão do campo desta volta, por cima do do jogador/torneio (provas que
   *  mudam de campo ou de marcação a cada volta, tee por volta, CR só em 18
   *  buracos…). Não se chama `course` porque há fontes com `course` (texto)
   *  nas voltas. */
  card?: Partial<IntlCourse>;
  /** Buraco de saída (1 ou 10 nas divisões de 9 buracos e nos shotguns). */
  startHole?: number;
  /** Campos próprios da volta (ex.: `_emCurso`/`_holesPlayed` de uma volta a decorrer). */
  extra?: Record<string, unknown>;
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
  /** Não terminou; por omissão, quem tem menos voltas que o torneio. null = sem marca. */
  wd?: boolean | null;
  hcp?: number | null;
  /** Campo próprio do jogador (ex.: tee por sexo), por cima do do torneio. */
  course?: Partial<IntlCourse>;
  /** Destaque PT quando a regra da fonte não é a do país (null = sem marca). */
  isPortuguese?: boolean | null;
  /** Cartão da 1.ª linha (por omissão o da 1.ª volta). */
  scores?: (number | null)[] | null;
  /** Voltas jogadas (por omissão, o nº de voltas). */
  roundsPlayed?: number;
  /** Campos próprios da página (_classYear, _hcpEst, fed, escalão…). */
  extra?: Record<string, unknown>;
}

export interface IntlBuildOptions {
  /** Inclui quem não tem voltas (inscrito sem cartão, WD antes de jogar). Por omissão sai. */
  keepNoRounds?: boolean;
  /** Os dados vão tal como a fonte os dá: SI/metros/cartões sem a regra
   *  «só quando cobrem todos os buracos», sem null → 0 e sem os valores por
   *  omissão de posição, clube e total. */
  raw?: boolean;
  /** Campos do próprio torneio (`_openRound`, `_noHbh`, …). */
  extra?: Record<string, unknown>;
}

/** O par da fonte quando é válido (um valor por buraco); senão SEM PAR (`[]`:
 *  a linha PAR fica vazia e não há ±par por buraco). Nunca se inventa par —
 *  decisão da Mariana, 22/10/2026 (antes LGS, NextCaddy, RFEGolf, golfdirecto e
 *  GJGL punham 4 em cada buraco). */
export function parOrNone(par: readonly (number | null)[] | null | undefined, holes: number): number[] {
  return par && par.length === holes && par.every((x) => typeof x === "number") ? (par as number[]) : [];
}

const full = (arr: number[] | null | undefined, n: number): number[] | undefined =>
  arr && arr.length >= n && n > 0 ? arr : undefined;

export function buildFPGTournament(
  meta: { name: string; tcode: string; date?: string; campo?: string; rounds?: number },
  course: IntlCourse,
  players: IntlPlayerIn[],
  opts: IntlBuildOptions = {},
): Tournament {
  const { raw = false } = opts;
  // «Sem cartão» (gross ≥ 900): a volta não conta como jogada e um total ≥ 900
  // não é resultado — sem total, ±par nem posição. Quem só tinha voltas sem
  // cartão continua na lista (como WD, pelas voltas em falta).
  const kept = (opts.keepNoRounds ? players : players.filter((p) => p.rounds.length > 0)).map((p): IntlPlayerIn => {
    const noCardTotal = isNoCardGross(p.total);
    const rounds = p.rounds.filter((r) => !isNoCardGross(r.gross));
    if (!noCardTotal && rounds.length === p.rounds.length) return p;
    return { ...p, rounds, ...(noCardTotal ? { total: null, toPar: null, pos: null } : {}) };
  });
  const nR = meta.rounds ?? Math.max(0, ...kept.map((p) => p.rounds.length));
  const out: Player[] = kept.map((p) => {
    const c: IntlCourse = { ...course, ...p.course, par: p.course?.par ?? course.par };
    const n = c.par.length;
    const parSum = c.par.reduce((a, b) => a + b, 0);
    const parTotal = c.parTotal === null ? undefined : (c.parTotal ?? parSum);
    const si = full(c.si, n), meters = full(c.meters, n);
    const roundScores: RoundScore[] = p.rounds.map((r, ri) => {
      const rc: IntlCourse = r.card ? { ...c, ...r.card, par: r.card.par ?? c.par } : c;
      const rsi = rc === c ? si : full(rc.si, rc.par.length);
      const rmeters = rc === c ? meters : full(rc.meters, rc.par.length);
      return {
        round: r.round ?? ri + 1,
        gross: raw ? r.gross : (r.gross ?? 0),
        scores: raw ? r.scores : (r.scores ?? []).map((x) => x ?? 0),
        pars: rc.par,
        si: raw ? rc.si : (rsi ?? []),
        meters: raw ? rc.meters : (rmeters ?? []),
        teeName: rc.teeName,
        courseRating: rc.courseRating,
        slope: rc.slope,
        ...(r.startHole !== undefined ? { startHole: r.startHole } : {}),
        ...r.extra,
      } as RoundScore;
    });
    const played = p.rounds.length;
    const toPar = p.toPar !== undefined ? p.toPar
      : p.total != null && parSum > 0 ? p.total - parSum * played : null;
    return {
      scoreId: p.id,
      pos: raw ? p.pos : (p.pos ?? null),
      name: p.name,
      club: raw ? p.club : (p.club ?? ""),
      grossTotal: raw ? p.total : (p.total ?? null),
      toPar,
      nholes: c.holes ?? (n || 18),
      parTotal,
      scores: p.scores !== undefined ? p.scores : roundScores[0]?.scores,
      par: c.par,
      si: raw ? c.si : si,
      meters: raw ? c.meters : meters,
      teeName: c.teeName,
      course: c.course,
      courseRating: c.courseRating,
      slope: c.slope,
      hcpExact: p.hcp ?? undefined,
      roundScores,
      _wd: p.wd === null ? undefined : (p.wd ?? played < nR),
      _roundsPlayed: p.roundsPlayed ?? played,
      _isPortuguese: p.isPortuguese === null ? undefined : (p.isPortuguese ?? isPtCountry(p.country)),
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
    ...opts.extra,
  } as Tournament;
}
