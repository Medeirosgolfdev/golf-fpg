/**
 * pja-repeaters-vs-dados.test.js — o painel "Quem repete" contra os dados REAIS
 * do repo (mesma ideia do drive-ranking-vs-oficial.test.js).
 *
 * Desde que o PJA Torre 2026 se jogou (5-6 Set, 192/10024) este ficheiro faz
 * duas coisas: verifica a mecânica do painel e AFERE o modelo de previsão —
 * reconstitui o estado da véspera (o field do draw, sem resultados), prevê, e
 * compara com o que aconteceu. É a única forma honesta de saber se o modelo
 * presta.
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

/** Estado da VÉSPERA: o field vem do draw e ainda não há resultados. */
function cenario() {
  const pull = json("public/data/pull-torneios000.json").tournaments;
  const t2025 = pull.find((t) => t.ccode === "192" && t.tcode === "10013");
  const t2026 = pull.find((t) => t.ccode === "192" && t.tcode === "10024");
  const draw = json("public/data/pja-draws-manual.json").tournaments
    .find((t) => t.ccode === "192" && t.tcode === "10024");
  const players = json("public/data/players.json");
  const stats = json("public/player-stats.json");
  return {
    t2025, t2026, draw,
    vespera: { ...t2026, players: [], _draws: draw.draws },
    fedInfo: (fed) => {
      const p = fed ? players[fed] : null;
      return p ? { hcp: p.hcp ?? null, club: p.club?.short ?? null, escalao: p.escalao ?? null, sex: p.sex ?? null } : null;
    },
    form: (fed) => (fed ? stats[fed] ?? null : null),
  };
}

describe("PJA Torre — o painel na véspera da prova", () => {
  it("encontra os repetentes e trata os tees como deve", async () => {
    const { buildRepeaters, currentField, masterTeeRatings } = await import("../src/pages/fpg/repeatersModel.ts");
    const c = cenario();
    expect(c.t2025, "edição de 2025 (192/10013)").toBeTruthy();
    expect(c.t2026, "edição de 2026 (192/10024)").toBeTruthy();
    expect(c.draw, "draw curado").toBeTruthy();

    const masterRatings = masterTeeRatings(json("public/data/master-courses.json"), c.vespera.campo);
    // O master conhece os 10 tees do Torre (6 M + 4 F).
    expect(masterRatings.get("laranjas|F")).toEqual({ cr: 74.2, slope: 132 });
    expect(masterRatings.get("amarelas|M")).toEqual({ cr: 66.2, slope: 122 });

    const r = buildRepeaters({
      current: c.vespera, previous: [{ id: "192-10013", year: 2025, t: c.t2025 }],
      fedInfo: c.fedInfo, form: c.form, masterRatings,
    });

    const field = currentField(c.vespera);
    expect(field).toHaveLength(16);
    expect(r.length).toBeGreaterThanOrEqual(10);
    expect(r.length).toBeLessThanOrEqual(field.length);

    // As "Laranjas" das raparigas não existem em 2025, mas o master tem-nas
    // (74.2/132) — logo a previsão delas é firme, não uma suposição.
    const angelina = r.find((x) => x.fed === "51523");
    expect(angelina.teeNow).toMatch(/laranja/i);
    expect(angelina.forecast.teeKnown).toBe(true);

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

describe("PJA Torre — o modelo aferido contra o que aconteceu", () => {
  it("acerta o intervalo na maioria e não se afasta em média", async () => {
    const { buildRepeaters, masterTeeRatings } = await import("../src/pages/fpg/repeatersModel.ts");
    const c = cenario();
    const r = buildRepeaters({
      current: c.vespera, previous: [{ id: "192-10013", year: 2025, t: c.t2025 }],
      fedInfo: c.fedInfo, form: c.form,
      masterRatings: masterTeeRatings(json("public/data/master-courses.json"), c.vespera.campo),
    });
    const real = new Map(c.t2026.players.map((p) => [p.fedCode, p]));

    let n = 0, dentro = 0, somaErro = 0;
    for (const x of r) {
      const p = real.get(x.fed); if (!p || !x.forecast) continue;
      const tot = typeof p.grossTotal === "number" && p.grossTotal < 900 ? p.grossTotal : null;
      if (tot == null) continue;                       // sem cartão não afere nada
      n++;
      if (tot >= x.forecast.low && tot <= x.forecast.high) dentro++;
      somaErro += Math.abs(x.forecast.total - tot);
    }
    const erroMedio = somaErro / n;

    // Medido a 2026-09-06 sobre as 13 previsões com resultado: 11/13 dentro do
    // intervalo, erro médio 5,0 golpes em 36 buracos (2,5 por volta). Os
    // limiares são folgados de propósito — isto trava uma REGRESSÃO do modelo,
    // não certifica pontaria: um torneio é uma amostra pequena.
    expect(n).toBeGreaterThanOrEqual(10);
    expect(dentro / n, `só ${dentro}/${n} dentro do intervalo`).toBeGreaterThanOrEqual(0.6);
    expect(erroMedio, `erro médio ${erroMedio.toFixed(1)} golpes`).toBeLessThan(9);
  });

  it("o Manuel: previsto no intervalo, e o resultado real lá dentro", async () => {
    const { buildRepeaters, masterTeeRatings } = await import("../src/pages/fpg/repeatersModel.ts");
    const c = cenario();
    const r = buildRepeaters({
      current: c.vespera, previous: [{ id: "192-10013", year: 2025, t: c.t2025 }],
      fedInfo: c.fedInfo, form: c.form,
      masterRatings: masterTeeRatings(json("public/data/master-courses.json"), c.vespera.campo),
    });
    const manuel = r.find((x) => x.fed === "52884");
    const real = c.t2026.players.find((p) => p.fedCode === "52884");
    expect(real.grossTotal).toBe(146);                 // 73+73, 2.º classificado
    expect(real.pos).toBe(2);
    expect(manuel.forecast.low).toBeLessThanOrEqual(146);
    expect(manuel.forecast.high).toBeGreaterThanOrEqual(146);
  });
});
