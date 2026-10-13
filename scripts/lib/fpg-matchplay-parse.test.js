import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { parseMatchplayHtml, parseMatchInfo } = require("./fpg-matchplay-parse.js");
const fx = (f) => fs.readFileSync(path.join(__dirname, "..", "__fixtures__", f));

describe("parseMatchplayHtml — quadro da FPG", () => {
  it("8 jogadoras (UTF-8): rondas, vencedores, cabeças de série e campeã", () => {
    const mp = parseMatchplayHtml(fx("matchplay-000-00023.html"));
    const rounds = mp.flights[0].rounds;
    expect(mp.tournament).toBe("40 Taça da Federação Portuguesa de Golfe BPI Senhoras");
    expect(rounds.map((r) => [r.name, r.date, r.matches.length])).toEqual([
      ["Quartos-Final", "2026-10-12", 4], ["Meias-Finais", "2026-10-12", 2], ["Final", "2026-10-13", 1],
    ]);
    const m1 = rounds[0].matches[0];
    expect(m1).toMatchObject({ matchNo: 1, startTime: "08:20 · Tee 1", result: "2 & 1", winner: "home" });
    expect(m1.home).toMatchObject({ name: "Laura Santos", seed: 1 });
    expect(m1.away).toMatchObject({ name: "Maria Francisca Santos", seed: 8 });
    expect(rounds[2].matches[0]).toMatchObject({ result: "5 & 3", winner: "home" });
    expect(mp.champion).toBe("Laura Santos");
    expect(mp.flights[0].isCompleted).toBe(true);
  });

  it("16 jogadores (CP1252): acentos, vitória do lado de baixo e final a decorrer", () => {
    const mp = parseMatchplayHtml(fx("matchplay-000-00022.html"));
    const rounds = mp.flights[0].rounds;
    expect(rounds[0].matches[0].home.name).toBe("Luis António Silva");
    // Match 4: o 12 ganhou ao 5 no 21.º buraco
    expect(rounds[0].matches[3]).toMatchObject({
      matchNo: 4, result: "21 buracos", winner: "away",
      away: { name: "Rodrigo Faria Constantino", seed: 12 },
    });
    const final = rounds[3].matches[0];
    expect(final).toMatchObject({ matchNo: 15, result: "2 (5)", winner: null, isSettled: false, isStarted: true });
    expect(mp.champion).toBeNull();
  });

  it("parseMatchInfo", () => {
    expect(parseMatchInfo("Match 7 Tee 10 10-13  11:00")).toEqual({ matchNo: 7, tee: "10", mmdd: "10-13", hour: "11:00" });
    expect(parseMatchInfo("")).toBeNull();
  });

  it("página sem quadro → null", () => {
    expect(parseMatchplayHtml("<html><body>Key not defined</body></html>")).toBeNull();
  });
});
