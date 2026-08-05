import { describe, it, expect } from "vitest";
import { estimateField } from "./previsaoModel";

// Mocks mínimos do formato uskids-member-history-slim consumido por estimateField.
type Rounds = Record<string, { gross: number; strokes?: number[] }>;
type Player = { name: string; torneios: Record<string, { ageGroup: string; place: number | null; rounds: Rounds }> };

const ESC = "Boys 12";

// Gera `nPlayers` jogadores no torneio `tcode`, cada um com `nRounds` voltas de
// gross constante (perRoundBase + i) → totais espaçados e ordenáveis.
function pushEdition(
  jogadores: Record<string, Player>, uid: { n: number },
  tcode: string, perRoundBase: number, nRounds: number, nPlayers: number,
) {
  for (let i = 0; i < nPlayers; i++) {
    const rounds: Rounds = {};
    for (let r = 0; r < nRounds; r++) rounds[String(r + 1)] = { gross: perRoundBase + i };
    jogadores[`j${uid.n++}`] = { name: `p-${tcode}-${i}`, torneios: { [tcode]: { ageGroup: ESC, place: null, rounds } } };
  }
}

describe("estimateField — protecções anti-enviesamento", () => {
  const jogadores: Record<string, Player> = {};
  const uid = { n: 0 };
  pushEdition(jogadores, uid, "v25", 65, 3, 12); // 3×18, field 12 → winner 195, top10 222, median 210
  pushEdition(jogadores, uid, "v24", 66, 3, 10); // 3×18, field 10 → winner 198, top10 225, median 210
  pushEdition(jogadores, uid, "v19", 80, 3, 5);  // 3×18, field 5  → winner 240 (outlier alto), excl. por field
  pushEdition(jogadores, uid, "v20", 72, 2, 8);  // 2×18 encurtado → winner 144, excl. por formato
  const mh = {
    torneios: {
      v25: { name: "Venice Open 2025", startDate: "", holesPerRound: 18 },
      v24: { name: "Venice Open 2024", startDate: "", holesPerRound: 18 },
      v20: { name: "Venice Open 2020", startDate: "", holesPerRound: 18 },
      v19: { name: "Venice Open 2019", startDate: "", holesPerRound: 18 },
    },
    jogadores,
  };
  const est = estimateField(mh as never, { t: 22243, name: "Venice Open 2026" } as never, ESC);
  const by = Object.fromEntries(est.editions.map(e => [e.year, e]));

  it("lista todas as edições encontradas", () => {
    expect(est.editions.length).toBe(4);
  });

  it("exclui a edição de formato diferente (2×18) — motivo 'format'", () => {
    expect(by["2020"].counted).toBe(false);
    expect(by["2020"].exclReason).toBe("format");
    expect(by["2020"].nRounds).toBe(2);
  });

  it("exclui a edição de field pequeno (outlier alto) — motivo 'field'", () => {
    expect(by["2019"].counted).toBe(false);
    expect(by["2019"].exclReason).toBe("field");
    expect(by["2019"].field).toBe(5);
    expect(by["2019"].winner).toBe(240); // continua visível na tabela, só não conta
  });

  it("conta apenas as edições fiáveis (mesmo formato + field ≥ 10)", () => {
    expect(by["2025"].counted).toBe(true);
    expect(by["2024"].counted).toBe(true);
    expect(est.formatLabel).toBe("3×18");
    expect(est.minField).toBe(10);
    expect(est.nCounted).toBe(2);
    expect(est.nExcluded).toBe(2);
    expect(est.nExcludedFormat).toBe(1);
    expect(est.nExcludedField).toBe(1);
  });

  it("médias NÃO são arrastadas nem pela edição curta (144) nem pelo outlier alto (240)", () => {
    // vencedor: média de 195 (2025) e 198 (2024) = 197
    expect(est.avgWinner).toBe(197);
    // sem as protecções (todas as 3×18): round((195+198+240)/3) = 211 → inflado
    expect(est.avgMedian).toBe(210);
    expect(est.avgTop10).toBe(224); // média de 222 e 225
  });
});

describe("estimateField — fallback quando nenhuma edição chega ao field mínimo", () => {
  it("usa todas as do formato (torneio pequeno) em vez de ficar sem estimativa", () => {
    const jogadores: Record<string, Player> = {};
    const uid = { n: 0 };
    pushEdition(jogadores, uid, "a24", 70, 3, 6); // field 6 < 10
    pushEdition(jogadores, uid, "a23", 71, 3, 6); // field 6 < 10
    const mh = {
      torneios: {
        a24: { name: "Rome Classic 2024", startDate: "", holesPerRound: 18 },
        a23: { name: "Rome Classic 2023", startDate: "", holesPerRound: 18 },
      },
      jogadores,
    };
    const est = estimateField(mh as never, { t: 1, name: "Rome Classic 2025" } as never, ESC);
    expect(est.minField).toBeNull(); // guard de field não aplicado
    expect(est.nExcluded).toBe(0);
    expect(est.nCounted).toBe(2);
    expect(est.editions.every(e => e.counted)).toBe(true);
  });
});
