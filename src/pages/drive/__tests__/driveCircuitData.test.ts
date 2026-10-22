/**
 * Testes do adaptador Drive → CircuitShell (src/pages/drive/driveCircuitData.ts).
 * Cobre o agrupamento (single / multi-ronda / evento multi-escalão) e o mapeamento
 * para CircuitEntry/CircuitDivision.
 */
import { describe, it, expect } from "vitest";
import type { Tournament as FPGTournament } from "../../../data/fpgTypes";
import {
  buildDriveGroups,
  mergeDrivePlaceholders,
  buildDriveDivisions,
  buildDriveEntries,
  shortCampo,
  stripEscalaoFromName,
  DRIVE_CONFIG,
} from "../driveCircuitData";

/** Constrói um Tournament mínimo para teste. */
function t(over: Partial<FPGTournament> & { name: string; tcode: string }): FPGTournament {
  return {
    date: "2026-01-10",
    campo: "Penina Golf Course",
    players: [{ name: "Fulano", pos: 1, grossTotal: 72, toPar: 0, scoreId: "s1" }],
    playerCount: 1,
    ...over,
  } as FPGTournament;
}

describe("shortCampo", () => {
  it("limpa sufixos e 'Golf'", () => {
    expect(shortCampo("Vilamoura - Victoria Golf")).toBe("Victoria");
    expect(shortCampo("Penina Golf Course")).toBe("Penina Course");
    expect(shortCampo("Santo da Serra Golf Club")).toBe("Stº Serra");
  });
  it("tolera vazio", () => {
    expect(shortCampo(undefined)).toBe("");
  });
});

describe("stripEscalaoFromName", () => {
  it("remove o sufixo de escalão em todas as variantes de separador", () => {
    expect(stripEscalaoFromName("Final Drive Challenge Madeira-Palheiro-Sub 10")).toBe("Final Drive Challenge Madeira-Palheiro");
    expect(stripEscalaoFromName("7 ºTorn.Drive Challenge Madeira-Stº da Serra-Sub10")).toBe("7 ºTorn.Drive Challenge Madeira-Stº da Serra");
    expect(stripEscalaoFromName("7º Torneio Drive Challenge Sul-Benamor- Sub 16")).toBe("7º Torneio Drive Challenge Sul-Benamor");
    expect(stripEscalaoFromName("Final Nacional Drive Challenge Açores Sub 10")).toBe("Final Nacional Drive Challenge Açores");
    expect(stripEscalaoFromName("7º Torneio Drive Challenge Tejo – Oeiras - Sub 10")).toBe("7º Torneio Drive Challenge Tejo – Oeiras");
  });
  it("não mexe em nomes sem escalão no fim", () => {
    expect(stripEscalaoFromName("3º Torneio Drive Tour Terceira")).toBe("3º Torneio Drive Tour Terceira");
    expect(stripEscalaoFromName(undefined)).toBe("");
  });
});

