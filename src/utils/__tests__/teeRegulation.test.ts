/**
 * Testes das regras de tee por torneio (src/utils/teeRegulation.ts).
 */
import { describe, expect, it } from "vitest";
import { parseSubNumber, teeNameFor, teeRuleFor } from "../teeRegulation";

describe("teeRuleFor", () => {
  it("Castro Marim U14 2026 (Termos FPG): rapazes Amarelas em todos os escalões, raparigas Vermelhas", () => {
    for (const tcode of ["90872", "90873", "10946"]) {
      const r = teeRuleFor("000", tcode);
      expect(r).toBeDefined();
      expect(r!(12, "M")).toBe("Amarelas"); // Sub12 também (a tabela geral daria Vermelhas)
      expect(r!(14, "M")).toBe("Amarelas");
      expect(r!(12, "F")).toBe("Vermelhas");
      expect(r!(14, "F")).toBe("Vermelhas");
    }
    expect(teeNameFor("Sub 12", "M")).toBe("Vermelhas");
  });

  it("Miramar U25: Sub14 F Vermelhas, Sub18 F Amarelas, Sub10 Roxas", () => {
    const r = teeRuleFor("003", "10652")!;
    expect(r(14, "F")).toBe("Vermelhas");
    expect(r(18, "F")).toBe("Amarelas");
    expect(r(10, "M")).toBe("Roxas");
  });

  it("Quinta do Lago Junior Open 2026 (Termos do clube): Pretas/Douradas/Brancas/Verdes por escalão e sexo", () => {
    for (const tcode of ["90912", "90914", "90916", "90921"]) {
      const r = teeRuleFor("962", tcode);
      expect(r).toBeDefined();
      expect(r!(21, "M")).toBe("Pretas");
      expect(r!(16, "M")).toBe("Pretas");
      expect(r!(16, "F")).toBe("Douradas");
      expect(r!(14, "M")).toBe("Douradas");
      expect(r!(14, "F")).toBe("Brancas");   // «Silver» nos Termos
      expect(r!(12, "M")).toBe("Brancas");
      expect(r!(12, "F")).toBe("Verdes");
      expect(r!(10, "M")).toBe("Brancas");   // mais novos inscritos no U12
    }
  });

  it("sem regra própria → undefined (usa a tabela geral)", () => {
    expect(teeRuleFor("000", "10872")).toBeUndefined();
    expect(parseSubNumber("Sub 14")).toBe(14);
  });
});
