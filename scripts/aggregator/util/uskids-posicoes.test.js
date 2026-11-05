/**
 * Posições nos escalões USKids (05/11/2026): dois leaderboards no mesmo escalão, cut com
 * volta −18 e resultados de dois ficheiros.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { escalaoCanon } from "../../../src/data/model/escalao.ts";
const require = createRequire(import.meta.url);
const { separarLeaderboards, refazerPosicoes } = require("./uskids-posicoes.js");

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
  it("«Boys 10 (2.º leaderboard)» continua a ser o escalão Boys 10", () => {
    expect(escalaoCanon("Boys 10 (2.º leaderboard)", "uskids")).toBe(escalaoCanon("Boys 10", "uskids"));
  });
});
