/**
 * src/ui/SidebarToggle.tsx
 *
 * Botão de toggle da sidebar — partilhado por TODAS as páginas.
 *
 * Comportamento:
 *   • Desktop / sidebar aberta  → ícone "◀" compacto (sidebar-toggle)
 *   • Mobile / sidebar fechada  → "▶ [backLabel]" visível na toolbar
 *     (elimina a necessidade do mobile-back-btn separado abaixo do toolbar)
 */

import { useIsMobile } from "../hooks/useIsMobile";

interface SidebarToggleProps {
  open: boolean;
  onToggle: () => void;
  /** Texto a mostrar no botão "voltar" em mobile (ex: "Lista", "Campos", "Torneios") */
  backLabel?: string;
}

export default function SidebarToggle({ open, onToggle, backLabel = "Lista" }: SidebarToggleProps) {
  const isMobile = useIsMobile();
  const showBack = !open && isMobile;

  if (showBack) {
    return (
      <button
        className="sidebar-back-btn"
        onClick={onToggle}
        title="Abrir painel"
      >
        ▶ {backLabel}
      </button>
    );
  }

  return (
    <button
      className="sidebar-toggle"
      onClick={onToggle}
      title={open ? "Fechar painel" : "Abrir painel"}
    >
      {open ? "◀" : "▶"}
    </button>
  );
}
