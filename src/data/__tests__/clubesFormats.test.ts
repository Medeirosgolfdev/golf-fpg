import { describe, it, expect } from "vitest";
import {
  autoGruposByClub, diaPoints, diaPendentes, playerRows, matchPlayToPlayers,
  clubesIndividualTournament, selectClubesList, isClubesMatchPlay,
} from "../clubesFormats";
import type { Tournament, Player } from "../fpgTypes";
import type { MatchPlayData, MpDia } from "../clubesMatchplayTypes";

function mkT(p: Partial<Tournament> & { name: string; ccode: string; tcode: string }): Tournament {
  return { date: "2026-06-20", campo: "Palheiro", players: [], playerCount: 0, ...p } as Tournament;
}
const mkP = (name: string, club: string, extra: Partial<Player> = {}): Player =>
  ({ scoreId: name, name, club, pos: 1, grossTotal: 80, toPar: 8, ...extra }) as Player;

describe("autoGruposByClub", () => {
  it("agrupa por clube, letras por ordem alfabética de clube, HCP exacto → de jogo → 0", () => {
    const t = mkT({ name: "Nacional de Clubes", ccode: "000", tcode: "10912", players: [
      mkP("Ana", "Vidago", { fedCode: "1", hcpExact: 5.2 }),
      mkP("Bruno", "Aroeira", { fedCode: "2", hcpPlay: 7 }),
      mkP("Carla", "Aroeira", { fedCode: "3" }),
    ] });
    const g = autoGruposByClub(t);
    expect(g.map(x => [x.grupo, x.clube, x.jogadores.length])).toEqual([["A", "Aroeira", 2], ["B", "Vidago", 1]]);
    expect(g[0].jogadores.map(j => j.hcp)).toEqual([7, 0]);
    expect(g[1].jogadores[0]).toEqual({ nome: "Ana", fed: "1", hcp: 5.2 });
  });

  it("letras oficiais do sorteio (teamLetters) ganham às alfabéticas", () => {
    const t = mkT({ name: "X", ccode: "1", tcode: "1", teamLetters: { Aroeira: "C", Vidago: "A" },
      players: [mkP("Ana", "Vidago"), mkP("Bruno", "Aroeira")] });
    expect(autoGruposByClub(t).map(x => `${x.grupo}:${x.clube}`)).toEqual(["A:Vidago", "C:Aroeira"]);
  });

  it("pré-jogo: usa os inscritos sem as reservas; sem torneio → []", () => {
    const t = mkT({ name: "X", ccode: "1", tcode: "1", _admissions: { players: [
      { pos: 1, fed: "9", nome: "Rui", clube: "CGSS", hcp: 3, vac: null, dataInscricao: null, status: "confirmed" },
      { pos: 2, fed: "8", nome: "Zé", clube: "CGSS", hcp: 9, vac: null, dataInscricao: null, status: "reserva" },
    ] } });
    expect(autoGruposByClub(t)).toEqual([{ grupo: "A", clube: "CGSS", jogadores: [{ nome: "Rui", fed: "9", hcp: 3 }] }]);
    expect(autoGruposByClub(null)).toEqual([]);
  });
});

