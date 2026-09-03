import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { lgsCountryToIso } = require("./lgs-country.js");

describe("lgsCountryToIso", () => {
  it("mapeia os países vistos no Spanish International U-18 2026", () => {
    expect(lgsCountryToIso("esp")).toBe("ES");
    expect(lgsCountryToIso("por")).toBe("PT");
    expect(lgsCountryToIso("nor")).toBe("NO");
    expect(lgsCountryToIso("swi")).toBe("CH");
    expect(lgsCountryToIso("swe")).toBe("SE");
    expect(lgsCountryToIso("bul")).toBe("BG");
    expect(lgsCountryToIso("cze")).toBe("CZ");
    expect(lgsCountryToIso("jap")).toBe("JP");
    expect(lgsCountryToIso("mor")).toBe("MA");
  });

  it("⚠ aus é ÁUSTRIA, não Austrália", () => {
    // Confirmado pelas licenças pseudo XX388AUS** (Csöngei, Großschädl,
    // Feuchter, Weißensteiner). "AU" punha bandeira australiana em austríacos.
    expect(lgsCountryToIso("aus")).toBe("AT");
  });

  it("dá código próprio a cada nação britânica", () => {
    expect(lgsCountryToIso("eng")).toBe("GB-ENG");
    expect(lgsCountryToIso("sco")).toBe("GB-SCT");
    expect(lgsCountryToIso("nir")).toBe("GB-NIR");
    expect(lgsCountryToIso("ire")).toBe("IE");   // Irlanda ≠ Irlanda do Norte
  });

  it("códigos identificados pelos nomes dos jogadores no corpus", () => {
    expect(lgsCountryToIso("net")).toBe("NL");   // Van der Lande, Dresselhuys
    expect(lgsCountryToIso("ice")).toBe("IS");   // Sigurbjorn Thorgeirsson
    expect(lgsCountryToIso("slk")).toBe("SK");   // Zustak, Bencik, Tomanka
    expect(lgsCountryToIso("lva")).toBe("LV");   // Spruzs
    expect(lgsCountryToIso("hon")).toBe("HK");   // Wong, Yang
    expect(lgsCountryToIso("cam")).toBeNull();   // ambíguo (Camboja/Camarões)
  });

  it("é indiferente a caixa e espaços", () => {
    expect(lgsCountryToIso(" POR ")).toBe("PT");
    expect(lgsCountryToIso("Esp")).toBe("ES");
  });

  it("devolve null a códigos desconhecidos (sem bandeira > bandeira errada)", () => {
    expect(lgsCountryToIso("zzz")).toBeNull();
    expect(lgsCountryToIso("")).toBeNull();
    expect(lgsCountryToIso(null)).toBeNull();
  });
});
