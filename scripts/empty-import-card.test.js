// Voltas que a FPG importa de outras federações chegam com o cartão vazio
// (buracos a 0, gross_total = par 72, CR/Slope 72/113 de enchimento): o
// pipeline trata-as como "sem cartão" (lib/scorecard-fragment.js).
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { isEmptyCard } = require("../lib/scorecard-fragment.js");

const card = (gross, par) => Object.fromEntries(Array.from({ length: 18 }, (_, i) => [
  [`gross_${i + 1}`, gross], [`par_${i + 1}`, par],
]).flat());

describe("isEmptyCard", () => {
  it("cartão importado com tudo a 0 é vazio", () => {
    expect(isEmptyCard({ ...card(0, 0), gross_total: 72, course_rating: 72, slope: 113 })).toBe(true);
  });
  it("cartão com par (enriquecido) ou com scores não é vazio", () => {
    expect(isEmptyCard(card(0, 4))).toBe(false);
    expect(isEmptyCard(card(5, 0))).toBe(false);
  });
  it("sem cartão", () => {
    expect(isEmptyCard(null)).toBe(true);
  });
});