describe("buildDriveGroups", () => {
  it("tira o 'Sub NN' do label do evento agrupado", () => {
    const a = t({ name: "Final Drive Challenge Madeira-Palheiro-Sub 10", tcode: "300", series: "challenge", escalao: "Sub 10", ccode: "982", campo: "Palheiro Golf", date: "2026-07-12" });
    const b = t({ name: "Final Drive Challenge Madeira-Palheiro-Sub 12", tcode: "301", series: "challenge", escalao: "Sub 12", ccode: "982", campo: "Palheiro Golf", date: "2026-07-12" });
    const [g] = buildDriveGroups([a, b]);
    expect(g.isEvent).toBe(true);
    expect(g.label).toBe("Final Drive Challenge Madeira-Palheiro");
  });

  it("torneio single vira 1 grupo single", () => {
    const g = buildDriveGroups([t({ name: "A", tcode: "100", escalao: "Sub 12", series: "tour" })]);
    expect(g).toHaveLength(1);
    expect(g[0].isMulti).toBe(false);
    expect(g[0].isEvent).toBe(false);
    expect(g[0].entries).toHaveLength(1);
  });

  it("agrupa multi-ronda por _multiGroup com Resumo no fim", () => {
    const r1 = t({ name: "R1", tcode: "200", _multiGroup: "G", _roundLabel: "R1", _totalRounds: 2, escalao: "Sub 14" });
    const r2 = t({ name: "R2", tcode: "200", _multiGroup: "G", _roundLabel: "R2", _totalRounds: 2, escalao: "Sub 14" });
    const res = t({ name: "Resumo", tcode: "200", _multiGroup: "G", _roundLabel: "Resumo", _totalRounds: 2, escalao: "Sub 14" });
    const g = buildDriveGroups([res, r1, r2]);
    expect(g).toHaveLength(1);
    expect(g[0].isMulti).toBe(true);
    expect(g[0].totalRounds).toBe(2);
    expect(g[0].entries.map(e => e._roundLabel)).toEqual(["R1", "R2", "Resumo"]);
  });

  it("agrupa Challenge multi-escalão (mesma data+ccode) num evento", () => {
    const a = t({ name: "Sub10", tcode: "300", series: "challenge", escalao: "Sub 10", ccode: "007", date: "2026-02-01" });
    const b = t({ name: "Sub12", tcode: "301", series: "challenge", escalao: "Sub 12", ccode: "007", date: "2026-02-01" });
    const g = buildDriveGroups([b, a]);
    expect(g).toHaveLength(1);
    expect(g[0].isEvent).toBe(true);
    expect(g[0].escalao).toBeNull();
    expect(g[0].entries.map(e => e.escalao)).toEqual(["Sub 10", "Sub 12"]);
  });

  it("funde AQUAPOR Masculino + Senhoras (mesma data/clube) num só evento", () => {
    // O masculino é multi-ronda (R1/R2/Resumo); o feminino ainda só tem inscrições.
    const r1  = t({ name: "4º Torneio do Circuito Aquapor - PalmaresGolf", tcode: "10879", series: "aquapor",
      ccode: "000", date: "2026-07-18", _multiGroup: "AQ", _roundLabel: "R1", _totalRounds: 2 });
    const res = t({ name: "4º Torneio do Circuito Aquapor - PalmaresGolf", tcode: "10879", series: "aquapor",
      ccode: "000", date: "2026-07-18", _multiGroup: "AQ", _roundLabel: "Resumo", _totalRounds: 2 });
    const sen = t({ name: "4º Torneio do Circuito Aquapor S", tcode: "10880", series: "aquapor",
      ccode: "000", date: "2026-07-18" });
    const g = buildDriveGroups([r1, res, sen]);
    expect(g).toHaveLength(1);
    expect(g[0].isEvent).toBe(true);
    expect(g[0].subGroups?.map(s => s.divLabel)).toEqual(["Masculino", "Senhoras"]);
    // O evento herda o id/nome do masculino → URLs já partilhadas continuam válidas.
    expect(g[0].tcode).toBe("10879");

    const divs = buildDriveDivisions(g[0]);
    expect(divs.map(d => d.escalao)).toEqual(["Masculino", "Senhoras"]);
    expect(divs.map(d => d.sex)).toEqual(["M", "F"]);
    // O sub-grupo masculino continua multi-ronda dentro da sua divisão.
    expect(divs[0].roundLabels).toEqual(["R1", "R2"]);
    expect(divs[0].results?._roundLabel).toBe("Resumo");
    expect(divs[1].results?.tcode).toBe("10880");
  });

  it("AQUAPOR sem prova de Senhoras fica como grupo único", () => {
    const g = buildDriveGroups([
      t({ name: "3º Torneio do Circuito Aquapor", tcode: "10877", series: "aquapor", ccode: "000", date: "2026-05-16" }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].isEvent).toBe(false);
    expect(g[0].subGroups).toBeUndefined();
  });

  it("Challenge single-escalão NÃO é evento", () => {
    const g = buildDriveGroups([t({ name: "X", tcode: "400", series: "challenge", escalao: "Sub 10", ccode: "009" })]);
    expect(g[0].isEvent).toBe(false);
    expect(g[0].escalao).toBe("Sub 10");
  });
});

describe("buildDriveDivisions", () => {
  it("evento → uma divisão por escalão", () => {
    const a = t({ name: "Sub10", tcode: "300", series: "challenge", escalao: "Sub 10", ccode: "007", date: "2026-02-01" });
    const b = t({ name: "Sub12", tcode: "301", series: "challenge", escalao: "Sub 12", ccode: "007", date: "2026-02-01" });
    const [g] = buildDriveGroups([a, b]);
    const divs = buildDriveDivisions(g);
    expect(divs.map(d => d.escalao)).toEqual(["Sub 10", "Sub 12"]);
    expect(divs.every(d => !!d.results)).toBe(true);
  });

  it("multi-ronda → 1 divisão usando o Resumo + roundLabels", () => {
    const r1 = t({ name: "R1", tcode: "200", _multiGroup: "G", _roundLabel: "R1", _totalRounds: 2 });
    const res = t({ name: "Resumo", tcode: "200", _multiGroup: "G", _roundLabel: "Resumo", _totalRounds: 2 });
    const [g] = buildDriveGroups([r1, res]);
    const divs = buildDriveDivisions(g);
    expect(divs).toHaveLength(1);
    expect(divs[0].results?._roundLabel).toBe("Resumo");
    expect(divs[0].roundLabels).toEqual(["R1", "R2"]);
  });

  it("single → 1 divisão com o próprio torneio", () => {
    const [g] = buildDriveGroups([t({ name: "A", tcode: "100", escalao: "Sub 12" })]);
    const divs = buildDriveDivisions(g);
    expect(divs).toHaveLength(1);
    expect(divs[0].results?.tcode).toBe("100");
  });
});

describe("buildDriveEntries", () => {
  it("mapeia série→label, região→liga, ano e contagens", () => {
    const entries = buildDriveEntries([
      t({ name: "A", tcode: "100", escalao: "Sub 12", series: "aquapor", region: "nacional", date: "2025-01-18" }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].series).toBe("AQUAPOR");
    expect(entries[0].liga).toBe("nacional");
    expect(entries[0].year).toBe(2025);
    expect(entries[0].divisionCount).toBe(1);
    expect(entries[0].playerCount).toBe(1);
  });

  it("hasManuel propaga-se das divisões", () => {
    const entries = buildDriveEntries([
      t({ name: "ComManuel", tcode: "101", series: "tour",
        players: [{ name: "Manuel Medeiros", pos: 1, grossTotal: 70, toPar: -2, scoreId: "x" }] }),
    ]);
    expect(entries[0].hasManuel).toBe(true);
  });
});

describe("DRIVE_CONFIG", () => {
  it("agrupa por série-ano e tem os filtros esperados", () => {
    expect(DRIVE_CONFIG.grouping).toBe("series-year");
    expect(DRIVE_CONFIG.seriesOrder).toEqual(["Drive Tour", "Drive Challenge", "AQUAPOR"]);
    expect(DRIVE_CONFIG.filters?.toggles).toContain("manuel");
  });
});

describe("mergeDrivePlaceholders", () => {
  const ph = { name: "Final Drive Tour", ccode: "988", tcode: "90800", date: "2026-11-07", series: "tour", rounds: 2, playerCount: 67,
    _admissions: { _placeholder: "tcode provisório", campo: "Oeiras Green Valley / Academia", players: [{ nome: "A" }] }, players: [] };
  const real = { name: "Final Drive Tour – Oeiras Green Valley", ccode: "985", tcode: "10246", date: "2026-11-07", series: "tour", rounds: 1, playerCount: 0,
    _admissions: { players: [] }, _draws: {}, players: [] };
  it("junta o provisório com o real do mesmo dia — uma entrada com a informação das duas", () => {
    const out = mergeDrivePlaceholders<Record<string, any>>([ph, real]);
    expect(out).toHaveLength(1);
    expect(out[0].tcode).toBe("10246");
    expect(out[0].name).toBe("Final Drive Tour – Oeiras Green Valley");
    expect(out[0]._admissions.players).toHaveLength(1);
    expect(out[0].rounds).toBe(2);
    expect(out[0].playerCount).toBe(67);
    expect(out[0]._mergedFrom).toBe("988-90800");
  });
  it("não junta com datas diferentes nem com nomes diferentes", () => {
    expect(mergeDrivePlaceholders([ph, { ...real, date: "2026-11-08" }])).toHaveLength(2);
    expect(mergeDrivePlaceholders([ph, { ...real, name: "Final Drive Challenge – Oeiras" }])).toHaveLength(2);
  });
  it("não junta quando há dois candidatos (ambíguo)", () => {
    expect(mergeDrivePlaceholders([ph, real, { ...real, tcode: "10247" }])).toHaveLength(3);
  });  it("com inscritos na FPG, cruza-os com os apurados (confirmados vs pendentes)", () => {
    const phA = { ...ph, _admissions: { _manual: true, players: [
      { fed: "1", nome: "A", status: "confirmed", pts: 674, ptsRank: "1º Madeira", escalao: "Sub 16" },
      { fed: "2", nome: "B", status: "confirmed", pts: 500 },
    ] } };
    const realI = { ...real, _admissions: { name: "Final Drive Tour – Oeiras Green Valley", status: "Inscrições em curso", players: [
      { pos: 1, fed: "3", nome: "C", hcp: 3.6, status: "confirmed", dataInscricao: "2026/10/07 17:33" },
      { pos: 2, fed: "2", nome: "B", hcp: 6.4, status: "confirmed", dataInscricao: "2026/10/07 18:09" },
    ] } };
    const adm = mergeDrivePlaceholders<Record<string, any>>([phA, realI])[0]._admissions;
    const by = Object.fromEntries(adm.players.map((p: any) => [p.fed, p]));
    expect(by["2"]).toMatchObject({ status: "confirmed", pos: 2, hcp: 6.4, pts: 500, dataInscricao: "2026/10/07 18:09" });
    expect(by["1"]).toMatchObject({ status: "reserva", pts: 674, ptsRank: "1º Madeira", escalao: "Sub 16" });
    expect(by["3"].tags).toContain("fora dos apurados");
    expect(adm.totalInscritos).toBe(2);
    expect(adm.reservas).toBe(1);
    expect(adm.status).toBe("Inscrições em curso");
  });
});
