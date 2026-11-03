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
    expect(renderToStaticMarkup(<BirthPill esc="Sub 14">2013</BirthPill>)).toContain("p-sub14");
    expect(renderToStaticMarkup(<BirthPill>2013</BirthPill>)).toContain("p-muted");
  });
  it("birthCells: ano e idade lidos pintados; estimativa continua a vermelho", () => {
    const lido = birthCells({ birthYear: 2014 }, "2026-10-30");
    expect(renderToStaticMarkup(<>{lido.nasc}{lido.idade}</>).match(/p-sub12/g)).toHaveLength(2);
    const est = birthCells({ birthYearEst: 2014 }, "2026-10-30");
    expect(renderToStaticMarkup(<>{est.nasc}</>)).toContain("est-value");
  });
});
