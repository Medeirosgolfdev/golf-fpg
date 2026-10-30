/**
 * discover-fgg-scope.js — lista de provas juvenis da Federación Gallega
 * (fggolf.com/torneos.aspx → gameId do golfdirecto).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { lerTorneios, JUVENIL, FORA } = require("./discover-fgg-scope.js");

describe("FGG — tabela de torneios", () => {
  it("data, nome, gameId e campo de cada linha", () => {
    const html = `<table><tr><td data-label="Fecha">S&aacute;b 21/02</td>
      <td data-label="Torneo"><a href="https://www.golfdirecto.com/game/69412fe2892dbc936397de2b/summary" target="_blank">1ª Prueba Liga Gallega Juvenil Sub-18</a></td>
      <td data-label="Campo"><a href="campo.aspx?id=3">Real Montealegre</a></td></tr>
      <tr><td data-label="Fecha">Dom 22/02</td><td data-label="Torneo"><a href="otra.aspx">Sem golfdirecto</a></td></tr></table>`;
    expect(lerTorneios(html)).toEqual([
      { gameId: "69412fe2892dbc936397de2b", name: "1ª Prueba Liga Gallega Juvenil Sub-18", date: "02-21", campo: "Real Montealegre" },
    ]);
  });

  it("só juvenis; fora iniciação, só Benjamines, adiadas e Campeonatos de España", () => {
    const fica = (n) => JUVENIL.test(n) && !FORA.test(n);
    expect(fica("1ª Prueba Liga Gallega Juvenil Sub-18")).toBe(true);
    expect(fica("Galicia Junior Cup")).toBe(true);
    expect(fica("Puntuable Zonal Infantil")).toBe(true);
    expect(fica("Cativ@s Juvenil")).toBe(false);
    expect(fica("Benjamín Juvenil Liga")).toBe(false);
    expect(fica("Liga Gallega Juvenil (APLAZADO)")).toBe(false);
    expect(fica("Campeonato de España Infantil")).toBe(false);
    expect(fica("Campeonato de Galicia Absoluto")).toBe(false);
  });
});
