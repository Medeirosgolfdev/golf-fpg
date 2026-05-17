/**
 * kids2/__tests__/data.test.ts
 *
 * Smoke tests para o loader canónico da KIDS2.
 *
 * Cobertura mínima após a migração KIDS → KIDS2 (2026-05):
 *   - normName: normalização de nomes (acentos, hífens, apóstrofes)
 *   - computeTier: classificação Elite/Forte/Sólido/etc com base em pos
 *   - getSharedFlightTids + hasRealConfrontWithManuel: confronto real
 *   - countWins, countTop3: contagens triviais
 *   - computeRoundStats: filtro 9H, sanity de gross, média/desvio
 *   - bestRoundGross: melhor ronda absoluta
 *   - categorizeTournamentLinks: dedup + ordenação fixa
 *   - getTournWeight: rounds + field + nationsCount → estrelas
 *
 * Nada destes testes faz fetch — todos constroem fixtures inline.
 */
import { describe, it, expect } from "vitest";
import {
  normName,
  computeTier,
  getSharedFlightTids,
  hasRealConfrontWithManuel,
  countWins,
  countTop3,
  computeRoundStats,
  bestRoundGross,
  getTierLabel,
  type Junior,
  type Tournament,
} from "../data";
import { categorizeTournamentLinks } from "../tournamentLinks";
import { getTournWeight, formatStars } from "../tournWeight";

/* ──────────────────────────────────────────────────────────────────
   Fixtures
   ────────────────────────────────────────────────────────────────── */
function mkManuel(): Junior {
  return {
    id: "u630106",
    canonicalName: "Manuel Medeiros",
    aliases: ["Manuel Francisco Medeiros"],
    dob: "2014-04-29",
    sex: "M",
    country: "PT",
    nationality: "PT",
    sources: { uskids: { memberId: "630106" } },
    tournamentIds: [],
    _match: { confidence: "strong", evidence: ["uskids:630106"], mergedFromSources: ["uskids"] },
  };
}

function mkRival(id: string, name: string, tids: string[]): Junior {
  return {
    id,
    canonicalName: name,
    sources: {},
    tournamentIds: tids,
    _match: { confidence: "strong", evidence: [], mergedFromSources: [] },
  };
}

function mkTournament(
  id: string,
  flightLabel: string,
  results: Array<{ juniorId: string; pos?: number | null; gross?: number[]; status?: "OK" | "WD" | "IE" }>,
  par18: number = 72,
): Tournament {
  const par = Array(18).fill(par18 / 18 | 0); // dummy 4s
  par[0] = par18 - par.reduce((a, b) => a + b, 0) + par[0]; // ajusta para somar exactamente
  return {
    id,
    sourceId: "uskids",
    sourceKey: id.replace(/[^0-9]/g, "") || id,
    name: `Test ${id}`,
    date: "2025-06-01",
    parTotal: par18,
    holesPerRound: 18,
    flights: [
      {
        flightKey: "b11",
        label: flightLabel,
        ageMin: 11,
        ageMax: 11,
        sex: "M",
        par,
        results: results.map((r) => ({
          juniorId: r.juniorId,
          pos: r.pos ?? null,
          status: r.status || "OK",
          totalGross: r.gross ? r.gross.reduce((a, b) => a + b, 0) : null,
          rounds: (r.gross || []).map((g, i) => ({ round: i + 1, gross: g })),
        })),
      },
    ],
    links: [],
  };
}

function mkTournamentByMap(tournaments: Tournament[]): Map<string, Tournament> {
  const m = new Map<string, Tournament>();
  for (const t of tournaments) m.set(t.id, t);
  return m;
}

/* ──────────────────────────────────────────────────────────────────
   normName
   ────────────────────────────────────────────────────────────────── */
