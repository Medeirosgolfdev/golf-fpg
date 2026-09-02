import { describe, it, expect } from "vitest";
import { buildRepeaters, currentField, masterTeeRatings, nameKey, teeRatings } from "../repeatersModel";
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

describe("masterTeeRatings — a ficha do campo é a fonte autoritativa dos tees", () => {
  const master = {
    courses: [{
      courseKey: "terras-da-comporta-torre-golf-course",
      master: { tees: [
        { teeName: "LARANJAS", sex: "F", ratings: { holes18: { courseRating: 74.2, slopeRating: 132 } } },
        { teeName: "LARANJAS", sex: "M", ratings: { holes18: { courseRating: 68.7, slopeRating: 127 } } },
        { teeName: "AMARELAS", sex: "M", ratings: { holes18: { courseRating: 66.2, slopeRating: 122 } } },
      ] },
    }],
  };

  it('casa o nome do torneio ("Terras da Comporta - Torre") com o slug do campo', () => {
    const r = masterTeeRatings(master, "Terras da Comporta - Torre");
    expect(r.get("laranjas|F")).toEqual({ cr: 74.2, slope: 132 });
    expect(r.get("laranjas|M")).toEqual({ cr: 68.7, slope: 127 });
  });

  it("não inventa nada para um campo desconhecido", () => {
    expect(masterTeeRatings(master, "Campo Que Não Existe").size).toBe(0);
    expect(masterTeeRatings(null, "Terras da Comporta - Torre").size).toBe(0);
  });

  it("ganha ao rating inferido das edições anteriores", () => {
    const prev = torneio([jogador({ name: "GAO,Angelina", fedCode: "51523", teeName: "AMARELAS",
      courseRating: 71.1, slope: 126,
      roundScores: [{ round: 1, gross: 73, courseRating: 71.1, slope: 126, teeName: "AMARELAS", scores: Array(18).fill(4), pars: Array(18).fill(4) }] })]);
    const current = {
      ccode: "192", tcode: "90101", players: [], rounds: 1, campo: "Terras da Comporta - Torre",
      _draws: { "1": { groups: [{ tee: "Laranjas", players: [{ nome: "Angelina Gao", fed: "51523" }] }] } },
    } as unknown as Tournament;
    const fedInfo = () => ({ hcp: 4, club: null, escalao: "Sub-16", sex: "F" });
    const previous = [{ id: "a", year: 2025, t: prev }];

    const sem = buildRepeaters({ current, previous, fedInfo });
    const com = buildRepeaters({ current, previous, fedInfo, masterRatings: masterTeeRatings(master, current.campo) });
    expect(sem[0].forecast!.teeKnown).toBe(false);
    expect(com[0].forecast!.teeKnown).toBe(true);
    // As laranjas (74.2/132) são bem mais duras que as amarelas (71.1/126) que
    // o fallback usava → a previsão TEM de subir.
    expect(com[0].forecast!.total).toBeGreaterThan(sem[0].forecast!.total);
  });
});

describe("previsão pela FORMA (player-stats)", () => {
  const prev = torneio([
    jogador({ name: "ROCHA,João", fedCode: "48297", grossTotal: 150, toPar: 6, hcpExact: 6.0 }),
    // field com dispersão, para haver mediana (precisa de ≥5 differentials)
    ...Array.from({ length: 6 }, (_, i) => jogador({
      name: `OUTRO${i},X`, fedCode: `9000${i}`, hcpExact: 10,
      roundScores: [{ round: 1, gross: 80 + i, courseRating: 71, slope: 130, teeName: "AMARELAS", scores: Array(18).fill(4), pars: Array(18).fill(4) }],
    })),
  ]);
  const hoje = {
    ccode: "192", tcode: "90101", players: [], rounds: 2,
    _draws: { "1": { groups: [{ teeTime: "11:05", tee: "AMARELAS", players: [{ nome: "João Rocha", fed: "48297" }] }] } },
  } as unknown as Tournament;
  const fedInfo = () => ({ hcp: 3.8, club: null, escalao: "Sub-14", sex: "M" });
  const form = () => ({ avgSD5: 4.6, avgSD8: 3.0, avgSD20: 7.0, lastSD: 5, roundsLast3m: 12,
    roundsLast12m: 40, hcpDelta3m: -1.2, bestGross: 70, avgGross5: 75, lastRoundDate: "2026-08-30" });
  const previous = [{ id: "a", year: 2025, t: prev }];

  it("usa o MEIO entre o bom dia e o dia normal, não o potencial", () => {
    const r = buildRepeaters({ current: hoje, previous, fedInfo, form });
    const f = r[0].forecast!;
    expect(f.basis).toBe("forma");
    // meio de 3.0 e 7.0 = 5.0 → 71 + 5×130/113 ≈ 76.8 → 77/volta
    expect(f.perRound).toBe(77);
    expect(f.total).toBe(154);
  });

  it("⚠ nunca prevê melhor do que o bom dia do jogador (regressão do Nuno)", () => {
    // Bug real: prever pelo avgSD8 dava 132 (66+66) a quem tem UM 66 na vida.
    const r = buildRepeaters({ current: hoje, previous, fedInfo, form });
    const f = r[0].forecast!;
    const bomDia = Math.round(71 + (3.0 * 130) / 113) * 2;
    expect(f.total).toBeGreaterThan(bomDia);
  });

  it("o ajuste ao campo NÃO entra na previsão — só informa", () => {
    const r = buildRepeaters({ current: hoje, previous, fedInfo, form });
    // Jogou bem melhor que a mediana do field (150 vs ~161) → fit negativo…
    expect(r[0].courseFit).toBeLessThan(0);
    // …mas a previsão continua a ser só a forma convertida no tee.
    expect(r[0].forecast!.perRound).toBe(77);
  });

  it("sem forma, cai no comportamento antigo (histórico + índice)", () => {
    const r = buildRepeaters({ current: hoje, previous, fedInfo });
    expect(r[0].forecast!.basis).toBe("historico");
  });

  it("traz a hora de saída e o tee do draw", () => {
    const r = buildRepeaters({ current: hoje, previous, fedInfo, form });
    expect(r[0].teeTime).toBe("11:05");
    expect(r[0].teeNow).toBe("AMARELAS");
  });
});
