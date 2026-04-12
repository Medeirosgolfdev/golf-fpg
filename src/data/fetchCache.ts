/**
 * fetchCache.ts — Cache central de fetch para /data/
 *
 * Garante que cada ficheiro JSON é fetched UMA ÚNICA VEZ por sessão,
 * independentemente de quantas páginas o peçam em simultâneo ou em sequência.
 *
 * Mecanismo: guarda a Promise (não o resultado) — assim dois pedidos
 * concorrentes para o mesmo URL partilham o mesmo in-flight request,
 * sem race condition e sem double-fetch.
 *
 * Regra de cache: URLs sem "?" são sempre cached.
 * URLs com "?" (ex: ?v=Date.now()) contornam a cache — são pedidos
 * explicitamente não-cacheáveis pelo chamador.
 *
 * Uso:
 *   import { cachedFetch, cachedFetchJson } from "../data/fetchCache";
 *
 *   // Versão raw (Response):
 *   const res = await cachedFetch("/data/players.json");
 *
 *   // Versão tipada (JSON parsed):
 *   const data = await cachedFetchJson<MyType>("/data/players.json");
 *   // → lança erro se HTTP não OK; retorna null se ficheiro não existir (404/0)
 */

const _cache = new Map<string, Promise<Response>>();

/**
 * fetch com cache de Promise.
 * - URLs sem "?" → cached (partilhados entre páginas)
 * - URLs com "?" → sempre fresh (ex: ?v=Date.now() para bust de cache do browser)
 */
export function cachedFetch(url: string): Promise<Response> {
  // Não cachear URLs com query string (o chamador quer sempre fresh)
  if (url.includes("?")) return fetch(url);

  if (!_cache.has(url)) {
    _cache.set(url, fetch(url));
  }
  return _cache.get(url)!;
}

/**
 * Versão JSON tipada de cachedFetch.
 * - Retorna null se o ficheiro não existir (404) — graceful fallback.
 * - Lança erro para falhas de rede reais (status >= 500, etc.).
 * - Nota: a Response só pode ser consumida uma vez pelo browser — esta
 *   função clona-a antes de chamar .json() para que a Promise em cache
 *   possa ser reutilizada.
 */
export async function cachedFetchJson<T = unknown>(url: string): Promise<T | null> {
  try {
    const res = await cachedFetch(url);
    // Clonar ANTES de consumir — a Response original fica em cache
    const clone = res.clone();
    if (!clone.ok) {
      // 404 → ficheiro não existe, retornar null em vez de lançar erro
      if (clone.status === 404 || clone.status === 0) return null;
      throw new Error(`HTTP ${clone.status} ao carregar ${url}`);
    }
    let text = await clone.text();
    // Remover null bytes que podem surgir de escrita truncada no Windows
    if (text.includes("\0")) text = text.replace(/\0+/g, "");
    return JSON.parse(text) as T;
  } catch (e) {
    // Erro de rede (sem servidor, CORS, etc.) — propagar
    throw e;
  }
}

/**
 * Remove uma entrada específica da cache (ex: para forçar reload após upload).
 */
export function invalidateCache(url: string): void {
  _cache.delete(url);
}

/**
 * Limpa toda a cache (útil em testes ou hot-reload de desenvolvimento).
 */
export function clearFetchCache(): void {
  _cache.clear();
}
