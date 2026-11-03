import { describe, it, expect } from "vitest";
import { isStaleChunkError } from "../staleChunk";
import { compareNullsLast } from "../../hooks/useSort";

describe("isStaleChunkError", () => {
  it("reconhece os erros de ficheiro antigo dos browsers", () => {
    expect(isStaleChunkError(new TypeError("error loading dynamically imported module: https://golf-fpg.vercel.app/assets/courses-GBh9kV9H.js"))).toBe(true);
    expect(isStaleChunkError(new TypeError("Failed to fetch dynamically imported module: /assets/x.js"))).toBe(true);
    expect(isStaleChunkError(new TypeError("Importing a module script failed."))).toBe(true);
  });
  it("não confunde outros erros", () => {
    expect(isStaleChunkError(new Error("HTTP 500"))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});

describe("compareNullsLast", () => {
  const vals = [3, null, 10, NaN, 1];
  it("vazios no fim a subir", () => {
    expect([...vals].sort((a, b) => compareNullsLast(a, b, 1)).slice(0, 3)).toEqual([1, 3, 10]);
  });
  it("vazios no fim a descer (não saltam para o topo)", () => {
    expect([...vals].sort((a, b) => compareNullsLast(a, b, -1)).slice(0, 3)).toEqual([10, 3, 1]);
  });
});
