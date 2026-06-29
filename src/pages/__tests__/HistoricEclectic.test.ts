/**
 * HistoricEclectic.test.ts
 *
 * Testes da linha ecléctica ("ringer score") da tab Scorecards
 * (HistoricScorecardsTab). buildEclectic calcula, para cada jogador, o melhor
 * resultado em cada buraco ao longo das voltas da edição, somado.
 */
import { describe, it, expect } from "vitest";
import { buildEclectic } from "../kids/HistoricScorecardsTab";

/** Edição 18H par-72 com par uniforme 4 por buraco. */
function ed18(over: Partial<Record<string, unknown>> = {}) {
  return {
    holesPerRound: 18,
    is9: false,
    par: Array(18).fill(4),
    parPerRound: 72,
    parF9: 36,
    parB9: 36,
    ...over,
  } as any;
}

describe("buildEclectic", () => {
  it("soma o melhor de cada buraco nas 3 voltas (caso real William Lorberbaum)", () => {
    const pl = {
      rounds: [
        { gross: 82, strokes: [5, 3, 5, 4, 3, 5, 4, 6, 4, 4, 4, 5, 4, 4, 4, 4, 4, 6] },
        { gross: 85, strokes: [7, 4, 5, 5, 3, 5, 5, 6, 5, 5, 5, 4, 3, 5, 4, 6, 5, 5] },
        { gross: 77, strokes: [5, 3, 5, 5, 3, 6, 4, 3, 4, 3, 3, 4, 4, 7, 3, 4, 4, 7] },
      ],
    } as any;
    const e = buildEclectic(pl, ed18());
    expect(e.total).toBe(69);
    expect(e.out).toBe(36);
    expect(e.inn).toBe(33);
    expect(e.toPar).toBe(-3);
    expect(e.bestRound).toBe(77);
    expect(e.delta).toBe(8); // 77 − 69 deixadas na mesa
  });

  it("Δ = 0 quando uma só volta contém todos os melhores buracos", () => {
    const pl = {
      rounds: [
        { gross: 72, strokes: Array(18).fill(4) },          // par em todos
        { gross: 90, strokes: Array(18).fill(5) },          // pior em todos
      ],
    } as any;
    const e = buildEclectic(pl, ed18());
    expect(e.total).toBe(72);
    expect(e.bestRound).toBe(72);
    expect(e.delta).toBe(0);
  });

  it("ecléctico nunca é pior que a melhor volta real", () => {
    const pl = {
      rounds: [
        { gross: 80, strokes: [4, 5, 4, 5, 4, 5, 4, 5, 4, 4, 5, 4, 5, 4, 5, 4, 5, 4] },
        { gross: 80, strokes: [5, 4, 5, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 5, 4, 5] },
      ],
    } as any;
    const e = buildEclectic(pl, ed18());
    expect(e.total).toBeLessThanOrEqual(e.bestRound);
    expect(e.best.every((h: number) => h === 4)).toBe(true); // melhor de cada = 4
    expect(e.total).toBe(72);
    expect(e.delta).toBe(8);
  });

  it("9 buracos: só conta o front e In fica 0", () => {
    const pl = {
      rounds: [
        { gross: 38, strokes: [4, 5, 4, 5, 4, 5, 4, 5, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
        { gross: 40, strokes: [5, 4, 5, 4, 5, 4, 5, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      ],
    } as any;
    const ed = ed18({ holesPerRound: 9, is9: true, par: Array(9).fill(4), parPerRound: 36, parF9: 36, parB9: 0 });
    const e = buildEclectic(pl, ed);
    expect(e.inn).toBe(0);
    expect(e.out).toBe(e.total);
    // melhor de cada buraco: 4,4,4,4,4,4,4,4,2 = 34
    expect(e.total).toBe(34);
    expect(e.bestRound).toBe(38);
    expect(e.delta).toBe(4);
  });
});
