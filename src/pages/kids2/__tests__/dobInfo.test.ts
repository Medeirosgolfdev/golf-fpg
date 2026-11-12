/**
 * kids2/__tests__/dobInfo.test.ts — escalões "Sub-X" são tectos de idade, não
 * a idade do jogador (caso Joshua Hockenhull, 13/10/2026).
 */
import { describe, it, expect } from "vitest";
import { computeDobInfo } from "../dobInfo";
import type { Junior, Tournament } from "../data";

function mk(flights: { date: string; ageMin: number | null; ageMax: number | null; sourceId?: string; label?: string }[]) {
  const junior = { id: "j1", dob: null, dobRange: null, tournamentIds: flights.map((_, i) => `t${i}`), sources: {} } as unknown as Junior;
  const byId = new Map<string, Tournament>(flights.map((f, i) => [`t${i}`, {
    id: `t${i}`, date: f.date, sourceId: f.sourceId ?? "egr",
    flights: [{ label: f.label ?? "", ageMin: f.ageMin, ageMax: f.ageMax, results: [{ juniorId: "j1" }] }],
  } as unknown as Tournament]));
  return computeDobInfo(junior, byId);
}

describe("computeDobInfo", () => {
  it("só tectos (Sub-14, Sub-18) → 'ou depois', sem idade inventada", () => {
    const info = mk([
      { date: "2024-08-06", ageMin: null, ageMax: 14 },
      { date: "2026-08-20", ageMin: null, ageMax: 18 },
    ]);
    expect(info.state).toBe("inferred");
    expect(info.dobIso).toBeNull();
    expect(info.age).toBeNull();
    expect(info.dobLabel).toMatch(/2009 ou depois$/);
  });

  it("uma só prova «Boys U14» (Scottish, 10/08/2026) → menos de 14 nesse dia, nunca «≤15 anos»", () => {
    // Brodie Landsburgh, 12/11/2026 (ela: «numa prova UNDER 14 não pode dizer que ele pode ter 15»).
    const info = mk([{ date: "2026-08-10", ageMin: null, ageMax: 14, label: "Boys U14" }]);
    expect(info.rangeMin).toBe("2012-08-11");
    expect(info.dobLabel).toBe("Ago 2012 ou depois");
  });

  it("«7 & Under» inclui o 7", () => {
    const info = mk([{ date: "2026-08-10", ageMin: null, ageMax: 7, label: "Boys 7 & Under" }]);
    expect(info.rangeMin).toBe("2018-08-11");
  });

  it("escalão de idade exacta (Boys 11) continua a dar um intervalo com ponto médio", () => {
    const info = mk([{ date: "2025-06-01", ageMin: 11, ageMax: null }]);
    expect(info.state).toBe("inferred");
    expect(info.dobIso).not.toBeNull();
    expect(info.age).not.toBeNull();
  });
});
