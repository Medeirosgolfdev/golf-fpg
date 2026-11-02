/**
 * src/ui/FilterField.tsx
 *
 * Primitivas de filtros partilhadas (extraídas da JogadoresListPage em
 * 2026-08-15 para reutilização na toolbar da JogadoresPage):
 *
 *   - FilterField: rótulo pequeno por cima do controlo (.filter-field/.filter-label)
 *   - ToggleChip:  filtro liga/desliga com rótulo completo (pill global .tourn-tab-sm)
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

export function ToggleChip({ checked, onChange, label, title, disabled, className }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  title?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      // Ligado verde, desligado cinzento — a pill global (Mariana, 31/10/2026).
      className={"tourn-tab tourn-tab-sm shrink-0" + (checked ? " active" : "") + (className ? " " + className : "")}
      aria-pressed={checked}
      title={title}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
