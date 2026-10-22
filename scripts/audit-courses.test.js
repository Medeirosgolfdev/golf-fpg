/**
 * Regras do scripts/audit-courses.js sobre um catálogo de brincar. A auditoria
 * aos dados reais corre no update-data.yml (os commits de dados não disparam o
 * ci.yml), aqui só se garante que as regras medem o que dizem medir.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { norm, canonicalCourseName } from "../src/utils/courseAliases";

const require = createRequire(import.meta.url);
const { auditCatalog, checks, signature, BASELINE } = require("./audit-courses.js");

const tee = (teeName, total = 0) => ({ teeName, distances: { total } });
const course = (courseKey, name, tees) => ({ courseKey, master: { name, tees } });

function run(simCourses, rawAway = [], masterNames = new Set()) {
  return auditCatalog({ simCourses, tournamentCourses: [], rawAway, masterNames, norm, canonicalCourseName });
}

describe("audit-courses — assinatura dos nomes", () => {
  it("ignora palavras genéricas e a ordem", () => {
    expect(signature("Golf Club Val de Rois", norm)).toBe(signature("Val de Rois Golf", norm));
  });
  it("mantém os tokens curtos que separam percursos", () => {
    expect(signature("Aroeira No.1", norm)).not.toBe(signature("Aroeira No.2", norm));
  });
});

describe("audit-courses — métricas", () => {
  it("conta o mesmo campo com dois nomes como grupo duplicado", () => {
    const f = run([
      course("away-clube-val-de-rois", "Clube Val de Rois", [tee("Amarelas", 5800)]),
      course("away-val-de-rois", "Val de Rois", [tee("Amarelas", 5800)]),
      course("away-glen", "Glen Golf Club", [tee("Red", 5100)]),
    ]);
    expect(f.duplicateGroups).toHaveLength(1);
    expect(f.duplicateGroups[0].map((e) => e.key).sort()).toEqual(["away-clube-val-de-rois", "away-val-de-rois"]);
  });

  it("apanha torneios só nas entradas away", () => {
    const f = run([
      course("away-campeonato-andalucia-sub-16", "Campeonato Andalucia Sub 16", [tee("Blancas", 6000)]),
      course("campeonato-fpg", "Campeonato Nacional (campo FPG)", [tee("Brancas", 6000)]),
    ]);
    expect(f.tournamentsAsCourses.map((r) => r.key)).toEqual(["away-campeonato-andalucia-sub-16"]);
  });

  it("conta campos away sem uma única distância e o pior nº de tees", () => {
    const f = run([
      course("away-sem-metros", "Sem Metros", [tee("Amarelas"), tee("Vermelhas")]),
      course("away-com-metros", "Com Metros", [tee("Amarelas", 5900)]),
      course("fpg-sem-metros", "FPG Sem Metros", [tee("Brancas")]),
    ]);
    expect(f.awayWithoutDistances.map((r) => r.key)).toEqual(["away-sem-metros"]);
    expect(f.worstTeeCount).toBe(2);
  });

  it("marca como informação as entradas away que repetem o master (pelo nome canónico)", () => {
    const masterNames = new Set([norm("PGA  Aroeira No.2")]);
    const f = run([], [course("away-aroeira-challenge", "Aroeira Challenge", [tee("Amarelas")])], masterNames);
    expect(f.awayShadowingMaster.map((r) => r.key)).toEqual(["away-aroeira-challenge"]);
  });

  it("falha quando uma métrica passa o tecto", () => {
    const f = run([]);
    f.duplicateGroups = new Array(BASELINE.duplicateGroups + 1).fill([]);
    const failed = checks(f).filter(([, v, cap]) => v > cap).map(([l]) => l);
    expect(failed).toEqual(["Grupos duplicados"]);
  });
});
