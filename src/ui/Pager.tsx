/**
 * src/ui/Pager.tsx
 *
 * Paginação «« ‹ Página N de M › »» — uma só peça para as listas longas
 * (Jogadores, jogadores da França e de Espanha, Mérite). Com uma só página não
 * mostra nada. Os botões são os .btn globais.
 */
export default function Pager({ page, totalPages, onPage }: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const first = page <= 1, last = page >= totalPages;
  return (
    <div className="pager">
      <button type="button" className="btn" onClick={() => onPage(1)} disabled={first} aria-label="Primeira página">«</button>
      <button type="button" className="btn" onClick={() => onPage(Math.max(1, page - 1))} disabled={first} aria-label="Página anterior">‹</button>
      <span className="pager-info">Página <b>{page}</b> de {totalPages}</span>
      <button type="button" className="btn" onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={last} aria-label="Página seguinte">›</button>
      <button type="button" className="btn" onClick={() => onPage(totalPages)} disabled={last} aria-label="Última página">»</button>
    </div>
  );
}
