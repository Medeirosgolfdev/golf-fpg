import { describe, it, expect } from "vitest";
import { attachDriveAdmissions, buildDriveSource, driveDefaultYear, filterDriveSource, inferDriveRegion, type DriveAdmissionsIndex } from "../driveSource";
import type { Tournament } from "../../fpgTypes";

const T = (o: Partial<Tournament>): Tournament => ({ ccode: "988", tcode: "1", name: "x", date: "2026-01-01", series: "tour", players: [], playerCount: 0, ...o } as Tournament);
const ad = (ccode: string, tcode: string, name: string, date = "2026-11-07") => ({ ccode, tcode, name, date, admissions: { players: [] } as never, draws: {} });

describe("driveSource", () => {
  it("pendura inscrições nos próprios objectos", () => {
    const raw = [T({ tcode: "1" })];
    attachDriveAdmissions(raw, new Map([["988-1", ad("988", "1", "1º Drive Tour")]]) as DriveAdmissionsIndex);
    expect(raw[0]._admissions).toEqual({ players: [] });
  });
  it("futuros pelo nome (série e zona), sem repetir os que já têm resultados", () => {
    const raw = [T({ tcode: "1" })];
    const idx = new Map([
      ["988-1", ad("988", "1", "1º Drive Tour Norte")],
      ["988-2", ad("988", "2", "Drive Chall Tejo-Mosteiro")],
      ["988-3", ad("988", "3", "3º Torneio Aquapor")],
      ["988-4", ad("988", "4", "Campeonato Nacional")],
    ]) as DriveAdmissionsIndex;
    const src = buildDriveSource(raw, idx);
    expect(src[0]).toBe(raw[0]);
    expect(src.slice(1).map((t) => [t.tcode, t.series, t.region])).toEqual([["2", "challenge", "tejo"], ["3", "aquapor", null]]);
    expect(buildDriveSource(raw, new Map())).toEqual(raw);
    expect(inferDriveRegion("Final Drive Açores")).toBe("acores");
  });
  it("série, ano (por omissão o mais recente da série) e zona", () => {
    const src = [T({ tcode: "a", date: "2025-05-01", region: "sul" }), T({ tcode: "b", date: "2026-01-01", series: "challenge" }), T({ tcode: "c", date: "2025-06-01", region: "norte" })];
    expect(filterDriveSource(src, { series: "tour", year: null, region: null }).map((t) => t.tcode)).toEqual(["a", "c"]);
    expect(filterDriveSource(src, { series: "all", year: null, region: null }).map((t) => t.tcode)).toEqual(["b"]);
    expect(filterDriveSource(src, { series: "tour", year: "2025", region: "norte" }).map((t) => t.tcode)).toEqual(["c"]);
  });
  it("ano por omissão = o do próximo torneio; sem nenhum por jogar, o mais recente", () => {
    const src = [T({ date: "2026-10-25" }), T({ date: "2026-11-07" }), T({ date: "2027-01-23" }), T({ date: "2027-02-27" })];
    expect(driveDefaultYear(src, "2026-10-30")).toBe("2026");  // a final de 07/11 antes da época 2027
    expect(driveDefaultYear(src, "2026-12-01")).toBe("2027");
    expect(driveDefaultYear(src, "2027-06-01")).toBe("2027");
    expect(driveDefaultYear([], "2026-10-30")).toBeNull();
  });
});
