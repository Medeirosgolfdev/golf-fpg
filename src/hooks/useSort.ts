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
 *
 * NOTA: usa useRef para evitar chamar setSortDir dentro de um updater
 * de setSortKey — esse padrão causa bug em React 19 strict mode
 * (updaters correm 2×, logo a direcção inverte e volta ao mesmo valor).
 */
import { useState, useCallback, useRef } from "react";

export function useSort<K extends string>(
  defaultKey: K,
  defaultDir: "asc" | "desc" = "asc",
  defaultDirMap?: Partial<Record<K, "asc" | "desc">>
) {
  const [sortKey, setSortKey] = useState<K>(defaultKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultDir);
  const keyRef = useRef<K>(defaultKey);

  const toggleSort = useCallback((k: K) => {
    if (keyRef.current === k) {
      // mesma coluna → inverter direcção
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      // nova coluna → direcção default para essa key
      keyRef.current = k;
      setSortKey(k);
      setSortDir(defaultDirMap?.[k] ?? defaultDir);
    }
  }, [defaultDir, defaultDirMap]);

  return { sortKey, sortDir, toggleSort } as const;
}
