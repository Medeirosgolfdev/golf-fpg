/**
 * scripts/aggregator/util/jobfile.js — umaDivisaoPorJogador: a mesma volta no
 * escalão e nas gerais fica uma só linha (caso real: Manuel no Faldo Madeira
 * 2026 em Boys 16 & Under, Overall Boys (WAGR) e Overall Leaderboard).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { umaDivisaoPorJogador, collectLinks } = require("./jobfile.js");

describe("collectLinks — link do evento na federação/organizador", () => {
  it("um link por classe, com o nome da federação quando a fonte o dá", () => {
    const l = collectLinks([{ division: "Boys U14", source: "https://www.golfbox.dk/x#/competition/1" }], "S", {}, "Swiss Golf");
    expect(l).toEqual([{ label: "Swiss Golf — Boys U14", url: "https://www.golfbox.dk/x#/competition/1" }]);
  });
  it("o mesmo link em várias classes (a prova toda) leva só o nome da federação", () => {
    const u = "https://www.golfbox.dk/x#/competition/2";
    expect(collectLinks([{ division: "Girls U14", source: u }, { division: "Boys U14", source: u }], "S", {}, "Swiss Golf"))
      .toEqual([{ label: "Swiss Golf", url: u }]);
  });
  it("sem link por classe usa o do evento (Faldo, Evian no GolfGenius)", () => {
    expect(collectLinks([{ division: "Boys" }], "Faldo", { source: "https://www.golfgenius.com/pages/123" }))
      .toEqual([{ label: "GolfGenius", url: "https://www.golfgenius.com/pages/123" }]);
  });
  it("o Evian antigo da FFG («(trnId N)») vira a página FFG real, pelo índice", () => {
    const l = collectLinks([{ division: "Girls" }], "Evian", { source: "https://pages.ffgolf.org/resultats/ (trnId 1900544646)" });
    expect(l).toEqual([{ label: "FFG", url: "https://pages.ffgolf.org/resultats/resultats-details/572da5febaee10b7e85bab9c6205c587/1900544646" }]);
  });
});

const linha = (key, name, gross) => ({
  playerSourceKey: key, playerName: name, pos: 1, status: "OK",
  totalGross: gross.reduce((a, b) => a + b, 0), toPar: null,
  rounds: gross.map((g, i) => ({ round: i + 1, gross: g })),
});
const div = (label, sex, ageMax, results) => ({ label, sex, ageMax, results, fieldSize: results.length });

function cenario() {
  const playerMap = new Map([
    ["fm-1", { name: "Manuel Medeiros", country: "PT", dob: "2014-04-29" }],
    ["fm-2", { name: "Manuel Medeiros", country: "PT", dob: null }],
    ["fm-3", { name: "Manuel Medeiros", country: "PT", dob: null }],
    ["fm-4", { name: "Outro", country: "GB", dob: null }],
    ["fm-5", { name: "Outro", country: "GB", dob: null }],
  ]);
  const flights = [
    div("Boys 16 & Under", "M", 16, [linha("fm-2", "Manuel Medeiros", [85, 85, 82])]),
    div("Overall Boys (WAGR)", "M", null, [linha("fm-3", "Manuel Medeiros", [85, 85, 82]), linha("fm-4", "Outro", [70, 71, 72])]),
    div("Overall Leaderboard", null, null, [linha("fm-1", "Manuel Medeiros", [85, 85, 82]), linha("fm-5", "Outro", [70, 71, 72])]),
  ];
  return { playerMap, flights };
}

describe("umaDivisaoPorJogador", () => {
  it("fica só o escalão; as gerais perdem a linha repetida", () => {
    const { playerMap, flights } = cenario();
    umaDivisaoPorJogador(flights, playerMap, "fm");
    expect(flights.map((f) => [f.label, f.results.map((r) => r.playerSourceKey)])).toEqual([
      ["Boys 16 & Under", ["fm-2"]],
      ["Overall Boys (WAGR)", ["fm-4"]],
    ]);
    // a divisão que ficou vazia sai; o fieldSize é o da fonte
    expect(flights[1].fieldSize).toBe(2);
  });

  it("as entidades retiradas saem e passam o nascimento à que fica", () => {
    const { playerMap, flights } = cenario();
    umaDivisaoPorJogador(flights, playerMap, "fm");
    expect([...playerMap.keys()].sort()).toEqual(["fm-2", "fm-4"]);
    expect(playerMap.get("fm-2").dob).toBe("2014-04-29");
  });

  it("homónimos com pancadas diferentes não se juntam", () => {
    const playerMap = new Map([["a", { country: "PT" }], ["b", { country: "PT" }]]);
    const flights = [
      div("Boys 12", "M", 12, [linha("a", "João Silva", [80])]),
      div("Boys 14", "M", 14, [linha("b", "João Silva", [90])]),
    ];
    umaDivisaoPorJogador(flights, playerMap, "x");
    expect(flights.map((f) => f.results.length)).toEqual([1, 1]);
  });

  it("uma divisão que já vinha vazia (roster futuro) fica", () => {
    const flights = [div("Boys 12", "M", 12, []), div("Boys 14", "M", 14, [linha("a", "A", [80])])];
    umaDivisaoPorJogador(flights, new Map([["a", {}]]), "x");
    expect(flights.length).toBe(2);
  });
});
