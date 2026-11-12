/**
 * Nascimento do Kids 2 nas tabelas de torneio (src/data/kidsDob.ts).
 * 02/11/2026: no Venice Open 2026 (USKids, t=22243) as colunas Nasc./Idade do
 * Boys 12 saíam vazias para toda a gente, também para quem tem a data na ficha.
 */
import { describe, it, expect } from "vitest";
import { makeKidsDobLookup, precisaKidsDob, withKidsDob, kidsDobLida, KIDS_EST_NOTE, type ScoutDobFile } from "../kidsDob";
import { buildKidsLinkMap, fromLinkRow, type LinkRow } from "../../hooks/useKidsLinkMap";
import { fichaDoKids } from "../kidsFicha";
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

  it("o ano CERTO da Federgolf (`y`) passa por cima da estimativa e não de um ano lido (03/11/2026)", () => {
    const m = new Map<string, KidsLinkEntry>([["matteo durando", { n: "Matteo Durando", id: "it1" }]]);
    const look = makeKidsDobLookup(m, { players: { it1: { y: 2014 } } });
    expect(look("Matteo Durando")).toEqual({ birthYear: 2014 });
    const out = withKidsDob({ players: [{ name: "Matteo Durando" }, { name: "Matteo Durando", birthYearEst: 2013 }, { name: "Matteo Durando", birthYear: 2015 }] }, look);
    expect(out.players.map(p => p.birthYear ?? null)).toEqual([2014, 2014, 2015]);
    expect(kidsDobLida(look("Matteo Durando"))).toBeUndefined();
  });

  it("o HCP do Kids 2 mais perto da data do torneio pinta o SD de quem não tem HCP (03/11/2026)", () => {
    const m = new Map<string, KidsLinkEntry>([["matteo durando", { n: "Matteo Durando", id: "it1" }]]);
    const look = makeKidsDobLookup(m, { players: { it1: { y: 2014, hh: [["2026-11-02", 1.4], ["2026-07-15", 4.5], ["2025-01-10", 9.9]] } } });
    expect(look.hcpAt?.("Matteo Durando", null, "8/13/2026")).toEqual({ hcp: 4.5, date: "2026-07-15" });
    expect(look.hcpAt?.("Matteo Durando", null, "2027-12-01")).toBeUndefined();   // longe demais
    const out = withKidsDob({ date: "8/13/2026", players: [{ name: "Matteo Durando" }, { name: "Matteo Durando", hcpExact: 2 }] }, look);
    expect(out.players.map(p => p.hcpExact)).toEqual([4.5, 2]);
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
    const t = withKidsDob(base, lookup) as unknown as { players: { name: string; dob?: string; birthYear?: number; birthYearEst?: number; birthYearEstMax?: number }[] };
    const dobDe = (n: string) => t.players.find(p => p.name.toLowerCase().includes(n))?.dob;
    expect(dobDe("elchaninov")).toBe("2014-05-13");
    expect(dobDe("ormaechea")).toBe("2013-10-16");
    expect(dobDe("medeiros")).toBe("2014-04-29");
    // Sem data lida: o ano CERTO da Federgolf para os italianos (03/11/2026 — Matteo
    // Durando 2014, Federico Bertolino 2013) e da DGV-Jugendrangliste para os
    // alemães (Luis Maier 2013); sem ele, o estimado pelos escalões USKids
    // (Kirill Sedov 2013).
    const ano = (n: string) => t.players.find(x => x.name.toLowerCase().includes(n))?.birthYear;
    expect(ano("durando")).toBe(2014);
    expect(ano("bertolino")).toBe(2013);
    expect(ano("luis maier")).toBe(2013);
    const est = (n: string) => { const p = t.players.find(x => x.name.toLowerCase().includes(n)); return p && [p.birthYearEst, p.birthYearEstMax]; };
    expect(est("kirill sedov")).toEqual([2013, 2013]);
    // Regra geral: todos os que o Kids 2 conhece ficam com nascimento, e são quase todos.
    const esperados = base.players.filter(p => lookup(p.name)).length;
    expect(esperados).toBeGreaterThanOrEqual(28);
    expect(t.players.filter(p => p.dob || p.birthYear != null || p.birthYearEst != null).length).toBe(esperados);
  });

  it("o TournamentDetail e o DrawTab passam pela regra (senão a tabela volta a sair vazia)", () => {
    expect(tournamentDetailSrc).toMatch(/withKidsDob\(tournamentIn, kidsDob\)/);
    expect(drawTabSrc).toMatch(/kidsDob\?\.\(p\.nome, fed, juniorIdSrc\)/);
  });
});

describe("a ficha do Kids 2 de uma linha (data/kidsFicha.ts) — o caminho da seta ↗", () => {
  const rows: LinkRow[] = [
    ["f55498", "Zeyn Lababedi", 0, 0, "55498", 0, "GB", "M"],
    ["g1", "Sofia Leblond", 0, 0, 0, 0, "FR", "F"],
    ["u1", "Manuel Medeiros", 0, "630106", "52884", 0, "PT", "M"],
  ];
  const m = buildKidsLinkMap(rows.map(fromLinkRow));

  it("o índice das setas leva o país e o sexo da ficha", () => {
    expect(fichaDoKids(m, { nome: "Sofia Leblond" })).toMatchObject({ id: "g1", pais: "FR", sexo: "F" });
  });

  it("o juniorId da lista ganha ao nome (o PDF escreve «Zeyn Lababed»)", () => {
    expect(fichaDoKids(m, { nome: "Zeyn Lababed" })).toBeUndefined();
    expect(fichaDoKids(m, { nome: "Zeyn Lababed", juniorId: "f55498" })).toMatchObject({ id: "f55498", pais: "GB" });
  });

  it("um homónimo com outro federado não conta (o pai do Manuel)", () => {
    expect(fichaDoKids(m, { nome: "Manuel Medeiros", fed: "54907" })).toBeUndefined();
    expect(fichaDoKids(m, { nome: "Manuel Medeiros", fed: "52884" })?.id).toBe("u1");
  });

  it("o nascimento lê-se pela mesma ficha: com juniorId, mesmo com outro nome", () => {
    const look = makeKidsDobLookup(m, { players: { f55498: { d: "2015-09-16" }, g1: { y: 2016 } } });
    expect(look("Zeyn Lababed")).toBeUndefined();
    expect(look("Zeyn Lababed", null, "f55498")).toEqual({ dob: "2015-09-16" });
    expect(look("Sofia Leblond")).toEqual({ birthYear: 2016 });
  });
});
