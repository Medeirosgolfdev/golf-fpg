/**
 * SearchInput — a caixa de pesquisa, a mesma em todas as páginas: 🔎 à esquerda,
 * × à direita para limpar (só com texto). Antes havia ~20 caixas à mão com 5
 * aspectos (lupa no placeholder, 🔍/🔎, com e sem ×…).
 *
 *   <SearchInput value={q} onChange={setQ} placeholder="Nome ou clube…" />
 *
 * `size`: "sm" 140px · "md" 200px (default) · "full" ocupa a largura disponível.
 * `children` fica dentro da caixa (posição relativa) — para a lista de resultados.
 */
import type { KeyboardEvent, ReactNode, Ref } from "react";

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  size?: "sm" | "md" | "full";
  /** Classes da caixa (margens, largura máxima…). */
  className?: string;
  disabled?: boolean;
  onFocus?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  wrapRef?: Ref<HTMLDivElement>;
  children?: ReactNode;
}

export default function SearchInput({
  value, onChange, placeholder = "Pesquisar…", ariaLabel, size = "md", className, disabled, onFocus, onKeyDown, wrapRef, children,
}: SearchInputProps) {
  return (
    <div ref={wrapRef} className={`search-box is-${size}` + (className ? " " + className : "")}>
      <span aria-hidden="true" className="search-box-icon">🔎</span>
      <input
        type="search"
        className="search-box-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        disabled={disabled}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
      />
      {value && !disabled && (
        <button type="button" aria-label="Limpar pesquisa" title="Limpar" onClick={() => onChange("")} className="search-box-clear">×</button>
      )}
      {children}
    </div>
  );
}
