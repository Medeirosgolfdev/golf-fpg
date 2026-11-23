import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { buildProvasFora, parecenca, fimDaProva, NAO_E_PROVA } = require("./provas-fora.js");

const rd = (n) => ({ round: n, gross: 80 });
const prova = (id, sourceId, name, startDate, voltas, juniorIds, url) => ({
  id, sourceId, name, startDate,
  links: [{ label: "Org", url: url || `https://org.example/${id}` }],
  flights: [{ results: juniorIds.map((juniorId) => ({ juniorId, rounds: Array.from({ length: voltas }, (_, i) => rd(i + 1)) })) }],
});
const junior = (id, fed) => ({ id, sources: fed ? { fpg: { fed } } : {} });

describe("provas de fora: volta 999999 → prova verdadeira", () => {
  it("o fim da prova sai das voltas quando a fonte não o dá", () => {
    expect(fimDaProva({ flights: [{ results: [{ rounds: [rd(1), rd(2), rd(3)] }] }] }, "2026-10-16")).toBe("2026-10-18");
    expect(fimDaProva({ endDate: "2026-10-20" }, "2026-10-16")).toBe("2026-10-20");
  });

  it("o nome compara-se sem «D1», anos nem palavras genéricas", () => {
    expect(parecenca("FALDO JUNIOR TOUR MADEIRA 2026 D1", "Faldo Junior Tour Madeira 2026")).toBe(1);
    expect(parecenca("Rome Classic 2026", "Venice Open 2026")).toBe(0);
  });

  it("Faldo do Manuel: liga pela ficha do Kids 2 e pela data, ao GolfGenius (nunca à FPG)", () => {
    const tours = [
      prova("faldomadeira-2026", "faldomadeira", "Faldo Junior Tour Madeira 2026", "2026-10-16", 3, ["f52884"], "https://www.golfgenius.com/pages/1"),
      prova("egr-12954", "egr", "Faldo Junior Tour Madeira 2026", "2026-10-16", 3, ["f52884"], "https://www.europeangolfrankings.com/events/12954"),
    ];
    const voltas = [
      { id: "4415313", data: "2026-10-16", nome: "FALDO JUNIOR TOUR MADEIRA 2026 D1" },
      { id: "4417896", data: "2026-10-18", nome: "FALDO JUNIOR TOUR MADEIRA 2026 D3" },
    ];
    const pf = buildProvasFora([junior("f52884", "52884")], tours, "x", { voltasDe: () => voltas });
    // a do organizador ganha à cópia do ranking EGR
    expect(pf.v["52884"]).toEqual({ "4415313": "faldomadeira-2026", "4417896": "faldomadeira-2026" });
    expect(pf.t["faldomadeira-2026"]).toEqual(["Faldo Junior Tour Madeira 2026", [["Org", "https://www.golfgenius.com/pages/1"]]]);
  });

  it("Rome Classic do Mikhail: sem a ficha ligada, entra pelo nome + data", () => {
    const tours = [prova("uskids-22876", "uskids", "Rome Classic 2026", "2026-10-17", 2, ["u999"])];
    const voltas = [
      { id: "4417465", data: "2026-10-17", nome: "Rome Classic 2026" },
      { id: "4417466", data: "2026-10-18", nome: "Rome Classic 2026" },
    ];
    const pf = buildProvasFora([junior("f58864", "58864")], tours, "x", { voltasDe: () => voltas });
    expect(pf.v["58864"]).toEqual({ "4417465": "uskids-22876", "4417466": "uskids-22876" });
  });

  it("nunca só pela data: outra prova nesses dias, com outro nome e sem a ficha, não liga", () => {
    const tours = [prova("uskids-1", "uskids", "Venice Open 2026", "2026-10-17", 2, ["u1"])];
    const pf = buildProvasFora([junior("f1", "1")], tours, "x", { voltasDe: () => [{ id: "9", data: "2026-10-17", nome: "Rome Classic 2026" }] });
    expect(pf.v["1"]).toBeUndefined();
  });

  it("o «Extra Day Score» da véspera não é a prova, mesmo com a ficha lá", () => {
    expect(NAO_E_PROVA.test("Extra Day Score")).toBe(true);
    expect(NAO_E_PROVA.test("EDS belas")).toBe(true);
    expect(NAO_E_PROVA.test("Away Internacional")).toBe(false);
    const tours = [prova("uskids-2", "uskids", "Paris Invitational 2026", "2026-08-01", 3, ["f2"])];
    const pf = buildProvasFora([junior("f2", "2")], tours, "x", {
      voltasDe: () => [
        { id: "a", data: "2026-07-31", nome: "Away Internacional" }, // véspera: só com a ficha não chega
        { id: "b", data: "2026-08-01", nome: "Extra Day Score" },
        { id: "c", data: "2026-08-02", nome: "Away Internacional" },
      ],
    });
    expect(pf.v["2"]).toEqual({ c: "uskids-2" });
  });
});
