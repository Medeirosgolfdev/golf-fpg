import type { ReactNode } from "react";

/**
 * Botão «✕ Limpar» das barras de filtros e selecções — um só aspecto em todas as
 * páginas (antes havia cinco: laranja com contador, pill vermelha, pill cinzenta…).
 * `count` mostra quantos filtros estão activos; `label` troca o «Limpar»
 * (ex.: «anos», «destaques»).
 */
export default function ClearButton({ onClick, title = "Limpar filtros", label = "Limpar", count }: {
  onClick: () => void;
  title?: string;
  label?: ReactNode;
  count?: number;
}) {
  return (
    <button type="button" className="btn-clear" onClick={onClick} title={title}>
      ✕ {label}{count ? <span className="p-filter-count">{count}</span> : null}
    </button>
  );
}
