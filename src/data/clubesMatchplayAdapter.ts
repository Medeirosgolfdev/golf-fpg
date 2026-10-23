/**
 * clubesMatchplayAdapter.ts — o match play 3-way dos torneios de clubes
 * (`MatchPlayData`, CLUBES{ano}.json → `matchPlayResults`) nas peças
 * partilhadas:
 *
 *   - `clubesMatchplayToFile` → `MatchplayFile`, desenhado pela <MatchplayView>
 *     (a mesma dos brackets ETC/FFG/Taça da Federação). Categoria → flight;
 *     dia → ronda; cada confronto entre clubes → TeamMatch com `sides` (3-way);
 *     cada par de jogadores → Game, com o estado buraco a buraco calculado das
 *     pancadas (`matchplayHoleStatuses`).
 *   - `clubesTeamPoints` → `TeamPointsData`, desenhado pela
 *     <TeamPointsStandings> (pontos por clube e categoria, Dia 1/Dia 2/Total).
 *
 * Até 21/10/2026 isto vivia dentro de um `MatchPlayResultsTable` feito à mão
 * na FPGPage (~400 linhas de estilos inline).
 */
import type { MatchPlayData, MpCat, MpDia, MpMatch, MpPlayer } from "./clubesMatchplayTypes";
import type {
  MatchplayFile, MatchplayFlight, MatchplayGame, MatchplayGameHole, MatchplayPlayerRef,
  MatchplayRound, MatchplaySide, MatchplayTeamMatch,
} from "../ui/circuit/matchplayTypes";
import type { TeamPointsData, TeamPointsPlayerRow, TeamPointsSelection } from "../ui/circuit/teamPointsTypes";
import { diaPendentes, diaPoints, playerRows } from "./clubesFormats";
import { isManuel } from "../constants/manuel";

/** Texto do aviso de confrontos sem resultado (a FPG não publicou a classificação). */
export const CLUBES_PENDING_NOTE =
  "a FPG não publicou a classificação desta prova, por isso estes confrontos ficam sem pontos até os resultados serem inseridos.";

/* ── Estado buraco a buraco ───────────────────────────────────────────── */

export interface HoleStatusesResult {
  /** Um por buraco do campo; `status` na perspectiva de A ("A/S", "2UP", "1DN"),
   *  null depois de o jogo acabar ou depois do último buraco com as 2 pancadas. */
  holes: MatchplayGameHole[];
  /** Buracos jogados (até fechar, ou até ao último com as 2 pancadas). */
  playedHoles: number;
  /** Diferença final: > 0 A ganhou buracos a mais. */
  diff: number;
  /** Resultado tirado das pancadas: "5&4", "2UP", "AS"; null sem buracos. */
  result: string | null;
}

/**
 * Estado corrido de um duelo a partir das pancadas de A e de B. Um buraco sem
 * as duas pancadas não mexe no estado. O jogo fecha quando a vantagem é maior
 * do que os buracos que faltam (o estado desse buraco é o último).
 */
export function matchplayHoleStatuses(
  scA: (number | null)[], scB: (number | null)[], par: number[],
): HoleStatusesResult {
  const n = par.length;
  let lastBoth = -1;
  for (let i = 0; i < n; i++) if (scA[i] != null && scB[i] != null) lastBoth = i;
  const holes: MatchplayGameHole[] = [];
  let diff = 0;
  let closed: { at: number; rem: number } | null = null;
  for (let i = 0; i < n; i++) {
    let status: string | null = null;
    if (!closed && i <= lastBoth) {
      const a = scA[i], b = scB[i];
      if (a != null && b != null) { if (a < b) diff++; else if (a > b) diff--; }
      const rem = n - 1 - i;
      status = diff === 0 ? "A/S" : `${Math.abs(diff)}${diff > 0 ? "UP" : "DN"}`;
      if (Math.abs(diff) > rem) closed = { at: i, rem };
    }
    holes.push({ hole: i + 1, par: par[i] ?? null, status });
  }
  const playedHoles = closed ? closed.at + 1 : lastBoth + 1;
  const result = playedHoles === 0 ? null
    : closed && closed.rem > 0 ? `${Math.abs(diff)}&${closed.rem}`
    : diff === 0 ? "AS" : `${Math.abs(diff)}UP`;
  return { holes, playedHoles, diff, result };
}

/* ── MatchPlayData → MatchplayFile ────────────────────────────────────── */

type Club = MatchPlayData["clubs"][number];

const playerRef = (p: MpPlayer): MatchplayPlayerRef =>
  ({ name: p.name, fed: p.fed ?? null, gross: p.gross ?? null, toPar: p.toPar ?? null });

/** Clubes que jogam a categoria (o CGSS não alinha em Senhoras), pela ordem do ficheiro. */
const catClubs = (mp: MatchPlayData, cat: MpCat): Club[] =>
  cat.participants ? mp.clubs.filter(c => cat.participants!.includes(c.key)) : mp.clubs;

