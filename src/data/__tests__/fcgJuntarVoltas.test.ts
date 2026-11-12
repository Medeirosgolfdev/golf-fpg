import { describe, it, expect } from "vitest";
import { juntarVoltasFcg, totaisAnteriores } from "../fcgVoltas";
import { adaptFcg, fcgToFPGTournament, type FCGDetail, type FCGPlayer } from "../fcgAdapter";
import { juntarJogosGolfdirecto } from "../rfeg/entries";
import type { RFEGIndexEntry } from "../rfeg/types";

const PAR = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4]; // 72
const tee = (color: string, metros: number) => ({
  color, gender: "M", lap: "lap18", rating: 70, slope: 130, par: 72,
  par1_18: PAR, hcp1_18: PAR.map((_, i) => i + 1), meters1_18: PAR.map(() => metros),
});
/** Um cartão com `extra` pancadas em relação ao par (negativo = abaixo do par). */
const cartao = (extra: number) => PAR.map((p, i) => p + (i < Math.abs(extra) ? Math.sign(extra) : 0));
const dia = (total: number, acc: number, pos: number) => ({
  day: { rankingPosition: pos, strokeNumber: total, onlyGross: total - 72 },
  acc: { rankingPosition: pos, strokeNumber: acc, onlyGross: acc - 72 },
});

function jogador(nome: string, lic: string | null, o: { cor: string; metros: number; gross: number; acc: number; pos: number; previous?: unknown[] }): FCGPlayer {
  return {
    _id: `id-${nome}`, firstName: nome, surname: "Teste", gender: "M", license: lic, country: "ESP",
    hcpExact: 5, hcpGame: 5, gameTeeColor: o.cor, isCardFinished: true, isCardClosed: true,
    teeTimeHour: null, teeTime: null, teeNumber: 1,
    view: dia(o.gross, o.acc, o.pos),
    previous: (o.previous ?? []) as never[],
    scorecard: { gameTee: tee(o.cor, o.metros), gross: cartao(o.gross - 72) },
  } as FCGPlayer;
}
const jogo = (id: string, nome: string, data: string, players: FCGPlayer[]): FCGDetail => ({
  gameId: id, fetchedAt: "2026-09-14T00:00:00Z",
  game: { _id: id, name: nome, scheduleStartDate: data, tournament: { _id: "T1", name: "Campeonato Teste", clientName: "Federación" } } as never,
  categories: [{ _id: "c1", name: "SCRATCH INFANTIL MASCULINO", gender: "M", players } as never],
});

// Ronda 1 (amarelas, 5000 m): Ana 74, Rui 80, Zé 90. Ronda 2 (azuis, 5600 m): Ana 70 (144), Rui 78 (158); o Zé não passou.
const r1 = jogo("g1", "Ronda 1", "2026-09-12T08:00:00Z", [
  jogador("Ana", "L1", { cor: "yellow", metros: 5000 / 18, gross: 74, acc: 74, pos: 1 }),
  jogador("Rui", "L2", { cor: "yellow", metros: 5000 / 18, gross: 80, acc: 80, pos: 2 }),
  jogador("Ze", "L3", { cor: "yellow", metros: 5000 / 18, gross: 90, acc: 90, pos: 3 }),
]);
const r2 = jogo("g2", "Ronda 2", "2026-09-13T08:00:00Z", [
  jogador("Ana", "L1", { cor: "blue", metros: 5600 / 18, gross: 70, acc: 144, pos: 1, previous: [dia(74, 74, 1), dia(70, 144, 1)] }),
  jogador("Rui", "L2", { cor: "blue", metros: 5600 / 18, gross: 78, acc: 158, pos: 2, previous: [dia(80, 80, 2)] }),
]);

describe("totaisAnteriores — os totais dos dias antes do jogo", () => {
  it("tira a volta do próprio jogo quando o golfdirecto a inclui em previous[]", () => {
    expect(totaisAnteriores(r2.categories[0].players[0])).toEqual([74]);
    expect(totaisAnteriores(r2.categories[0].players[1])).toEqual([80]);
    expect(totaisAnteriores(r1.categories[0].players[0])).toEqual([]);
  });
});

