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
  /** Cor de destaque quando activo (default: var(--accent)). */
  activeBg?: string;
}

interface FilterPillsBaseProps<K extends string> {
  items: FilterPillItem<K>[];
  className?: string;
  style?: React.CSSProperties;
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
  const { items, className, style, hideZero } = props;
  return (
    <div
      className={`escalao-pills${className ? " " + className : ""}`}
      style={{ gap: 4, display: "inline-flex", flexWrap: "wrap", alignItems: "center", ...style }}
    >
      {items.map(({ key, label, count, disabled, title, activeBg }) => {
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
            className={`tourn-tab tourn-tab-sm${isActive ? " active" : ""}`}
            onClick={() => {
              if (disabled) return;
              if (props.mode === "single") {
                props.onToggle(isActive ? null : key);
              } else {
                props.onToggle(key);
              }
            }}
            style={isActive
              ? { flexShrink: 0, ...(activeBg ? { background: activeBg } : {}) }
              : { flexShrink: 0, background: "var(--bg-muted)", color: disabled ? "var(--text-3)" : "var(--text-2)", borderColor: "var(--border)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}
          >
            {label}
            {count != null && (
              <span className="fs-10 fw-700" style={{
                marginLeft: 4, padding: "0 5px", borderRadius: 8,
                background: isActive ? "rgba(255,255,255,0.25)" : "var(--bg-hover)",
                color: isActive ? "#fff" : "var(--text-3)",
              }}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default FilterPills;
