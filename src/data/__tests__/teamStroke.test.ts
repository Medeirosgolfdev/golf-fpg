import { describe, it, expect } from "vitest";
import { buildClubesGrupos, buildDriveEquipas } from "../teamStroke";
import type { Tournament, GrupoEntry } from "../fpgTypes";

const rs = (round: number, gross: number) => ({ round, gross, scores: [], pars: [] });
const p = (fed: string, ...gross: number[]) => ({ fedCode: fed, name: fed, parTotal: 72, roundScores: gross.map((g, i) => rs(i + 1, g)) });

describe("buildClubesGrupos — melhores N por volta (as contas do antigo ClubesGruposView)", () => {
  const t = { rounds: 2, players: [p("1", 80, 78), p("2", 75, 999), p("3", 90, 70), p("4", 85, 85), p("5", 70, 72), p("6", 71, 73)] } as unknown as Tournament;
  const grupos: GrupoEntry[] = [
    { grupo: "A", clube: "Clube X", jogadores: ["1", "2", "3", "4"].map(f => ({ nome: `J${f}`, fed: f, hcp: 5 })) },
    { grupo: "B", clube: "Clube Y", jogadores: ["5", "6"].map(f => ({ nome: `J${f}`, fed: f, hcp: 5 })) },
  ];
  const m = buildClubesGrupos(grupos, t, { defaultBestN: 2 });
  it("total = soma dos 2 melhores de cada volta; 999 = sem cartão", () => {
    const a = m.teams[0].cats[0];
    expect(a.rdTotals).toEqual([75 + 80, 70 + 78]);
    expect(a.total).toBe(303);
    expect(a.toPar).toBe(303 - 72 * 4);
    expect(m.teams[0].cats[0].players.find(x => x.fed === "2")!.rds[1].gross).toBeNull();
  });
  it("lugar com o menor total; marca quem conta", () => {
    expect(m.teams[1].cats[0].pos).toBe(1);
    expect(m.teams[0].cats[0].pos).toBe(2);
    const j4 = m.teams[0].cats[0].players.find(x => x.fed === "4")!;
    expect(j4.conta).toBe(false);
  });
});

describe("buildDriveEquipas — regiões pelo ±par do PDF", () => {
  it("mantém lugar, ±par, buracos e «conta» de cada jogador", () => {
    const m = buildDriveEquipas({ nome: "Final", data: "2026-10-11", regra: "10 melhores", fonte: "x", equipas: [
      { pos: 1, regiao: "Sul", toPar: 12, jogadores: [{ nome: "A", gross: null, toPar: -2, buracos: 9, conta: true }] },
    ] } as never);
    const c = m.teams[0].cats[0];
    expect([c.pos, c.toPar, m.rankBy]).toEqual([1, 12, "toPar"]);
    expect(c.players[0]).toMatchObject({ holes: 9, conta: true, rds: [{ gross: null, toPar: -2, counts: true }] });
  });
});
