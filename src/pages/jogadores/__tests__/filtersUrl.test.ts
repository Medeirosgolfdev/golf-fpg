/**
 * Testes do codec filtros ↔ query-string (src/pages/jogadores/filtersUrl.ts).
 */
import { describe, it, expect } from "vitest";
import { writeFiltersToParams, readFiltersFromParams, hasFilterParams } from "../filtersUrl";
import type { JogadoresFilterState } from "../filterPlayers";

const base = (over: Partial<JogadoresFilterState> = {}): JogadoresFilterState => ({
  q: "",
  sexFilter: "ALL",
  escalaoFilter: new Set<string>(),
  regionFilter: "ALL",
  natFilter: "ALL",
  clubFilter: "ALL",
  hcpMin: "",
  hcpMax: "",
  activeOnlyFilter: false,
  sourceFilter: "ALL",
  includeSeniors: false,
  newFilter: false,
  onlyPP: false,
  prioritizeJuniors: true,
  sortKey: "rounds",
  sortDir: "desc",
  ...over,
});

describe("writeFiltersToParams", () => {
  it("estado default não escreve nada (URL limpo fica limpo)", () => {
    const params = new URLSearchParams();
    const changed = writeFiltersToParams(base(), "todos", params);
    expect(changed).toBe(false);
    expect(params.toString()).toBe("");
  });

  it("escreve só os não-default e limpa os que voltam ao default", () => {
    const params = new URLSearchParams();
    writeFiltersToParams(base({ q: "silva", sexFilter: "F", escalaoFilter: new Set(["Sub-12", "Sub-10"]) }), "todos", params);
    expect(params.get("q")).toBe("silva");
    expect(params.get("sexo")).toBe("F");
    expect(params.get("esc")).toBe("Sub-10,Sub-12"); // ordenado → URL estável
    // voltar ao default limpa
    writeFiltersToParams(base(), "todos", params);
    expect(params.toString()).toBe("");
  });

  it("não toca em params alheios (?view= do PlayerDetail)", () => {
    const params = new URLSearchParams("view=analysis");
    writeFiltersToParams(base({ q: "x" }), "todos", params);
    expect(params.get("view")).toBe("analysis");
    expect(params.get("q")).toBe("x");
  });

  it("ordenação default (rounds desc) fica fora do URL; custom entra", () => {
    const params = new URLSearchParams();
    writeFiltersToParams(base({ sortKey: "hcp", sortDir: "asc" }), "todos", params);
    expect(params.get("ord")).toBe("hcp");
    expect(params.get("dir")).toBe("asc");
  });

  it("viewMode 'ours' entra como modo=ours; 'todos' (default) não", () => {
    const params = new URLSearchParams();
    writeFiltersToParams(base(), "ours", params);
    expect(params.get("modo")).toBe("ours");
    writeFiltersToParams(base(), "todos", params);
    expect(params.get("modo")).toBeNull();
  });
});

describe("readFiltersFromParams", () => {
  it("roundtrip: o que se escreve lê-se igual", () => {
    const f = base({
      q: "joão", sexFilter: "M", escalaoFilter: new Set(["Sub-14"]),
      regionFilter: "Madeira", natFilter: "FOREIGN", clubFilter: "007",
      hcpMin: "5", hcpMax: "20,5", activeOnlyFilter: true,
      sourceFilter: "CADASTRO", newFilter: true, onlyPP: true,
      sortKey: "hcp", sortDir: "desc",
    });
    const params = new URLSearchParams();
    writeFiltersToParams(f, "ours", params);
    const { patch, viewMode } = readFiltersFromParams(params);
    expect(viewMode).toBe("ours");
    expect(patch.q).toBe("joão");
    expect(patch.sexFilter).toBe("M");
    expect([...patch.escalaoFilter!]).toEqual(["Sub-14"]);
    expect(patch.regionFilter).toBe("Madeira");
    expect(patch.natFilter).toBe("FOREIGN");
    expect(patch.clubFilter).toBe("007");
    expect(patch.hcpMin).toBe("5");
    expect(patch.hcpMax).toBe("20,5");
    expect(patch.activeOnlyFilter).toBe(true);
    expect(patch.sourceFilter).toBe("CADASTRO");
    expect(patch.newFilter).toBe(true);
    expect(patch.onlyPP).toBe(true);
    expect(patch.sortKey).toBe("hcp");
    expect(patch.sortDir).toBe("desc");
  });

  it("ignora valores inválidos em silêncio", () => {
    const params = new URLSearchParams("sexo=X&ord=batata&hmin=abc&nac=DE&modo=ambos");
    const { patch, viewMode } = readFiltersFromParams(params);
    expect(patch.sexFilter).toBeUndefined();
    expect(patch.sortKey).toBeUndefined();
    expect(patch.hcpMin).toBeUndefined();
    expect(patch.natFilter).toBeUndefined();
    expect(viewMode).toBeUndefined();
  });

  it("ord sem dir usa o default do selector (rounds/aces→desc, resto→asc)", () => {
    expect(readFiltersFromParams(new URLSearchParams("ord=aces")).patch.sortDir).toBe("desc");
    expect(readFiltersFromParams(new URLSearchParams("ord=name")).patch.sortDir).toBe("asc");
  });
});

describe("hasFilterParams", () => {
  it("detecta presença de qualquer param nosso, ignora alheios", () => {
    expect(hasFilterParams(new URLSearchParams("view=analysis"))).toBe(false);
    expect(hasFilterParams(new URLSearchParams("esc=Sub-12"))).toBe(true);
    expect(hasFilterParams(new URLSearchParams("modo=ours"))).toBe(true);
  });
});
