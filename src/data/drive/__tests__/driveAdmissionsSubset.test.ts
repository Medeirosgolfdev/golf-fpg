import { describe, it, expect } from "vitest";
import { buildDriveAdmissions } from "../../../../scripts/build-drive-admissions.js";
import { indexFpgAdmissionsDraws, type FpgAdmissionsDrawsFile } from "../../nacional2026Loader";
import { buildDriveSource } from "../driveSource";
import type { Tournament } from "../../fpgTypes";

/** Decisão I: a /drive lê só os torneios do Drive/AQUAPOR das inscrições
 *  (`fpg-admissions-draws-drive.json`, gerado no build). Tem de dar à /drive
 *  exactamente o mesmo que o ficheiro completo. */
const RAW = import.meta.glob("../../../../public/data/{fpg-admissions-draws,drive-data-*,aquapor-data-*}.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("inscrições só do Drive (decisão I)", () => {
  it("o mesmo para a /drive: torneios por jogar e inscrições/draws pendurados", () => {
    const full = JSON.parse(Object.entries(RAW).find(([k]) => k.endsWith("/fpg-admissions-draws.json"))![1]) as FpgAdmissionsDrawsFile;
    const raw: Tournament[] = Object.entries(RAW).filter(([k]) => /(drive|aquapor)-data-/.test(k))
      .flatMap(([, v]) => (JSON.parse(v).tournaments || []) as Tournament[]);
    const keys = new Set(raw.map(t => `${t.ccode}-${t.tcode}`));
    const sub = buildDriveAdmissions(full, keys) as FpgAdmissionsDrawsFile;
    expect(sub.tournaments.length).toBeLessThan(full.tournaments.length / 2);
    const iFull = indexFpgAdmissionsDraws(full), iSub = indexFpgAdmissionsDraws(sub);
    // o que a /drive pendura: por ccode-tcode dos resultados
    for (const k of keys) expect(iSub.get(k) ?? null).toEqual(iFull.get(k) ?? null);
    // e os por jogar
    const a = buildDriveSource(raw, iFull).map(t => `${t.ccode}-${t.tcode}-${t.date}`);
    const b = buildDriveSource(raw, iSub).map(t => `${t.ccode}-${t.tcode}-${t.date}`);
    expect(b).toEqual(a);
  }, 60000);
});
