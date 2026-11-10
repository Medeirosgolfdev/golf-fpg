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

describe("buildClubesGrupos — equipa incompleta não passa à frente (10/11/2026, I9)", () => {
  // Clube Z só tem 1 cartão válido na R2 (precisa de 2): antes somava 70+71 na R1
  // e só 72 na R2 (213) e ficava em 1.º, à frente dos 290 do Clube Y.
  const t = { rounds: 2, players: [p("5", 70, 72), p("6", 71, 73), p("7", 70, 72), p("8", 71, 998)] } as unknown as Tournament;
  const grupos: GrupoEntry[] = [
    { grupo: "A", clube: "Clube Y", jogadores: ["5", "6"].map(f => ({ nome: `J${f}`, fed: f, hcp: 5 })) },
    { grupo: "B", clube: "Clube Z", jogadores: ["7", "8"].map(f => ({ nome: `J${f}`, fed: f, hcp: 5 })) },
  ];
  const m = buildClubesGrupos(grupos, t, { defaultBestN: 2 });
  it("sem N cartões numa volta: sem resultado nessa volta, sem total nem lugar", () => {
    const y = m.teams[0].cats[0], z = m.teams[1].cats[0];
    expect(z.rdTotals).toEqual([141, null]);
    expect([z.total, z.toPar, z.pos]).toEqual([null, null, null]);
    expect([y.total, y.pos, y.fieldSize]).toEqual([286, 1, 1]);
  });
  it("empates partilham o lugar (1, 1, 3)", () => {
    const t2 = { rounds: 1, players: [p("1", 70), p("2", 72), p("3", 71), p("4", 71), p("5", 80), p("6", 80)] } as unknown as Tournament;
    const g2: GrupoEntry[] = [["A", "1", "2"], ["B", "3", "4"], ["C", "5", "6"]].map(([grupo, a, b]) =>
      ({ grupo, clube: `Clube ${grupo}`, jogadores: [a, b].map(f => ({ nome: `J${f}`, fed: f, hcp: 5 })) }));
    expect(buildClubesGrupos(g2, t2, { defaultBestN: 2 }).teams.map(x => x.cats[0].pos)).toEqual([1, 1, 3]);
  });
  it("buraco por jogar (0) não conta como birdie", () => {
    const t3 = { rounds: 1, players: [{ fedCode: "1", name: "1", parTotal: 8,
      roundScores: [{ round: 1, gross: 9, scores: [4, 0, 5], pars: [4, 4, 4] }] }] } as unknown as Tournament;
    const g3: GrupoEntry[] = [{ grupo: "A", clube: "X", jogadores: [{ nome: "J1", fed: "1", hcp: 5 }] }];
    expect(buildClubesGrupos(g3, t3, { defaultBestN: 1 }).teams[0].cats[0].players[0].rds[0].bpb).toEqual({ bir: 0, par: 1, bog: 1 });
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
