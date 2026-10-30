/**
 * FilterPillRow — linha de filtro de escolha múltipla «Rótulo: Todos · a · b · c»
 * com as pills globais (FilterPills). «Todos» limpa a escolha e fica aceso quando
 * nada está escolhido. Uma só peça para estas linhas em todas as páginas (/drive,
 * Draws do jogador…), para não voltarem a ter cada uma o seu aspecto (30/10/2026).
 *
 *   <FilterPillRow label="Ano:" items={anos.map(y => ({ key: y, label: y }))}
 *     active={anoFilter} onChange={setAnoFilter} />
 */
import type { ReactNode } from "react";
import { FilterPills, type FilterPillItem } from "./FilterPills";

interface FilterPillRowProps<K extends string> {
  label: ReactNode;
  /** Explicação no rótulo (tooltip). */
  title?: string;
  items: FilterPillItem<K>[];
  active: ReadonlySet<K> | readonly K[];
  onChange: (next: K[]) => void;
  /** Texto do botão que limpa (default «Todos»). */
  allLabel?: ReactNode;
  /** Sem `.filter-pill-row` (para entrar numa linha que já existe, ex. a da /drive). */
  inline?: boolean;
  className?: string;
}

export default function FilterPillRow<K extends string>({
  label, title, items, active, onChange, allLabel = "Todos", inline, className,
}: FilterPillRowProps<K>) {
  const sel: readonly K[] = Array.isArray(active) ? active : [...(active as ReadonlySet<K>)];
  const body = (<>
    <span className="fs-11 muted shrink-0" title={title}>{label}</span>
    <button type="button" className={"tourn-tab tourn-tab-sm shrink-0" + (sel.length === 0 ? " active" : " tourn-tab-muted")}
      onClick={() => onChange([])}>
      {allLabel}
    </button>
    <FilterPills items={items} active={sel}
      onToggle={k => onChange(sel.includes(k) ? sel.filter(x => x !== k) : [...sel, k])}
      style={{ display: "contents" }} />
  </>);
  if (inline) return body;
  return <div className={"filter-pill-row" + (className ? " " + className : "")}>{body}</div>;
}
