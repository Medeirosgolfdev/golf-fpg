import { describe, it, expect } from "vitest";
import clubes2026Raw from "../../../public/data/CLUBES2026.json?raw";
import { clubesMatchplayToFile, clubesTeamPoints, matchplayHoleStatuses, CLUBES_PENDING_NOTE } from "../clubesMatchplayAdapter";
import { CLUBES_TEAM_FORMAT } from "../clubesFormats";
import type { MatchPlayData } from "../clubesMatchplayTypes";
import { fmtPoints } from "../../ui/circuit/teamPointsTypes";

// Dados reais: Campeonato Regional de Clubes 2026 (059/10685, Palheiro).
const clubes2026 = JSON.parse(clubes2026Raw) as {
  tournaments: { ccode: string; tcode: string; name: string; matchPlayResults?: MatchPlayData }[];
};
const regional = clubes2026.tournaments.find(t => t.ccode === "059" && t.tcode === "10685")!;
const mp = regional.matchPlayResults!;
const opts = { tournament: regional.name, year: 2026, categories: CLUBES_TEAM_FORMAT["059-10685"].categories };

describe("matchplayHoleStatuses", () => {
  const par = Array(18).fill(4);
  it("estado corrido na perspectiva de A; fecha quando a vantagem passa os buracos que faltam", () => {
    // A ganha os 5 primeiros buracos e empata os seguintes → 5&4 no buraco 14.
    const a = Array(18).fill(4).map((v, i) => (i < 5 ? 3 : v));
    const b = Array(18).fill(4);
    const r = matchplayHoleStatuses(a, b, par);
    expect(r.holes.slice(0, 5).map(h => h.status)).toEqual(["1UP", "2UP", "3UP", "4UP", "5UP"]);
    expect(r.holes[13].status).toBe("5UP");
    expect(r.holes[14].status).toBeNull();
    expect(r.playedHoles).toBe(14);
    expect(r.result).toBe("5&4");
  });

  it("DN quando B está à frente; AS no fim; buracos sem as duas pancadas não mexem", () => {
    const a = [5, 4, null, ...Array(15).fill(4)];
    const b = [4, 5, 3, ...Array(15).fill(4)];
    const r = matchplayHoleStatuses(a, b, par);
    expect(r.holes.slice(0, 3).map(h => h.status)).toEqual(["1DN", "A/S", "A/S"]);
    expect(r.result).toBe("AS");
    expect(r.holes[17]).toEqual({ hole: 18, par: 4, status: "A/S" });
  });

  it("cartões incompletos: nada depois do último buraco com as duas pancadas", () => {
    const a = [3, 4, 4, ...Array(15).fill(null)];
    const b = [4, 4, 4, ...Array(15).fill(null)];
    const r = matchplayHoleStatuses(a, b, par);
    expect(r.playedHoles).toBe(3);
    expect(r.holes[2].status).toBe("1UP");
    expect(r.holes[3].status).toBeNull();
    expect(r.result).toBe("1UP");
  });
});

