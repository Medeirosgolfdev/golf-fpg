import { describe, it, expect } from "vitest";
import {
  calcSD, calcCourseHcp, calcPlayingHcp, strokesOnHole, ndbCaps, ndbCapsForRound, expectedSD9,
  scoreDifferential, scoreForDifferential, sd18FromSd9, roundDifferential,
  whsQtyCalc, tableAdjustment, exceptionalAdjustment, applyCaps, historicExceptionalAdj,
  hiAdjustment, addRoundToPool, grossTargets, topIds, windowAverage, indexFromWindow,
} from "../whsCalc";

/* ═══════════════════════════ POR VOLTA ═══════════════════════════ */

describe("Course / Playing Handicap", () => {
  it("18 buracos: HI × Slope/113 + CR − Par", () => {
    expect(calcCourseHcp(10, 113, 72, 72)).toBe(10);
  });
  it("9 buracos: usa metade do HI", () => {
    expect(calcCourseHcp(10, 113, 36, 36, true)).toBe(5);
    expect(calcPlayingHcp(10, 113, 36, 36, 0.9, true)).toBeCloseTo(4.5);
  });
});

describe("strokesOnHole + ndbCaps (Net Double Bogey)", () => {
  it("dá 2.ª e 3.ª pancada com Course Handicap acima de 18 e 36", () => {
    expect(strokesOnHole(1, 20)).toBe(2);
    expect(strokesOnHole(3, 20)).toBe(1);
    expect(strokesOnHole(18, 17)).toBe(0);
    expect(strokesOnHole(1, 40)).toBe(3);
  });
  it("máximo por buraco = par + 2 + pancadas pelo SI", () => {
    expect(ndbCaps([4, 4, 3], [1, 2, 3], 2, 3)).toEqual([7, 7, 5]);
  });
  it("em 9 buracos o NDB usa o Course Handicap de 9 (metade do HI)", () => {
    const par = [4, 4, 3, 4, 3, 5, 3, 4, 4];
    const si = [1, 8, 4, 6, 9, 2, 5, 3, 7];
    // HI 18, CR 34, Slope 113, par 34 → CH de 9 = 9 → uma pancada em cada buraco
    expect(ndbCapsForRound(par, si, 34, 113, 18, 9)).toEqual(par.map((p) => p + 3));
  });
});

describe("expectedSD9 (WHS 2024)", () => {
  it("é 0,52 × HI + 1,2, com as décimas do HI", () => {
    expect(expectedSD9(10)).toBeCloseTo(6.4);
    expect(expectedSD9(6.8)).toBeCloseTo(4.736);
    expect(expectedSD9(80)).toBeCloseTo(0.52 * 54 + 1.2);
  });
});

describe("scoreDifferential — casos reais da FPG", () => {
  it("18 buracos com PCC", () => {
    expect(scoreDifferential({ score: 85, cr: 72, slope: 113, pcc: 1 })?.sd).toBe(12);
  });
  // Drive Challenge 2026 (método actual): valores oficiais do WHS
  it("9 buracos desde 2024 — Palheiro, HI 6,3, AGS 36 → 7,0", () => {
    const d = scoreDifferential({ score: 36, cr: 33.2, slope: 123, is9: true, hi: 6.3, date: "2026-01-04" });
    expect(d?.sd).toBe(7);
  });
  it("9 buracos desde 2024 — Palheiro, HI 6,9, AGS 36 → 7,4", () => {
    expect(scoreDifferential({ score: 36, cr: 33.2, slope: 123, is9: true, hi: 6.9, date: "2026-01-04" })?.sd).toBe(7.4);
  });
  it("9 buracos com PCC −1 conta metade — Terceira, HI 17, AGS 39 → 18,6", () => {
    expect(scoreDifferential({ score: 39, cr: 30.9, slope: 114, pcc: -1, is9: true, hi: 17, date: "2026-01-24" })?.sd).toBe(18.6);
  });
  // Drive Challenge Madeira, 5 Fev 2022 (método antigo: net par + 1 nos 9 não jogados)
  it("9 buracos antes de 2024 — HI 12,8, AGS 45, par 34 → 18,6", () => {
    expect(scoreDifferential({ score: 45, cr: 33.3, slope: 118, is9: true, hi: 12.8, par: 34, date: "2022-02-05" })?.sd).toBe(18.6);
  });
  it("9 buracos antes de 2024 — HI 12,7, AGS 46, par 34 → 19,5", () => {
    expect(scoreDifferential({ score: 46, cr: 33.3, slope: 118, is9: true, hi: 12.7, par: 34, date: "2022-02-05" })?.sd).toBe(19.5);
  });
  it("9 buracos sem HI não tem SD", () => {
    expect(scoreDifferential({ score: 40, cr: 36, slope: 113, is9: true, hi: null })).toBeNull();
  });
  it("inverso: o score que dá um SD", () => {
    expect(scoreForDifferential(12, { cr: 72, slope: 113, pcc: 1 })).toBe(85);
    const s = scoreForDifferential(7.048, { cr: 33.2, slope: 123, is9: true, hi: 6.3 });
    expect(s).toBeCloseTo(36, 1);
  });
  it("SD 18 a partir de um SD 9", () => {
    expect(sd18FromSd9(2.6, 6.3)).toBe(7.1);
  });
});

