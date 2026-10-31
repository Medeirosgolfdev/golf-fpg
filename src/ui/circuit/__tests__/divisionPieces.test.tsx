import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type React from "react";
import DrawTab from "../../DrawTab";
import TotalsResumo from "../TotalsResumo";
import { roundDrawNode, divisionResultsNode } from "../divisionPieces";
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
  it("o `render` da página ganha; sem dados nem render → nada", () => {
    expect(roundDrawNode({ round: 1, draw, render: () => "à medida" })).toBe("à medida");
    expect(roundDrawNode({ round: 1 })).toBeNull();
  });
});

describe("divisionResultsNode — só totais como dados", () => {
  const players = [{ name: "Ana Silva", country: "Portugal", pos: 1, rounds: [70, 72], total: 142, points: 12.345 }];
  it("TotalsResumo com aviso e coluna extra, igual ao que o WAGR desenhava", () => {
    const d: CircuitDivision = { key: "m", escalao: "Junior", totals: {
      players, parPerRound: null, tournamentDate: "2026-05-01",
      notice: { kind: "aviso", title: "t", text: "⚠ aviso" },
      extra: [{ header: "PTS", title: "Pontos", field: "points", decimals: 2 }],
    } };
    const aMao = <TotalsResumo parPerRound={null} tournamentDate="2026-05-01" players={players}
      notice={<div className="notice u-mb-8px" title="t">⚠ aviso</div>}
      extra={[{ header: "PTS", title: "Pontos", value: (p) => (typeof p.points === "number" ? p.points.toFixed(2) : "–") }]} />;
    expect(html(divisionResultsNode(d))).toBe(html(aMao));
    expect(html(divisionResultsNode(d))).toContain("12.35");
  });
  it("`customResults` ganha; sem totais → nada", () => {
    expect(divisionResultsNode({ key: "m", escalao: "", customResults: "x", totals: { players, parPerRound: 72 } })).toBe("x");
    expect(divisionResultsNode({ key: "m", escalao: "" })).toBeUndefined();
  });
});
