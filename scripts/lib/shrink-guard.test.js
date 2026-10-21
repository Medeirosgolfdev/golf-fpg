import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { wouldShrink, writeJsonGuarded, countExisting } = require("./shrink-guard.js");
const { writeJsonAtomic } = require("./atomic-write.js");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "shrink-"));
const quiet = { error() {}, log() {} };

afterEach(() => vi.restoreAllMocks());

describe("wouldShrink", () => {
  it("compara a fracção perdida", () => {
    expect(wouldShrink(100, 50, 0.5)).toBe(false);
    expect(wouldShrink(100, 49, 0.5)).toBe(true);
    expect(wouldShrink(null, 0, 0.5)).toBe(false);
    expect(wouldShrink(0, 0, 0.5)).toBe(false);
    expect(wouldShrink(10, 0, 0.1)).toBe(true);
  });
});

describe("writeJsonGuarded", () => {
  it("grava quando não há ficheiro anterior", () => {
    const f = path.join(tmp(), "a.json");
    const r = writeJsonGuarded(f, { players: [1] }, { count: (d) => d.players.length, log: quiet });
    expect(r.written).toBe(true);
    expect(JSON.parse(fs.readFileSync(f, "utf8"))).toEqual({ players: [1] });
  });

  it("recusa encolher sem --force e deixa o ficheiro intacto", () => {
    const f = path.join(tmp(), "a.json");
    fs.writeFileSync(f, JSON.stringify({ players: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }));
    const before = fs.readFileSync(f, "utf8");
    const r = writeJsonGuarded(f, { players: [1] }, { count: (d) => d.players.length, maxDrop: 0.3, force: false, log: quiet });
    expect(r).toMatchObject({ written: false, prev: 10, next: 1 });
    expect(fs.readFileSync(f, "utf8")).toBe(before);
  });

  it("com force grava mesmo a encolher", () => {
    const f = path.join(tmp(), "a.json");
    fs.writeFileSync(f, JSON.stringify({ players: [1, 2, 3, 4] }));
    const r = writeJsonGuarded(f, { players: [] }, { count: (d) => d.players.length, force: true, log: quiet });
    expect(r.written).toBe(true);
    expect(JSON.parse(fs.readFileSync(f, "utf8")).players).toEqual([]);
  });

  it("sem count compara bytes", () => {
    const f = path.join(tmp(), "a.json");
    fs.writeFileSync(f, JSON.stringify({ big: "x".repeat(1000) }));
    expect(writeJsonGuarded(f, { big: "" }, { force: false, log: quiet }).written).toBe(false);
    expect(writeJsonGuarded(f, { big: "x".repeat(900) }, { force: false, log: quiet }).written).toBe(true);
  });

  it("ficheiro anterior ilegível não bloqueia (não há com que comparar)", () => {
    const f = path.join(tmp(), "a.json");
    fs.writeFileSync(f, "<<<<<<< HEAD");
    expect(countExisting(f, (d) => d.length)).toBe(null);
    expect(writeJsonGuarded(f, [1], { count: (d) => d.length, force: false, log: quiet }).written).toBe(true);
  });
});

describe("atomic-write (scripts/lib) — fsync", () => {
  it("writeJsonAtomic faz fsync antes do rename e não deixa .tmp", () => {
    const d = tmp();
    const f = path.join(d, "x.json");
    const calls = [];
    const fsync = vi.spyOn(fs, "fsyncSync").mockImplementation(() => calls.push("fsync"));
    const ren = vi.spyOn(fs, "renameSync");
    ren.mockImplementation((a, b) => { calls.push("rename"); ren.mockRestore(); fs.renameSync(a, b); });
    writeJsonAtomic(f, { a: 1 });
    expect(calls[0]).toBe("fsync");
    expect(calls.indexOf("rename")).toBeGreaterThan(0);
    expect(fsync).toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(f, "utf8"))).toEqual({ a: 1 });
    expect(fs.readdirSync(d)).toEqual(["x.json"]);
  });
});
