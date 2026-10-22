import { describe, it, expect } from "vitest";
import historicoRaw from "../../../../public/data/fpg-nacionais-historico.json?raw";
import jovens2026Raw from "../../../../public/data/jovens_2026.json?raw";
import type { Tournament, Player } from "../../fpgTypes";
import { expandMultiRound } from "../../fpgUtils";
import { normalizePlayer } from "../../../utils/playerUtils";
import {
  tournamentHasResults, tournamentStatus, tournamentFormat, tournamentHoles,
  tournamentParOrigin, tournamentCut, tournamentModel, withTournamentModel,
} from "../tournament";
import { divisionModel, withDivisionModel, matchplayFormat, matchplayStatus } from "../division";
import type { MatchplayFile } from "../../../ui/circuit/matchplayTypes";

const P18 = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const rs = (round: number, gross: number, pars: number[] = P18) =>
  ({ round, gross, scores: [...pars], pars, si: [], meters: [] });
const pl = (over: Partial<Player>): Player => ({ name: "X", pos: 1, grossTotal: 72, toPar: 0, scoreId: "s", ...over } as Player);
const T = (players: Player[], over: Partial<Tournament> = {}): Tournament =>
  ({ name: "T", date: "2026-05-01", campo: "C", tcode: "1", playerCount: players.length, players, ...over } as Tournament);

const historico = (JSON.parse(historicoRaw) as { tournaments: Tournament[] }).tournaments
  .map((t) => ({ ...t, players: (t.players || []).map(normalizePlayer) }));
const jovens = (JSON.parse(jovens2026Raw) as { tournaments: Tournament[] }).tournaments
  .map((t) => ({ ...t, players: (t.players || []).map(normalizePlayer) }));
const reais = [...historico, ...jovens];

describe("estado (tournamentStatus) — o mesmo que as inferências de hoje", () => {
  it("sem resultados → future; com resultados → finished; _openRound → live", () => {
    expect(tournamentStatus(T([]))).toBe("future");
    expect(tournamentStatus(T([pl({ grossTotal: null, roundScores: [] })]))).toBe("future");
    expect(tournamentStatus(T([pl({})]))).toBe("finished");
    expect(tournamentStatus(T([pl({ grossTotal: "WD" })]))).toBe("finished");
    expect(tournamentStatus({ ...T([pl({})]), _openRound: 2 })).toBe("live");
  });
  it("dados reais: future ⇔ sem resultados (a regra do jovensCandidates)", () => {
    const hasResultsHoje = (t: Tournament) => (t.players || []).some((p) => (p.roundScores?.length ?? 0) > 0 || p.grossTotal != null);
    expect(reais.length).toBeGreaterThan(100);
    for (const t of reais) {
      expect(tournamentHasResults(t)).toBe(hasResultsHoje(t));
      expect(tournamentStatus(t) === "future").toBe(!hasResultsHoje(t));
    }
  });
});

describe("formato (tournamentFormat)", () => {
  it("stroke com cartões, totals sem nenhum cartão", () => {
    expect(tournamentFormat(T([pl({ scores: P18 })]))).toBe("stroke");
    expect(tournamentFormat(T([pl({ roundScores: [rs(1, 72)] })]))).toBe("stroke");
    expect(tournamentFormat(T([pl({ scores: [] }), pl({ scores: Array(18).fill(0) })]))).toBe("totals");
    expect(tournamentFormat(T([]))).toBe("stroke");
  });
  it("Clubes: match play 3-way → matchplay-team; por pancadas → stroke-team", () => {
    expect(tournamentFormat({ ...T([pl({ scores: P18 })]), matchPlayResults: { dia1: {} } } as never)).toBe("matchplay-team");
    expect(tournamentFormat({ ...T([pl({ scores: P18 })]), series: "clubes" })).toBe("stroke-team");
    expect(tournamentFormat({ ...T([pl({ scores: P18 })]), _clubesEsc: "sub14" })).toBe("stroke-team");
  });
  it("dados reais: os Nacionais/Jovens com cartões são stroke", () => {
    const comCartao = reais.filter((t) => t.players.some((p) => (p.scores ?? []).some((x: number) => x > 0)));
    expect(comCartao.length).toBeGreaterThan(5);
    for (const t of comCartao) expect(tournamentFormat(t)).toBe("stroke");
  });
});

describe("buracos (tournamentHoles) — a regra do ScorecardLB", () => {
  it("par mais comprido; sem par, os cartões; sem nada, nholes ou null", () => {
    expect(tournamentHoles(T([pl({ par: P18.slice(0, 9) }), pl({ par: P18 })]))).toBe(18);
    expect(tournamentHoles(T([pl({ par: [], scores: [4, 5, 3, 4, 4, 5, 3, 4, 4] })]))).toBe(9);
    expect(tournamentHoles(T([pl({ par: [], scores: [...P18] })]))).toBe(18);
    expect(tournamentHoles(T([pl({ nholes: 9 })]))).toBe(9);
    expect(tournamentHoles(T([]))).toBeNull();
  });
});

