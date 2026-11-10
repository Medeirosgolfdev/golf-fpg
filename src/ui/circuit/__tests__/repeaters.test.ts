import { describe, it, expect } from "vitest";
import { buildRepeaters, editionPlaces, fieldIsManuel } from "../repeaters";
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

describe("buildRepeaters — homónimos e federados (10/11/2026)", () => {
  // Torneio de Aniversário Estela: dois «Pedro Aires», federados 4939 e 42068.
  const eds = [
    ed("2025", 2025, [
      { ...pl("AIRES, Pedro", 146), fed: "4939" },
      { ...pl("Pedro Aires", 190), fed: "42068" },
      { ...pl("Manuel Medeiros", 150), fed: "52884" },
      { ...pl("Manuel Medeiros", 170), fed: "54907" },
    ]),
  ];
  const field = [
    { name: "Pedro Aires", fed: "4939" },
    { name: "Pedro Aires", fed: "42068" },
    { name: "Pedro Aires", fed: "11111" },
    { name: "Manuel Medeiros", fed: "54907" },
  ];
  const r = buildRepeaters(field, eds);

  it("cada homónimo fica com o SEU resultado", () => {
    const a = r.rows.find((x) => x.key === "f:4939")!;
    const b = r.rows.find((x) => x.key === "f:42068")!;
    expect(a.byEd["2025"].total).toBe(146);
    expect(b.byEd["2025"].total).toBe(190);
  });

  it("um terceiro homónimo (outro federado) não herda nenhum", () => {
    expect(r.rows.find((x) => x.key === "f:11111")).toBeUndefined();
    expect(r.fieldSize).toBe(4);
  });

  it("o pai (54907) não é o Manuel, e mede-se contra o Manuel (52884)", () => {
    const pai = r.rows.find((x) => x.key === "f:54907")!;
    expect(pai.isManuel).toBe(false);
    expect(pai.byEd["2025"].total).toBe(170);
    expect(pai.vsManuel).toEqual([1, 0]);
  });

  it("fieldIsManuel: federado FPG manda; uma licença de fora deixa decidir o nome", () => {
    expect(fieldIsManuel({ name: "Manuel Medeiros", fed: "52884" })).toBe(true);
    expect(fieldIsManuel({ name: "Manuel Medeiros", fed: "54907" })).toBe(false);
    expect(fieldIsManuel({ name: "Manuel Medeiros", fed: "CMA8989869" })).toBe(true);
    expect(fieldIsManuel({ name: "Manuel Medeiros" })).toBe(true);
  });
});

describe("editionPlaces — o lugar é do jogador, com empates", () => {
  it("dois 1.ºs e a seguir o 3.º; quem não acabou fica sem lugar", () => {
    const e = ed("2025", 2025, [pl("A", 140), pl("B", 140), pl("C", 150), pl("D", 70, 1)]);
    const lug = editionPlaces(e);
    expect(e.players.map((p) => lug.get(p) ?? null)).toEqual([1, 1, 3, null]);
  });
  it("o lugar oficial da fonte ganha", () => {
    const e = ed("2025", 2025, [{ ...pl("A", 140), pos: 1 }, { ...pl("B", 140), pos: 2 }]);
    const lug = editionPlaces(e);
    expect(e.players.map((p) => lug.get(p))).toEqual([1, 2]);
  });
});
