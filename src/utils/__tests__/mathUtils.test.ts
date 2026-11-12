import { describe, it, expect } from "vitest";
import { zTier, soma, somaDe, meanArr, round1 } from "../mathUtils";

/** zTier — único sítio dos níveis por z-score (Rivais e Tabela global). */
describe("zTier", () => {
  const field = { m: 10, s: 5 };
  it("limiares −1,2 / −0,4 / 0,4 / 1,2", () => {
    expect(zTier(10 - 1.2 * 5, field)).toBe("elite");
    expect(zTier(10 - 1.19 * 5, field)).toBe("strong");
    expect(zTier(10 - 0.4 * 5, field)).toBe("strong");
    expect(zTier(10, field)).toBe("solid");
    expect(zTier(10 + 0.4 * 5, field)).toBe("solid");
    expect(zTier(10 + 1.2 * 5, field)).toBe("developing");
    expect(zTier(10 + 1.3 * 5, field)).toBe("beginner");
  });
  it("sem dispersão ou sem dados → null", () => {
    expect(zTier(3, { m: 3, s: 0 })).toBeNull();
    expect(zTier(null, field)).toBeNull();
    expect(zTier(3, null)).toBeNull();
  });
});

/** soma / meanArr — as somas e médias que estavam escritas à mão (reduce) por todo o site. */
describe("soma e meanArr", () => {
  it("soma os números e ignora vazios e não-números", () => {
    expect(soma([4, 5, 3])).toBe(12);
    expect(soma([4, null, undefined, 3, NaN, Infinity])).toBe(7);
    expect(soma([])).toBe(0);
    expect(soma(null)).toBe(0);
    expect(soma(undefined)).toBe(0);
  });
  it("média: null quando não há valores (nunca 0 nem NaN)", () => {
    expect(meanArr([80, 90])).toBe(85);
    expect(meanArr([80, null, 90, undefined])).toBe(85);
    expect(meanArr([])).toBeNull();
    expect(meanArr([null, undefined])).toBeNull();
  });
});

describe("somaDe e round1", () => {
  it("soma um campo de cada elemento; vazios não contam", () => {
    const js = [{ p: 3 }, { p: null }, { p: 4 }, {}] as { p?: number | null }[];
    expect(somaDe(js, j => j.p)).toBe(7);
    expect(somaDe([], () => 1)).toBe(0);
    expect(somaDe(null, () => 1)).toBe(0);
  });
  it("também conta (1 por cada um que cumpre) e dá o índice", () => {
    expect(somaDe([1, 5, 9], x => (x > 3 ? 1 : 0))).toBe(2);
    expect(somaDe([10, 10, 10], (x, i) => x * i)).toBe(30);
  });
  it("round1 arredonda a uma casa (a mesma função do whsCalc)", () => {
    expect(round1(12.34)).toBe(12.3);
    expect(round1(12.35)).toBe(12.4);
    expect(round1(-0.04)).toBe(-0);
  });
});
