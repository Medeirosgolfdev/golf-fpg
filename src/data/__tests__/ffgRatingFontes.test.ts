import { describe, it, expect, vi, beforeAll } from "vitest";
import rennesRaw from "../../../public/data/ffgolf-resultats/03-11-2601477509.json?raw";
import overridesRaw from "../../../public/data/ffgolf-course-overrides.json?raw";
import vichyRaw from "../../../public/data/ffgolf-resultats/03-02-2601414323.json?raw";
import rms9TeesRaw from "../../../public/data/ffgolf-rms9-tees.json?raw";
import rms9HcpRaw from "../../../public/data/ffgolf-rms9-hcp.json?raw";
import { ratingFontes } from "../ffg/toTournament";
import { ffgResLoadDivisions, ffgResEntry, withMeritePcc } from "../ffg/ffgEntries";
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
    "/data/ffgolf-resultats/03-02-2601414323.json": vichyRaw,
    "/data/ffgolf-rms9-tees.json": rms9TeesRaw,
    "/data/ffgolf-rms9-hcp.json": rms9HcpRaw,
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

  it("prova sem override (GPJ Vichy 2026): tee, metros e CR/Slope só do RMS9", async () => {
    const divs = await ffgResLoadDivisions({ trnId: "2601414323", file: "03-02-2601414323.json", year: 2026 } as FFGResIndexEntry);
    const u12g = divs.find((d) => d.results?._ratingFontes?.some((f) => f.cr === "67,0" && f.slope === "125"))?.results;
    expect(u12g?._ratingFontes?.map((f) => `${f.fonte} ${f.cr}/${f.slope}`)).toEqual(["RMS9 67,0/125", "HCP de jogo 67,0–67,2/124–125"]);
    expect(u12g?._sdEstimate).toBeUndefined();
  });
});

// SSS da FFG (Mérite Jeunes, 30/10/2026): mostra-se ao lado e dá o PCC quando não há um escrito à mão.
describe("SSS do Mérite e PCC", () => {
  const base = { tee: "Repères U12 Garçons", par: [], meters: [], courseRating: 67.9, slope: 122, ratingNota: "RMS9. Assume PCC 0." };
  const sss = { sss: 68.9, n: 5, lo: 68.4, hi: 69.4 };

  it("põe o SSS nas fontes, com SSS − CR no título", () => {
    const f = ratingFontes({ ...base, ratingSss: sss });
    expect(f.map((x) => [x.fonte, x.cr, x.slope])).toEqual([["SSS FFG", "68,9", ""]]);
    expect(f[0].title).toMatch(/SSS − CR = 1,0/);
  });

  it("deduz o PCC (arred. SSS − CR) e tira o «Assume PCC 0»", () => {
    const sc = withMeritePcc({ ...base, ratingSss: sss });
    expect(sc.pcc).toEqual([1, 1, 1, 1]);
    expect(sc.ratingNota).not.toMatch(/Assume PCC 0/);
    expect(sc.ratingNota).toMatch(/PCC \+1 = SSS da FFG 68,9/);
  });

  it("não mexe: PCC escrito à mão, SSS incoerente, PCC fora do WHS ou sem CR", () => {
    expect(withMeritePcc({ ...base, pcc: [2, 2], ratingSss: sss }).pcc).toEqual([2, 2]);
    expect(withMeritePcc({ ...base, ratingSss: { ...sss, lo: 66, hi: 71 } }).pcc).toBeUndefined();
    expect(withMeritePcc({ ...base, ratingSss: { ...sss, sss: 73 } }).pcc).toBeUndefined();
    expect(withMeritePcc({ ...base, courseRating: undefined, ratingSss: sss }).pcc).toBeUndefined();
  });
});
