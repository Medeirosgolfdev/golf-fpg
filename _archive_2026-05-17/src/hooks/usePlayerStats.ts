// src/hooks/usePlayerStats.ts
//
// Hook partilhado para carregar player-stats.json. Encapsula o useEffect
// de fetch que aparecia duplicado em CompararPage, JogadoresPage e
// NacionaisPage. Usa loadPlayerStats() de playerStatsTypes.ts (que tem
// cache promise-based, tratamento de BOM e null bytes).
//
// Tipo genérico para acomodar páginas que usam um subset de PlayerStats
// (ver src/pages/nacionais/types.ts).

import { useEffect, useState } from "react";
import { loadPlayerStats, type PlayerStatsDb } from "../data/playerStatsTypes";

export function usePlayerStats<T extends Record<string, unknown> = PlayerStatsDb>(): T {
  const [db, setDb] = useState<T>({} as T);
  useEffect(() => {
    loadPlayerStats().then(d => setDb(d as unknown as T));
  }, []);
  return db;
}
