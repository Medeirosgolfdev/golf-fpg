import { describe, it, expect } from "vitest";
import { featuredClubeSynthetics } from "../fpgPageLoader";
import type { Tournament } from "../fpgTypes";

// Provas de clube em destaque (series "clube"): a Taça Presidente CGSS 2026
// entra na lista principal da /FPG antes de ter resultados (26/10/2026).
const ad = { ccode: "007", tcode: "11084", name: "TAÇA PRESIDENTE CGSS 2026", date: "2026-10-31",
  admissions: { players: [], totalInscritos: 0 }, draws: {} };

describe("featuredClubeSynthetics", () => {
  it("injecta a prova de clube quando há scrape e ainda não há resultados", () => {
    const out = featuredClubeSynthetics([], new Map([["007-11084", ad as never]]));
    expect(out.map((t) => [t.ccode, t.tcode, t.name, t.date, t.campo])).toEqual([
      ["007", "11084", "Taça Presidente CGSS 2026", "2026-10-31", "Santo da Serra - Desertas-Serras"],
    ]);
  });
  it("não injecta sem scrape nem quando a prova já chegou aos resultados", () => {
    expect(featuredClubeSynthetics([], new Map())).toEqual([]);
    const jogada = { ccode: "007", tcode: "11084" } as Tournament;
    expect(featuredClubeSynthetics([jogada], new Map([["007-11084", ad as never]]))).toEqual([]);
  });
});
