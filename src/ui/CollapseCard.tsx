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
        {icon && <span style={{ fontSize: "var(--fs-16)" }}>{icon}</span>}
        <span className="h-xs flex-1"  style={{ margin: 0 }}>{title}</span>
        {badge}
        <span style={{ fontSize: "var(--fs-12)", color: "var(--text-3)", marginLeft: 4 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && children}
    </div>
  );
}
