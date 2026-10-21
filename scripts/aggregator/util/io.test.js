// Guardas do agregador (auditoria 2026-10-20): input corrupto = erro, escrita
// atómica com fsync, pisos realistas e queda máxima de 10% face ao disco.
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const io = require("./io.js");
const sanity = require("../validate/sanity-check.js");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agg-io-"));
}

afterEach(() => vi.restoreAllMocks());

describe("readJsonSafe — input corrupto é erro, não reparação", () => {
  it("ficheiro ausente devolve o default (fontes opcionais)", () => {
    const d = tmpDir();
    expect(io.readJsonSafe(path.join(d, "nao-existe.json"), { x: 1 })).toEqual({ x: 1 });
  });

  it("JSON válido lê-se normalmente (com BOM também)", () => {
    const d = tmpDir();
    const f = path.join(d, "ok.json");
    fs.writeFileSync(f, "﻿" + JSON.stringify({ a: [1, 2] }));
    expect(io.readJsonSafe(f, null)).toEqual({ a: [1, 2] });
  });

  it("JSON truncado lança CorruptInputError (antes era «fechado à força»)", () => {
    const d = tmpDir();
    const f = path.join(d, "trunc.json");
    fs.writeFileSync(f, '{"players":[{"a":1},{"a":2},{"a":');
    expect(() => io.readJsonSafe(f, null)).toThrow(io.CorruptInputError);
  });

  it("NUL bytes no fim (truncagem típica) lançam CorruptInputError (antes eram cortados)", () => {
    const d = tmpDir();
    const f = path.join(d, "nul.json");
    fs.writeFileSync(f, Buffer.concat([Buffer.from('{"a":1}'), Buffer.alloc(64)]));
    expect(() => io.readJsonSafe(f, null)).toThrow(/NUL/);
  });
});

describe("writeJson — atómico com fsync", () => {
  it("grava, faz fsync e não deixa ficheiros temporários", () => {
    const d = tmpDir();
    const f = path.join(d, "sub", "out.json");
    const spy = vi.spyOn(fs, "fsyncSync");
    io.writeJson(f, { juniors: [1, 2, 3] });
    expect(spy).toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(f, "utf8"))).toEqual({ juniors: [1, 2, 3] });
    expect(fs.readFileSync(f, "utf8").endsWith("\n")).toBe(true);
    expect(fs.readdirSync(path.dirname(f)).filter((n) => n.includes(".tmp."))).toEqual([]);
  });

  it("se a escrita falhar, o ficheiro anterior fica intacto", () => {
    const d = tmpDir();
    const f = path.join(d, "out.json");
    fs.writeFileSync(f, '{"antigo":true}');
    vi.spyOn(fs, "fsyncSync").mockImplementationOnce(() => { throw new Error("disco"); });
    expect(() => io.writeJson(f, { novo: true })).toThrow("disco");
    expect(fs.readFileSync(f, "utf8")).toBe('{"antigo":true}');
    expect(fs.readdirSync(d)).toEqual(["out.json"]);
  });
});

describe("sanity-check — pisos e queda face ao disco", () => {
  const mk = (nJ, nT) => ({
    juniors: Array.from({ length: nJ }, (_, i) => ({ id: "j" + i, tournamentIds: [] })),
    tournaments: Array.from({ length: nT }, (_, i) => ({ id: "t" + i })),
  });
  const silence = () => vi.spyOn(console, "log").mockImplementation(() => {});

  it("pisos realistas (não 100/500)", () => {
    expect(sanity.MIN_JUNIORS).toBeGreaterThanOrEqual(25000);
    expect(sanity.MIN_TOURNAMENTS).toBeGreaterThanOrEqual(18000);
  });

  it("dropCheck: 10% passa, 11% falha, --force passa, sem anterior passa", () => {
    expect(sanity.dropCheck("x", 1000, 900, false).pass).toBe(true);
    expect(sanity.dropCheck("x", 1000, 890, false).pass).toBe(false);
    expect(sanity.dropCheck("x", 1000, 100, true).pass).toBe(true);
    expect(sanity.dropCheck("x", null, 5, false).pass).toBe(true);
    expect(sanity.dropCheck("x", 1000, 1200, false).pass).toBe(true);
  });

  it("um canónico com metade dos torneios falha (bloqueante)", () => {
    silence();
    const r = sanity.run(mk(38000, 14000), { previous: { juniors: 38672, tournaments: 27987 } });
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => /Torneios não caem/.test(f))).toBe(true);
    expect(r.failures.some((f) => /Pelo menos 21000 torneios/.test(f))).toBe(true);
  });

  it("readPrevious lê as contagens do disco e ignora ficheiros ilegíveis", () => {
    const d = tmpDir();
    const DATA = { outJuniors: path.join(d, "juniors.json"), outTournaments: path.join(d, "jt.json") };
    fs.writeFileSync(DATA.outJuniors, JSON.stringify({ juniors: [{}, {}, {}] }));
    fs.writeFileSync(DATA.outTournaments, "<<<<<<< HEAD\n{");
    expect(sanity.readPrevious(DATA)).toEqual({ juniors: 3, tournaments: null });
    fs.writeFileSync(DATA.outTournaments, JSON.stringify({ sharded: true, totalTournaments: 27987 }));
    expect(sanity.readPrevious(DATA).tournaments).toBe(27987);
  });
});
