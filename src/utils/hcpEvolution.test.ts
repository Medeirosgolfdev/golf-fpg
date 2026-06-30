import { describe, it, expect } from "vitest";
import { computeEvoMetrics, pointsInWindow } from "./hcpEvolution";
import type { HcpPoint } from "../data/hcpHistoryLoader";

const DAY = 86400000;
const now = Date.now();
const ago = (days: number): number => now - days * DAY;

describe("pointsInWindow", () => {
  it("devolve [] para histórico vazio/indefinido", () => {
    expect(pointsInWindow(undefined, 0)).toEqual([]);
    expect(pointsInWindow([], 0)).toEqual([]);
  });

  it("filtra pela janela e ordena ascendente por data", () => {
    const pts: HcpPoint[] = [
      { d: ago(10), h: 20 },
      { d: ago(400), h: 30 }, // fora de 12 meses
      { d: ago(100), h: 25 },
    ];
    const cutoff = ago(366);
    const w = pointsInWindow(pts, cutoff);
    expect(w.map(p => p.h)).toEqual([25, 20]); // 100d antes, depois 10d; o de 400d cai
  });

  it("cutoff=0 mantém tudo (mas ordenado)", () => {
    const pts: HcpPoint[] = [{ d: ago(5), h: 18 }, { d: ago(50), h: 22 }];
    expect(pointsInWindow(pts, 0).map(p => p.h)).toEqual([22, 18]);
  });
});

describe("computeEvoMetrics", () => {
  it("devolve null com menos de 2 pontos na janela", () => {
    expect(computeEvoMetrics([{ d: ago(5), h: 18 }], 0)).toBeNull();
    expect(computeEvoMetrics([{ d: ago(400), h: 18 }, { d: ago(420), h: 19 }], ago(366))).toBeNull();
  });

  it("calcula início, fim, delta, melhor e pior", () => {
    const pts: HcpPoint[] = [
      { d: ago(300), h: 30 },
      { d: ago(200), h: 24 },
      { d: ago(100), h: 28 },
      { d: ago(10), h: 22 },
    ];
    const m = computeEvoMetrics(pts, 0)!;
    expect(m.nPts).toBe(4);
    expect(m.start).toBe(30);
    expect(m.end).toBe(22);
    expect(m.delta).toBe(-8); // melhorou 8 pontos
    expect(m.best).toBe(22);
    expect(m.worst).toBe(30);
  });

  it("declive negativo quando o HCP desce (jogador a melhorar)", () => {
    const pts: HcpPoint[] = [
      { d: ago(90), h: 30 },
      { d: ago(60), h: 27 },
      { d: ago(30), h: 24 },
      { d: ago(1), h: 21 },
    ];
    const m = computeEvoMetrics(pts, 0)!;
    expect(m.slopePerMonth).not.toBeNull();
    expect(m.slopePerMonth!).toBeLessThan(0);
  });

  it("respeita a janela (só conta pontos recentes)", () => {
    const pts: HcpPoint[] = [
      { d: ago(400), h: 40 }, // fora
      { d: ago(200), h: 26 },
      { d: ago(10), h: 20 },
    ];
    const m = computeEvoMetrics(pts, ago(366))!;
    expect(m.nPts).toBe(2);
    expect(m.start).toBe(26);
    expect(m.end).toBe(20);
  });
});
