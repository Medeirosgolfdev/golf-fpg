import { describe, it, expect } from "vitest";
import lgs216Raw from "../../../public/data/rfegolf-livegolfscoring/216.json?raw";
import { lgsFillFromClassification } from "../rfeg/adapters";
import type { LgsDetail } from "../rfeg/types";

const real216 = () => JSON.parse(lgs216Raw) as LgsDetail;

describe("lgsFillFromClassification", () => {
  it("Benjamín Masculino 2023 (LGS 216): as voltas sem total recebem o resultado da classificação", () => {
    const lgs = real216();
    expect(lgs.rounds[0].players.every((p) => p.total == null)).toBe(true);
    const out = lgsFillFromClassification(lgs);
    const enzo = out.rounds.map((r) => r.players.find((p) => p.memberId === "20863")?.total);
    expect(enzo).toEqual([38, 44, 40]);
    expect(out.rounds[0].players.filter((p) => p.total != null).length).toBeGreaterThan(60);
  });

  it("não mexe em quem já tem total, em voltas a meio nem em «sem cartão»", () => {
    const lgs: LgsDetail = {
      id: 1, ok: true, scrapedAt: "", meta: { name: "x", course: null, dateRange: null, rounds: [] },
      rounds: [{ round: 1, label: "R1", par: null, players: [
        { memberId: "a", pos: 1, name: "A", toPar: 0, hoy: 0, scores: null, halves: null, total: 72 },
        { memberId: "b", pos: 2, name: "B", toPar: 0, hoy: 0, scores: null, halves: null, total: null, partialGross: 30 } as never,
        { memberId: "c", pos: 3, name: "C", toPar: 0, hoy: 0, scores: null, halves: null, total: null },
      ] }],
      classification: [
        { memberId: "a", name: "A", roundTotals: [99] },
        { memberId: "b", name: "B", roundTotals: [70] },
        { memberId: "c", name: "C", roundTotals: [999] },
      ],
    };
    const out = lgsFillFromClassification(lgs);
    expect(out.rounds[0].players.map((p) => p.total)).toEqual([72, null, null]);
    expect(out).toBe(lgs);
  });
});

describe("LGS benjamins (9 buracos) sem par nas voltas", () => {
  it("usa os 9 buracos e o par do campo, e não calcula SD com o CR de 18 buracos", async () => {
    const { lgsToFPGTournament } = await import("../rfeg/toTournament");
    const lgs = lgsFillFromClassification(real216());
    const t = lgsToFPGTournament(lgs as never);
    const enzo = t.players.find((p) => /Enzo/i.test(p.name))!;
    const r1 = enzo.roundScores?.find((r) => r.round === 1) ?? enzo.roundScores?.[0];
    expect(r1?.gross).toBe(38);
    const card = r1 as unknown as { par?: number[]; courseRating?: number; sd?: number | null };
    expect(card.courseRating ?? null).toBeNull();
    expect(card.sd ?? null).toBeNull();
    const json = JSON.stringify(t);
    expect(json).not.toContain("67.2");
  });
});
