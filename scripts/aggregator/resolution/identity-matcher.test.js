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

// Santiago Dias (12/11/2026): o federado português (n. 2012) e um USKids
// brasileiro com o mesmo nome (Boys 6 & Under em 2024, n. 2018) acabavam numa
// só ficha através de uma ficha do Champion of Champions sem país nem data.
describe("identity-matcher — ficha sem país não junta pessoas de idades diferentes", () => {
  const prova = (key, date, psk) => ({
    sourceKey: key, name: key, date,
    flights: [{ flightKey: "b", label: "Boys", ageMin: null, ageMax: null,
      results: [{ playerSourceKey: psk, playerName: "Santiago Dias", pos: 1, totalGross: 72 }] }],
  });
  const fontes = [
    { sourceId: "uskids", players: [{ sourceKey: "610461", name: "Santiago Dias", country: "BR", dobRange: { lo: "2018-03-02", hi: "2018-07-31" } }],
      tournaments: [prova("u1", "2024-02-03", "610461")] },
    { sourceId: "fpg", players: [{ sourceKey: "42908", name: "Santiago Dias", country: "PT", dob: "2012-05-29", sex: "M" }],
      tournaments: [prova("f1", "2024-06-24", "42908")] },
    { sourceId: "coc", players: [
        { sourceKey: "coc-2023", name: "Santiago Dias", country: null, sex: "M" },
        { sourceKey: "coc-2024", name: "Santiago Dias", country: "PT", sex: "M" }],
      tournaments: [prova("c23", "2023-07-25", "coc-2023"), prova("c24", "2024-07-23", "coc-2024")] },
  ];
  it("ficam duas fichas, e a ficha sem país vai para a que já tem outra edição da prova", () => {
    const { juniors } = resolve(fontes, {});
    expect(juniors).toHaveLength(2);
    const pt = juniors.find((j) => j.sources.fpg);
    const br = juniors.find((j) => j.sources.uskids);
    expect(pt).not.toBe(br);
    expect(pt.tournamentIds.sort()).toEqual(["coc-c23", "coc-c24", "fpg-f1"]);
    expect(br.tournamentIds).toEqual(["uskids-u1"]);
  });
});
