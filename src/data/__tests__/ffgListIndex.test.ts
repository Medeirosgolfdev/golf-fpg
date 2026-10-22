import { describe, it, expect, afterEach, vi } from "vitest";
import catalogRaw from "../../../public/data/ffgolf-catalog.json?raw";
import cfjBenjaminesRaw from "../../../public/data/ffgolf/2026_championnat-de-france-des-jeunes-benjamines.json?raw";
import cfjBenjaminsRaw from "../../../public/data/ffgolf/2026_championnat-de-france-des-jeunes-benjamins.json?raw";
import cfjU12FRaw from "../../../public/data/ffgolf/2026_championnat-de-france-des-jeunes-u12-filles-trophee-lacoste.json?raw";
import cfjU12GRaw from "../../../public/data/ffgolf/2026_championnat-de-france-des-jeunes-u12-garcons-trophee-crocodile.json?raw";
import { buildFfgEntries, ggGroupEntry, type FfgRenderers } from "../ffg/ffgEntries";
import { buildFfgListIndex } from "../ffg/listIndex";
import type { Catalog, FFGTournament, FfgListIndex } from "../ffg/types";
import { entryHasAce, entryListMeta, entryManuelState, entryPtState } from "../../ui/circuit/entryState";
import type { CircuitDivision, CircuitEntry } from "../../ui/circuit/types";

/**
 * A lista da /ffg sai de um índice gerado no build (GolfGenius + LGPIDF) e cada
 * torneio só carrega os ficheiros ao abrir. A entrada lazy tem de ser igual à
 * que se montava com tudo carregado: metadados, estado dos filtros e divisões.
 */

const R: FfgRenderers = {
  lgpidfCourseMap: () => "mapa",
};

const cat = JSON.parse(catalogRaw) as Catalog;
const RAW: Record<string, string> = {
  "championnat-de-france-des-jeunes-benjamines": cfjBenjaminesRaw,
  "championnat-de-france-des-jeunes-benjamins": cfjBenjaminsRaw,
  "championnat-de-france-des-jeunes-u12-filles-trophee-lacoste": cfjU12FRaw,
  "championnat-de-france-des-jeunes-u12-garcons-trophee-crocodile": cfjU12GRaw,
};
const catalog: Catalog = { ...cat, tournaments: cat.tournaments.filter((t) => t.year === 2026 && t.slug in RAW) };
const ggData = new Map(Object.entries(RAW).map(([slug, raw]) => [`2026_${slug}`, JSON.parse(raw) as FFGTournament]));

/** Divisão comparável (os draws já são dados). */
const divView = (d: CircuitDivision) => JSON.stringify(d);

afterEach(() => { vi.unstubAllGlobals(); });

describe("índice da lista da /ffg (ffg-list-index.json)", () => {
  const idx = JSON.parse(JSON.stringify(buildFfgListIndex({
    ffgResIndex: null, lgpidfIndex: null, lgpidfData: new Map(), ggCatalog: catalog, ggData, ggTwins: new Set(),
  }))) as FfgListIndex;

  it("o Championnat de France des Jeunes 2026 fica uma só entrada, com os 4 ficheiros", () => {
    expect(idx.items.map((i) => [i.entry.id, i.gg?.map((m) => m.slug).sort()])).toEqual([
      ["gg:evt:championnat-de-france-des-jeunes_2026", Object.keys(RAW).sort()],
    ]);
  });

  it("a entrada lazy é igual à eager: metadados, filtros e divisões; os ficheiros só se pedem ao abrir", async () => {
    const pedidos: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      pedidos.push(url);
      const raw = RAW[url.replace(/^\/data\/ffgolf\/2026_/, "").replace(/\.json$/, "")];
      return raw == null ? { ok: false, status: 404, text: async () => "" } : { ok: true, status: 200, text: async () => raw };
    });
    const [lazy] = buildFfgEntries({ ffgResIndex: null, manuelIdx: {}, listIndex: idx, categories: null }, R);
    const eager: CircuitEntry = ggGroupEntry(catalog.tournaments.map((meta) => ({ meta, data: ggData.get(`2026_${meta.slug}`)! })));
    expect(pedidos).toEqual([]);

    const { loadDivisions, ...meta } = lazy;
    expect(meta).toEqual(JSON.parse(JSON.stringify(entryListMeta(eager))));
    expect([entryManuelState(lazy), entryPtState(lazy), entryHasAce(lazy)])
      .toEqual([entryManuelState(eager), entryPtState(eager), entryHasAce(eager)]);

    const divs = await loadDivisions!();
    // Os 4 ficheiros do torneio + o das correcções de match play (22/10/2026).
    expect(pedidos.filter((u) => u.startsWith("/data/ffgolf/"))).toHaveLength(4);
    expect(pedidos.filter((u) => !u.startsWith("/data/ffgolf/"))).toEqual(["/data/ffgolf-matchplay-overrides.json"]);
    expect(divs.map(divView)).toEqual(eager.divisions!.map(divView));
  });

  it("entryListMeta recusa divisões que os metadados não representam", () => {
    const d = (escalao: string, sex?: "M" | "F"): CircuitDivision => ({ key: escalao, escalao, sex });
    expect(() => entryListMeta({ id: "x", name: "x", year: 2026, divisions: [d("U12"), d("U14")] })).toThrow(/U14/);
    expect(() => entryListMeta({ id: "x", name: "x", year: 2026, escaloes: ["U12"], divisions: [d("U12"), d("U14")] })).toThrow(/U14/);
    expect(() => entryListMeta({ id: "x", name: "x", year: 2026, sex: "M", escaloes: ["U12"], divisions: [d("U12", "F")] })).toThrow(/sexo/);
    expect(entryListMeta({ id: "x", name: "x", year: 2026, divisions: [d("U12", "F")] })).toMatchObject({ escalao: "U12", sex: "F", divisionCount: 1, playerCount: 0, hasManuel: false, hasPt: false, hasAce: false });
  });
});