describe("origem do par (tournamentParOrigin)", () => {
  it("oficial / total-only / none", () => {
    expect(tournamentParOrigin(T([pl({ par: P18 })]))).toBe("oficial");
    expect(tournamentParOrigin(T([pl({ par: [], roundScores: [rs(1, 72)] })]))).toBe("oficial");
    expect(tournamentParOrigin(T([pl({ par: [], parTotal: 72, toPar: null })]))).toBe("total-only");
    expect(tournamentParOrigin(T([pl({ par: [], toPar: -2 })]))).toBe("total-only");
    expect(tournamentParOrigin(T([pl({ par: [], toPar: null })]))).toBe("none");
  });
});

describe("cut (tournamentCut) — o mesmo do expandMultiRound (aba Pré-Cut)", () => {
  it("5 jogadores eliminados depois da R2", () => {
    const three = (g: number) => [rs(1, g), rs(2, g), rs(3, g)];
    const two = (g: number) => [rs(1, g), rs(2, g)];
    const ps = [
      ...[70, 71, 72, 73, 74, 75].map((g, i) => pl({ name: `A${i}`, scoreId: `a${i}`, roundScores: three(g), parTotal: 72 })),
      ...[80, 81, 82, 83, 84].map((g, i) => pl({ name: `B${i}`, scoreId: `b${i}`, roundScores: two(g), parTotal: 72 })),
    ];
    const t = T(ps, { rounds: 3 });
    expect(tournamentCut(t)).toEqual({ afterRound: 2, line: 150, out: 5 });
    // a decorrer: não se procura cut
    expect(tournamentCut({ ...t, _openRound: 3 })).toBeNull();
  });
  it("sem várias voltas → sem cut", () => {
    expect(tournamentCut(T([pl({ scores: P18 })]))).toBeNull();
  });
  it("dados reais: afterRound = _cutAfterRound do expandMultiRound", () => {
    let comCut = 0;
    for (const t of reais) {
      const tot = expandMultiRound(t).find((x) => (x as { _isTotal?: boolean })._isTotal) as { _cutAfterRound?: number } | undefined;
      const c = tournamentCut(t);
      expect(c?.afterRound).toBe(tot?._cutAfterRound);
      if (c) { comCut++; expect(c.out).toBeGreaterThanOrEqual(5); }
    }
    expect(comCut).toBeGreaterThan(0);
  });
});

describe("tournamentModel / withTournamentModel", () => {
  it("preenche os cinco campos sem mexer no original", () => {
    const t = T([pl({ scores: P18, par: P18 })]);
    const m = withTournamentModel(t);
    expect(m).not.toBe(t);
    expect(t.format).toBeUndefined();
    expect({ format: m.format, status: m.status, holes: m.holes, cut: m.cut, parOrigin: m.parOrigin })
      .toEqual({ format: "stroke", status: "finished", holes: 18, cut: null, parOrigin: "oficial" });
    expect(withTournamentModel(t, "stroke-team").format).toBe("stroke-team");
    expect(tournamentModel(t)).toEqual({ format: "stroke", status: "finished", holes: 18, cut: null, parOrigin: "oficial" });
  });
});

describe("divisão (divisionModel)", () => {
  const mp = (games: number, sides = 2, done = true): MatchplayFile => ({
    tournament: "X", slug: "x", year: 2026, format: null, parentCompetitionId: null, scrapedAt: "",
    flights: [{ competitionId: 1, name: "A", format: "KnockOut", parentId: null, isCompleted: done, source: "",
      rounds: [{ number: 1, name: null, date: null, matches: [{
        teamMatchId: 1, matchNo: 1, startTime: null, result: null, isSettled: done, isStarted: done,
        home: null, away: null, winner: null, games: Array(games).fill({}) as never,
        ...(sides > 2 ? { sides: Array(sides).fill({}) as never } : {}),
      }] }] }],
  });
  it("match play: equipas (vários jogos ou 3 lados) vs individual; estado pelos quadros", () => {
    expect(matchplayFormat(mp(5))).toBe("matchplay-team");
    expect(matchplayFormat(mp(1, 3))).toBe("matchplay-team");
    expect(matchplayFormat(mp(1))).toBe("matchplay-ind");
    expect(matchplayStatus(mp(1))).toBe("finished");
    expect(matchplayStatus(mp(1, 2, false))).toBe("future");
  });
  it("results manda; só totais → totals; só inscrições → future", () => {
    expect(divisionModel({ results: T([pl({ scores: P18, par: P18 })]) }).format).toBe("stroke");
    expect(divisionModel({ totals: { players: [{ rounds: [72, 70], total: 142 }], parPerRound: 72 } }))
      .toEqual({ format: "totals", status: "finished", holes: null, cut: null, parOrigin: "total-only" });
    expect(divisionModel({ totals: { players: [{ rounds: [null], total: null }], parPerRound: null } }))
      .toEqual({ format: "totals", status: "future", holes: null, cut: null, parOrigin: "none" });
    expect(divisionModel({ matchplay: mp(1) })).toEqual({ format: "matchplay-ind", status: "finished" });
    expect(divisionModel({ admissions: { players: [{}] } })).toEqual({ status: "future" });
  });
  it("withDivisionModel não substitui o que o conversor já disse", () => {
    const d = withDivisionModel({ results: T([pl({ scores: P18 })]), format: "stroke-team" as const });
    expect(d.format).toBe("stroke-team");
    expect(d.status).toBe("finished");
  });
});
