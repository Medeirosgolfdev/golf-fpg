import { describe, it, expect } from "vitest";
import { buildRepeaters } from "../repeaters";
import type { PastEdition, PastEditionPlayer } from "../PastEditionsTable";

const pl = (name: string, total: number, full = 2): PastEditionPlayer =>
  ({ pos: null, name, total, toPar: total - 144, rounds: [], holesPlayed: 36, fullRounds: full });
const ed = (id: string, year: number, players: PastEditionPlayer[]): PastEdition =>
  ({ id, year, division: "Boys 12", nRounds: 2, parPerRound: 72, players });

describe("buildRepeaters — «Quem repete» genérico", () => {
  const eds = [
    ed("2026", 2026, [pl("Ana Silva", 150)]),
    ed("2025", 2025, [pl("Manuel Medeiros", 150), pl("Silva, João", 155), pl("Rui Costa", 160, 1)]),
    ed("2024", 2024, [pl("João Silva", 148), pl("Manuel Medeiros", 152)]),
  ];
  const r = buildRepeaters([{ name: "João Silva" }, { name: "Rui Costa" }, { name: "Novo Nome" }, { name: "Manuel Medeiros" }], eds, "2026");

  it("ignora a edição de hoje e quem nunca jogou", () => {
    expect(r.editions.map((e) => e.id)).toEqual(["2025", "2024"]);
    expect(r.rows.map((x) => x.name)).not.toContain("Novo Nome");
    expect(r.fieldSize).toBe(4);
  });

  it("casa nomes invertidos e conta os confrontos com o Manuel", () => {
    const j = r.rows.find((x) => x.name === "João Silva")!;
    expect(j.n).toBe(2);
    expect(j.byEd["2025"].pos).toBe(2);
    expect(j.bestPos).toBe(1);
    expect(j.vsManuel).toEqual([1, 1]);
  });

  it("quem não acabou não conta para melhor lugar nem confrontos", () => {
    const rc = r.rows.find((x) => x.name === "Rui Costa")!;
    expect(rc.byEd["2025"].complete).toBe(false);
    expect(rc.bestPos).toBeNull();
    expect(rc.vsManuel).toBeNull();
  });
});
