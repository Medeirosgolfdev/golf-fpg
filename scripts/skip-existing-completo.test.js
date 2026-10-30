/**
 * --skip-existing do NextCaddy e do LGS: um torneio lido ANTES de acabar não
 * pode ficar congelado (30/10/2026 — 867 torneios NextCaddy de 2026, 75 da
 * RFGA, e o Spanish International U-18 Mens no LGS com só R1 e R2).
 */
import { describe, it, expect, afterAll } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { existingIsComplete, fimDoScope } = require("./scrape-nextcaddy.js");
const { lgsCompleto } = require("./scrape-livegolfscoring.js");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skip-existing-"));
let n = 0;
const ficheiro = (obj) => { const f = path.join(dir, `${n++}.json`); fs.writeFileSync(f, JSON.stringify(obj)); return f; };
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("NextCaddy — existingIsComplete", () => {
  const comJogadores = { leaderboard: [{ players: [{ name: "X" }] }], meta: {} };
  it("fim do torneio pela data do scope e pelo nº de voltas", () => {
    expect(fimDoScope("31 jul 2026", 3)).toBe("2026-08-02");
    expect(fimDoScope("13 jun 2026", null)).toBe("2026-06-13");
    expect(fimDoScope(null, 3)).toBeNull();
  });
  it("lido depois do fim → completo (salta)", () => {
    expect(existingIsComplete(ficheiro({ ...comJogadores, scrapedAt: "2026-08-03T10:00:00Z" }), "2026-08-02")).toBe(true);
  });
  it("lido antes ou no último dia → relê, mesmo com jogadores ou só-PDF", () => {
    expect(existingIsComplete(ficheiro({ ...comJogadores, scrapedAt: "2026-08-02T20:00:00Z" }), "2026-08-02")).toBe(false);
    expect(existingIsComplete(ficheiro({ leaderboard: [], leaderboardPdfOnly: true, meta: {}, scrapedAt: "2026-06-24T14:58:10Z" }), "2026-08-02")).toBe(false);
  });
  it("sem jogadores nem PDF → relê sempre; sem data → regra antiga", () => {
    expect(existingIsComplete(ficheiro({ leaderboard: [], meta: {}, scrapedAt: "2026-09-01T00:00:00Z" }), "2026-08-02")).toBe(false);
    expect(existingIsComplete(ficheiro({ ...comJogadores, scrapedAt: "2026-06-01T00:00:00Z" }), undefined)).toBe(true);
  });
});

describe("LGS — lgsCompleto", () => {
  const base = { meta: { year: 2026, dateRange: "02 septiembre - 05 septiembre" }, rounds: [{ players: [{ total: 70 }] }] };
  it("lido a meio (03/09, acaba a 05/09) → relê; lido depois → salta", () => {
    expect(lgsCompleto(ficheiro({ ...base, scrapedAt: "2026-09-03T18:00:00Z" }))).toBe(false);
    expect(lgsCompleto(ficheiro({ ...base, scrapedAt: "2026-09-06T02:00:00Z" }))).toBe(true);
  });
  it("torneio a cavalo do ano: o fim é no ano seguinte", () => {
    const f = ficheiro({ meta: { year: 2025, dateRange: "29 diciembre - 02 enero" }, rounds: [], scrapedAt: "2025-12-31T00:00:00Z" });
    expect(lgsCompleto(f)).toBe(false);
  });
  it("sem ano: completo só sem voltas vazias nem jogadores parciais", () => {
    const semAno = { meta: { dateRange: "02 septiembre - 05 septiembre" }, scrapedAt: "2026-09-03T00:00:00Z" };
    expect(lgsCompleto(ficheiro({ ...semAno, rounds: [{ players: [{ total: 70 }] }] }))).toBe(true);
    expect(lgsCompleto(ficheiro({ ...semAno, rounds: [{ players: [{ total: 70 }] }, { players: [] }] }))).toBe(false);
    expect(lgsCompleto(ficheiro({ ...semAno, rounds: [{ players: [{ total: null, _partial: true }] }] }))).toBe(false);
  });
});
