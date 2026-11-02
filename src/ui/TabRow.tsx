/**
 * src/ui/TabRow.tsx
 *
 * Linha de tabs com estado activo — interruptor segmentado (`.segmented-toggle`/`.seg-btn`).
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
  /** Contador opcional ao lado do label (ex: `45` jogadores; 0 não aparece). */
  count?: React.ReactNode;
  disabled?: boolean;
  title?: string;
  /** Separador que é um link (barras de navegação): o clique normal chama
   *  onChange; Ctrl/clique do meio abre o endereço noutra janela. */
  href?: string;
  /** Classe extra do separador (ex.: `is-warn` quando a fonte falhou). */
  className?: string;
}

interface TabRowProps<K> {
  tabs?: TabDef<K>[];
  active: K;
  onChange: (key: K) => void;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Nome do grupo para leitores de ecrã (ex.: «Ano», «Vista»). */
  ariaLabel?: string;
  /** "under" = separadores sublinhados (secções do detalhe de um torneio,
   *  sub-abas de análise) em vez do interruptor segmentado. */
  variant?: "segmented" | "under";
}

// Interruptor segmentado (o mesmo de Campos/Jogadores) — 13/10/2026: vistas e
// filtros de escolha única com UM só aspecto em todo o site. A API mantém-se.
function TabRow<K>({ tabs, active, onChange, children, className, style, ariaLabel, variant = "segmented" }: TabRowProps<K>) {
  const under = variant === "under";
  return (
    <div
      className={`${under ? "tab-bar" : "segmented-toggle"}${className ? " " + className : ""}`}
      role="tablist"
      aria-label={ariaLabel}
      style={style}
    >
      {tabs?.map(({ key, label, count, disabled, title, href, className: tabClass }) => {
        const isActive = active === key;
        const cls = `${under ? "tab-under" : "seg-btn"}${isActive ? " active" : ""}${tabClass ? " " + tabClass : ""}`;
        const inner = (
          <>
            <span className="seg-label">{label}</span>
            {count != null && count !== 0 && count !== "" && <span className="seg-count">{count}</span>}
          </>
        );
        if (href) return (
          <a key={String(key)} href={href} role="tab" aria-selected={isActive} className={cls} title={title}
            onClick={e => {
              if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
              e.preventDefault();
              onChange(key);
            }}>
            {inner}
          </a>
        );
        return (
          <button
            key={String(key)}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={cls}
            onClick={() => !disabled && onChange(key)}
            disabled={disabled}
            title={title}
            style={disabled ? { cursor: "not-allowed", opacity: 0.5 } : undefined}
          >
            {inner}
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
      role="tab"
      aria-selected={isActive}
      className={`seg-btn${isActive ? " active" : ""}`}
      onClick={() => !disabled && onChange?.(value)}
      disabled={disabled}
    >
      <span className="seg-label">{children}</span>
    </button>
  );
}

TabRow.Tab = Tab as <K>(props: TabProps<K>) => React.ReactElement;

export default TabRow;
