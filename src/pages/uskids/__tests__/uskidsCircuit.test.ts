import { describe, it, expect } from "vitest";
import { idadesEscalao, matchEscalaoDiv, scoutEscaloes } from "../uskidsCircuit";
import type { CircuitDivision, CircuitEntry } from "../../../ui/circuit/types";
import type { Tournament } from "../../../data/fpgTypes";

const res = { players: [] } as unknown as Tournament;
const div = (nome: string, comResultados = true): CircuitDivision =>
  ({ key: nome, escalao: nome, results: comResultados ? res : undefined });
const entry = (id: string, year: number): CircuitEntry => ({ id, year, name: `Rome Classic ${year}` });

describe("idadesEscalao", () => {
  it("lê idade única, faixa e «& Under»", () => {
    expect(idadesEscalao("Boys 12")).toEqual([12, 12]);
    expect(idadesEscalao("Boys 13-14")).toEqual([13, 14]);
    expect(idadesEscalao("Boys 7 & Under")).toEqual([0, 7]);
  });
});

describe("matchEscalaoDiv — Edições anteriores no mesmo escalão", () => {
  it("nome igual, senão sexo + idade; nunca ±1 ano nem a grelha «Todos»", () => {
    const divs = [div("Todos"), div("Boys 11"), div("Girls 12")];
    divs[0].key = "todos";
    expect(matchEscalaoDiv(divs, "Boys 11")?.key).toBe("Boys 11");
    expect(matchEscalaoDiv(divs, "Boys 12")).toBeNull();
    expect(matchEscalaoDiv(divs, "Girls 12")?.key).toBe("Girls 12");
  });
});

describe("scoutEscaloes — o escalão de onde cada um vem (idade − anos)", () => {
  const cur = entry("2026", 2026);
  const eds = [div("Boys 10"), div("Boys 11"), div("Boys 12"), div("Boys 13-14"), div("Girls 11"), div("Boys 9", false)];
  it("Boys 12 de 2026 ↔ Boys 11 de 2025 e Boys 10 de 2024", () => {
    expect(scoutEscaloes(cur, "Boys 12", entry("2025", 2025), eds).map(d => d.key)).toEqual(["Boys 11"]);
    expect(scoutEscaloes(cur, "Boys 12", entry("2024", 2024), eds).map(d => d.key)).toEqual(["Boys 10"]);
  });
  it("faixas apanham os dois de onde vêm; a própria edição e as futuras ficam de fora", () => {
    expect(scoutEscaloes(cur, "Boys 13-14", entry("2025", 2025), eds).map(d => d.key)).toEqual(["Boys 12", "Boys 13-14"]);
    expect(scoutEscaloes(cur, "Boys 12", cur, eds)).toEqual([]);
    expect(scoutEscaloes(cur, "Boys 12", entry("2027", 2027), eds)).toEqual([]);
  });
  it("só escalões com resultados", () => {
    expect(scoutEscaloes(cur, "Boys 12", entry("2023", 2023), eds)).toEqual([]);
  });
});
