import { describe, it, expect, beforeAll, vi } from "vitest";
import nc68358Raw from "../../../public/data/nextcaddy/68358.json?raw";
import nc68359Raw from "../../../public/data/nextcaddy/68359.json?raw";
import nc68357Raw from "../../../public/data/nextcaddy/68357.json?raw";
import { loadRfegDivisionData } from "../rfeg/divisionData";
import { rfegRoundDraw } from "../rfeg/roundDraw";
import type { RFEGIndexEntry } from "../rfeg/types";

/** Torneo «Illescas» (FGM, 14/11/2026): campo de 9 buracos — os Alevín jogam-no
 *  2×, os Benjamín 1× (cartões de 9 numa grelha de 18). Alevín/Benjamín Femenino
 *  são a 21/11 (ainda por jogar a 16/11). */
const FILES: Record<string, string> = {
  "/data/nextcaddy/68358.json": nc68358Raw,
  "/data/nextcaddy/68359.json": nc68359Raw,
  "/data/nextcaddy/68357.json": nc68357Raw,
};
beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string) => {
    const txt = FILES[url];
    return txt == null ? { ok: false, status: 404, text: async () => "" } : { ok: true, status: 200, text: async () => txt };
  });
  // «Hoje» fixo: a prova de 21/11 continua «por jogar» quando o teste correr mais tarde.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-16T12:00:00Z"));
});
const t = (id: number) => ({ source: "nextcaddy", id, filePath: `nextcaddy/${id}.json`, category: null, sex: null }) as unknown as RFEGIndexEntry;

describe("Torneo «Illescas» 2026", () => {
  it("Benjamín Masculino: volta de 9 buracos (par 33, 1806 m), não de 18", async () => {
    const d = await loadRfegDivisionData(t(68358));
    const r = d!.results!;
    const jaime = r.players.find((p) => p.name.startsWith("Jaime Fernandez"))!;
    expect([jaime.grossTotal, jaime.toPar, jaime.par?.length, jaime.parTotal]).toEqual([38, 5, 9, 33]);
    expect(jaime.roundScores?.[0]?.teeName).toBe("1806 m");
    const draw = rfegRoundDraw(d!.data, t(68358), 1);
    const linha = draw.draw!.groups!.flatMap((g) => g.players).find((p) => p.nome.startsWith("Jaime Fernandez"))!;
    expect(draw.results.get(linha.fed!)).toEqual({ gross: 38, toPar: 5 });
    expect(linha.tee).toBe("1806 m");
  });
  it("Alevín Masculino continua de 18 buracos (o campo de 9 jogado 2×)", async () => {
    const d = await loadRfegDivisionData(t(68357));
    const p = d!.results!.players[0];
    expect([p.par?.length, p.parTotal]).toEqual([18, 66]);
  });
  it("Alevín Femenino (21/11, ainda por jogar): sem «destaques» de live scoring", async () => {
    const d = await loadRfegDivisionData(t(68359));
    expect(d!.ncHighlights).toBeNull();
    expect(d!.admissions.totalInscritos).toBeGreaterThan(0);
  });
});
