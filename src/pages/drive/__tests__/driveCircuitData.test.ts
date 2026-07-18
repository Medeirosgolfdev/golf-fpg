/**
 * Testes do adaptador Drive → CircuitShell (src/pages/drive/driveCircuitData.ts).
 * Cobre o agrupamento (single / multi-ronda / evento multi-escalão) e o mapeamento
 * para CircuitEntry/CircuitDivision.
 */
import { describe, it, expect } from "vitest";
import type { Tournament as FPGTournament } from "../../../data/fpgTypes";
import {
  buildDriveGroups,
  buildDriveDivisions,
  buildDriveEntries,
  admissionsToInscritos,
  drawsToCircuitDraw,
  shortCampo,
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

describe("buildDriveGroups", () => {
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

describe("admissionsToInscritos", () => {
  it("divide admitidos e reservas em duas listas", () => {
    const ins = admissionsToInscritos({
      players: [
        { pos: 1, fed: "1", nome: "A", clube: "X", hcp: 5, vac: null, dataInscricao: null, status: "confirmed" },
        { pos: 2, fed: "2", nome: "B", clube: "Y", hcp: 7, vac: null, dataInscricao: null, status: "confirmed" },
        { pos: 1, fed: "3", nome: "C", clube: "Z", hcp: 9, vac: null, dataInscricao: null, status: "reserva" },
      ],
    });
    expect(ins?.lists.map(l => l.key)).toEqual(["admitidos", "reservas"]);
    expect(ins?.lists[0].players).toHaveLength(2);
    expect(ins?.lists[1].players).toHaveLength(1);
    expect(ins?.lists[0].players[0]).toMatchObject({ name: "A", club: "X", fed: "1", hcp: 5, status: "confirmed" });
  });
  it("devolve undefined sem jogadores ou com erro", () => {
    expect(admissionsToInscritos(undefined)).toBeUndefined();
    expect(admissionsToInscritos({ players: [] })).toBeUndefined();
    expect(admissionsToInscritos({ error: "x", players: [{ pos: 1, fed: "1", nome: "A", clube: "X", hcp: 5, vac: null, dataInscricao: null, status: "confirmed" }] })).toBeUndefined();
  });
});

describe("drawsToCircuitDraw", () => {
  it("converte grupos por ronda e mapeia nome/clube", () => {
    const draw = drawsToCircuitDraw({
      "1": { groups: [{ teeTime: "08:00", startHole: 10, tee: "Amarelas", players: [{ nome: "A", clube: "X" }, { nome: "B", clube: null }] }] },
      "2": { groups: [] },
    });
    expect(Object.keys(draw?.rounds ?? {})).toEqual(["1"]); // ronda 2 vazia é ignorada
    expect(draw?.rounds["1"][0]).toMatchObject({ teeTime: "08:00", startHole: 10, tee: "Amarelas" });
    expect(draw?.rounds["1"][0].players).toEqual([{ name: "A", club: "X" }, { name: "B", club: undefined, fed: undefined }]);
  });
  it("devolve undefined sem draws", () => {
    expect(drawsToCircuitDraw(undefined)).toBeUndefined();
    expect(drawsToCircuitDraw({ "1": { error: "x" } })).toBeUndefined();
  });
});

describe("buildDriveDivisions — inscrições/draws", () => {
  it("anexa inscritos e draw à divisão a partir de _admissions/_draws", () => {
    const tt = t({
      name: "Evt", tcode: "500", series: "challenge", escalao: "Sub 12", ccode: "007", date: "2026-03-01",
      _admissions: { players: [{ pos: 1, fed: "1", nome: "A", clube: "X", hcp: 5, vac: null, dataInscricao: null, status: "confirmed" }] },
      _draws: { "1": { groups: [{ teeTime: "09:00", startHole: 1, tee: "Azuis", players: [{ nome: "A", clube: "X" }] }] } },
    } as any);
    const [g] = buildDriveGroups([tt]);
    const [div] = buildDriveDivisions(g);
    expect(div.inscritos?.lists[0].players[0].name).toBe("A");
    expect(div.draw?.rounds["1"][0].teeTime).toBe("09:00");
  });
});

describe("DRIVE_CONFIG", () => {
  it("agrupa por série-ano e tem os filtros esperados", () => {
    expect(DRIVE_CONFIG.grouping).toBe("series-year");
    expect(DRIVE_CONFIG.seriesOrder).toEqual(["Drive Tour", "Drive Challenge", "AQUAPOR"]);
    expect(DRIVE_CONFIG.filters?.toggles).toContain("manuel");
  });
});
