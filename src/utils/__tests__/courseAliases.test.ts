import { describe, it, expect } from "vitest";
import { canonicalCourseName, courseDisplayName } from "../courseAliases";

describe("canonicalCourseName — campos PT legados/genéricos", () => {
  const cases: Array<[string, string]> = [
    ["Oceânico O'Connor", "O'Connor Jnr Course"],
    ["Morgado do Reguengo Golfe", "Morgado Golf"],
    ["Montebelo", "Montebelo Caramulo (1-18)"],
    ["Montebelo A-B", "Montebelo Caramulo (1-18)"],
    ["Vila Sol (Challenge / Prestige)", "Vila Sol - Challenge / Prestige (10-27)"],
    ["Vila Sol (Prestige / Prime)", "Vila Sol - Prestige / Prime (19-9)"],
    ["Vila Sol (Prime / Challenge)", "Vila Sol - Prime / Challenge (1-18)"],
    ["Vila Sol 1 (Prime / Challenge)", "Vila Sol - Prime / Challenge (1-18)"],
    ["Pinheiros Altos-Oliveiras/Pinheiros", "Pinheiros Altos-Olives/Pines"],
    ["Pinheiros Altos-Pinheiros/Sobreiros", "Pinheiros Altos-Pines/Corks"],
    ["Penha Longa - Atlântico", "Penha Longa Atlantic Championship"],
    ["Palmares Golf", "Palmares Golf Lagos - Praia"],
  ];

  for (const [input, expected] of cases) {
    it(`${input} → ${expected}`, () => {
      expect(canonicalCourseName(input)).toBe(expected);
    });
  }

  it("não altera nomes já canónicos dos combos", () => {
    expect(canonicalCourseName("Montebelo Caramulo (1-18)")).toBe("Montebelo Caramulo (1-18)");
    expect(canonicalCourseName("O'Connor Jnr Course")).toBe("O'Connor Jnr Course");
    expect(canonicalCourseName("Pinheiros Altos-Olives/Pines")).toBe("Pinheiros Altos-Olives/Pines");
  });
});

describe("courseDisplayName — Santo da Serra pela ordem dos buracos", () => {
  it("mostra o percurso como a FPG o escreve", () => {
    expect(courseDisplayName("Santo da Serra - Machico+Serras")).toBe("Santo da Serra - Serras-Machico");
    expect(courseDisplayName("Santo da Serra - Desertas+Machico")).toBe("Santo da Serra - Machico-Desertas");
    expect(courseDisplayName("Santo da Serra - Desertas+Serras")).toBe("Santo da Serra - Desertas-Serras");
    expect(courseDisplayName("Santo da Serra - Serras×2")).toBe("Santo da Serra - Serras-Serras");
  });
  it("não mexe nos 9 buracos nem noutros campos", () => {
    expect(courseDisplayName("Santo da Serra - Machico")).toBe("Santo da Serra - Machico");
    expect(courseDisplayName("Palmares Golf Lagos - Praia")).toBe("Palmares Golf Lagos - Praia");
  });
  it("rondas importadas sem campo («NONE») mostram «—»", () => {
    expect(courseDisplayName("NONE")).toBe("—");
  });
});
