/**
 * kids2/__tests__/knownScorecards.test.ts — o cartão «conhecido» só entra na
 * prova e no escalão certos (F7 da revisão de 10/11/2026: qualquer WJGC recebia
 * o cartão «WJGC 2026 Boys 10-11» através da série «wjgc»).
 */
import { describe, it, expect } from "vitest";
import { getKnownScorecard } from "../knownScorecards";

const dmitrii = { canonicalName: "Dmitrii Elchaninov" };
const wjgc = (id: string, name: string) => ({ id, name, seriesId: "wjgc" });

describe("getKnownScorecard", () => {
  it("WJGC 2026 Boys 10-11 → o cartão desse escalão", () => {
    const k = getKnownScorecard(dmitrii, wjgc("wjgc-brjgt2537_boys_10-11", "Daily Mail WJGC 2026 - Boys 10-11"));
    expect(k?.source).toMatch(/WJGC 2026 Boys 10-11/);
  });

  it("outro ano ou outro escalão da mesma série → sem cartão", () => {
    expect(getKnownScorecard(dmitrii, wjgc("wjgc-brjgt243_boys_8-9", "Daily Mail WJGC, 6-11 Boys & 6-13 Girls - 8-9 Boys"))).toBeNull();
    expect(getKnownScorecard(dmitrii, wjgc("wjgc-brjgt251_boys_10-11", "2025 Daily Mail WJGC - Boys 10-11"))).toBeNull();
    expect(getKnownScorecard(dmitrii, wjgc("wjgc-brjgt2537_boys_12-13", "Daily Mail WJGC 2026 - Boys 12-13"))).toBeNull();
  });

  it("a série sozinha não identifica cartão nenhum", () => {
    expect(getKnownScorecard(dmitrii, { seriesId: "wjgc" })).toBeNull();
    expect(getKnownScorecard(dmitrii, { id: "eowagr-eowagr26_contest1", name: "European Open WAGR - Boys 11-12", seriesId: "eowagr" })).toBeNull();
  });
});
