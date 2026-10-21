import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Todos os caminhos fixos "/data/…" que o código do site pede têm de existir em
 * public/data — senão dão 404 em produção (a auditoria de 20/10/2026 encontrou
 * 5 assim, em Clubes, Aroeira e LGPIDF). Caminhos montados em template
 * (`/data/egr/players/egr_${id}.json`) não se conseguem verificar aqui.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function caminhos() {
  const out = new Map();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "__tests__") walk(p); continue; }
      if (!/\.tsx?$/.test(e.name) || e.name.startsWith(".fuse_hidden")) continue;
      for (const m of fs.readFileSync(p, "utf8").matchAll(/["'`](\/data\/[^"'`?#\s]+)/g)) {
        // template, pasta ou prefixo (`/data/pull-torneios` + "000.json") — não verificáveis
        if (m[1].includes("${") || !/\.[a-z]+$/i.test(m[1])) continue;
        if (!out.has(m[1])) out.set(m[1], path.relative(ROOT, p).split(path.sep).join("/"));
      }
    }
  };
  walk(path.join(ROOT, "src"));
  return out;
}

describe("caminhos /data/ do site", () => {
  it("existem em public/", () => {
    const emFalta = [...caminhos()].filter(([u]) => !fs.existsSync(path.join(ROOT, "public", u))).map(([u, f]) => `${u} (${f})`);
    expect(emFalta).toEqual([]);
  });
});
