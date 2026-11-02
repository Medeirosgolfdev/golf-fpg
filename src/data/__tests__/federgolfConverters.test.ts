import { describe, it, expect } from "vitest";
import { escalaoCanon } from "../model/escalao";
import { fgNome, fgClube, fgEscalao, fgEscalaoProva, fgPais, fgTemCartoes, fgTitulo, fgToTournament } from "../federgolf/toTournament";
import { fgAdmissions, fgAdmissionsCols, fgNotaPtNaoJogaram } from "../federgolf/admissions";
import { FG_RANKING_CATS, fgAnosNascimento, fgIdPorNomeUnico, fgRankingDoJogador, type FgRanking } from "../federgolf/ranking";
import { buildFgEntries, fgNomeBase } from "../federgolf/entries";
import type { FgIndice, FgProva } from "../federgolf/types";

const PAR = [4, 5, 5, 3, 4, 3, 4, 4, 4, 4, 4, 3, 4, 5, 3, 4, 4, 4];
const prova: FgProva = {
  fonte: "federgolf.it", id: "6ef43695", nome: "CAMPIONATO NAZIONALE BABY - MASCHILE", data: "2026-06-30",
  clube: "ASIAGO", tipo: "Campionati Nazionali", categoria: "Baby", sexo: "M", voltas: 2,
  url: "https://www.federgolf.it/attivita-agonistica/dettaglio-gara/6ef43695/",
  campo: { par: PAR, metros: PAR.map(() => 300) },
  completo: true, extraidoEm: "2026-11-02T00:00:00Z",
  jogadores: [
    {
      pos: 1, nome: "DURANDO, MATTEO", id: "a1", clube: "MONTICELLO", indice: 6.2, cat: "B", qual: "BG", odm: 356, hcp: 1,
      voltas: [69, 72], total: 141, toPar: -1,
      cartoes: [[4, 5, 6, 3, 3, 2, 4, 4, 4, 4, 4, 3, 4, 4, 3, 5, 3, 4], [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 4, 3, 5, 4, 6]],
      rating: [{ tee: "Verde", cr: 65.8, slope: 115, sd: 3.1, data: "2026-06-30" }, { tee: "Verde", cr: 65.8, slope: 115, sd: 6.1, data: "2026-07-01" }],
    },
    {
      pos: 71, nome: "D'ADDABBO, ALESSANDRO", id: "a2", clube: "TERRE DI CANOSSA", indice: 17.2, cat: "B", qual: "B", odm: null, hcp: 11,
      voltas: [85, null], total: 85, toPar: null,
      cartoes: [[5, 5, 5, 3, 6, 4, 5, 4, 5, 4, 6, 4, 4, 7, 4, 5, 5, 4], null],
      rating: [{ tee: "Verde", cr: 65.8, slope: 115, sd: 18.9, data: "2026-06-30" }, null],
    },
  ],
};

describe("Federgolf — nomes e escalões", () => {
  it("troca «APELIDO, NOME» e capitaliza (apóstrofo e apelidos compostos)", () => {
    expect(fgNome("DURANDO, MATTEO")).toBe("Matteo Durando");
    expect(fgNome("D'ADDABBO, ALESSANDRO")).toBe("Alessandro D'Addabbo");
    expect(fgNome("BIANCHI FEDRIGONI, GIOVANNI")).toBe("Giovanni Bianchi Fedrigoni");
    expect(fgClube("ROMA ACQUASANTA")).toBe("Roma Acquasanta");
    expect(fgClube("SICILIA'S PICCIOLO")).toBe("Sicilia's Picciolo");
    expect(fgTitulo('TROFEO "FELICE COLOMBO ACADEMY"')).toBe('Trofeo "Felice Colombo Academy"');
    expect(fgTitulo("TGF U18 GOLF ROSSERA")).toBe("TGF U18 Golf Rossera");
    expect(fgTitulo("GC MILANO JUNIOR TROPHY BY AJGA IPS - WAGR")).toBe("GC Milano Junior Trophy By AJGA IPS - WAGR");
  });
  it("categorias italianas pela tabela única (Baby U12 … Ragazzi U18)", () => {
    expect(escalaoCanon("Baby", "it")).toBe("Sub 12");
    expect(escalaoCanon("Pulcine", "it")).toBe("Sub 14");
    expect(escalaoCanon("Cadetti", "it")).toBe("Sub 16");
    expect(escalaoCanon("Ragazze", "it")).toBe("Sub 18");
    expect(fgEscalao("B")).toBe("Sub 12");
    expect(fgEscalao("P")).toBe("Sub 14");
    expect(fgEscalao(null)).toBeNull();
    expect(fgEscalaoProva("U16")).toBe("Sub 16");
    expect(fgEscalaoProva("TGF")).toBe("TGF");
  });
});

