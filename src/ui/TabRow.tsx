/**
 * src/ui/TabRow.tsx
 *
 * Linha de tabs (`tourn-tab tourn-tab-sm`) com estado activo.
 * Substitui o padrão `<div className="escalao-pills">` repetido em
 * BJGTAnalysisPage, FPGPage, USKIDSPage, NacionaisPage, etc.
 *
 * Uso:
 *   <TabRow
 *     tabs={[
 *       { key: "all", label: "Acumulado" },
 *       { key: "r1", label: "R1", count: 32 },
 *       { key: "r2", label: "R2", disabled: true, title: "Ainda não decorreu" },
 *     ]}
 *     active={dt}
 *     onChange={setDt}
 *   />
 *
 *   // Children livres (quando os labels são computados externamente):
 *   <TabRow active={tab} onChange={setTab}>
 *     <TabRow.Tab value="all">Acumulado</TabRow.Tab>
 *     {rounds.map((_, i) => <TabRow.Tab key={i} value={i}>R{i+1}</TabRow.Tab>)}
 *   </TabRow>
 */
import React from "react";

interface TabDef<K> {
  key: K;
  label: React.ReactNode;
  /** Badge numérico opcional ao lado do label (ex: `45` jogadores). */
  count?: number;
  disabled?: boolean;
  title?: string;
}

interface TabRowProps<K> {
  tabs?: TabDef<K>[];
  active: K;
  onChange: (key: K) => void;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

function TabRow<K>({ tabs, active, onChange, children, className, style }: TabRowProps<K>) {
  return (
    <div
      className={`escalao-pills mb-8${className ? " " + className : ""}`}
      style={{ gap: 4, ...style }}
    >
      {tabs?.map(({ key, label, count, disabled, title }) => {
        const isActive = active === key;
        return (
          <button
            key={String(key)}
            className={`tourn-tab tourn-tab-sm${isActive ? " active" : ""}`}
            onClick={() => !disabled && onChange(key)}
            disabled={disabled}
            title={title}
            style={isActive
              ? { flexShrink: 0 }
              : { flexShrink: 0, background: "var(--bg-muted)", color: disabled ? "var(--text-3)" : "var(--text-2)", borderColor: "var(--border)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}
          >
            {label}
            {count != null && count > 0 && (
              <span className="fs-10 fw-700" style={{
                marginLeft: 4, padding: "0 5px", borderRadius: "var(--radius-md)",
                background: isActive ? "rgba(255,255,255,0.25)" : "var(--bg-hover)",
                color: isActive ? "#fff" : "var(--text-3)",
              }}>{count}</span>
            )}
          </button>
        );
      })}
      {children}
    </div>
  );
}

// Sub-componente Tab para uso com children livres
interface TabProps<K> {
  value: K;
  active?: K;
  onChange?: (key: K) => void;
  children: React.ReactNode;
  disabled?: boolean;
}

function Tab<K>({ value, active, onChange, children, disabled }: TabProps<K>) {
  const isActive = active === value;
  return (
    <button
      className={`tourn-tab tourn-tab-sm${isActive ? " active" : ""}`}
      onClick={() => !disabled && onChange?.(value)}
      disabled={disabled}
      style={isActive
        ? { flexShrink: 0 }
        : { flexShrink: 0, background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}
    >
      {children}
    </button>
  );
}

TabRow.Tab = Tab as <K>(props: TabProps<K>) => React.ReactElement;

export default TabRow;
