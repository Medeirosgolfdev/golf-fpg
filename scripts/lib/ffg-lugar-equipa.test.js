/**
 * Lugares de equipa por preencher do portal FFGolf («JOUEUR A Touraine»,
 * HCP -15) não podem entrar no roster da /ffg/info/joueurs.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isLugarEquipa } = require("./ffg-lugar-equipa.js");

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

describe("france-players.json sem lugares de equipa", () => {
  const OUT = path.join(DATA, "france-players.json");
  it.skipIf(!fs.existsSync(OUT))("nenhum «Joueur A…» no roster gerado", () => {
    const d = JSON.parse(fs.readFileSync(OUT, "utf8"));
    const maus = Object.values(d.byLicense).filter((p) => /\bjoueu(?:r|se)\s+[a-z]\b/i.test(p.name || ""));
    expect(maus.map((p) => `${p.license} ${p.name}`)).toEqual([]);
  });

  // A fonte que os trazia (CF clubes U16 2019) — se o predicado deixar de os
  // reconhecer, rebenta aqui e não só no ficheiro gerado.
  const SRC = path.join(DATA, "ffgolf-resultats", "01-00-1900525980.json");
  it.skipIf(!fs.existsSync(SRC))("o predicado reconhece os 80 lugares da 1ère Division U16 Garçons 2019", () => {
    const d = JSON.parse(fs.readFileSync(SRC, "utf8"));
    const ps = (d?.details?.series || d.series).flatMap((s) => s.players || []);
    const lugares = ps.filter(isLugarEquipa);
    expect(lugares.length).toBe(80);
    expect(lugares.every((p) => !(p.total > 0))).toBe(true);
  });
});
