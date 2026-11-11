import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type React from "react";
import DrawTab from "../../DrawTab";
import { roundDrawNode, totalsDivisionView } from "../divisionPieces";
import type { CircuitDivision } from "../types";

const html = (n: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{n}</MemoryRouter>);
const draw = { groups: [{ teeTime: "08:00", startHole: 1, tee: null, players: [{ nome: "Ana Silva", clube: "Lisboa", country: "PT" }] }] };

describe("roundDrawNode — draw como dados", () => {
  it("desenha o DrawTab igual ao que a página desenhava", () => {
    const hideCols = { fed: true, nasc: true, esc: true };
    const viaDados = roundDrawNode({ round: 2, draw, tournamentDate: "2026-05-01", hideCols, clubLabel: "Cidade" });
    const aMao = <DrawTab draw={draw} roundNum={2} tournamentDate="2026-05-01" hideCols={hideCols} clubLabel="Cidade" />;
    expect(html(viaDados)).toBe(html(aMao));
    expect(html(viaDados)).toContain("Ana Silva");
  });
  it("sem dados → nada (já não há desenho próprio da página: só dados — 11/11/2026)", () => {
    expect(roundDrawNode({ round: 1 })).toBeNull();
  });
  it("os jogadores que a fonte dá à parte (Espanha) chegam ao DrawTab", () => {
    const playersDB = {};
    const viaDados = roundDrawNode({ round: 1, draw, playersDB });
    expect(html(viaDados)).toBe(html(<DrawTab draw={draw} roundNum={1} playersDB={playersDB} />));
  });
});

describe("totalsDivisionView — só totais como dados → prova sem buraco a buraco", () => {
  const players = [{ name: "Ana Silva", country: "Portugal", pos: 1, rounds: [70, 72], total: 142, points: 12.345 }];
  it("prova só com totais (`format: totals`) com as voltas, o aviso e a coluna extra (valor de cada jogador)", () => {
    const d: CircuitDivision = { key: "m", escalao: "Junior", totals: {
      players, parPerRound: null, tournamentDate: "2026-05-01",
      notice: { kind: "aviso", title: "t", text: "⚠ aviso" },
      extra: [{ header: "PTS", title: "Pontos", field: "points", decimals: 2 }],
    } };
    const v = totalsDivisionView(d, { name: "Prova" })!;
    expect(v.tournament.format).toBe("totals");
    expect(v.tournament.rounds).toBe(2);
    const p = v.tournament.players[0];
    expect(p.roundScores?.map((r) => r.gross)).toEqual([70, 72]);
    const col = v.accExtraColumns![0];
    const row = { key: p.scoreId, name: p.name, toPar: null, gross: 142, pos: 1, rounds: [] };
    expect(col.cell(row, 0)).toBe("12.35");
    expect(col.sortValue?.(row)).toBe(12.345);
    expect(html(v.accHeader)).toContain("⚠ aviso");
  });
  it("sem totais → nada", () => {
    expect(totalsDivisionView({ key: "m", escalao: "" }, { name: "x" })).toBeNull();
  });
});
