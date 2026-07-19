/**
 * Desempate por countback — fixtures são jogadores REAIS de torneios onde
 * sabemos a ordem oficial (RankingsClassifLST).
 */
import { describe, it, expect } from "vitest";
import { compareForRanking, assignPositions, compareCountback } from "./drive-countback.cjs";

/* 5º Drive Challenge Norte-Vale Pisão Sub 12 (2026-05-23), 2×9 buracos.
   Empatados a 81; o oficial dá o 2º ao Tomás (165 pts) e o 3º ao James (94). */
const tomas = {
  name: "Tomás Sarmento de Beires", grossTotal: 81,
  roundScores: [
    { round: 1, gross: 40, scores: [5, 4, 4, 3, 6, 4, 4, 6, 4] },
    { round: 2, gross: 41, scores: [7, 4, 5, 3, 5, 4, 3, 5, 5] },
  ],
};
const james = {
  name: "James Orrison", grossTotal: 81,
  roundScores: [
    { round: 1, gross: 40, scores: [7, 4, 4, 3, 5, 4, 3, 5, 5] },
    { round: 2, gross: 41, scores: [5, 4, 3, 3, 7, 5, 3, 5, 6] },
  ],
};

describe("compareForRanking", () => {
  it("desempata a favor de quem tem melhores últimos 6 buracos (caso oficial)", () => {
    // últimos 6 da última volta: Tomás 25, James 29 → Tomás à frente
    expect(compareForRanking(tomas, james)).toBeLessThan(0);
    expect([james, tomas].sort(compareForRanking)[0].name).toBe(tomas.name);
  });

  it("o gross total manda sobre o countback", () => {
    const pior = { ...tomas, name: "Pior", grossTotal: 90 };
    expect(compareForRanking(pior, james)).toBeGreaterThan(0);
  });

  it("quem não tem scorecard fica atrás de quem tem", () => {
    const semCartao = { name: "Sem cartão", grossTotal: 81, roundScores: [] };
    expect(compareForRanking(semCartao, james)).toBeGreaterThan(0);
  });
});

describe("assignPositions", () => {
  it("dá posições distintas quando o countback separa", () => {
    const sorted = [tomas, james].sort(compareForRanking);
    assignPositions(sorted);
    expect(sorted.map(p => [p.name, p.pos])).toEqual([
      [tomas.name, 1],
      [james.name, 2],
    ]);
  });

  it("PARTILHA a posição quando o countback não separa", () => {
    const a = { name: "A", grossTotal: 70, roundScores: [{ round: 1, gross: 35, scores: [4, 4, 4, 4, 4, 4, 4, 4, 3] }] };
    const b = { name: "B", grossTotal: 70, roundScores: [{ round: 1, gross: 35, scores: [4, 4, 4, 4, 4, 4, 4, 4, 3] }] };
    const c = { name: "C", grossTotal: 75, roundScores: [{ round: 1, gross: 38, scores: [5, 4, 4, 4, 4, 4, 4, 4, 5] }] };
    expect(compareCountback(a, b)).toBe(0);
    const sorted = [a, b, c].sort(compareForRanking);
    assignPositions(sorted);
    // A e B partilham o 1º; o seguinte é 3º (ocuparam 1 e 2)
    expect(sorted.map(p => p.pos)).toEqual([1, 1, 3]);
  });
});