describe("clubesMatchplayToFile — Regional de Clubes 2026", () => {
  const file = clubesMatchplayToFile(mp, opts);
  const flight = (name: string) => file.flights.find(f => f.name === name)!;

  it("categoria → flight (pela ordem do formato), dia → ronda com a data do draw", () => {
    expect(file.flights.map(f => f.name)).toEqual(["Homens", "Senhoras", "Juniores"]);
    expect(flight("Juniores").rounds.map(r => [r.number, r.name, r.date])).toEqual([
      [1, "Dia 1", "2026-06-20"], [2, "Dia 2", "2026-06-21"],
    ]);
    expect(file.pendingNote).toBe(CLUBES_PENDING_NOTE);
  });

  it("confronto 3-way → TeamMatch com os 3 clubes, pontos, jogador e hora de saída", () => {
    const m1 = flight("Juniores").rounds[0].matches.find(m => m.matchNo === 1)!;
    expect(m1.sides!.map(s => [s.shortName, s.points, s.isLead])).toEqual([["SdS", 2, true], ["PXO", 0, false], ["CPG", 1, false]]);
    expect(m1.sides![0].playerRefs).toEqual([{ name: "Manuel Medeiros", fed: "52884", gross: 80, toPar: 8 }]);
    expect(m1.startTime).toBe("12:30");
    expect(m1.isSettled).toBe(true);
    expect(m1.home?.shortName).toBe("SdS");
    expect(m1.away?.shortName).toBe("PXO");
  });

  it("cada par de clubes → Game; o estado buraco a buraco das pancadas bate com a margem publicada", () => {
    const m1 = flight("Juniores").rounds[0].matches.find(m => m.matchNo === 1)!;
    expect(m1.games.map(g => [g.home?.name, g.away?.name, g.result, g.home?.won, g.away?.won])).toEqual([
      ["SdS", "PXO", "5&4", true, false],
      ["SdS", "CPG", "1UP", true, false],
      ["PXO", "CPG", "5&4", false, true],
    ]);
    // As margens publicadas são 5&4, 1UP e 5&4: as pancadas têm de dar o mesmo.
    const players = mp.categories.find(c => c.key === "J")!.dias[0].matches!.find(m => m.match === 1)!.players!;
    const clubKey = (teamId: number | null) => mp.clubs[(teamId ?? 0) - 1].key;
    for (const g of m1.games) {
      const st = matchplayHoleStatuses(players[clubKey(g.home!.teamId)].scores!, players[clubKey(g.away!.teamId)].scores!, mp.course!.par);
      expect(st.result).toBe(g.result);
      const played = g.holes!.filter(h => h.status);
      const last = played[played.length - 1];
      expect(last.status).toMatch(g.home!.won ? /UP$/ : /DN$/);
    }
    // SdS × CPG decidido no 18 (1UP): 18 buracos jogados.
    expect(m1.games[1].playedHoles).toBe(18);
  });

  it("margem não publicada: vem das pancadas, se der o mesmo vencedor (Dia 2, CPG × PXO)", () => {
    const m4 = flight("Juniores").rounds[1].matches.find(m => m.matchNo === 4)!;
    const g = m4.games.find(x => x.home?.name === "PXO" && x.away?.name === "CPG")!;
    expect(g.away?.won).toBe(true);
    expect(g.result).toMatch(/&/);
  });

  it("empate publicado → AS; sem margem nem cartões → ✓ só com o vencedor", () => {
    const m2 = flight("Juniores").rounds[0].matches.find(m => m.matchNo === 2)!;
    const half = m2.games.find(x => x.home?.name === "PXO" && x.away?.name === "CPG")!;
    expect(half.result).toBe("AS");
    expect(half.home?.won || half.away?.won).toBe(false);
    expect(m2.games.find(x => x.home?.name === "SdS" && x.away?.name === "CPG")!.result).toBe("✓");
    expect(m2.sides!.map(s => fmtPoints(s.points))).toEqual(["1", "1½", "½"]);
  });

  it("Senhoras: só os clubes participantes (o CGSS não alinha)", () => {
    const s = flight("Senhoras").rounds[0].matches;
    expect(s.every(m => m.sides!.map(x => x.shortName).join() === "PXO,CPG")).toBe(true);
    expect(s[0].winner).toBe("away"); // CPG 1 – PXO 0
  });

  it("confrontos sem resultado ficam por resolver (Dia 2 dos Juniores: 3 de 4)", () => {
    const d2 = flight("Juniores").rounds[1].matches;
    expect(d2.filter(m => !m.isSettled).length).toBe(3);
    expect(d2.find(m => !m.isSettled)!.sides!.every(s => s.points == null && !s.isLead)).toBe(true);
  });
});

describe("clubesTeamPoints — Regional de Clubes 2026", () => {
  const tp = clubesTeamPoints(mp, opts);

  it("pontos por clube e categoria, por dia e no total", () => {
    expect(tp.rounds).toEqual([{ n: 1, label: "Dia 1" }, { n: 2, label: "Dia 2" }]);
    expect(tp.byRound["1"].pts).toEqual({
      CGSS: { H: 8, J: 4.5 },
      PXO: { H: 0, S: 1, J: 2 },
      CPG: { H: 10, S: 1, J: 5.5 },
    });
    expect(tp.byRound["2"].pts.CGSS).toEqual({ H: 0, J: 1 });
    expect(tp.byRound.all.pts.CPG).toEqual({ H: 10, S: 1, J: 7.5 });
  });

  it("pendentes por vista, classificação oficial e o clube do Manuel em destaque", () => {
    expect([tp.byRound["1"].pending, tp.byRound["2"].pending, tp.byRound.all.pending]).toEqual([0, 3, 3]);
    expect(tp.officialPlaces).toEqual({ CPG: 1, PXO: 2, CGSS: 3 });
    expect(tp.highlight).toEqual(["CGSS"]);
  });

  it("jogadores de cada clube: um por linha no Total, com os resultados contra cada adversário", () => {
    const manuel = tp.byRound.all.players.CGSS.find(r => r.fed === "52884")!;
    expect(manuel.catKey).toBe("J");
    expect(manuel.pts).toBe(3);
    expect(manuel.gross).toBe(80);
    expect(manuel.vs.CPG.map(x => [x.won, x.margin])).toEqual([[true, "1UP"], [false, "5&4"]]);
    expect(manuel.vs.PXO.map(x => [x.won, x.margin])).toEqual([[true, "5&4"], [true, "5&4"]]);
    expect(tp.byRound.all.players.CGSS.filter(r => r.fed === "52884")).toHaveLength(1);
  });
});

describe("fmtPoints", () => {
  it("meios pontos com ½", () => {
    expect([0, 0.5, 1, 1.5, 12.5, null].map(fmtPoints)).toEqual(["0", "½", "1", "1½", "12½", "—"]);
  });
});
