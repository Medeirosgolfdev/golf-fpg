import { describe, it, expect } from "vitest";
import { computeSD } from "../fpgUtils";
import type { Player } from "../fpgTypes";

/**
 * computeSD com PCC — caso real: Amendoeira World Kids Golfe 2026 Sub 12
 * (Faldo Course, tees vermelhos: CR 65.1, Slope 123, PCC oficial −1).
 * O SD oficial da FPG é (113/slope)×(AGS − CR − PCC); sem o PCC a tabela
 * divergia do oficial exactamente por (113/slope)×PCC (6.3 vs 7.3).
 */

const basePlayer = (over: Partial<Player>): Player => ({
  scoreId: "t1",
  name: "Teste",
  pos: 1,
  grossTotal: 72,
  toPar: 0,
  ...over,
} as Player);

const par18 = Array(18).fill(4);   // par 72
const scores18 = Array(18).fill(4); // gross 72
const si18 = Array.from({ length: 18 }, (_, i) => i + 1);

describe("computeSD — PCC", () => {
  it("ramo raw sem PCC: (113/123)×(72−65.1) = 6.3", () => {
    const { sd, source } = computeSD(basePlayer({
      scores: scores18, par: par18, nholes: 18,
      courseRating: 65.1, slope: 123,
    }));
    expect(source).toBe("raw");
    expect(sd).toBe(6.3);
  });

  it("ramo raw com PCC −1: (113/123)×(72−65.1+1) = 7.3 (caso Guo Ziyang)", () => {
    const { sd } = computeSD(basePlayer({
      scores: scores18, par: par18, nholes: 18,
      courseRating: 65.1, slope: 123, pcc: -1,
    }));
    expect(sd).toBe(7.3);
  });

  it("ramo AGS com PCC −1: sem capping, AGS=72 → 7.3", () => {
    const { sd, source } = computeSD(basePlayer({
      scores: scores18, par: par18, si: si18, nholes: 18,
      courseRating: 65.1, slope: 123, hcpExact: 10.7, pcc: -1,
    }));
    expect(source).toBe("ags");
    expect(sd).toBe(7.3);
  });

  it("PCC positivo baixa o SD: PCC +1 → (113/123)×(72−65.1−1) = 5.4", () => {
    const { sd } = computeSD(basePlayer({
      scores: scores18, par: par18, nholes: 18,
      courseRating: 65.1, slope: 123, pcc: 1,
    }));
    expect(sd).toBe(5.4);
  });
});
