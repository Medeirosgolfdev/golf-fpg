/**
 * O agregador do Kids 2 (scripts/aggregator/sources/fig.js) lê o MESMO
 * src/data/federgolf/nomes.ts da /fig com o Node a correr TypeScript (o
 * workflow build-juniors não instala dependências). Este teste corre um Node a
 * sério: se o nomes.ts ganhar um import de valores, um `enum` ou um
 * `namespace`, parte aqui e não no workflow.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { fgChaveProva, fgNome } from "../src/data/federgolf/nomes";

describe("src/data/federgolf/nomes.ts carrega no Node", () => {
  it("dá o mesmo nome e a mesma chave de prova que o site", () => {
    const prova = { data: "2026-07-07", clube: "MILANO", nome: "CAMPIONATO NAZIONALE PULCINE - FEMMINILE" };
    const code =
      "const f=require('./src/data/federgolf/nomes.ts');" +
      `process.stdout.write(JSON.stringify([f.fgNome("DURANDO, MATTEO"), f.fgChaveProva(${JSON.stringify(prova)})]))`;
    const out = execFileSync(process.execPath, ["--no-warnings", "-e", code], { cwd: path.join(__dirname, ".."), encoding: "utf8" });
    expect(JSON.parse(out)).toEqual([fgNome("DURANDO, MATTEO"), fgChaveProva(prova)]);
    expect(JSON.parse(out)[0]).toBe("Matteo Durando");
  });
});
