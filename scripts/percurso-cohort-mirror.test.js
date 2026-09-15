/**
 * Guarda-costas do ESPELHO `COHORT` (scripts/build-percurso-path.js) ↔
 * `PERCURSO_COHORT_FEDS` (src/constants/simuladorPlayers.ts).
 *
 * O selector de jogador do /simulador lista a coorte do percurso dos juniores;
 * se a coorte mudar no script e não na app, o selector fica desactualizado.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { PERCURSO_COHORT_FEDS } from "../src/constants/simuladorPlayers";

describe("PERCURSO_COHORT_FEDS espelha o COHORT do build-percurso-path.js", () => {
  it("tem os mesmos 18 federados", () => {
    const src = fs.readFileSync(path.join(__dirname, "build-percurso-path.js"), "utf8");
    const start = src.indexOf("const COHORT = [");
    const block = src.slice(start, src.indexOf("];", start));
    const feds = [...block.matchAll(/fed:\s*"(\d+)"/g)].map((m) => m[1]);
    expect(feds).toHaveLength(18);
    expect([...PERCURSO_COHORT_FEDS].sort()).toEqual([...feds].sort());
  });
});
