import { describe, it, expect } from "vitest";
import { sserraLoopEclectics, eclecticos9 } from "../sserraLoops";
import type { CourseData, HoleScores, RoundData } from "../playerDataLoader";

const MACHICO = [4, 4, 5, 3, 4, 4, 5, 3, 4];
const DESERTAS = [4, 5, 4, 4, 4, 3, 5, 3, 4];
const SERRAS = [5, 4, 4, 4, 3, 4, 4, 3, 5];

const volta = (scoreId: string, dateSort: number, tee: string): RoundData =>
  ({ scoreId, date: `d${dateSort}`, dateSort, tee, teeKey: tee.toLowerCase(), holeCount: 18 } as RoundData);
const curso = (course: string, rounds: RoundData[]): CourseData => ({ course, count: rounds.length, lastDateSort: 0, rounds });
const card = (p: number[], g: number[]): HoleScores => ({ g, p, si: [], hc: p.length });

describe("sserraLoopEclectics", () => {
  it("separa as duas metades de uma volta de 18 pelo par e junta voltas de combinações diferentes", () => {
    const data = {
      DATA: [curso("Santo da Serra - Desertas+Machico", [volta("a", 2, "VERMELHAS")]),
             curso("Santo da Serra - Machico+Serras", [volta("b", 1, "VERMELHAS")])],
      HOLES: {
        a: card([...MACHICO, ...DESERTAS], [5, 4, 6, 3, 5, 4, 6, 4, 4, 5, 6, 4, 4, 5, 3, 6, 3, 5]),
        b: card([...SERRAS, ...MACHICO], [6, 5, 5, 4, 3, 5, 4, 3, 6, 4, 5, 5, 4, 4, 5, 5, 3, 5]),
      },
    };
    const r = sserraLoopEclectics(data);
    expect(r.map(l => l.nome)).toEqual(["Machico", "Desertas", "Serras"]);
    const machico = r[0].tees[0];
    expect(machico.rounds.map(x => x.scoreId)).toEqual(["a", "b"]);
    // melhor de cada buraco do Machico: volta a (1.ª metade) vs volta b (2.ª metade)
    expect(machico.best).toEqual([4, 4, 5, 3, 4, 4, 5, 3, 4]);
    expect(machico.total).toBe(36);
    expect(machico.rounds[1].combo).toEqual(["Serras", "Machico"]);
  });

  it("voltas de 9 buracos e tees separados; buracos sem resultado não contam", () => {
    const data = {
      DATA: [curso("Santo da Serra - Serras", [volta("c", 3, "ROXAS"), volta("d", 2, "VERMELHAS")])],
      HOLES: {
        c: card(SERRAS, [6, 5, 0, 4, 3, 5, 4, 3, 6]),
        d: card(SERRAS, [7, 5, 5, 5, 4, 5, 5, 4, 6]),
      },
    };
    const [serras] = sserraLoopEclectics(data);
    expect(serras.tees.map(t => t.teeName)).toEqual(["ROXAS", "VERMELHAS"]);
    expect(serras.tees[0].best[2]).toBeNull();
    expect(serras.tees[0].total).toBeNull();
    expect(serras.tees[1].total).toBe(46);
  });

  it("ignora outros campos", () => {
    const data = { DATA: [curso("Palheiro", [volta("e", 1, "BRANCAS")])], HOLES: { e: card(MACHICO, MACHICO) } };
    expect(sserraLoopEclectics(data)).toEqual([]);
  });
});

describe("eclecticos9 — campos de 9 jogados duas vezes", () => {
  const P = [4, 3, 4, 4, 3, 5, 4, 4, 5];
  const M = [282, 176, 322, 304, 114, 254, 219, 380, 348];
  const comMetros = (p: number[], g: number[], m: number[]): HoleScores => ({ g, p, si: [], m, hc: p.length });
  it("junta as duas metades das voltas de 18 e as voltas de 9; ignora campos de 18 a sério", () => {
    const data = {
      DATA: [
        curso("Miramar", [volta("x", 2, "VERMELHAS"), volta("y", 1, "VERMELHAS")]),
        curso("Vilamoura", [volta("z", 3, "AMARELAS")]),
      ],
      HOLES: {
        x: comMetros([...P, ...P], [5, 3, 4, 5, 3, 6, 4, 5, 5, 4, 4, 4, 4, 4, 5, 5, 4, 6], [...M, ...M]),
        y: comMetros(P, [4, 4, 5, 4, 2, 5, 5, 4, 5], M),
        z: comMetros([...P, ...MACHICO], [...P, ...MACHICO], [...M, ...M.map(v => v + 10)]),
      },
    };
    const gr = eclecticos9(data);
    expect(gr.map(g => g.grupo)).toEqual(["Miramar"]);
    const t = gr[0].linhas[0].tees[0];
    expect(t.rounds).toHaveLength(3);
    expect(t.best).toEqual([4, 3, 4, 4, 2, 5, 4, 4, 5]);
    expect(t.total).toBe(35);
  });
});
