import { describe, it, expect } from "vitest";
import { isManuel, isManuelByName, MANUEL_FED } from "../manuel";

/** isManuel / isManuelByName — o único sítio que reconhece o Manuel. */
describe("isManuelByName", () => {
  it("as 4 variantes do nome", () => {
    for (const n of ["Manuel Medeiros", "Manuel Francisco Medeiros", "Manuel Goulartt Medeiros",
      "Manuel Francisco Goulartt De Medeiros", "MANUEL GOULARTT MEDEIROS"]) {
      expect(isManuelByName(n)).toBe(true);
    }
  });
  it("rejeita outros", () => {
    expect(isManuelByName("Manuel Joao Medeiros")).toBe(false);
    expect(isManuelByName("Gastão Thomaz Medeiros")).toBe(false);
    expect(isManuelByName("")).toBe(false);
  });
});

describe("isManuel", () => {
  it("pelo federado, memberId USKids (actual e antigo) ou nome", () => {
    expect(isManuel({ fed: MANUEL_FED })).toBe(true);
    expect(isManuel({ memberId: "630106" })).toBe(true);
    expect(isManuel({ memberId: 605933 })).toBe(true);
    expect(isManuel({ name: "Manuel Francisco Goulartt De Medeiros" })).toBe(true);
  });
  it("o federado decide: o pai (54907) também se chama «Manuel Medeiros»", () => {
    expect(isManuel({ fed: "54907", name: "Manuel Medeiros" })).toBe(false);
    expect(isManuel({ fedCode: "54907", name: "Manuel Medeiros" })).toBe(false);
    expect(isManuel({ fed: MANUEL_FED, name: "Outro Nome" })).toBe(true);
  });
});