describe("Federgolf — prova → Tournament", () => {
  const t = fgToTournament(prova);
  const [p1, p2] = t.players;
  const rs1 = p1.roundScores ?? [];
  it("voltas com cartão, tee, CR/Slope e SD oficial", () => {
    expect(t.rounds).toBe(2);
    expect(p1.name).toBe("Matteo Durando");
    expect(p1.roundScores).toHaveLength(2);
    expect(rs1[0].gross).toBe(69);
    expect(rs1[0].teeName).toBe("Verde");
    expect(rs1[0].courseRating).toBe(65.8);
    expect((rs1[1] as unknown as { sd: number }).sd).toBe(6.1);
    expect(p1.toPar).toBe(-1);
    expect((p1 as unknown as { escalao: string }).escalao).toBe("Sub 12");
  });
  it("quem só jogou uma volta: WD, ±par pelas voltas jogadas (nunca o −57 da fonte)", () => {
    expect(p2.roundScores).toHaveLength(1);
    expect(p2.toPar).toBe(85 - 71);
    expect((p2 as unknown as { _wd: boolean })._wd).toBe(true);
  });
});

describe("Federgolf — inscritos e estrangeiros", () => {
  it("o «clube» dos estrangeiros é o país (códigos próprios da Federgolf)", () => {
    expect(fgPais("FRA")).toBe("FR");
    expect(fgPais("SWI")).toBe("CH");
    expect(fgPais("SCO")).toBe("GB-SCT");
    expect(fgPais("POR")).toBe("PT");
    expect(fgPais("MONTICELLO")).toBeNull();
  });
  it("Lista iscritti → AdmissionsTab: estado, escalão, país e as colunas Qual./OdM/WAGR", () => {
    const comLista: FgProva = { ...prova, inscritos: [
      { n: 1, nome: "BIELLI, PIERGIORGIO", clube: "MILANO", cat: "C", qual: "BN", wagr: null, indice: -0.6, odm: 67, data: "2026-10-17", estado: "ammesso" },
      { n: 2, nome: "FABRE, Anatole", clube: "FRA", cat: "C", qual: null, wagr: 818, indice: -5.3, odm: null, data: "2026-07-10", estado: "wildcard" },
      { n: 3, nome: "ROSSI, LUCA", clube: "OLGIATA", cat: "R", qual: "B", wagr: null, indice: 4, odm: null, data: null, estado: "cancellato" },
      { n: 4, nome: "VERDI, PAOLO", clube: "ASOLO", cat: "P", qual: "BG", wagr: null, indice: 9, odm: 300, data: "2026-10-18", estado: "attesa" },
    ] };
    const adm = fgAdmissions(comLista)!;
    const [a, b, c, d] = adm.players!;
    expect(a).toMatchObject({ nome: "Piergiorgio Bielli", clube: "Milano", hcp: -0.6, escalao: "Sub 16", status: "confirmed", dataInscricao: "2026/10/17" });
    expect(b).toMatchObject({ nome: "Anatole Fabre", country: "FR", status: "confirmed", tags: ["Wildcard"] });
    expect(c.status).toBe("desistente");
    expect(d).toMatchObject({ status: "reserva", escalao: "Sub 14" });
    expect(adm.totalInscritos).toBe(2);
    expect(adm.reservas).toBe(1);
    expect(fgAdmissionsCols(adm).map((col) => col.key)).toEqual(["qual", "odm", "wagr"]);
    expect(fgAdmissions(prova)).toBeUndefined();
  });
  it("portugueses inscritos que não jogaram → nota no Resumo", () => {
    const comPt: FgProva = { ...prova, inscritos: [
      { n: 1, nome: "DURANDO, MATTEO", clube: "MONTICELLO", cat: "B", qual: null, wagr: null, indice: 6.2, odm: null, data: null, estado: "ammesso" },
      { n: 2, nome: "DIAS, SANTIAGO", clube: "POR", cat: "C", qual: null, wagr: null, indice: 2, odm: null, data: null, estado: "attesa" },
    ] };
    expect(fgNotaPtNaoJogaram(comPt)?.text).toBe("🇵🇹 Inscritos que não chegaram a jogar: Santiago Dias (ficou em lista de espera)");
    expect(fgNotaPtNaoJogaram(prova)).toBeNull();
  });
});

