/**
 * useFfgData.ts — Os dados da /ffg: as fontes (portal FFG, LGPIDF, GolfGenius,
 * catégories d'âge) e a lista de entradas já construída.
 *
 * Tirado da FFGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import { useEffect, useMemo, useState } from "react";
import type { CircuitEntry } from "../../ui/circuit/types";
import type { FFGCategoriesData } from "./types";
import { EMPTY_FFG_SOURCES, buildFfgEntries, loadFfgSources, type FfgRenderers, type FfgSources } from "./ffgEntries";

export interface FfgData {
  entries: CircuitEntry[];
  categories: FFGCategoriesData | null;
  loading: boolean;
}

/** `R`: o que a página desenha dentro das divisões (tem de ser estável). */
export function useFfgData(R: FfgRenderers): FfgData {
  const [sources, setSources] = useState<FfgSources>(EMPTY_FFG_SOURCES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadFfgSources()
      .then((s) => { if (alive) setSources(s); })
      .catch(() => { /* sem índice do portal: lista vazia */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const entries = useMemo(() => buildFfgEntries(sources, R), [sources, R]);

  return { entries, categories: sources.categories, loading };
}
