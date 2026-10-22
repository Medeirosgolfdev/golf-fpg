import { describe, it, expect } from "vitest";

/** Decisão C (22/10/2026): as cores de série da /drive vêm de classes
 *  (.drive-serie-* + tokens --drive-*), nunca de `cor + "18"` em linha — com
 *  var(--…) isso não é CSS válido e o fundo desaparecia no Tour e no AQUAPOR. */
const SRC = import.meta.glob(["../../../pages/DrivePage.tsx", "../../../pages/drive/*.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("cores da /drive (decisão C)", () => {
  it("sem sufixos de transparência colados a cores nem cores de série em linha", () => {
    for (const [f, txt] of Object.entries(SRC)) {
      expect(txt, f).not.toMatch(/\+\s*["'`][0-9a-fA-F]{2}["'`]/);
      expect(txt, f).not.toMatch(/\}[0-9a-fA-F]{2}[`"]/);
      expect(txt, f).not.toMatch(/SERIE_COLORS/);
    }
  });
});
