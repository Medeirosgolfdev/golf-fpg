import { describe, it, expect } from "vitest";
import {
  emptyDist,
  addDist,
  distPct,
  distFromRound,
  distFromRounds,
  perRoundDists,
  nineSplit,
  holeByHoleStats,
  aggregateField,
} from "../analysisStats";

const PAR72 = [4,5,4,3,4,3,4,5,4, 4,4,3,5,4,5,3,4,4];  // par total 72

describe("distFromRound", () => {
  it("classifica eagles, birdies, pars, bogeys, dbPlus", () => {
    // Todos pars
    const d1 = distFromRound(PAR72, PAR72);
    expect(d1).toEqual({ eagles:0, birdies:0, pars:18, bogeys:0, dbPlus:0, total:18 });
  });

  it("1 birdie + 1 bogey no resto pars", () => {
    const scores = [...PAR72];
    scores[0] = PAR72[0] - 1;   // birdie
    scores[5] = PAR72[5] + 1;   // bogey
    const d = distFromRound(scores, PAR72);
    expect(d).toEqual({ eagles:0, birdies:1, pars:16, bogeys:1, dbPlus:0, total:18 });
  });

  it("dbPlus junta +2, +3, +4", () => {
    const scores = [...PAR72];
    scores[0] = PAR72[0] + 2;   // double
    scores[1] = PAR72[1] + 3;   // triple
    scores[2] = PAR72[2] + 4;   // quadruple
    const d = distFromRound(scores, PAR72);
    expect(d.dbPlus).toBe(3);
    expect(d.total).toBe(18);
  });

  it("eagle agrupa -2, -3, -4 (holes-in-one em par 4+)", () => {
    const scores = [...PAR72];
    scores[1] = 2;  // par 5 → eagle
    scores[0] = 1;  // par 4 → hole-in-one / eagle
    const d = distFromRound(scores, PAR72);
    expect(d.eagles).toBe(2);
  });

  it("ignora buracos com score 0 (não jogado)", () => {
    const scores = [...PAR72];
    scores[0] = 0;
    scores[17] = 0;
    const d = distFromRound(scores, PAR72);
    expect(d.total).toBe(16);
    expect(d.pars).toBe(16);
  });

  it("ignora buracos com par 0 (dados em falta)", () => {
    const par = [...PAR72]; par[0] = 0;
    const d = distFromRound(PAR72, par);
    expect(d.total).toBe(17);
  });
});

describe("distFromRounds + addDist", () => {
  it("agrega várias rondas", () => {
    const r1 = [...PAR72]; r1[0] = r1[0] - 1;  // 1 birdie
    const r2 = [...PAR72]; r2[0] = r2[0] - 1;  // 1 birdie
    const d = distFromRounds([r1, r2], PAR72);
    expect(d.birdies).toBe(2);
    expect(d.pars).toBe(34);
    expect(d.total).toBe(36);
  });

  it("addDist é comutativa", () => {
    const a = { eagles:1, birdies:2, pars:3, bogeys:4, dbPlus:5, total:15 };
    const b = { eagles:5, birdies:4, pars:3, bogeys:2, dbPlus:1, total:15 };
    expect(addDist(a, b)).toEqual(addDist(b, a));
    expect(addDist(a, emptyDist())).toEqual(a);
  });
});

describe("distPct", () => {
  it("soma 100% quando total>0", () => {
    const d = { eagles:1, birdies:2, pars:10, bogeys:4, dbPlus:1, total:18 };
    const p = distPct(d);
    const sum = p.eagles + p.birdies + p.pars + p.bogeys + p.dbPlus;
    expect(sum).toBeCloseTo(100, 5);
  });

  it("zeros quando total=0", () => {
    expect(distPct(emptyDist())).toEqual({ eagles:0, birdies:0, pars:0, bogeys:0, dbPlus:0 });
  });
});