describe("roundDifferential (volta sem SD oficial)", () => {
  const par = Array(18).fill(4);
  const si = Array.from({ length: 18 }, (_, i) => i + 1);
  it("usa o AGS quando há cartão e HI", () => {
    const scores = [...Array(17).fill(4), 12]; // um 12 num par 4: NDB corta
    const r = roundDifferential({ scores, par, si, cr: 72, slope: 113, hi: 0, gross: 80, nholes: 18 });
    expect(r.source).toBe("ags");
    expect(r.sd).toBe(2); // AGS 74 (o 12 conta 6)
  });
  it("sem HI usa o gross", () => {
    const r = roundDifferential({ par, si, cr: 72, slope: 113, gross: 80, nholes: 18 });
    expect(r).toEqual({ sd: 8, source: "raw" });
  });
  it("cartão por entregar (998/999) não tem SD", () => {
    expect(roundDifferential({ cr: 72, slope: 113, gross: 999, nholes: 18 }).sd).toBeNull();
  });
  it("volta a decorrer não tem SD; cartão truncado com gross maior conta", () => {
    const meio = [...Array(9).fill(4), ...Array(9).fill(0)];
    expect(roundDifferential({ scores: meio, par, si, cr: 72, slope: 113, hi: 5, gross: 36, nholes: 18 }).sd).toBeNull();
    expect(roundDifferential({ scores: meio, par, si, cr: 72, slope: 113, hi: 5, gross: 80, nholes: 18 }).sd).toBe(8);
  });
});

/* ═════════════════════════ JANELA / ÍNDICE ═════════════════════════ */

/* Janela de 20 (mais recente primeiro): 12 voltas de SD 12 e, no fim, 8 de SD 8.
 * A mais antiga (índice 19) é um 8 — conta para o HI. HI = média das 8 melhores = 8,0. */
const mk = (sds: number[]) => sds.map((sd, i) => ({ eid: `r${i}`, sd, adj: 0 }));
const POOL = mk([...Array(12).fill(12), ...Array(8).fill(8)]);

describe("whsQtyCalc + tableAdjustment (tabela 5.2a)", () => {
  it("quantas melhores contam", () => {
    expect([3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 19, 20].map(whsQtyCalc))
      .toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 7, 8]);
  });
  it("ajuste para 3, 4 e 6 resultados", () => {
    expect([3, 4, 5, 6, 7, 20].map(tableAdjustment)).toEqual([-2, -1, 0, -1, 0, 0]);
  });
});

describe("exceptionalAdjustment", () => {
  it("−1 a partir de 7,0 abaixo do HI, −2 a partir de 10,0", () => {
    expect(exceptionalAdjustment(10, 3.1)).toBe(0);
    expect(exceptionalAdjustment(10, 3)).toBe(-1);
    expect(exceptionalAdjustment(10, 0)).toBe(-2);
  });
});

