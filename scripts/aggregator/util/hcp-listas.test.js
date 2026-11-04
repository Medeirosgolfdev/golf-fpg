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

// O número manda sobre o nome, e só pelo nome a ligação é verificada (03/11/2026).
describe("enrichWithHcpListas — o número e a verificação", () => {
  const juniors = [
    // dois Ricardo Ferreira: a prova (000/90872) diz que o da lista é o 51180
    ficha("f45366", "Ricardo Ferreira", "PT", "2012-04-12", { fpg: { fed: "45366", club: "Oporto B" } }),
    ficha("f51180", "Ricardo Rocha Ferreira", "PT", "2015-09-24", { fpg: { fed: "51180", club: "Miramar" } }),
    // dois Ben Smith na lista inglesa (Clitheroe 5.4, Tiverton 17) e uma só ficha
    ficha("xbensmith", "Ben Smith", "GB", null, {}),
    // só o nome, sem clube, handicap nem data: fica por confirmar
    ficha("xkrishan", "Krishan Siani", "GB", null, {}),
    // a licença FFG da lista liga mesmo com o nome escrito de outra maneira
    ficha("g041033333", "Gabin Tosato", "FR", null, { ffgolf: { lic: "041033333" } }),
  ];
  const r = enrichWithHcpListas({ juniors }, { aplicar: true });
  const linha = (lista, name) => r.relatorio.find((l) => l.lista === lista && l.name === name);

  it("o federado da própria prova manda: o Ricardo Ferreira da lista é o 51180, não o homónimo de 2012", () => {
    expect(linha("fpg-entry-list-boys-2026-11-02", "Ricardo Ferreira").junior).toMatchObject({ id: "f51180", via: "federado da prova" });
    expect(juniors[0].hcpHistory).toBeUndefined();
  });

  it("a mesma ficha para duas pessoas da lista (handicaps 5.4 e 17) não fica ligada a nenhuma", () => {
    const bens = r.relatorio.filter((l) => l.lista === "intelligentgolf-2026-11" && l.name === "Ben Smith");
    expect(bens).toHaveLength(2);
    for (const b of bens) { expect(b.junior).toBeUndefined(); expect(b.ambiguo[0]).toMatch(/mesma ficha para 2 pessoas/); }
    expect(juniors[2].hcpHistory).toBeUndefined();
  });

  it("só pelo nome, sem nada que confirme: aparece «por confirmar» e não escreve na ficha", () => {
    expect(linha("intelligentgolf-2026-11", "Krishan Siani").junior).toMatchObject({ id: "xkrishan", porConfirmar: true });
    expect(juniors[3].hcpHistory).toBeUndefined();
  });

  it("a licença FFG da lista liga e confirma", () => {
    expect(linha("ffg-gpj-rennes-u12-garcons-2026-10-10", "Gabin Tosatto").junior).toMatchObject({ id: "g041033333", via: "licença FFG" });
    expect(juniors[4].hcpHistory.some((h) => h.hcpExact === -0.2)).toBe(true);
  });
});
