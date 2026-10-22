import { describe, it, expect } from "vitest";
import { escalaoCanon, escaloesCanon, escalaoSex, sortEscaloes, escalaoFilterOptions } from "../escalao";

describe("escalaoCanon — sinónimos de Sub N", () => {
  it.each([
    ["Sub 10", "Sub 10"], ["Sub-10", "Sub 10"], ["sub10", "Sub 10"], ["S10", "Sub 10"], ["U10", "Sub 10"],
    ["U-12", "Sub 12"], ["Under 12 Boys", "Sub 12"], ["Boys U14", "Sub 14"], ["Girls U9", "Sub 9"],
    ["10 and Under", "Sub 10"], ["Boys 8 & Under", "Sub 8"], ["Boys 7&U", "Sub 7"], ["Girls 8U", "Sub 8"],
    ["6/Under", "Sub 6"], ["Boys 16 & Under", "Sub 16"], ["Sub-10 (Poucet)", "Sub 10"], ["Sub-21 (Junior)", "Sub 21"],
    ["  Sub   14  ", "Sub 14"], ["SUB 18", "Sub 18"], ["Sub 25", "Sub 25"],
  ])("%s → %s", (raw, canon) => expect(escalaoCanon(raw)).toBe(canon));
});

describe("escalaoCanon — nomes de categoria", () => {
  it("os que valem em qualquer fonte", () => {
    expect(escalaoCanon("Benjamín")).toBe("Sub 10");
    expect(escalaoCanon("Benjamim")).toBe("Sub 10");
    expect(escalaoCanon("Alevín")).toBe("Sub 12");
    expect(escalaoCanon("ALEVIN")).toBe("Sub 12");
    expect(escalaoCanon("Infantil")).toBe("Sub 14");
    expect(escalaoCanon("Cadete")).toBe("Sub 16");
    expect(escalaoCanon("Poussin")).toBe("Sub 12");
    expect(escalaoCanon("Minime")).toBe("Sub 16");
  });
  it("os que mudam de país para país só com a fonte", () => {
    expect(escalaoCanon("Benjamin", "ffg")).toBe("Sub 14");
    expect(escalaoCanon("Benjamin", "es")).toBe("Sub 10");
    expect(escalaoCanon("Junior", "es")).toBe("Sub 18");
    expect(escalaoCanon("Junior", "ffg")).toBe("Sub 21");
    expect(escalaoCanon("Juvenil", "es")).toBe("Sub 21");
    expect(escalaoCanon("Junior")).toBe("Júnior");
    expect(escalaoCanon("Benjamin")).toBe("Benjamin");
  });
});

describe("escalaoCanon — idades, adultos e o que não se reconhece", () => {
  it("idade única e intervalos (USKids, MAJOR, México)", () => {
    expect(escalaoCanon("Boys 10")).toBe("10 anos");
    expect(escalaoCanon("Girls 13-14")).toBe("13-14 anos");
    expect(escalaoCanon("9-11 Boys")).toBe("9-11 anos");
    expect(escalaoCanon("11 & 12")).toBe("11-12 anos");
    expect(escalaoCanon("Boys 14-15 Division")).toBe("14-15 anos");
    expect(escalaoCanon("Varonil 10-11")).toBe("10-11 anos");
    expect(escalaoCanon("Femenil 15")).toBe("15 anos");
  });
  it("adultos", () => {
    expect(escalaoCanon("Absoluto")).toBe("Absoluto");
    expect(escalaoCanon("All Ages")).toBe("Absoluto");
    expect(escalaoCanon("Sénior")).toBe("Seniores");
    expect(escalaoCanon("Seniores")).toBe("Seniores");
    expect(escalaoCanon("MidAm")).toBe("Mid-Amateur");
    expect(escalaoCanon("Mid-Amateur")).toBe("Mid-Amateur");
    expect(escalaoCanon("Adultos")).toBe("Adultos");
  });
  it("não se inventa: o desconhecido fica como veio; vazio/—/Todos → nada", () => {
    expect(escalaoCanon("Escalão A")).toBe("Escalão A");
    expect(escalaoCanon("Junior 9 Buracos")).toBe("Junior 9 Buracos");
    expect(escalaoCanon("Reid Trophy")).toBe("Reid Trophy");
    expect(escalaoCanon("Boys")).toBe("Boys");
    for (const x of ["", "  ", "—", "-", "Todos", null, undefined]) expect(escalaoCanon(x)).toBeNull();
  });
});

describe("escaloesCanon — dois escalões num nome", () => {
  it.each([
    ["U18 & U16", ["Sub 16", "Sub 18"]], ["U21&U16", ["Sub 16", "Sub 21"]], ["U21 & U16", ["Sub 16", "Sub 21"]],
    ["Sub 21 & U16", ["Sub 16", "Sub 21"]], ["Sub 10 e 12", ["Sub 10", "Sub 12"]], ["Sub 10/12", ["Sub 10", "Sub 12"]],
    ["Sub 14 a 24", ["Sub 14", "Sub 24"]],
  ])("%s → %j", (raw, list) => expect(escaloesCanon(raw)).toEqual(list));
});

describe("escalaoSex, ordem e opções do filtro", () => {
  it("sexo do nome", () => {
    expect(escalaoSex("Boys 10")).toBe("M");
    expect(escalaoSex("Under 12 Girls")).toBe("F");
    expect(escalaoSex("Varonil 15")).toBe("M");
    expect(escalaoSex("Raparigas")).toBe("F");
    expect(escalaoSex("Sub 12")).toBeNull();
  });
  it("Sub N pela idade, depois idades, adultos e o resto", () => {
    expect(sortEscaloes(["Absoluto", "Escalão A", "10 anos", "Sub 14", "Sub 8", "9-10 anos"]))
      .toEqual(["Sub 8", "Sub 14", "9-10 anos", "10 anos", "Absoluto", "Escalão A"]);
  });
  it("as três grafias da /FPG dão uma opção só", () => {
    expect(escalaoFilterOptions(["Sub 10", "Sub-10", "U10", "", "U18 & U16", "Sub 16"]))
      .toEqual(["Sub 10", "Sub 16", "Sub 18"]);
  });
});
