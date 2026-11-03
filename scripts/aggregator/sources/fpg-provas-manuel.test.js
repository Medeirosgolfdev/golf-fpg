import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { provasDeJovensDoManuel, fedDoJogador } = require("./fpg.js");

const manuel = { fedCode: "52884", name: "Manuel Goulartt Medeiros" };
const outro = { fedCode: "46480", name: "Afonso de Sousa Pinto" };
const prova = (tcode, name, extra = {}) => ({ ccode: "003", tcode, date: "2025-08-19", campo: "Miramar", name, players: [outro], ...extra });

describe("provasDeJovensDoManuel", () => {
  it("a prova do Manuel entra com os escalões irmãos do mesmo clube e dia", () => {
    const r = provasDeJovensDoManuel([
      prova("10564", "Miramar Internacional Open U25", { players: [manuel, outro] }),
      prova("10565", "Miramar Internacional Open - sub 10", { escalao: "Sub 10" }),
      prova("10565", "Miramar Internacional Open - sub 10", { escalao: "Sub 10", date: "2024-08-26" }),
    ]);
    expect(r.map((t) => `${t.tcode}@${t.date}`)).toEqual(["10564@2025-08-19", "10565@2025-08-19"]);
  });

  it("Madeira e Drive Challenge ficam fora («não quero os miúdos (fracos) da Madeira»)", () => {
    const r = provasDeJovensDoManuel([
      prova("10208", "2 ºTorn.Drive Challenge Madeira-Stº da Serra-Sub12", { ccode: "982", region: "madeira", campo: "Santo da Serra - Serras-Serras", escalao: "Sub 12", players: [manuel] }),
      prova("10198", "1º Torneio Drive Tour Madeira - Palheiro Golf", { ccode: "982", region: "madeira", campo: "Palheiro Golf", players: [manuel] }),
      prova("10572", "3º Torneio CGSS Junior by PKF", { ccode: "007", campo: null, players: [manuel] }),
      prova("10307", "Final Nacional do Drive Challenge", { ccode: "988", region: "sul", campo: "Jamor", players: [manuel] }),
    ]);
    expect(r).toEqual([]);
  });

  it("torneios de clube de adultos e escalões adultos ficam fora, mesmo com o Manuel", () => {
    const r = provasDeJovensDoManuel([
      prova("10551", "Taça R.S. Yeatman", { players: [manuel, outro] }),
      prova("10204", "3º Torneio Drive Tour Norte – Vale Pisão", { ccode: "987", escalao: "Sub 24", players: [manuel] }),
    ]);
    expect(r).toEqual([]);
  });

  it("provas PJA sem «PJA» no nome entram pelo tcode", () => {
    const pebble = prova("10444", "AT&T PEBBLE BEACH PRO-AM BY TITLEIST", { ccode: "152", campo: "Royal Óbidos", players: [manuel, outro] });
    expect(provasDeJovensDoManuel([pebble])).toEqual([]);
    expect(provasDeJovensDoManuel([pebble], new Set(["10444"]))).toEqual([pebble]);
  });

  it("com as duas voltas juntas («10674+10676») os dias soltos saem", () => {
    const r = provasDeJovensDoManuel([
      prova("10674+10676", "Campeonato Nacional de Jovens 2023", { ccode: "000", date: "2023-11-18", escalao: "Sub 10", players: [manuel] }),
      prova("10674", "Campeonato Nacional de Jovens Dia1", { ccode: "000", date: "2023-11-18", players: [manuel] }),
    ]);
    expect(r.map((t) => t.tcode)).toEqual(["10674+10676"]);
  });
});

describe("fedDoJogador", () => {
  const feds = new Map([["000|10937|2026", new Map([["ryan dantas", "47100"]])]]);
  const nacional = { ccode: "000", tcode: "10937", date: "2026-04-30" };

  it("sem número na classificação, vem das inscrições/draw da MESMA prova", () => {
    expect(fedDoJogador(nacional, { name: "Ryan Dantas" }, feds)).toBe("47100");
    expect(fedDoJogador(nacional, { name: "Ryan Dantas", fedCode: "51000" }, feds)).toBe("51000");
  });

  it("nunca de outra prova nem de outro ano", () => {
    expect(fedDoJogador({ ...nacional, date: "2025-04-30" }, { name: "Ryan Dantas" }, feds)).toBeNull();
    expect(fedDoJogador({ ...nacional, tcode: "10938" }, { name: "Ryan Dantas" }, feds)).toBeNull();
  });
});
