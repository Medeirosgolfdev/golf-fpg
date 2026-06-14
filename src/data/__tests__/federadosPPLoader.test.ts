/**
 * Testes dos helpers puros do loader Pitch & Putt (federadosPPLoader.ts).
 * Só o que não faz fetch: hasRealPPHcp + ppPlayerUrl.
 */
import { describe, it, expect } from "vitest";
import { hasRealPPHcp, ppPlayerUrl, type FederadoPP } from "../federadosPPLoader";

const base: FederadoPP = {
  fed: "49085", name: "Teste", sex: "M", dob: "2014-04-29",
  clubCode: "001", club: "Clube X", acronym: "X",
  hcp: 10.2, hcpExact: 10.2, hcpStatus: "Válido", hcpType: "PP",
  age: "SUB12", country: "PT", roundsYear: 5, admission: null, lastHcp: null,
};

describe("hasRealPPHcp", () => {
  it("aceita um HCP P&P estabelecido", () => {
    expect(hasRealPPHcp(base)).toBe(true);
  });
  it("rejeita o sentinela 99 / Sem HCP", () => {
    expect(hasRealPPHcp({ ...base, hcpExact: 99, hcp: 99, hcpStatus: "Sem HCP" })).toBe(false);
  });
  it("rejeita hcpExact null", () => {
    expect(hasRealPPHcp({ ...base, hcpExact: null })).toBe(false);
  });
  it("rejeita null / undefined", () => {
    expect(hasRealPPHcp(null)).toBe(false);
    expect(hasRealPPHcp(undefined)).toBe(false);
  });
});

describe("ppPlayerUrl", () => {
  it("constrói a URL pública do subsistema /listspp/", () => {
    expect(ppPlayerUrl("49085")).toBe("https://scoring.fpg.pt/listspp/PlayerWHS.aspx?no=49085");
    expect(ppPlayerUrl(52884)).toBe("https://scoring.fpg.pt/listspp/PlayerWHS.aspx?no=52884");
  });
});
