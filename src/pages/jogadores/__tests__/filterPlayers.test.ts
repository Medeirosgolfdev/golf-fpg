/**
 * Testes da lógica pura de filtragem/ordenação da JogadoresPage
 * (src/pages/jogadores/filterPlayers.ts). Antes da extracção de 2026-08-15
 * esta lógica vivia no corpo do componente e não tinha testes nenhuns.
 */
import { describe, it, expect } from "vitest";
import {
  applySearch, filterAndSortPlayers, countByEscalao, computeHcpStatsByEscalao,
  countActiveFilters, playerRoundCount, isActivePlayer,
  type JogadoresFilterState, type ListPlayer, type FilterContext,
} from "../filterPlayers";
import { isSeniorEscalao, coerceEscalao } from "../../../constants/escaloes";
import { hcpBinKey } from "../hcpBins";

/* ── Fixtures ─────────────────────────────────────────────── */

function mkPlayer(over: Partial<ListPlayer> & { fed: string; name: string }): ListPlayer {
  return {
    escalao: "Sub-12",
    sex: "M",
    hcp: 20,
    region: "Sul",
    club: { short: "CGSS", long: "Clube de Golf do Santo da Serra", code: "007" },
    tags: [],
    ...over,
  };
}

const defaultFilters = (over: Partial<JogadoresFilterState> = {}): JogadoresFilterState => ({
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
  prioritizeJuniors: false,
  sortKey: "name",
  sortDir: "asc",
  ...over,
});

const emptyCtx = (over: Partial<FilterContext> = {}): FilterContext => ({
  viewMode: "todos",
  statsDb: {},
  ppMap: new Map(),
  ...over,
});

/* ── applySearch ──────────────────────────────────────────── */

describe("applySearch", () => {
  const players = [
    mkPlayer({ fed: "40001", name: "João Silva", club: { short: "Estoril", long: "", code: "004" } }),
    mkPlayer({ fed: "40777", name: "Maria Antónia Sousa" }),
    mkPlayer({ fed: "40003", name: "Pedro Costa", tags: ["PJA"] }),
  ];

  it("devolve tudo com query vazia", () => {
    expect(applySearch(players, "")).toHaveLength(3);
  });

  it("ignora diacríticos e maiúsculas", () => {
    expect(applySearch(players, "antonia").map(p => p.fed)).toEqual(["40777"]);
    expect(applySearch(players, "JOÃO").map(p => p.fed)).toEqual(["40001"]);
  });

  it("multi-palavra exige todas as palavras (qualquer campo)", () => {
    // "silva estoril" → nome + clube do mesmo jogador
    expect(applySearch(players, "silva estoril").map(p => p.fed)).toEqual(["40001"]);
    expect(applySearch(players, "silva porto")).toHaveLength(0);
  });

  it("encontra por nº federado e por tag", () => {
    expect(applySearch(players, "40777").map(p => p.fed)).toEqual(["40777"]);
    expect(applySearch(players, "pja").map(p => p.fed)).toEqual(["40003"]);
  });
});

/* ── filterAndSortPlayers ─────────────────────────────────── */

