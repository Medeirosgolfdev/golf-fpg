// A idade lida na fonte (GolfGenius «14 AGE») mostra-se como lida na data da prova;
// longe dessa data cai na estimativa do ano.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { birthCells } from "../BirthCells";

const b = { birthYearEst: 2011, birthYearEstMax: 2012, estNote: "GolfGenius: 14 anos a 17/11/2026", idadeLida: { idade: 14, data: "2026-11-17" } };
const txt = (n: React.ReactNode) => renderToStaticMarkup(<>{n}</>).replace(/<[^>]+>/g, "");

describe("birthCells — idade lida", () => {
  it("na prova: 14a lido, ano a vermelho", () => {
    const c = birthCells(b, "2026-11-19");
    expect(txt(c.idade)).toBe("14a");
    expect(txt(c.nasc)).toBe("2011–12");
    expect(c.tip).toContain("14 anos a 17/11/2026");
  });
  it("um ano depois: volta à estimativa", () => {
    expect(txt(birthCells(b, "2027-12-01").idade)).toBe("~15–16a");
  });
  it("a data de nascimento ganha", () => {
    expect(txt(birthCells({ ...b, dob: "2012-05-29" }, "2026-11-19").idade)).toBe("14a");
  });
});
