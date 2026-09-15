import { describe, it, expect } from "vitest";
import { computeSD } from "../fpgUtils";

/**
 * computeSD — o SD de uma volta de torneio é o oficial da FPG (o `sgd` do WHS,
 * gravado na volta pelo scripts/backfill-sd.js) e, sem ele, o calculado pela
 * fórmula WHS com o HCP da inscrição (decisão 2026-09-15).
 */
describe("computeSD — só o SD oficial", () => {
  it("volta com SD oficial (formato flat)", () => {
    expect(computeSD({ grossTotal: 72, sd: 6.4 })).toEqual({ sd: 6.4, source: "fpg" });
  });

  it("volta com SD oficial na única ronda (roundScores)", () => {
    expect(computeSD({ grossTotal: 72, roundScores: [{ sd: 6.4 }] })).toEqual({ sd: 6.4, source: "fpg" });
  });

  it("SD negativo não se achata a 0", () => {
    expect(computeSD({ grossTotal: 66, sd: -1.2 }).sd).toBe(-1.2);
  });

  it("o oficial ganha ao calculado", () => {
    expect(computeSD({ grossTotal: 72, courseRating: 65.1, slope: 123, sd: 7.3 }).sd).toBe(7.3);
  });

  it("sem SD oficial nem CR/Slope não há SD", () => {
    expect(computeSD({ grossTotal: 72, roundScores: [{}] })).toEqual({ sd: null, source: null });
    expect(computeSD({ grossTotal: 72 })).toEqual({ sd: null, source: null });
  });
});

/**
 * Sem SD oficial, calcula-se com o HCP da inscrição — caso real: Amendoeira
 * World Kids 2026 Sub 12 (Faldo, vermelhos: CR 65.1, Slope 123, PCC −1).
 */
describe("computeSD — calculado quando não há oficial", () => {
  const par18 = Array(18).fill(4);
  const scores18 = Array(18).fill(4);
  const si18 = Array.from({ length: 18 }, (_, i) => i + 1);

  it("sem HCP: (113/123)×(72−65.1) = 6.3", () => {
    expect(computeSD({ grossTotal: 72, scores: scores18, par: par18, nholes: 18, courseRating: 65.1, slope: 123 }))
      .toEqual({ sd: 6.3, source: "raw" });
  });

  it("com HCP da inscrição e PCC −1 (AGS): 7.3", () => {
    expect(computeSD({ grossTotal: 72, scores: scores18, par: par18, si: si18, nholes: 18,
      courseRating: 65.1, slope: 123, hcpExact: 10.7, pcc: -1 })).toEqual({ sd: 7.3, source: "ags" });
  });

  it("volta a decorrer (gross = soma dos jogados) não tem SD", () => {
    const scores = [9, 9, 10, 9, 9, ...Array(13).fill(0)];
    expect(computeSD({ grossTotal: 46, scores, par: par18, nholes: 18, courseRating: 70.2, slope: 128 }).sd).toBeNull();
  });

  it("Manuel no 8º CGSS OM NOS 2026 (72 · CR 65.9 · Slope 126 · PCC −1) → 6.4", () => {
    const scores = [5, 4, 4, 5, 3, 3, 4, 3, 5, 5, 3, 5, 3, 5, 4, 5, 2, 4];
    const pars = [5, 4, 4, 4, 3, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 5, 3, 4];
    const si = [2, 4, 14, 12, 8, 6, 16, 10, 18, 15, 13, 5, 11, 1, 7, 3, 17, 9];
    expect(computeSD({ grossTotal: 72, scores, par: pars, si, nholes: 18, hcpExact: 7.9,
      courseRating: 65.9, slope: 126, pcc: -1 }).sd).toBe(6.4);
  });

  it("acumulado de várias rondas não tem SD", () => {
    expect(computeSD({ grossTotal: 146, roundScores: [{ sd: 6.4 }, { sd: 7.1 }] }).sd).toBeNull();
  });

  it("cartão por entregar (998 ND/NR, 999 NS/WD) não tem SD", () => {
    expect(computeSD({ grossTotal: 998, sd: 5 }).sd).toBeNull();
    expect(computeSD({ grossTotal: 999, roundScores: [{ sd: 5 }] }).sd).toBeNull();
  });
});
