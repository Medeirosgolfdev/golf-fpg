import { describe, it, expect } from "vitest";
import { buildRepeaters, currentField, nameKey, teeRatings } from "../repeatersModel";
import type { Tournament } from "../../../data/fpgTypes";

const jogador = (over: Record<string, unknown>) => ({
  name: "X", fedCode: null, pos: 1, grossTotal: 150, toPar: 6, hcpExact: 10,
  parTotal: 72, nholes: 18, courseRating: 71, slope: 130, teeName: "AMARELAS",
  roundScores: [
    { round: 1, gross: 75, courseRating: 71, slope: 130, teeName: "AMARELAS", scores: Array(18).fill(4), pars: Array(18).fill(4) },
    { round: 2, gross: 75, courseRating: 71, slope: 130, teeName: "AMARELAS", scores: Array(18).fill(4), pars: Array(18).fill(4) },
  ],
  ...over,
});
const torneio = (players: unknown[]): Tournament =>
  ({ ccode: "192", tcode: "10013", name: "Prova", date: "2025-09-12", campo: "Torre", players } as unknown as Tournament);

describe("nameKey — a FPG escreve o nome ao contrário na classificação", () => {
  it('casa "APELIDO,Nome" com "Nome Apelido"', () => {
    expect(nameKey("CASTRO FERREIRA,Ricardo")).toBe(nameKey("Ricardo Castro Ferreira"));
    expect(nameKey("GAO,Angelina")).toBe(nameKey("Angelina Gao"));
  });
  it("não casa pessoas diferentes", () => {
    expect(nameKey("João Rocha")).not.toBe(nameKey("Diogo Rocha"));
  });
});

describe("currentField — o field de hoje vem do DRAW quando não há resultados", () => {
  const comDraw = {
    ccode: "192", tcode: "90101", players: [],
    _draws: { "1": { groups: [{ teeTime: "11:05", tee: "Verdes", players: [
      { nome: "João Rocha", fed: "48297" }, { nome: "William Gao", fed: "51524", tee: "Amarelas" },
    ] }] } },
  } as unknown as Tournament;

  it("lê o draw da R1", () => {
    const f = currentField(comDraw);
    expect(f.map((x) => x.fed)).toEqual(["48297", "51524"]);
    expect(f[0].tee).toBe("Verdes");          // herda o tee do grupo
    expect(f[1].tee).toBe("Amarelas");        // tee próprio ganha ao do grupo
  });

  it("cai para a leaderboard quando o torneio já tem jogadores", () => {
    const f = currentField(torneio([jogador({ name: "SETÚBAL,João", fedCode: "43732" })]));
    expect(f).toHaveLength(1);
    expect(f[0].fed).toBe("43732");
  });
});

describe("teeRatings — o rating do tee depende do SEXO", () => {
  it("separa as mesmas marcas por sexo", () => {
    const prev = torneio([
      jogador({ fedCode: "1", teeName: "AMARELAS", courseRating: 66.2, slope: 122,
        roundScores: [{ round: 1, gross: 75, courseRating: 66.2, slope: 122, teeName: "AMARELAS" }] }),
      jogador({ fedCode: "2", teeName: "AMARELAS", courseRating: 71.1, slope: 126,
        roundScores: [{ round: 1, gross: 75, courseRating: 71.1, slope: 126, teeName: "AMARELAS" }] }),
    ]);
    const r = teeRatings([prev], (fed) => (fed === "1" ? "M" : "F"));
    expect(r.get("amarelas|M")).toEqual({ cr: 66.2, slope: 122 });
    expect(r.get("amarelas|F")).toEqual({ cr: 71.1, slope: 126 });
  });
});

