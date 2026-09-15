/**
 * Os scripts Node usam o MESMO ficheiro de contas do site (src/utils/whsCalc.ts)
 * através de scripts/lib/whs.cjs — o que só funciona com Node ≥ 22.18. Este
 * teste corre um Node a sério (não o do vitest) para garantir que o carregamento
 * funciona e dá o mesmo resultado que o site: se um workflow voltar a um Node
 * antigo, parte aqui e não em produção.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { scoreDifferential } from "../src/utils/whsCalc";

describe("scripts/lib/whs.cjs carrega src/utils/whsCalc.ts", () => {
  it("dá o mesmo SD que o site", () => {
    const code =
      "const w=require('./scripts/lib/whs.cjs');" +
      "process.stdout.write(String(w.scoreDifferential({score:36,cr:33.2,slope:123,is9:true,hi:6.3}).sd))";
    const out = execFileSync(process.execPath, ["-e", code], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
    });
    const site = scoreDifferential({ score: 36, cr: 33.2, slope: 123, is9: true, hi: 6.3 })?.sd;
    expect(out.trim()).toBe(String(site));
    expect(site).toBe(7);
  });
});
