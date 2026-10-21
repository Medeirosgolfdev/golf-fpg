import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const r = require("./uskids-recusa.js");

// Página Playwright simulada: só o evaluate, que devolve {status, text}.
const paginaFalsa = (status, text) => {
  let n = 0;
  return { page: { evaluate: async () => { n++; return { status, text }; } }, chamadas: () => n };
};

describe("pageJSONcomRecusa", () => {
  it("JSON normal passa", async () => {
    const { page } = paginaFalsa(200, '{"flight_players":{}}');
    await expect(r.pageJSONcomRecusa(page, "u")).resolves.toEqual({ flight_players: {} });
  });
  it("429 e «Too many requests» com 200 são recusa (err.recusa)", async () => {
    for (const [s, t] of [[429, ""], [403, "Forbidden"], [503, ""], [200, "Too many requests"]]) {
      const { page } = paginaFalsa(s, t);
      const err = await r.pageJSONcomRecusa(page, "u").catch((e) => e);
      expect(err.recusa).toBe(true);
    }
  });
  it("500 é erro normal (não recusa)", async () => {
    const { page } = paginaFalsa(500, "boom");
    const err = await r.pageJSONcomRecusa(page, "u").catch((e) => e);
    expect(err.recusa).toBeUndefined();
    expect(err.message).toBe("HTTP 500");
  });
});

describe("deveManterAntigo — anti-encolhimento por torneio", () => {
  const res = (escaloes) => ({ escaloes: escaloes.map(([ag, n]) => ({ age_group: ag, nome: "Boys " + ag, rondas: [{ leaderboard: Array(n).fill({}) }] })) });
  const draw = (escaloes) => ({ escaloes: escaloes.map(([ag, n]) => ({ age_group: ag, nome: "Boys " + ag, rondas: [{ grupos: [{ jogadores: Array(n).fill({}) }] }] })) });

  it("sem antigo, grava", () => {
    expect(r.deveManterAntigo(undefined, res([[1, 5]]), r.contarJogadoresResultados).manter).toBe(false);
  });
  it("perda grande mantém o antigo", () => {
    const g = r.deveManterAntigo(res([[1, 40], [2, 40]]), res([[1, 40], [2, 5]]), r.contarJogadoresResultados);
    expect(g.manter).toBe(true);
  });
  it("escalão que desaparece mantém o antigo", () => {
    const g = r.deveManterAntigo(draw([[1, 10], [2, 1]]), draw([[1, 12]]), r.contarJogadoresDraw);
    expect(g.manter).toBe(true);
    expect(g.motivo).toMatch(/escal/);
  });
  it("crescer ou perder pouco substitui; --force substitui sempre", () => {
    expect(r.deveManterAntigo(res([[1, 40]]), res([[1, 38]]), r.contarJogadoresResultados).manter).toBe(false);
    expect(r.deveManterAntigo(res([[1, 40]]), res([[1, 0]]), r.contarJogadoresResultados, { force: true }).manter).toBe(false);
  });
});
