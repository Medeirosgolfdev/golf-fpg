/**
 * Lixo nos jogadores do portal FFG Resultats — regra única em
 * src/data/ffg/ffgJogador.ts, usada pela página do torneio e pelo
 * build-france-players.js (via scripts/lib/ffg-jogador.cjs):
 *   - lugares de equipa por preencher («JOUEUR A Touraine», HCP -15);
 *   - escapes Latin-1 em cru («J\E9r\E9my»);
 *   - escalão colado ao nome dos estrangeiros («Amalie (U18)», cortado «(U1»);
 *   - licenças «E» novas a cada prova para o mesmo estrangeiro (juntas no builder).
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ffgPlayerName } from "../../src/data/ffg/names";
import { ffgResToFPGTournament } from "../../src/data/ffg/toTournament";

const require = createRequire(import.meta.url);
const { isLugarEquipa, limparNomeFfg, escalaoNoNome } = require("./ffg-jogador.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const DATA = path.join(ROOT, "public", "data");

describe("isLugarEquipa", () => {
  it("apanha os lugares JOUEUR/JOUEUSE A–E (formato real do portal)", () => {
    expect(isLugarEquipa({ name: "Touraine Joueur A", nameNom: "TOURAINE", namePrenom: "JOUEUR A", hcp: -15 })).toBe(true);
    expect(isLugarEquipa({ name: "Saint Nom Joueuse E", nameNom: "SAINT NOM", namePrenom: "JOUEUSE E" })).toBe(true);
    expect(isLugarEquipa({ name: "Aix Les Bains Joueur C" })).toBe(true);
  });

  it("deixa passar pessoas reais (incluindo apelidos parecidos)", () => {
    expect(isLugarEquipa({ name: "Mongalvy Hugo", nameNom: "MONGALVY", namePrenom: "Hugo" })).toBe(false);
    expect(isLugarEquipa({ name: "Forfait Quentin", nameNom: "FORFAIT", namePrenom: "Quentin" })).toBe(false);
    expect(isLugarEquipa({ name: "Joueur Antoine", nameNom: "JOUEUR", namePrenom: "Antoine" })).toBe(false);
    expect(isLugarEquipa({ name: "Inconnu Arthur" })).toBe(false);
    expect(isLugarEquipa(null)).toBe(false);
  });
});

describe("limparNomeFfg / escalaoNoNome", () => {
  it("descodifica os escapes Latin-1 do ficheiro de 2017", () => {
    expect(limparNomeFfg(String.raw`J\E9r\E9my`)).toBe("Jérémy");
    expect(limparNomeFfg(String.raw`Rapha\EBl`)).toBe("Raphaël");
    expect(limparNomeFfg(String.raw`CAVALI\C9`)).toBe("CAVALIÉ");
    expect(limparNomeFfg("D&#039;Artagnan &amp; Co")).toBe("D'Artagnan & Co");
  });

  it("tira o escalão colado, também quando vem cortado", () => {
    expect(limparNomeFfg("Amalie (U18)")).toBe("Amalie");
    expect(limparNomeFfg("Leth-Nissen Amalie (U18)")).toBe("Leth-Nissen Amalie");
    expect(limparNomeFfg("Giovanni Daniele (U1")).toBe("Giovanni Daniele");
    expect(limparNomeFfg("Marie-Anne")).toBe("Marie-Anne");
    expect(escalaoNoNome("Amalie (U18)")).toBe("U18");
    expect(escalaoNoNome("Amalie")).toBe(null);
  });

  it("a página do torneio mostra o nome limpo", () => {
    expect(ffgPlayerName({ nameNom: "ORTENGREN", namePrenom: "Meja (U18)" })).toBe("Meja Ortengren");
    expect(ffgPlayerName({ nameNom: "TEXERAUD", namePrenom: String.raw`J\E9r\E9my` })).toBe("Jérémy Texeraud");
  });
});

describe("france-players.json (gerado)", () => {
  const OUT = path.join(DATA, "france-players.json");
  const lista = () => Object.values(JSON.parse(fs.readFileSync(OUT, "utf8")).byLicense);

  it.skipIf(!fs.existsSync(OUT))("sem «Joueur A…», sem escapes e sem «(U18)» nos nomes", () => {
    const maus = lista().filter((p) =>
      /\bjoueu(?:r|se)\s+[a-z]\b/i.test(p.name || "") || /\\[0-9A-F]{2}/.test(p.name || "") || /\(\s*(?:U|Sub)/i.test(p.name || ""));
    expect(maus.map((p) => `${p.license} ${p.name}`)).toEqual([]);
  });

  it.skipIf(!fs.existsSync(OUT))("o mesmo estrangeiro com licenças E de várias provas é UMA linha", () => {
    const meja = lista().filter((p) => p.name === "Meja Ortengren");
    expect(meja).toHaveLength(1);
    expect(meja[0].tot).toBe(2);
    expect([meja[0].license, ...(meja[0].licencas || [])].sort()).toEqual(["E61466993", "E66717929"]);
    // Licença a sério absorve as E do mesmo nome e país.
    const hugo = lista().filter((p) => p.name === "Hugo Duquaine");
    expect(hugo).toHaveLength(1);
    expect(hugo[0].license).toBe("514523296");
  });

  it.skipIf(!fs.existsSync(OUT))("os 13 nomes com países diferentes juntam-se (decisão de 02/11/2026)", () => {
    const l = lista();
    for (const nome of ["Elise Bishop", "Axelle Wille", "Leo Taylor", "Pablo Jacquot", "Emile Chibert-Puel"]) {
      expect(l.filter((p) => p.name === nome), nome).toHaveLength(1);
    }
    // Hardelot 2025: inscrição repetida (linha belga em branco) — conta uma vez, com o resultado.
    const pablo = l.find((p) => p.name === "Pablo Jacquot");
    expect(pablo.licencas).toEqual(["E83688948"]);
    const t = JSON.parse(fs.readFileSync(path.join(DATA, "ffgolf-player-tournaments.json"), "utf8"));
    const rows = t.byLicense[pablo.license];
    expect(rows).toHaveLength(pablo.tot);
    const hardelot = rows.filter((r) => /Hardelot/.test(t.tournaments[r[0]].name));
    expect(hardelot).toHaveLength(1);
    expect(hardelot[0][2]).toBe(157);
  });

  // A fonte que trazia os lugares (CF clubes U16 2019) — se o predicado deixar
  // de os reconhecer, rebenta aqui e não só no ficheiro gerado.
  const SRC = path.join(DATA, "ffgolf-resultats", "01-00-1900525980.json");
  it.skipIf(!fs.existsSync(SRC))("o predicado reconhece os 80 lugares da 1ère Division U16 Garçons 2019", () => {
    const d = JSON.parse(fs.readFileSync(SRC, "utf8"));
    const ps = (d?.details?.series || d.series).flatMap((s) => s.players || []);
    const lugares = ps.filter(isLugarEquipa);
    expect(lugares.length).toBe(80);
    expect(lugares.every((p) => !(p.total > 0))).toBe(true);
  });

  it.skipIf(!fs.existsSync(SRC))("a classificação do torneio (/ffg/t/ffgres:1900525980) não os mostra", () => {
    const d = JSON.parse(fs.readFileSync(SRC, "utf8"));
    const t = ffgResToFPGTournament(d);
    const nomes = t.players.map((p) => p.name);
    expect(nomes.length).toBe(126);
    expect(nomes.filter((n) => /joueu/i.test(n))).toEqual([]);
  });
});
