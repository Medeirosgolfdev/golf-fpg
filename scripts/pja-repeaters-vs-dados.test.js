/**
 * pja-repeaters-vs-dados.test.js — o painel "Quem repete" contra os dados REAIS
 * do repo (mesma ideia do drive-ranking-vs-oficial.test.js).
 *
 * Vive em scripts/ e não em src/__tests__ porque lê ficheiros com `fs`: o
 * tsconfig do `src` não tem os tipos do Node, e o `npm run build` corre
 * `tsc --noEmit` sobre ele.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));

describe("PJA Torre — field de 2026 contra a edição de 2025", () => {
  it("encontra os repetentes e prevê valores plausíveis", async () => {
    const { buildRepeaters, currentField, masterTeeRatings } = await import("../src/pages/fpg/repeatersModel.ts");

    const pull = json("public/data/pull-torneios000.json").tournaments;
    const t2025 = pull.find((t) => t.ccode === "192" && t.tcode === "10013");
    const stub = pull.find((t) => t.ccode === "192" && t.tcode === "90101");
    const draw = json("public/data/pja-draws-manual.json").tournaments
      .find((t) => t.ccode === "192" && t.tcode === "90101");
    const players = json("public/data/players.json");
    expect(t2025, "edição de 2025 (192/10013)").toBeTruthy();
    expect(stub, "stub de 2026 (192/90101)").toBeTruthy();
    expect(draw, "draw curado de 2026").toBeTruthy();

    const current = { ...stub, _draws: draw.draws };
    const fedInfo = (fed) => {
      const p = fed ? players[fed] : null;
      return p ? { hcp: p.hcp ?? null, club: p.club?.short ?? null, escalao: p.escalao ?? null, sex: p.sex ?? null } : null;
    };
    const master = json("public/data/master-courses.json");
    const masterRatings = masterTeeRatings(master, current.campo);
    // O master conhece os 10 tees do Torre (6 M + 4 F).
    expect(masterRatings.get("laranjas|F")).toEqual({ cr: 74.2, slope: 132 });
    expect(masterRatings.get("amarelas|M")).toEqual({ cr: 66.2, slope: 122 });
    const stats = json("public/player-stats.json");
    const form = (fed) => (fed ? stats[fed] ?? null : null);
    const r = buildRepeaters({ current, previous: [{ id: "192-10013", year: 2025, t: t2025 }], fedInfo, form, masterRatings });

    const field = currentField(current);
    expect(field).toHaveLength(16);
    // Medido a 2026-09-02: 14 dos 16 do draw já jogaram a edição de 2025.
    expect(r.length).toBeGreaterThanOrEqual(10);
    expect(r.length).toBeLessThanOrEqual(field.length);

    for (const x of r) {
      expect(x.editions.length).toBeGreaterThan(0);
      if (!x.forecast) continue;
      // Duas voltas num par 72: fora desta janela é erro de modelo, não golfe.
      expect(x.forecast.total, x.name).toBeGreaterThan(130);
      expect(x.forecast.total, x.name).toBeLessThan(220);
      expect(x.forecast.low).toBeLessThanOrEqual(x.forecast.total);
      expect(x.forecast.high).toBeGreaterThanOrEqual(x.forecast.total);
    }

    // O Francisco jogou 2025 das AMARELAS (66.2/122) e em 2026 vai às VERDES
    // (71/132). O tee TEM de entrar na conta: com a mesma forma, prever nas
    // verdes dá pior do que nas amarelas — quase 5 golpes por volta.
    // (Não se testa "pior que 2025": ele baixou 2,7 de índice em 3 meses e o
    // ganho de forma pode mais do que compensar o tee — e compensa.)
    const francisco = r.find((x) => x.fed === "52856");
    expect(francisco, "Francisco Vilardell Carvalho no field").toBeTruthy();
    expect(francisco.teeNow).toMatch(/verde/i);
    const nasAmarelas = buildRepeaters({
      current: { ...current, _draws: { 1: { groups: [{ tee: "Amarelas", players: [{ nome: "Francisco Carvalho", fed: "52856" }] }] } } },
      previous: [{ id: "192-10013", year: 2025, t: t2025 }], fedInfo, form, masterRatings,
    })[0];
    expect(nasAmarelas.forecast.total).toBeLessThan(francisco.forecast.total);

    // As "Laranjas" das raparigas não existem em 2025, mas o master-courses
    // tem-nas (74.2/132) — logo a previsão delas é firme, não uma suposição.
    // Inferi-las das amarelas (71.1/126) subestimava a prova em ~3 golpes.
    const angelina = r.find((x) => x.fed === "51523");
    expect(angelina.teeNow).toMatch(/laranja/i);
    expect(angelina.forecast.teeKnown).toBe(true);

    // O Manuel joga o mesmo tee de 2025 (amarelas) → rating conhecido.
    const manuel = r.find((x) => x.fed === "52884");
    expect(manuel.forecast.teeKnown).toBe(true);

    // ⚠ Guarda contra a versão optimista do modelo, que previa 132 (66+66) ao
    // Nuno Palmares — 12 abaixo do par, com UM 66 na carreira. Nenhuma previsão
    // pode ficar abaixo do que o jogador faz num bom dia (as 8 melhores de 20).
    for (const x of r) {
      if (!x.forecast || x.form?.avgSD8 == null) continue;
      const rat = masterRatings.get(`${(x.teeNow || "").toLowerCase()}|${x.sex}`);
      if (!rat) continue;
      const bomDia = Math.round(rat.cr + (x.form.avgSD8 * rat.slope) / 113) * 2;
      expect(x.forecast.total, `${x.name}: previsão abaixo do bom dia dele`).toBeGreaterThanOrEqual(bomDia);
    }
  });
});
