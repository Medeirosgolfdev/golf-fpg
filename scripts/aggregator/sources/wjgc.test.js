import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { rankResults } = require("./wjgc.js");

const p = (name, total, rounds) => ({ playerName: name, pos: null, status: "OK", totalGross: total, rounds });
const r18 = (gross) => ({ round: 1, gross, strokes: Array(18).fill(4) });

describe("rankResults — posições reconstruídas (a BlueGolf só imprime a 1ª de cada empate)", () => {
  it("ordena por total e dá posição partilhada aos empates", () => {
    const res = [p("C", 214, [r18(214)]), p("A", 202, [r18(202)]), p("B", 214, [r18(214)]), p("D", 220, [r18(220)])];
    rankResults(res, 18);
    const byName = Object.fromEntries(res.map((x) => [x.playerName, x.pos]));
    expect(byName).toEqual({ A: 1, B: 2, C: 2, D: 4 }); // empate ocupa 2 lugares
  });

  it("quem não jogou fica sem posição e marcado DNS", () => {
    const res = [p("A", 202, [r18(202)]), p("Sem cartão", null, [])];
    rankResults(res, 18);
    expect(res[1].pos).toBeNull();
    expect(res[1].status).toBe("DNS");
    expect(res[0].pos).toBe(1);
  });

  it("quem não completou todas as rondas vai para o fim sem posição", () => {
    const res = [
      p("Completo", 300, [r18(150), { round: 2, gross: 150, strokes: Array(18).fill(4) }]),
      p("Só 1 ronda", 140, [r18(140)]), // total melhor mas incompleto
    ];
    rankResults(res, 18);
    expect(res[0].pos).toBe(1);
    expect(res[1].pos).toBeNull();
    expect(res[1].status).toBe("CUT");
  });

  it("ronda parcial (WD a meio) não conta como completa", () => {
    const parcial = { round: 2, gross: 40, strokes: [...Array(9).fill(4), ...Array(9).fill(0)] };
    const res = [
      p("Completo", 300, [r18(150), { round: 2, gross: 150, strokes: Array(18).fill(4) }]),
      p("WD", 190, [r18(150), parcial]),
    ];
    rankResults(res, 18);
    expect(res[0].pos).toBe(1);
    expect(res[1].pos).toBeNull();
  });
});