describe("applyCaps (Regra 5.8)", () => {
  it("soft cap: acima de Low+3 a subida conta metade", () => {
    expect(applyCaps(9, 5)).toBe(8.5);
  });
  it("hard cap: nunca passa de Low+5", () => {
    expect(applyCaps(14, 5)).toBe(10);
  });
  it("sem Low HI só limita a 54", () => {
    expect(applyCaps(60, null)).toBe(54);
    expect(applyCaps(20, 0)).toBe(20);
  });
});

describe("historicExceptionalAdj", () => {
  it("baixa a volta extraordinária e as anteriores a ela, não as mais recentes", () => {
    const w = [{ sd: 20, hi: 22 }, { sd: 10, hi: 20 }, { sd: 20, hi: 20 }];
    expect(historicExceptionalAdj(w)).toEqual([0, -2, -2]);
  });
  it("reproduz o HI oficial do pai (54907): 23,3 — sem os ajustes dava 24,9", () => {
    // 20 voltas da FPG, mais recente primeiro: [SD, HI antes da volta]
    const raw: [number, number][] = [
      [30.5, 22.9], [36.6, 22.4], [31.1, 22.4], [30.8, 22.4], [25.4, 22.5], [17.6, 23.7],
      [27.8, 23.7], [17.2, 27.2], [40.9, 27.2], [33.1, 27.2], [33, 27.2], [30, 26.9],
      [29.5, 26.5], [21.9, 28.9], [36.8, 28.6], [30.3, 28.6], [29.7, 28.4], [32.5, 28.4],
      [31.4, 28.4], [33, 27.7],
    ];
    const adj = historicExceptionalAdj(raw.map(([sd, hi]) => ({ sd, hi })));
    const pool = raw.map(([sd], i) => ({ eid: `p${i}`, sd, adj: adj[i] }));
    expect(Math.abs(hiAdjustment(pool, 23.3, 22.4))).toBeLessThan(0.05);
    const semAjuste = raw.map(([sd], i) => ({ eid: `p${i}`, sd, adj: 0 }));
    expect(hiAdjustment(semAjuste, 23.3, 22.4)).toBeCloseTo(-1.59, 1);
  });
});

describe("hiAdjustment", () => {
  it("é a diferença entre o HI oficial e o cálculo da janela", () => {
    expect(hiAdjustment(POOL, 8.3)).toBeCloseTo(0.3);
  });
});

describe("addRoundToPool", () => {
  it("uma volta boa entra em #1 e o HI desce", () => {
    const s = addRoundToPool(POOL, { eid: "new", sd: 5, adj: 0 }, 8, 0);
    expect(s.entersTop).toBe(true);
    expect(s.topRank).toBe(1);
    expect(s.newHI).toBe(7.6); // (5 + 7×8) / 8 = 7,625
    expect(s.displaced?.sd).toBe(8);
    expect(s.pool).toHaveLength(20);
  });
  it("uma volta fraca faz o HI subir quando sai da janela uma que contava", () => {
    const s = addRoundToPool(POOL, { eid: "new", sd: 12.5, adj: 0 }, 8, 0);
    expect(s.entersTop).toBe(false);
    expect(s.newHI).toBe(8.5); // (7×8 + 12) / 8
  });
  it("com Low HI o soft cap trava a subida", () => {
    // 20 voltas de 12 e Low 7: cru 12 → soft 10 + (12−10)/2 = 11
    const s = addRoundToPool(mk(Array(20).fill(12)), { eid: "new", sd: 12, adj: 0 }, 11, 0, 7);
    expect(s.newHI).toBe(11);
  });
  it("resultado extraordinário baixa a janela toda", () => {
    const s = addRoundToPool(POOL, { eid: "new", sd: 0, adj: 0 }, 8, 0);
    expect(s.exceptionalAdj).toBe(-1);
    expect(s.newHI).toBe(6); // (−1 + 7×7) / 8
    expect(s.pool.every((e) => e.adj === -1)).toBe(true);
  });
  it("com menos de 20 resultados nada sai e aplica-se a tabela 5.2a", () => {
    const s = addRoundToPool(mk([10, 11, 12]), { eid: "new", sd: 9, adj: 0 }, 10, 0);
    expect(s.displaced).toBeNull();
    expect(s.newHI).toBe(8); // 4 resultados → o melhor (9) − 1
  });
});

