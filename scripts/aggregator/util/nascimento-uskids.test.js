import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { anosPelosEscaloesUskids } = require("./nascimento-uskids.js");

/** Prova USKids sintética: o junior `jid` joga no escalão de idade `idade`. */
const prova = (id, date, idade, jid = "j1", sourceId = "uskids") => ({
  id, sourceId, date,
  flights: [{ ageMin: idade, ageMax: idade, results: [{ juniorId: jid }] }],
});
const mapa = (...ts) => new Map(ts.map((t) => [t.id, t]));

describe("anosPelosEscaloesUskids", () => {
  it("uma prova dá dois anos (Boys 12 em 2026 → 2013 ou 2014)", () => {
    const t = mapa(prova("a", "2026-08-13", 12));
    expect(anosPelosEscaloesUskids({ id: "j1", tournamentIds: ["a"] }, t)).toEqual([2013, 2014]);
  });

  it("provas que discordam num ano deixam só o comum", () => {
    // Boys 11 em mar/2025 (2013–14) e Boys 12 em ago/2025 (2012–13) → 2013.
    const t = mapa(prova("a", "2025-03-01", 11), prova("b", "2025-08-01", 12));
    expect(anosPelosEscaloesUskids({ id: "j1", tournamentIds: ["a", "b"] }, t)).toEqual([2013, 2013]);
  });

  it("ignora escalões por intervalo, outras fontes e provas onde não jogou", () => {
    const t = mapa(
      { id: "r", sourceId: "uskids", date: "2026-05-01", flights: [{ ageMin: 13, ageMax: 14, results: [{ juniorId: "j1" }] }] },
      prova("x", "2026-05-01", 12, "j1", "rfeg"),
      prova("o", "2026-05-01", 12, "outro"),
    );
    expect(anosPelosEscaloesUskids({ id: "j1", tournamentIds: ["r", "x", "o"] }, t)).toBeNull();
  });

  it("sem nenhum ano comum (dados contraditórios) → null", () => {
    const t = mapa(prova("a", "2020-06-01", 8), prova("b", "2026-06-01", 8));
    expect(anosPelosEscaloesUskids({ id: "j1", tournamentIds: ["a", "b"] }, t)).toBeNull();
  });
});
