import { describe, it, expect } from "vitest";
import { sexOf, countryIsoOf, dobIso, playerIdentity, enrichPlayerIdentity } from "../identity";

describe("sexOf", () => {
  it("as grafias das fontes", () => {
    for (const m of ["M", "m", "Male", "Masculino", "H", "Boys", "Garçons"]) expect(sexOf(m)).toBe("M");
    for (const f of ["F", "Female", "Feminino", "Girls", "Filles", "Dames", "W"]) expect(sexOf(f)).toBe("F");
    for (const x of ["", null, undefined, "Mixed", "X"]) expect(sexOf(x)).toBeNull();
  });
});

describe("countryIsoOf", () => {
  it("nome, ISO-2, ISO-3/COI → ISO-2 em maiúsculas", () => {
    expect(countryIsoOf("Portugal")).toBe("PT");
    expect(countryIsoOf("POR")).toBe("PT");
    expect(countryIsoOf("prt")).toBe("PT");
    expect(countryIsoOf("pt")).toBe("PT");
    expect(countryIsoOf("Spain")).toBe("ES");
    expect(countryIsoOf("ES")).toBe("ES");
    expect(countryIsoOf("United States")).toBe("US");
    expect(countryIsoOf("SUI")).toBe("CH");
    expect(countryIsoOf("GB-ENG")).toBe("GB-ENG");
  });
  it("placeholders e desconhecidos → null (não se adivinha)", () => {
    for (const x of ["", "NN", "XX", "?", "-", null, "Atlantis"]) expect(countryIsoOf(x)).toBeNull();
  });
});

describe("dobIso", () => {
  it("ISO, DD/MM/AAAA, DD-MM-AAAA", () => {
    expect(dobIso("2014-04-29")).toBe("2014-04-29");
    expect(dobIso("2014-04-29T00:00:00")).toBe("2014-04-29");
    expect(dobIso("29/04/2014")).toBe("2014-04-29");
    expect(dobIso("9-4-2014")).toBe("2014-04-09");
    expect(dobIso("2014")).toBeNull();
    expect(dobIso(null)).toBeNull();
  });
});

describe("playerIdentity", () => {
  it("lê os campos que cada conversor já grava", () => {
    expect(playerIdentity({ name: "A", _sex: "F", country: "Spain", dob: "01/02/2013", escalao: "Alevín" }))
      .toEqual({ sex: "F", countryIso: "ES", dob: "2013-02-01", birthYear: 2013, escalao: "Sub 12" });
    expect(playerIdentity({ name: "B", sex: "M", nat: "POR", birthYear: 2014, escalao: "Sub-12" }))
      .toEqual({ sex: "M", countryIso: "PT", dob: null, birthYear: 2014, escalao: "Sub 12" });
  });
  it("a linha manda; depois a base por federado; depois a divisão", () => {
    const byFed = { "52884": { sex: "M", dob: "2014-04-29", country: "Portugal", escalao: "Sub 12" } };
    expect(playerIdentity({ name: "Manuel", fed: "52884" }, { byFed, sex: "F", escalao: "Sub 14" }))
      .toEqual({ sex: "M", countryIso: "PT", dob: "2014-04-29", birthYear: 2014, escalao: "Sub 12" });
    expect(playerIdentity({ name: "Z" }, { sex: "F", escalao: "U14", country: "FR" }))
      .toEqual({ sex: "F", countryIso: "FR", dob: null, birthYear: null, escalao: "Sub 14" });
  });
  it("nada inventado: ano estimado e «Mixed» não contam", () => {
    expect(playerIdentity({ name: "C", birthYearEst: 2012 }, { sex: "Mixed" }))
      .toEqual({ sex: null, countryIso: null, dob: null, birthYear: null, escalao: null });
  });
  it("escalão ambíguo com a fonte", () => {
    expect(playerIdentity({ name: "D", escalao: "Benjamin" }, { escalaoSource: "ffg" }).escalao).toBe("Sub 14");
  });
});

describe("enrichPlayerIdentity", () => {
  it("objectos novos com `identity`; os originais ficam intactos", () => {
    const ps = [{ name: "A", country: "PT" }];
    const out = enrichPlayerIdentity(ps);
    expect(out[0]).not.toBe(ps[0]);
    expect("identity" in ps[0]).toBe(false);
    expect(out[0].identity.countryIso).toBe("PT");
    expect(out[0].name).toBe("A");
  });
});
