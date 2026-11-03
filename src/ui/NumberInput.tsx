/**
 * NumberInput — a caixa de números do site (HCP, anos, distâncias, SD, gross…).
 * Sempre `type="number"` com algarismos tabulares (sem `inputMode="decimal"` por
 * omissão: no iPhone esse teclado não tem «−», e o HCP pode ser plus); o
 * aspecto vem da variante:
 *   - "input"  → caixa normal (`.input`)
 *   - "filter" → barra de filtros (`.filter-input`)
 *   - "select" → ao lado de selects (`.select`)
 *   - "big"    → número em destaque (simulador, distância habitual)
 * A largura vai em `className` (utilitários `.u-w-*`). `onChange` recebe o
 * texto tal como está na caixa — quem precisa do número converte.
 */
import type { InputHTMLAttributes } from "react";

type Base = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "className">;

export default function NumberInput({ value, onChange, variant = "input", className, ...rest }: Base & {
  value: string | number;
  onChange: (text: string) => void;
  variant?: "input" | "filter" | "select" | "big";
  className?: string;
}) {
  const base = variant === "filter" ? "filter-input" : variant === "select" ? "select" : variant === "big" ? "input num-input-big" : "input";
  return (
    <input type="number" {...rest}
      className={`${base} num-input${className ? " " + className : ""}`}
      value={value} onChange={e => onChange(e.target.value)} />
  );
}
