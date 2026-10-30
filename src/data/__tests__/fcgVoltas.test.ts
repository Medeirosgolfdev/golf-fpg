/**
 * golfdirecto, prova de várias voltas: o jogo «Ronda 2» só traz o cartão da
 * volta do jogo; as anteriores vêm em `previous[]` só com o total do dia.
 */
import { describe, it, expect } from "vitest";
import { adaptFcg, fcgToFPGTournament, type FCGDetail } from "../fcgAdapter";

const tee = { color: "yellow", par1_18: Array(18).fill(4), hcp1_18: Array.from({ length: 18 }, (_, i) => i + 1), meters1_18: Array(18).fill(300) };
const dia = (n: number | null) => ({ day: { strokeNumber: n ?? undefined } });
const jogador = (nome: string, prev: (number | null)[], gross: (number | null)[], acc: number, extra = {}) => ({
  _id: nome, firstName: nome, surname: "X", gender: "M", license: "VB0" + nome.length, country: "ESP",
  hcpExact: 3, isCardFinished: true, isCardClosed: true,
  view: { day: {}, acc: { strokeNumber: acc, onlyGross: acc - 72 * (prev.filter((g) => g != null).length + (gross.some((g) => g != null) ? 1 : 0)), rankingPosition: 1 } },
  previous: prev.map(dia),
  scorecard: { gameTee: tee, gross },
  ...extra,
});

function torneio(players: unknown[]) {
  const d = {
    gameId: "g1", fetchedAt: "2026-07-03T20:00:00Z",
    game: { _id: "g1", name: "Ronda 2", status: "finished", scheduleStartDate: "2026-07-03T07:00:00Z", scheduleEndDate: null, pointMode: "strokePlay", tournament: { _id: "t", name: "I PUNTUABLE ZONAL", clientName: "Federación Vasca de Golf" }, club: null, course: { name: "BASOZABAL" } },
    categories: [{ _id: "c1", name: "CADETE MASCULINO", gender: "M", players }],
  } as unknown as FCGDetail;
  return fcgToFPGTournament(adaptFcg(d))!;
}

describe("golfdirecto — voltas anteriores", () => {
  it("R1 do previous (só total) + R2 com cartão", () => {
    const t = torneio([jogador("JAIME", [75], Array(18).fill(4).map((x, i) => (i < 2 ? 5 : x)), 149)]);
    const p = t.players[0];
    expect(t.rounds).toBe(2);
    expect(p.roundScores!.map((r) => [r.round, r.gross])).toEqual([[1, 75], [2, 74]]);
    expect(p.grossTotal).toBe(149);
  });

  it("previous que já inclui a volta do jogo (soma = acumulado) não a duplica", () => {
    const p = torneio([jogador("XIM", [69], Array(18).fill(4).map((x, i) => (i < 3 ? 3 : x)), 69)]).players[0];
    expect(p.roundScores!.map((r) => r.gross)).toEqual([69]);
  });

  it("quem desistiu (volta sem total) fica com menos voltas e WD", () => {
    const t = torneio([
      jogador("TELMO", [75], Array(18).fill(4).map((x, i) => (i === 0 ? 5 : x)), 148),
      jogador("TOMAS", [51, null], Array(18).fill(null), 51),
    ]);
    const tomas = t.players.find((p) => p.name.startsWith("Tomas"))!;
    expect(tomas.roundScores!.map((r) => r.gross)).toEqual([51]);
    expect((tomas as unknown as { _wd: boolean })._wd).toBe(true);
  });
});
