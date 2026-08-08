import { describe, it, expect } from "vitest";
import { buildFpgEditionsIndex } from "../fpgPastEditions";
import type { Tournament } from "../../../data/fpgTypes";

const t = (ccode: string, tcode: string, name: string, date: string): Tournament =>
  ({ ccode, tcode, name, date, campo: "Porto Santo Golfe", players: [] } as unknown as Tournament);

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
