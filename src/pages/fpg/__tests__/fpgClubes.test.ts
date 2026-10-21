import { describe, it, expect } from "vitest";
import type { Tournament, Player } from "../../../data/fpgTypes";
import type { MatchPlayData } from "../../../data/clubesMatchplayTypes";
import { buildClubesEntries, resolveFpgTkey, fpgRepDivision, CLUBES_CONFIG } from "../fpgCircuitData";
import { clubesCtRedirect } from "../routes";
import { initialTabIndex } from "../detailTabs";
import { clubesLeadingTabs, CLUBES_DEFAULT_TAB } from "../fpgClubes";

const mkT = (o: Partial<Tournament> & { ccode: string; tcode: string; name: string }): Tournament =>
  ({ date: "2026-06-20", campo: "Palheiro", players: [], playerCount: 0, ...o } as Tournament);
const manuel = { scoreId: "m", name: "Manuel Medeiros", fed: "52884", fedCode: "52884" } as unknown as Player;
const ana = { scoreId: "a", name: "Ana Silva", fedCode: "1" } as unknown as Player;
const mp: MatchPlayData = {
  clubs: [], categories: [{ key: "J", label: "J", dias: [
    { dia: 1, subtotal: {}, matches: [{ match: 1, players: { cgss: { name: "Manuel Medeiros", fed: "52884" } } }] }] }],
};

const regional2026 = mkT({ ccode: "059", tcode: "10685", name: "Campeonato Regional de Clubes 2026", _clubesYear: "2026", escalao: "Absoluto", matchPlayResults: mp });
const nacional2025 = mkT({ ccode: "000", tcode: "10825", name: "Campeonato Nacional de Clubes Sub 14", date: "2025-04-14", _clubesYear: "2025", escalao: "Sub 14", players: [ana, manuel], playerCount: 50 });
const regional2024 = mkT({ ccode: "059", tcode: "10483", name: "Campeonato Regional de Clubes Absoluto", date: "2024-11-30", _clubesYear: "2024", players: [ana, manuel] });
const semManuel = mkT({ ccode: "000", tcode: "10826", name: "Campeonato Nacional de Clubes Sub 18", date: "2025-04-14", _clubesYear: "2025", escalao: "Sub 18", players: [ana] });

describe("buildClubesEntries — torneios de clubes para o CircuitShell", () => {
  const entries = buildClubesEntries([regional2026, nacional2025, regional2024, semManuel]);

  it("um torneio = uma entrada com uma divisão cuja chave é o tcode do URL", () => {
    expect(entries).toHaveLength(4);
    expect(entries.map(e => e.divisions!.map(d => d.key))).toEqual([["059-10685"], ["000-10825"], ["059-10483"], ["000-10826"]]);
    expect(entries.every(e => e.divisionCount === 1)).toBe(true);
  });
  it("o ano é o da edição (_clubesYear), que agrupa a sidebar", () => {
    expect(entries.map(e => e.year)).toEqual([2026, 2025, 2024, 2025]);
  });
  it("★Manuel pelos jogadores e pelos confrontos do match play", () => {
    expect(entries.map(e => e.hasManuel)).toEqual([true, true, true, false]);
  });
  it("a divisão traz o torneio das abas de resultados (Draw R1 do match play)", () => {
    const res = entries[0].divisions![0].results!;
    expect(res.ccode).toBe("059");
    expect(entries[1].divisions![0].results!.players).toHaveLength(2);
    expect(entries[1].playerCount).toBe(50);
  });
  it("o deep-link /FPG/torneio/{ccode}-{tcode} resolve a entrada e a divisão", () => {
    expect(resolveFpgTkey(entries, "059-10685")).toEqual({ id: entries[0].id, divKey: "059-10685" });
    expect(resolveFpgTkey(entries, "000-10825")).toEqual({ id: entries[1].id, divKey: "000-10825" });
    expect(fpgRepDivision(entries[2].divisions!)!.key).toBe("059-10483");
  });
  it("ids únicos mesmo com o mesmo tcode em anos diferentes", () => {
    const outro = { ...nacional2025, _clubesYear: "2026", date: "2026-03-30" };
    const [a, b] = buildClubesEntries([nacional2025, outro]);
    expect(a.id).not.toBe(b.id);
  });
  it("a vista Clubes arranca com o ★Manuel ligado e agrupada por ano", () => {
    expect(CLUBES_CONFIG.filters?.defaultToggles).toEqual(["manuel"]);
    expect(CLUBES_CONFIG.grouping).toBe("year");
  });
});

describe("clubesCtRedirect — links antigos /FPG/clubes?ct=", () => {
  it("passa para /FPG/torneio/{ct}", () => {
    expect(clubesCtRedirect("clubes", "?ct=059-10685")).toBe("/FPG/torneio/059-10685");
  });
  it("mantém a aba e o resto da query; tira year/manuel e a antiga «individual»", () => {
    expect(clubesCtRedirect("clubes", "?ct=059-10685&tab=matchplay&q=ana")).toBe("/FPG/torneio/059-10685?tab=matchplay&q=ana");
    expect(clubesCtRedirect("clubes", "?ct=059-10685&year=2026&manuel=0&tab=individual")).toBe("/FPG/torneio/059-10685");
  });
  it("sem ct, ct inválido ou fora de /FPG/clubes → null", () => {
    expect(clubesCtRedirect("clubes", "")).toBeNull();
    expect(clubesCtRedirect("clubes", "?ct=lixo")).toBeNull();
    expect(clubesCtRedirect("jovens", "?ct=059-10685")).toBeNull();
  });
});

describe("aba inicial do TournamentDetail", () => {
  const tabs = [{ key: "grupos" }, { key: "matchplay" }, { key: "draw:1" }, { key: "round:0" }, { key: "resumo" }];
  it("sem ?tab=, abre na aba pedida pela página (Grupos nos Clubes)", () => {
    expect(initialTabIndex(tabs, null, CLUBES_DEFAULT_TAB, 4)).toBe(0);
  });
  it("o ?tab= do URL ganha", () => {
    expect(initialTabIndex(tabs, "matchplay", CLUBES_DEFAULT_TAB, 4)).toBe(1);
    expect(initialTabIndex(tabs, "resumo", CLUBES_DEFAULT_TAB, 4)).toBe(4);
  });
  it("aba do URL ou por omissão que não existe → a fase mais avançada", () => {
    expect(initialTabIndex(tabs, "precut", undefined, 4)).toBe(4);
    expect(initialTabIndex([{ key: "round:0" }], null, "grupos", 0)).toBe(0);
  });
});

describe("clubesLeadingTabs — Grupos e Match Play", () => {
  it("match play com resultados: Grupos e Match Play, Grupos primeiro", () => {
    expect(clubesLeadingTabs(regional2026, {}).map(t => t.key)).toEqual([CLUBES_DEFAULT_TAB, "matchplay"]);
  });
  it("strokeplay (Nacional Sub 14 2025, Regional 2024): só Grupos", () => {
    expect(clubesLeadingTabs(nacional2025, {}).map(t => t.key)).toEqual([CLUBES_DEFAULT_TAB]);
    expect(clubesLeadingTabs(regional2024, {}).map(t => t.key)).toEqual([CLUBES_DEFAULT_TAB]);
  });
});
