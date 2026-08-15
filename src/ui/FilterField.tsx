/**
 * src/ui/FilterField.tsx
 *
 * Primitivas de filtros partilhadas (extraídas da JogadoresListPage em
 * 2026-08-15 para reutilização na toolbar da JogadoresPage):
 *
 *   - FilterField: rótulo pequeno por cima do controlo (.filter-field/.filter-label)
 *   - ToggleChip:  botão-pill on/off com rótulo completo (.btn-pill)
 */
import type { ReactNode } from "react";

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="filter-field">
      <div className="filter-label">{label}</div>
      {children}
    </div>
  );
}

export function ToggleChip({ checked, onChange, label, title }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="btn-pill"
      aria-pressed={checked}
      title={title}
      style={{
        background: checked ? "var(--accent)" : "var(--bg-card)",
        color: checked ? "#fff" : "var(--text)",
        borderColor: checked ? "var(--accent)" : "var(--border)",
        fontSize: "var(--fs-12)",
      }}
    >
      {label}
    </button>
  );
}
