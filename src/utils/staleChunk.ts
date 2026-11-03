/**
 * Ficheiros antigos depois de um deploy. Cada deploy muda os nomes dos
 * ficheiros JS (`courses-GBh9kV9H.js` → `courses-XXXX.js`) e apaga os antigos;
 * uma página aberta de antes pede o nome velho, recebe 404 e mostrava
 * «error loading dynamically imported module». A cura é recarregar a página —
 * fazemo-lo sozinhos, uma vez (se voltar a falhar em 30 s, é outro problema e
 * o erro aparece).
 */
const KEY = "stale-chunk-reload-at";

export function isStaleChunkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError/i.test(msg);
}

/** Recarrega a página uma vez; devolve false se já o fez há menos de 30 s. */
export function reloadForStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