describe("buildRepeaters", () => {
  const prev = torneio([
    jogador({ name: "ROCHA,João", fedCode: "48297", pos: 1, grossTotal: 150, toPar: 6, hcpExact: 6.0 }),
    jogador({ name: "OUTRO,Alguém", fedCode: "99999", pos: 2, grossTotal: 160, toPar: 16, hcpExact: 12 }),
  ]);
  const hoje = {
    ccode: "192", tcode: "90101", players: [], rounds: 2,
    _draws: { "1": { groups: [{ teeTime: "11:05", tee: "AMARELAS", players: [
      { nome: "João Rocha", fed: "48297" },
      { nome: "Novato Qualquer", fed: "12345" },
    ] }] } },
  } as unknown as Tournament;
  const fedInfo = (fed: string | null) =>
    fed === "48297" ? { hcp: 3.8, club: "Estoril", escalao: "Sub-14", sex: "M" } : null;

  it("só devolve quem repete (o novato fica de fora)", () => {
    const r = buildRepeaters({ current: hoje, previous: [{ id: "a", year: 2025, t: prev }], fedInfo });
    expect(r.map((x) => x.fed)).toEqual(["48297"]);
    expect(r[0].bestToPar).toBe(6);
    expect(r[0].hcpThen).toBe(6.0);
    expect(r[0].hcpNow).toBe(3.8);
    expect(r[0].hcpDelta).toBe(-2.2);
  });

  it("a previsão desce quando o índice desceu", () => {
    const r = buildRepeaters({ current: hoje, previous: [{ id: "a", year: 2025, t: prev }], fedInfo });
    const f = r[0].forecast!;
    expect(f.basis).toBe("historico");
    // Fez 75+75 e baixou 2,2 de índice → espera-se ~2 golpes melhor por volta.
    expect(f.perRound).toBeLessThan(75);
    expect(f.perRound).toBeGreaterThan(69);
    expect(f.total).toBe(f.perRound * 2);
    expect(f.low).toBeLessThan(f.total);
    expect(f.high).toBeGreaterThan(f.total);
  });

  it("sem histórico de índice a previsão fica ancorada só no que fez", () => {
    const semHcp = torneio([jogador({ name: "ROCHA,João", fedCode: "48297", hcpExact: null })]);
    const r = buildRepeaters({ current: hoje, previous: [{ id: "a", year: 2025, t: semHcp }], fedInfo });
    expect(r[0].hcpDelta).toBeNull();
    expect(r[0].forecast?.basis).toBe("historico");
  });

  it("ignora sentinelas de 'sem cartão' (gross ≥ 900)", () => {
    const wd = torneio([jogador({ name: "ROCHA,João", fedCode: "48297", grossTotal: 999,
      roundScores: [{ round: 1, gross: 999, courseRating: 71, slope: 130, teeName: "AMARELAS" }] })]);
    const r = buildRepeaters({ current: hoje, previous: [{ id: "a", year: 2025, t: wd }], fedInfo });
    expect(r[0].editions[0].total).toBeNull();
    expect(r[0].editions[0].rounds).toHaveLength(0);
    expect(r[0].sdAvg).toBeNull();
  });

  it("casa por NOME quando o draw não traz federado", () => {
    const semFed = {
      ...hoje,
      _draws: { "1": { groups: [{ players: [{ nome: "João Rocha" }] }] } },
    } as unknown as Tournament;
    const prevSemFed = torneio([jogador({ name: "ROCHA,João", fedCode: null })]);
    const r = buildRepeaters({ current: semFed, previous: [{ id: "a", year: 2025, t: prevSemFed }], fedInfo });
    expect(r).toHaveLength(1);
  });
});

describe("teeKnown — não fingir que se conhece o rating de um tee novo", () => {
  const prev = torneio([jogador({ name: "GAO,Angelina", fedCode: "51523", teeName: "AMARELAS",
    courseRating: 71.1, slope: 126,
    roundScores: [{ round: 1, gross: 73, courseRating: 71.1, slope: 126, teeName: "AMARELAS", scores: Array(18).fill(4), pars: Array(18).fill(4) }] })]);
  const fedInfo = () => ({ hcp: 4, club: null, escalao: "Sub-16", sex: "F" });
  const comTee = (tee: string) => ({
    ccode: "192", tcode: "90101", players: [], rounds: 1,
    _draws: { "1": { groups: [{ tee, players: [{ nome: "Angelina Gao", fed: "51523" }] }] } },
  } as unknown as Tournament);

  it("marca teeKnown=false quando o tee de hoje nunca apareceu", () => {
    const r = buildRepeaters({ current: comTee("Laranjas"), previous: [{ id: "a", year: 2025, t: prev }], fedInfo });
    expect(r[0].forecast?.teeKnown).toBe(false);
  });

  it("marca teeKnown=true quando o tee de hoje tem rating conhecido", () => {
    const r = buildRepeaters({ current: comTee("Amarelas"), previous: [{ id: "a", year: 2025, t: prev }], fedInfo });
    expect(r[0].forecast?.teeKnown).toBe(true);
  });
});
