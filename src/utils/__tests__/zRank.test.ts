import { describe, it, expect } from "vitest";
import { avgZPonderado } from "../zRank";

const stats = { a: [{ m: 80, s: 5 }, { m: 82, s: 4 }], b: [{ m: 75, s: 5 }] };

describe("avgZPonderado", () => {
  it("média dos z-scores de cada volta, com a média/desvio dessa volta", () => {
    // a: (75−80)/5 = −1 · (82−82)/4 = 0 ; b: (80−75)/5 = +1 → média 0
    expect(avgZPonderado({ a: { rd: [75, 82] }, b: { rd: [80] } }, stats)).toBeCloseTo(0);
  });

  it("o peso do torneio conta", () => {
    // a (peso 1): −1 e 0 ; b (peso 0.5): +1 → (−1 + 0 + 0.5) / 2.5 = −0.2
    expect(avgZPonderado({ a: { rd: [75, 82] }, b: { rd: [80] } }, stats, { a: 1, b: 0.5 })).toBeCloseTo(-0.2);
  });

  it("voltas sem cartão e torneios sem estatística não contam; sem nada devolve null", () => {
    expect(avgZPonderado({ a: { rd: [75, 999] } }, stats)).toBeCloseTo(-1);
    expect(avgZPonderado({ a: { rd: [0, 998] }, c: { rd: [70] } }, stats)).toBeNull();
    expect(avgZPonderado({}, stats)).toBeNull();
    expect(avgZPonderado({ b: { rd: [80] } }, { b: [{ m: 75, s: 0 }] })).toBeNull();
  });
});
