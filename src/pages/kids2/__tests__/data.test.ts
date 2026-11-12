/**
 * kids2/__tests__/data.test.ts
 *
 * Smoke tests para o loader canonico da KIDS2.
 *
 * Cobertura minima apos a migracao KIDS -> KIDS2 (2026-05):
 *   - normName: normalizacao de nomes (acentos, hifens, apostrofes)
 *   - computeRanking/computeTier: geração pelo nível em pancadas (nivelPancadas.ts)
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
  computeRanking,
  nivelIncerto,
  encodeRankingEntry,
  decodeRanking,
  getSharedFlightTids,
  hasRealConfrontWithManuel,
  countWins,
  countTop3,
  computeRoundStats,
  bestRoundGross,
  getTierLabel,
  type Junior,
  type Tournament,
  type RankingRow,
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
    // Com o filtro de circuito (10/11/2026): só os torneios filtrados contam.
    const nenhum = new Set<string>();
    expect(countWins(rival, ti, undefined, nenhum)).toBe(0);
    expect(countTop3(rival, ti, undefined, nenhum)).toBe(0);
    expect(countWins(rival, ti, undefined, new Set(rival.tournamentIds))).toBe(1);
  });
});

/* ------------------------------------------------------------------
   computeRanking -- ranking percentil por geração, pelo nível em pancadas
   ------------------------------------------------------------------ */
describe("computeRanking", () => {
  const nv = (nivel: number, peso = 10, voltas = 10) => ({ nivel, peso, voltas });
  const j1: Junior = { ...mkRival("j1", "Alpha", []), dob: "2013-01-01" };
  const j2: Junior = { ...mkRival("j2", "Beta", []), dob: "2013-05-10" };
  const j3: Junior = { ...mkRival("j3", "Gamma", []), dob: "2013-09-20" };
  const j4: Junior = { ...mkRival("j4", "Girl", []), dob: "2013-02-02", sex: "F" };

  it("menos pancadas = melhor; percentil 100 para o melhor da geração", () => {
    const ranking = computeRanking([j1, j2, j3], new Map(), new Map([["j1", nv(12)], ["j2", nv(3)], ["j3", nv(20)]]));
    expect(ranking.get("j2")?.rank).toBe(1);
    expect(ranking.get("j2")?.percentile).toBe(100);
    expect(ranking.get("j3")?.percentile).toBe(0);
    expect(ranking.get("j2")?.nivel).toBe(3);
  });

  it("rapazes e raparigas em gerações separadas; sem ano não entra", () => {
    const semAno: Junior = { ...mkRival("j5", "Mystery", []) };
    const ranking = computeRanking([j1, j4, semAno], new Map(), new Map([["j1", nv(12)], ["j4", nv(30)], ["j5", nv(1)]]));
    expect(ranking.get("j4")?.sex).toBe("F");
    expect(ranking.get("j4")?.rank).toBe(1);
    expect(ranking.has("j5")).toBe(false);
  });

  it("com menos de 3 voltas no último ano fica de fora", () => {
    const ranking = computeRanking([j1, j2], new Map(), new Map([["j1", nv(5, 1, 2)], ["j2", nv(9)]]));
    expect(ranking.has("j1")).toBe(false);
    expect(ranking.get("j2")?.rank).toBe(1);
  });

  it("computeTier usa o tier do ranking; poucas voltas abaixo do peso 6", () => {
    const ranking = computeRanking([j1, j2], new Map(), new Map([["j1", nv(2, 4)], ["j2", nv(15)]]));
    expect(computeTier(j1, ranking)).toBe("elite");
    expect(getTierLabel("elite")).toBe("Elite");
    expect(computeTier(j2, ranking)).toBe("beginner");
    expect(computeTier(j3, ranking)).toBeNull();
    expect(nivelIncerto(ranking.get("j1"))).toBe(true);
    expect(nivelIncerto(ranking.get("j2"))).toBe(false);
  });

  it("encode/decode (juniors-scout.json, campo r) reconstrói o ranking com nível e peso", () => {
    const ranking = computeRanking([j1, j2, j4], new Map(), new Map([["j1", nv(12, 8.5)], ["j2", nv(3)], ["j4", nv(9)]]));
    const decoded = decodeRanking([...ranking].map(([id, e]): [string, RankingRow] => [id, encodeRankingEntry(e)]));
    expect(decoded.size).toBe(ranking.size);
    for (const [id, e] of ranking) expect(decoded.get(id)).toEqual(e);
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

  it("volta de 9 buracos com par de 18 não conta (Fioranello 2022, Boys 7: 52 → «−18»)", () => {
    const r = mkRival("u1", "X", ["t1"]);
    const nove = [6, 5, 6, 5, 6, 6, 6, 6, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const t: Tournament = {
      id: "t1", sourceId: "uskids", sourceKey: "1",
      flights: [{
        flightKey: "b7", label: "Boys 7",
        par: [4, 3, 4, 4, 3, 4, 4, 5, 3, 5, 3, 4, 4, 5, 4, 4, 3, 4],
        results: [{ juniorId: "u1", pos: 1, rounds: [{ round: 1, gross: 52, strokes: nove }, { round: 2, gross: 58 }] }],
      }],
    };
    const stats = computeRoundStats(r, mkTournamentByMap([t]));
    expect(stats.total).toBe(0);
    expect(stats.bestToPar).toBeNull();
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

describe("corte de Elite — os primeiros 5 % da geração (12/11/2026)", () => {
  it("numa geração de 1267, o 64.º ainda é Elite e o 128.º (Benji Botham) passa a Forte", async () => {
    const { decodeRanking } = await import("../juniorCalc");
    const rows = Array.from({ length: 1267 }, (_, i) => [`j${i + 1}`, [2015, "M", i + 1, 6 + i / 100, 5]] as [string, [number, string, number, number, number]]);
    const r = decodeRanking(rows);
    expect(r.get("j1")!.tier).toBe("elite");
    expect(r.get("j64")!.tier).toBe("elite");
    expect(r.get("j128")!.tier).toBe("strong");
    expect(r.get("j380")!.tier).toBe("strong");   // o corte de Forte não mudou (top 30 %)
    expect(r.get("j400")!.tier).toBe("solid");
  });
});