describe("Federgolf — ranking juvenil", () => {
  it("encontra o jogador em todas as listas, do ano mais recente para trás", () => {
    const l = (pos: number, id: string, idade: number) => ({ pos, nome: "DURANDO MATTEO", clube: "MONTICELLO", zona: 2, idade, qual: "BG", voltas: 25, minimo: true, media: 4.3, id });
    const r: FgRanking = { geradoEm: "", anos: {
      "2025": { "M-12": [l(3, "x", 11), l(5, "a1", 11)] },
      "2026": { "M-12": [l(1, "a1", 12)], "M-14": [l(40, "a1", 12), l(1, "y", 14)] },
    } };
    const e = fgRankingDoJogador(r, "a1");
    expect(e.map((x) => [x.ano, x.categoria, x.pos, x.de])).toEqual([["2026", "Baby", 1, 1], ["2026", "Pulcini", 40, 2], ["2025", "Baby", 5, 2]]);
    expect(FG_RANKING_CATS.map((c) => c.escalao)).toEqual(["Sub 12", "Sub 14", "Sub 16", "Sub 18"]);
  });
  it("ano de nascimento = ano do ranking − idade (o ano mais recente) e chega às tabelas", () => {
    const l = (id: string, idade: number) => ({ pos: 1, nome: "X", clube: null, zona: null, idade, qual: null, voltas: 1, minimo: true, media: 1, id });
    const nasc = fgAnosNascimento({ geradoEm: "", anos: { "2025": { "M-12": [l("a1", 11), l("z9", 12)] }, "2026": { "M-12": [l("a1", 12)] } } });
    expect(nasc.get("a1")).toBe(2014);
    expect(nasc.get("z9")).toBe(2013);
    expect(fgAnosNascimento(null).size).toBe(0);
    const t = fgToTournament(prova, nasc);
    expect((t.players[0] as unknown as { birthYear: number }).birthYear).toBe(2014);
    expect((t.players[1] as unknown as { birthYear?: number }).birthYear).toBeUndefined();
    // Inscrições: pelo nome do inscrito → id da classificação (a lista não traz o id).
    const adm = fgAdmissions({ ...prova, inscritos: [
      { n: 1, nome: "DURANDO, Matteo", clube: "MONTICELLO", cat: "B", qual: "BG", wagr: null, indice: 6.2, odm: 356, data: null, estado: "ammesso" },
      { n: 2, nome: "ROSSI, LUCA", clube: "OLGIATA", cat: "B", qual: null, wagr: null, indice: 20, odm: null, data: null, estado: "cancellato" },
    ] }, nasc)!;
    expect(adm.players!.map((p) => p.birthYear)).toEqual([2014, null]);
    // Quem não jogou: pelo nome no ranking, só se o nome der UM id.
    const r: FgRanking = { geradoEm: "", anos: { "2026": {
      "M-12": [{ ...l("r1", 12), nome: "ROSSI, LUCA" }, { ...l("h1", 12), nome: "BIANCHI, PAOLO" }],
      "M-14": [{ ...l("h2", 13), nome: "BIANCHI, PAOLO" }],
    } } };
    const porNome = fgIdPorNomeUnico(r);
    expect(porNome.get("ROSSI, LUCA")).toBe("r1");
    expect(porNome.has("BIANCHI, PAOLO")).toBe(false);
    const adm2 = fgAdmissions({ ...prova, inscritos: [
      { n: 2, nome: "ROSSI, LUCA", clube: "OLGIATA", cat: "B", qual: null, wagr: null, indice: 20, odm: null, data: null, estado: "cancellato" },
    ] }, fgAnosNascimento(r), porNome)!;
    expect(adm2.players![0].birthYear).toBe(2014);
  });
});

