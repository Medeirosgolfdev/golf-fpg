import { describe, it, expect } from "vitest";
import { fmtSign, fmtSignTipo, fmtToPar } from "../format";

/** Os três formatadores de sinal — cada sítio escrevia o seu «+» à mão (11/11/2026). */
describe("sinal dos números", () => {
  it("fmtSign: «+» nos positivos, zero sem sinal", () => {
    expect(fmtSign(5)).toBe("+5");
    expect(fmtSign(0)).toBe("0");
    expect(fmtSign(-3)).toBe("-3");
    expect(fmtSign(1.5, 1)).toBe("+1.5");
    expect(fmtSign(-0.25, 1)).toBe("-0.3");
  });
  it("fmtSignTipo: menos tipográfico, zero sem sinal", () => {
    expect(fmtSignTipo(2)).toBe("+2");
    expect(fmtSignTipo(-2)).toBe("−2");
    expect(fmtSignTipo(0)).toBe("0");
    expect(fmtSignTipo(-1.23, 1)).toBe("−1.2");
    expect(fmtSignTipo(1.25, 2)).toBe("+1.25");
  });
  it("fmtToPar: zero é «E», vazio é «—»", () => {
    expect(fmtToPar(0)).toBe("E");
    expect(fmtToPar(3)).toBe("+3");
    expect(fmtToPar(-2)).toBe("-2");
    expect(fmtToPar(null)).toBe("—");
    expect(fmtToPar(undefined, "")).toBe("");
  });
});
