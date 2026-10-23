import { describe, it, expect } from "vitest";
import { buildYearTournaments, buildRankRows, buildTournCols, rankPositions, cutInfo, BEST_SD_N } from "../ranking/fpgRanking";
import type { Tournament } from "../fpgTypes";

/** Um torneio de 1 volta: cada jogador com o seu ±par (par 72). */
const t1 = (tcode: string, date: string, name: string, players: [fed: string, toPar: number, sd?: number][]) => ({
  ccode: "1", tcode, date, name, rounds: 1,
  players: players.map(([fed, tp, sd]) => ({
    fedCode: fed, name: `J${fed}`, grossTotal: 72 + tp, toPar: tp,
    roundScores: sd != null ? [{ round: 1, gross: 72 + tp, sd, scores: [], pars: [] }] : undefined,
  })),
}) as unknown as Tournament;

const opts = (year: string, extra: Partial<Parameters<typeof buildRankRows>[1]> = {}) =>
  ({ playersDB: {}, year, specialRules: false, metric: "pts" as const, ...extra });

describe("ranking por pontos (sem regras PJA = Classificações)", () => {
  it("par = 25 pts; só as 14 melhores voltas somam", () => {
    const ts = Array.from({ length: 16 }, (_, i) => t1(String(100 + i), `2026-03-${String(i + 1).padStart(2, "0")}`, `Torneio ${i}`, [["1", i]]));
    const [row] = buildRankRows(buildYearTournaments(ts, "2026", false), opts("2026"));
    // ±par 0..15 → pts 25..10; as 14 melhores = 25..12
    expect(row.total).toBe(Array.from({ length: 14 }, (_, i) => 25 - i).reduce((a, b) => a + b, 0));
    expect(row.voltas).toBe(16);
    expect(cutInfo(row, "pts")).toMatchObject({ cortadas: 2, contadas: 14 });
  });
  it("# pela métrica: mais pontos à frente", () => {
    const rows = buildRankRows([t1("1", "2026-01-01", "T", [["a", 3], ["b", -2]])], opts("2026"));
    const rk = rankPositions(rows, "pts");
    expect([rk.get("b"), rk.get("a")]).toEqual([1, 2]);
  });
});

describe("ranking por SD (Sub-12)", () => {
  it(`média das ${BEST_SD_N} melhores SD; quem tem menos de 4 voltas fica de fora`, () => {
    const ts = Array.from({ length: 10 }, (_, i) => t1(String(200 + i), `2026-04-${String(i + 1).padStart(2, "0")}`, `T${i}`,
      [["x", 5, 20 + i], ...(i < 3 ? [["y", 0, 10] as [string, number, number]] : [])]));
    const rows = buildRankRows(buildYearTournaments(ts, "2026", false), opts("2026", { metric: "sd" }));
    expect(rows.map(r => r.key)).toEqual(["x"]);
    expect(rows[0].total).toBe(Math.round(((20 + 21 + 22 + 23 + 24 + 25 + 26 + 27) / 8) * 10) / 10);
  });
});

describe("regras PJA 2026+", () => {
  it("Aquapor não conta para quem joga Drive Tour; só os 2 primeiros Aquapor do ano", () => {
    const ts = [
      t1("1", "2026-01-10", "1º Torneio Drive Tour Madeira - Palheiro Golf", [["dt", 0]]),
      t1("2", "2026-02-01", "1º Torneio do Circuito Aquapor-Morgado Golf", [["dt", 0], ["aq", 0]]),
      t1("3", "2026-03-01", "2º Torneio do Circuito Aquapor-Vidago", [["aq", 0]]),
      t1("4", "2026-04-01", "3º Torneio do Circuito Aquapor-Amarante", [["aq", 0]]),
    ];
    const rows = buildRankRows(buildYearTournaments(ts, "2026", true), opts("2026", { specialRules: true }));
    const by = Object.fromEntries(rows.map(r => [r.key, r]));
    expect(by.dt.total).toBe(25);
    expect([...by.dt.results.values()].filter(r => r.excluded)).toHaveLength(1);
    expect(by.aq.total).toBe(50);
  });
  it("Greatgolf Main: a R1 não conta e não aparece como coluna", () => {
    const gg = { ccode: "1", tcode: "10294", date: "2026-05-01", name: "Greatgolf Junior Open", rounds: 3,
      players: [{ fedCode: "g", name: "G", roundScores: [72, 73, 74].map((gross, i) => ({ round: i + 1, gross, parTotal: 72, scores: [], pars: [] })) }],
    } as unknown as Tournament;
    const [row] = buildRankRows([gg], opts("2026", { specialRules: true }));
    expect(row.total).toBe(24 + 23);
    expect(buildTournCols([gg], "2026", true, false)[0].rounds.map(r => r.label)).toEqual(["R2", "R3"]);
  });
});

describe("regra PJA 2025", () => {
  it("Vale Pisão D1+D2 = um torneio de 2 rondas", () => {
    const d = (tcode: string, gross: number) => ({ ccode: "9", tcode, date: "2025-06-0" + tcode.slice(-1), name: "PJA TOUR Vale Pisão", rounds: 1,
      players: [{ fedCode: "v", name: "V", grossTotal: gross, toPar: gross - 72, roundScores: [{ round: 1, gross, scores: [], pars: Array(18).fill(4) }] }] }) as unknown as Tournament;
    const yt = buildYearTournaments([d("10370", 75), d("10371", 70)], "2025", true);
    expect(yt).toHaveLength(1);
    expect(yt[0].tcode).toBe("10370+10371");
    const [row] = buildRankRows(yt, opts("2025", { specialRules: true }));
    expect(row.total).toBe(22 + 27);
  });
});
