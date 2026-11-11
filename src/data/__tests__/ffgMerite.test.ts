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

describe("Mérite Jeunes — homónimos", () => {
  // Dois «Louis HAMON» na lista: cada linha traz a chave das provas da SUA ficha (`pk`).
  const cols = ["s", "rank", "rankPrev", "nom", "prenom", "cat", "by", "golf", "moy", "moy6", "nbt", "div", "total", "rankAnn", "statut", "idx", "pk"];
  const linha = (golf: string, by: number, nbt: number, idx: number | null, pk: string | null, prenom = "Louis") =>
    ["M", null, null, "HAMON", prenom, "Poussin 1", by, golf, null, null, nbt, null, null, null, null, idx, pk];
  const file = {
    generatedAt: "", month: "202611",
    info: data.info, cols,
    rows: [linha("RENNES", 2016, 11, 14.5, "M|HAMON|LOUIS#aaa"), linha("LOUVIGNY", 2015, 2, 28.6, "M|HAMON|LOUIS#bbb"), linha("NANTES", 2014, 5, 9.9, null, "Paul")],
    prov: { "M|HAMON|LOUIS#aaa": [], "M|HAMON|LOUIS#bbb": [], "M|HAMON|PAUL": [] },
  } as unknown as MeriteFile;

  it("partilham o nome mas não a chave das provas nem o índice", () => {
    const [a, b, c] = meriteRows(file);
    expect(a.key).toBe(b.key);
    expect([a.pk, b.pk]).toEqual(["M|HAMON|LOUIS#aaa", "M|HAMON|LOUIS#bbb"]);
    expect([a.idx, b.idx]).toEqual([14.5, 28.6]);
    // Quem não tem homónimo continua a ir pelo nome.
    expect(c.pk).toBeNull();
    expect(file.prov[c.pk ?? c.key]).toBeDefined();
  });

  it("um ficheiro antigo, sem a coluna `pk`, lê-se na mesma", () => {
    const antigo = { ...file, cols: cols.slice(0, -1), rows: file.rows.map((r) => r.slice(0, -1)) } as MeriteFile;
    expect(meriteRows(antigo).every((r) => r.pk === null)).toBe(true);
  });
});
