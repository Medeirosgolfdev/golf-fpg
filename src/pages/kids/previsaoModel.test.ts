import { describe, it, expect } from "vitest";
import { estimateField, topFieldHoleStats, ultimas20, buildHoleProfile, porComprimento } from "./previsaoModel";
import type { PlayerPageData } from "../../data/playerDataLoader";

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

// «Bom dia» (04/11/2026): as 8 voltas de SD mais baixo das ÚLTIMAS 20 — nunca
// a melhor de sempre (num júnior, a volta antiga não diz como joga hoje).
describe("ultimas20 — as voltas do «Bom dia»", () => {
  const rounds = Array.from({ length: 25 }, (_, i) => ({
    scoreId: String(i), holeCount: 18,
    date: `${String((i % 28) + 1).padStart(2, "0")}-01-${2024 + Math.floor(i / 12)}`,
    sd: i === 0 ? 1 : 30 - i, // a volta 0 (a mais antiga) é a melhor de sempre
  }));
  const HOLES: Record<string, { g: number[]; p: number[]; m: number[] }> = {};
  for (const r of rounds) HOLES[r.scoreId] = { g: Array(18).fill(Number(r.scoreId) >= 17 ? 4 : 6), p: Array(18).fill(4), m: Array(18).fill(300) };
  const pd = { DATA: [{ rounds }], HOLES } as unknown as PlayerPageData;

  it("fica com as 20 mais recentes e as 8 melhores delas", () => {
    const u = ultimas20(pd);
    expect(u.sds.length).toBe(20);
    expect(u.bomIds.has("0")).toBe(false); // a melhor de sempre é antiga demais
    expect([...u.bomIds].sort((a, b) => +a - +b)).toEqual(["17", "18", "19", "20", "21", "22", "23", "24"]);
  });

  it("o perfil do Bom dia usa só essas voltas", () => {
    const bom = buildHoleProfile(pd, ultimas20(pd).bomIds);
    expect(bom.nHoles).toBe(8 * 18);
    expect(bom.expectedVsPar(4, 300)).toBe(0); // nessas 8 fez par em todos
  });
});

// «📏 O comprimento do tee» (04/11/2026): voltas de 18 dos últimos 6 meses em
// curtos / parecidos (±250 m) / compridos, comparados com o tee da prova.
describe("porComprimento — grupos pelo comprimento do tee", () => {
  const hoje = new Date(Date.now() - 30 * 864e5);
  const data = `${String(hoje.getDate()).padStart(2, "0")}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${hoje.getFullYear()}`;
  const volta = (id: string, metros: number, sd: number, gross: number) =>
    ({ scoreId: id, holeCount: 18, date: data, sd, gross, par: 72, meters: metros });
  const pd = { DATA: [{ rounds: [
    volta("a", 4500, 12, 80), volta("b", 5000, 10, 82), volta("c", 5100, 8, 80), volta("d", 5600, 14, 88),
    { scoreId: "e", holeCount: 18, date: "01-01-2020", sd: 1, gross: 70, par: 72, meters: 5000 }, // antiga: fora
  ] }], HOLES: {} } as unknown as PlayerPageData;

  it("separa por ±250 m do tee e faz as médias", () => {
    const g = porComprimento(pd, 5060);
    expect(g.map(x => [x.key, x.n])).toEqual([["curtos", 1], ["parecidos", 2], ["compridos", 1]]);
    const par = g[1];
    expect(par.sdMedio).toBe(9);
    expect(par.sdMelhor).toBe(8);
    expect(par.vsParMedio).toBe(9);
    expect(par.metros).toBe(5050);
  });
});

// Revisão de 10/11/2026 — E5 e E7.
describe("topFieldHoleStats — top-N só entre quem jogou todas as voltas", () => {
  const par = Array(18).fill(4);
  const volta = (g: number) => ({ gross: g, strokes: [g - 68, ...Array(17).fill(4)] });
  const jog = (name: string, gs: number[]) => ({ name, torneios: { w26: { ageGroup: ESC, place: null,
    rounds: Object.fromEntries(gs.map((g, i) => [String(i + 1), volta(g)])) } } });
  const mh = {
    torneios: { w26: { name: "World Championship 2026", startDate: "", holesPerRound: 18, par } },
    jogadores: { a: jog("Vencedor", [72, 72, 72]), b: jog("Segundo", [74, 74, 74]), c: jog("Uma volta", [77]) },
  };
  const top = topFieldHoleStats(mh as never, { t: 1, name: "World Championship 2027" } as never, ESC, 5)!;

  it("quem só jogou 1 volta (77) não passa à frente do vencedor (216)", () => {
    expect(top.players).toEqual(["Vencedor", "Segundo"]);
  });

  it("os nomes do hover acompanham as pancadas de cada buraco", () => {
    const cel = top.holes[0][0];
    expect(cel.scores).toEqual([4, 6]);
    expect(cel.nomes).toEqual(["Vencedor", "Segundo"]);
  });
});

describe("estimateField — escalão de 9 buracos num torneio «de 18»", () => {
  it("Boys 8: voltas de 40 contam (o mínimo de 55 é só para 18 buracos)", () => {
    const nove = [5, 5, 4, 4, 4, 5, 4, 5, 4]; // 40
    const jogadores: Record<string, Player> = {};
    for (let i = 0; i < 5; i++) {
      const rounds: Rounds = {};
      for (let r = 1; r <= 3; r++) rounds[String(r)] = { gross: 40 + i, strokes: [...nove.slice(0, 8), 4 + i] };
      jogadores[`b${i}`] = { name: `b${i}`, torneios: { v25: { ageGroup: "Boys 8", place: null, rounds } } };
    }
    const mh = { torneios: { v25: { name: "Venice Open 2025", startDate: "", holesPerRound: 18, par: Array(18).fill(4) } }, jogadores };
    const est = estimateField(mh as never, { t: 1, name: "Venice Open 2026" } as never, "Boys 8");
    expect(est.editions.length).toBe(1);
    expect(est.editions[0].holesPerRound).toBe(9);
    expect(est.editions[0].winner).toBe(120);
    expect(est.editions[0].parPerRound).toBe(36);
  });
});
