/**
 * scripts/aggregator/sources/swissgolf.js — escalões da Swiss Golf (GolfBox):
 * «Boys U14», «Girls U18», «Boys U18-U16» → sexo e idade MÁXIMA.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

describe("swissgolf — escalões", () => {
  // o adapter expõe só load(); o parseDiv lê-se pelos voos de uma prova real
  const src = require("./swissgolf.js");
  const out = src.load({});
  const t = (out.tournaments || out).find((x) => x.sourceKey === "5359031");

  it("o Nacional U12/U14 de 2026 (Erlen) tem rapazes e raparigas U12 e U14", () => {
    expect(t).toBeTruthy();
    const voos = Object.fromEntries(t.flights.map((f) => [f.label, `${f.sex}${f.ageMax}`]));
    expect(voos).toMatchObject({ "Girls U14": "F14", "Girls U12": "F12", "Boys U14": "M14", "Boys U12": "M12" });
  });

  it("cada miúda fica uma só vez na prova (as U12 saem do U14)", () => {
    const nomes = t.flights.flatMap((f) => f.results.map((r) => r.playerName));
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});
