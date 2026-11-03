/**
 * sources/rfeg.js — o HCP de cada prova entra no hcpHistory, com a data
 * (03/11/2026). Antes só ficava o último, sem data: o Junes Chirband (sueco)
 * tinha um só HCP no Kids 2, apesar de as listas do Internacional de España
 * Sub-18 de 2025 e 2026 publicarem o índice dele.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { load } = require("./rfeg.js");

describe("rfeg — HCP por prova", () => {
  const { players } = load();
  const de = (re) => players.filter((p) => re.test(p.name || ""));

  it("estrangeiro sem licença: o HCP das listas de inscritos da RFEG (gémea do LiveGolfScoring)", () => {
    const hist = de(/chirband/i).flatMap((p) => p.hcpHistory || []);
    expect(hist).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: "2025-09-04", hcpExact: -2.3, source: "rfeg" }),
      expect.objectContaining({ date: "2026-09-02", hcpExact: -4.6, source: "rfeg" }),
    ]));
  }, 120000);

  it("licenças com os mesmos 6 dígitos finais e o mesmo nome = um jogador, mesmo se só uma tem data", () => {
    const ps = de(/caffrey maud/i).filter((p) => !String(p.sourceKey).startsWith("anon|"));
    expect(ps).toHaveLength(1);
    expect([ps[0].sourceKey, ...ps[0].extra.historicalLicenses].sort()).toEqual(["CB05805767", "CB44805767"]);
    expect(ps[0].dob).toBe("2007-02-22");
  });

  it("prova gémea LGS↔RFEG fundida: o buraco a buraco do LGS e o HCP/licença da RFEG na mesma linha", () => {
    const t = require("../../../public/data/rfegolf-rivals.json").torneios.lgs388;
    expect(t.compId).toBe("15923");
    const j = t.players.find((p) => /chirband/i.test(p.n));
    expect(j.sc).toHaveLength(4);
    expect(j.hcp).toBe(-4.6);
    expect(j.lic).toBeUndefined(); // estrangeiro: «XXXXXSWE02» não é licença
    expect(t.players.filter((p) => p.lic).length).toBeGreaterThan(30); // os espanhóis (42 de 120)
  });

  it("com licença: uma entrada por prova, a mais recente primeiro", () => {
    const [d] = de(/elchaninov/i);
    expect(d.hcpHistory.length).toBeGreaterThanOrEqual(3);
    expect(d.hcpHistory.map((h) => h.date)).toEqual([...d.hcpHistory.map((h) => h.date)].sort().reverse());
    expect(d.hcpHistory).toEqual(expect.arrayContaining([expect.objectContaining({ date: "2026-06-26", hcpExact: -0.7 })]));
  });
});
