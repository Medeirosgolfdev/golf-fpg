/**
 * kids2/__tests__/data.test.ts
 *
 * Smoke tests para o loader canonico da KIDS2.
 *
 * Cobertura minima apos a migracao KIDS -> KIDS2 (2026-05):
 *   - normName: normalizacao de nomes (acentos, hifens, apostrofes)
 *   - computeTier: classificacao Elite/Forte/Solido/etc com base em pos
 *   - getSharedFlightTids + hasRealConfrontWithManuel: confronto real
 *   - countWins, countTop3: contagens triviais
 *   - computeRoundStats: filtro 9H, sanity de gross, media/desvio
 *   - bestRoundGross: melhor ronda absoluta
 *   - categorizeTournamentLinks: dedup + ordenacao fixa
 *   - getTournWeight: rounds + field + nationsCount -> estrelas
 *
 * Nada destes testes faz fetch -- todos constroem fixtures inline.
 */
import { describe, it, expect } from "vitest";
import {
  normName,
  computeTier,
  computeCareerScore,
  computeRanking,
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

/* ------------------------------------------------------------------
   Fixtures
   ------------------------------------------------------------------ */
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
  opts: { rounds?: number; fieldSize?: number; nationsCount?: number } = {},
): Tournament {
  const par = Array(18).fill(par18 / 18 | 0);
  par[0] = par18 - par.reduce((a: number, b: number) => a + b, 0) + par[0];
  return {
    id,
    sourceId: "uskids",
    sourceKey: id.replace(/[^0-9]/g, "") || id,
    name: `Test ${id}`,
    date: "2026-06-01",
    parTotal: par18,
    holesPerRound: 18,
    ...(opts.rounds != null ? { rounds: opts.rounds } : {}),
    ...(opts.nationsCount != null ? { extra: { nationsCount: opts.nationsCount } } : {}),
    flights: [
      {
        flightKey: "b11",
        label: flightLabel,
        ageMin: 11,
        ageMax: 11,
        sex: "M",
        par,
        ...(opts.fieldSize != null ? { fieldSize: opts.fieldSize } : {}),
        results: results.map((r) => ({
          juniorId: r.juniorId,
          pos: r.pos ?? null,
          status: r.status || "OK",
          totalGross: r.gross ? r.gross.reduce((a: number, b: number) => a + b, 0) : null,
          rounds: (r.gross || []).map((g: number, i: number) => ({ round: i + 1, gross: g })),
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

/* ------------------------------------------------------------------
   normName
   ------------------------------------------------------------------ */
describe("normName", () => {
  it("lowercase + trim + colapsa espacos", () => {
    expect(normName("  Manuel   Medeiros  ")).toBe("manuel medeiros");
  });
  it("remove diacriticos", () => {
    expect(normName("Jose Andre")).toBe("jose andre");
    expect(normName("Joao")).toBe(normName("Joao"));
  });
  it("hifens, apostrofes e pontos contam como espacos", () => {
    expect(normName("Castro-Ferreira")).toBe(normName("Castro Ferreira"));
    expect(normName("O'Neill")).toBe(normName("O Neill"));
    expect(normName("Jr.")).toBe("jr");
  });
  it("string vazia ou so whitespace devolve ''", () => {
    expect(normName("")).toBe("");
    expect(normName("   ")).toBe("");
  });
});

/* ------------------------------------------------------------------
   getSharedFlightTids + hasRealConfrontWithManuel
   ------------------------------------------------------------------ */
describe("getSharedFlightTids", () => {
  it("devolve [] se manuel e null", () => {
    const r = mkRival("u1", "Rival", ["t1"]);
    expect(getSharedFlightTids(r, null, new Map())).toEqual([]);
  });
  it("inclui tid onde ambos estao no mesmo flight", () => {
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
  it("exclui tid se rival e Manuel estao em flights diferentes", () => {
    const manuel = mkManuel();
    manuel.tournamentIds = ["t1"];
    const rival = mkRival("u1", "Rival", ["t1"]);
    const t: Tournament = {
      id: "t1",
      sourceId: "uskids",
      sourceKey: "1",
      flights: [
        { flightKey: "b11", label: "Boys 11", results: [{ juniorId: "u630106", pos: 3 }] },
        { flightKey: "b12", label: "Boys 12", results: [{ juniorId: "u1", pos: 1 }] },
      ],
    };
    expect(hasRealConfrontWithManuel(rival, manuel, mkTournamentByMap([t]))).toBe(false);
  });
});

/* ------------------------------------------------------------------
   countWins / countTop3
   ------------------------------------------------------------------ */
describe("countWins / countTop3", () => {
  it("conta vitorias e top-3 em todos os flights onde aparece", () => {
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

/* ------------------------------------------------------------------
   computeTier
   ------------------------------------------------------------------ */
describe("computeTier", () => {
  it("devolve null sem nenhuma posicao conhecida", () => {
    const r = mkRival("u1", "X", ["t1"]);
    // torneio existe mas o jogador não tem pos (null) → posCount=0 → null
    const ti = mkTournamentByMap([
      mkTournament("t1", "Boys 11", [{ juniorId: "u1", pos: null }]),
    ]);
    expect(computeTier(r, ti)).toBeNull();
  });

  it("1 resultado num torneio local da tier developing", () => {
    const r = mkRival("u1", "Solo", ["t1"]);
    const ti = mkTournamentByMap([
      mkTournament("t1", "Boys 11", [{ juniorId: "u1", pos: 1 }]),
    ]);
    // Sem fieldSize → stars=1.5, fMult=0.50; 1.5×0.50×10 = 7.5 → developing (≥2, <10)
    expect(computeTier(r, ti)).toBe("developing");
  });

  it("Elite: vitoria num torneio 5 estrelas (4 rondas, campo grande)", () => {
    const r = mkRival("u1", "Champ", ["t1", "t2"]);
    const ti = mkTournamentByMap([
      mkTournament("t1", "B11", [{ juniorId: "u1", pos: 1 }], 72, { rounds: 4, fieldSize: 300 }),
      mkTournament("t2", "B11", [{ juniorId: "u1", pos: 5 }], 72, { rounds: 4, fieldSize: 300 }),
    ]);
    expect(computeTier(r, ti)).toBe("elite");
    expect(getTierLabel("elite")).toBe("Elite");
  });

  it("Strong: 5 vitorias em local tours -- nao chega a Elite", () => {
    const r = mkRival("u1", "LocalKing", ["t1", "t2", "t3", "t4", "t5", "t6"]);
    const ti = mkTournamentByMap([
      mkTournament("t1", "B11", [{ juniorId: "u1", pos: 1 }]),
      mkTournament("t2", "B11", [{ juniorId: "u1", pos: 1 }]),
      mkTournament("t3", "B11", [{ juniorId: "u1", pos: 1 }]),
      mkTournament("t4", "B11", [{ juniorId: "u1", pos: 1 }]),
      mkTournament("t5", "B11", [{ juniorId: "u1", pos: 1 }]),
      mkTournament("t6", "B11", [{ juniorId: "u1", pos: 1 }]),
    ]);
    expect(computeTier(r, ti)).toBe("strong");
  });

  it("top-5 cap: 10 vitorias locais iguais a 5 -- nao avanca o tier", () => {
    const tids = Array.from({ length: 10 }, (_, i) => `t${i + 1}`);
    const r = mkRival("u1", "Grinder", tids);
    const t5 = mkTournamentByMap(
      tids.map((id) => mkTournament(id, "B11", [{ juniorId: "u1", pos: 1 }])),
    );
    const t6 = mkTournamentByMap(
      tids.slice(0, 6).map((id) => mkTournament(id, "B11", [{ juniorId: "u1", pos: 1 }])),
    );
    expect(computeTier(r, t5)).toBe(computeTier(mkRival("u1", "G2", tids.slice(0, 6)), t6));
  });

  it("Beginner quando so finishes fracos", () => {
    const r = mkRival("u1", "Newbie", ["t1", "t2"]);
    const ti = mkTournamentByMap([
      mkTournament("t1", "B11", [{ juniorId: "u1", pos: 25 }]),
      mkTournament("t2", "B11", [{ juniorId: "u1", pos: 30 }]),
    ]);
    expect(computeTier(r, ti)).toBe("beginner");
  });
});

/* ------------------------------------------------------------------
   computeCareerScore -- bonus sub-par
   ------------------------------------------------------------------ */
describe("computeCareerScore -- bonus sub-par", () => {
  it("sem bonus quando toPar e positivo", () => {
    const r = mkRival("u1", "X", ["t1", "t2"]);
    const ti = mkTournamentByMap([
      mkTournament("t1", "B11", [{ juniorId: "u1", pos: 1 }]),
      mkTournament("t2", "B11", [{ juniorId: "u1", pos: 2 }]),
    ]);
    const score = computeCareerScore(r, ti)!;
    // Sem fieldSize → stars=1.5, fMult=0.50; posScore(1)=10, posScore(2)=8
    // t1: 1.5×0.50×10 = 7.5 | t2: 1.5×0.50×8 = 6.0 | total = 13.5
    expect(score).toBeCloseTo(13.5, 3);
  });

  it("bonus x1.3 quando toPar=-3", () => {
    const r = mkRival("u1", "SubPar", ["t1", "t2"]);
    const t1: Tournament = {
      id: "t1", sourceId: "uskids", sourceKey: "1",
      name: "T1", date: "2026-06-01", parTotal: 72, holesPerRound: 18, rounds: 1, flights: [
        { flightKey: "b11", label: "B11", ageMin: 11, ageMax: 11, sex: "M",
          results: [{ juniorId: "u1", pos: 1, toPar: -3, status: "OK" }] },
      ], links: [],
    };
    const t2: Tournament = {
      id: "t2", sourceId: "uskids", sourceKey: "2",
      name: "T2", date: "2026-06-08", parTotal: 72, holesPerRound: 18, rounds: 1, flights: [
        { flightKey: "b11", label: "B11", ageMin: 11, ageMax: 11, sex: "M",
          results: [{ juniorId: "u1", pos: 2, toPar: 0, status: "OK" }] },
      ], links: [],
    };
    const ti = new Map([["t1", t1], ["t2", t2]]);
    const score = computeCareerScore(r, ti)!;
    // Sem fieldSize → stars=1.5, fMult=0.50
    // t1: 1.5×0.50×10×1.3(toPar=-3) = 9.75 | t2: 1.5×0.50×8 = 6.0 | total = 15.75
    expect(score).toBeCloseTo(9.75 + 6.0, 3);
  });

  it("bonus capped a x1.5 quando toPar <= -5", () => {
    const r = mkRival("u1", "Eagle", ["t1", "t2"]);
    const t1: Tournament = {
      id: "t1", sourceId: "uskids", sourceKey: "1",
      name: "T1", date: "2026-06-01", parTotal: 72, holesPerRound: 18, rounds: 1, flights: [
        { flightKey: "b11", label: "B11", ageMin: 11, ageMax: 11, sex: "M",
          results: [{ juniorId: "u1", pos: 1, toPar: -10, status: "OK" }] },
      ], links: [],
    };
    const t2 = mkTournament("t2", "B11", [{ juniorId: "u1", pos: 3 }]);
    const ti = new Map([["t1", t1], ["t2", t2]]);
    const score = computeCareerScore(r, ti)!;
    // Sem fieldSize → stars=1.5, fMult=0.50; posScore(3)=6
    // t1: 1.5×0.50×10×1.5(cap) = 11.25 | t2: 1.5×0.50×6 = 4.5 | total = 15.75
    expect(score).toBeCloseTo(11.25 + 4.5, 3);
  });
});

/* ------------------------------------------------------------------
   computeRanking -- ranking percentil por coorte
   ------------------------------------------------------------------ */
describe("computeRanking", () => {
  it("melhor da coorte tem percentil 100", () => {
    const j1: Junior = { ...mkRival("j1", "Alpha", ["t1", "t2"]), dob: "2013-01-01" };
    const j2: Junior = { ...mkRival("j2", "Beta",  ["t3", "t4"]), dob: "2013-05-10" };
    const j3: Junior = { ...mkRival("j3", "Gamma", ["t5", "t6"]), dob: "2013-09-20" };
    const ti = mkTournamentByMap([
      mkTournament("t1", "B12", [{ juniorId: "j1", pos: 1 }], 72, { rounds: 4, fieldSize: 300 }),
      mkTournament("t2", "B12", [{ juniorId: "j1", pos: 2 }], 72, { rounds: 4, fieldSize: 300 }),
      mkTournament("t3", "B12", [{ juniorId: "j2", pos: 1 }]),
      mkTournament("t4", "B12", [{ juniorId: "j2", pos: 1 }]),
      mkTournament("t5", "B12", [{ juniorId: "j3", pos: 25 }]),
      mkTournament("t6", "B12", [{ juniorId: "j3", pos: 30 }]),
    ]);
    const ranking = computeRanking([j1, j2, j3], ti);
    expect(ranking.get("j1")?.percentile).toBe(100);
    expect(ranking.get("j1")?.rank).toBe(1);
    expect(ranking.get("j3")?.rank).toBe(3);
    expect(ranking.get("j3")?.percentile).toBe(0);
  });

  it("jogador sem birthYear inferivel nao entra no ranking", () => {
    const j4: Junior = { ...mkRival("j4", "Mystery", ["t7", "t8"]) };
    const t7: Tournament = {
      id: "t7", sourceId: "uskids", sourceKey: "7",
      name: "T7", date: "2025-01-01", parTotal: 72, holesPerRound: 18, rounds: 1, flights: [
        { flightKey: "open", label: "Open", results: [{ juniorId: "j4", pos: 1 }] },
      ], links: [],
    };
    const t8: Tournament = {
      id: "t8", sourceId: "uskids", sourceKey: "8",
      name: "T8", date: "2025-02-01", parTotal: 72, holesPerRound: 18, rounds: 1, flights: [
        { flightKey: "open", label: "Open", results: [{ juniorId: "j4", pos: 2 }] },
      ], links: [],
    };
    const ranking = computeRanking([j4], new Map([["t7", t7], ["t8", t8]]));
    expect(ranking.has("j4")).toBe(false);
  });

  it("computeTier com ranking usa o tier percentil", () => {
    const j1: Junior = { ...mkRival("j1", "Top", ["t1", "t2"]), dob: "2013-01-01" };
    const j2: Junior = { ...mkRival("j2", "Low", ["t3", "t4"]), dob: "2013-06-01" };
    const ti = mkTournamentByMap([
      mkTournament("t1", "B12", [{ juniorId: "j1", pos: 1 }], 72, { rounds: 4, fieldSize: 300 }),
      mkTournament("t2", "B12", [{ juniorId: "j1", pos: 2 }], 72, { rounds: 4, fieldSize: 300 }),
      mkTournament("t3", "B12", [{ juniorId: "j2", pos: 25 }]),
      mkTournament("t4", "B12", [{ juniorId: "j2", pos: 30 }]),
    ]);
    const ranking = computeRanking([j1, j2], ti);
    expect(computeTier(j1, ti, ranking)).toBe("elite");
    expect(computeTier(j2, ti, ranking)).toBe("beginner");
  });
});

/* ------------------------------------------------------------------
   computeRoundStats -- filtros 9H + sanity gross
   ------------------------------------------------------------------ */
describe("computeRoundStats", () => {
  it("ignora flights 9H (par.length=18 mas com zeros)", () => {
    const r = mkRival("u1", "X", ["t1"]);
    const t: Tournament = {
      id: "t1", sourceId: "uskids", sourceKey: "1",
      flights: [{
        flightKey: "b11", label: "Boys 11",
        par: [4, 4, 4, 3, 4, 4, 3, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        results: [{ juniorId: "u1", pos: 1, rounds: [{ round: 1, gross: 40 }] }],
      }],
    };
    const stats = computeRoundStats(r, mkTournamentByMap([t]));
    expect(stats.total).toBe(0);
    expect(stats.mean).toBeNull();
  });

  it("calcula media/desvio para rondas 18H com gross plausivel", () => {
    const r = mkRival("u1", "X", ["t1"]);
    const t: Tournament = {
      id: "t1", sourceId: "uskids", sourceKey: "1",
      flights: [{
        flightKey: "b11", label: "Boys 11",
        par: [4, 4, 4, 3, 4, 4, 3, 5, 5, 4, 4, 5, 3, 4, 4, 4, 3, 5],
        results: [{
          juniorId: "u1", pos: 1,
          rounds: [{ round: 1, gross: 70 }, { round: 2, gross: 74 }],
        }],
      }],
    };
    const stats = computeRoundStats(r, mkTournamentByMap([t]));
    expect(stats.total).toBe(2);
    expect(stats.mean).toBe(72);
    expect(stats.bestToPar?.value).toBe(-2);
    expect(stats.worstToPar?.value).toBe(2);
    expect(stats.subParPct).toBe(50);
  });

  it("descarta valores fora do range plausivel (gross < 50 ou > 200)", () => {
    const r = mkRival("u1", "X", ["t1"]);
    const t: Tournament = {
      id: "t1", sourceId: "uskids", sourceKey: "1",
      flights: [{
        flightKey: "b11", label: "Boys 11",
        par: [4, 4, 4, 3, 4, 4, 3, 5, 5, 4, 4, 5, 3, 4, 4, 4, 3, 5],
        results: [{
          juniorId: "u1", pos: 1,
          rounds: [{ round: 1, gross: 999 }, { round: 2, gross: 72 }],
        }],
      }],
    };
    const stats = computeRoundStats(r, mkTournamentByMap([t]));
    expect(stats.total).toBe(1);
  });
});

/* ------------------------------------------------------------------
   bestRoundGross
   ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------
   categorizeTournamentLinks
   ------------------------------------------------------------------ */
describe("categorizeTournamentLinks", () => {
  it("classifica USKids/SAT/FPG/GolfGenius correctamente", () => {
    const t: Tournament = {
      id: "t1", sourceId: "uskids", sourceKey: "1", flights: [],
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
      id: "t1", sourceId: "uskids", sourceKey: "1", flights: [],
      links: [
        { label: "A", url: "https://www.signupanytime.com/x" },
        { label: "B", url: "https://www.signupanytime.com/x" },
      ],
    };
    const out = categorizeTournamentLinks(t);
    expect(out.length).toBe(1);
  });
});

/* ------------------------------------------------------------------
   computeCareerScore -- bonus de distância
   ------------------------------------------------------------------ */
describe("computeCareerScore -- bonus distancia", () => {
  /** Cria torneio com yards[] e par[] definidos para simular campo de N metros. */
  function mkTournWithYards(id: string, totalYards: number, pos: number): Tournament {
    // 18 buracos de par 4, yards iguais
    const yardsPerHole = Math.round(totalYards / 18);
    return {
      id, sourceId: "uskids", sourceKey: id,
      name: `Test ${id}`, date: "2026-06-01",
      parTotal: 72, holesPerRound: 18, rounds: 1,
      flights: [{
        flightKey: "b12", label: "Boys 12", ageMin: 12, ageMax: 12, sex: "M",
        par: Array(18).fill(4),
        yards: Array(18).fill(yardsPerHole),
        results: [{ juniorId: "u1", pos, status: "OK" }],
      }],
      links: [],
    };
  }

  it("sem yards definidos usa dMult=1.0 (sem bonus)", () => {
    const r = mkRival("u1", "X", ["t1"]);
    const ti = mkTournamentByMap([mkTournament("t1", "B12", [{ juniorId: "u1", pos: 1 }])]);
    const score = computeCareerScore(r, ti)!;
    // stars=1.5, fMult=0.50, posScore=10, recency=1.0, dMult=1.0
    expect(score).toBeCloseTo(1.5 * 0.50 * 10 * 1.0, 2);
  });

  it("campo curto (<4400m = ~4812yds) tem dMult=1.0", () => {
    // 4200 yards × 0.9144 ≈ 3841m → <4400 → dMult=1.00
    const r = mkRival("u1", "X", ["t1"]);
    const ti = mkTournamentByMap([mkTournWithYards("t1", 4200, 1)]);
    const score = computeCareerScore(r, ti)!;
    expect(score).toBeCloseTo(1.5 * 0.50 * 10 * 1.00, 2);
  });

  it("campo medio (5000-5100m = ~5468-5578yds) tem dMult=1.13", () => {
    // 5500 yards × 0.9144 ≈ 5029m → 5000-5100 → dMult=1.13
    const r = mkRival("u1", "X", ["t1"]);
    const ti = mkTournamentByMap([mkTournWithYards("t1", 5500, 1)]);
    const score = computeCareerScore(r, ti)!;
    expect(score).toBeCloseTo(1.5 * 0.50 * 10 * 1.13, 2);
  });

  it("campo longo (+5500m = ~6015yds+) tem dMult=1.60", () => {
    // 6200 yards × 0.9144 ≈ 5669m → ≥5500 → dMult=1.60
    const r = mkRival("u1", "X", ["t1"]);
    const ti = mkTournamentByMap([mkTournWithYards("t1", 6200, 1)]);
    const score = computeCareerScore(r, ti)!;
    expect(score).toBeCloseTo(1.5 * 0.50 * 10 * 1.60, 2);
  });
});

/* ------------------------------------------------------------------
   getTournWeight + formatStars
   ------------------------------------------------------------------ */
describe("getTournWeight", () => {
  it("da 5.5 estrelas a um torneio WC (3 rondas, 150 inscritos, 30 nacoes)", () => {
    const t: Tournament = {
      id: "t1", sourceId: "uskids", sourceKey: "1",
      rounds: 3,
      flights: [{ flightKey: "all", label: "All", fieldSize: 150, results: [] }],
      extra: { nationsCount: 30 },
    };
    const w = getTournWeight(t);
    // 0.50×0.85 + 0.35×0.50 + 0.15×1.0 = 0.750 → ≥0.70 → 5.5★
    expect(w.stars).toBe(5.5);
    expect(w.score).toBeGreaterThanOrEqual(0.70);
  });

  it("da 5 estrelas a um EC (3 rondas, 60 inscritos, 15 nacoes)", () => {
    const t: Tournament = {
      id: "t1", sourceId: "uskids", sourceKey: "1",
      rounds: 3,
      flights: [{ flightKey: "all", label: "All", fieldSize: 60, results: [] }],
      extra: { nationsCount: 15 },
    };
    const w = getTournWeight(t);
    // 0.50×0.85 + 0.35×0.20 + 0.15×0.50 = 0.570 → ≥0.56 → 5★
    expect(w.stars).toBe(5.0);
  });
  it("da 1.5 estrelas a um torneio pequeno (1 ronda, poucos inscritos)", () => {
    const t: Tournament = {
      id: "t1", sourceId: "uskids", sourceKey: "1",
      rounds: 1,
      flights: [{ flightKey: "all", label: "All", fieldSize: 5, results: [] }],
    };
    const w = getTournWeight(t);
    // 0.60×0.20 + 0.40×(5/300) = 0.12 + 0.0067 = 0.1267 → ≥0.10 → 1.5★
    expect(w.stars).toBe(1.5);
  });
  it("infere nr de rondas pelo 1o resultado quando t.rounds nao esta definido", () => {
    const t: Tournament = {
      id: "t1", sourceId: "uskids", sourceKey: "1",
      flights: [{
        flightKey: "b11", label: "B11", fieldSize: 50,
        results: [{
          juniorId: "u1",
          rounds: [{ round: 1, gross: 70 }, { round: 2, gross: 72 }, { round: 3, gross: 71 }],
        }],
      }],
    };
    const w = getTournWeight(t);
    // rondas não-linear: 3 rondas → 0.85
    expect(w.parts.rounds).toBeCloseTo(0.85, 5);
  });
  it("formatStars — inteiros e meias-estrelas", () => {
    expect(formatStars(3)).toBe("★★★☆☆");
    expect(formatStars(0)).toBe("☆☆☆☆☆");
    expect(formatStars(5)).toBe("★★★★★");
    expect(formatStars(4.5)).toBe("★★★★½");   // 4 full + ½, 0 empty
    expect(formatStars(5.5)).toBe("★★★★★½"); // 5 full + ½ (acima do tecto de 5)
    expect(formatStars(2.5)).toBe("★★½☆☆");  // 2 full + ½ + 2 empty
  });
});