describe("perRoundDists", () => {
  it("uma entry por ronda, labels R1..Rn", () => {
    const r1 = [...PAR72]; r1[0] -= 1;
    const r2 = [...PAR72]; r2[1] += 1;
    const out = perRoundDists([r1, r2], PAR72);
    expect(out).toHaveLength(2);
    expect(out[0].label).toBe("R1");
    expect(out[0].gross).toBe(71);
    expect(out[0].toPar).toBe(-1);
    expect(out[0].dist.birdies).toBe(1);
    expect(out[1].label).toBe("R2");
    expect(out[1].gross).toBe(73);
    expect(out[1].toPar).toBe(1);
  });

  it("ronda incompleta → gross/toPar null", () => {
    const r = [...PAR72]; r[17] = 0;  // só 17 buracos
    const out = perRoundDists([r], PAR72);
    expect(out[0].gross).toBeNull();
    expect(out[0].toPar).toBeNull();
  });
});

describe("nineSplit", () => {
  it("separa F9 e B9 correctamente", () => {
    const r = [...PAR72];
    r[3] = r[3] - 1;   // birdie na F9
    r[14] = r[14] + 1; // bogey na B9
    const ns = nineSplit([r], PAR72);
    expect(ns.front.birdies).toBe(1);
    expect(ns.front.bogeys).toBe(0);
    expect(ns.back.birdies).toBe(0);
    expect(ns.back.bogeys).toBe(1);
    expect(ns.frontToParAvg).toBe(-1);
    expect(ns.backToParAvg).toBe(1);
  });

  it("F9 incompleta não conta para avg", () => {
    const r = [...PAR72]; r[4] = 0;  // F9 com 8 buracos
    const ns = nineSplit([r], PAR72);
    expect(ns.frontAvg).toBeNull();
    expect(ns.backAvg).not.toBeNull();   // B9 completa
  });

  it("médias sobre múltiplas rondas", () => {
    const parF = PAR72.slice(0, 9).reduce((a, b) => a + b, 0);
    const parB = PAR72.slice(9, 18).reduce((a, b) => a + b, 0);
    const r1 = [...PAR72];               // F9=parF, B9=parB
    const r2 = [...PAR72]; r2[0] -= 1;   // F9=parF-1
    const ns = nineSplit([r1, r2], PAR72);
    expect(ns.frontAvg).toBeCloseTo(parF - 0.5);
    expect(ns.backAvg).toBe(parB);
  });
});

describe("holeByHoleStats", () => {
  it("média por buraco com várias rondas", () => {
    const r1 = [...PAR72];
    const r2 = [...PAR72]; r2[0] = PAR72[0] + 2;  // dupla no buraco 1
    const out = holeByHoleStats([r1, r2], PAR72);
    expect(out).toHaveLength(18);
    expect(out[0].avg).toBe(PAR72[0] + 1);   // média (par + par+2)/2
    expect(out[0].toPar).toBe(1);
    expect(out[1].toPar).toBe(0);
    expect(out[0].n).toBe(2);
  });

  it("ignora zeros no cálculo de média", () => {
    const r1 = [...PAR72];
    const r2 = [...PAR72]; r2[0] = 0;
    const out = holeByHoleStats([r1, r2], PAR72);
    expect(out[0].n).toBe(1);
    expect(out[0].avg).toBe(PAR72[0]);
  });
});

describe("aggregateField", () => {
  it("exclui o próprio jogador", () => {
    const player = { normName: "manuel medeiros", par: PAR72, rounds: [PAR72] };
    const rival  = { normName: "outro jogador",   par: PAR72, rounds: [PAR72.map(v => v + 1)] };
    const agg = aggregateField([player, rival], "manuel medeiros");
    expect(agg.nRounds).toBe(1);
    expect(agg.dist.bogeys).toBe(18);  // só o rival, que fez 18 bogeys
  });

  it("agrega várias rondas e calcula médias por buraco", () => {
    const a = { normName: "a", par: PAR72, rounds: [PAR72] };
    const b = { normName: "b", par: PAR72, rounds: [PAR72.map(v => v + 1)] };
    const agg = aggregateField([a, b], "manuel");  // ninguém é excluído
    expect(agg.nRounds).toBe(2);
    expect(agg.dist.total).toBe(36);
    // média do buraco 1: (par + par+1) / 2
    expect(agg.holeAvg[0]).toBeCloseTo(PAR72[0] + 0.5);
  });

  it("salta rondas vazias", () => {
    const a = { normName: "a", par: PAR72, rounds: [new Array(18).fill(0)] };
    const agg = aggregateField([a], "");
    expect(agg.nRounds).toBe(0);
    expect(agg.dist.total).toBe(0);
  });
});
