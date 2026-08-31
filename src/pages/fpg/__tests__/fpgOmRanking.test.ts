/**
 * omLevelOf — classificador de nível da Ordem de Mérito do CGSS.
 *
 * Blinda o padrão da série "Nº Torneio CGSS OM NOS" (Nível C) contra os OUTROS
 * torneios do clube que também têm "NOS" no nome: o "Torneio NOS Empresas"
 * (Nível B) e a variante júnior de 9 buracos (não conta). Os nomes usados aqui
 * são os REAIS dos pull-torneios (ccode 007).
 */
import { describe, it, expect } from "vitest";
import { omLevelOf } from "../fpgOmRanking";
import type { Tournament } from "../../../data/fpgTypes";

const t = (name: string, ccode = "007") => ({ name, ccode } as unknown as Tournament);

describe("omLevelOf — série CGSS OM NOS (Nível C)", () => {
  it.each([
    "8º Torneio CGSS OM NOS 2026",
    "2º Torneio CGSS OM NOS",
    "11º Torneio CGSS OM NOS",
    "X Torneio CGSS OM NOS",
    "XIII Torneio CGSS OM NOS",
    "4º Torneio CGSS / OM NOS", // a barra aparece numa das edições
  ])("%s → C", (name) => {
    expect(omLevelOf(t(name))).toBe("C");
  });
});

describe("omLevelOf — não confundir com o NOS Empresas", () => {
  it.each([
    "Torneio NOS EMPRESAS CGSS 2026",
    "Torneio NOS Empresas",
    "Torneio NOS Empresas 2022",
    "Torneio NOS Empresas 2025",
  ])("%s → B (é o major de empresas, não a série OM NOS)", (name) => {
    expect(omLevelOf(t(name))).toBe("B");
  });

  it("a variante júnior de 9 buracos não conta", () => {
    expect(omLevelOf(t("Torneio NOS Empresas Junior 9 Buracos 2026"))).toBeNull();
  });
});

describe("omLevelOf — guardas", () => {
  it("só CGSS: o mesmo nome noutro clube não conta", () => {
    expect(omLevelOf(t("8º Torneio CGSS OM NOS 2026", "000"))).toBeNull();
  });

  it("aceita o ccode sem zeros à esquerda", () => {
    expect(omLevelOf(t("8º Torneio CGSS OM NOS 2026", "7"))).toBe("C");
  });

  it("um torneio fora do regulamento não conta", () => {
    expect(omLevelOf(t("Torneio de Golfe CALHETA VIVA 2026"))).toBeNull();
  });

  it("os níveis A/B continuam a funcionar", () => {
    expect(omLevelOf(t("TORNEIO DA RESTAURAÇÃO CGSS 2026"))).toBe("A");
    expect(omLevelOf(t("Taça do Clube CGSS"))).toBe("A");
    expect(omLevelOf(t("Torneio de Inverno CGSS"))).toBe("C");
  });
});
