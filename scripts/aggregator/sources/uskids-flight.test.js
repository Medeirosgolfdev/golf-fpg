/**
 * parseFlight — a divisão com letra é outro leaderboard (World Championship 2018:
 * «Boys 12» e «Boys B 12» juntavam-se num só escalão com dois vencedores).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { parseFlight } = require("./uskids.js");

describe("parseFlight", () => {
  it("«Boys B 12» e «Boys 12» são flights diferentes, com a mesma idade", () => {
    const a = parseFlight("Boys 12"), b = parseFlight("Boys B 12");
    expect(a.flightKey).not.toBe(b.flightKey);
    expect([b.ageMin, b.ageMax, b.sex]).toEqual([12, 12, "M"]);
  });
  it("escalões normais não mudam", () => {
    expect(parseFlight("Boys 15-18").flightKey).toBe("m_15_18");
    expect(parseFlight("Girls 6 & Under").flightKey).toBe("f__6");
  });
});
