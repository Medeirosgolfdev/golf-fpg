import { describe, it, expect } from "vitest";
import { herdarCampoDoDia } from "../driveSource";
import type { Tournament } from "../../fpgTypes";

// Provas Drive partidas por escalão: só a entrada principal traz o campo
// (04/11/2026, 985-10247 Jamor → 10248/49/50 «… Sub 14/12/10»).
const t = (tcode: string, name: string, campo?: string, extra: Partial<Tournament> = {}) =>
  ({ ccode: "985", tcode, name, date: "2026-10-25", series: "challenge", campo, players: [], ...extra }) as unknown as Tournament;

describe("herdarCampoDoDia", () => {
  it("as entradas por escalão herdam o campo da principal do mesmo dia e clube", () => {
    const out = herdarCampoDoDia([
      t("10247", "Torneio Drive Challenge_Preparação 2027", "Jamor"),
      t("10250", "Torneio Drive Challenge_Preparação 2027 Sub 10"),
      t("10249", "Torneio Drive Challenge_Preparação 2027 Sub 12"),
    ]);
    expect(out.map(x => x.campo)).toEqual(["Jamor", "Jamor", "Jamor"]);
  });

  it("não herda de outro clube, outro dia ou outra prova", () => {
    const out = herdarCampoDoDia([
      t("10247", "Torneio Drive Challenge_Preparação 2027", "Jamor"),
      t("10258", "Torneio Drive Challenge_Preparação 2027 Sub 10", undefined, { ccode: "987" } as Partial<Tournament>),
      t("10254", "Torneio Drive Challenge_Preparação 2027 Sub 10", undefined, { date: "2026-11-07" } as Partial<Tournament>),
      t("10300", "Outro Torneio Sub 10"),
    ]);
    expect(out.slice(1).map(x => x.campo)).toEqual([undefined, undefined, undefined]);
  });

  it("com dois campos diferentes não escolhe", () => {
    const out = herdarCampoDoDia([
      t("1", "Prova X", "Jamor"),
      t("2", "Prova X Sub 12", "Belas"),
      t("3", "Prova X Sub 10"),
    ]);
    expect(out[2].campo).toBeUndefined();
  });
});
