import { describe, it, expect } from "vitest";
import { overlayFromRound, roundNumberOf } from "../overlay/fromRound";
import { countHoles } from "../overlay/shared";
import type { Player, Tournament } from "../../data/fpgTypes";

// Faldo Junior Tour Madeira 2026, R1 do Manuel (85, Brancas, Machico + Serras)
const par = [4, 4, 5, 3, 4, 4, 5, 3, 4, 5, 4, 4, 4, 3, 4, 4, 3, 5];
const si = [15, 13, 5, 11, 1, 7, 3, 17, 9, 2, 4, 14, 12, 8, 6, 16, 10, 18];
const meters = [352, 362, 476, 185, 368, 302, 460, 128, 310, 474, 326, 309, 279, 148, 338, 247, 122, 408];
const scores = [5, 4, 9, 3, 6, 4, 5, 4, 5, 6, 5, 5, 5, 3, 4, 4, 3, 5];

const player = {
  name: "Manuel Medeiros", grossTotal: 85, hcpExact: 6.4, _pos: 10,
  roundScores: [{ round: 1, gross: 85, scores, pars: par, si, meters, teeName: "White", courseRating: 71, slope: 137, date: "Fri, October 16" }],
} as unknown as Player;
const tourn = { name: "Boys 16 & Under", date: "2026-10-16", campo: "", players: [player], _roundLabel: "R2" } as unknown as Tournament;

describe("overlayFromRound", () => {
  it("monta os dados dos PNGs a partir da volta", () => {
    const d = overlayFromRound(tourn, player, 10.7, { event: "Faldo Junior Tour Madeira", course: "Santo da Serra | Machico Serras" })!;
    expect(d.event).toBe("Faldo Junior Tour Madeira");
    expect(d.courseName).toBe("Santo da Serra | Machico Serras");
    expect(d.teeName).toBe("White");
    expect(d.teeDist).toBe(5594);
    expect(d.scores).toEqual(scores);
    expect(d.si).toEqual(si);
    expect(d.cr).toBe(71);
    expect(d.courseHcp).toBe(7);   // 6.4 × 137/113 + (71 − 72) = 6.76
    expect(d.sd).toBe(10.7);
    expect(d.round).toBe(2);
    // data da ronda em texto livre → data do torneio + (volta − 1)
    expect(d.date).toBe("17 Out 2026");
    expect(d.position).toBe("10º");
  });

  it("sem CR/Slope há PNG na mesma, sem SD nem CH (USKids)", () => {
    const p = { ...player, roundScores: [{ ...player.roundScores![0], courseRating: undefined, slope: undefined }] } as Player;
    const d = overlayFromRound(tourn, p, 12.3)!;
    expect(d.scores).toEqual(scores);
    expect(d.sd).toBeNull();
    expect(d.courseHcp).toBeNull();
  });

  it("metros no lugar do SI (USKids) não passam por SI", () => {
    const p = { ...player, roundScores: [{ ...player.roundScores![0], si: meters }] } as Player;
    expect(overlayFromRound(tourn, p, null)!.si).toEqual([]);
  });

  it("data americana da USKids (M/D/AAAA)", () => {
    const t = { ...tourn, date: "12/28/2026", _roundLabel: "R2" } as unknown as Tournament;
    expect(overlayFromRound(t, player, null)!.date).toBe("29 Dez 2026");
  });

  it("volta por omissão = 1", () => {
    expect(roundNumberOf({ ...tourn, _roundLabel: "Resumo" } as Tournament)).toBe(1);
  });
});

describe("countHoles", () => {
  it("separa triplo (+3) de quádruplo ou pior (+4…)", () => {
    // R1 do Manuel no Faldo: 9 no par 5 (buraco 3) = quádruplo
    expect(countHoles(scores, par)).toEqual({ hio: 0, eagles: 0, birdies: 0, pars: 9, bogeys: 7, doubles: 1, triples: 0, quads: 1 });
    expect(countHoles([7, 4], [4, 4]).triples).toBe(1);
    expect(countHoles(scores, par, 0, 9).quads).toBe(1);
    expect(countHoles(scores, par, 9, 18).quads).toBe(0);
  });
});
