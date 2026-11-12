import { describe, it, expect } from "vitest";
import { buildRfegEntries, juntarContidosNoPdf } from "../entries";
import type { RFEGIndex, RFEGIndexEntry } from "../types";
import type { CircuitDivision } from "../../../ui/circuit/types";

const e = (id: string, o: Partial<RFEGIndexEntry>): RFEGIndexEntry => ({
  source: "golfdirecto", id, filePath: `x/${id}.json`, name: `Prova ${id}`, year: 2025, category: "Infantil", sex: "Mixto",
  dateStart: null, dateEnd: null, dateStartIso: null, dateEndIso: null, course: null, leaderboardPlayers: (o.roster ?? []).length, ...o,
} as RFEGIndexEntry);

const todos = Array.from({ length: 20 }, (_, i) => `jogador ${String(i).padStart(2, "0")}`);
const pdf = e("pdf", { source: "fvg", federation: "Federación Vasca de Golf", dateStartIso: "2025-08-19", dateEndIso: "2025-08-21", roster: todos });
const jornada2 = e("j2", { organizer: "Federación Vasca de Golf", dateStartIso: "2025-08-20", dateEndIso: "2025-08-20", roster: todos.slice(0, 8) });

describe("juntarContidosNoPdf — o PDF regional que contém um pedaço vindo de outra fonte", () => {
  it("esconde o pedaço dentro da prova do PDF", () => {
    const r = juntarContidosNoPdf([jornada2, pdf]);
    expect(r.map((t) => t.id)).toEqual(["pdf"]);
    expect(r[0].entradasContidas?.map((t) => t.id)).toEqual(["j2"]);
  });

  it("não junta: outra federação", () => {
    const lista = [{ ...jornada2, organizer: "Federación Navarra de Golf" }, pdf];
    expect(juntarContidosNoPdf(lista)).toBe(lista);
  });

  it("não junta: dia fora das datas do PDF (provas em dias seguidos têm os mesmos habituais)", () => {
    const lista = [{ ...jornada2, dateStartIso: "2025-08-22" }, pdf];
    expect(juntarContidosNoPdf(lista)).toBe(lista);
  });

  it("não junta: menos de 85 % dos jogadores no PDF, ou menos de 5 jogadores", () => {
    const outros = [...todos.slice(0, 6), "fora a", "fora b"];
    const a = [{ ...jornada2, roster: outros }, pdf];
    expect(juntarContidosNoPdf(a)).toBe(a);
    const b = [{ ...jornada2, roster: todos.slice(0, 4) }, pdf];
    expect(juntarContidosNoPdf(b)).toBe(b);
  });

  it("não junta: a outra fonte tem tantos ou mais jogadores (não é um pedaço)", () => {
    const lista = [{ ...jornada2, roster: todos }, pdf];
    expect(juntarContidosNoPdf(lista)).toBe(lista);
  });

  it("não toca em pares que não envolvem um PDF regional", () => {
    const lista = [jornada2, { ...pdf, source: "nextcaddy" as const }];
    expect(juntarContidosNoPdf(lista)).toBe(lista);
  });
});

describe("buildRfegEntries — uma entrada, e aba a mais só com cartões", () => {
  const index = { tournaments: [jornada2, pdf] } as unknown as RFEGIndex;
  const divisao = (key: string, comCartoes: boolean): CircuitDivision => ({
    key, escalao: "Infantil",
    results: { players: [{ name: "A", roundScores: [{ gross: 80, scores: comCartoes ? [4, 5, 4] : [] }] }] },
  } as unknown as CircuitDivision);

  it("a lista fica com uma entrada e o link do pedaço abre-a", () => {
    const entries = buildRfegEntries(index, {}, {}, async () => []);
    expect(entries.map((x) => x.id)).toEqual(["fvg:pdf"]);
    expect(entries[0].memberIds).toContain("golfdirecto:j2");
  });

  it("pedaço sem cartões não acrescenta abas (era a mesma classificação outra vez)", async () => {
    const entries = buildRfegEntries(index, {}, {}, async (t) => [divisao(String(t.id), false)]);
    const divs = await entries[0].loadDivisions!();
    expect(divs.map((d) => d.key)).toEqual(["pdf"]);
  });

  it("pedaço com cartões entra como aba «Cartões»", async () => {
    const entries = buildRfegEntries(index, {}, {}, async (t) => [divisao(String(t.id), t.id === "j2")]);
    const divs = await entries[0].loadDivisions!();
    expect(divs.map((d) => d.key)).toEqual(["pdf", "golfdirecto:j2:0"]);
    expect(divs[1].tabLabel).toBe("Cartões · Infantil");
  });
});
