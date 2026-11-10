/**
 * Correcções da revisão de 10/11/2026 na camada de dados (achados I e J do
 * relatório `auditoria/2026-11-10_revisao-erros-golf-fpg.md`). Um caso real por
 * achado, em pequeno.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { toParPlayed, toParByRounds, holesByMajority } from "../intlCommon";
import { buildFPGTournament } from "../intlTournament";
import { ncCategoryRank } from "../rfeg/adapters";
import { divisionToTournament, gjglDiasSemVolta } from "../gjgl/toTournament";
import type { GjglData, GjglDivision } from "../gjgl/types";
import { adaptFcg, fcgToFPGTournament, type FCGDetail } from "../fcgAdapter";
import { legacyTid, toAutoResult } from "../kidsTid";
import { buildJovensAnalise } from "../jovensAnaliseData";
import { nineOf9HoleRound, eclecticForRound, loadPlayerData } from "../playerDataLoader";
import { converterTorneioCompleto, type RondaJogadorComCampo } from "../uskids/converterTorneioCompleto";
import { expandMultiRound } from "../fpgUtils";
import { isoDate } from "../../utils/format";
import type { Tournament } from "../fpgTypes";

describe("±par pelas voltas jogadas (toParPlayed) e buracos pela maioria", () => {
  it("total − par de CADA volta jogada; sem par, sem total ou «sem cartão» → null", () => {
    expect(toParPlayed(250, [73, 73, 73])).toBe(31);          // Loretto 2026, raparigas
    expect(toParByRounds(82, 72, 1)).toBe(10);                // uma volta de uma série de 2
    expect(toParPlayed(144, [72, null])).toBeNull();
    expect(toParPlayed(null, [72])).toBeNull();
    expect(toParPlayed(1087, [72, 72])).toBeNull();
    expect(toParByRounds(150, 72, 0)).toBeNull();
  });
  it("buildFPGTournament usa o par do cartão de cada volta", () => {
    const par70 = Array(18).fill(4).map((x, i) => (i < 2 ? 3 : x));
    const par73 = Array(18).fill(4).map((x, i) => (i < 1 ? 5 : x));
    const t = buildFPGTournament({ name: "x", tcode: "x" }, { par: par70 }, [
      { id: "a", name: "A", total: 146, rounds: [{ gross: 73 }, { gross: 73 }] },
      { id: "b", name: "B", total: 150, rounds: [{ gross: 75, card: { par: par73 } }, { gross: 75, card: { par: par73 } }] },
    ]);
    expect(t.players.map((p) => p.toPar)).toEqual([6, 4]);
  });
  it("holesByMajority: uma desistência a meio não faz a divisão de 9 buracos", () => {
    const c18 = Array(18).fill(4), c9 = Array(9).fill(4);
    expect(holesByMajority([c18, c18, c9])).toBe(18);
    expect(holesByMajority([c9, c9, c18])).toBe(9);
    expect(holesByMajority([])).toBe(18);
  });
});

describe("J5 — NextCaddy: a classificação final antes das de uma jornada", () => {
  it("ordem do Campeonato de Canarias Juvenil 2024", () => {
    const cats = ["2ª Jornada Scratch Indistinto", "Clasificación Final Indistinta", "Resultados Scratch Indistinta 1ª J.",
      "Final Cadete Masculino", "Handicap Indistinto Final", "Scratch Indistino Final", "Clasificacion Handicap Primera Jornada"];
    expect([...cats].sort((a, b) => ncCategoryRank(a) - ncCategoryRank(b))).toEqual([
      "Scratch Indistino Final", "Clasificación Final Indistinta", "Final Cadete Masculino",
      "2ª Jornada Scratch Indistinto", "Resultados Scratch Indistinta 1ª J.",
      "Handicap Indistinto Final", "Clasificacion Handicap Primera Jornada"]);
  });
});

describe("J3 + J9 — GJGL: par de cada volta do jogador e play-off fora das voltas", () => {
  const par72 = Array(18).fill(4);
  const par73 = [5, ...Array(17).fill(4)];
  const volta = (day: number, gross: number, par = par72, buracos = 18) =>
    ({ day, gross, par, scores: Array(18).fill(0).map((_, i) => (i < buracos ? 4 : 0)) });
  const div: GjglDivision = { ak: 18, ageGroup: "U18", players: [
    { pos: 1, country: "Switzerland", name: "Vencedor", total: 147, toPar: 0, gender: "m", rounds: [volta(1, 75), volta(2, 69), volta(3, 3, par72, 1)] },
    { pos: 2, country: "Germany", name: "Segundo", total: 154, toPar: 10, gender: "m", rounds: [volta(1, 77), volta(2, 77)] },
    { pos: 3, country: "Austria", name: "Rapariga", total: 165, toPar: 19, gender: "f", rounds: [volta(1, 84, par73), volta(2, 81, par73)] },
  ] };
  const d = { tournament: "T", slug: "t", year: 2026, country: "Portugal", start_date: "2026-03-01", par: par72, parTotal: 72, divisions: [div] } as unknown as GjglData;
  it("o dia em que ninguém jogou 9 buracos não é volta", () => {
    expect([...gjglDiasSemVolta(div)]).toEqual([3]);
  });
  it("vencedor com 2 voltas, total sem o play-off e ±par E; rapariga com o par dela", () => {
    const t = divisionToTournament(d, div, "T U18");
    expect(t.rounds).toBe(2);
    expect(t.players.map((p) => [p.name, p.grossTotal, p.toPar, p.roundScores!.length, p.parTotal])).toEqual([
      ["Vencedor", 144, 0, 2, 72], ["Segundo", 154, 10, 2, 72], ["Rapariga", 165, 19, 2, 73]]);
  });
});

describe("I6 — golfdirecto: metros, SI e tee do cartão de CADA jogador", () => {
  const tee = (color: string, m: number) => ({ color, par1_18: Array(18).fill(4), hcp1_18: Array.from({ length: 18 }, (_, i) => i + 1), meters1_18: Array(18).fill(m) });
  const jog = (nome: string, gender: string, gameTee: unknown) => ({
    _id: nome, firstName: nome, surname: "X", gender, license: null, country: "ESP", hcpExact: 5, isCardFinished: true, isCardClosed: true,
    view: { day: {}, acc: { strokeNumber: 80, onlyGross: 8, rankingPosition: 1 } }, previous: [],
    scorecard: { gameTee, gross: Array(18).fill(4).map((x, i) => (i < 8 ? 5 : x)) },
  });
  const d = {
    gameId: "g", fetchedAt: "2025-03-01T10:00:00Z",
    game: { _id: "g", name: "J1", status: "finished", scheduleStartDate: "2025-03-01T07:00:00Z", scheduleEndDate: null, pointMode: "strokePlay", tournament: { _id: "t", name: "PRUEBA INFANTIL" }, club: null, course: { name: "X" } },
    categories: [{ _id: "c", name: "INFANTIL", gender: null, players: [jog("RAPAZ", "M", tee("yellow", 278)), jog("RAPARIGA", "F", tee("red", 242))] }],
  } as unknown as FCGDetail;
  it("a rapariga das vermelhas não herda as amarelas do primeiro cartão", () => {
    const t = fcgToFPGTournament(adaptFcg(d))!;
    const por = (n: string) => t.players.find((p) => p.name.startsWith(n))!;
    expect([por("Rapaz").teeName, por("Rapaz").meters?.[0]]).toEqual(["Yellow", 278]);
    expect([por("Rapariga").teeName, por("Rapariga").meters?.[0], por("Rapariga").roundScores![0].meters?.[0]]).toEqual(["Red", 242, 242]);
  });
});

describe("I7 — tids: raparigas do Doral e field por flight", () => {
  const doral = { sourceId: "doral", sourceKey: "ftm_doral_2025", date: "2025-12-19" };
  it("«Girls 10-11» deixa de usar o tid dos rapazes", () => {
    expect(legacyTid(doral, { label: "Boys 10-11", ageMin: 10, ageMax: 11, sex: "M" })).toBe("doral25_b1011");
    expect(legacyTid(doral, { label: "Girls 10-11", ageMin: 10, ageMax: 11, sex: "F" })).toBe("doral25_g1011");
    expect(legacyTid(doral, { label: "Boys 7 & Under", sex: "M" })).toBe("doral25");
    expect(legacyTid(doral, { label: "Girls 7 & Under", sex: "F" })).toBe("doral25_g");
  });
  it("o resultado leva o field do flight onde o junior jogou", () => {
    const usk = { sourceId: "uskids", sourceKey: "14029" };
    const a = toAutoResult({ pos: 33, totalGross: 222, rounds: [{ gross: 74 }] }, { label: "Boys 10", ageMin: 10, ageMax: 10, sex: "M", fieldSize: 124 }, usk);
    const b = toAutoResult({ pos: 24, totalGross: 242, rounds: [{ gross: 79 }] }, { label: "Boys 10 (flight B)", ageMin: 10, ageMax: 10, sex: "M", fieldSize: 99 }, usk);
    expect([a.fs, b.fs]).toEqual([124, 99]);
  });
});

describe("I1 (restos) + I11 — Títulos: «Sub-25» com hífen e empates", () => {
  const rs = (...g: number[]) => g.map((gross, i) => ({ round: i + 1, gross, scores: [], pars: [], si: [], meters: [] }));
  const j = (pos: number | null, name: string, fed: string, dob: string, ...g: number[]) =>
    ({ pos, name, fedCode: fed, dob, grossTotal: g.reduce((a, b) => a + b, 0), toPar: null, roundScores: rs(...g) });
  const prova = (name: string, date: string, players: unknown[]) =>
    ({ name, date, ccode: "000", tcode: "10808", campo: "X", rounds: 2, players }) as unknown as Tournament;
  it("«Final Nacional Drive Tour Sub-25 H»: um só campeão, Sub 24, o vencedor", () => {
    const t = prova("Final Nacional Drive Tour Sub-25 H", "2024-11-23", [
      j(1, "João Miguel Pereira", "38580", "2004-05-01", 71, 77), j(2, "Miguel Cardoso", "29593", "2001-03-01", 76, 79),
      j(3, "Pedro Mendes", "31111", "2001-06-01", 76, 81), j(4, "João Paixão", "37678", "2004-02-01", 85, 95),
    ]);
    const a = buildJovensAnalise([t], {});
    expect(a.nacionalChampions.map((c) => [c.escalao, c.champion.name, c.runnerUp?.name])).toEqual([["Sub 24", "João Miguel Pereira", "Miguel Cardoso"]]);
  });
  it("empatados partilham o lugar; o play-off da fonte (1 e 2) desfaz o empate", () => {
    const empate = prova("Campeonato Nacional de Jovens Sub-12 Rapazes", "2008-07-14", [
      j(2, "A", "1", "1996-01-01", 80, 80), j(1, "B", "2", "1996-01-01", 82, 78), j(3, "C", "3", "1996-01-01", 81, 81), j(3, "D", "4", "1996-01-01", 82, 80),
    ]);
    const c = buildJovensAnalise([empate], {}).nacionalChampions;
    expect(c.map((x) => [x.escalao, x.champion.name, x.champion.pos, x.runnerUp?.name, x.runnerUp?.pos])).toEqual([["Sub 12", "B", 1, "A", 2]]);
    const semPlayoff = prova("Campeonato Nacional de Jovens Sub-12 Rapazes", "2008-07-14", [
      j(1, "A", "1", "1996-01-01", 80, 80), j(1, "B", "2", "1996-01-01", 82, 78),
    ]);
    const s = buildJovensAnalise([semPlayoff], {}).nacionalChampions[0];
    expect([s.champion.pos, s.runnerUp?.pos]).toEqual([1, 1]);
  });
});

describe("I4 — eclético de 9 buracos: 1–9 e 10–18 em baldes separados", () => {
  afterEach(() => vi.unstubAllGlobals());
  const front = [4, 3, 4, 4, 4, 3, 5, 3, 5], back = [4, 4, 3, 5, 4, 5, 3, 4, 5];
  it("a metade lê-se do par, contra o par dos 18 do campo", () => {
    expect(nineOf9HoleRound(front, [...front, ...back])).toBe("F");
    expect(nineOf9HoleRound(back, [...front, ...back])).toBe("B");
    expect(nineOf9HoleRound(back, null)).toBeNull();
    expect(nineOf9HoleRound(front, [...front, ...front])).toBeNull();   // metades iguais: não se adivinha
  });
  it("Laranjal: uma volta 1–9 e duas 10–18 no mesmo tee dão dois ecléticos", async () => {
    const r = (id: string, hc: number, dateSort: number) => ({ scoreId: id, date: "01-01-2020", dateSort, holeCount: hc, tee: "LARANJAS", teeKey: "laranjas", gross: 40, par: 36, sd: "", stb: "", hi: "" });
    const raw = {
      DATA: [{ course: "Campo Teste", count: 4, lastDateSort: 4, rounds: [r("x18", 18, 4), r("f1", 9, 3), r("b1", 9, 2), r("b2", 9, 1)] }],
      HOLES: {
        x18: { g: Array(18).fill(5), p: [...front, ...back], si: [], hc: 18 },
        f1: { g: [4, 4, 5, 5, 5, 3, 6, 3, 5], p: front, si: [], hc: 9 },
        b1: { g: [8, 5, 5, 5, 6, 7, 4, 4, 5], p: back, si: [], hc: 9 },
        b2: { g: [5, 4, 4, 7, 4, 5, 4, 9, 7], p: back, si: [], hc: 9 },
      },
      EC: {}, ECDET: {}, CURRENT_FED: "99999",
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes("cross-data") ? {} : raw))));
    const data = await loadPlayerData("99999");
    const nove = data.EC["campo teste"].filter((e) => e.holeCount === 9);
    expect(nove.map((e) => [e.nine, e.holes[0].h, e.totalGross])).toEqual([["B", 10, 5 + 4 + 4 + 5 + 4 + 5 + 4 + 4 + 5], ["F", 1, 40]]);
    const rodada = (id: string) => ({ scoreId: id, teeKey: "laranjas", holeCount: 9 });
    expect(eclecticForRound(data, "campo teste", rodada("b2"))?.nine).toBe("B");
    expect(eclecticForRound(data, "campo teste", rodada("f1"))?.nine).toBe("F");
    expect(eclecticForRound(data, "campo teste", { scoreId: "x18", teeKey: "laranjas", holeCount: 18 })?.holeCount).toBe(18);
  });
});

describe("J12 — USKids: flights do mesmo escalão em campos diferentes", () => {
  const holes = (yards: number) => Array.from({ length: 9 }, () => ({ par: 4, yards }));
  const flight = (campo: string, yards: number, nome: string) => ({
    category: "Boys 10", course_info: { R1: { course_name: campo, holes: holes(yards) } },
    flight_players: { p: { first: nome, last: "X", country: "us", rounds: { "1": { num_strokes: 40, num_holes: 9, strokes: Array(9).fill(4) } } } },
  });
  it("quem joga no outro campo traz o SEU cartão", () => {
    const t = converterTorneioCompleto({
      signupanytime_t: 14029, name: "World Championship 2023", start_date: "2023-08-03",
      age_groups: { "7": { name: "Boys 10", holes_per_round: 9 } },
      flights: { "177800": flight("Legacy Golf Links", 300, "Ana"), "195161": flight("Quail Ridge", 280, "Bea") },
    })!;
    const lb = t.escaloes[0].rondas[0].leaderboard as RondaJogadorComCampo[];
    expect(lb.map((x) => [x.nome, x.campo, x.metros?.[0]])).toEqual([["Ana X", undefined, undefined], ["Bea X", "Quail Ridge", 256]]);
  });
});

describe("J7 — prova que junta categorias com menos voltas", () => {
  it("quem tem as voltas da SUA categoria não fica «incompleto»; lugares por nº de voltas", () => {
    const rs = (...g: number[]) => g.map((gross, i) => ({ round: i + 1, gross, scores: [], pars: [], si: [], meters: [] }));
    const p = (name: string, g: number[], extra = {}) => ({ scoreId: name, name, pos: null, grossTotal: g.reduce((a, b) => a + b, 0), toPar: null, roundScores: rs(...g), ...extra });
    const t = { name: "Zonal", tcode: "z", date: "2025-05-01", campo: "", rounds: 2, players: [
      p("Sub14 A", [77, 78]), p("Sub14 B", [80, 80]), p("Sub12 A", [81], { _roundsExpected: 1 }), p("Sub12 B", [88], { _roundsExpected: 1 }), p("Sub14 C", [90]),
    ] } as unknown as Tournament;
    const total = expandMultiRound(t).find((x) => (x as { _isTotal?: boolean })._isTotal)!;
    expect(total.players.map((x) => [x.name, (x as { _pos?: number | null })._pos ?? null, !!(x as { _incomplete?: boolean })._incomplete])).toEqual([
      ["Sub14 A", 1, false], ["Sub14 B", 2, false], ["Sub12 A", 1, false], ["Sub12 B", 2, false], ["Sub14 C", null, true]]);
  });
});

describe("D6 — isoDate aceita DD-MM-AAAA", () => {
  it("converte o formato dos data.json da FPG", () => {
    expect(isoDate("15-01-2024")).toBe("2024-01-15");
    expect(isoDate("8/13/2026")).toBe("2026-08-13");
    expect(isoDate("2026-08-13T10:00")).toBe("2026-08-13");
  });
});
