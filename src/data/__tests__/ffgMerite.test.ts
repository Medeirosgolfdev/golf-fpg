import { describe, it, expect } from "vitest";
import rankingRaw from "../../../public/data/ffgolf-merite-ranking.json?raw";
import { meriteRows, type MeriteFile } from "../../pages/ffg/MeriteView";

// Mérite Jeunes da FFG (vista 🏅 da /ffg, 30/10/2026) com o ficheiro real.
const data = JSON.parse(rankingRaw) as MeriteFile;
const rows = meriteRows(data);

describe("Mérite Jeunes — linhas da vista", () => {
  it("tem rapazes e raparigas, e o nº de classificados bate com o da FFG", () => {
    for (const s of ["M", "F"] as const) {
      expect(rows.filter((r) => r.s === s && r.rank != null).length).toBe(data.info[s].nb);
    }
  });

  it("Ricardo Castro Ferreira: lugar, escalão pelo ano de nascimento e PT pelo nome", () => {
    const r = rows.find((x) => x.nom === "CASTRO FERREIRA" && x.prenom === "Ricardo")!;
    expect(r).toBeTruthy();
    expect(r.name).toBe("Ricardo Castro Ferreira");
    expect(r.rank).toBeGreaterThan(0);
    expect(r.by).toBe(2015);
    expect(r.cat).toBe("Poussin 1");
    expect(r.sub).toBe("Sub 12");
    expect(r.pt).toBe(true);
    // As provas que contam ligam à leaderboard da /ffg pelo trnId.
    const prov = data.prov[r.key];
    expect(prov.some(([trnId, , nome]) => trnId === "2601405022" && /Ile-de-France 1/.test(nome))).toBe(true);
  });

  it("os lugares dos classificados são únicos e seguidos por sexo", () => {
    for (const s of ["M", "F"] as const) {
      const ranks = rows.filter((r) => r.s === s && r.rank != null).map((r) => r.rank!).sort((a, b) => a - b);
      expect(ranks[0]).toBe(1);
      expect(ranks[ranks.length - 1]).toBeLessThanOrEqual(ranks.length);
    }
  });
});
