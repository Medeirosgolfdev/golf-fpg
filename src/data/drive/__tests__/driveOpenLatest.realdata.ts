import { describe, it, expect, beforeAll } from "vitest";
import { useRealDataFetch } from "./realDataFetch";
import { loadDriveAdmissions, loadDriveData } from "../driveLoader";
import { buildDriveSource, filterDriveSource, type DriveAdmissionsIndex } from "../driveSource";
import { buildDriveEntries } from "../driveCircuitData";
import type { Tournament } from "../../fpgTypes";

/**
 * Decisão B (22/10/2026): a /drive abre o torneio mais recente/próximo — hoje a
 * Final Drive Tour de 07/11/2026, que só existe na lista quando chegam as
 * inscrições (`fpg-admissions-draws.json`). Escolher antes disso dava o
 * penúltimo; por isso o CircuitShell fica «a carregar» até as inscrições chegarem.
 */
let raw: Tournament[] = [];
let idx: DriveAdmissionsIndex = new Map();
beforeAll(async () => {
  useRealDataFetch();
  raw = (await loadDriveData()).raw;
  idx = (await loadDriveAdmissions()).idx;
}, 120000);

const topOf = (src: Tournament[], series: "tour" | "challenge" | "aquapor" | "all") => {
  const ents = buildDriveEntries(filterDriveSource(src, { series, year: null, region: null }));
  return [...ents].sort((a, b) => (b.dateStart || "").localeCompare(a.dateStart || ""))[0];
};

describe("abrir o torneio certo (decisão B)", () => {
  it("só com as inscrições a Final Drive Tour de 07/11/2026 é a primeira", () => {
    expect(idx.size).toBeGreaterThan(0);
    const sem = topOf(buildDriveSource(raw, new Map()), "tour");
    const com = topOf(buildDriveSource(raw, idx), "tour");
    expect(com.dateStart).toBe("2026-11-07");
    expect(com.name).toMatch(/Final Drive Tour/i);
    expect((sem.dateStart ?? "") < "2026-11-07").toBe(true);
  });
  it("Challenge: sem as inscrições não se cai num torneio de outro ano", () => {
    const com = topOf(buildDriveSource(raw, idx), "challenge");
    expect(com.year).toBe(2026);
  });
});
