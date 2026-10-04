import { describe, expect, it } from "vitest";
import { playedParTotal } from "../fpgUtils";

const PARS = [4, 5, 4, 4, 4, 3, 5, 3, 4, 5, 4, 4, 4, 3, 4, 4, 3, 5]; // 72

describe("playedParTotal", () => {
  it("volta completa → par todo", () => {
    const scores = PARS.map((p) => p);
    expect(playedParTotal({ pars: PARS, scores, gross: 72 })).toBe(72);
  });

  it("volta terminada com buraco riscado (gross FPG > soma) → par todo", () => {
    // Márcio Gouveia, 50 Anos de Autonomia 2026 R2: buraco 10 (par 5) riscado, gross 84
    const scores = [5, 5, 5, 5, 7, 3, 6, 2, 4, 0, 5, 5, 4, 3, 6, 4, 3, 4];
    expect(playedParTotal({ pars: PARS, scores, gross: 84 })).toBe(72);
  });

  it("volta a decorrer (gross = soma dos jogados) → só o par dos jogados", () => {
    const scores = [4, 5, 4, 4, 4, 3, 5, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(playedParTotal({ pars: PARS, scores, gross: 36 })).toBe(36);
  });

  it("sem gross (comportamento antigo) → só o par dos jogados", () => {
    const scores = [4, 5, 4, 4, 4, 3, 5, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(playedParTotal({ pars: PARS, scores })).toBe(36);
  });
});