describe("filterAndSortPlayers", () => {
  const players = [
    mkPlayer({ fed: "10", name: "Ana", escalao: "Sub-10", sex: "F", hcp: 30 }),
    mkPlayer({ fed: "12", name: "Bruno", escalao: "Sub-12", hcp: 12.4 }),
    mkPlayer({ fed: "14", name: "Carlos", escalao: "Sub-14", hcp: 5.1 }),
    mkPlayer({ fed: "90", name: "Diogo", escalao: "Absoluto", hcp: 2 }),
    mkPlayer({ fed: "91", name: "Eva", escalao: "Sénior", sex: "F", hcp: 18 }),
    mkPlayer({ fed: "99", name: "Zé Oculto", tags: ["hidden"] }),
  ];

  it("oculta seniores por defeito (Absoluto/Sénior/…)", () => {
    const out = filterAndSortPlayers(players, defaultFilters(), emptyCtx());
    expect(out.map(p => p.fed)).toEqual(["10", "12", "14"]); // ordenado por nome, sem hidden
  });

  it("includeSeniors traz Absoluto e Sénior de volta", () => {
    const out = filterAndSortPlayers(players, defaultFilters({ includeSeniors: true }), emptyCtx());
    expect(out.map(p => p.fed)).toContain("90");
    expect(out.map(p => p.fed)).toContain("91");
  });

  it("filtro de escalão explícito ganha ao esconder seniores", () => {
    const out = filterAndSortPlayers(players, defaultFilters({ escalaoFilter: new Set(["Absoluto"]) }), emptyCtx());
    expect(out.map(p => p.fed)).toEqual(["90"]);
  });

  it("tag hidden nunca aparece", () => {
    const out = filterAndSortPlayers(players, defaultFilters({ includeSeniors: true }), emptyCtx());
    expect(out.map(p => p.fed)).not.toContain("99");
  });

  it("range de HCP aceita vírgula decimal e exclui sem HCP", () => {
    const withNull = [...players, mkPlayer({ fed: "77", name: "Sem Hcp", hcp: null })];
    const out = filterAndSortPlayers(withNull, defaultFilters({ hcpMin: "5,0", hcpMax: "12,5" }), emptyCtx());
    expect(out.map(p => p.fed).sort()).toEqual(["12", "14"]);
  });

  it("natFilter só actua em modo todos", () => {
    const withForeign = [
      mkPlayer({ fed: "1", name: "Pt", _federadoRaw: { country_prefix: "PT" } as ListPlayer["_federadoRaw"] }),
      mkPlayer({ fed: "2", name: "Es", _federadoRaw: { country_prefix: "ES" } as ListPlayer["_federadoRaw"] }),
      mkPlayer({ fed: "3", name: "SemRaw" }),
    ];
    const foreign = filterAndSortPlayers(withForeign, defaultFilters({ natFilter: "FOREIGN" }), emptyCtx({ viewMode: "todos" }));
    expect(foreign.map(p => p.fed)).toEqual(["2"]);
    const pt = filterAndSortPlayers(withForeign, defaultFilters({ natFilter: "PT" }), emptyCtx({ viewMode: "todos" }));
    // sem country_prefix conta como PT
    expect(pt.map(p => p.fed).sort()).toEqual(["1", "3"]);
    // em modo "ours" o natFilter é ignorado
    const ours = filterAndSortPlayers(withForeign, defaultFilters({ natFilter: "FOREIGN" }), emptyCtx({ viewMode: "ours" }));
    expect(ours).toHaveLength(3);
  });

  it("ordena por HCP asc com nulls no fim", () => {
    const withNull = [...players.slice(0, 3), mkPlayer({ fed: "77", name: "Sem Hcp", hcp: null })];
    const out = filterAndSortPlayers(withNull, defaultFilters({ sortKey: "hcp", sortDir: "asc" }), emptyCtx());
    expect(out.map(p => p.fed)).toEqual(["14", "12", "10", "77"]);
  });

  it("ordena por voltas usando a cadeia roundsCurrentYear → cadastro → 12m → total", () => {
    const ctx = emptyCtx({
      statsDb: {
        "12": { roundsCurrentYear: 8, roundsTotal: 100, roundsLast12m: 20, lastRoundDate: null } as never,
        "14": { roundsCurrentYear: 3, roundsTotal: 50, roundsLast12m: 10, lastRoundDate: null } as never,
      },
    });
    const list = [
      mkPlayer({ fed: "10", name: "Ana", _federadoRaw: { rounds_current_year: 5 } as ListPlayer["_federadoRaw"] }),
      mkPlayer({ fed: "12", name: "Bruno" }),
      mkPlayer({ fed: "14", name: "Carlos" }),
    ];
    const out = filterAndSortPlayers(list, defaultFilters({ sortKey: "rounds", sortDir: "desc" }), ctx);
    expect(out.map(p => p.fed)).toEqual(["12", "10", "14"]);
  });

  it("pin (⭐) põe o Manuel no topo quando ordenado por nome", () => {
    const list = [
      mkPlayer({ fed: "11111", name: "Aaron Primeiro" }),
      mkPlayer({ fed: "52884", name: "Manuel Goulartt Medeiros" }),
    ];
    const noPin = filterAndSortPlayers(list, defaultFilters({ prioritizeJuniors: false }), emptyCtx());
    expect(noPin[0].fed).toBe("11111");
    const pinned = filterAndSortPlayers(list, defaultFilters({ prioritizeJuniors: true }), emptyCtx());
    expect(pinned[0].fed).toBe("52884");
    // pin só actua na ordenação por nome
    const byHcp = filterAndSortPlayers(list, defaultFilters({ prioritizeJuniors: true, sortKey: "hcp" }), emptyCtx());
    expect(byHcp.map(p => p.fed)).toContain("52884");
  });

  it("sourceFilter separa análise vs cadastro (só em todos)", () => {
    const list = [
      mkPlayer({ fed: "1", name: "A", _source: "both" }),
      mkPlayer({ fed: "2", name: "B", _source: "feds" }),
      mkPlayer({ fed: "3", name: "C", _source: "players" }),
    ];
    const anal = filterAndSortPlayers(list, defaultFilters({ sourceFilter: "WITH_ANALYSIS" }), emptyCtx());
    expect(anal.map(p => p.fed).sort()).toEqual(["1", "3"]);
    const cad = filterAndSortPlayers(list, defaultFilters({ sourceFilter: "CADASTRO" }), emptyCtx());
    expect(cad.map(p => p.fed)).toEqual(["2"]);
  });
});

/* ── countByEscalao ───────────────────────────────────────── */

