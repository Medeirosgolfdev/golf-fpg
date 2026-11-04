/**
 * scripts/build-egr-fontes-ricas.js — que classe do ficheiro GolfBox mostra um
 * evento da /egr: a do mesmo sexo com os jogadores do evento (nomes), juntando
 * classes quando a EGR junta escalões.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { divisoesDoEvento, compIdDe } = require("./build-egr-fontes-ricas.js");

const nomes = (p, n) => Array.from({ length: n }, (_, i) => `${p} Jogador${i}`);
const div = (division, ns) => ({ division, players: ns.map((name) => ({ name })) });

describe("divisoesDoEvento", () => {
  it("o «U18» da EGR que é o campo todo vai para a classe «Girls» (overall), não «Girls U18»", () => {
    const todas = nomes("G", 11);
    const job = { divisions: [div("Boys", nomes("B", 30)), div("Girls", todas), div("Girls U16", todas.slice(0, 9)), div("Girls U18", todas.slice(9))] };
    expect(divisoesDoEvento(job, { sex: "F", ageNum: 18 }, todas)).toEqual([1]);
  });

  it("evento EGR com dois escalões juntos (U16/U14) → as duas classes", () => {
    const u16 = nomes("A", 21), u14 = nomes("C", 10);
    const job = { divisions: [div("Boys U16", u16), div("Boys U14", u14), div("Girls U16", nomes("F", 9))] };
    expect(divisoesDoEvento(job, { sex: "M", ageNum: 16 }, [...u16, ...u14])).toEqual([0, 1]);
  });

  it("menos de metade em comum → não liga (fica com os totais)", () => {
    const job = { divisions: [div("Boys U14", nomes("X", 20))] };
    expect(divisoesDoEvento(job, { sex: "M", ageNum: 14 }, nomes("Y", 20))).toEqual([]);
  });
});

describe("compIdDe", () => {
  it("tira o número da competição do link GolfBox da EGR", () => {
    expect(compIdDe("https://www.golfbox.dk/livescoring/tour/?theme=swissgolf&language=2057#/competition/5359031/leaderboard")).toBe("5359031");
    expect(compIdDe("https://www.golfbox.dk/livescoring/tour/?language=2057#/customer/1827/schedule")).toBeNull();
  });
});
