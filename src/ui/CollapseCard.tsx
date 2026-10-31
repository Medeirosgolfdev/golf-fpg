/**
 * src/ui/CollapseCard.tsx
 *
 * Cartão colapsável genérico (título + ícone + badge opcional, chevron ▲/▼).
 * Extraído da JogadoresPage (AnalysisView) em 2026-08-15 — é agnóstico à
 * página e reutilizável em qualquer vista com secções abre/fecha.
 */
import React, { useState } from "react";

export default function CollapseCard({ title, icon, defaultOpen = false, children, badge }: {
  title: string; icon?: string; defaultOpen?: boolean;
  children: React.ReactNode; badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card mb-12" >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => (e.key === "Enter" || e.key === " ") && setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none", marginBottom: open ? 12 : 0 }}
      >
        {icon && <span className="u-fs-fs-16">{icon}</span>}
        <span className="h-xs flex-1 u-m-0">{title}</span>
        {badge}
        <span className="u-fs-fs-12 u-c-text-3 u-ml-4px">{open ? "▲" : "▼"}</span>
      </div>
      {open && children}
    </div>
  );
}
