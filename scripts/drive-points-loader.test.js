/**
 * Os scripts Node usam o MESMO ficheiro dos pontos do Drive que o site
 * (src/constants/drivePoints.ts) através de scripts/lib/drive-points.cjs — o que
 * só funciona com Node ≥ 22.18 e enquanto o ficheiro não importar nada nem usar
 * sintaxe que o Node não apaga. Este teste corre um Node a sério (não o do
 * vitest), como o do whs-loader.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { drivePoints, finalPoints, sharedPoints, rankingTotal, tournamentPoints } from "../src/constants/drivePoints";

const RAIZ = path.join(__dirname, "..");

describe("scripts/lib/drive-points.cjs carrega src/constants/drivePoints.ts", () => {
  it("dá os mesmos pontos que o site", () => {
    const code =
      "const d=require('./scripts/lib/drive-points.cjs');" +
      "const campo=Array.from({length:9},(_,i)=>({fed:String(i+1),pos:i+1,gross:40+i}));" +
      "process.stdout.write(JSON.stringify([d.drivePoints(8,'tour'),d.drivePoints(8,'challenge'),d.finalPoints(2,'challenge')," +
      "d.sharedPoints(14,2,'challenge'),d.rankingTotal([{pts:250},{pts:165},{pts:94},{pts:75},{pts:64}])," +
      "d.tournamentPoints(campo,'challenge','Final Drive Challenge Norte-Oporto-Sub 12').get('8'),Object.keys(d).length]))";
    const out = JSON.parse(execFileSync(process.execPath, ["-e", code], { cwd: RAIZ, encoding: "utf8" }));
    const campo = Array.from({ length: 9 }, (_, i) => ({ fed: String(i + 1), pos: i + 1, gross: 40 + i }));
    expect(out.slice(0, 6)).toEqual([
      drivePoints(8, "tour"), drivePoints(8, "challenge"), finalPoints(2, "challenge"),
      sharedPoints(14, 2, "challenge"), rankingTotal([{ pos: 1, pts: 250 }, { pos: 2, pts: 165 }, { pos: 3, pts: 94 }, { pos: 4, pts: 75 }, { pos: 5, pts: 64 }]),
      tournamentPoints(campo, "challenge", "Final Drive Challenge Norte-Oporto-Sub 12").get("8"),
    ]);
    expect(out.slice(0, 4)).toEqual([38, 35, 248, 22.5]);
    expect(out[6]).toBeGreaterThanOrEqual(14);
  });

  it("o ficheiro continua carregável pelo Node: sem imports, enum nem namespace", () => {
    const src = fs.readFileSync(path.join(RAIZ, "src/constants/drivePoints.ts"), "utf8");
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/^\s*(export\s+)?(const\s+)?enum\s/m);
    expect(src).not.toMatch(/^\s*(export\s+)?namespace\s/m);
  });
});
