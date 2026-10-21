/**
 * KIDSdataLoader.test.ts
 *
 * Testes para as funções core do loader de rivais internacionais.
 *
 * O KIDSdataLoader só lê os canónicos do agregador (`juniors.json` +
 * `juniors-tournaments-*.json` + `tournament-catalog.json`). As antigas
 * process* (e os 7 grupos de testes saltados) saíram a 21/10/2026 — a
 * identidade e o merge das fontes vivem em scripts/aggregator/.
 */
import { describe, it, expect } from "vitest";
import { normName, co } from "../../data/KIDSdataLoader";

/* ═══════════════════════════════════════════
   normName — normalização de nomes
   ═══════════════════════════════════════════ */
describe("normName", () => {
  it("lowercase e trim", () => {
    expect(normName("  Manuel Medeiros  ")).toBe("manuel medeiros");
  });

  it("colapsa espaços múltiplos", () => {
    expect(normName("Manuel   Francisco   Medeiros")).toBe("manuel francisco medeiros");
  });

  it("remove diacríticos", () => {
    expect(normName("José André Gonçalves")).toBe("jose andre goncalves");
  });

  it("normaliza nomes iguais com acentos diferentes", () => {
    expect(normName("João")).toBe(normName("Joao"));
    expect(normName("Zürich")).toBe(normName("Zurich"));
  });

  it("string vazia", () => {
    expect(normName("")).toBe("");
    expect(normName("   ")).toBe("");
  });

  it("hífens são tratados como espaços (Castro-Ferreira ≡ Castro Ferreira)", () => {
    expect(normName("Ricardo Castro-Ferreira")).toBe(normName("Ricardo Castro Ferreira"));
    expect(normName("RICARDO CASTRO-FERREIRA")).toBe(normName("Ricardo Castro Ferreira"));
    expect(normName("Marie-Claire Dubois")).toBe(normName("Marie Claire Dubois"));
  });

  it("apóstrofes e pontos são tratados como espaços", () => {
    expect(normName("D'Souza")).toBe(normName("D Souza"));
    expect(normName("O'Neill")).toBe(normName("O Neill"));
    expect(normName("Jr.")).toBe("jr");
  });
});

/* ═══════════════════════════════════════════
   co — conversão de código de país
   ═══════════════════════════════════════════ */
describe("co", () => {
  it("converte código ISO para nome completo", () => {
    expect(co("PT")).toBe("Portugal");
    expect(co("US")).toBe("USA");
    expect(co("GB")).toBe("United Kingdom");
  });

  it("case-insensitive", () => {
    expect(co("pt")).toBe("Portugal");
    expect(co("Pt")).toBe("Portugal"); // falls to toUpperCase
  });

  it("suporta variantes (UK = GB)", () => {
    expect(co("UK")).toBe("United Kingdom");
  });

  it("retorna o input original se não mapeado", () => {
    expect(co("XYZ")).toBe("XYZ");
  });

  it("trata strings vazias e null-ish", () => {
    expect(co("")).toBe("");
    expect(co(null as unknown as string)).toBe("");
    expect(co(undefined as unknown as string)).toBe("");
  });

  // ─── Deduplicação cross-source: USKids ISO-2 vs BlueGolf PT vs FPG ───
  it("dedup'a Russia (RU vs Russian Federation vs Federação Russa)", () => {
    expect(co("RU")).toBe(co("Russian Federation"));
    expect(co("RU")).toBe(co("Federação Russa"));
    expect(co("RU")).toBe("Russia");
  });

  it("dedup'a Vietnam (VN vs Viet Nam vs Vietname vs Vietnã)", () => {
    expect(co("VN")).toBe(co("Vietname"));
    expect(co("VN")).toBe(co("Vietnã"));
    expect(co("VN")).toBe("Vietnam");
  });

  it("dedup'a France (FR vs França vs Franca)", () => {
    expect(co("FR")).toBe(co("França"));
    expect(co("FR")).toBe(co("Franca"));
    expect(co("FR")).toBe("France");
  });

  it("dedup'a UK (GB vs UK vs England vs Inglaterra vs Reino Unido)", () => {
    expect(co("GB")).toBe(co("UK"));
    expect(co("GB")).toBe(co("England"));
    expect(co("GB")).toBe(co("Inglaterra"));
    expect(co("GB")).toBe(co("Reino Unido"));
    expect(co("GB")).toBe("United Kingdom");
  });

  it("dedup'a Estonia (PT-PT Estónia vs PT-BR Estônia vs Estonia)", () => {
    expect(co("EE")).toBe(co("Estónia"));
    expect(co("EE")).toBe(co("Estônia"));
    expect(co("EE")).toBe("Estonia");
  });
});
