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

export function useSort<K extends string | number>(
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

  /** Repõe a ordenação nos valores default (key + direcção iniciais). */
  const resetSort = useCallback(() => {
    keyRef.current = defaultKey;
    setSortKey(defaultKey);
    setSortDir(defaultDir);
  }, [defaultKey, defaultDir]);

  return { sortKey, sortDir, toggleSort, resetSort } as const;
}

/** Compara dois números com os vazios (null/NaN) SEMPRE no fim, nas duas
 *  direcções — senão, ao ordenar do maior para o menor, os «—» saltam para o topo.
 *  `dir` = 1 (asc) ou -1 (desc). */
export function compareNullsLast(a: number | null | undefined, b: number | null | undefined, dir: 1 | -1): number {
  const va = a == null || Number.isNaN(a) ? null : a;
  const vb = b == null || Number.isNaN(b) ? null : b;
  if (va == null || vb == null) return va == null && vb == null ? 0 : va == null ? 1 : -1;
  return (va - vb) * dir;
}

/** O mesmo para texto (datas ISO incluídas): vazio (null/"") SEMPRE no fim,
 *  nas duas direcções; o resto por `localeCompare(…, locale)` ("pt" por omissão;
 *  as páginas de Espanha/França usam "es"/"fr"). */
export function compareTextNullsLast(a: string | null | undefined, b: string | null | undefined, dir: 1 | -1, locale = "pt"): number {
  const va = a || null;
  const vb = b || null;
  if (va == null || vb == null) return va == null && vb == null ? 0 : va == null ? 1 : -1;
  return va.localeCompare(vb, locale) * dir;
}

/** Para colunas genéricas cujo valor tanto pode ser número como texto: se um dos
 *  lados é texto compara como texto, senão como número — vazios sempre no fim. */
export function compareValuesNullsLast(a: number | string | null | undefined, b: number | string | null | undefined, dir: 1 | -1): number {
  if (typeof a === "string" || typeof b === "string")
    return compareTextNullsLast(a == null ? null : String(a), b == null ? null : String(b), dir);
  return compareNullsLast(a, b, dir);
}
