/**
 * scripts/aggregator/util/golfbox-federacao.js — escalões das federações no
 * GolfBox (Suíça, Bélgica) e a prova belga real do Junior Open 2026.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseDivGolfbox } = require("./golfbox-federacao.js");

describe("parseDivGolfbox", () => {
  it("lê sexo e idade máxima", () => {
    expect(parseDivGolfbox("Boys U14")).toEqual({ ageMin: null, ageMax: 14, sex: "M" });
    expect(parseDivGolfbox("Girls U18-U16")).toEqual({ ageMin: null, ageMax: 18, sex: "F" });
  });
  it("«Boys» sem idade (overall) fica em aberto, para perder para o escalão", () => {
    expect(parseDivGolfbox("Boys")).toEqual({ ageMin: null, ageMax: null, sex: "M" });
  });
});

describe("rbgf — Junior Open Vlaanderen–Wallonie 2026", () => {
  const out = require("../sources/rbgf.js").load({});
  const t = (out.tournaments || out).find((x) => x.sourceKey === "5387007");

  it("cada miúdo fica no seu escalão (U18/U16) e o overall sai", () => {
    expect(t).toBeTruthy();
    expect(t.flights.map((f) => f.label).sort()).toEqual(["Boys U16", "Boys U18", "Girls U16"]);
    const nomes = t.flights.flatMap((f) => f.results.map((r) => r.playerName));
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("54 buracos = 3 voltas de 18", () => {
    const r = t.flights[0].results[0];
    expect(r.rounds).toHaveLength(3);
  });
});
