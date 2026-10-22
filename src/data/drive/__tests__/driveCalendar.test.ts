import { describe, it, expect, beforeAll } from "vitest";
import { useRealDataFetch } from "./realDataFetch";
import { loadDriveAdmissions, loadDriveData } from "../driveLoader";
import { attachDriveAdmissions, buildDriveSource } from "../driveSource";
import { calendarStatus, driveCalendar, driveCalLabel } from "../driveCalendar";
import type { Tournament } from "../../fpgTypes";

/** Decisão E: o calendário sai dos dados (resultados + inscrições da FPG). */
let src: Tournament[] = [];
beforeAll(async () => {
  useRealDataFetch();
  const raw = (await loadDriveData()).raw;
  const { idx } = await loadDriveAdmissions();
  attachDriveAdmissions(raw, idx);
  src = buildDriveSource(raw, idx);
}, 120000);

describe("calendário do Drive (decisão E)", () => {
  it("etiquetas", () => {
    expect(driveCalLabel("1º Torneio Drive Tour Sul – Laguna", "tour", "sul")).toBe("1º DT Sul");
    expect(driveCalLabel("Final Drive Challenge Madeira", "challenge", "madeira")).toBe("Final DC Madeira");
    expect(driveCalLabel("3º Torneio do Circuito Aquapor", "aquapor", "nacional")).toBe("3º AQUAPOR");
  });
  it("Tour 2026: as datas que estavam à mão estão nos dados, mais a Final de 07/11", () => {
    const cal = driveCalendar(src, "tour", "2026");
    const datas = cal.map(e => e.date);
    for (const d of ["2026-01-03", "2026-01-04", "2026-01-11", "2026-02-01", "2026-02-07", "2026-02-28", "2026-03-07", "2026-03-28", "2026-04-04", "2026-04-11", "2026-04-12", "2026-04-19", "2026-06-10"]) {
      expect(datas).toContain(d);
    }
    expect(datas).toContain("2026-11-07");
    expect(cal.find(e => e.date === "2026-02-28")?.endDate).toBe("2026-03-01");
  });
  it("Challenge e AQUAPOR 2026", () => {
    expect(driveCalendar(src, "challenge", "2026").map(e => e.date)).toEqual(expect.arrayContaining(["2026-01-04", "2026-01-24", "2026-02-08", "2026-02-28", "2026-03-08", "2026-04-12"]));
    const aq = driveCalendar(src, "aquapor", "2026");
    expect(aq[0]).toMatchObject({ date: "2026-01-17", name: "1º AQUAPOR" });
  });
  it("estado em relação a hoje", () => {
    const e = (date: string, endDate?: string) => ({ name: "", date, endDate, campo: "", region: "", series: "tour" as const });
    expect(calendarStatus([e("2026-01-01"), e("2026-10-21", "2026-10-22"), e("2026-11-07")], "2026-10-22")).toEqual(["past", "next", "future"]);
  });
});
