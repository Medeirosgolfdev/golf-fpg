import { describe, it, expect } from "vitest";
import { zTier, soma, meanArr } from "../mathUtils";

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
