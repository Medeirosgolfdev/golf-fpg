/**
 * FilterPills — pills clicáveis on/off para filtros multi-select.
 *
 * Diferente de TabRow (escolha exclusiva): aqui cada pill alterna
 * independentemente, e múltiplos podem estar activos ao mesmo tempo.
 *
 * Uso:
 *   <FilterPills
 *     items={[
 *       { key: "norte", label: "📍 Norte" },
 *       { key: "tejo",  label: "📍 Tejo" },
 *       { key: "sul",   label: "📍 Sul", count: 12 },
 *     ]}
 *     active={selectedRegions}                       // Set<string> ou string[]
 *     onToggle={key => toggleSetItem(selectedRegions, key)}
 *     // OU mode="single" para escolha exclusiva (com null = nenhum activo)
 *   />
 */
import React from "react";

export interface FilterPillItem<K extends string = string> {
  key: K;
  label: React.ReactNode;
  count?: number;
  disabled?: boolean;
  title?: string;
}

interface FilterPillsBaseProps<K extends string> {
  items: FilterPillItem<K>[];
  className?: string;
  /** Ocultar pills com count === 0 (default: false). */
  hideZero?: boolean;
}

interface FilterPillsMultiProps<K extends string> extends FilterPillsBaseProps<K> {
  mode?: "multi";
  active: ReadonlySet<K> | readonly K[];
  onToggle: (key: K) => void;
}

interface FilterPillsSingleProps<K extends string> extends FilterPillsBaseProps<K> {
  mode: "single";
  active: K | null;
  onToggle: (key: K | null) => void;
}

type FilterPillsProps<K extends string> =
  | FilterPillsMultiProps<K>
  | FilterPillsSingleProps<K>;

function isActiveSet<K>(active: ReadonlySet<K> | readonly K[], key: K): boolean {
  if (Array.isArray(active)) return active.includes(key);
  return (active as ReadonlySet<K>).has(key);
}

export function FilterPills<K extends string>(props: FilterPillsProps<K>) {
  const { items, className, hideZero } = props;
  return (
    <div
      className={`escalao-pills fp-pills${className ? " " + className : ""}`}
    >
      {items.map(({ key, label, count, disabled, title }) => {
        if (hideZero && count === 0) return null;
        const isActive = props.mode === "single"
          ? props.active === key
          : isActiveSet(props.active, key);
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            title={title}
            className={`tourn-tab tourn-tab-sm u-fsh-0${isActive ? " active" : disabled ? " fp-disabled" : ""}`}
            onClick={() => {
              if (disabled) return;
              if (props.mode === "single") {
                props.onToggle(isActive ? null : key);
              } else {
                props.onToggle(key);
              }
            }}
            // Desligada = cinzento da regra global .tourn-tab-sm:not(.active).
          >
            {label}
            {count != null && (
              <span className="pill-count fs-10 fw-700">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}


