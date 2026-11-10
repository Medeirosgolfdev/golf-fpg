import { describe, it, expect } from "vitest";
import { resultadosDoJunior, countWins, countTop3 } from "../juniorCalc";
import type { Junior, Tournament } from "../juniorCalc";

/** Só os campos que as contas lêem — o resto das fichas não interessa aqui. */
const junior = { id: "j1", tournamentIds: ["a", "b", "falta", "c"] } as unknown as Junior;
const flight = (flightKey: string, results: Array<{ juniorId: string; pos?: number }>) => ({ flightKey, label: flightKey, results });
const torneios = new Map<string, Tournament>([
  ["a", { id: "a", date: "2025-03-01", flights: [flight("a1", [{ juniorId: "j1", pos: 1 }, { juniorId: "x", pos: 2 }])] }],
  // dois flights no mesmo torneio (cross-trophy) e um em que não está
  ["b", { id: "b", date: "2026-05-10", flights: [flight("b1", [{ juniorId: "j1", pos: 3 }]), flight("b2", [{ juniorId: "x", pos: 1 }]), flight("b3", [{ juniorId: "j1", pos: 1 }])] }],
  ["c", { id: "c", startDate: "2026-09-01", flights: [flight("c1", [{ juniorId: "j1" }])] }],
] as unknown as Array<[string, Tournament]>);

describe("resultadosDoJunior", () => {
  it("dá um resultado por flight em que o júnior aparece, pela ordem dos torneios", () => {
    const lista = resultadosDoJunior(junior, torneios);
    expect(lista.map((x) => `${x.tid}:${x.f.flightKey}`)).toEqual(["a:a1", "b:b1", "b:b3", "c:c1"]);
    expect(lista.every((x) => x.r.juniorId === "j1")).toBe(true);
  });

  it("salta os torneios que não estão no mapa e respeita o filtro de torneios", () => {
    expect(resultadosDoJunior(junior, torneios, new Set(["b", "falta"])).map((x) => x.f.flightKey)).toEqual(["b1", "b3"]);
    expect(resultadosDoJunior(junior, torneios, new Set())).toEqual([]);
    expect(resultadosDoJunior(junior, torneios, null)).toHaveLength(4);
  });

  it("as contas de vitórias e pódios usam-na (com data e filtro)", () => {
    expect(countWins(junior, torneios)).toBe(2);
    expect(countTop3(junior, torneios)).toBe(3);
    expect(countWins(junior, torneios, "2026-01-01")).toBe(1);
    expect(countTop3(junior, torneios, undefined, new Set(["a"]))).toBe(1);
  });
});
