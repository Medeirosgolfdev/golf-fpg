import { describe, it, expect } from "vitest";
import { buildFpgEditionsIndex } from "../fpgPastEditions";
import type { Tournament } from "../../../data/fpgTypes";

const t = (ccode: string, tcode: string, name: string, date: string, escalao?: string): Tournament =>
  ({ ccode, tcode, name, date, escalao: escalao ?? null, campo: "Porto Santo Golfe", players: [] } as unknown as Tournament);

describe("buildFpgEditionsIndex — alias de ccode do mesmo organizador", () => {
  it("funde edições publicadas sob 920 e 183 (Porto Santo Golfe)", () => {
    const index = buildFpgEditionsIndex([
      t("920", "10077", "Torneio José Rosado", "2024-08-09"),
      t("183", "10142", "Torneio José Rosado", "2025-08-08"),
      t("920", "10088", "Torneio José Rosado", "2026-08-08"),
    ]);
    const groups = [...index.values()];
    expect(groups).toHaveLength(1);
    expect(groups[0].map(e => e.year).sort()).toEqual([2024, 2025, 2026]);
  });

  it("não funde homónimos de clubes distintos (ccodes sem alias)", () => {
    const index = buildFpgEditionsIndex([
      t("125", "20001", "Taça de Natal", "2024-12-14"),
      t("152", "20002", "Taça de Natal", "2025-12-13"),
    ]);
    expect([...index.values()]).toHaveLength(2);
  });
});

describe("buildFpgEditionsIndex — Miramar Internacional Open", () => {
  // O nome do Sub-10 mudou todos os anos; o de 2025 nem sequer traz "U25".
  // Sem o alias curado davam três family keys e a tab não aparecia.
  const sub10 = [
    t("003", "10478", "Miramar Internacional Open U25 ( Sub10)", "2024-08-26", "Sub 10"),
    t("003", "10565", "Miramar Internacional Open - sub 10", "2025-08-19", "Sub 10"),
    t("003", "10653", "X Miramar Internacional Open U25 - Sub10", "2026-08-19", "Sub 10"),
  ];
  const u25 = [
    t("003", "10477", "Miramar Internacional Open U25", "2024-08-26"),
    t("003", "10564", "Miramar Internacional Open U25", "2025-08-19"),
    t("003", "10652", "X Miramar Internacional Open U25", "2026-08-19"),
  ];

  it("junta as três edições do Sub-10 apesar dos nomes divergentes", () => {
    const index = buildFpgEditionsIndex(sub10);
    const groups = [...index.values()];
    expect(groups).toHaveLength(1);
    expect(groups[0].map(e => e.year).sort()).toEqual([2024, 2025, 2026]);
  });

  it("mantém o Sub-10 separado do U25 (são provas distintas)", () => {
    const index = buildFpgEditionsIndex([...sub10, ...u25]);
    expect([...index.values()]).toHaveLength(2);
    const byYear = [...index.values()].map(g => g.map(e => e.tcode).sort());
    expect(byYear).toContainEqual(["10478", "10565", "10653"]);
    expect(byYear).toContainEqual(["10477", "10564", "10652"]);
  });

  it("não atribui 'Sub 25' ao Sub-10 (o U25 do nome vem antes do Sub10)", () => {
    const index = buildFpgEditionsIndex(sub10);
    const escs = [...index.values()][0].flatMap(e => (e.divisions ?? []).map(d => d.escalao));
    expect(escs).toEqual(["Sub 10", "Sub 10", "Sub 10"]);
  });

  it("o U25 continua a juntar as três edições (sem regressão)", () => {
    const index = buildFpgEditionsIndex(u25);
    const groups = [...index.values()];
    expect(groups).toHaveLength(1);
    expect(groups[0].map(e => e.year).sort()).toEqual([2024, 2025, 2026]);
  });
});
