/**
 * useCachedFiles — hook genérico para carregar N ficheiros JSON em paralelo
 * com cachedFetchJson, expondo data + meta + loading num único return.
 *
 * Resolve dois bugs comuns que apareciam em pages que faziam isto manualmente:
 *  1) `await res.json()` sobre Response em cache (consume body — segundo
 *     consumer crashava com `Body has already been consumed`). cachedFetchJson
 *     já faz res.clone() internamente.
 *  2) `setFileMeta(prev => [...prev, item])` em append acumulava duplicados
 *     em StrictMode (useEffect corre 2× em dev). Aqui constrói-se o array
 *     localmente e faz-se um único `setFileMeta(...)` no fim.
 *
 * Uso:
 *   const { data, meta, loading } = useCachedFiles<MyType>(URLS, {
 *     group: "drive",
 *     parse: (raw, src) => normalize(raw, src),  // opcional
 *   });
 *
 *   data: T[]   — resultados parseados (null para ficheiros que falharam)
 *   meta: DataSource[]  — para passar a <DataSourcesChip>
 *   loading: boolean
 */
import { useEffect, useState } from "react";
import { cachedFetchJson } from "../data/fetchCache";
import type { DataSource } from "../ui/DataSources";

export interface CachedFileSpec {
  url: string;
  /** Group label para o DataSourcesChip (ex: "drive", "doral"). */
  group?: string;
  /** Metadata extra que vai junto com o item no array de resultados. */
  [extra: string]: unknown;
}

export interface UseCachedFilesResult<T> {
  data: (T | null)[];
  meta: DataSource[];
  loading: boolean;
}

/**
 * Carrega uma lista de URLs (ou specs com metadata) em paralelo.
 *
 * @param urls Array de URLs (string) ou specs `{ url, group, ... }`
 * @param opts Opções:
 *   - `group`: grupo default para o DataSource quando os items não o trazem
 *   - `parse`: função aplicada ao raw antes de armazenar em `data`
 *   - `notFoundError`: mensagem para 404 (default: "Ficheiro não encontrado (404)")
 */
export function useCachedFiles<T = unknown>(
  urls: ReadonlyArray<string | CachedFileSpec>,
  opts: {
    group?: string;
    parse?: (raw: unknown, spec: CachedFileSpec) => T;
    notFoundError?: string;
  } = {}
): UseCachedFilesResult<T> {
  const [data, setData] = useState<(T | null)[]>([]);
  const [meta, setMeta] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const { group: defaultGroup, parse, notFoundError = "Ficheiro não encontrado (404)" } = opts;

  // Serializar dependência: array de URLs (ignorando objects extra que
  // podem ter referências instáveis em cada render).
  const urlsKey = urls.map(u => typeof u === "string" ? u : u.url).join("|");

  useEffect(() => {
    let alive = true;
    const specs: CachedFileSpec[] = urls.map(u =>
      typeof u === "string" ? { url: u } : u
    );

    type Result = { data: T | null; meta: DataSource };
    Promise.all(specs.map(async (spec): Promise<Result> => {
      const group = (spec.group as string | undefined) ?? defaultGroup;
      try {
        const raw = await cachedFetchJson<unknown>(spec.url);
        if (raw == null) {
          return {
            data: null,
            meta: { path: spec.url, status: "error", error: notFoundError, ...(group ? { group } : {}) },
          };
        }
        const parsed = parse ? parse(raw, spec) : (raw as T);
        return {
          data: parsed,
          meta: { path: spec.url, status: "loaded", ...(group ? { group } : {}) },
        };
      } catch (e) {
        return {
          data: null,
          meta: { path: spec.url, status: "error", error: String(e), ...(group ? { group } : {}) },
        };
      }
    })).then(results => {
      if (!alive) return;
      setData(results.map(r => r.data));
      setMeta(results.map(r => r.meta));
      setLoading(false);
    });

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlsKey]);

  return { data, meta, loading };
}
