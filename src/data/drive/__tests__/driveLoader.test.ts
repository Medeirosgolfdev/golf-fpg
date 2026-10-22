import { describe, it, expect, beforeEach, vi } from "vitest";

const FILES: Record<string, unknown> = {
  "/data/fpg-files-index.json": { "drive-data": ["drive-data-2025-03.json", "drive-data-2026-01.json", "drive-data-2026-02.json"] },
  "/data/drive-data-2025-03.json": { source: "s", lastUpdated: "x", tournaments: [{ tcode: "A", date: "2025-03-01", series: "tour", players: [{ name: "ana silva", fedCode: "1" }] }] },
  "/data/drive-data-2026-01.json": { tournaments: [{ tcode: "B", date: "2026-01-04", players: [{ name: "rui", fed: "2" }] }] },
};

beforeEach(() => {
  vi.resetModules();
  globalThis.fetch = (async (url: string) => {
    const d = FILES[url];
    return d === undefined
      ? { ok: false, status: 404, text: async () => "" }
      : { ok: true, status: 200, text: async () => JSON.stringify(d) };
  }) as unknown as typeof fetch;
});

describe("loadDriveMonthly", { timeout: 30000 }, () => {
  it("lê só os meses do índice, normaliza e marca a origem", async () => {
    const { loadDriveMonthly } = await import("../driveLoader");
    const r = await loadDriveMonthly("drive-data");
    expect(r.tournaments.map((t) => t.tcode)).toEqual(["A", "B"]);
    expect(r.tournaments[0]._sourceFile).toBe("/data/drive-data-2025-03.json");
    expect(r.tournaments[0].players[0].fed).toBe("1");
    expect(r.meta.map((m) => m.status)).toEqual(["loaded", "loaded", "error"]);
    expect(r.meta[0]).toMatchObject({ count: 1, source: "s", lastUpdated: "x", group: "drive-data" });
  });
  it("fromYear e forceSeries", async () => {
    const { loadDriveMonthly } = await import("../driveLoader");
    const r = await loadDriveMonthly("drive-data", { fromYear: 2026, forceSeries: "aquapor" });
    expect(r.tournaments.map((t) => [t.tcode, t.series])).toEqual([["B", "aquapor"]]);
  });
  it("o JSON em cache não é tocado quando a página mexe nos jogadores", async () => {
    const { loadDriveMonthly } = await import("../driveLoader");
    const a = await loadDriveMonthly("drive-data");
    a.tournaments[0].players[0].pos = 99;
    const b = await loadDriveMonthly("drive-data");
    expect(b.tournaments[0].players[0].pos).toBeUndefined();
  });
});
