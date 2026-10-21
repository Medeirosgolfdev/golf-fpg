import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cachedFetchJson, invalidateCache } from "../fetchCache";

/**
 * fetchCache — guarda a Promise do objecto já convertido (um só fetch + um só
 * JSON.parse por URL) e deixa voltar a tentar depois de uma falha.
 */
function resposta(body: string, status = 200): Response {
  return new Response(body, { status });
}

describe("cachedFetchJson", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("um só fetch e o MESMO objecto para chamadas repetidas", async () => {
    fetchMock.mockResolvedValue(resposta('{"a":1}'));
    const url = "/data/teste-mesmo-objecto.json";
    const [x, y] = await Promise.all([cachedFetchJson(url), cachedFetchJson(url)]);
    const z = await cachedFetchJson(url);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(x).toEqual({ a: 1 });
    expect(y).toBe(x);
    expect(z).toBe(x);
  });

  it("404 devolve null e fica em cache", async () => {
    fetchMock.mockResolvedValue(resposta("", 404));
    const url = "/data/teste-404.json";
    expect(await cachedFetchJson(url)).toBeNull();
    expect(await cachedFetchJson(url)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("erro HTTP sai da cache — a chamada seguinte tenta outra vez", async () => {
    const url = "/data/teste-500.json";
    fetchMock.mockResolvedValueOnce(resposta("", 500));
    await expect(cachedFetchJson(url)).rejects.toThrow(/HTTP 500/);
    fetchMock.mockResolvedValueOnce(resposta('{"ok":true}'));
    expect(await cachedFetchJson(url)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falha de rede e JSON inválido também saem da cache", async () => {
    const url = "/data/teste-rede.json";
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(cachedFetchJson(url)).rejects.toThrow(/Failed to fetch/);
    fetchMock.mockResolvedValueOnce(resposta("{partido"));
    await expect(cachedFetchJson(url)).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(resposta("[1,2]"));
    expect(await cachedFetchJson(url)).toEqual([1, 2]);
  });

  it("remove bytes nulos de escrita truncada", async () => {
    fetchMock.mockResolvedValue(resposta('{"b":2}\0\0\0'));
    expect(await cachedFetchJson("/data/teste-nul.json")).toEqual({ b: 2 });
  });

  it("URL com query string nunca vai à cache", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(resposta('{"c":3}')));
    await cachedFetchJson("/data/teste.json?v=1");
    await cachedFetchJson("/data/teste.json?v=1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalidateCache força novo fetch", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(resposta('{"d":4}')));
    const url = "/data/teste-invalidar.json";
    const a = await cachedFetchJson(url);
    invalidateCache(url);
    const b = await cachedFetchJson(url);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(b).not.toBe(a);
  });
});
