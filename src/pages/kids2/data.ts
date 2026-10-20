/**
 * kids2/data.ts
 *
 * Camada de dados canónica. Lê os ficheiros produzidos pelo agregador
 * (scripts/aggregator/index.js) e expõe um hook React com tipos directos.
 *
 * Ficheiros:
 *   /data/juniors.json                      — roster cross-federação
 *   /data/juniors-tournaments.json          — manifest (sharded) OU torneios inline
 *   /data/juniors-tournaments-NN.json       — shards individuais (se sharded)
 *   /data/tournament-catalog.json           — séries de torneios
 */

import { useEffect, useState } from "react";
import { cachedFetchJson } from "../../data/fetchCache";
import type { DataSource } from "../../ui/DataSources";
import { normName } from "../../utils/normName";
import type { Junior, Tournament, TournamentSeries } from "./juniorCalc";

// Tipos e contas vivem em juniorCalc.ts (sem imports — também os usa o agregador).
export * from "./juniorCalc";

export interface CanonicalData {
  juniors: Junior[];
  tournaments: Tournament[];
  series: TournamentSeries[];
  juniorById: Map<string, Junior>;
  juniorByUskidsMember: Map<string, Junior>;
  juniorByFpgFed: Map<string, Junior>;
  juniorByRfegLic: Map<string, Junior>;
  juniorByFfgolfLic: Map<string, Junior>;
  juniorByNormName: Map<string, Junior[]>;
  tournamentById: Map<string, Tournament>;
  seriesById: Map<string, TournamentSeries>;
  manuel: Junior | null;
  /** Ficheiros canónicos lidos pelo loader — alimenta DataSourcesChip na toolbar. */
  sources: DataSource[];
}

// ═════════════════════════════════════════════════════════════════════
// Loader
// ═════════════════════════════════════════════════════════════════════

const MANUEL_USKIDS_ID = "630106";

async function fetchWithSource(path: string, group?: string): Promise<{ data: unknown; source: DataSource }> {
  try {
    const data = await cachedFetchJson(path);
    const d = data as any;
    // Conta heurística: tournaments | juniors | series | shards
    let count: number | undefined;
    if (Array.isArray(d?.tournaments)) count = d.tournaments.length;
    else if (Array.isArray(d?.juniors)) count = d.juniors.length;
    else if (Array.isArray(d?.series)) count = d.series.length;
    else if (Array.isArray(d?.shards)) count = d.shards.length;
    return {
      data,
      source: {
        path,
        status: "loaded",
        count,
        source: d?.generatedBy || d?.source,
        lastUpdated: d?.generatedAt || d?.lastUpdated,
        group,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      data: null,
      source: { path, status: "error", error: message, group },
    };
  }
}

async function loadCanonical(): Promise<CanonicalData> {
  const sources: DataSource[] = [];

  const [juniorsLoad, tournamentsLoad, catalogLoad] = await Promise.all([
    fetchWithSource("/data/juniors.json", "main"),
    fetchWithSource("/data/juniors-tournaments.json", "main"),
    fetchWithSource("/data/tournament-catalog.json", "main"),
  ]);
  sources.push(juniorsLoad.source, tournamentsLoad.source, catalogLoad.source);

  const juniors: Junior[] = (juniorsLoad.data as any)?.juniors || [];
  const series: TournamentSeries[] = (catalogLoad.data as any)?.series || [];

  // Tournaments podem vir num ficheiro único OU em shards (manifest sharded:true)
  let tournaments: Tournament[] = [];
  const tResp = tournamentsLoad.data as any;
  if (tResp?.sharded && Array.isArray(tResp.shards)) {
    const shardLoads = await Promise.all(
      tResp.shards.map((fn: string) => fetchWithSource(`/data/${fn}`, "shards")),
    );
    for (const sl of shardLoads) {
      sources.push(sl.source);
      const arr = (sl.data as any)?.tournaments;
      if (Array.isArray(arr)) tournaments.push(...arr);
    }
  } else if (Array.isArray(tResp?.tournaments)) {
    tournaments = tResp.tournaments;
  }

  const juniorById = new Map<string, Junior>();
  const juniorByUskidsMember = new Map<string, Junior>();
  const juniorByFpgFed = new Map<string, Junior>();
  const juniorByRfegLic = new Map<string, Junior>();
  const juniorByFfgolfLic = new Map<string, Junior>();
  const juniorByNormName = new Map<string, Junior[]>();

  for (const j of juniors) {
    juniorById.set(j.id, j);
    if (j.sources.uskids?.memberId) juniorByUskidsMember.set(j.sources.uskids.memberId, j);
    if (j.sources.fpg?.fed) juniorByFpgFed.set(j.sources.fpg.fed, j);
    if (j.sources.rfeg?.lic) juniorByRfegLic.set(j.sources.rfeg.lic, j);
    if (j.sources.ffgolf?.lic) juniorByFfgolfLic.set(j.sources.ffgolf.lic, j);
    const nk = normName(j.canonicalName);
    let arr = juniorByNormName.get(nk);
    if (!arr) { arr = []; juniorByNormName.set(nk, arr); }
    arr.push(j);
    for (const alias of j.aliases || []) {
      const ak = normName(alias);
      if (ak === nk) continue;
      let arr2 = juniorByNormName.get(ak);
      if (!arr2) { arr2 = []; juniorByNormName.set(ak, arr2); }
      if (!arr2.includes(j)) arr2.push(j);
    }
  }

  const tournamentById = new Map<string, Tournament>();
  for (const t of tournaments) tournamentById.set(t.id, t);

  const seriesById = new Map<string, TournamentSeries>();
  for (const s of series) seriesById.set(s.id, s);

  const manuel = juniorByUskidsMember.get(MANUEL_USKIDS_ID) || null;

  return {
    juniors,
    tournaments,
    series,
    juniorById,
    juniorByUskidsMember,
    juniorByFpgFed,
    juniorByRfegLic,
    juniorByFfgolfLic,
    juniorByNormName,
    tournamentById,
    seriesById,
    manuel,
    sources,
  };
}

// ═════════════════════════════════════════════════════════════════════
// Cache + Hook
// ═════════════════════════════════════════════════════════════════════

let _cache: Promise<CanonicalData> | null = null;

function getCache(): Promise<CanonicalData> {
  if (!_cache) _cache = loadCanonical();
  return _cache;
}

export type CanonicalStatus =
  | { kind: "loading" }
  | { kind: "ready"; data: CanonicalData }
  | { kind: "error"; error: string };

export function useJuniorsCanonical(): CanonicalStatus {
  const [status, setStatus] = useState<CanonicalStatus>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    getCache()
      .then((data) => { if (alive) setStatus({ kind: "ready", data }); })
      .catch((err) => { if (alive) setStatus({ kind: "error", error: String(err?.message || err) }); });
    return () => { alive = false; };
  }, []);
  return status;
}

export { normName };
