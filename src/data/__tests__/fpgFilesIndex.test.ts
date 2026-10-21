import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fpgFileUrls, pullTorneiosIndexOf, FPG_FILES_INDEX_URL, type FpgFilesIndex } from "../fpgFilesIndex";
import { loadPullTorneios } from "../fpgPageLoader";
import { invalidateCache } from "../fetchCache";
// O mesmo gerador que corre no predev/prebuild.
import { buildIndex } from "../../../scripts/build-fpg-files-index.js";

/**
 * A /FPG pedia pull-torneios007…009 e aquapor-data-2026-02/04/06/08/09 só para
 * descobrir que não existiam (404). Agora só se pede o que o índice lista — e o
 * índice sai dos ficheiros que existem de facto em public/data.
 */
// Nomes dos .json de public/data (glob preguiçoso: só os caminhos, nada é lido).
const nomes = Object.keys(import.meta.glob("../../../public/data/*.json")).map(p => p.split("/").pop()!);
const existe = new Set(nomes.map(n => `/data/${n}`));
const index: FpgFilesIndex = buildIndex(nomes);

describe("índice dos ficheiros FPG (gerado de public/data)", () => {
  it("lista os pull-torneios e os mensais que existem, e só esses", () => {
    expect(index["pull-torneios"]!.length).toBeGreaterThan(0);
    for (const series of ["pull-torneios", "drive-data", "aquapor-data"] as const) {
      const urls = fpgFileUrls(index, series);
      expect(urls.length).toBeGreaterThan(0);
      expect(urls.filter(u => !existe.has(u))).toEqual([]);
    }
  });

  it("aquapor de 2026: só os meses com ficheiro (o loader do PJA pede desde 2026)", () => {
    const meses = nomes.filter(n => /^aquapor-data-2026-\d\d\.json$/.test(n)).sort().map(n => `/data/${n}`);
    expect(fpgFileUrls(index, "aquapor-data", 2026)).toEqual(meses);
  });

  it("fpgFileUrls filtra pelo ano e pullTorneiosIndexOf lê o número", () => {
    const idx: FpgFilesIndex = { "drive-data": ["drive-data-2025-12.json", "drive-data-2026-01.json"] };
    expect(fpgFileUrls(idx, "drive-data", 2026)).toEqual(["/data/drive-data-2026-01.json"]);
    expect(fpgFileUrls(idx, "aquapor-data")).toEqual([]);
    expect(pullTorneiosIndexOf("/data/pull-torneios006.json")).toBe(6);
  });
});

describe("loadPullTorneios — zero 404", () => {
  const pedidos: string[] = [];
  beforeEach(() => {
    pedidos.length = 0;
    invalidateCache(FPG_FILES_INDEX_URL);
    invalidateCache("/data/tournament-links.json");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      pedidos.push(url);
      if (url === FPG_FILES_INDEX_URL) return new Response(JSON.stringify(index));
      if (!existe.has(url)) return new Response("", { status: 404 });
      const n = pullTorneiosIndexOf(url);
      return new Response(JSON.stringify({ tournaments: n < 0 ? [] : [
        { name: `T${n}`, ccode: "1", tcode: String(1000 + n), date: "2026-01-01", players: [], playerCount: 0 },
      ] }));
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("pede só os ficheiros do índice, todos existentes, e lê-os todos", async () => {
    const lotes: number[] = [];
    const r = await loadPullTorneios((ts) => { lotes.push(ts.length); }, () => true);
    const pulls = pedidos.filter(u => u.includes("pull-torneios"));
    expect(pulls).toEqual(fpgFileUrls(index, "pull-torneios"));
    expect(pedidos.filter(u => u !== FPG_FILES_INDEX_URL && !existe.has(u))).toEqual([]);
    expect(r!.tournaments.length).toBe(pulls.length);
    expect(r!.meta.map(m => m.index)).toEqual(pulls.map(pullTorneiosIndexOf));
    expect(lotes[lotes.length - 1]).toBe(pulls.length);
  });

  it("sem índice não sonda nada", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      pedidos.push(url);
      return new Response("", { status: 404 });
    }));
    const r = await loadPullTorneios(() => {}, () => true);
    expect(r!.tournaments).toEqual([]);
    expect(pedidos.filter(u => u.includes("pull-torneios"))).toEqual([]);
  });
});
