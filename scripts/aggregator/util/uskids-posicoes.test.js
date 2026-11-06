/**
 * Posições nos escalões USKids (05/11/2026): dois leaderboards no mesmo escalão, cut com
 * volta −18 e resultados de dois ficheiros.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { escalaoCanon } from "../../../src/data/model/escalao.ts";
const require = createRequire(import.meta.url);
const { separarLeaderboards, refazerPosicoes, cartaoDe, dividirPorFlights } = require("./uskids-posicoes.js");
const { divididosDe } = require("../../build-uskids-flights-divididos.js");

const r = (pos, voltas, extra = {}) => ({
  pos, _slim: true, totalGross: voltas.reduce((a, b) => a + b, 0),
  rounds: voltas.map((gross, i) => ({ round: i + 1, gross })), ...extra,
});

describe("separarLeaderboards", () => {
  it("dois campos no mesmo escalão (caso World 2023 Boys 10) → dois leaderboards pelos lugares", () => {
    // A: 208, 215, 215 (T2), 220 · B: 234, 236, 240
    const A = [r(1, [70, 70, 68]), r(2, [72, 72, 71]), r(2, [71, 72, 72]), r(4, [74, 73, 73])];
    const B = [r(1, [78, 78, 78]), r(2, [78, 79, 79]), r(3, [80, 80, 80])];
    const partes = separarLeaderboards([...B, ...A]);
    expect(partes).not.toBe(null);
    const tot = partes.map((p) => p.map((x) => x.totalGross).sort((a, b) => a - b));
    expect(tot).toContainEqual([208, 215, 215, 220]);
    expect(tot).toContainEqual([234, 236, 240]);
  });
  it("um só leaderboard coerente não se parte", () => {
    expect(separarLeaderboards([r(1, [70]), r(2, [72]), r(3, [75])])).toBe(null);
  });
});

describe("refazerPosicoes", () => {
  it("quem falhou o cut (2 voltas, lugares a recomeçar em 1) passa para depois de quem acabou", () => {
    const fl = [r(1, [73, 65, 69]), r(2, [71, 67, 71]), r(1, [77, 78]), r(2, [80, 76])];
    refazerPosicoes(fl);
    expect(fl.map((x) => x.pos)).toEqual([1, 2, 3, 4]);
  });
  it("jogador só do ficheiro de resultados entra pelo total entre todos (caso Great Northern Boys 12)", () => {
    const fl = [r(1, [79]), { pos: 1, totalGross: 80, rounds: [{ round: 1, gross: 80 }] }];
    refazerPosicoes(fl);
    expect(fl.map((x) => x.pos)).toEqual([1, 2]);
  });
  it("lugares oficiais com desempate (play-off) ficam como estão", () => {
    const fl = [r(1, [70, 70]), r(2, [70, 70]), r(3, [72, 72])];
    expect(refazerPosicoes(fl)).toBe(false);
    expect(fl.map((x) => x.pos)).toEqual([1, 2, 3]);
  });
  it("jogador do histórico sem lugar (desclassificado) continua sem lugar", () => {
    const fl = [r(1, [70, 70]), r(null, [69, 69])];
    refazerPosicoes(fl);
    expect(fl[1].pos).toBe(null);
  });
});

describe("rótulo do 2.º leaderboard", () => {
  it("«Boys 10 (2.º leaderboard)» e «Boys 10 (flight B)» continuam a ser o escalão Boys 10", () => {
    expect(escalaoCanon("Boys 10 (2.º leaderboard)", "uskids")).toBe(escalaoCanon("Boys 10", "uskids"));
    expect(escalaoCanon("Boys 10 (flight B)", "uskids")).toBe(escalaoCanon("Boys 10", "uskids"));
  });
});

// cartões de 1 volta de 2 buracos chegam para os testes
const j = (pos, ...voltas) => ({
  pos, _slim: true, totalGross: voltas.flat().reduce((a, b) => a + b, 0),
  rounds: voltas.map((s, i) => ({ round: i + 1, gross: s.reduce((a, b) => a + b, 0), strokes: s })),
});

describe("cartaoDe", () => {
  it("pancadas das voltas jogadas, sem os zeros nem a volta −18 do cut", () => {
    expect(cartaoDe([{ round: 2, gross: 9, strokes: [4, 5, 0] }, { round: 1, gross: 7, strokes: [3, 4, 0] }])).toBe("3.4|4.5");
    expect(cartaoDe([{ round: 1, gross: 7, strokes: [3, 4] }, { round: 2, gross: -18, strokes: [0, 0] }])).toBe("3.4");
    expect(cartaoDe([{ round: 1, gross: 70 }])).toBe(null);
  });
});

describe("dividirPorFlights (flights A/B da USKids — World Teen 2023 Boys 15-18)", () => {
  // A: 1:7 e 2:8 · B: 1:9 e 2:10 — a cache só tem os cartões do A
  const a1 = j(1, [3, 4]), a2 = j(2, [4, 4]), b1 = j(1, [4, 5]), b2 = j(2, [5, 5]), dns = { pos: null, _slim: true, totalGross: null, rounds: [] };
  const div = { flights: [
    { fid: "1", nome: "A", inscritos: 2, cartoes: ["3.4", "4.4"] },
    { fid: "2", nome: "B", inscritos: 2, cartoes: null },
  ] };
  it("quem está nos cartões do A vai para o A; o resto para o B; quem não jogou fica de fora", () => {
    const r = dividirPorFlights([b2, a1, dns, b1, a2], div);
    expect(r.flights.map((x) => x.flight.nome)).toEqual(["A", "B"]);
    expect(r.flights[0].results).toEqual([a1, a2]);
    expect(r.flights[1].results).toEqual([b2, b1]);
    expect(r.semCartao).toEqual([dns]);
  });
  it("cut (World 2024: o B jogou menos voltas) não é outro leaderboard", () => {
    const fim = j(1, [3, 4], [4, 4]);
    expect(dividirPorFlights([fim, j(1, [5, 5])], { flights: [
      { nome: "A", inscritos: 1, cartoes: ["3.4|4.4"] }, { nome: "B", inscritos: 1, cartoes: null },
    ] })).toBe(null);
  });
  it("com os dois flights em cache, um cartão que não está em nenhum → não decide", () => {
    expect(dividirPorFlights([a1, j(1, [6, 6])], { flights: [
      { nome: "A", inscritos: 1, cartoes: ["3.4"] }, { nome: "B", inscritos: 1, cartoes: ["4.5"] },
    ] })).toBe(null);
  });
  it("um só flight com inscritos («DONTDELETE» com 0) não divide nada", () => {
    expect(dividirPorFlights([a1], { flights: [{ nome: "A", inscritos: 1, cartoes: ["3.4"] }, { nome: "X", inscritos: 0 }] })).toBe(null);
  });
});

describe("divididosDe (build-uskids-flights-divididos)", () => {
  const entry = {
    meta: {
      age_groups: { 5: { name: "Boys 10" }, 6: { name: "Boys 11" } },
      flights: {
        10: { age_group: 5, registered: 2, name: "A" }, 11: { age_group: 5, registered: 2, name: "B" },
        12: { age_group: 6, registered: 3, name: "" }, 13: { age_group: 6, registered: 0, name: "DONTDELETE" },
      },
      courses: { 1: { name: "Legacy" }, 2: { name: "Quail Ridge" }, 3: { name: "Outro" } },
      flight_rounds: {
        100: { flight: 10, round: 1, course: 1 }, 101: { flight: 10, round: 2, course: 1 },
        110: { flight: 11, round: 1, course: 2 }, 111: { flight: 11, round: 2, course: 3 },
      },
      flight_courses: { 100: { pars: [3, 4], lengths: [150, 300] }, 101: { pars: [3, 4], lengths: [150, 300] }, 110: { pars: [4, 4], lengths: [] }, 111: { pars: [5, 3], lengths: [] } },
    },
    flights: { 10: { players: { p1: { rounds: { 1: { strokes: [3, 4], numStrokes: 7 }, 2: { strokes: [4, 4], numStrokes: 8 } } } } } },
  };
  it("só escalões com 2+ flights com inscritos; par só quando o flight jogou tudo num campo", () => {
    const d = divididosDe(entry);
    expect(Object.keys(d)).toEqual(["Boys 10"]);
    const [A, B] = d["Boys 10"].flights;
    expect([A.nome, A.voltas, A.cursos, A.par, A.cartoes]).toEqual(["A", 2, ["Legacy", "Legacy"], [3, 4], ["3.4|4.4"]]);
    expect([B.nome, B.cursos, B.par, B.cartoes]).toEqual(["B", ["Quail Ridge", "Outro"], null, null]);
  });
});
