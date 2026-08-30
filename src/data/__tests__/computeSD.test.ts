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

describe("computeSD — volta incompleta (a decorrer)", () => {
  it("5 buracos jogados, gross = soma dos jogados → sd null (caso Eikner, EJO 2026 R1)", () => {
    const scores = [9, 9, 10, 9, 9, ...Array(13).fill(0)]; // 5 buracos, soma 46
    const { sd, source } = computeSD(basePlayer({
      scores, par: par18, nholes: 18, grossTotal: 46, toPar: null as any,
      courseRating: 70.2, slope: 128,
    }));
    expect(sd).toBeNull();
    expect(source).toBeNull();
  });

  it("array curto (5 entradas) com gross = soma → sd null", () => {
    const { sd } = computeSD(basePlayer({
      scores: [9, 9, 10, 9, 9], par: par18, nholes: 18, grossTotal: 46,
      courseRating: 70.2, slope: 128,
    }));
    expect(sd).toBeNull();
  });

  it("cartão truncado na fonte (gross > soma dos visíveis) mantém o SD", () => {
    // 17 buracos visíveis somam 68, gross oficial 72 → fillBlankHoles infere o
    // buraco em falta e a volta conta como completa.
    const scores = [...Array(17).fill(4), 0];
    const { sd } = computeSD(basePlayer({
      scores, par: par18, nholes: 18, grossTotal: 72,
      courseRating: 65.1, slope: 123,
    }));
    expect(sd).toBe(6.3);
  });

  it("sem cartão hole-by-hole (só gross) mantém o SD raw", () => {
    const { sd, source } = computeSD(basePlayer({
      scores: [], par: par18, nholes: 18, grossTotal: 72,
      courseRating: 65.1, slope: 123,
    }));
    expect(source).toBe("raw");
    expect(sd).toBe(6.3);
  });
});

/**
 * Sentinelas de "sem cartão" — caso real: 8º Torneio CGSS OM NOS 2026
 * (Santo da Serra, 29-08-2026). Nove jogadores marcados ND (não devolveu)
 * vinham com grossTotal null e cartão todo a zeros; o numGross() converte
 * isso em 999 e o Net Double Bogey "reparava" o cartão, dando SD ≈ −58.8.
 * Como −58.8 ≤ HCP, o badge saía VERDE e as desistências apareciam como as
 * melhores voltas do torneio.
 */
describe("computeSD — sentinelas de sem cartão", () => {
  it("grossTotal null (ND) com cartão a zeros → sd null", () => {
    const { sd, source } = computeSD(basePlayer({
      scores: Array(18).fill(0), par: par18, si: si18, nholes: 18,
      grossTotal: null as any, toPar: null as any, hcpExact: 25.8,
      courseRating: 65.9, slope: 126,
    }));
    expect(sd).toBeNull();
    expect(source).toBeNull();
  });

  it("gross 998 (ND/NR) → sd null", () => {
    const { sd } = computeSD(basePlayer({
      scores: Array(18).fill(0), par: par18, si: si18, nholes: 18,
      grossTotal: 998, hcpExact: 14.8, courseRating: 65.9, slope: 126,
    }));
    expect(sd).toBeNull();
  });

  it("gross 999 (NS/WD) sem cartão → sd null", () => {
    const { sd } = computeSD(basePlayer({
      scores: [], par: par18, nholes: 18, grossTotal: 999,
      courseRating: 65.9, slope: 126,
    }));
    expect(sd).toBeNull();
  });

  it("volta a sério do mesmo torneio continua a dar SD (Manuel, 72 · CR 65.9 · Slope 126 · PCC −1)", () => {
    const scores = [5, 4, 4, 5, 3, 3, 4, 3, 5, 5, 3, 5, 3, 5, 4, 5, 2, 4];
    const pars = [5, 4, 4, 4, 3, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 5, 3, 4];
    const si = [2, 4, 14, 12, 8, 6, 16, 10, 18, 15, 13, 5, 11, 1, 7, 3, 17, 9];
    const { sd, source } = computeSD(basePlayer({
      scores, par: pars, si, nholes: 18, grossTotal: 72, hcpExact: 7.9,
      courseRating: 65.9, slope: 126, pcc: -1,
    }));
    expect(source).toBe("ags");
    expect(sd).toBe(6.4);
  });
});
