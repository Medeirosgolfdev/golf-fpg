import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { resultadoDoJogador } = require("./fpg.js");

const volta = (round, gross) => ({ round, gross, scores: [] });

// 10/11/2026 (F1): o canónico tinha 64 resultados FPG com total 999/1087/1997,
// ±par e às vezes lugar, com status OK (Tomás Araújo, CN Jovens Sub 12: 1087, «+941»).
describe("resultadoDoJogador — «sem cartão» (gross ≥ 900) não é resultado", () => {
  it("resultado normal passa como estava", () => {
    const r = resultadoDoJogador({ pos: 3, grossTotal: 160, toPar: 16, roundScores: [volta(1, 82), volta(2, 78)] });
    expect(r).toMatchObject({ pos: 3, status: "OK", totalGross: 160, toPar: 16 });
    expect(r.rounds.map((x) => x.gross)).toEqual([82, 78]);
  });

  it("volta 998 somada no total (89 + 998 = 1087): sem total, ±par nem lugar; status WD", () => {
    const r = resultadoDoJogador({ pos: 41, grossTotal: 1087, toPar: 941, roundScores: [volta(1, 89), volta(2, 998)] });
    expect(r).toMatchObject({ pos: null, status: "WD", totalGross: null, toPar: null });
    // A volta jogada fica; a outra continua na lista (R2), sem gross.
    expect(r.rounds.map((x) => [x.round, x.gross])).toEqual([[1, 89], [2, null]]);
  });

  it("total 999 e 1997 (998 + 999) também; 997 conta como sem cartão", () => {
    expect(resultadoDoJogador({ pos: 12, grossTotal: 999, toPar: 927, roundScores: [volta(1, 999)] }))
      .toMatchObject({ pos: null, status: "WD", totalGross: null, toPar: null });
    expect(resultadoDoJogador({ pos: null, grossTotal: 1997, toPar: 1853, roundScores: [volta(1, 998), volta(2, 999)] }))
      .toMatchObject({ pos: null, status: "WD", totalGross: null, toPar: null });
    expect(resultadoDoJogador({ pos: 5, grossTotal: 1080, toPar: 936, roundScores: [volta(1, 83), volta(2, 997)] }).status).toBe("WD");
  });

  it("formato antigo (cartão no topo) com 999", () => {
    const r = resultadoDoJogador({ pos: 9, grossTotal: 999, toPar: 927, scores: [0, 0, 0] });
    expect(r).toMatchObject({ pos: null, status: "WD", totalGross: null, toPar: null });
    expect(r.rounds).toEqual([{ round: 1, gross: null, strokes: [0, 0, 0] }]);
  });

  it("o status em texto da fonte mantém-se (DQ, DNS)", () => {
    expect(resultadoDoJogador({ pos: null, grossTotal: "DQ", roundScores: [volta(1, 80)] }).status).toBe("DQ");
    expect(resultadoDoJogador({ pos: null, grossTotal: "DNS" })).toMatchObject({ status: "DNS", totalGross: null, rounds: [] });
  });
});
