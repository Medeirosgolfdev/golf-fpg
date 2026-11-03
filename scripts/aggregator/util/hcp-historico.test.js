/**
 * util/hcp-historico.js — o HCP de cada prova, com data, no hcpHistory
 * (03/11/2026: as fontes guardavam só o último). E as fontes JobFile (DGV,
 * GolfBox…) que liam o `hcp` de cada jogador e o deitavam fora.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { criarHistorico } = require("./hcp-historico.js");

describe("criarHistorico", () => {
  it("uma entrada por data, a mais recente primeiro, pelas chaves do jogador", () => {
    const h = criarHistorico("fcg");
    h.registar("CB1", "2026-05-01", 4.2, "Prova A");
    h.registar("CB1", "2026-05-01", 4.0, "repetida no mesmo dia");
    h.registar("CB0", "2025-03-10", 7.1, "Prova B (licença antiga)");
    h.registar("CB1", "2026-06-01T00:00:00", -1.3, "plus");
    h.registar("CB1", null, 3, "sem data");
    h.registar("CB1", "2026-07-01", 99, "fora de escala");
    const p = { sourceKey: "CB1", extra: { antigas: ["CB0"] } };
    expect(h.aplicar([p], (x) => [x.sourceKey, ...x.extra.antigas])).toBe(1);
    expect(p.hcpHistory.map((x) => [x.date, x.hcpExact])).toEqual([["2026-06-01", -1.3], ["2026-05-01", 4.2], ["2025-03-10", 7.1]]);
    expect(p.hcpHistory[0]).toMatchObject({ source: "fcg", label: "plus" });
  });

  it("junta-se ao histórico que o jogador já tinha, sem repetir datas", () => {
    const h = criarHistorico("gjgl");
    h.registar("k", "2026-01-01", 5, "nova");
    h.registar("k", "2025-01-01", 9, "repete");
    const p = { sourceKey: "k", hcpHistory: [{ date: "2025-01-01", hcpExact: 9.1, source: "outra" }] };
    h.aplicar([p]);
    expect(p.hcpHistory.map((x) => x.hcpExact)).toEqual([5, 9.1]);
  });
});

describe("fontes JobFile — o HCP de cada prova entra no histórico", () => {
  it("DGV: os alemães ganham a evolução (Luis Maier, Reutlingen)", () => {
    const { players } = require("../sources/dgv.js").load();
    const comHist = players.filter((p) => p.hcpHistory?.length);
    expect(comHist.length).toBeGreaterThan(1000);
    expect(comHist.every((p) => p.hcpHistory.every((h) => h.source === "dgv" && /^\d{4}-\d{2}-\d{2}$/.test(h.date)))).toBe(true);
  }, 120000);
});
