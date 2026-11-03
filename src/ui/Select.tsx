/**
 * Select — a caixa de escolha do site (escalão, clube, período, tee, PCC…).
 * O aspecto vem da variante:
 *   - "select"  → caixa normal nas barras de ferramentas (`.select`)
 *   - "filter"  → dentro de um FilterField, ocupa a coluna (`.filter-input`)
 *   - "compact" → pequena, em barras apertadas (`.select-compact`)
 * `active` marca um filtro aplicado (borda verde, negrito). A largura vai em
 * `className` (utilitários `.u-w-*`/`.u-minw-*`). `onChange` recebe o valor em
 * texto — quem precisa de número converte.
 */
import type { ReactNode, SelectHTMLAttributes } from "react";

type Base = Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "className" | "children">;

export type SelectVariant = "select" | "filter" | "compact";

export default function Select({ value, onChange, variant = "select", active, className, children, ...rest }: Base & {
  value: string | number;
  onChange: (value: string) => void;
  variant?: SelectVariant;
  active?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const base = variant === "filter" ? "filter-input" : variant === "compact" ? "select-compact" : "select";
  return (
    <select {...rest}
      className={`${base}${active ? " select-active" : ""}${className ? " " + className : ""}`}
      value={value} onChange={e => onChange(e.target.value)}>
      {children}
    </select>
  );
}
