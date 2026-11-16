import { describe, it, expect } from "vitest";
import teeData from "../../../shared/tee-colors.json";
import { getTeeHex, isTeeSoDistancia, registarTeesSoDistancia } from "../teeColors";

const PALETA = (teeData as { distanceOnly: string[] }).distanceOnly;

describe("tees só com a distância («5345 m»)", () => {
  it("reconhece o nome que é só a distância", () => {
    expect(isTeeSoDistancia("5345 m")).toBe(true);
    expect(isTeeSoDistancia("Amarelas")).toBe(false);
    expect(isTeeSoDistancia("Tour")).toBe(false);
  });

  it("Circuito Zona E, Granada 14/11/2026: 3 tees com 3 cores diferentes, o mais comprido primeiro", () => {
    registarTeesSoDistancia(["5345 m", "5061 m", "5649 m", "5345 m", undefined, "Amarelas"]);
    expect(getTeeHex("5649 m")).toBe(PALETA[0]);
    expect(getTeeHex("5345 m")).toBe(PALETA[1]);
    expect(getTeeHex("5061 m")).toBe(PALETA[2]);
    expect(new Set([getTeeHex("5649 m"), getTeeHex("5345 m"), getTeeHex("5061 m")]).size).toBe(3);
  });

  it("os tees com nome de cor não mudam", () => {
    registarTeesSoDistancia(["Amarelas", "6000 m"]);
    expect(getTeeHex("Amarelas")).not.toBe(PALETA[0]);
  });

  it("as cores do site não são as cores canónicas dos tees", () => {
    const canon = new Set((teeData as { canonicalHexes: string[] }).canonicalHexes.map((h) => h.toLowerCase()));
    for (const h of PALETA) expect(canon.has(h.toLowerCase())).toBe(false);
  });
});