describe("Federgolf — entradas", () => {
  it("tira o sexo do nome", () => {
    expect(fgNomeBase("TROFEO ROCCA D'ASOLO- MASCHILE")).toBe("TROFEO ROCCA D'ASOLO");
    expect(fgNomeBase("CAMPIONATO NAZIONALE PULCINI - MASCHILE - TROFEO EMANUELE GALEPPINI")).toBe("CAMPIONATO NAZIONALE PULCINI - TROFEO EMANUELE GALEPPINI");
  });
  it("junta M e F da mesma prova (mesmo dia e clube) numa entrada", () => {
    const base = { clube: "ASIAGO", tipo: "Campionati Nazionali", categoria: "Baby", voltas: 2, parTotal: 71, tees: ["Verde"], completo: true };
    const idx: FgIndice = {
      fonte: "federgolf.it", geradoEm: "",
      provas: [
        { ...base, id: "f", nome: "CAMPIONATO NAZIONALE BABY - FEMMINILE", data: "2026-06-30", sexo: "F", jogadores: 30 },
        { ...base, id: "m", nome: "CAMPIONATO NAZIONALE BABY - MASCHILE", data: "2026-06-30", sexo: "M", jogadores: 72 },
        { ...base, id: "x", nome: "CAMPIONATO NAZIONALE CADETTI", data: "2026-06-30", clube: "ASOLO", categoria: "Cadetti", sexo: "M", jogadores: 90 },
      ],
    };
    const es = buildFgEntries(idx);
    expect(es).toHaveLength(2);
    const baby = es.find((e) => e.memberIds)!;
    expect(baby.id).toBe("m");
    expect(baby.memberIds).toEqual(["m", "f"]);
    expect(baby.name).toBe("Campionato Nazionale Baby");
    expect(baby.sex).toBe("Mixed");
    expect(baby.playerCount).toBe(102);
    expect(baby.escalao).toBe("Sub 12");
  });
  it("junta «Pulcine» e «Pulcini» do mesmo dia e clube (nomes antigos, sem MASCHILE/FEMMINILE)", () => {
    const base = { data: "2019-07-02", clube: "FOLGARIA", tipo: "Campionati Nazionali", categoria: "Pulcini", voltas: 3, parTotal: 72, tees: [], completo: false };
    const es = buildFgEntries({ fonte: "", geradoEm: "", provas: [
      { ...base, id: "a", nome: "CAMPIONATO NAZIONALE PULCINI", sexo: "M", jogadores: 60 },
      { ...base, id: "b", nome: "CAMPIONATO NAZIONALE PULCINE", sexo: "F", jogadores: 25 },
    ] });
    expect(es).toHaveLength(1);
    expect(es[0].memberIds).toEqual(["a", "b"]);
  });
  it("prova só com totais (passagem rápida) → a MESMA prova do TournamentDetail, sem buraco a buraco", () => {
    const semCartoes: FgProva = { ...prova, campo: null, parTotal: 71, jogadores: prova.jogadores.map((j) => ({ ...j, cartoes: j.cartoes.map(() => null) })) };
    expect(fgTemCartoes(semCartoes)).toBe(false);
    expect(fgTemCartoes(prova)).toBe(true);
    const t = fgToTournament(semCartoes);
    expect((t as unknown as { _noHbh: boolean })._noHbh).toBe(true);
    expect((fgToTournament(prova) as unknown as { _noHbh?: boolean })._noHbh).toBeUndefined();
    const [p1, p2] = t.players;
    expect(p1.toPar).toBe(-1);
    // Sem ±par da fonte (falta a R2): total − par da volta × voltas jogadas.
    expect(p2.toPar).toBe(85 - 71);
    // O SD oficial fica em cada volta, como nas provas com cartões.
    expect((p1.roundScores ?? []).map((r) => (r as unknown as { sd: number }).sd)).toEqual([3.1, 6.1]);
    expect(p1.roundScores?.[0].courseRating).toBe(65.8);
  });
});
