/**
 * fetchCache.ts — Cache central de fetch para /data/
 *
 * Garante que cada ficheiro JSON é descarregado e convertido UMA ÚNICA VEZ por
 * sessão, independentemente de quantas páginas o peçam em simultâneo ou em
 * sequência.
 *
 * Mecanismo: guarda a Promise do objecto JÁ CONVERTIDO — dois pedidos
 * concorrentes para o mesmo URL partilham o mesmo pedido em curso e o mesmo
 * objecto (o JSON não é reconvertido a cada chamada). Os consumidores tratam o
 * resultado como só de leitura.
 *
 * Falhas (rede, HTTP ≥ 500, JSON inválido) saem da cache: a chamada seguinte
 * tenta outra vez. Um 404 fica em cache como `null` (o ficheiro não existe).
 *
 * Regra de cache: URLs sem "?" são sempre cached.
 * URLs com "?" (ex: ?v=Date.now()) contornam a cache — são pedidos
 * explicitamente não-cacheáveis pelo chamador.
 *
 * Uso:
 *   import { cachedFetchJson } from "../data/fetchCache";
 *   const data = await cachedFetchJson<MyType>("/data/players.json");
 *   // → lança erro se HTTP não OK; retorna null se ficheiro não existir (404/0)
 */

const _cache = new Map<string, Promise<unknown>>();

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (!res.ok) {
    // 404 → ficheiro não existe, retornar null em vez de lançar erro
    if (res.status === 404 || res.status === 0) return null;
    throw new Error(`HTTP ${res.status} ao carregar ${url}`);
  }
  let text = await res.text();
  // Remover null bytes que podem surgir de escrita truncada no Windows
  if (text.includes("\0")) text = text.replace(/\0+/g, "");
  return JSON.parse(text) as T;
}

/**
 * JSON tipado, com cache da Promise do objecto convertido.
 * - Retorna null se o ficheiro não existir (404) — graceful fallback.
 * - Lança erro para falhas de rede reais (status >= 500, etc.) e, nesse caso,
 *   retira o URL da cache para a próxima chamada tentar outra vez.
 */
export function cachedFetchJson<T = unknown>(url: string): Promise<T | null> {
  // Não cachear URLs com query string (o chamador quer sempre fresh)
  if (url.includes("?")) return fetchJson<T>(url);

  const hit = _cache.get(url);
  if (hit) return hit as Promise<T | null>;
  const p = fetchJson<T>(url);
  _cache.set(url, p);
  p.catch(() => {
    if (_cache.get(url) === p) _cache.delete(url);
  });
  return p;
}

/**
 * Remove uma entrada específica da cache (ex: para forçar reload após upload).
 */
export function invalidateCache(url: string): void {
  _cache.delete(url);
}
