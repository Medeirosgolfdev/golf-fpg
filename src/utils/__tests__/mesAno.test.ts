import { describe, it, expect } from "vitest";
import { isoDeMesAno } from "../mesAno";

describe("isoDeMesAno", () => {
  it("«Fev 2025» → «2025-02», para ordenar como as datas ISO", () => {
    expect(isoDeMesAno("Fev 2025")).toBe("2025-02");
    expect(isoDeMesAno("dez 2025")).toBe("2025-12");
    const datas = ["Fev 2026", "Ago 2025", "Dez 2025", "Fev 2025"].map(isoDeMesAno).sort();
    expect(datas).toEqual(["2025-02", "2025-08", "2025-12", "2026-02"]);
  });

  it("o que não é «Mês AAAA» passa como veio", () => {
    expect(isoDeMesAno("2025-08-17")).toBe("2025-08-17");
    expect(isoDeMesAno("?")).toBe("?");
    expect(isoDeMesAno(null)).toBe("");
  });
});
