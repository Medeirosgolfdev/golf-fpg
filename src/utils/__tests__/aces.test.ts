/**
 * Testes do detector de holes-in-one (src/utils/aces.ts).
 *
 * Regra: ace = gross 1 num buraco de par 3 ou 4 (par conhecido). Tudo o resto
 * (par != 3/4, par desconhecido, buracos não jogados=0/null) NÃO conta.
 */
import { describe, it, expect } from "vitest";
import {
  findAces,
  playerAces,
  countPlayerAces,
  tournamentAces,
  acesFromHoleScores,
  ACE_VALID_PARS,
} from "../aces";

describe("findAces — par alinhado por buraco", () => {
  it("detecta ace em par 3", () => {
    const scores = [4, 4, 1, 5, 3, 4, 4, 3, 4];
    const pars = [4, 4, 3, 5, 3, 4, 4, 3, 4];
    expect(findAces(scores, pars)).toEqual([{ hole: 3, par: 3 }]);
  });

  it("detecta ace em par 4 (raro mas válido)", () => {
    expect(findAces([1, 5], [4, 4])).toEqual([{ hole: 1, par: 4 }]);
  });

  it("rejeita gross 1 em par 5 (impossível → artefacto)", () => {
    expect(findAces([1], [5])).toEqual([]);
  });

  it("rejeita gross 1 em par 2 ou inválido", () => {
    expect(findAces([1, 1], [2, 0])).toEqual([]);
  });

  it("rejeita quando o par é desconhecido (null/undefined)", () => {
    expect(findAces([1, 1], [null, undefined])).toEqual([]);
  });

  it("ignora buracos não jogados (0) e nulls no gross", () => {
    expect(findAces([0, null, 4], [3, 3, 3])).toEqual([]);
  });

  it("detecta múltiplos aces na mesma ronda", () => {
    const scores = [1, 4, 1, 5];
    const pars = [3, 4, 4, 5];
    expect(findAces(scores, pars)).toEqual([
      { hole: 1, par: 3 },
      { hole: 3, par: 4 },
    ]);
  });

  it("tolera arrays de comprimentos diferentes (usa o mínimo)", () => {
    expect(findAces([1, 1], [3])).toEqual([{ hole: 1, par: 3 }]);
  });

  it("devolve vazio para entradas não-array", () => {
    // @ts-expect-error teste defensivo de runtime
    expect(findAces(null, null)).toEqual([]);
    // @ts-expect-error teste defensivo de runtime
    expect(findAces(undefined, [3])).toEqual([]);
  });

  it("ACE_VALID_PARS contém 3 e 4 e nada mais relevante", () => {
    expect(ACE_VALID_PARS.has(3)).toBe(true);
    expect(ACE_VALID_PARS.has(4)).toBe(true);
    expect(ACE_VALID_PARS.has(5)).toBe(false);
    expect(ACE_VALID_PARS.has(2)).toBe(false);
  });
});

describe("playerAces — multi-ronda vs flat", () => {
  it("usa roundScores quando presentes, com nº da ronda", () => {
    const p = {
      roundScores: [
        { round: 1, scores: [4, 4, 4], pars: [4, 4, 4] },
        { round: 2, scores: [4, 1, 4], pars: [4, 3, 4] },
      ],
    };
    expect(playerAces(p)).toEqual([{ hole: 2, par: 3, round: 2 }]);
  });

  it("soma aces de várias rondas", () => {
    const p = {
      roundScores: [
        { round: 1, scores: [1, 4], pars: [3, 4] },
        { round: 2, scores: [1, 4], pars: [4, 4] },
      ],
    };
    expect(playerAces(p)).toEqual([
      { hole: 1, par: 3, round: 1 },
      { hole: 1, par: 4, round: 2 },
    ]);
  });

  it("cai para scores/par flat quando não há roundScores", () => {
    const p = { scores: [4, 1, 4], par: [4, 3, 4] };
    expect(playerAces(p)).toEqual([{ hole: 2, par: 3 }]);
  });

  it("prefere roundScores e ignora os arrays flat se ambos existirem", () => {
    const p = {
      scores: [1, 1, 1],
      par: [3, 3, 3],
      roundScores: [{ round: 1, scores: [4, 4, 4], pars: [3, 3, 3] }],
    };
    expect(playerAces(p)).toEqual([]);
  });

  it("roundScores vazio cai para flat", () => {
    const p = { scores: [1], par: [3], roundScores: [] };
    expect(playerAces(p)).toEqual([{ hole: 1, par: 3 }]);
  });

  it("jogador sem dados de scorecard → vazio", () => {
    expect(playerAces({})).toEqual([]);
    expect(countPlayerAces({})).toBe(0);
  });

  it("countPlayerAces devolve o total", () => {
    const p = { scores: [1, 4, 1], par: [3, 4, 4] };
    expect(countPlayerAces(p)).toBe(2);
  });
});

describe("tournamentAces — agrega por jogador", () => {
  it("anexa o nome a cada ace e ignora jogadores sem ace", () => {
    const players = [
      { name: "Amélia Gabin", roundScores: [{ round: 2, scores: [4, 1], pars: [4, 3] }] },
      { name: "Sem Ace", scores: [4, 4], par: [4, 4] },
      { name: "Dois Aces", scores: [1, 1], par: [3, 4] },
    ];
    expect(tournamentAces(players)).toEqual([
      { name: "Amélia Gabin", hole: 2, par: 3, round: 2 },
      { name: "Dois Aces", hole: 1, par: 3 },
      { name: "Dois Aces", hole: 2, par: 4 },
    ]);
  });

  it("nome em falta vira string vazia", () => {
    expect(tournamentAces([{ scores: [1], par: [3] }])).toEqual([{ name: "", hole: 1, par: 3 }]);
  });

  it("torneio sem aces → vazio", () => {
    expect(tournamentAces([{ name: "A", scores: [4], par: [4] }])).toEqual([]);
  });
});

describe("acesFromHoleScores — mapa HOLES da JogadoresPage", () => {
  it("agrega aces de várias rondas, anexando o scoreId", () => {
    const holes = {
      "100": { g: [4, 1, 4], p: [4, 3, 4] },
      "200": { g: [4, 4, 4], p: [4, 4, 4] },
      "300": { g: [1], p: [4] },
    };
    expect(acesFromHoleScores(holes)).toEqual([
      { scoreId: "100", hole: 2, par: 3 },
      { scoreId: "300", hole: 1, par: 4 },
    ]);
  });

  it("ignora registos sem g/p válidos", () => {
    const holes = {
      "1": { g: undefined, p: [3] },
      "2": { p: [3] },
      "3": { g: [1], p: [3] },
    } as Record<string, { g?: (number | null)[]; p?: (number | null)[] }>;
    expect(acesFromHoleScores(holes)).toEqual([{ scoreId: "3", hole: 1, par: 3 }]);
  });

  it("null/undefined → vazio", () => {
    expect(acesFromHoleScores(null)).toEqual([]);
    expect(acesFromHoleScores(undefined)).toEqual([]);
  });

  it("g com nulls (buracos sem registo) não gera falsos aces", () => {
    const holes = { "1": { g: [null, null, 1], p: [3, 3, 3] } };
    expect(acesFromHoleScores(holes)).toEqual([{ scoreId: "1", hole: 3, par: 3 }]);
  });
});
