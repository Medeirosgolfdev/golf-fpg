import { describe, it, expect } from "vitest";
import { rfegRankingEscalao, rfegRankingsDoAno, type RfegRankingIndex } from "../rfeg/rankings";

describe("RFEG — rankings juvenis", () => {
  it("categoria do ranking → escalão pela tabela única", () => {
    expect(rfegRankingEscalao("B")).toBe("Sub 10");
    expect(rfegRankingEscalao("A")).toBe("Sub 12");
    expect(rfegRankingEscalao("I")).toBe("Sub 14");
    expect(rfegRankingEscalao("C")).toBe("Sub 16");
    expect(rfegRankingEscalao(null)).toBeNull();
  });
  it("listas do ano: nacionais primeiro, depois as zonas", () => {
    const item = (id: number, year: number, titulo: string) => ({ file: `${id}.json`, id, year, comite: "Juvenil", titulo, fecha: null, fechaIso: null, total: 10 });
    const idx: RfegRankingIndex = { generatedAt: "", rankings: [
      item(1, 2026, "Ranking Zona 2 (Cataluña) Alevín Masculino 2026"),
      item(2, 2026, "RANKING NACIONAL CADETE MASCULINO 2026"),
      item(3, 2025, "RANKING NACIONAL ALEVIN MASCULINO 2025"),
      item(4, 2026, "RANKING NACIONAL ALEVIN MASCULINO 2026"),
    ] };
    expect(rfegRankingsDoAno(idx, 2026).map((r) => r.id)).toEqual([4, 2, 1]);
  });
});