describe("juntarVoltasFcg — os jogos das voltas da mesma prova", () => {
  it("sem jogos anteriores devolve o mesmo objecto", () => {
    expect(juntarVoltasFcg(r2, [])).toBe(r2);
    expect(juntarVoltasFcg(r2, [null, undefined])).toBe(r2);
  });

  it("cada jogador ganha o cartão das voltas anteriores, com o tee desse dia", () => {
    const j = juntarVoltasFcg(r2, [r1]);
    const ana = j.categories[0].players[0];
    expect(ana.__voltas?.map((v) => v.round)).toEqual([1]);
    expect(ana.__voltas?.[0].gameTee?.color).toBe("yellow");
    expect(ana.__voltas?.[0].gross).toEqual(cartao(2));
  });

  it("quem só jogou a 1.ª volta entra no fim, marcado — ninguém desaparece", () => {
    const j = juntarVoltasFcg(r2, [r1]);
    const nomes = j.categories[0].players.map((p) => p.firstName);
    expect(nomes).toEqual(["Ana", "Rui", "Ze"]);
    expect(j.categories[0].players[2].__soAnteriores).toBe(true);
    // não altera os ficheiros originais (são os da cache)
    expect(r2.categories[0].players.length).toBe(2);
    expect(r2.categories[0].players[0].__voltas).toBeUndefined();
  });

  it("a classificação fica com os cartões das duas voltas e quem não passou sem lugar", () => {
    const t = fcgToFPGTournament(adaptFcg(juntarVoltasFcg(r2, [r1])))!;
    const por = (n: string) => t.players.find((p) => p.name.startsWith(n))!;
    const ana = por("Ana");
    expect(ana.roundScores?.map((r) => r.gross)).toEqual([74, 70]);
    expect(ana.roundScores?.[0].scores).toEqual(cartao(2));
    expect(ana.roundScores?.[1].scores).toEqual(cartao(-2));
    // a 1.ª volta foi das amarelas (5000 m), a 2.ª das azuis (5600 m)
    const m1 = Math.round((ana.roundScores?.[0].meters ?? []).reduce((s, x) => s + x, 0));
    const m2 = Math.round((ana.roundScores?.[1].meters ?? ana.meters ?? []).reduce((s: number, x: number) => s + x, 0));
    expect(m1).toBe(5000);
    expect(m2).toBe(5600);
    const ze = por("Ze");
    expect(ze.roundScores?.map((r) => r.gross)).toEqual([90]);
    expect(ze._wd).toBe(true);
  });

  it("sem os ficheiros anteriores tudo fica como antes (só o total da 1.ª volta)", () => {
    const t = fcgToFPGTournament(adaptFcg(r2))!;
    const ana = t.players.find((p) => p.name.startsWith("Ana"))!;
    expect(ana.roundScores?.map((r) => r.gross)).toEqual([74, 70]);
    expect((ana.roundScores?.[0].scores ?? []).some((s: number) => s > 0)).toBe(false);
    expect(t.players.length).toBe(2);
  });
});

describe("juntarJogosGolfdirecto — uma entrada por prova na /rfeg", () => {
  const e = (id: string, o: Partial<RFEGIndexEntry>): RFEGIndexEntry => ({
    source: "golfdirecto", id, filePath: `fcg/${id}.json`, name: "Campeonato Teste", year: 2026, category: "Infantil", sex: "Mixto",
    dateStart: null, dateEnd: null, dateStartIso: null, dateEndIso: null, course: null, ...o,
  } as RFEGIndexEntry);
  const plantel = ["ana", "rui", "ze", "eva", "tom", "noa"];

  it("fica o jogo com mais voltas, com os ficheiros e os ids dos anteriores e a data do início", () => {
    const lista = [
      e("g1", { tournamentId: "T1", nRounds: 1, dateStartIso: "2026-09-12", roster: plantel, leaderboardPlayers: 6 }),
      e("g2", { tournamentId: "T1", nRounds: 2, dateStartIso: "2026-09-13", roster: plantel.slice(0, 5), leaderboardPlayers: 5 }),
      e("x", { tournamentId: "T9", nRounds: 1, dateStartIso: "2026-09-13", roster: ["a", "b"] }),
    ];
    const r = juntarJogosGolfdirecto(lista);
    expect(r.map((t) => t.id)).toEqual(["g2", "x"]);
    expect(r[0]).toMatchObject({ dateStartIso: "2026-09-12", jogosAnteriores: ["fcg/g1.json"], idsAnteriores: ["g1"], leaderboardPlayers: 6 });
  });

  it("jogos da mesma prova que NÃO são voltas (mesmas voltas, outro plantel) ficam como estão", () => {
    const lista = [
      e("a", { tournamentId: "T1", nRounds: 1, dateStartIso: "2026-09-12", roster: plantel }),
      e("b", { tournamentId: "T1", nRounds: 1, dateStartIso: "2026-09-12", roster: ["x1", "x2", "x3"] }),
      e("c", { tournamentId: "T2", nRounds: 1, dateStartIso: "2026-09-12", roster: plantel }),
      e("d", { tournamentId: "T2", nRounds: 2, dateStartIso: "2026-09-13", roster: ["y1", "y2", "y3"] }),
    ];
    expect(juntarJogosGolfdirecto(lista)).toBe(lista);
  });

  it("não toca nas outras fontes nem em jogos sem prova", () => {
    const lista = [
      e("n1", { source: "nextcaddy", tournamentId: "T1", nRounds: 1, roster: plantel }),
      e("n2", { source: "nextcaddy", tournamentId: "T1", nRounds: 2, roster: plantel }),
      e("s1", { tournamentId: null, nRounds: 1, roster: plantel }),
      e("s2", { tournamentId: null, nRounds: 2, roster: plantel }),
    ];
    expect(juntarJogosGolfdirecto(lista)).toBe(lista);
  });
});
