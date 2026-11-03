/**
 * useJson — carregar um ficheiro de dados numa página, a mesma peça em todo o
 * site (03/11/2026: havia ~33 cópias de «useEffect + cachedFetchJson + setData +
 * catch», cada uma com a sua maneira de tratar o «a carregar» e o erro).
 *
 *   const { data, loading, error } = useJson<OmJuniorData>("/data/om-cgss-junior.json");
 *   if (loading) return <LoadingState />;
 *   if (error) return <ErrorState message={error} />;
 *
 * - Usa a cache de `cachedFetchJson` (o mesmo ficheiro só se pede uma vez).
 * - `url` null/undefined → não carrega (útil quando depende de outra coisa).
 * - 404 → `data: null` sem erro (ficheiro que ainda não existe).
 * - `transform` corre uma vez sobre o JSON (ex. tirar uma lista de dentro).
 * - Ignora respostas que chegam depois de o componente sair ou de o url mudar.
 */
import { useEffect, useState } from "react";
import { cachedFetchJson } from "../data/fetchCache";

export interface JsonState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useJson<T = unknown, R = T>(url: string | null | undefined, transform?: (raw: T) => R): JsonState<R> {
  const [state, setState] = useState<JsonState<R>>({ data: null, loading: !!url, error: null });
  useEffect(() => {
    if (!url) { setState({ data: null, loading: false, error: null }); return; }
    let alive = true;
    setState((s) => ({ data: s.data, loading: true, error: null }));
    cachedFetchJson<T>(url)
      .then((raw) => {
        if (!alive) return;
        const data = raw == null ? null : transform ? transform(raw) : (raw as unknown as R);
        setState({ data, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (alive) setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) });
      });
    return () => { alive = false; };
    // `transform` fica de fora de propósito: é quase sempre uma função nova em cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return state;
}
