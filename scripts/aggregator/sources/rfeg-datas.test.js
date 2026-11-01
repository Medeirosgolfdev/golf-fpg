/**
 * sources/rfeg.js — a data de uma prova do LiveGolfScoring é o primeiro dia do
 * intervalo, mesmo quando a fonte grava o último (Campeonato de España Alevín
 * 2025: «25 junio - 27 junio» com 2025-06-27).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { datasDoIntervalo } = require("./rfeg.js");

describe("datasDoIntervalo", () => {
  it("dá o primeiro e o último dia", () => {
    expect(datasDoIntervalo("2025-06-27", "25 junio - 27 junio")).toEqual({ inicio: "2025-06-25", fim: "2025-06-27" });
    expect(datasDoIntervalo("2025-06-25", "25 junio - 27 junio")).toEqual({ inicio: "2025-06-25", fim: "2025-06-27" });
    expect(datasDoIntervalo("2023-05-01", "29 abril - 01 mayo")).toEqual({ inicio: "2023-04-29", fim: "2023-05-01" });
  });
  it("na viragem do ano", () => {
    expect(datasDoIntervalo("2024-01-02", "28 diciembre - 02 enero")).toEqual({ inicio: "2023-12-28", fim: "2024-01-02" });
    expect(datasDoIntervalo("2023-12-28", "28 diciembre - 02 enero")).toEqual({ inicio: "2023-12-28", fim: "2024-01-02" });
  });
  it("sem intervalo, ou com a data fora dele, fica a gravada", () => {
    expect(datasDoIntervalo("2025-06-27", null)).toEqual({ inicio: "2025-06-27", fim: null });
    expect(datasDoIntervalo("2022-09-15", "11 febrero - 13 febrero")).toEqual({ inicio: "2022-09-15", fim: null });
    expect(datasDoIntervalo(null, "25 junio - 27 junio")).toEqual({ inicio: null, fim: null });
  });
});
