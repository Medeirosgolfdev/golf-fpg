/**
 * src/ui/DetailHeader.tsx
 *
 * Cabeçalho do painel de detalhe (detail-header).
 * Unifica as 3 variantes encontradas nas páginas:
 *
 *   Variante simples:
 *     <DetailHeader title="Venice Open 2026" sub="📅 12 Mar · Santo da Serra" />
 *
 *   Com acções (botões/links à direita do título):
 *     <DetailHeader title={t.name} actions={<button>🖨️ Imprimir</button>}>
 *       <span className="muted">📅 {date}</span>
 *     </DetailHeader>
 *
 *   Só children (casos especiais — KIDSPage empty state):
 *     <DetailHeader><div className="muted">Sem dados</div></DetailHeader>
 */
import React from "react";

interface DetailHeaderProps {
  /** Título principal (h2.detail-title) */
  title?: React.ReactNode;
  /** Sub-linha (detail-sub). Aceita string ou JSX. */
  sub?: React.ReactNode;
  /** Elementos à direita do título (botões, badges, links) */
  actions?: React.ReactNode;
  /** Conteúdo livre abaixo do top-row (substitui sub quando mais complexo) */
  children?: React.ReactNode;
  className?: string;
}

export default function DetailHeader({
  title, sub, actions, children, className,
}: DetailHeaderProps) {
  const hasTop = title || actions;

  return (
    <div className={`detail-header${className ? " " + className : ""}`}>
      {hasTop && (
        <div className="detail-header-top">
          {title && <h2 className="detail-title">{title}</h2>}
          {actions && <div className="flex-wrap" style={{ display: "flex", gap: 6, alignItems: "center" }}>{actions}</div>}
        </div>
      )}
      {sub != null && (
        <div className="detail-sub">{sub}</div>
      )}
      {children}
    </div>
  );
}