describe("grossTargets", () => {
  // CR 72 / Slope 113 / Par 72 → SD = gross − 72
  const t = grossTargets(POOL, 8, 0, { cr: 72, slope: 113, par: 72, pcc: 0, is9: false });
  it("desce até 79 (SD 7), com HI 7,9", () => {
    expect(t.lower).toEqual({ gross: 79, sd: 7, hi: 7.9 });
  });
  it("sobe a partir de 81 (SD 9), porque sai da janela um 8", () => {
    expect(t.rise).toEqual({ gross: 81, sd: 9, hi: 8.1 });
  });
  it("entra nas 8 melhores até 84 (SD 12)", () => {
    expect(t.enterTop).toEqual({ gross: 84, sd: 12 });
    expect(t.qty).toBe(8);
    expect(t.qtyNow).toBe(8);
  });
  it("extraordinário até 73 (−1) e até 70 (−2)", () => {
    expect(t.exceptional).toEqual([{ adj: -1, gross: 73, sd: 1 }, { adj: -2, gross: 70, sd: -2 }]);
  });
  it("diz que resultado sai e em que posição das melhores está", () => {
    expect(t.leaving?.entry.eid).toBe("r19");
    expect(t.leaving?.topRank).toBe(8);   // o último dos oito 8
    expect(topIds(POOL).has("r19")).toBe(true);
  });
  it("posição nula quando o que sai não está nas melhores", () => {
    const pool = mk([...Array(8).fill(8), ...Array(12).fill(12)]); // o mais antigo é um 12
    const t2 = grossTargets(pool, 8, 0, { cr: 72, slope: 113, par: 72, pcc: 0, is9: false });
    expect(t2.leaving?.topRank).toBeNull();
    expect(t2.rise).toBeNull(); // sai um 12, que não conta — nada faz subir
  });
  it("em 9 buracos usa o SD a 18 (com o Expected SD)", () => {
    const t9 = grossTargets(POOL, 8, 0, { cr: 36, slope: 113, par: 36, pcc: 0, is9: true });
    expect(t9.lower?.sd).toBe(Math.round((t9.lower!.gross - 36 + expectedSD9(8)) * 10) / 10);
  });
});

it("calcSD continua a ser a fórmula crua", () => {
  expect(calcSD(85, 72, 113)).toBe(13);
});

describe("windowAverage + indexFromWindow (HI a partir da janela, usado pelos scripts)", () => {
  // As 20 voltas oficiais do pai (54907), mais recente primeiro: [SD, HI antes]
  const PAI: [number, number][] = [
    [30.5, 22.9], [36.6, 22.4], [31.1, 22.4], [30.8, 22.4], [25.4, 22.5], [17.6, 23.7],
    [27.8, 23.7], [17.2, 27.2], [40.9, 27.2], [33.1, 27.2], [33, 27.2], [30, 26.9],
    [29.5, 26.5], [21.9, 28.9], [36.8, 28.6], [30.3, 28.6], [29.7, 28.4], [32.5, 28.4],
    [31.4, 28.4], [33, 27.7],
  ];
  it("dá o HI e o score average oficiais do pai: 23,3", () => {
    const r = indexFromWindow(PAI.map(([sd, hi]) => ({ sd, hi })), 22.4);
    expect(r?.hi).toBe(23.3);
    expect(r?.scoreAvg).toBeCloseTo(23.3, 5);
    expect(r?.qtyCalc).toBe(8);
  });
  it("windowAverage é a média das que contam, sem a tabela 5.2a", () => {
    expect(windowAverage(mk([10, 11, 12, 13]))).toBe(10);
    expect(indexFromWindow([10, 11, 12, 13].map((sd) => ({ sd, hi: null })))?.hi).toBe(9); // 4 → −1
  });
  it("com menos de 3 resultados não há índice", () => {
    expect(indexFromWindow([{ sd: 10, hi: null }, { sd: 12, hi: null }])).toBeNull();
  });
});
