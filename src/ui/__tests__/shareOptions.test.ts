import { describe, it, expect } from "vitest";
import { shareOptionsForRound, shareOptionsForTournament } from "../overlay/shareOptions";
import type { Player, Tournament } from "../../data/fpgTypes";

const par = Array(18).fill(4);
const card = (g: number) => { const s = Array(18).fill(4); s[0] += g - 72; return s; };
const pl = (name: string, fed: string, scoreId: string, gross: number) => ({
  name, fed, scoreId, grossTotal: gross,
  roundScores: [{ round: 1, gross, scores: card(gross), pars: par, courseRating: 70, slope: 120 }],
}) as unknown as Player;
const round = (n: number, players: Player[]) =>
  ({ name: "Torneio X", date: "2026-10-03", campo: "Santo da Serra", players, _roundLabel: `R${n}` }) as unknown as Tournament;

// A FPG dá um scoreId DIFERENTE a cada volta do mesmo jogador.
const r1 = round(1, [pl("Manuel Medeiros", "52884", "a1", 78), pl("Ricardo Camacho", "111", "b1", 74)]);
const r2 = round(2, [pl("Manuel Medeiros", "52884", "a2", 72), pl("Ricardo Camacho", "111", "b2", 78)]);

describe("shareOptions", () => {
  it("uma volta: ordenada pela classificação, Manuel por omissão", () => {
    const o = shareOptionsForRound(r1);
    expect(o.options.map((x) => x.label)).toEqual(["1º · Ricardo Camacho — 74", "2º · Manuel Medeiros — 78"]);
    expect(o.defaultKey).toBe("a1");
  });

  it("torneio completo: junta as voltas pelo federado e classifica pelo total", () => {
    const o = shareOptionsForTournament([r1, r2]);
    expect(o.options.map((x) => x.label)).toEqual([
      "Torneio · 1º · Manuel Medeiros — 78+72 = 150",
      "Torneio · 2º · Ricardo Camacho — 74+78 = 152",
    ]);
    const m = o.options.find((x) => x.key === o.defaultKey)!;
    expect(m.data.rounds?.map((r) => [r.round, r.gross, r.toPar])).toEqual([[1, 78, 6], [2, 72, 0]]);
    expect(m.data.position).toBe("1º");
    expect(m.data.date).toBe("3 Out – 4 Out 2026");
  });
});