const pointsOf = (m: MpMatch, key: string): number | null => {
  const v = m[key];
  return typeof v === "number" ? v : null;
};

/** O confronto tem resultado publicado (o mesmo critério do `diaPendentes`). */
const isSettled = (m: MpMatch): boolean => !!m.h2h?.length;

/** Hora de saída do confronto: o grupo do draw do dia onde está um dos jogadores. */
function teeTimeOf(mp: MatchPlayData, cat: MpCat, dia: number, m: MpMatch): string | null {
  const draw = dia === 1 ? mp.dia1 : dia === 2 ? mp.dia2 : undefined;
  const groups = draw?.groups?.[cat.key] ?? [];
  const ps = Object.values(m.players ?? {});
  const g = groups.find(gr => gr.players.some(dp =>
    ps.some(p => (p.fed && dp.fed ? p.fed === dp.fed : p.name === dp.name))));
  return g?.teeTime ?? null;
}

/** Os duelos de um confronto: um por par de clubes (pela ordem dos clubes). */
function gamesOf(mp: MatchPlayData, clubs: Club[], m: MpMatch): MatchplayGame[] {
  const par = mp.course?.par ?? [];
  const games: MatchplayGame[] = [];
  for (let i = 0; i < clubs.length; i++) {
    for (let j = i + 1; j < clubs.length; j++) {
      const a = clubs[i], b = clubs[j];
      const h = (m.h2h ?? []).find(x => (x.w === a.key && x.l === b.key) || (x.w === b.key && x.l === a.key));
      const pa = m.players?.[a.key], pb = m.players?.[b.key];
      if (!h && !(pa && pb)) continue;
      const scA = pa?.scores ?? [], scB = pb?.scores ?? [];
      const withCards = par.length > 0 && scA.length >= 9 && scB.length >= 9;
      const st = withCards ? matchplayHoleStatuses(scA, scB, par) : null;
      const aWon = !!h && !h.half && h.w === a.key;
      const bWon = !!h && !h.half && h.w === b.key;
      // A margem publicada manda; sem ela, a das pancadas — só se der o mesmo
      // vencedor que o resultado publicado (senão não se inventa nada).
      const stAgrees = st?.result != null && (aWon ? st.diff > 0 : bWon ? st.diff < 0 : st.diff === 0);
      const result = !h ? null
        : h.half ? "AS"
        : h.margin ?? (stAgrees ? st!.result : "✓");
      games.push({
        matchNo: games.length + 1,
        order: games.length + 1,
        format: "single",
        result,
        playedHoles: st ? st.playedHoles : null,
        startTime: null,
        isFinal: !!h,
        home: { teamId: mp.clubs.indexOf(a) + 1, name: a.shortName, players: pa ? [pa.name] : [], playerRefs: pa ? [playerRef(pa)] : [], result: null, won: aWon },
        away: { teamId: mp.clubs.indexOf(b) + 1, name: b.shortName, players: pb ? [pb.name] : [], playerRefs: pb ? [playerRef(pb)] : [], result: null, won: bWon },
        ...(st ? { holes: st.holes } : {}),
      });
    }
  }
  return games;
}

function teamMatchOf(mp: MatchPlayData, cat: MpCat, catIdx: number, dia: MpDia, m: MpMatch): MatchplayTeamMatch {
  const clubs = catClubs(mp, cat);
  const settled = isSettled(m);
  const pts = clubs.map(c => pointsOf(m, c.key));
  const max = settled ? Math.max(...pts.map(p => p ?? 0)) : null;
  const sides: MatchplaySide[] = clubs.map((c, i) => {
    const p = m.players?.[c.key];
    return {
      teamId: mp.clubs.indexOf(c) + 1,
      name: c.name,
      shortName: c.shortName,
      iso: null,
      country: null,
      points: settled ? (pts[i] ?? 0) : null,
      isLead: max != null && (pts[i] ?? 0) === max,
      playerRefs: p ? [playerRef(p)] : [],
    };
  });
  const two = sides.length === 2;
  return {
    teamMatchId: (catIdx + 1) * 10000 + dia.dia * 100 + m.match,
    matchNo: m.match,
    startTime: teeTimeOf(mp, cat, dia.dia, m),
    result: settled ? sides.map(s => s.points ?? 0).join(" – ") : null,
    isSettled: settled,
    isStarted: settled,
    home: sides[0] ?? null,
    away: sides[1] ?? null,
    winner: two && settled && pts[0] !== pts[1] ? ((pts[0] ?? 0) > (pts[1] ?? 0) ? "home" : "away") : null,
    games: gamesOf(mp, clubs, m),
    sides,
  };
}

