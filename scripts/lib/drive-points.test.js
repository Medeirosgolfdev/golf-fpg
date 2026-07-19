/**
 * Regras de pontuação do ranking Drive, ancoradas em valores OFICIAIS
 * observados no RankingsClassifLST (ver scrape-drive-rankings.js).
 */
import { describe, it, expect } from "vitest";
import {
  drivePoints, finalPoints, sharedPoints, isFinalEvent, isNacionalFinal, FINAL_WEIGHT,
} from "./drive-points.cjs";

describe("drivePoints", () => {
  it("usa a tabela Challenge por omissão e a Tour no 8º lugar", () => {
    expect(drivePoints(8, "challenge")).toBe(35);
    expect(drivePoints(8, "tour")).toBe(38);
    expect(drivePoints(1, "challenge")).toBe(250);
  });

  it("posições fora da tabela e entradas inválidas valem 0", () => {
    expect(drivePoints(99, "challenge")).toBe(0);
    expect(drivePoints("NS", "challenge")).toBe(0);
    expect(drivePoints(null)).toBe(0);
  });
});

describe("finalPoints (Final regional a ×1.5)", () => {
  // Valores lidos do ranking final oficial RFDC_26M18G (Madeira Sub 18).
  it.each([
    [1, 375],
    [2, 248],  // 247,5 arredondado
    [3, 141],
    [4, 113],  // 112,5 arredondado
  ])("%iº lugar vale %i pontos", (pos, pts) => {
    expect(finalPoints(pos, "challenge")).toBe(pts);
  });

  it("o peso é 1.5", () => {
    expect(FINAL_WEIGHT).toBe(1.5);
  });
});

describe("sharedPoints (empate não desfeito pelo countback)", () => {
  it("dois empatados no 14º recebem 22,5 cada — como no oficial", () => {
    expect(sharedPoints(14, 2, "challenge")).toBe(22.5);
  });

  it("sem empate é igual à tabela", () => {
    expect(sharedPoints(14, 1, "challenge")).toBe(23);
  });

  it("três empatados dividem os três lugares ocupados", () => {
    // 14º+15º+16º = 23+22+21 = 66 → 22 cada
    expect(sharedPoints(14, 3, "challenge")).toBe(22);
  });
});

describe("classificação de Finais", () => {
  it("reconhece Finais regionais e nacionais", () => {
    expect(isFinalEvent("Final Drive Challenge Madeira-Palheiro-Sub 18")).toBe(true);
    expect(isFinalEvent("Final Nacional Drive Challenge 2025")).toBe(true);
    expect(isFinalEvent("7º Torneio Drive Challenge Norte-Qtª Barca -Sub 12")).toBe(false);
  });

  it("distingue a Final NACIONAL, que não entra em ranking regional nenhum", () => {
    expect(isNacionalFinal("Final Nacional Drive Challenge 2025")).toBe(true);
    expect(isNacionalFinal("Final Drive Challenge Madeira-Palheiro-Sub 18")).toBe(false);
  });
});
