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

describe("computeDobInfo — o ano da federação ganha aos tectos dos escalões", () => {
  // Erik Nasirov (12/11/2026): Federgolf diz 2014; jogou um troféu «U16». A ficha
  // dizia «Abr 2009 ou depois · ≤17 anos» e as tabelas «2014 · ~12a».
  it("birthYear 2014 + uma prova U16 → «2014», nunca «2009 ou depois»", () => {
    const junior = { id: "j1", dob: null, birthYear: 2014, dobRange: null, tournamentIds: ["t0"], sources: {} } as unknown as Junior;
    const byId = new Map<string, Tournament>([["t0", {
      id: "t0", date: "2026-04-25", sourceId: "fig",
      flights: [{ label: "U16", ageMin: null, ageMax: 16, results: [{ juniorId: "j1" }] }],
    } as unknown as Tournament]]);
    const info = computeDobInfo(junior, byId);
    expect(info.state).toBe("range");
    expect(info.dobLabel).toBe("2014");
    expect(info.rangeMin).toBe("2014-01-01");
    expect(info.rangeMax).toBe("2014-12-31");
    expect(info.ageLabel).toBe(`~${new Date().getFullYear() - 2014} anos`);
    expect(info.nota).toMatch(/federação/);
  });

  it("a data lida continua a ganhar ao ano", () => {
    const junior = { id: "j1", dob: "2014-04-29", birthYear: 2014, tournamentIds: [], sources: {} } as unknown as Junior;
    expect(computeDobInfo(junior, new Map()).state).toBe("known");
  });
});

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
