import { describe, it, expect } from "vitest";
import { extraTidFamilia, extraTidAno, extraTidEscalao, extraTidEscalaoNome } from "../extraTid";

describe("extraTid — família, ano e escalão dos torneios de fora", () => {
  it("família: FCG e JWGC não são «WJGC»", () => {
    expect(extraTidFamilia("wjgc-brjgt251_boys_12-13")).toBe("WJGC");
    expect(extraTidFamilia("wjgc26")).toBe("WJGC");
    expect(extraTidFamilia("wjgc-fcg268_boys_11-12")).toBe("FCG");
    expect(extraTidFamilia("wjgc-jwgc261_boys_11-12")).toBe("JWGC");
    expect(extraTidFamilia("doral25_b1011")).toBe("Doral");
    expect(extraTidFamilia("eowagr-eowagr25_contest109")).toBe("EOWAGR");
    expect(extraTidFamilia("usk21080_b11")).toBeNull();
  });

  it("ano: a data do canónico manda; sem ela, só o ano escrito no código", () => {
    expect(extraTidAno("wjgc-brjgt243_boys_10-11", "2024-02-20")).toBe(2024);
    expect(extraTidAno("wjgc-brjgt2537_boys_10-11", "2026-02-25")).toBe(2026); // 2537 não é 2025
    expect(extraTidAno("wjgc-brjgt243_boys_10-11")).toBeNull(); // nunca o ano corrente
    expect(extraTidAno("wjgc-wjgc_2025_b1011")).toBe(2025);
    expect(extraTidAno("wjgc26_1213")).toBe(2026);
    expect(extraTidAno("doral20_b89")).toBe(2020);
    expect(extraTidAno("eowagr-eowagr25_contest77", "")).toBe(2025);
  });

  it("escalão: formato longo, compacto e sem letra", () => {
    expect(extraTidEscalao("wjgc-brjgt243_boys_10-11")).toBe("Boys 10-11");
    expect(extraTidEscalao("wjgc-fcg268_girls_9-10")).toBe("Girls 9-10");
    expect(extraTidEscalao("wjgc-brjgt251_boys_7under")).toBe("Boys U7");
    expect(extraTidEscalao("wjgc-brjgt251_boys_wagr")).toBe("Boys 13-18");
    expect(extraTidEscalao("doral25_b1011")).toBe("Boys 10-11");
    expect(extraTidEscalao("doral25_b89")).toBe("Boys 8-9");
    expect(extraTidEscalao("eowagr25_b910")).toBe("Boys 9-10");
    expect(extraTidEscalao("wjgc26_1213")).toBe("Boys 12-13");
    expect(extraTidEscalao("wjgc26")).toBe("Boys 10-11");
    expect(extraTidEscalao("wjgc-wjgc_2025_b1011")).toBe("Boys 10-11"); // não apanha o ano
  });

  it("escalão: sem escalão no código, o rótulo do flight ou o fim do nome", () => {
    expect(extraTidEscalao("eowagr25", "Boys 11-12 LTQ")).toBe("Boys 11-12");
    expect(extraTidEscalao("eowagr-eowagr25_contest109", "Girls 7-8 LTQ")).toBe("Girls 7-8");
    expect(extraTidEscalao("eowagr-eowagr25_contest17", "Geral", "European Open WAGR - 6/Under LTQ")).toBe("U6");
    expect(extraTidEscalao("doral18", "Geral")).toBe("Geral");
    expect(extraTidEscalao("doral18")).toBe("Geral");
  });

  it("nome a mostrar: a divisão WAGR pelo nome", () => {
    expect(extraTidEscalaoNome("wjgc-brjgt251_boys_wagr")).toBe("Boys WAGR");
    expect(extraTidEscalaoNome("doral25_gwagr")).toBe("Girls WAGR");
    expect(extraTidEscalaoNome("wjgc-brjgt251_boys_12-13")).toBe("Boys 12-13");
  });
});
