/**
 * O builder (scripts/build-egr-rank-slim.js, Node/CJS) e o consumidor
 * (kids2/components/HeroIdentity.tsx, useEgrRank) têm CADA UM a sua cópia de
 * egrNameKey — se divergirem, o lookup falha em silêncio (card EGR desaparece).
 * Mesmo padrão do ffg-escalao-mirror.test.js.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { egrNameKey as uiKey } from "../src/pages/kids2/components/HeroIdentity";
const require = createRequire(import.meta.url);
const { egrNameKey: nodeKey } = require("./build-egr-rank-slim.js");

const SAMPLES = [
  "Stuart Grehan", "GREHAN, Stuart", "João Pereira-Silva", "Anna-Maria O'Brien",
  "  Victor   Bernardini ", "Sofia Cherif Essakali", "LEE, Hyo-Song", "Hyo Song Lee",
];

describe("egrNameKey — espelho builder ↔ UI", () => {
  it("as duas implementações dão a mesma chave para os mesmos nomes", () => {
    for (const s of SAMPLES) expect(uiKey(s), s).toBe(nodeKey(s));
  });
  it("é order-proof e insensível a diacríticos/pontuação", () => {
    expect(nodeKey("GREHAN, Stuart")).toBe(nodeKey("Stuart Grehan"));
    expect(nodeKey("João Silva")).toBe(nodeKey("Joao SILVA"));
    expect(nodeKey("Hyo-Song Lee")).toBe(nodeKey("LEE, Hyo Song"));
  });
});
