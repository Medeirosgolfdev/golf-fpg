/**
 * O builder (scripts/scrape-wagr.js, Node/CJS) e o consumidor
 * (src/pages/WAGRPage.tsx, wagrShardOf) têm CADA UM a sua cópia da função que
 * decide o shard do rollup jogador→eventos — se divergirem, o detalhe do
 * jogador vai buscar o ficheiro errado e mostra "sem eventos" **em silêncio**.
 * Mesmo padrão do egr-rank-slim-mirror.test.js e do ffg-escalao-mirror.test.js.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { wagrShardOf as uiShard, WAGR_PLAYER_SHARDS as uiN } from "../src/pages/WAGRPage";
const require = createRequire(import.meta.url);
const { shardOf: nodeShard, PLAYER_SHARDS: nodeN } = require("./scrape-wagr.js");

// Ids reais do WAGR (portugueses do ranking) + os casos-limite.
const SAMPLES = ["34776", "43316", "39853", "41860", "41418", "39175", "38937", "0", "1", "999999999999"];

describe("shard do rollup WAGR — espelho builder ↔ UI", () => {
  it("o número de shards é o mesmo dos dois lados", () => {
    expect(uiN).toBe(nodeN);
  });
  it("as duas implementações dão o mesmo shard para os mesmos ids", () => {
    for (const id of SAMPLES) expect(uiShard(id), id).toBe(nodeShard(id));
  });
  it("o shard cai sempre dentro do intervalo", () => {
    for (const id of SAMPLES) {
      expect(uiShard(id)).toBeGreaterThanOrEqual(0);
      expect(uiShard(id)).toBeLessThan(uiN);
    }
  });
  it("ids não numéricos não rebentam (caem no shard 0)", () => {
    expect(uiShard("")).toBe(0);
    expect(uiShard("")).toBe(nodeShard(""));
  });
});
