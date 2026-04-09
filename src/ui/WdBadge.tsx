/**
 * src/ui/WdBadge.tsx
 *
 * Badge de WD (Withdrawn / retirado).
 * CSS .badge-wd já existe em App.css.
 *
 * Uso:
 *   <WdBadge />                  → <span class="badge-wd">WD</span>
 *   <WdBadge label="DNS" />      → <span class="badge-wd">DNS</span>
 *   <WdBadge muted />            → versão muted (texto simples, sem badge)
 */
import React from "react";

interface WdBadgeProps {
  /** Texto do badge. Default: "WD" */
  label?: string;
  /** Versão muted — texto simples sem background (para células de tabela) */
  muted?: boolean;
}

export default function WdBadge({ label = "WD", muted = false }: WdBadgeProps) {
  if (muted) {
    return (
      <span className="c-muted fs-11 fw-700">{label}</span>
    );
  }
  return <span className="badge-wd">{label}</span>;
}
