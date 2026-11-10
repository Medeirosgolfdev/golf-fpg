import { describe, it, expect } from "vitest";
import { DIAS_DRAW_ESTIMADO, initialTabIndex, provaAindaDecorre } from "../detailTabs";

describe("provaAindaDecorre — até quando vale o «Draw estimado» (10/11/2026)", () => {
  it("no dia e nos dias da prova, decorre", () => {
    expect(provaAindaDecorre("2026-09-12", 2, "2026-09-12")).toBe(true);
    expect(provaAindaDecorre("2026-09-12", 2, "2026-09-13")).toBe(true);
  });
  it("com a folga, ainda decorre; no dia seguinte já não", () => {
    // 2 voltas: último dia previsto 13/09; folga de DIAS_DRAW_ESTIMADO dias.
    expect(DIAS_DRAW_ESTIMADO).toBe(7);
    expect(provaAindaDecorre("2026-09-12", 2, "2026-09-20")).toBe(true);
    expect(provaAindaDecorre("2026-09-12", 2, "2026-09-21")).toBe(false);
  });
  it("Taça João Salazar de Sousa (12/09/2026), vista dois meses depois: não", () => {
    expect(provaAindaDecorre("2026-09-12", 2, "2026-11-10")).toBe(false);
  });
  it("lê a data DD/MM/AAAA da FPG", () => {
    expect(provaAindaDecorre("07/11/2026", 2, "2026-11-10")).toBe(true);
  });
  it("sem data legível não se estima", () => {
    expect(provaAindaDecorre("", 3, "2026-11-10")).toBe(false);
    expect(provaAindaDecorre(null, 3, "2026-11-10")).toBe(false);
  });
});

describe("initialTabIndex — a aba que abre", () => {
  const tabs = [{ key: "admissions" }, { key: "round:0" }, { key: "resumo" }, { key: "scout" }];
  it("a do URL ganha; senão a pedida pela página; senão a fase mais avançada", () => {
    expect(initialTabIndex(tabs, "scout", "resumo", 1)).toBe(3);
    expect(initialTabIndex(tabs, null, "resumo", 1)).toBe(2);
    expect(initialTabIndex(tabs, "nao-existe", undefined, 1)).toBe(1);
  });
});
