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
 *
 * Quem transforma o JSON e guarda o resultado (um índice, um Map) usa o
 * `memoAsync` daqui — nunca um `let _promise` com `.catch(() => vazio)` lá
 * dentro, que guarda a FALHA para a sessão inteira.
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
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
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

export interface MemoAsync<T, A extends unknown[] = []> {
  (...args: A): Promise<T>;
  /** Larga o que estiver guardado: a chamada seguinte carrega outra vez. */
  reset(): void;
}

/**
 * Guarda a Promise de um carregamento (um resultado por sessão) e LARGA-A quando
 * falha, para a chamada seguinte tentar outra vez (10/11/2026). Antes, cinco
 * loaders faziam `.catch(() => ({}))` DENTRO da Promise guardada: um 502
 * passageiro ficava em cache como «vazio» até recarregar a página.
 *
 * - `load` deve LANÇAR quando falha (o `cachedFetchJson` já o faz; um 404 não é
 *   falha — devolve null e esse resultado guarda-se).
 * - `fallback`: o que quem chamou recebe nessa falha (ex. `{}`), sem ficar
 *   guardado. Sem `fallback` a Promise devolvida rejeita.
 * - `keep`: devolve false para um resultado que se entrega mas não se guarda
 *   (ex. carga parcial).
 * - Os argumentos só contam na chamada que carrega; com a Promise guardada são
 *   ignorados (não é uma cache por chave — para isso, um Map de `memoAsync`).
 */
export function memoAsync<T, A extends unknown[] = []>(
  load: (...args: A) => Promise<T>,
  opts: { fallback?: (e: unknown) => T; keep?: (v: T) => boolean } = {},
): MemoAsync<T, A> {
  let guardada: Promise<T> | null = null;
  const fn = ((...args: A): Promise<T> => {
    if (guardada) return guardada;
    let carga: Promise<T>;
    try { carga = Promise.resolve(load(...args)); } catch (e) { carga = Promise.reject(e); }
    const largar = () => { if (guardada === p) guardada = null; };
    const p: Promise<T> = carga.then(
      (v) => { if (opts.keep && !opts.keep(v)) largar(); return v; },
      (e) => { largar(); if (opts.fallback) return opts.fallback(e); throw e; },
    );
    guardada = p;
    return p;
  }) as MemoAsync<T, A>;
  fn.reset = () => { guardada = null; };
  return fn;
}

/**
 * Remove uma entrada específica da cache (ex: para forçar reload após upload).
 */
export function invalidateCache(url: string): void {
  _cache.delete(url);
}
