import { describe, it, expect } from "vitest";
import { analyzeRounds, type ARound } from "../roundAnalysis";

const par = [4, 4, 5, 3, 4, 4, 5, 3, 4, 5, 4, 4, 4, 3, 4, 4, 3, 5];
const R1: ARound = { round: 1, par, scores: [5, 4, 9, 3, 6, 4, 5, 4, 5, 6, 5, 5, 5, 3, 4, 4, 3, 5] }; // 45 + 40 = 85
const R2: ARound = { round: 2, par, scores: [4, 3, 5, 3, 5, 4, 5, 3, 4, 7, 5, 6, 5, 4, 4, 4, 3, 7] }; // 36 + 45 = 81

describe("analyzeRounds", () => {
  const an = analyzeRounds([R2, R1])!;
  const texts = an.rounds[0].insights.map((x) => x.text);

  it("compara as voltas pela ordem, com o total", () => {
    expect(an.rounds[0].round).toBe(2);
    expect(texts[0]).toBe("81 (+9) contra 85 na R1: 4 pancadas melhor.");
  });

  it("front e back nine", () => {
    expect(texts).toContain("Melhorou 9 pancadas nos front nine (45 → 36) e piorou 5 pancadas nos back nine (40 → 45).");
  });

  it("mais birdies, mas também mais duplos", () => {
    expect(texts).toContain("Mais birdies (0 → 1), mas também mais duplos-bogeys ou pior (2 → 3).");
  });

  it("buracos que mudaram muito", () => {
    expect(texts.some((t) => t.startsWith("Grande melhoria no buraco 3 (9 → 5)"))).toBe(true);
    expect(texts.some((t) => t.startsWith("Perdeu muito no buraco 18 (5 → 7)"))).toBe(true);
  });

  it("posição com o campo", () => {
    const other: ARound[] = [{ round: 1, par, scores: par.map((p) => p + 1) }, { round: 2, par, scores: par.map((p) => p + 1) }]; // 90 + 90
    const best: ARound[] = [{ round: 1, par, scores: par }, { round: 2, par, scores: par }];
    const a = analyzeRounds([R1, R2], [[R1, R2], other, best])!;
    expect(a.rounds[0].insights.some((x) => x.text === "Manteve o 2º lugar.")).toBe(true);
  });

  it("uma volta só não dá análise", () => {
    expect(analyzeRounds([R1])).toBeNull();
  });
});
