/**
 * src/hooks/usePlayerData.ts
 *
 * Hook partilhado para carregar dados de análise de um jogador.
 * Elimina duplicação entre BJGTAnalysisPage e JogadoresPage/PlayerDetail.
 */
import { useState, useEffect } from "react";
import { loadPlayerData, type PlayerPageData } from "../data/playerDataLoader";
import { deepFixMojibake } from "../utils/fixEncoding";

interface UsePlayerDataResult {
  data: PlayerPageData | null;
  loading: boolean;
  error: string | null;
}

export function usePlayerData(fedId: string): UsePlayerDataResult {
  const [data, setData] = useState<PlayerPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);

    loadPlayerData(fedId)
      .then(d => {
        if (!alive) return;
        deepFixMojibake(d);
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });

    return () => { alive = false; };
  }, [fedId]);

  return { data, loading, error };
}
