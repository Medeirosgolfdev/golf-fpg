import { useMemo, useState } from "react";

/**
 * Paginação das listas longas (com o <Pager>): página actual, nº de páginas e as
 * linhas da página. Volta à 1.ª página sempre que `resetKey` muda (os filtros).
 */
export function usePaged<T>(rows: readonly T[], resetKey: string, pageSize = 100) {
  const [page, setPage] = useState(1);
  const [lastKey, setLastKey] = useState(resetKey);
  if (resetKey !== lastKey) { setLastKey(resetKey); if (page !== 1) setPage(1); }
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize]);
  return { page, setPage, totalPages, pageRows };
}