export interface ClubesAdapterOpts {
  tournament?: string | null;
  slug?: string;
  year?: number | null;
  /** Ordem e nomes das categorias (CLUBES_TEAM_FORMAT); sem isto, as do ficheiro. */
  categories?: { key: string; label: string }[];
}

/** Categorias pela ordem do formato (H, S, J), só as que existem no ficheiro. */
function orderedCats(mp: MatchPlayData, opts: ClubesAdapterOpts): { cat: MpCat; label: string }[] {
  if (!opts.categories?.length) return mp.categories.map(cat => ({ cat, label: cat.label }));
  return opts.categories.flatMap(c => {
    const cat = mp.categories.find(x => x.key === c.key);
    return cat ? [{ cat, label: c.label }] : [];
  });
}

const drawOf = (mp: MatchPlayData, dia: number) => (dia === 1 ? mp.dia1 : dia === 2 ? mp.dia2 : undefined);

export function clubesMatchplayToFile(mp: MatchPlayData, opts: ClubesAdapterOpts = {}): MatchplayFile {
  const flights: MatchplayFlight[] = orderedCats(mp, opts).map(({ cat, label }, ci) => {
    const rounds: MatchplayRound[] = [...cat.dias]
      .sort((a, b) => a.dia - b.dia)
      .map(dia => ({
        number: dia.dia,
        name: `Dia ${dia.dia}`,
        date: drawOf(mp, dia.dia)?.date ?? null,
        matches: (dia.matches ?? []).map(m => teamMatchOf(mp, cat, ci, dia, m)),
      }));
    return {
      competitionId: ci + 1,
      name: label,
      format: null,
      parentId: null,
      // A prova acabou; o que falta são resultados por publicar (aviso próprio).
      isCompleted: true,
      source: "fpg-clubes",
      rounds,
    };
  });
  return {
    tournament: opts.tournament ?? null,
    slug: opts.slug ?? "clubes-matchplay",
    year: opts.year ?? null,
    format: "3-way",
    parentCompetitionId: null,
    flights,
    scrapedAt: mp.lastUpdated ?? "",
    pendingNote: mp.pendingNote ?? CLUBES_PENDING_NOTE,
  };
}

/* ── Classificação por clube ─────────────────────────────────────────── */

export function clubesTeamPoints(mp: MatchPlayData, opts: ClubesAdapterOpts = {}): TeamPointsData {
  const cats = orderedCats(mp, opts);
  const diasN = [...new Set(mp.categories.flatMap(c => c.dias.map(d => d.dia)))].sort((a, b) => a - b);

  const selection = (diaOk: (d: MpDia) => boolean): TeamPointsSelection => {
    const pts: TeamPointsSelection["pts"] = {};
    const players: TeamPointsSelection["players"] = {};
    let pending = 0;
    for (const club of mp.clubs) { pts[club.key] = {}; players[club.key] = []; }
    for (const { cat } of cats) {
      const dias = cat.dias.filter(diaOk);
      pending += dias.reduce((s, d) => s + diaPendentes(d), 0);
      const matches = dias.flatMap(d => (d.matches ?? []).map(m => ({ ...m, _dia: d.dia })));
      for (const club of catClubs(mp, cat)) {
        pts[club.key][cat.key] = dias.reduce((s, d) => s + diaPoints(d, club.key), 0);
        for (const r of playerRows(matches, club.key)) {
          const row: TeamPointsPlayerRow = {
            key: `${cat.key}:${r.key}`,
            catKey: cat.key,
            name: r.player?.name ?? "—",
            fed: r.player?.fed ?? null,
            gross: r.player?.gross ?? null,
            toPar: r.player?.toPar ?? null,
            pts: r.pts,
            vs: Object.fromEntries(r.byOpp),
          };
          players[club.key].push(row);
        }
      }
    }
    return { pts, pending, players };
  };

  const byRound: TeamPointsData["byRound"] = { all: selection(() => true) };
  for (const n of diasN) byRound[String(n)] = selection(d => d.dia === n);

  const places = mp.grandTotal?._places;
  const highlight = mp.clubs
    .filter(c => mp.categories.some(cat => cat.dias.some(d => (d.matches ?? []).some(m => {
      const p = m.players?.[c.key];
      return !!p && isManuel({ fed: p.fed, name: p.name });
    }))))
    .map(c => c.key);

  return {
    teams: mp.clubs.map(c => ({ key: c.key, name: c.name, shortName: c.shortName })),
    categories: cats.map(({ cat, label }) => ({ key: cat.key, label })),
    rounds: diasN.map(n => ({ n, label: `Dia ${n}` })),
    byRound,
    ...(places ? { officialPlaces: places } : {}),
    ...(highlight.length ? { highlight } : {}),
    pendingNote: mp.pendingNote ?? CLUBES_PENDING_NOTE,
  };
}
