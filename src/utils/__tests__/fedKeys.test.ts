import { describe, it, expect } from "vitest";
import { isVirtualFed, displayFed, kidsHref } from "../fedKeys";

describe("isVirtualFed", () => {
  it("reconhece as chaves criadas a partir do nome", () => {
    expect(isVirtualFed("kids:diana_fraile_herrero")).toBe(true);
    expect(isVirtualFed("intl:joe_short")).toBe(true);
  });

  it("não marca números de federado reais", () => {
    expect(isVirtualFed("52884")).toBe(false);
    expect(isVirtualFed("46309")).toBe(false);
  });

  it("tolera vazio", () => {
    expect(isVirtualFed(null)).toBe(false);
    expect(isVirtualFed(undefined)).toBe(false);
    expect(isVirtualFed("")).toBe(false);
  });
});

describe("displayFed", () => {
  it("devolve o federado real", () => {
    expect(displayFed("52884")).toBe("52884");
  });

  it("esconde a chave virtual — o utilizador não a sabe distinguir de um federado", () => {
    expect(displayFed("kids:diana_fraile_herrero")).toBeNull();
    expect(displayFed("intl:joe_short")).toBeNull();
  });

  it("devolve null quando não há federado", () => {
    expect(displayFed(null)).toBeNull();
    expect(displayFed("")).toBeNull();
  });
});

describe("kidsHref", () => {
  it("prefere o id do agregador — a rota que o utilizador conhece", () => {
    expect(kidsHref("rAM15976580", "diego%20gross")).toBe("/kids2/rAM15976580");
  });

  it("cai no hash por nome quando não há id", () => {
    expect(kidsHref(null, "Joe%20Short")).toBe("/kids2#Joe%20Short");
  });

  it("sem nenhum dos dois não há link", () => {
    expect(kidsHref(null, null)).toBeNull();
    expect(kidsHref(undefined, undefined)).toBeNull();
  });
});
