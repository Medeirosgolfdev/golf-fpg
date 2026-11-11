/**
 * FilterPillRow — linha de filtro «Rótulo: Todos · a · b · c» com as pills
 * globais (FilterPills): escolha múltipla, ou uma de cada vez com `single`
 * (regiões da /drive). «Todos» limpa a escolha e fica aceso quando nada está
 * escolhido; o rótulo é opcional. Uma só peça para estas linhas em todas as páginas (/drive,
 * Draws do jogador…), para não voltarem a ter cada uma o seu aspecto (30/10/2026).
 *
 *   <FilterPillRow label="Ano:" items={anos.map(y => ({ key: y, label: y }))}
 *     active={anoFilter} onChange={setAnoFilter} />
 */
import type { ReactNode } from "react";
import { FilterPills, type FilterPillItem } from "./FilterPills";

interface FilterPillRowProps<K extends string> {
  /** Rótulo antes das pills («Ano:»). Sem ele a linha começa no «Todos». */
  label?: ReactNode;
  /** Escolha ÚNICA: escolher uma troca a anterior; voltar a clicar nela limpa. */
  single?: boolean;
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
  label, title, items, active, onChange, allLabel = "Todos", inline, className, single,
}: FilterPillRowProps<K>) {
  const sel: readonly K[] = Array.isArray(active) ? active : [...(active as ReadonlySet<K>)];
  const body = (<>
    {label != null && <span className="fs-11 muted shrink-0" title={title}>{label}</span>}
    <button type="button" className={"tourn-tab tourn-tab-sm shrink-0" + (sel.length === 0 ? " active" : " tourn-tab-muted")}
      onClick={() => onChange([])}>
      {allLabel}
    </button>
    {single
      ? <FilterPills mode="single" items={items} active={sel[0] ?? null}
          onToggle={k => onChange(k ? [k] : [])} className="u-d-contents" />
      : <FilterPills items={items} active={sel}
          onToggle={k => onChange(sel.includes(k) ? sel.filter(x => x !== k) : [...sel, k])}
          className="u-d-contents" />}
  </>);
  if (inline) return body;
  return <div className={"filter-pill-row" + (className ? " " + className : "")}>{body}</div>;
}
