/**
 * useScoutRanking — ranking percentil por coorte (ano de nascimento × sexo),
 * calculado pelo agregador (`computeRanking`, scripts/aggregator/util/scout.js)
 * e gravado no juniors-scout.json (campo `r`). Antes o browser recalculava-o
 * sobre ~38 mil juniores em cada ficha do kids2 (21/10/2026).
 *
 * Devolve `null` enquanto o ficheiro não chega (ou se falhar).
 */
import { useEffect, useState } from "react";
import { cachedFetchJson } from "../../data/fetchCache";
import type { ScoutFile } from "../../ui/circuit/scoutModel";
import { decodeRanking, type RankingEntry, type RankingRow } from "./juniorCalc";

let _ranking: Promise<Map<string, RankingEntry>> | null = null;

function loadScoutRanking(): Promise<Map<string, RankingEntry>> {
  if (!_ranking) {
    _ranking = cachedFetchJson<ScoutFile>("/data/juniors-scout.json").then((d) => {
      const rows: [string, RankingRow][] = [];
      for (const [id, p] of Object.entries(d?.players ?? {})) if (p.r) rows.push([id, p.r]);
      return decodeRanking(rows);
    });
    _ranking.catch(() => { _ranking = null; });
  }
  return _ranking;
}

export function useScoutRanking(): Map<string, RankingEntry> | null {
  const [ranking, setRanking] = useState<Map<string, RankingEntry> | null>(null);
  useEffect(() => {
    let alive = true;
    loadScoutRanking().then((m) => { if (alive) setRanking(m); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return ranking;
}
