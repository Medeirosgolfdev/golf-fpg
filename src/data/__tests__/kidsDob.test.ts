/**
 * Nascimento do Kids 2 nas tabelas de torneio (src/data/kidsDob.ts).
 * 02/11/2026: no Venice Open 2026 (USKids, t=22243) as colunas Nasc./Idade do
 * Boys 12 saíam vazias para toda a gente, também para quem tem a data na ficha.
 */
import { describe, it, expect } from "vitest";
import { makeKidsDobLookup, precisaKidsDob, withKidsDob, kidsDobLida, KIDS_EST_NOTE, type ScoutDobFile } from "../kidsDob";
import { buildKidsLinkMap, fromLinkRow, type LinkRow } from "../../hooks/useKidsLinkMap";
import { escalaoToTournament } from "../uskids/toTournament";
import type { TorneioResult } from "../../ui/uskidsTypes";
import type { KidsLinkEntry } from "../../ui/KidsLink";
import resultsRaw from "../../../public/data/uskids-results.json?raw";
import linksRaw from "../../../public/data/juniors-links.json?raw";
import scoutRaw from "../../../public/data/juniors-scout.json?raw";
import tournamentDetailSrc from "../../pages/fpg/TournamentDetail.tsx?raw";
import drawTabSrc from "../../ui/DrawTab.tsx?raw";

describe("withKidsDob — regras", () => {
  const kidsMap = new Map<string, KidsLinkEntry>([
    ["ana silva", { n: "Ana Silva", id: "a1" }],
    ["manuel medeiros", { n: "Manuel Medeiros", id: "m1", fed: "52884" }],
    ["rui estimado", { n: "Rui Estimado", id: "e1" }],
  ]);
  const scout: ScoutDobFile = { players: { a1: { d: "2013-02-03" }, m1: { d: "2014-04-29" }, e1: { ne: [2013, 2014] } } };
  const lookup = makeKidsDobLookup(kidsMap, scout);

  it("dá a data a quem não tem, sem mexer em quem já tem", () => {
    const t = { players: [{ name: "Ana Silva" }, { name: "Ana Silva", dob: "2013-01-01" }, { name: "Ana Silva", birthYear: 2012 }] };
    const out = withKidsDob(t, lookup);
    expect(out.players.map(p => p.dob ?? null)).toEqual(["2013-02-03", "2013-01-01", null]);
  });

  it("a data lida ganha ao ano solto da fonte quando é o mesmo ano (ranking da Federgolf)", () => {
    const out = withKidsDob({ players: [{ name: "Ana Silva", birthYear: 2013 }, { name: "Ana Silva", birthYearEst: 2012 }] }, lookup);
    expect(out.players.map(p => (p as { dob?: string }).dob ?? null)).toEqual(["2013-02-03", "2013-02-03"]);
  });

  it("um homónimo com outro federado não herda a data (o pai do Manuel)", () => {
    expect(lookup("Manuel Medeiros", "54907")).toBeUndefined();
    expect(kidsDobLida(lookup("Manuel Medeiros", "52884"))).toBe("2014-04-29");
  });

  it("só a data completa — nunca um ano solto", () => {
    const l = makeKidsDobLookup(kidsMap, { players: { a1: { d: "2013" } } });
    expect(l("Ana Silva")).toBeUndefined();
  });

  it("sem data, o ano estimado pelos escalões USKids — marcado como estimativa", () => {
    const out = withKidsDob({ players: [{ name: "Rui Estimado" }, { name: "Rui Estimado", birthYearEst: 2010 }] }, lookup);
    expect(out.players[0]).toEqual({ name: "Rui Estimado", birthYearEst: 2013, birthYearEstMax: 2014, estNote: KIDS_EST_NOTE });
    expect(out.players[1]).toEqual({ name: "Rui Estimado", birthYearEst: 2010 });
    expect(kidsDobLida(lookup("Rui Estimado"))).toBeUndefined();
  });

  it("sem nada a acrescentar devolve o mesmo objecto", () => {
    const t = { players: [{ name: "Ninguém" }] };
    expect(withKidsDob(t, lookup)).toBe(t);
    expect(withKidsDob(t, null)).toBe(t);
  });
});

describe("Venice Open 2026 · Boys 12 (USKids t=22243) — dados reais", () => {
  const res = (JSON.parse(resultsRaw) as { resultados: TorneioResult[] }).resultados;
  const torneio = res.find(t => String(t.t) === "22243");
  const escalao = torneio?.escaloes.find(e => e.nome === "Boys 12");
  const kidsMap = buildKidsLinkMap((JSON.parse(linksRaw) as { j: LinkRow[] }).j.map(fromLinkRow));
  const scout = JSON.parse(scoutRaw) as ScoutDobFile;
  const lookup = makeKidsDobLookup(kidsMap, scout);

  it("quem tem a data no Kids 2 aparece com ela na tabela", () => {
    expect(torneio && escalao).toBeTruthy();
    const base = escalaoToTournament(escalao!, torneio!);
    expect(precisaKidsDob(base.players)).toBe(true);
    const t = withKidsDob(base, lookup) as unknown as { players: { name: string; dob?: string; birthYearEst?: number; birthYearEstMax?: number }[] };
    const dobDe = (n: string) => t.players.find(p => p.name.toLowerCase().includes(n))?.dob;
    expect(dobDe("elchaninov")).toBe("2014-05-13");
    expect(dobDe("ormaechea")).toBe("2013-10-16");
    expect(dobDe("medeiros")).toBe("2014-04-29");
    // Sem data lida, o ano estimado pelos escalões USKids (02/11/2026: «a maioria
    // continua sem ter os dados»): Matteo 2014, Luis Maier 2013.
    const est = (n: string) => { const p = t.players.find(x => x.name.toLowerCase().includes(n)); return p && [p.birthYearEst, p.birthYearEstMax]; };
    expect(est("durando")).toEqual([2014, 2014]);
    expect(est("luis maier")).toEqual([2013, 2013]);
    // Regra geral: todos os que o Kids 2 conhece ficam com nascimento, e são quase todos.
    const esperados = base.players.filter(p => lookup(p.name)).length;
    expect(esperados).toBeGreaterThanOrEqual(28);
    expect(t.players.filter(p => p.dob || p.birthYearEst != null).length).toBe(esperados);
  });

  it("o TournamentDetail e o DrawTab passam pela regra (senão a tabela volta a sair vazia)", () => {
    expect(tournamentDetailSrc).toMatch(/withKidsDob\(tournamentIn, kidsDob\)/);
    expect(drawTabSrc).toMatch(/kidsDob\?\.\(p\.nome, fed\)/);
  });
});
