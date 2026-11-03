/**
 * util/dgv-rangliste.js e util/golfdata-se.js — ano/data de nascimento e clube de
 * alemães e suecos a partir dos rankings das federações (03/11/2026).
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const io = require("./io.js");

/** Corre `fn(modulo)` com o ficheiro `nome` trocado por `conteudo` (o módulo é
 *  carregado já com o mock — guarda o readJsonSafe quando é carregado). */
function comFicheiro(nome, conteudo, modulo, fn) {
  const real = io.readJsonSafe;
  const spy = vi.spyOn(io, "readJsonSafe").mockImplementation((p, d) => (String(p).endsWith(nome) ? conteudo : real(p, d)));
  try {
    delete require.cache[require.resolve(modulo)];
    return fn(require(modulo));
  } finally {
    spy.mockRestore();
    delete require.cache[require.resolve(modulo)];
  }
}

describe("DGV-Jugendrangliste", () => {
  const ranking = { jogadores: [
    { nome: "MAIER, Luis (R)", clube: "Reutlingen", ano: 2013 },
    { nome: "MAIER, Luis", clube: "München", ano: 2013 },
    { nome: "FRITZ, Constantin", clube: "München Eichenried", ano: 2013 },
    { nome: "SCHUSTER, Ben", clube: "Köln", ano: 2012 },
    { nome: "SCHUSTER, Ben", clube: "Bonn", ano: 2011 },
  ] };
  it("ano certo e clube; homónimos desempatados pelo clube, sem clube não se escolhe", () => {
    const juniors = [
      { canonicalName: "Luis Maier", country: "DE", club: "Reutlingen-Sonnenbühl" },
      { canonicalName: "Constantin Fritz", country: "DE", club: null },
      { canonicalName: "Ben Schuster", country: "DE", club: null },
      { canonicalName: "Constantin Fritz", country: "AT", club: null },
      { canonicalName: "Luis Maier", country: "DE", dob: "2013-05-01" },
    ];
    const r = comFicheiro("dgv-rangliste.json", ranking, "./dgv-rangliste.js", (m) => m.enrichWithDgvRangliste({ juniors }));
    expect(juniors[0]).toMatchObject({ birthYear: 2013, birthYearSource: "dgv-rangliste" });
    expect(juniors[1]).toMatchObject({ birthYear: 2013, club: "München Eichenried" });
    expect(juniors[2].birthYear).toBeUndefined();         // dois Ben Schuster, sem clube
    expect(juniors[3].birthYear).toBeUndefined();         // não é alemão
    expect(juniors[4].birthYear).toBeUndefined();         // já tem data
    expect(r).toMatchObject({ anos: 2, homonimos: 1 });
  });
});

describe("golfdata.se (Suécia)", () => {
  it("data e clube a quem não tem; recusa adultos, contradições e nomes com várias fichas", () => {
    const file = { porNome: {
      "erik groth": { playerId: 73003, clube: "Falsterbo Golfklubb", dob: "2008-08-04" },
      "henri reis": { playerId: 728, clube: "Falsterbo Golfklubb", dob: "1954-02-15" },
      "anna berg": { playerId: 1, clube: "X", dob: "2010-01-02" },
      "olle lind": { naoEncontrado: true },
    } };
    const juniors = [
      { canonicalName: "Erik Groth", country: "SE", club: null },
      { canonicalName: "Henri Reis", country: "SE" },
      { canonicalName: "Anna Berg", country: "SE" },
      { canonicalName: "Anna Berg", country: "SE", aliases: [] },
      { canonicalName: "Olle Lind", country: "SE" },
    ];
    comFicheiro("golfdata-se.json", file, "./golfdata-se.js", (m) => m.enrichWithGolfdataSe({ juniors }));
    expect(juniors[0]).toMatchObject({ dob: "2008-08-04", club: "Falsterbo Golfklubb" });
    expect(juniors[1].dob).toBeUndefined();     // 1954 — adulto homónimo
    expect(juniors[2].dob).toBeUndefined();     // duas fichas com o nome
    expect(juniors[4].dob).toBeUndefined();
  });
});
