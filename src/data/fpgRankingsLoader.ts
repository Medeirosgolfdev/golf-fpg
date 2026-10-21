/**
 * fpgRankingsLoader.ts — Ficheiros pré-construídos das vistas de ranking da /FPG
 *
 *   - Ranking Sub-12: /data/sub12-ranking.json (scripts/build-sub12-ranking.js) —
 *     a vista do Ranking PJA com metric="sd": o SD oficial de cada miúdo em
 *     cada volta (média das 8 melhores).
 *   - Classificações: /data/classificacoes.json (scripts/build-classificacoes.js)
 *     — calendário dos jogadores de referência com o campo reduzido a juniores.
 *
 * Carregados só quando o tab abre, uma vez por montagem da página.
 */
import { useEffect, useRef, useState } from "react";
import type { Tournament } from "./fpgTypes";
import { cachedFetchJson } from "./fetchCache";

export const SUB12_RANKING_URL = "/data/sub12-ranking.json";
export const CLASSIFICACOES_URL = "/data/classificacoes.json";

/** `tournaments` de um ficheiro de ranking; vazio se faltar ou falhar. */
export async function loadRankingTournaments(url: string): Promise<Tournament[]> {
  try {
    const d = await cachedFetchJson<{ tournaments?: Tournament[] }>(url);
    return d?.tournaments || [];
  } catch {
    return [];
  }
}

/** Carrega `url` na primeira vez que `active` fica true.
 *  ⚠ O guard de "já está a carregar" é um ref, NÃO state: pô-lo nas deps faz o
 *  efeito re-correr assim que o loading passa a true, e a cleanup dessa
 *  primeira execução deitava fora os dados (ficava preso em "A carregar…"). */
export function useLazyRanking(url: string, active: boolean): { tournaments: Tournament[]; loading: boolean } {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    setLoading(true);
    loadRankingTournaments(url).then(ts => {
      setTournaments(ts);
      setLoading(false);
    });
  }, [active, url]);
  return { tournaments, loading };
}
