import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { resolve } = require("./identity-matcher.js");

// Dois registos com o mesmo nome, sem chave forte nem data, de países diferentes
// (o passo 5 não os junta): antes saíam com o MESMO id (191 casos, 23/10/2026).
const src = (sourceId, country, tourn) => ({
  sourceId,
  players: [{ sourceKey: `${sourceId}-k`, name: "Alex Teste", country }],
  tournaments: [{
    sourceKey: tourn.key, name: tourn.key, date: tourn.date,
    flights: [{ flightKey: tourn.flight ?? "b12", label: "Boys 12", ageMin: 11, ageMax: 12,
      results: [{ playerSourceKey: `${sourceId}-k`, playerName: "Alex Teste", pos: 1, totalGross: 72 }] }],
  }],
});

describe("identity-matcher — colisões de id (mesmo nome, sem chave forte)", () => {
  it("junta quando nunca jogaram um contra o outro e as idades batem", () => {
    const { juniors } = resolve([src("wjgc", "US", { key: "w1", date: "2025-07-01" }), src("doral", "PH", { key: "d1", date: "2025-12-01" })], {});
    expect(juniors).toHaveLength(1);
    expect(juniors[0].tournamentIds.sort()).toEqual(["doral-d1", "wjgc-w1"]);
    expect(juniors[0].countries.sort()).toEqual(["PH", "US"]);
  });
  it("homónimos (idades incompatíveis) ficam separados, cada um com o seu id e os seus torneios", () => {
    const { juniors } = resolve([src("wjgc", "US", { key: "w1", date: "2025-07-01" }), src("doral", "ZA", { key: "d1", date: "2030-12-01" })], {});
    expect(juniors).toHaveLength(2);
    expect(new Set(juniors.map((j) => j.id)).size).toBe(2);
    expect(juniors.map((j) => j.tournamentIds.length)).toEqual([1, 1]);
  });
});
