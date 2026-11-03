/**
 * scripts/aggregator/util/hcp-listas.js — ligação das Entry Lists às fichas,
 * com os casos reais de Castro Marim U14 (03/11/2026): nome mal escrito no PDF
 * ligado à mão (`ficha`), linha repetida fora, e ficha sem data de nascimento
 * cuja idade vem do federado FPG.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { enrichWithHcpListas } = require("./hcp-listas.js");

const LISTA = "fpg-entry-list-boys-2026-11-02";
const ficha = (id, canonicalName, country, dob, sources = {}) => ({ id, canonicalName, aliases: [], country, sex: "M", dob, sources });

describe("enrichWithHcpListas", () => {
  const juniors = [
    ficha("g531001335", "Nathan Bonenfant", "FR", "2013-04-14"),
    ficha("g526821325", "Leon Teyssier", "FR", "2012-12-20"),
    // Miguel Dinis Ferreira, federado 41744: a ficha não tem data, o federados.json diz 2006
    ficha("f41744", "Miguel Dinis Ferreira", "PT", null, { fpg: { fed: "41744" } }),
  ];
  const r = enrichWithHcpListas({ juniors }, { aplicar: true });
  const linha = (name) => r.relatorio.find((l) => l.lista === LISTA && l.name === name);

  it("`ficha` na linha liga o nome mal escrito do PDF à ficha certa", () => {
    expect(linha("Nathan Bonefant").junior).toMatchObject({ id: "g531001335", via: "ficha (manual)" });
    expect(juniors[0].hcpHistory.some((h) => h.date === "2026-11-02" && h.hcpExact === -2.9)).toBe(true);
  });

  it("a linha repetida no PDF não dá um segundo handicap à mesma ficha", () => {
    expect(linha("Léon Teyssier").duplicadoDe).toBe(41);
    const doDia = juniors[1].hcpHistory.filter((h) => h.date === "2026-11-02");
    expect(doDia.map((h) => h.hcpExact)).toEqual([-0.8]);
  });

  it("ficha sem data de nascimento usa a do federado: o nascido em 2006 não entra no Sub-14", () => {
    expect(linha("Miguel Ferreira").junior).toBeUndefined();
    expect(juniors[2].hcpHistory).toBeUndefined();
  });
});