describe("match play 3-way", () => {
  const dia: MpDia = {
    dia: 2,
    subtotal: { cgss: 9 },
    matches: [
      { match: 1, cgss: 1, pal: 0.5, players: { cgss: { name: "Manuel Medeiros", fed: "52884" }, pal: { name: "P1" } },
        h2h: [{ w: "cgss", l: "pal", margin: "2&1" }] },
      { match: 2, players: { cgss: { name: "Rui" }, pal: { name: "P2" } } },
    ],
  };

  it("diaPoints soma os pontos dos confrontos; sem pontos usa o subtotal", () => {
    expect(diaPoints(dia, "cgss")).toBe(1);
    expect(diaPoints({ dia: 1, subtotal: { cgss: 3 }, matches: [{ match: 1 }] }, "cgss")).toBe(3);
  });

  it("diaPendentes conta os confrontos sem resultado", () => {
    expect(diaPendentes(dia)).toBe(1);
  });

  it("playerRows: uma linha por jogador, confronto por publicar fica pendente", () => {
    const rows = playerRows((dia.matches ?? []).map(m => ({ ...m, _dia: 2 })), "cgss");
    expect(rows.map(r => r.key)).toEqual(["52884", "n:rui"]);
    expect(rows[0].pts).toBe(1);
    expect(rows[0].byOpp.get("pal")).toEqual([{ won: true, half: false, margin: "2&1" }]);
    expect(rows[1].byOpp.get("pal")?.[0].pending).toBe(true);
  });

  it("matchPlayToPlayers junta os dias do mesmo jogador e mede a volta pelo par", () => {
    const par = Array(18).fill(4);
    const sc = (v: number, n = 18) => Array.from({ length: 18 }, (_, i) => (i < n ? v : null));
    const mp: MatchPlayData = {
      clubs: [{ key: "cgss", name: "CGSS", shortName: "CGSS" }, { key: "pal", name: "Palheiro", shortName: "PAL" }],
      course: { par },
      categories: [{ key: "J", label: "Juniores", dias: [
        { dia: 1, subtotal: {}, matches: [{ match: 1, players: { cgss: { name: "Manuel", fed: "52884", scores: sc(4) }, pal: { name: "P", scores: sc(5, 16) } } }] },
        { dia: 2, subtotal: {}, matches: [{ match: 1, players: { cgss: { name: "Manuel", fed: "52884", scores: sc(5) } } }] },
      ] }],
    };
    const ps = matchPlayToPlayers(mp);
    const m = ps.find(p => p.fedCode === "52884")!;
    expect(m.roundScores?.map(r => r.gross)).toEqual([72, 90]);
    expect(m.toPar).toBe(18);
    const p = ps.find(x => x.name === "P")!;
    expect(p.nholes).toBe(18);
    expect(p.toPar).toBeNull();
  });

  it("clubesIndividualTournament põe o Dia 1 como Draw R1 só nos torneios de match play", () => {
    const mp: MatchPlayData = {
      clubs: [{ key: "cgss", name: "CGSS", shortName: "CGSS" }], categories: [],
      dia1: { modalidade: "Match Play", groups: { H: [{ teeTime: "09:10", players: [{ name: "Rui", club: "cgss" }] }] } },
    };
    const t = clubesIndividualTournament(mkT({ name: "Regional de Clubes", ccode: "059", tcode: "10685", matchPlayResults: mp }));
    expect(t._draws?.["1"].groups?.[0].players[0]).toMatchObject({ nome: "Rui", clube: "CGSS" });
    const outro = clubesIndividualTournament(mkT({ name: "Outro", ccode: "1", tcode: "1", matchPlayResults: mp }));
    expect(outro._draws).toEqual({});
    expect(isClubesMatchPlay({ ccode: "059", tcode: "10685" })).toBe(true);
  });
});

describe("selectClubesList", () => {
  it("★Manuel também pelos confrontos do match play; ordena por ano desc e escalão", () => {
    const mp: MatchPlayData = { clubs: [], categories: [{ key: "J", label: "J", dias: [
      { dia: 1, subtotal: {}, matches: [{ match: 1, players: { cgss: { name: "Manuel Medeiros", fed: "52884" } } }] }] }] };
    const ts = [
      mkT({ name: "A", ccode: "1", tcode: "1", _clubesYear: "2024", _clubesEsc: "sub14", players: [mkP("Manuel Medeiros", "CGSS", { fed: "52884", fedCode: "52884" })] }),
      mkT({ name: "B", ccode: "1", tcode: "2", _clubesYear: "2026", _clubesEsc: "sub18" }),
      mkT({ name: "C", ccode: "059", tcode: "10685", _clubesYear: "2026", _clubesEsc: "midam", matchPlayResults: mp }),
    ];
    const opts = { filterManuel: false, yearFilter: null, searchTerm: "" };
    expect(selectClubesList(ts, opts).map(t => t.name)).toEqual(["C", "B", "A"]);
    expect(selectClubesList(ts, { ...opts, filterManuel: true }).map(t => t.name)).toEqual(["C", "A"]);
    expect(selectClubesList(ts, { ...opts, yearFilter: "2024" }).map(t => t.name)).toEqual(["A"]);
  });
});
