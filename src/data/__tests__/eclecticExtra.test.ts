import { describe, it, expect } from "vitest";
import { recomputeECForAllCourses, type CourseData, type RoundData, type HoleScores, type EclecticEntry } from "../playerDataLoader";

const p = [5, 4, 4, 4, 3, 4, 3, 5, 4, 4, 4, 3, 4, 5, 4, 3, 5, 4];
const ronda = (scoreId: string, extra: boolean): RoundData =>
  ({ scoreId, holeCount: 18, tee: "Boys 12", teeKey: "boys12", date: "22-11-2026", _isExtra: extra } as unknown as RoundData);

function correr(rounds: RoundData[], holes: Record<string, HoleScores>, extrasSeSozinhas?: boolean) {
  const data = [{ course: "The San Roque Club - Old Course", count: rounds.length, rounds } as unknown as CourseData];
  const ec: Record<string, EclecticEntry[]> = {};
  const ecdet: Record<string, Record<string, EclecticEntry>> = {};
  recomputeECForAllCourses(data, holes, ec, ecdet, { extrasSeSozinhas });
  return Object.values(ec)[0] || [];
}

describe("eclético com voltas Extra (vista Campos)", () => {
  const soExtras = {
    a: { g: p.map(x => x + 1), p } as unknown as HoleScores,
    b: { g: p.map((x, i) => (i === 0 ? x - 1 : x + 2)), p } as unknown as HoleScores,
  };

  it("por omissão as Extra ficam de fora (campo não entra na vista Ecléticos)", () => {
    expect(correr([ronda("a", true), ronda("b", true)], soExtras)).toHaveLength(0);
  });

  it("na vista Campos, campo só com Extra tem tabela tipo eclético (San Roque, 52884)", () => {
    const ec = correr([ronda("a", true), ronda("b", true)], soExtras, true);
    expect(ec).toHaveLength(1);
    expect(ec[0].holes[0].best).toBe(4);
    expect(ec[0].holes[1].best).toBe(5);
  });

  it("com voltas normais, as Extra continuam de fora mesmo na vista Campos", () => {
    const holes = {
      n: { g: p.map(x => x + 1), p } as unknown as HoleScores,
      x: { g: p.map(() => 1), p } as unknown as HoleScores,
    };
    const ec = correr([ronda("n", false), ronda("x", true)], holes, true);
    expect(ec[0].holes[0].best).toBe(6);
  });
});