describe("countByEscalao", () => {
  const players = [
    mkPlayer({ fed: "1", name: "A", escalao: "Sub-10" }),
    mkPlayer({ fed: "2", name: "B", escalao: "Sub-10", sex: "F" }),
    mkPlayer({ fed: "3", name: "C", escalao: "Sub-12" }),
    mkPlayer({ fed: "4", name: "D", escalao: "Sub-12", tags: ["hidden"] }),
  ];

  it("conta por escalão respeitando pesquisa/sexo/hidden", () => {
    expect(countByEscalao(players, { q: "", sexFilter: "ALL", regionFilter: "ALL" }))
      .toEqual({ "Sub-10": 2, "Sub-12": 1 });
    expect(countByEscalao(players, { q: "", sexFilter: "F", regionFilter: "ALL" }))
      .toEqual({ "Sub-10": 1 });
  });
});

/* ── computeHcpStatsByEscalao ─────────────────────────────── */

describe("computeHcpStatsByEscalao", () => {
  it("exclui HCP ≥ 54 (HI não estabelecido) e calcula percentis", () => {
    const list = [
      ...[5, 10, 15, 20, 25, 30, 35, 40].map((h, i) => mkPlayer({ fed: `s${i}`, name: `P${i}`, hcp: h })),
      mkPlayer({ fed: "x", name: "Formação", hcp: 54 }),
      mkPlayer({ fed: "y", name: "Placeholder", hcp: 99 }),
    ];
    const stats = computeHcpStatsByEscalao(list);
    expect(stats["Sub-12"].count).toBe(8); // os 54/99 ficam de fora
    expect(stats["Sub-12"].p25).toBe(15);
    expect(stats["Sub-12"].p50).toBe(25);
    expect(stats["Sub-12"].p75).toBe(35);
  });
});

/* ── countActiveFilters ───────────────────────────────────── */

describe("countActiveFilters", () => {
  it("zero por defeito; conta cada filtro activo; ignora ordenação/seniores", () => {
    expect(countActiveFilters(defaultFilters())).toBe(0);
    expect(countActiveFilters(defaultFilters({ q: "x", onlyPP: true, hcpMin: "5" }))).toBe(3);
    // ordenação, pin e includeSeniors NÃO contam como filtros
    expect(countActiveFilters(defaultFilters({ includeSeniors: true, prioritizeJuniors: true, sortKey: "hcp" }))).toBe(0);
  });
});

/* ── helpers ──────────────────────────────────────────────── */

describe("playerRoundCount / isActivePlayer", () => {
  it("segue a cadeia de fallbacks documentada", () => {
    const p = mkPlayer({ fed: "1", name: "A", _federadoRaw: { rounds_current_year: 4 } as ListPlayer["_federadoRaw"] });
    expect(playerRoundCount(p, undefined)).toBe(4);
    expect(playerRoundCount(p, { roundsCurrentYear: 9 } as never)).toBe(9);
    expect(playerRoundCount(mkPlayer({ fed: "2", name: "B" }), undefined)).toBe(0);
  });

  it("isActivePlayer aceita qualquer uma das fontes", () => {
    const p = mkPlayer({ fed: "1", name: "A" });
    expect(isActivePlayer(p, undefined)).toBe(false);
    expect(isActivePlayer(p, { roundsLast12m: 2 } as never)).toBe(true);
    expect(isActivePlayer(mkPlayer({ fed: "2", name: "B", _federadoRaw: { rounds_current_year: 1 } as ListPlayer["_federadoRaw"] }), undefined)).toBe(true);
  });
});

/* ── escalões (constants) ─────────────────────────────────── */

describe("isSeniorEscalao / coerceEscalao", () => {
  it("classifica os 4 escalões seniores e mais nenhum", () => {
    for (const e of ["Absoluto", "MidAmateur", "Sénior", "SuperSenior"]) expect(isSeniorEscalao(e)).toBe(true);
    for (const e of ["Sub-10", "Sub-21", "Sub-24", "", null, undefined]) expect(isSeniorEscalao(e)).toBe(false);
  });

  it("coerceEscalao normaliza vazio/?/Outros para Absoluto", () => {
    expect(coerceEscalao("")).toBe("Absoluto");
    expect(coerceEscalao("?")).toBe("Absoluto");
    expect(coerceEscalao("Outros")).toBe("Absoluto");
    expect(coerceEscalao("Sub-12")).toBe("Sub-12");
  });
});

/* ── hcpBins ──────────────────────────────────────────────── */

describe("hcpBinKey", () => {
  it("classifica os limites dos bins", () => {
    expect(hcpBinKey(-2)).toBe("plus");
    expect(hcpBinKey(0)).toBe("0-5");
    expect(hcpBinKey(4.9)).toBe("0-5");
    expect(hcpBinKey(5)).toBe("5-10");
    expect(hcpBinKey(29.9)).toBe("20-30");
    expect(hcpBinKey(30)).toBe("30+");
  });
});
