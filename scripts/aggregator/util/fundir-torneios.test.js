/**
 * scripts/aggregator/util/fundir-torneios.js — a mesma prova publicada 2× fica
 * uma só, com tudo o que as cópias tinham (casos reais: Evian Juniors Cup no
 * evianjc e na FFG; WJGC «Boys WAGR» por cima dos escalões).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { fundirTorneiosRepetidos, mesmasPancadas } = require("./fundir-torneios.js");

const linha = (jid, pos, voltas, extra = {}) => ({
  juniorId: jid, playerNameInSource: `Jogador ${jid}`, pos, status: "OK",
  totalGross: voltas.reduce((a, b) => a + b, 0), rounds: voltas.map((g, i) => ({ round: i + 1, gross: g })), ...extra,
});
const torneio = (id, sourceId, name, date, flights, extra = {}) => ({ id, sourceId, sourceKey: id, name, date, flights, ...extra });
const flight = (flightKey, label, results, extra = {}) => ({ flightKey, label, results, ...extra });

function montar(tournaments) {
  const tids = new Map();
  for (const t of tournaments) for (const f of t.flights) for (const r of f.results) {
    if (!tids.has(r.juniorId)) tids.set(r.juniorId, new Set());
    tids.get(r.juniorId).add(t.id);
  }
  return { tournaments, juniors: [...tids].map(([id, s]) => ({ id, canonicalName: id, tournamentIds: [...s] })) };
}

describe("mesmasPancadas", () => {
  it("compara total e voltas comuns; sem pancadas não decide", () => {
    expect(mesmasPancadas(linha("a", 1, [70, 72]), linha("a", 2, [70, 72]))).toBe(true);
    expect(mesmasPancadas(linha("a", 1, [70, 72]), linha("a", 1, [71, 71]))).toBe(false);
    expect(mesmasPancadas({ pos: 1 }, { pos: 1 })).toBe(null);
  });

  it("com nº de voltas diferente compara só as voltas comuns (Aisha Wu, Berlin 2026: 85 no EGR, 85+56 no GJGL)", () => {
    expect(mesmasPancadas(linha("a", 1, [85]), linha("a", 1, [85, 56]))).toBe(true);
    expect(mesmasPancadas(linha("a", 1, [84]), linha("a", 1, [85, 56]))).toBe(false);
  });
});

describe("fundirTorneiosRepetidos", () => {
  it("a mesma prova em duas fontes fica uma, com os buracos, o par e quem só estava numa", () => {
    const evian = torneio("evianjc-2023", "evianjc", "Evian Juniors Cup 2023", "2023-09-19", [
      flight("boys", "Boys", [linha("u1", 1, [72, 69]), linha("u2", 2, [74, 70]), linha("u3", 3, [75, 72])]),
    ]);
    const ffg = torneio("ffgolf-1", "ffgolf", "The Amundi Evian Juniors Cup 2023", "2023-09-19", [
      flight("m", "1ère Série Messieurs", [
        linha("u1", 2, [72, 69], { rounds: [{ round: 1, gross: 72, strokes: [4, 3, 5] }, { round: 2, gross: 69 }] }),
        linha("u2", 1, [74, 70]), linha("u3", 3, [75, 72]), linha("u4", 4, [80, 80]),
      ], { par: [4, 3, 5] }),
    ], { parTotal: 72, links: [{ label: "FFG", url: "https://ffg/1" }] });
    const mr = montar([evian, ffg]);
    const r = fundirTorneiosRepetidos(mr);
    expect(r.inteiras).toBe(1);
    expect(mr.tournaments.map((t) => t.id)).toEqual(["evianjc-2023"]);
    const [t] = mr.tournaments;
    const rs = t.flights[0].results;
    expect(rs.map((x) => x.juniorId)).toEqual(["u1", "u2", "u3", "u4"]);
    expect(rs[0].pos).toBe(1);                                   // a posição da fonte dedicada fica
    expect(rs[0].rounds[0].strokes).toEqual([4, 3, 5]);          // os buracos vêm da FFG
    expect(t.flights[0].par).toEqual([4, 3, 5]);
    expect(t.parTotal).toBe(72);
    expect(t.links.map((l) => l.url)).toEqual(["https://ffg/1"]);
    expect(t.extra.fundidoCom[0].id).toBe("ffgolf-1");
    const u4 = mr.juniors.find((j) => j.id === "u4");
    expect(u4.tournamentIds).toEqual(["evianjc-2023"]);
  });

  it("classificação WAGR por cima dos escalões: só saem as linhas repetidas", () => {
    const b14 = torneio("w-14", "wjgc", "WJGC - Boys 14-15", "2025-04-05", [flight("b14", "Boys 14-15", [linha("a", 1, [70]), linha("b", 2, [72]), linha("c", 3, [74])])]);
    const b16 = torneio("w-16", "wjgc", "WJGC - Boys 16-18", "2025-04-05", [flight("b16", "Boys 16-18", [linha("d", 1, [68]), linha("e", 2, [69]), linha("f", 3, [71])])]);
    const wagr = torneio("w-wagr", "wjgc", "WJGC - Boys WAGR", "2025-04-05", [flight("bw", "Boys WAGR", [
      linha("a", 2, [70]), linha("b", 4, [72]), linha("c", 6, [74]), linha("d", 1, [68]), linha("e", 3, [69]), linha("f", 5, [71]), linha("g", 7, [80]),
    ])]);
    const mr = montar([b14, b16, wagr]);
    const r = fundirTorneiosRepetidos(mr);
    expect(r.transversais).toBe(1);
    const ids = mr.tournaments.map((t) => t.id);
    expect(ids).toEqual(["w-14", "w-16", "w-wagr"]);
    expect(mr.tournaments[2].flights[0].results.map((x) => x.juniorId)).toEqual(["g"]);  // só quem só lá estava
    expect(mr.tournaments[0].flights[0].results[0].pos).toBe(1);                          // a posição do escalão fica
    expect(mr.juniors.find((j) => j.id === "a").tournamentIds).toEqual(["w-14"]);
  });

  it("a classificação WAGR ligada a um só escalão também não leva os outros para lá", () => {
    const g15 = torneio("e-155", "eowagr", "European Open WAGR - Girls 15-18 LTQ", "2025-07-01", [flight("g15", "Girls 15-18", [linha("a", 1, [70]), linha("b", 2, [72]), linha("c", 3, [74])])]);
    const gw = torneio("e-159", "eowagr", "European Open WAGR - Girls WAGR", "2025-07-01", [flight("gw", "Girls WAGR", [linha("a", 1, [70]), linha("b", 2, [72]), linha("c", 3, [74]), linha("x", 4, [76])])]);
    const mr = montar([g15, gw]);
    fundirTorneiosRepetidos(mr);
    expect(mr.tournaments[0].flights[0].results.map((r) => r.juniorId)).toEqual(["a", "b", "c"]);
    expect(mr.tournaments[1].flights[0].results.map((r) => r.juniorId)).toEqual(["x"]);
  });

  it("voltas diferentes no mesmo dia (9 buracos de manhã e de tarde) não se fundem", () => {
    const m = torneio("rfeg-1", "rfeg", "Liguilla 3ª prueba", "2025-11-29", [flight("al", "Alevín", [linha("a", 1, [40]), linha("b", 2, [42]), linha("c", 3, [45])])]);
    const t = torneio("rfeg-2", "rfeg", "Liguilla 2ª prueba", "2025-11-29", [flight("al", "Alevín", [linha("a", 2, [43]), linha("b", 1, [41]), linha("c", 3, [44])])]);
    const mr = montar([m, t]);
    fundirTorneiosRepetidos(mr);
    expect(mr.tournaments).toHaveLength(2);
  });

  it("a fonte rica que o EGR parte por escalão recebe as cópias, não as perde", () => {
    const ejo = torneio("ejo-2020", "ejo", "Estonian Junior Open 2020", "2020-07-14", [flight("g", "Geral", [
      linha("a", 1, [70]), linha("b", 2, [72]), linha("c", 3, [74]), linha("d", 1, [68]), linha("e", 2, [69]), linha("f", 3, [71]),
    ])]);
    const u14 = torneio("egr-1", "egr", "Estonian U14 Junior Open 2020", "2020-07-14", [flight("u14", "U14", [linha("a", 1, [70]), linha("b", 2, [72]), linha("c", 3, [74])])]);
    const u18 = torneio("egr-2", "egr", "Estonian U18 Junior Open 2020", "2020-07-14", [flight("u18", "U18", [linha("d", 1, [68]), linha("e", 2, [69]), linha("f", 3, [71]), linha("h", 4, [77])])]);
    const mr = montar([ejo, u14, u18]);
    fundirTorneiosRepetidos(mr);
    expect(mr.tournaments.map((t) => t.id)).toEqual(["ejo-2020"]);
    expect(mr.tournaments[0].flights.flatMap((f) => f.results).map((x) => x.juniorId).sort()).toEqual(["a", "b", "c", "d", "e", "f", "h"]);
  });

  it("a cópia com todas as voltas fica como principal e as posições finais vêm dela (golfdirecto «Ronda 1» × «Ronda 3»)", () => {
    const r1 = torneio("fcg-r1", "fcg", "Ronda 1", "2026-07-10", [flight("s18", "Sub-18", [
      linha("a", 2, [74]), linha("b", 1, [70]), linha("c", 3, [71]), linha("d", 4, [80]),
    ])]);
    const r3 = torneio("fcg-r3", "fcg", "Ronda 3", "2026-07-12", [flight("s18", "Sub-18", [
      linha("a", 1, [74, 71, 70]), linha("b", 2, [70, 76, 71]), linha("c", 3, [71, 74, 73]),
    ])]);
    const mr = montar([r1, r3]);
    fundirTorneiosRepetidos(mr);
    expect(mr.tournaments.map((t) => t.id)).toEqual(["fcg-r3"]);
    const rs = mr.tournaments[0].flights[0].results;
    expect(rs.map((x) => [x.juniorId, x.pos])).toEqual([["a", 1], ["b", 2], ["c", 3], ["d", 4]]);
  });

  it("colegas espalhados por vários escalões: quem só está na cópia fica à parte, sem escalão inventado", () => {
    const gjgl = torneio("gjgl-berlin", "gjgl", "Berlin Juniors International 2026", "2026-07-28", [
      flight("u14", "U14", [linha("a", 1, [74, 76]), linha("b", 2, [84, 80]), linha("c", 3, [86, 87])]),
      flight("u18", "U18", [linha("d", 1, [89, 90])]),
    ], { endDate: "2026-07-31" });
    const egr = torneio("egr-1", "egr", "Berlin Junior International (GJG) 2026", "2026-07-29", [flight("geral", "Geral", [
      linha("a", 1, [74, 76]), linha("b", 2, [84, 80]), linha("c", 3, [86, 87]), linha("d", 4, [89, 90]), linha("x", 5, [83, 80]),
    ])]);
    const mr = montar([gjgl, egr]);
    fundirTorneiosRepetidos(mr);
    expect(mr.tournaments.map((t) => t.id)).toEqual(["gjgl-berlin"]);
    const fl = mr.tournaments[0].flights;
    expect(fl.map((f) => f.label)).toEqual(["U14", "U18", "Geral (EGR)"]);
    expect(fl[2].results.map((r) => r.juniorId)).toEqual(["x"]);
  });
});