describe("normName", () => {
  it("lowercase + trim + colapsa espaços", () => {
    expect(normName("  Manuel   Medeiros  ")).toBe("manuel medeiros");
  });
  it("remove diacríticos", () => {
    expect(normName("José André")).toBe("jose andre");
    expect(normName("João")).toBe(normName("Joao"));
  });
  it("hífens, apóstrofes e pontos contam como espaços", () => {
    expect(normName("Castro-Ferreira")).toBe(normName("Castro Ferreira"));
    expect(normName("O'Neill")).toBe(normName("O Neill"));
    expect(normName("Jr.")).toBe("jr");
  });
  it("string vazia ou só whitespace devolve ''", () => {
    expect(normName("")).toBe("");
    expect(normName("   ")).toBe("");
  });
});

/* ──────────────────────────────────────────────────────────────────
   getSharedFlightTids + hasRealConfrontWithManuel
   ────────────────────────────────────────────────────────────────── */
describe("getSharedFlightTids", () => {
  it("devolve [] se manuel é null", () => {
    const r = mkRival("u1", "Rival", ["t1"]);
    expect(getSharedFlightTids(r, null, new Map())).toEqual([]);
  });
  it("inclui tid onde ambos estão no mesmo flight", () => {
    const manuel = mkManuel();
    manuel.tournamentIds = ["t1"];
    const rival = mkRival("u1", "Rival", ["t1"]);
    const t = mkTournament("t1", "Boys 11", [
      { juniorId: "u630106", pos: 3, gross: [75, 74] },
      { juniorId: "u1", pos: 1, gross: [70, 71] },
    ]);
    const ti = mkTournamentByMap([t]);
    expect(getSharedFlightTids(rival, manuel, ti)).toEqual(["t1"]);
    expect(hasRealConfrontWithManuel(rival, manuel, ti)).toBe(true);
  });
  it("exclui tid se rival e Manuel estão em flights diferentes", () => {
    const manuel = mkManuel();
    manuel.tournamentIds = ["t1"];
    const rival = mkRival("u1", "Rival", ["t1"]);
    const t: Tournament = {
      id: "t1",
      sourceId: "uskids",
      sourceKey: "1",
      flights: [
        {
          flightKey: "b11",
          label: "Boys 11",
          results: [{ juniorId: "u630106", pos: 3 }],
        },
        {
          flightKey: "b12",
          label: "Boys 12",
          results: [{ juniorId: "u1", pos: 1 }],
        },
      ],
    };
    expect(hasRealConfrontWithManuel(rival, manuel, mkTournamentByMap([t]))).toBe(false);
  });
});

/* ──────────────────────────────────────────────────────────────────
   countWins / countTop3
   ────────────────────────────────────────────────────────────────── */
describe("countWins / countTop3", () => {
  it("conta vitórias e top-3 em todos os flights onde aparece", () => {
    const rival = mkRival("u1", "Rival", ["t1", "t2", "t3"]);
    const ti = mkTournamentByMap([
      mkTournament("t1", "Boys 11", [{ juniorId: "u1", pos: 1 }]),
      mkTournament("t2", "Boys 11", [{ juniorId: "u1", pos: 3 }]),
      mkTournament("t3", "Boys 11", [{ juniorId: "u1", pos: 7 }]),
    ]);
    expect(countWins(rival, ti)).toBe(1);
    expect(countTop3(rival, ti)).toBe(2);
  });
});

/* ──────────────────────────────────────────────────────────────────
   computeTier
   ────────────────────────────────────────────────────────────────── */
