import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { escClassOf } from "../PillBadge";
import { birthCells, escDoAno } from "../BirthCells";
import BirthPill from "../BirthPill";

describe("Nasc./Idade com a cor do escalão (02/11/2026)", () => {
  it("escalão pelo ano civil, à data da prova", () => {
    expect(escDoAno(2014, "2026-10-30")).toBe("Sub 12");
    expect(escDoAno(2013, "2026-10-30")).toBe("Sub 14");
    expect(escDoAno(2008, "2026-10-30")).toBe("Sub 18");
    expect(escDoAno(null, "2026-10-30")).toBeNull();
    expect(escDoAno(2014, null)).toBeNull();
  });
  it("a cor é a do EscPill (também termos da RFEG e «Sénior»)", () => {
    expect(escClassOf("Sub 12")).toBe("p-sub12");
    expect(escClassOf("Alevín")).toBe("p-sub12");
    expect(escClassOf("Sénior")).toBe("p-senior");
    expect(escClassOf("TGF")).toBeNull();
  });
  it("outras grafias pela tabela única: U12/Under 14/Boys U16; ímpares com a cor de cima (04/11/2026)", () => {
    expect(escClassOf("U12")).toBe("p-sub12");
    expect(escClassOf("Under 14")).toBe("p-sub14");
    expect(escClassOf("Boys U16")).toBe("p-sub16");
    expect(escClassOf("U15")).toBe("p-sub16");
    expect(escClassOf("U18")).toBe("p-sub18");
    expect(escClassOf("Sub 25")).toBe("p-sub24");
    expect(escClassOf("Seniores")).toBe("p-senior");
    expect(escClassOf("U30")).toBeNull();
    expect(escClassOf("Boys 12")).toBe("p-sub12");
    expect(escClassOf("Girls 11")).toBe("p-sub12");
    expect(escClassOf("Boys 13-14")).toBe("p-sub14");
    expect(escClassOf("Boys 7 & Under")).toBe("p-sub10");
    expect(escClassOf("Boys 15-18")).toBe("p-sub18");
    expect(renderToStaticMarkup(<BirthPill esc="Sub 14">2013</BirthPill>)).toContain("p-sub14");
    expect(renderToStaticMarkup(<BirthPill>2013</BirthPill>)).toContain("p-muted");
  });
  it("birthCells: ano e idade lidos pintados; estimativa continua a vermelho", () => {
    const lido = birthCells({ birthYear: 2014 }, "2026-10-30");
    expect(renderToStaticMarkup(<>{lido.nasc}{lido.idade}</>).match(/p-sub12/g)).toHaveLength(2);
    expect(renderToStaticMarkup(<>{lido.nasc}</>)).not.toContain("p-ano1");
    // 1.º ano do Sub 12 (2015 em 2026): claro com contorno — diferente do 2.º ano
    const ano1 = birthCells({ birthYear: 2015 }, "2026-10-30");
    expect(renderToStaticMarkup(<>{ano1.nasc}{ano1.idade}</>).match(/p-sub12 p-ano1/g)).toHaveLength(2);
    const est = birthCells({ birthYearEst: 2014 }, "2026-10-30");
    expect(renderToStaticMarkup(<>{est.nasc}</>)).toContain("est-value");
  });
});
