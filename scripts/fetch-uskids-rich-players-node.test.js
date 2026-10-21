// Regra da USKids: um pedido de cada vez e PARAR À PRIMEIRA RECUSA.
// fetch simulado — nunca toca no signupanytime.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const rich = require("./fetch-uskids-rich-players-node.js");

const fetchOriginal = globalThis.fetch;
let chamadas, emVoo, maxEmVoo;

function fakeFetch(respostas) {
  // respostas: função (n, url) → { status, body }
  return async (url) => {
    chamadas.push(String(url));
    emVoo++; maxEmVoo = Math.max(maxEmVoo, emVoo);
    await new Promise((r) => setTimeout(r, 2));
    emVoo--;
    const { status = 200, body = "{}" } = respostas(chamadas.length, String(url));
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
}

beforeEach(() => {
  chamadas = []; emVoo = 0; maxEmVoo = 0;
  rich._resetRecusa();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  vi.restoreAllMocks();
});

describe("ehRecusa", () => {
  it("403/429/503 e «Too many requests» em texto com 200", () => {
    expect(rich.ehRecusa(403, "")).toBe(true);
    expect(rich.ehRecusa(429, "")).toBe(true);
    expect(rich.ehRecusa(503, "")).toBe(true);
    expect(rich.ehRecusa(200, "Too many requests. Try later")).toBe(true);
    expect(rich.ehRecusa(200, '{"a":1}')).toBe(false);
    expect(rich.ehRecusa(500, "erro")).toBe(false);
  });
});

describe("fetchMemberCareers — sequencial e pára à primeira recusa", () => {
  it("um pedido de cada vez", async () => {
    globalThis.fetch = fakeFetch(() => ({ body: { 123: { p_age_group: "Boys 9" } } }));
    const c = await rich.fetchMemberCareers(["1", "2", "3", "4", "5"], { delayMs: 0 });
    expect(c.size).toBe(5);
    expect(chamadas.length).toBe(5);
    expect(maxEmVoo).toBe(1);
  });

  it("429 no 2.º jogador: nenhum pedido mais (nem retry) e guarda o 1.º", async () => {
    globalThis.fetch = fakeFetch((n) => (n === 2 ? { status: 429, body: "" } : { body: { 9: { p_age_group: "Boys 9" } } }));
    const c = await rich.fetchMemberCareers(["1", "2", "3", "4"], { delayMs: 0 });
    expect(chamadas.length).toBe(2);
    expect([...c.keys()]).toEqual(["1"]);
    expect(rich.recusa()).toMatch(/429/);
  });

  it("«Too many requests» com HTTP 200 também pára", async () => {
    globalThis.fetch = fakeFetch(() => ({ status: 200, body: "Too many requests" }));
    const c = await rich.fetchMemberCareers(["1", "2", "3"], { delayMs: 0 });
    expect(chamadas.length).toBe(1);
    expect(c.size).toBe(0);
  });

  it("depois de uma recusa, apiGet já nem chega a pedir", async () => {
    globalThis.fetch = fakeFetch(() => ({ status: 403, body: "Forbidden" }));
    await expect(rich.apiGet("https://x/?op=GetMeta&t=1")).rejects.toThrow(/recusa/);
    await expect(rich.apiGet("https://x/?op=GetMeta&t=2")).rejects.toThrow(/recusa/);
    expect(chamadas.length).toBe(1);
  });

  it("discoverNewMids pára na recusa", async () => {
    globalThis.fetch = fakeFetch((n) => (n === 1 ? { body: { flights: { 10: {}, 11: {}, 12: {} } } } : { status: 429, body: "" }));
    const novos = await rich.discoverNewMids([1, 2, 3], new Set());
    expect(novos.size).toBe(0);
    expect(chamadas.length).toBe(2);
  }, 10000);
});

describe("writePlayerIfChanged — anti-encolhimento por jogador", () => {
  it("não regrava uma ficha com menos torneios do que a do disco (salvo force)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rich-"));
    const f = path.join(dir, "42.json");
    fs.writeFileSync(f, JSON.stringify({ memberID: "42", torneios: { 1: {}, 2: {}, 3: {} } }));
    expect(rich.writePlayerIfChanged("42", { memberID: "42", torneios: { 1: {} } }, { outDir: dir })).toBe("encolhe");
    expect(Object.keys(JSON.parse(fs.readFileSync(f, "utf8")).torneios)).toHaveLength(3);
    expect(rich.writePlayerIfChanged("42", { memberID: "42", torneios: { 1: {} } }, { outDir: dir, force: true })).toBe(true);
    expect(rich.writePlayerIfChanged("42", { memberID: "42", torneios: { 1: {}, 2: {} } }, { outDir: dir })).toBe(true);
  });
});
