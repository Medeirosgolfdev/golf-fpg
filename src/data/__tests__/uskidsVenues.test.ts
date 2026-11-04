import { describe, it, expect } from "vitest";
import { uskidsIntlYardage, USKIDS_SEDES, camposDoEscalao } from "../uskidsVenues";

// Grelha USKids das provas internacionais de vários dias (04/11/2026).
describe("uskidsIntlYardage", () => {
  it("Boys 12 = tee 5, 5400–5700 jardas, 18 buracos", () => {
    expect(uskidsIntlYardage("Boys 12")).toMatchObject({ sex: "M", min: 5400, max: 5700, holes: 18 });
  });
  it("Boys 10 e 11 partilham a faixa; Girls 13-14 pelo primeiro número", () => {
    expect(uskidsIntlYardage("Boys 11")?.min).toBe(4800);
    expect(uskidsIntlYardage("Boys 10")?.min).toBe(4800);
    expect(uskidsIntlYardage("Girls 13-14")).toMatchObject({ sex: "F", min: 4800, max: 5100 });
  });
  it("escalões de 9 buracos e nomes sem idade", () => {
    expect(uskidsIntlYardage("Boys 8")?.holes).toBe(9);
    expect(uskidsIntlYardage("Absoluto")).toBeNull();
  });
  it("Spanish Open 2026: Boys 12 no Old Course, os outros no New", () => {
    const sede = USKIDS_SEDES[23132];
    expect(sede.courseKeys).toEqual(["away-the-san-roque-club-old", "away-san-roque"]);
    expect(camposDoEscalao(sede, "Boys 12")).toEqual(["away-the-san-roque-club-old"]);
    expect(camposDoEscalao(sede, "Boys 11")).toEqual(["away-san-roque"]);
    expect(camposDoEscalao(sede, "Girls 13-14")).toEqual(["away-san-roque"]);
  });
});
