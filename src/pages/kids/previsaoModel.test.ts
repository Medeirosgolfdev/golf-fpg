import { describe, it, expect } from "vitest";
import { estimateField } from "./previsaoModel";

// Mocks mínimos do formato uskids-member-history-slim consumido por estimateField.
type Rounds = Record<string, { gross: number; strokes?: number[] }>;
type Player = { name: string; torneios: Record<string, { ageGroup: string; place: number | null; rounds: Rounds }> };

const ESC = "Boys 12";

function buildMh() {
  const jogadores: Record<string, Player> = {};
  let uid = 0;
  // nPlayers jogadores, cada um com nRounds voltas de gross (perRoundBase + i)
  const add = (tcode: string, perRoundBase: number, nRounds: number, nPlayers: number) => {
    for (let i = 0; i < nPlayers; i++) {
      const rounds: Rounds = {};
      for (let r = 0; r < nRounds; r++) rounds[String(r + 1)] = { gross: perRoundBase + i };
      jogadores[`j${uid++}`] = { name: `p-${tcode}-${i}`, torneios: { [tcode]: { ageGroup: ESC, place: null, rounds } } };
    }
  };
  add("v25", 65, 3, 12); // 3×18, field 12 → totais 195..228, top-10 = 222
  add("v19", 70, 3, 5);  // 3×18, field 5  → totais 210..222, sem top-10 (field < 10)
  add("v20", 72, 2, 5);  // 2×18 encurtado → totais 144..152 (escala diferente!)
  const torneios = {
    v25: { name: "Venice Open 2025", startDate: "", holesPerRound: 18 },
    v20: { name: "Venice Open 2020", startDate: "", holesPerRound: 18 },
    v19: { name: "Venice Open 2019", startDate: "", holesPerRound: 18 },
  };
  return { torneios, jogadores };
}

describe("estimateField — proteção anti-enviesamento de formato", () => {
  const est = estimateField(buildMh() as never, { t: 22243, name: "Venice Open 2026" } as never, ESC);
  const by = Object.fromEntries(est.editions.map(e => [e.year, e]));

  it("lista todas as edições encontradas", () => {
    expect(est.editions.length).toBe(3);
  });

  it("marca a edição encurtada (2×18) como fora da estimativa", () => {
    expect(by["2025"].counted).toBe(true);
    expect(by["2019"].counted).toBe(true);
    expect(by["2020"].counted).toBe(false);
    expect(by["2025"].nRounds).toBe(3);
    expect(by["2020"].nRounds).toBe(2);
  });

  it("define o formato de referência pela maioria (3×18)", () => {
    expect(est.formatLabel).toBe("3×18");
    expect(est.nRoundsTypical).toBe(3);
    expect(est.holesPerRoundTypical).toBe(18);
    expect(est.nCounted).toBe(2);
    expect(est.nExcluded).toBe(1);
  });

  it("médias NÃO são arrastadas pela edição de 2 voltas", () => {
    // vencedor: média de 195 (2025) e 210 (2019); 144 (2020) fica de fora
    expect(est.avgWinner).toBe(203);
    // com o bug antigo (a incluir 2020) daria round((195+210+144)/3) = 183
    expect(est.avgMedian).toBe(213);
  });

  it("top-10 só conta com field ≥ 10", () => {
    expect(by["2025"].top10).toBe(222); // field 12
    expect(by["2019"].top10).toBeNull(); // field 5
    expect(by["2020"].top10).toBeNull(); // field 5
    // média top-10 usa só a edição 2025 (única contada com field ≥ 10)
    expect(est.avgTop10).toBe(222);
  });
});

describe("estimateField — todas as edições no mesmo formato", () => {
  it("não exclui nada quando o formato é uniforme", () => {
    const jogadores: Record<string, Player> = {};
    let uid = 0;
    const add = (tcode: string, base: number) => {
      for (let i = 0; i < 6; i++) {
        const rounds: Rounds = { "1": { gross: base + i }, "2": { gross: base + i }, "3": { gross: base + i } };
        jogadores[`j${uid++}`] = { name: `p${uid}`, torneios: { [tcode]: { ageGroup: ESC, place: null, rounds } } };
      }
    };
    add("a24", 70);
    add("a23", 71);
    const mh = {
      torneios: {
        a24: { name: "Rome Classic 2024", startDate: "", holesPerRound: 18 },
        a23: { name: "Rome Classic 2023", startDate: "", holesPerRound: 18 },
      },
      jogadores,
    };
    const est = estimateField(mh as never, { t: 1, name: "Rome Classic 2025" } as never, ESC);
    expect(est.nExcluded).toBe(0);
    expect(est.nCounted).toBe(2);
    expect(est.editions.every(e => e.counted)).toBe(true);
  });
});
