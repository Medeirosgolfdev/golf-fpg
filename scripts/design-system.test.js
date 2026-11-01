import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

/**
 * O design system (src/design-system.html) é gerado por
 * scripts/build-design-system.cjs a partir do tokens.css e das amostras das peças
 * globais. Antes era uma cópia à mão do CSS de Abril/2026 e mostrava classes e
 * tokens que já não existiam. Este teste falha se a página ficar desactualizada
 * ou se mostrar uma classe que a app já não tem. (As variáveis var(--x) da página
 * são verificadas pelo css-vars.test.js.)
 */
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { gerar, OUT } = require("./build-design-system.cjs");

function codigo(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "__tests__") codigo(p, out); continue; }
    if (/\.(tsx?|css)$/.test(e.name)) out.push(fs.readFileSync(p, "utf8"));
  }
  return out;
}

describe("design system", () => {
  const html = fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n");

  it("está em dia com o tokens.css e as amostras (node scripts/build-design-system.cjs)", () => {
    expect(html === gerar()).toBe(true);
  });

  it("só mostra classes que a app tem", () => {
    const app = codigo(path.join(ROOT, "src")).join("\n");
    const usadas = new Set();
    for (const m of html.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (c && !c.startsWith("ds-") && c !== "ds") usadas.add(c);
    const emFalta = [...usadas].filter((c) => !new RegExp("(^|[^a-zA-Z0-9_-])" + c.replace(/-/g, "\\-") + "([^a-zA-Z0-9_-]|$)").test(app));
    expect(emFalta).toEqual([]);
  });
});
