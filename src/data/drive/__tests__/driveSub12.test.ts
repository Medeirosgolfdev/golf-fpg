import { describe, it, expect } from "vitest";
import { buildSub12Data, filterBySub12Series, filterTournByEsc, sub12Kpis, sub12SeriesCounts, sub12Tournaments, tournShort, countEvents, uniquePC } from "../driveSub12";
import type { Tournament } from "../../../ui/driveTypes";

const par = Array(18).fill(4);
const pl = (fed: string, gross: number, pos: number, escalao?: string) => ({ scoreId: "s" + fed, toPar: gross - 72, fed, name: "J " + fed, grossTotal: gross, pos, par, scores: Array(18).fill(gross / 18), parTotal: 72, ...(escalao ? { escalao } : {}) });
const T = (o: Partial<Tournament> & { players: unknown[] }): Tournament => ({ tcode: "T", ccode: "988", name: "1º Drive Tour Madeira", date: "2026-01-03", campo: "Palheiro", region: "madeira", series: "tour", num: 1, playerCount: o.players.length, ...o } as unknown as Tournament);

const ts = [
  T({ tcode: "A", players: [pl("1", 80, 1), pl("2", 85, 2), pl("3", 999, 3)] }),
  T({ tcode: "B", date: "2026-02-07", region: "sul", players: [pl("1", 78, 1), pl("2", 90, 2)] }),
  T({ tcode: "C", date: "2026-03-08", series: "challenge", escalao: "Sub 12", region: "sul", name: "2º Drive Challenge Sul", players: [pl("2", 40, 1)] }),
];
const esc = new Map([["1", "Sub 12"], ["2", "Sub 12"]]);

describe("driveSub12", () => {
  it("ranking: só o escalão pedido, sem cartão fora, zona modal e pontos", () => {
    const rows = buildSub12Data(ts, {}, esc, undefined, undefined, "Sub 12");
    expect(rows.map((r) => r.fed).sort()).toEqual(["1", "2"]);
    const r2 = rows.find((r) => r.fed === "2")!;
    expect(r2.results.map((r) => r.tournKey)).toEqual(["A_2026-01-03", "B_2026-02-07", "C_2026-03-08"]);
    expect(r2.region).toBe("sul");
    expect(rows[0].totalPts).toBeGreaterThanOrEqual(rows[1].totalPts);
    expect(buildSub12Data(ts, {}, new Map(), undefined, undefined, "all").length).toBe(2);
    expect(buildSub12Data(ts, {}, new Map(), undefined, undefined, "Sub 12").length).toBe(1); // só o Challenge Sub 12 dá escalão
  });
  it("séries, contagens, KPIs e colunas", () => {
    const rows = buildSub12Data(ts, {}, esc);
    const ch = filterBySub12Series(rows, "challenge");
    expect(ch.map((r) => [r.fed, r.tourneiosPlayed])).toEqual([["2", 1]]);
    expect(sub12SeriesCounts(rows, ["tour", "challenge", "aquapor"])).toEqual({ tour: { players: 2, tourns: 2 }, challenge: { players: 1, tourns: 1 }, aquapor: { players: 0, tourns: 0 } });
    expect(sub12Kpis(filterBySub12Series(rows, "tour"))).toMatchObject({ players: 2, rounds: 4, best: 78 });
    expect(sub12Tournaments(rows).map((t) => t.short)).toEqual(["DT1 Mad", "DT1 Sul", "DC1 Sul"]);
    expect(tournShort(T({ name: "Final Drive Tour", players: [] }))).toBe("DTF");
  });
  it("Classificação por escalão: refaz posições em CÓPIAS (decisão H) — o torneio partilhado fica igual", () => {
    const t = T({ tcode: "Z", players: [pl("9", 70, 1), pl("1", 80, 2), pl("2", 85, 3)] });
    const [f] = filterTournByEsc([t], ["Sub 12"], esc, {});
    expect(f.players.map((p) => [p.fed, p.pos])).toEqual([["1", 1], ["2", 2]]);
    expect(t.players.map((p) => p.pos)).toEqual([1, 2, 3]);
    expect(f.players[0]).not.toBe(t.players[1]);
    // «Sub-12» e «Sub 12» são o mesmo escalão (tabela única, model/escalao.ts)
    expect(filterTournByEsc([t], ["Sub-12"], esc, {})[0].players.length).toBe(2);
    // e os pontos do Ranking Sub-12 continuam os do campo todo
    const antes = buildSub12Data([t], {}, esc).map((r) => [r.fed, r.totalPts]);
    filterTournByEsc([t], ["Sub 12"], esc, {});
    expect(buildSub12Data([t], {}, esc).map((r) => [r.fed, r.totalPts])).toEqual(antes);
    expect(countEvents(ts)).toBe(3);
    expect(uniquePC(ts)).toBe(2);
  });

  it("AQUAPOR (2 voltas): SD de CADA volta, lugar e pontos dentro do sexo (sexo da base de federados)", () => {
    const rs = (gross: number, sd: number | null) => ({ round: 1, gross, scores: Array(18).fill(gross / 18), pars: par, si: par.map((_, i) => i + 1), meters: Array(18).fill(300), courseRating: 72, slope: 113, teeName: "BRANCAS", ...(sd != null ? { sd } : {}) });
    const aq = (fed: string, r1: number, r2: number, pos: number, sd1: number | null = null) =>
      ({ ...pl(fed, r1 + r2, pos), hcpExact: 5, parTotal: 144, nholes: 36, roundScores: [rs(r1, sd1), rs(r2, null)] });
    const t = T({ tcode: "Q", ccode: "000", series: "aquapor", name: "1º Torneio do Circuito Aquapor", region: "nacional",
      players: [aq("m1", 70, 72, 1, -1.5), aq("f1", 72, 72, 2), aq("m2", 74, 75, 3)] });
    const sexo = new Map([["m1", "M"], ["m2", "M"], ["f1", "F"]]);
    const rows = buildSub12Data([t], {}, new Map(), undefined, undefined, "all", sexo);
    const m1 = rows.find((r) => r.fed === "m1")!.results[0];
    expect(m1.sds).toEqual([-1.5, 0]);            // R1 oficial, R2 calculado (CR 72, slope 113)
    expect(m1.sd).toBe(-0.7);                     // média das voltas (−0,75)
    expect(m1.rounds).toEqual([70, 72]);
    expect(m1.roundSds).toEqual([-1.5, 0]);       // alinhado com as voltas (a grelha da Época)
    expect(m1.meters).toBe(5400);
    expect(rows.find((r) => r.fed === "m1")!.bestSD).toBe(-1.5);
    // a rapariga é 1.ª no feminino (não 2.ª do campo todo) e o m2 é 2.º no masculino
    const f1 = rows.find((r) => r.fed === "f1")!.results[0];
    expect([f1.sexPos, f1.pts]).toEqual([1, 250]);
    expect(rows.find((r) => r.fed === "m2")!.results[0].sexPos).toBe(2);
  });
});
