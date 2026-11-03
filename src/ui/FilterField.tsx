/**
 * src/ui/FilterField.tsx
 *
 * Primitivas de filtros partilhadas (extraídas da JogadoresListPage em
 * 2026-08-15 para reutilização na toolbar da JogadoresPage):
 *
 *   - FilterField: rótulo pequeno por cima do controlo (.filter-field/.filter-label),
 *                  com nota por baixo (`hint`) e modo <label> (`asLabel`)
 *   - ToggleChip:  filtro liga/desliga com rótulo completo (pill global .tourn-tab-sm)
 */
import type { ReactNode } from "react";

/** Rótulo pequeno por cima de um controlo. `hint` = nota por baixo («em metros»,
 *  «0 = sem limite»); `asLabel` envolve tudo num <label> (clicar no rótulo foca a
 *  caixa — para formulários como a Previsão e o simulador). */
export function FilterField({ label, children, hint, asLabel, className }: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  asLabel?: boolean;
  className?: string;
}) {
  const Tag = asLabel ? "label" : "div";
  return (
    <Tag className={`filter-field${className ? " " + className : ""}`}>
      <span className="filter-label">{label}</span>
      {children}
      {hint && <span className="filter-hint">{hint}</span>}
    </Tag>
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
