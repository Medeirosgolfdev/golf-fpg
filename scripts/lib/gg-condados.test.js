import { describe, it, expect } from "vitest";
import { eventosDoDirectorio, classificarLeaderboard, linhasDe, hcpJogoPorNome, nomeDaProva, limparClube, jardasParaMetros } from "./gg-condados.js";

const DIRECTORIO = {
  leagues: {
    a: [{ id: "2", name: "Futures Tour Final Frilford Heath ", deleted: false, product: "event", startDate: "2026-10-28", endDate: "2026-10-28", courses: ["Frilford Heath-Red - 3"], resultsPath: "/pages/12224775359031185552", registrationInfo: { league_id: "12224775242429534493" } }],
    b: [
      { id: "1", name: "Futures Tour Thorney Park", deleted: false, product: "event", startDate: "2026-06-14", courses: ["Thorney Park"], resultsPath: "/pages/111", registrationInfo: { league_id: "1" } },
      { id: "3", name: "Apagada", deleted: true, product: "event", startDate: "2026-01-01" },
    ],
  },
};

describe("eventosDoDirectorio", () => {
  const ev = eventosDoDirectorio(DIRECTORIO);
  it("junta as listas, tira as apagadas e ordena pela data", () => {
    expect(ev.map((e) => e.id)).toEqual(["1", "2"]);
    expect(ev[1]).toMatchObject({ name: "Futures Tour Final Frilford Heath", leagueId: "12224775242429534493", resultsPageId: "12224775359031185552", startDate: "2026-10-28" });
  });
});

describe("classificarLeaderboard", () => {
  it("Gross / Net e o escalão", () => {
    expect(classificarLeaderboard("Futures Tour Frilford Heath Gross - U14")).toEqual({ tipo: "gross", escalao: "U14", saltar: null });
    expect(classificarLeaderboard("Futures Tour Thorney Park Net - U16")).toMatchObject({ tipo: "net", escalao: "U16" });
    expect(classificarLeaderboard("Futures Tour Thorney Park U12")).toMatchObject({ tipo: "gross", escalao: "U12" });
    expect(classificarLeaderboard("U12 & U14 Championship Net - U14")).toMatchObject({ tipo: "net", escalao: "U14" });
  });
  it("sexo no escalão (PING) e o que se salta", () => {
    expect(classificarLeaderboard("Under 12's Girls Nett - 18 Holes Under 12's Girls")).toEqual({ tipo: "net", escalao: "Girls U12", saltar: null });
    expect(classificarLeaderboard("Under 15's Boys Gross - 18 Holes Under 15's Boys")).toMatchObject({ tipo: "gross", escalao: "Boys U15" });
    expect(classificarLeaderboard("9 Holes - Boys (8-9 years) - 9 Holes - Boys (8-9 years)")).toMatchObject({ escalao: "Boys 8-9", saltar: "9 buracos" });
    expect(classificarLeaderboard("Welsh Event 4 U12 Stableford")).toMatchObject({ saltar: "pontos" });
  });
});

describe("linhasDe + hcpJogoPorNome", () => {
  const v2 = (rows) => ({ event: { scopes: [{ aggregates: rows }] } });
  const gross = linhasDe(v2([
    { name: "Emile Cuanalo", total: "78", affiliation: "" },
    { name: "Logan  Matthews ", total: "69", affiliation: "Goring and Streatley (Berkshire)" },
    { name: "Sem Cartão", total: "", affiliation: "" },
  ]));
  const net = linhasDe(v2([{ name: "Emile Cuanalo", total: "75" }, { name: "Logan Matthews", total: "71" }]));
  it("nome limpo, total numérico e clube sem o condado", () => {
    expect(gross[1]).toEqual({ name: "Logan Matthews", total: 69, club: "Goring and Streatley" });
    expect(gross[2].total).toBeNull();
  });
  it("Gross − Net; plus em negativo; sem Net não há valor", () => {
    const h = hcpJogoPorNome(gross, net);
    expect(h.get("emile cuanalo")).toBe(3);
    expect(h.get("logan matthews")).toBe(-2);
    expect(h.has("sem cartao")).toBe(false);
    expect(hcpJogoPorNome(gross, null).size).toBe(0);
  });
});

describe("nomeDaProva, clube e jardas", () => {
  const c = { nome: "BB&O Futures Tour" };
  it("nome da prova", () => {
    expect(nomeDaProva("Futures Tour Thorney Park", c)).toBe("BB&O Futures Tour — Thorney Park");
    expect(nomeDaProva("Futures Tour Final Frilford Heath", c)).toBe("BB&O Futures Tour — Final, Frilford Heath");
    expect(nomeDaProva("PING Junior Golf Tour 2026 - Louth Golf Club", { nome: "PING Junior Golf Tour" })).toBe("PING Junior Golf Tour — Louth Golf Club");
  });
  it("clube e jardas", () => {
    expect(limparClube("Frilford Heath (Oxfordshire)")).toBe("Frilford Heath");
    expect(jardasParaMetros([348, 206, null])).toEqual([318, 188, null]);
  });
});
