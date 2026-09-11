/**
 * Regressão do extractor de draws CGSS (scripts/extract-cgss-draws.py) e da
 * guarda de grupos do add-cgss-draw.js.
 *
 * Fixtures em scripts/__fixtures__/ — PDFs DataGolf reais do Santo da Serra e o
 * agrupamento esperado, congelado das entradas curadas de cgss-draws-manual.json:
 *   - cgss-draw-2026-09-12-barbeito  — XIII Vinhos Barbeito (007/90074 → 11064):
 *     shotgun 09:00, saídas "N A" às 09:10, 23 grupos / 90 jogadores. Com o
 *     pdftotext do xpdf (Git for Windows) saíam 1 jogador por grupo e 38 + 31.
 *   - cgss-draw-2026-08-29-om-nos-8  — 8º OM NOS (007/11057), 2 tees, 15 grupos.
 *   - cgss-draw-2026-01-31-pares-t1  — T1 Pares Greensomes (007/10989): 3 pares
 *     por grupo = 6 jogadores, legítimo (a guarda conta lugares, não jogadores).
 *
 * Os testes do extractor precisam de python + pdfplumber; sem eles são saltados.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { MAX_GROUP_SLOTS, oversizedGroups } = require("./cgss-draw-guard.js");

const EXTRACTOR = path.join(__dirname, "extract-cgss-draws.py");
const ADD = path.join(__dirname, "add-cgss-draw.js");
const FIX = path.join(__dirname, "__fixtures__");
const ENV = { ...process.env, PYTHONIOENCODING: "utf-8" };

const hasPdfplumber = spawnSync("python", ["-c", "import pdfplumber"], { env: ENV }).status === 0;
const hasPdftotext = !spawnSync("pdftotext", ["-v"]).error;

function extract(name, env = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cgss-extract-"));
  try {
    const out = path.join(tmp, "out.json");
    // --data-dir vazio: sem casar com resultados, os nomes vêm tal e qual do PDF
    const r = spawnSync("python", [EXTRACTOR, "--pdf", path.join(FIX, `cgss-draw-${name}.pdf`),
      "--data-dir", tmp, "--out", out], { env: { ...ENV, ...env }, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`extractor falhou (${r.status}): ${r.stderr}`);
    return JSON.parse(fs.readFileSync(out, "utf8")).tournaments;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// o extractor põe o Manuel em 1º no seu grupo — a ordem dentro do grupo não conta
const shape = (groups, nomeOf) => groups.map((g) => ({
  teeTime: g.teeTime, startHole: g.startHole,
  players: g.players.map((p) => nomeOf(p).normalize("NFC")).sort(),
}));

describe.skipIf(!hasPdfplumber)("extract-cgss-draws.py — layouts DataGolf", () => {
  for (const name of ["2026-09-12-barbeito", "2026-08-29-om-nos-8", "2026-01-31-pares-t1"]) {
    it(`${name}: agrupamento igual ao draw curado`, () => {
      const exp = JSON.parse(fs.readFileSync(path.join(FIX, `cgss-draw-${name}.expected.json`), "utf8"));
      const ts = extract(name);
      expect(ts).toHaveLength(1);
      expect(ts[0].name).toBe(exp.name);
      expect(ts[0].date).toBe(exp.date);
      const groups = ts[0].draws["1"].groups;
      expect(shape(groups, (p) => p.nome)).toEqual(shape(exp.groups, (n) => n));
      expect(oversizedGroups(groups)).toEqual([]);
    }, 60000);
  }

  it("Barbeito: 23 grupos de 4/3, buraco numérico, saídas das 09:10 e o Manuel no 10 A", () => {
    const groups = extract("2026-09-12-barbeito")[0].draws["1"].groups;
    expect(groups).toHaveLength(23);
    expect(groups.reduce((s, g) => s + g.players.length, 0)).toBe(90);
    for (const g of groups) {
      expect(typeof g.startHole).toBe("number");
      expect([3, 4]).toContain(g.players.length);
    }
    expect(groups.filter((g) => g.teeTime === "09:10").map((g) => g.startHole)).toEqual([1, 8, 10, 15, 18]);
    const manuel = groups.find((g) => g.players.some((p) => p.fed === "52884"));
    expect([manuel.teeTime, manuel.startHole]).toEqual(["09:10", 10]);
  }, 60000);
});

describe("cgss-draw-guard", () => {
  it("apanha o draw baralhado (1 por grupo e o resto num só)", () => {
    const players = (n) => Array.from({ length: n }, (_, i) => ({ nome: `J${i}` }));
    const groups = [
      ...Array.from({ length: 12 }, () => ({ teeTime: "09:00", startHole: 1, players: players(1) })),
      { teeTime: "09:10", startHole: 10, players: players(38) },
      { teeTime: "09:10", startHole: 18, players: players(31) },
    ];
    expect(oversizedGroups(groups)).toEqual([
      { teeTime: "09:10", startHole: 10, slots: 38, players: 38 },
      { teeTime: "09:10", startHole: 18, slots: 31, players: 31 },
    ]);
  });

  it("aceita grupos de 4 e pares (3 pares = 6 jogadores = 3 lugares)", () => {
    const four = { teeTime: "09:00", startHole: 1, players: [{}, {}, {}, {}] };
    const pares = { teeTime: "08:00", startHole: 1, entries: 3, players: [{}, {}, {}, {}, {}, {}] };
    expect(MAX_GROUP_SLOTS).toBe(4);
    expect(oversizedGroups([four, pares])).toEqual([]);
  });
});

describe.skipIf(!hasPdftotext)("add-cgss-draw.js --pdf com o motor pdftotext", () => {
  it("recusa (exit 4, a sugerir --json) em vez de gravar um draw baralhado", () => {
    const r = spawnSync("node", [ADD, "--pdf", path.join(FIX, "cgss-draw-2026-09-12-barbeito.pdf"), "--dry-run"],
      { env: { ...ENV, CGSS_PDF_ENGINE: "pdftotext" }, encoding: "utf8" });
    if (r.status === 4) {
      expect(r.stderr).toMatch(/mais de 4 lugares/);
      expect(r.stderr).toMatch(/--json/);
    } else {
      // um pdftotext que leia bem o layout (poppler) chega inteiro à fase seguinte
      expect(r.stdout).toMatch(/23 grupos \/ 90 jogadores/);
    }
  }, 60000);
});
