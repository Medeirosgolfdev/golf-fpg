/**
 * scripts/lib/uma-categoria.js — cada jogador numa só categoria por prova
 * (casos reais: Dmitrii Elchaninov no Circuito Juvenil Zona C 2026, NextCaddy 61217).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { umaCategoriaPorProva, especificidade } = require("./uma-categoria.js");

const prova = (tid) => (/^nc(\d+)_/.exec(tid) || [])[1] ?? null;
const jog = (lic, p, t) => ({ n: `J ${lic}`, lic, p, t });

describe("umaCategoriaPorProva", () => {
  it("scratch fica, hándicap da mesma volta sai", () => {
    const t = {
      nc61217_alevín_m_sc: { ageGroup: "Alevín", categoryName: "Scratch Alevin Masculino", players: [jog("AM84955303", 1, 71), jog("X1", 2, 74)] },
      nc61217_alevín_m_hcp: { ageGroup: "Alevín", categoryName: "Handicap Alevin Masculino", players: [jog("AM84955303", 8, 74), jog("X1", 3, 70)] },
    };
    expect(umaCategoriaPorProva(t, prova)).toBe(2);
    expect(Object.keys(t)).toEqual(["nc61217_alevín_m_sc"]);
    expect(t.nc61217_alevín_m_sc.players.map((p) => p.p)).toEqual([1, 2]);
  });

  it("o escalão ganha à geral; quem só está na geral fica lá, com a posição da fonte", () => {
    const t = {
      nc60051_juvenil_sc: { ageGroup: "Juvenil", categoryName: "Scratch Juvenil", players: [jog("A", 1, 70), jog("B", 2, 75)] },
      nc60051_alevín_sc: { ageGroup: "Alevín", categoryName: "Scratch Alevín", players: [jog("B", 1, 75)] },
    };
    umaCategoriaPorProva(t, prova);
    expect(t.nc60051_alevín_sc.players.map((p) => p.lic)).toEqual(["B"]);
    expect(t.nc60051_juvenil_sc.players.map((p) => [p.lic, p.p])).toEqual([["A", 1]]);
  });

  it("provas diferentes não se tocam; sem licença casa pelo nome", () => {
    const t = {
      nc1_alevín_sc: { ageGroup: "Alevín", players: [{ n: "Pérez, Ana" }] },
      nc2_alevín_sc: { ageGroup: "Alevín", players: [{ n: "Pérez, Ana" }] },
      nc2_sub18_sc: { ageGroup: "Sub-18", players: [{ n: "perez ana" }] },
    };
    expect(umaCategoriaPorProva(t, prova)).toBe(1);
    expect(Object.keys(t).sort()).toEqual(["nc1_alevín_sc", "nc2_alevín_sc"]);
  });

  it("Sub-N mais baixo é mais específico", () => {
    expect(especificidade("Sub-12")).toBeGreaterThan(especificidade("Sub-18"));
    expect(especificidade("Sub-18")).toBeGreaterThan(especificidade("Sub-25"));
    expect(especificidade("Alevín")).toBeGreaterThan(especificidade("Juvenil"));
  });
});
