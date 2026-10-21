import { describe, it, expect } from "vitest";
import { zTier } from "../mathUtils";

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
