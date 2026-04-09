/**
 * src/hooks/useSort.ts
 *
 * Hook que encapsula o padrão [sortKey, sortDir] + toggleSort
 * repetido em FPGPage (x5), DrivePage (x4), MultiRoundLeaderboard,
 * JogadoresPage, NacionaisPage.
 *
 * Uso:
 *   const { sortKey, sortDir, toggleSort } = useSort("pos");
 *   const { sortKey, sortDir, toggleSort } = useSort("totalPts", "desc");
 *
 * Ao clicar na mesma key inverte direção; ao mudar de key usa defaultDir.
 * Override por key: useSort("pos", "asc", { totalPts: "desc" })
 */
import { useState, useCallback } from "react";

export function useSort<K extends string>(
  defaultKey: K,
  defaultDir: "asc" | "desc" = "asc",
  defaultDirMap?: Partial<Record<K, "asc" | "desc">>
) {
  const [sortKey, setSortKey] = useState<K>(defaultKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultDir);
  // para resetSort
  const _defKey = defaultKey;
  const _defDir = defaultDir;

  const toggleSort = useCallback((k: K) => {
    setSortKey(prev => {
      if (prev === k) {
        setSortDir(d => d === "asc" ? "desc" : "asc");
        return k;
      }
      setSortDir(defaultDirMap?.[k] ?? defaultDir);
      return k;
    });
  }, [defaultDir, defaultDirMap]);

  return { sortKey, sortDir, toggleSort } as const;
}
