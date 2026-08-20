import { describe, it, expect } from "vitest";
import { escalaoAgeCap, fitsEscalaoAgeCap } from "../fpgUtils";

/* ─────────────────────────────────────────────────────────────────────────
   Guarda do match por nome nos draws (2026-08-20)

   No Paul McGinley Junior Cup 2026 - U12 (962/10084) o "Luis Mateus" alemão
   vem da FPG sem federado ("-" na coluna Federado). O DrawTab caía no match
   por nome contra o players.json, encontrava UM homónimo — um adulto
   português, fed 34417 — e mostrava-o no draw do Sub-12 com escalão
   "Absoluto". O `pickBestFed` já tinha o contexto do torneio, mas devolvia o
   candidato sem o verificar quando era o único.
   ───────────────────────────────────────────────────────────────────────── */

describe("escalaoAgeCap", () => {
  it("escalão simples", () => {
    expect(escalaoAgeCap("Sub 12")).toBe(12);
    expect(escalaoAgeCap("Sub10")).toBe(10);
    expect(escalaoAgeCap("sub 18")).toBe(18);
  });

  it("combinado: fica com o MAIOR (um Sub 14-24 admite os de 24)", () => {
    expect(escalaoAgeCap("Sub 14-24")).toBe(24);
    expect(escalaoAgeCap("Sub 10+12")).toBe(12);
    expect(escalaoAgeCap("Sub 16/18")).toBe(18);
  });

  it("sem tecto conhecido → null (nunca 0)", () => {
    expect(escalaoAgeCap("Absoluto")).toBe(null);
    expect(escalaoAgeCap("Sénior")).toBe(null);
    expect(escalaoAgeCap("")).toBe(null);
    expect(escalaoAgeCap(null)).toBe(null);
    expect(escalaoAgeCap(undefined)).toBe(null);
  });
});

describe("fitsEscalaoAgeCap", () => {
  it("o caso real: o Luís Mateus adulto (fed 34417, n. 1979) não cabe no Sub-12 de 2026", () => {
    expect(fitsEscalaoAgeCap(1979, 12, 2026)).toBe(false);
  });

  it("o outro falso match do mesmo evento: James Matthews (n. 1992) fora do U18", () => {
    expect(fitsEscalaoAgeCap(1992, escalaoAgeCap("Sub 18"), 2026)).toBe(false);
  });

  it("os matches legítimos do mesmo draw mantêm-se", () => {
    expect(fitsEscalaoAgeCap(2015, 12, 2026)).toBe(true);   // Benji Botham, 11
    expect(fitsEscalaoAgeCap(2017, 12, 2026)).toBe(true);   // Harley Botham, 9
    expect(fitsEscalaoAgeCap(2009, 18, 2026)).toBe(true);   // Paul Devillers, 17
  });

  it("jogar ACIMA do escalão é permitido (Sub-10 num Sub-12)", () => {
    expect(fitsEscalaoAgeCap(2016, 12, 2026)).toBe(true);  // 10 anos
    expect(fitsEscalaoAgeCap(2014, 12, 2026)).toBe(true);  // 12 anos, no limite
  });

  it("um ano acima do tecto já não cabe", () => {
    expect(fitsEscalaoAgeCap(2013, 12, 2026)).toBe(false); // 13 anos
  });

  it("sem tecto, sem ano do torneio ou sem dob → deixa passar", () => {
    expect(fitsEscalaoAgeCap(1975, null, 2026)).toBe(true);
    expect(fitsEscalaoAgeCap(1975, 12, null)).toBe(true);
    expect(fitsEscalaoAgeCap(null, 12, 2026)).toBe(true);
    expect(fitsEscalaoAgeCap(undefined, 12, 2026)).toBe(true);
  });

  it("torneio combinado: o de 20 anos cabe no Sub 14-24", () => {
    const cap = escalaoAgeCap("Sub 14-24");
    expect(fitsEscalaoAgeCap(2006, cap, 2026)).toBe(true);
    expect(fitsEscalaoAgeCap(2000, cap, 2026)).toBe(false); // 26 anos
  });
});
