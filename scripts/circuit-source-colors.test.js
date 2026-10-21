import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { C } from "../src/utils/colors";

/**
 * As cores das fontes das páginas de circuito (/major, /ffg, /rfeg) vivem em
 * src/tokens.css (§11c) e são espelhadas em src/utils/colors.ts para o JS (o
 * CircuitShell escolhe o texto da pill da fonte pelo hex). Parte se divergirem.
 */
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const tokens = fs.readFileSync(path.join(SRC, "tokens.css"), "utf8");
const token = (name) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(tokens)?.[1];

describe("cores das fontes de circuito: tokens.css = colors.ts", () => {
  it("/major", () => {
    expect(token("color-major")).toBe(C.major);
    for (const [k, v] of Object.entries(C.majorSrc)) expect([k, token(`major-src-${k}`)]).toEqual([k, v]);
  });
  it("/ffg e /rfeg", () => {
    for (const [k, v] of Object.entries(C.ffgSrc)) expect([k, token(`ffg-src-${k}`)]).toEqual([k, v]);
    for (const [k, v] of Object.entries(C.rfegSrc)) expect([k, token(`rfeg-src-${k}`)]).toEqual([k, v]);
  });
});
