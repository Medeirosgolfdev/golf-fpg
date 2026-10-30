/**
 * discover-golfdirecto-scope.js — que provas das federações entram, e a
 * leitura de datas da regra dos gémeos golfdirecto × PDF regional.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { filtrar } = require("./discover-golfdirecto-scope.js");
const { diaMs } = require("./lib/golfdirecto-twins.js");

const FBG = "651539d7307e3268ffbbf506";
const doc = (name, extra = {}) => ({
  name, client: { _id: FBG },
  nextGame: { _id: "6a46995a2a0982b84d18bc76", scheduleStartDate: "2026-07-25T06:30:00.000Z", pointMode: "strokePlay", gameConfig: { gameMode: "individual" }, club: { name: "SON MUNTANER GOLF" }, ...extra },
});

describe("golfdirecto — provas juvenis das federações", () => {
  it("fica a prova juvenil de stroke play individual de uma federação da lista", () => {
    expect(filtrar([doc("VIII Prueba Circuito Junior - 18 hoyos")])).toEqual([{
      gameId: "6a46995a2a0982b84d18bc76", title: "VIII Prueba Circuito Junior - 18 hoyos",
      organizer: "Federación Balear de Golf", date: "2026-07-25", sede: "SON MUNTANER GOLF",
    }]);
  });

  it("fora: 9 buracos, só-Benjamines, hándicap, nacionais, match play, clubes fora da lista", () => {
    expect(filtrar([
      doc("VIII Prueba Circuito Junior - 9 hoyos"),
      doc("MENSUAL JUVENIL - BENJAMINES MEDAL"),
      doc("Prueba Valedera Handicap Sub 16"),
      doc("Campeonato de España Infantil y Alevín"),
      doc("Torneo Juvenil", { pointMode: "matchPlay" }),
      { ...doc("Torneo Juvenil"), client: { _id: "000000000000000000000000" } },
      doc("Torneo Juvenil", { scheduleStartDate: "2024-06-01T08:00:00.000Z" }),
    ])).toEqual([]);
  });

  it("uma prova mista com Benjamín fica", () => {
    expect(filtrar([doc("PVCE INFANTIL, ALEVIN Y BENJAMIN")])).toHaveLength(1);
  });
});

describe("gémeos golfdirecto × PDF — datas", () => {
  it("dd/mm/aaaa e ISO dão o mesmo dia", () => {
    expect(diaMs("03/07/2026")).toBe(diaMs("2026-07-03T07:00:00.000Z"));
    expect(diaMs("")).toBeNull();
  });
});
