import { describe, it, expect } from "vitest";
import { firstShotClub, secondShotClub, clubDistances } from "../clubScale";

// O taco da 1.ª pancada do «📏 Alcance» (04/11/2026), drive de 185 m.
describe("firstShotClub", () => {
  it("par 3: o taco mais curto que chega ao green", () => {
    expect(firstShotClub(3, 105, 185)?.abbr).toBe("F8"); // F8 = 111, F9 = 102 não chega
    expect(firstShotClub(3, 120, 185)?.abbr).toBe("F7"); // F7 = 120
    expect(firstShotClub(3, 200, 185)?.abbr).toBe("D");  // nenhum chega: driver
  });

  it("par 4: driver, salvo se deixar menos do que um sand wedge cheio", () => {
    expect(firstShotClub(4, 275, 185)?.abbr).toBe("D");  // deixa 90 m
    const curto = firstShotClub(4, 225, 185)!;            // driver deixaria 40 m
    expect(curto.abbr).toBe("F5");                        // 135 m → deixa 90 m (PW 92)
  });

  it("par 5: driver", () => {
    expect(firstShotClub(5, 370, 185)?.abbr).toBe("D");
  });

  it("a escala é decrescente", () => {
    const m = clubDistances(185).map(c => c.m);
    expect([...m].sort((a, b) => b - a)).toEqual(m);
  });
});

describe("secondShotClub — sem o driver", () => {
  it("o taco mais curto que dá os metros", () => {
    expect(secondShotClub(90, 185)?.abbr).toBe("PW");   // PW 92
    expect(secondShotClub(120, 185)?.abbr).toBe("F7");  // F7 120
    expect(secondShotClub(160, 185)?.abbr).toBe("M5");  // M5 161
  });
  it("nunca o driver; sem nenhum que chegue, a madeira 3", () => {
    expect(secondShotClub(250, 185)?.abbr).toBe("M3");
    expect(secondShotClub(250, 185)?.m).toBe(250);
  });
});
