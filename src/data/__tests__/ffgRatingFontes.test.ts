import { describe, it, expect, vi, beforeAll } from "vitest";
import rennesRaw from "../../../public/data/ffgolf-resultats/03-11-2601477509.json?raw";
import overridesRaw from "../../../public/data/ffgolf-course-overrides.json?raw";
import { ratingFontes } from "../ffg/toTournament";
import { ffgResLoadDivisions, ffgResEntry } from "../ffg/ffgEntries";
import type { FFGResIndexEntry } from "../ffg/types";

// CR/Slope por fonte numa série FFG (29/10/2026): o do RMS9 e o deduzido do HCP de jogo.
describe("ratingFontes", () => {
  const base = { tee: "Repères U12 Garçons", par: [], meters: [] };

  it("mostra o RMS9 e o deduzido (valor único quando a faixa fecha)", () => {
    const f = ratingFontes({ ...base, ratingRms9: { cr: 64.5, slope: 115 }, ratingHcp: { cr: [64.5, 64.5], slope: [115, 115], n: 113 } });
    expect(f.map((x) => [x.fonte, x.cr, x.slope])).toEqual([["RMS9", "64,5", "115"], ["HCP de jogo", "64,5", "115"]]);
  });

  it("mostra a faixa quando há várias soluções", () => {
    const f = ratingFontes({ ...base, ratingHcp: { cr: [65.9, 66.2], slope: [110, 112], n: 45 } });
    expect(f[0]).toMatchObject({ cr: "65,9–66,2", slope: "110–112" });
  });

  it("esconde uma faixa larga de mais (poucos jogadores)", () => {
    expect(ratingFontes({ ...base, ratingHcp: { cr: [70.9, 81.9], slope: [55, 155], n: 2 } })).toEqual([]);
    expect(ratingFontes(null)).toEqual([]);
  });
});

// Rennes 2026 com os dados reais: as fontes do CR/Slope chegam ao torneio e os botões à prova.

describe("Rennes 2026 — CR/Slope por fonte e links", () => {
  const FILES: Record<string, string> = {
    "/data/ffgolf-resultats/03-11-2601477509.json": rennesRaw,
    "/data/ffgolf-course-overrides.json": overridesRaw,
  };
  beforeAll(() => {
    vi.stubGlobal("fetch", async (url: string) => {
      const txt = FILES[url];
      return txt == null ? { ok: false, status: 404, text: async () => "" } : { ok: true, status: 200, text: async () => txt };
    });
  });
  const meta = { trnId: "2601477509", file: "03-11-2601477509.json", year: 2026, partKey: "abc", name: "GPJ Rennes",
    rms9: { tenant: "9411", id: 4602246 } } as unknown as FFGResIndexEntry;

  it("U12 Garçons: RMS9 69,0/130 e o mesmo pelo HCP de jogo", async () => {
    const divs = await ffgResLoadDivisions(meta);
    const u12g = divs.find((d) => d.key === "119")?.results;
    expect(u12g?._ratingFontes?.map((f) => `${f.fonte} ${f.cr}/${f.slope}`)).toEqual(["RMS9 69,0/130", "HCP de jogo 69,0/130"]);
  });

  it("botões: resultados, partidas, live e RMS9", () => {
    const links = ffgResEntry(meta).links ?? [];
    expect(links.map((l) => l.label)).toEqual(["Resultados FFG", "Partidas FFG", "Live FFG", "RMS9"]);
    expect(links[3].url).toBe("https://9411.rms9.fr/a9online/#/tournaments/view/4602246/");
  });
});
