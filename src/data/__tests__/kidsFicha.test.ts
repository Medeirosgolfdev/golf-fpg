// A ficha do Kids 2 de uma linha: o federado decide antes do nome. Na Grand
// Final Faldo 2026 o «Santiago Dias» federado 42908 (Oporto) perdia para um
// Santiago Dias brasileiro do USKids, que entrou primeiro no mapa por nome.
import { describe, it, expect } from "vitest";
import { buildKidsLinkMap } from "../../hooks/useKidsLinkMap";
import { fichaDoKids } from "../kidsFicha";

const roster = [
  { id: "u610461", canonicalName: "Santiago Dias", aliases: [], memberId: "610461", pais: "BR" },
  { id: "f42908", canonicalName: "Santiago Dias", aliases: ["Santiago DIAS"], fed: "42908", pais: "PT", sexo: "M" as const },
  { id: "f54907", canonicalName: "Manuel Medeiros", aliases: [], fed: "54907", pais: "PT" },
];

describe("fichaDoKids", () => {
  const m = buildKidsLinkMap(roster);

  it("pelo federado, mesmo quando o nome é de um homónimo", () => {
    expect(fichaDoKids(m, { nome: "Santiago Dias", fed: "42908" })?.id).toBe("f42908");
  });
  it("sem federado, fica o do mapa por nome (como antes)", () => {
    expect(fichaDoKids(m, { nome: "Santiago Dias" })?.id).toBe("u610461");
  });
  it("um homónimo com OUTRO federado não conta", () => {
    expect(fichaDoKids(m, { nome: "Manuel Medeiros", fed: "52884" })).toBeUndefined();
  });
  it("o juniorId continua a ganhar a tudo", () => {
    expect(fichaDoKids(m, { nome: "Santiago Dias", fed: "42908", juniorId: "u610461" })?.id).toBe("u610461");
  });
});
