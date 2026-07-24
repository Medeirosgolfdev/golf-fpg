import { describe, it, expect } from "vitest";
import { matchDivision } from "../pastEditions";
import type { CircuitDivision } from "../types";

const div = (label: string): CircuitDivision =>
  ({ key: label, escalao: label, results: undefined } as unknown as CircuitDivision);

describe("matchDivision — AQUAPOR Masculino/Senhoras ↔ '—'", () => {
  it("casa 'Masculino' com a divisão única '—' (irmã do pool sem merge)", () => {
    // O 4º Aquapor é mostrado como 'Masculino'; as irmãs no pool são single '—'.
    expect(matchDivision([div("—")], "Masculino")?.escalao).toBe("—");
  });

  it("casa '—' com uma irmã fundida em 'Masculino'", () => {
    expect(matchDivision([div("Masculino"), div("Senhoras")], "—")?.escalao).toBe("Masculino");
  });

  it("'Senhoras' NÃO casa com a prova única masculina '—'", () => {
    expect(matchDivision([div("—")], "Senhoras")).toBeNull();
  });

  it("'Senhoras' casa com 'Senhoras' explícito", () => {
    expect(matchDivision([div("Masculino"), div("Senhoras")], "Senhoras")?.escalao).toBe("Senhoras");
  });

  it("match exacto continua a funcionar", () => {
    expect(matchDivision([div("Masculino")], "Masculino")?.escalao).toBe("Masculino");
  });

  it("não casa 'Masculino' com um escalão de idade (série diferente)", () => {
    // Um challenge com 1 divisão 'Sub 12' não deve ser apanhado por 'Masculino'.
    expect(matchDivision([div("Sub 12")], "Masculino")).toBeNull();
  });

  it("mantém o casamento por sexo+idade das outras fontes", () => {
    expect(matchDivision([div("Under 14 Girls")], "Under 15 Girls")?.escalao).toBe("Under 14 Girls");
  });
});
