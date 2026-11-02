/**
 * Os scripts Node usam a MESMA regra dos desinscritos do site
 * (src/data/desistentes.ts) através de scripts/lib/desistentes.cjs — como o
 * whs-loader.test.js: corre um Node a sério para garantir que o carregamento
 * funciona e dá o mesmo resultado que o site.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { juntarDesistentes } from "../src/data/desistentes";

describe("scripts/lib/desistentes.cjs carrega src/data/desistentes.ts", () => {
  it("dá o mesmo resultado que o site", () => {
    const prev = [{ fed: "1", status: "confirmed" }, { fed: "2", status: "confirmed" }];
    const cur = [{ fed: "1", status: "confirmed" }];
    const code =
      "const d=require('./scripts/lib/desistentes.cjs');" +
      `const r=d.juntarDesistentes(${JSON.stringify(prev)},${JSON.stringify(cur)},{hoje:'2026-11-02'});` +
      "process.stdout.write(JSON.stringify(r))";
    const out = execFileSync(process.execPath, ["-e", code], { cwd: path.join(__dirname, ".."), encoding: "utf8" });
    expect(JSON.parse(out)).toEqual(juntarDesistentes(prev, cur, { hoje: "2026-11-02" }));
  });
});
