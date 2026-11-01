/**
 * scripts/aggregator/util/juntar-fichas.js — a mesma pessoa com duas fichas
 * junta-se quando há prova (casos reais: Francisca Costa da FPG = a licença
 * «E…» da FFG na Evian 2024; Chloé Lam com uma licença «E…» por prova).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { juntarFichas, paresLicencaE } = require("./juntar-fichas.js");
const { fundirTorneiosRepetidos } = require("./fundir-torneios.js");

const linha = (jid, nome, pos, voltas) => ({
  juniorId: jid, playerNameInSource: nome, pos, status: "OK",
  totalGross: voltas.reduce((a, b) => a + b, 0), rounds: voltas.map((g, i) => ({ round: i + 1, gross: g })),
});

describe("juntarFichas", () => {
  it("o mesmo nome com as mesmas pancadas na prova repetida: as duas fichas ficam uma", () => {
    const evian = { id: "evianjc-2024", sourceId: "evianjc", name: "Evian Juniors Cup 2024", date: "2024-09-17", flights: [{ flightKey: "g", label: "Girls", results: [
      linha("a", "A A", 1, [70, 71]), linha("b", "B B", 2, [72, 73]), linha("c", "C C", 3, [74, 75]), linha("f40981", "Francisca Costa", 4, [76, 77]),
    ] }] };
    const ffg = { id: "ffgolf-9", sourceId: "ffgolf", name: "The Amundi Evian Juniors Cup", date: "2024-09-17", flights: [{ flightKey: "d", label: "Dames", results: [
      linha("a", "A A", 1, [70, 71]), linha("b", "B B", 2, [72, 73]), linha("c", "C C", 3, [74, 75]), linha("gE77995991", "Francisca Costa", 4, [76, 77]),
    ] }] };
    const fpg = { id: "fpg-1", sourceId: "fpg", name: "Nacional", date: "2024-05-01", flights: [{ flightKey: "s", label: "Sub 14", results: [linha("f40981", "Francisca Costa", 1, [72])] }] };
    const mr = {
      tournaments: [evian, ffg, fpg],
      juniors: [
        { id: "a", canonicalName: "A A", tournamentIds: ["evianjc-2024", "ffgolf-9"], sources: {} },
        { id: "b", canonicalName: "B B", tournamentIds: ["evianjc-2024", "ffgolf-9"], sources: {} },
        { id: "c", canonicalName: "C C", tournamentIds: ["evianjc-2024", "ffgolf-9"], sources: {} },
        { id: "f40981", canonicalName: "Francisca Costa", country: "PT", tournamentIds: ["evianjc-2024", "fpg-1"], sources: { fpg: { fed: "40981" }, ffgolf: { lic: "E73262733" } } },
        { id: "gE77995991", canonicalName: "Francisca Costa", dob: "2010-11-30", tournamentIds: ["ffgolf-9"], sources: { ffgolf: { lic: "E77995991", hcp: 0.3 } } },
      ],
    };
    const r = fundirTorneiosRepetidos(mr);
    expect(r.fichas.juntas).toBe(1);
    const ids = mr.juniors.map((j) => j.id);
    expect(ids).not.toContain("gE77995991");
    const fc = mr.juniors.find((j) => j.id === "f40981");
    expect(fc.dob).toBe("2010-11-30");                                        // o que só a outra tinha
    expect(fc.sources.ffgolf.historicalLicenses.map((h) => h.lic)).toEqual(["E77995991"]);
    expect(fc.sources.ffgolf.lic).toBe("E73262733");
    expect(fc.tournamentIds.sort()).toEqual(["evianjc-2024", "fpg-1"]);
  });

  it("sem pancadas iguais não junta fichas", () => {
    const mr = { tournaments: [], juniors: [{ id: "x", canonicalName: "X", tournamentIds: ["t"], sources: {} }] };
    expect(juntarFichas(mr, []).juntas).toBe(0);
    expect(mr.juniors).toHaveLength(1);
  });

  it("a linha das provas passa para a ficha que fica e a repetida na mesma prova sai", () => {
    const t = { id: "t1", flights: [{ results: [{ juniorId: "p", pos: 1 }, { juniorId: "s", pos: 1 }] }] };
    const t2 = { id: "t2", flights: [{ results: [{ juniorId: "s", pos: 3 }] }] };
    const mr = {
      tournaments: [t, t2],
      juniors: [
        { id: "p", canonicalName: "Chloé Lam", tournamentIds: ["t1", "t0"], sources: { ffgolf: { lic: "003777373" } } },
        { id: "s", canonicalName: "Chloé Lam", tournamentIds: ["t1", "t2"], sources: { ffgolf: { lic: "E86126057" } } },
      ],
    };
    juntarFichas(mr, [["p", "s"]]);
    expect(t.flights[0].results.map((r) => r.juniorId)).toEqual(["p"]);
    expect(t2.flights[0].results[0].juniorId).toBe("p");
    expect(mr.juniors.map((j) => j.id)).toEqual(["p"]);
    expect(mr.juniors[0].tournamentIds).toEqual(["t1", "t0", "t2"]);
  });
});

describe("paresLicencaE", () => {
  it("licença «E…» com o mesmo nome e nascimento de uma só outra ficha", () => {
    const js = [
      { id: "g003777373", canonicalName: "Chloe Lam", dob: "2012-12-11", sources: { ffgolf: { lic: "003777373" } } },
      { id: "gE86126057", canonicalName: "Chloé Lam", dob: "2012-12-11", sources: { ffgolf: { lic: "E86126057" } } },
      { id: "gE1", canonicalName: "Sofia (U18) Cherif Essakali", dob: "2009-04-28", sources: { ffgolf: { lic: "E72881581" } } },
      { id: "gE2", canonicalName: "Sofia Cherif Essakali", dob: "2009-04-28", sources: { ffgolf: { lic: "E66717933" }, _secondary: [] } },
      // nascimento diferente ou sem nascimento: não
      { id: "gE3", canonicalName: "Hugo Martin", dob: "2010-01-01", sources: { ffgolf: { lic: "E1" } } },
      { id: "g4", canonicalName: "Hugo Martin", dob: "2011-01-01", sources: { ffgolf: { lic: "1" } } },
      { id: "gE5", canonicalName: "Léa Petit", sources: { ffgolf: { lic: "E5" } } },
      { id: "g6", canonicalName: "Léa Petit", sources: { ffgolf: { lic: "6" } } },
      // três licenças do mesmo estrangeiro: as E vão todas com a ficha a sério
      { id: "g524613367", canonicalName: "Louis Dirickx", dob: "2011-01-30", sources: { ffgolf: { lic: "524613367" } } },
      { id: "gE7", canonicalName: "Louis Dirickx", dob: "2011-01-30", sources: { ffgolf: { lic: "E79411671" } } },
      { id: "gE8", canonicalName: "Louis Dirickx", dob: "2011-01-30", sources: { ffgolf: { lic: "E73262707" } } },
    ];
    const pares = paresLicencaE(js).map((p) => p.join("+")).sort();
    expect(pares).toEqual(["g003777373+gE86126057", "g524613367+gE7", "g524613367+gE8", "gE1+gE2", "gE2+gE1"]);
  });
});
