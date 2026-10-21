import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import clubes2026Raw from "../../../public/data/CLUBES2026.json?raw";
import { clubesIndividualTournament, matchPlayFieldByDay, matchPlayPlayerCount } from "../clubesFormats";
import { buildClubesEntries } from "../../pages/fpg/fpgCircuitData";
import ManuelResultPills from "../../ui/ManuelResultPills";
import type { Tournament, Player } from "../fpgTypes";
import type { MatchPlayData } from "../clubesMatchplayTypes";

/**
 * Regional de Clubes 2026 (059-10685, 3-way match play): o cabeçalho do
 * detalhe dizia «0 jog» (o ficheiro traz playerCount 0) e a sidebar «5 jog»
 * (só os cartões). E o Manuel aparecia «★ R1 · 80 (+8) · líder» — líder de 3
 * cartões num campo de 34.
 */
const clubes2026 = JSON.parse(clubes2026Raw) as { tournaments: Tournament[] };
const regional = { ...clubes2026.tournaments.find(t => t.ccode === "059" && t.tcode === "10685")!, _clubesYear: "2026" };

describe("Regional de Clubes 2026 — jogadores e resumo do Manuel", () => {
  it("o torneio está no ficheiro, em match play, com playerCount 0", () => {
    expect(regional.matchPlayResults).toBeTruthy();
    expect(regional.playerCount).toBe(0);
  });

  it("conta todos os que jogaram (draws dos dois dias + confrontos), cada um uma vez", () => {
    const mp = regional.matchPlayResults!;
    const field = matchPlayFieldByDay(mp);
    // Dia 1: 18 Homens + 4 Senhoras + 12 Juniores no draw.
    expect(field.get(1)!.size).toBeGreaterThanOrEqual(34);
    const n = matchPlayPlayerCount(mp);
    expect(n).toBe(37);
    // O mesmo número no cabeçalho do detalhe e na sidebar.
    expect(clubesIndividualTournament(regional).playerCount).toBe(n);
    const [entry] = buildClubesEntries([regional]);
    expect(entry.playerCount).toBe(n);
    expect(entry.divisions![0].results!.playerCount).toBe(n);
  });

  it("sem classificação por pancadas nos dois dias → o resumo do Manuel não diz «líder»", () => {
    const t = clubesIndividualTournament(regional);
    expect(t._noStrokeRankRounds).toEqual([1, 2]);
    const html = renderToStaticMarkup(<ManuelResultPills tournament={t} />);
    expect(html).toContain("R1 · 80 (+8)");
    expect(html).not.toMatch(/líder/);
  });
});

describe("matchPlayFieldByDay / _noStrokeRankRounds (dados mínimos)", () => {
  const par = Array(9).fill(4);
  const card = (v: number) => Array(9).fill(v);
  const mp: MatchPlayData = {
    clubs: [{ key: "A", name: "Clube A", shortName: "A" }, { key: "B", name: "Clube B", shortName: "B" }],
    course: { par },
    dia1: { modalidade: "Stroke Play", groups: { J: [{ teeTime: "09:00", players: [
      { name: "Ana", fed: "1", club: "A" }, { name: "Bia", fed: "2", club: "B" }] }] } },
    dia2: { modalidade: "Match Play", groups: { J: [{ teeTime: "09:00", players: [
      { name: "Ana", club: "A" }, { name: "Carla", club: "B" }] }] } },
    categories: [{ key: "J", label: "Juniores", dias: [
      { dia: 1, subtotal: {}, matches: [{ match: 1, players: {
        A: { name: "Ana", fed: "1", scores: card(4) }, B: { name: "Bia", fed: "2", scores: card(5) } } }] },
      { dia: 2, subtotal: {}, matches: [{ match: 1, players: {
        A: { name: "Ana", fed: "1", scores: card(4) }, B: { name: "Carla", scores: card(5) } } }] },
    ] }],
  };
  const t = { name: "Regional de Clubes 2026", ccode: "059", tcode: "10685", date: "2026-06-20",
    players: [] as Player[], playerCount: 0, matchPlayResults: mp } as Tournament;

  it("o nome sem fed casa com o fed que tem noutro registo", () => {
    const f = matchPlayFieldByDay(mp);
    expect([...f.get(1)!]).toEqual(["1", "2"]);
    expect([...f.get(2)!].sort()).toEqual(["1", "n:carla"]);
    expect(matchPlayPlayerCount(mp)).toBe(3);
  });

  it("dia em stroke play com o campo todo com cartão → classifica; dia em match play → não", () => {
    const out = clubesIndividualTournament(t);
    expect(out.playerCount).toBe(3);
    expect(out._noStrokeRankRounds).toEqual([2]);
  });

  it("torneio de clubes que não é match play fica como estava", () => {
    const sp = { ...t, tcode: "10483", ccode: "059", matchPlayResults: undefined, playerCount: 12 } as Tournament;
    const out = clubesIndividualTournament(sp);
    expect(out.playerCount).toBe(12);
    expect(out._noStrokeRankRounds).toBeUndefined();
  });
});
