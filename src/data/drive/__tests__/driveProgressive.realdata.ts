import { describe, it, expect } from "vitest";
import { useRealDataFetch } from "./realDataFetch";
import { latestDriveYear, loadDriveData, loadDriveDataProgressive, type DriveDataLoad } from "../driveLoader";

/** Decisão I: primeiro só o ano mais recente, depois tudo — e o resultado final
 *  é exactamente o do carregamento de uma vez. */
describe("mensais em dois tempos (decisão I)", () => {
  it("1.º só o ano mais recente; 2.º = loadDriveData()", async () => {
    useRealDataFetch();
    const calls: [DriveDataLoad, boolean][] = [];
    await loadDriveDataProgressive((d, c) => calls.push([d, c]));
    expect(calls.map(c => c[1])).toEqual([false, true]);
    const y = String(await latestDriveYear());
    expect(calls[0][0].raw.length).toBeGreaterThan(0);
    expect(calls[0][0].raw.every(t => (t._sourceFile || "").includes(`-${y}-`))).toBe(true);
    const once = await loadDriveData();
    const key = (d: DriveDataLoad) => d.raw.map(t => `${t._sourceFile}|${t.ccode}|${t.tcode}|${t.players.length}`);
    expect(key(calls[1][0])).toEqual(key(once));
    expect(calls[1][0].tournaments.length).toBe(once.tournaments.length);
  }, 120000);
});
