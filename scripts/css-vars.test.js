import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Todas as variáveis CSS usadas (`var(--x)`) têm de estar definidas — em
 * src/tokens.css / src/App.css, ou num style inline («"--x": …»). Uma variável
 * sem definição cai em silêncio no valor inicial (fundo transparente, raio 0…):
 * a auditoria de 20/10/2026 encontrou 23 assim (--bg-1, --radius-md, --bg-base…).
 * Nomes montados em template (`var(--esc-${x}-bg)`) não se conseguem verificar
 * aqui e ficam de fora.
 */
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function ficheiros(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "__tests__") ficheiros(p, out); continue; }
    if (/\.(tsx?|css|html)$/.test(e.name) && !e.name.startsWith(".fuse_hidden")) out.push(p);
  }
  return out;
}

describe("variáveis CSS", () => {
  it("nenhum var(--x) sem definição", () => {
    const definidas = new Set();
    const usadas = new Map();
    for (const f of ficheiros(SRC)) {
      const txt = fs.readFileSync(f, "utf8");
      for (const m of txt.matchAll(/(?:^|[\s{;"'`[])(--[a-zA-Z0-9_-]+)["'`\]]?\s*:/g)) definidas.add(m[1]);
      for (const m of txt.matchAll(/setProperty\(\s*["'`](--[a-zA-Z0-9_-]+)/g)) definidas.add(m[1]);
      for (const m of txt.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)(\$\{)?/g)) {
        if (m[2]) continue; // nome montado em template
        if (!usadas.has(m[1])) usadas.set(m[1], path.relative(SRC, f));
      }
    }
    const emFalta = [...usadas].filter(([v]) => !definidas.has(v)).map(([v, f]) => `${v} (${f})`);
    expect(emFalta).toEqual([]);
  });
});