describe("computeTier", () => {
  it("devolve null com < 2 posições conhecidas", () => {
    const r = mkRival("u1", "X", ["t1"]);
    const ti = mkTournamentByMap([
      mkTournament("t1", "Boys 11", [{ juniorId: "u1", pos: 1 }]),
    ]);
    expect(computeTier(r, ti)).toBeNull();
  });
  it("Elite: ≥ 5 vitórias e winRate ≥ 30%", () => {
    const r = mkRival("u1", "Champ", ["t1", "t2", "t3", "t4", "t5", "t6"]);
    const ti = mkTournamentByMap([
      mkTournament("t1", "B11", [{ juniorId: "u1", pos: 1 }]),
      mkTournament("t2", "B11", [{ juniorId: "u1", pos: 1 }]),
      mkTournament("t3", "B11", [{ juniorId: "u1", pos: 1 }]),
      mkTournament("t4", "B11", [{ juniorId: "u1", pos: 1 }]),
      mkTournament("t5", "B11", [{ juniorId: "u1", pos: 1 }]),
      mkTournament("t6", "B11", [{ juniorId: "u1", pos: 5 }]),
    ]);
    expect(computeTier(r, ti)).toBe("elite");
    expect(getTierLabel("elite")).toBe("Elite");
  });
  it("Beginner quando só finishes fracos", () => {
    const r = mkRival("u1", "Newbie", ["t1", "t2"]);
    const ti = mkTournamentByMap([
      mkTournament("t1", "B11", [{ juniorId: "u1", pos: 25 }]),
      mkTournament("t2", "B11", [{ juniorId: "u1", pos: 30 }]),
    ]);
    expect(computeTier(r, ti)).toBe("beginner");
  });
});

/* ──────────────────────────────────────────────────────────────────
   computeRoundStats — filtros 9H + sanity gross
   ────────────────────────────────────────────────────────────────── */
