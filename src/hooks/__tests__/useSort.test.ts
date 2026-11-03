import { describe, it, expect } from "vitest";
import { compareTextNullsLast, compareValuesNullsLast } from "../useSort";

describe("compareTextNullsLast", () => {
  const vals = ["Évora", null, "abc", "", undefined, "Braga"];
  it("vazios no fim a subir, resto por ordem pt", () => {
    const s = [...vals].sort((a, b) => compareTextNullsLast(a, b, 1));
    expect(s.slice(0, 3)).toEqual(["abc", "Braga", "Évora"]);
    expect(s.slice(3).every(v => !v)).toBe(true);
  });
  it("vazios no fim a descer (não saltam para o topo)", () => {
    const s = [...vals].sort((a, b) => compareTextNullsLast(a, b, -1));
    expect(s.slice(0, 3)).toEqual(["Évora", "Braga", "abc"]);
    expect(s.slice(3).every(v => !v)).toBe(true);
  });
  it("datas ISO por ordem cronológica", () => {
    expect(["2026-03-01", "", "2025-12-31"].sort((a, b) => compareTextNullsLast(a, b, -1))).toEqual(["2026-03-01", "2025-12-31", ""]);
  });
});

describe("compareValuesNullsLast", () => {
  it("números: vazios no fim nas duas direcções", () => {
    const vals = [2, null, 0, NaN, 5];
    expect([...vals].sort((a, b) => compareValuesNullsLast(a, b, 1)).slice(0, 3)).toEqual([0, 2, 5]);
    expect([...vals].sort((a, b) => compareValuesNullsLast(a, b, -1)).slice(0, 3)).toEqual([5, 2, 0]);
  });
  it("texto: vazios no fim nas duas direcções", () => {
    const vals = ["b", null, "", "a"];
    expect([...vals].sort((a, b) => compareValuesNullsLast(a, b, -1)).slice(0, 2)).toEqual(["b", "a"]);
  });
});