describe("computeRoundStats", () => {
  it("ignora flights 9H (par.length=18 mas com zeros)", () => {
    const r = mkRival("u1", "X", ["t1"]);
    // par com 9 buracos preenchidos + 9 zeros — não deve contar
    const t: Tournament = {
      id: "t1",
      sourceId: "uskids",
      sourceKey: "1",
      flights: [
        {
          flightKey: "b11",
          label: "Boys 11",
          par: [4, 4, 4, 3, 4, 4, 3, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          results: [
            { juniorId: "u1", pos: 1, rounds: [{ round: 1, gross: 40 }] },
          ],
        },
      ],
    };
    const stats = computeRoundStats(r, mkTournamentByMap([t]));
    expect(stats.total).toBe(0);
    expect(stats.mean).toBeNull();
  });

  it("calcula média/desvio para rondas 18H com gross plausível", () => {
    const r = mkRival("u1", "X", ["t1"]);
    const t: Tournament = {
      id: "t1",
      sourceId: "uskids",
      sourceKey: "1",
      flights: [
        {
          flightKey: "b11",
          label: "Boys 11",
          par: [4, 4, 4, 3, 4, 4, 3, 5, 5, 4, 4, 5, 3, 4, 4, 4, 3, 5], // par 72
          results: [
            {
              juniorId: "u1",
              pos: 1,
              rounds: [
                { round: 1, gross: 70 },
                { round: 2, gross: 74 },
              ],
            },
          ],
        },
      ],
    };
    const stats = computeRoundStats(r, mkTournamentByMap([t]));
    expect(stats.total).toBe(2);
    expect(stats.mean).toBe(72);
    expect(stats.bestToPar?.value).toBe(-2);
    expect(stats.worstToPar?.value).toBe(2);
    expect(stats.subParPct).toBe(50);
  });

  it("descarta valores fora do range plausível (gross < 50 ou > 200)", () => {
    const r = mkRival("u1", "X", ["t1"]);
    const t: Tournament = {
      id: "t1",
      sourceId: "uskids",
      sourceKey: "1",
      flights: [
        {
          flightKey: "b11",
          label: "Boys 11",
          par: [4, 4, 4, 3, 4, 4, 3, 5, 5, 4, 4, 5, 3, 4, 4, 4, 3, 5],
          results: [
            {
              juniorId: "u1",
              pos: 1,
              rounds: [
                { round: 1, gross: 999 }, // bug — rejeitado
                { round: 2, gross: 72 },
              ],
            },
          ],
        },
      ],
    };
    const stats = computeRoundStats(r, mkTournamentByMap([t]));
    expect(stats.total).toBe(1);
  });
});

/* ──────────────────────────────────────────────────────────────────
   bestRoundGross
   ────────────────────────────────────────────────────────────────── */
describe("bestRoundGross", () => {
  it("devolve menor gross entre todas as rondas", () => {
    const r = mkRival("u1", "X", ["t1", "t2"]);
    const ti = mkTournamentByMap([
      mkTournament("t1", "B11", [{ juniorId: "u1", pos: 1, gross: [70, 74] }]),
      mkTournament("t2", "B11", [{ juniorId: "u1", pos: 2, gross: [68, 75] }]),
    ]);
    const best = bestRoundGross(r, ti);
    expect(best?.gross).toBe(68);
    expect(best?.tournamentId).toBe("t2");
  });
  it("devolve null sem rondas", () => {
    const r = mkRival("u1", "X", []);
    expect(bestRoundGross(r, new Map())).toBeNull();
  });
});

/* ──────────────────────────────────────────────────────────────────
   categorizeTournamentLinks
   ────────────────────────────────────────────────────────────────── */
describe("categorizeTournamentLinks", () => {
  it("classifica USKids/SAT/FPG/GolfGenius correctamente", () => {
    const t: Tournament = {
      id: "t1",
      sourceId: "uskids",
      sourceKey: "1",
      flights: [],
      links: [
        { label: "USKids", url: "https://tournaments.uskidsgolf.com/x" },
        { label: "FPG",    url: "https://scoring.fpg.pt/y" },
        { label: "Doral",  url: "https://gg.golfgenius.com/z" },
        { label: "?",      url: "https://example.com" },
      ],
    };
    const out = categorizeTournamentLinks(t);
    const keys = out.map((c) => c.key);
    expect(keys[0]).toBe("sat");
    expect(keys).toContain("fpg");
    expect(keys).toContain("doral");
    expect(keys).toContain("other");
  });
  it("dedup'a (key,url) duplicados", () => {
    const t: Tournament = {
      id: "t1",
      sourceId: "uskids",
      sourceKey: "1",
      flights: [],
      links: [
        { label: "A", url: "https://www.signupanytime.com/x" },
        { label: "B", url: "https://www.signupanytime.com/x" },
      ],
    };
    const out = categorizeTournamentLinks(t);
    expect(out.length).toBe(1);
  });
});

/* ──────────────────────────────────────────────────────────────────
   getTournWeight + formatStars
   ────────────────────────────────────────────────────────────────── */
describe("getTournWeight", () => {
  it("dá 5★ a um torneio máximo (4 rondas, 300 inscritos, 20 nações)", () => {
    const t: Tournament = {
      id: "t1",
      sourceId: "uskids",
      sourceKey: "1",
      rounds: 4,
      flights: [{ flightKey: "all", label: "All", fieldSize: 300, results: [] }],
      extra: { nationsCount: 20 },
    };
    const w = getTournWeight(t);
    expect(w.stars).toBe(5);
    expect(w.score).toBeGreaterThanOrEqual(0.85);
  });
  it("dá 1★ a um torneio pequeno (1 ronda, poucos inscritos)", () => {
    const t: Tournament = {
      id: "t1",
      sourceId: "uskids",
      sourceKey: "1",
      rounds: 1,
      flights: [{ flightKey: "all", label: "All", fieldSize: 5, results: [] }],
    };
    const w = getTournWeight(t);
    expect(w.stars).toBe(1);
  });
  it("infere nº de rondas pelo 1º resultado quando t.rounds não está definido", () => {
    const t: Tournament = {
      id: "t1",
      sourceId: "uskids",
      sourceKey: "1",
      flights: [
        {
          flightKey: "b11",
          label: "B11",
          fieldSize: 50,
          results: [
            {
              juniorId: "u1",
              rounds: [
                { round: 1, gross: 70 },
                { round: 2, gross: 72 },
                { round: 3, gross: 71 },
              ],
            },
          ],
        },
      ],
    };
    const w = getTournWeight(t);
    expect(w.parts.rounds).toBeCloseTo(3 / 4, 5);
  });
  it("formatStars devolve 5 caracteres com mix ★/☆", () => {
    expect(formatStars(3)).toBe("★★★☆☆");
    expect(formatStars(0)).toBe("☆☆☆☆☆");
    expect(formatStars(5)).toBe("★★★★★");
  });
});
