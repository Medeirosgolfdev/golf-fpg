/**
 * Counter — chip de contagem para o fim da Toolbar (`ml-auto`).
 *
 * Padroniza o `<div className="chip">{n} foo</div>` que aparece em
 * CamposPage, FPGPage, USKIDSPage etc. à direita de cada toolbar.
 *
 * Uso:
 *   <Counter ml="auto">{filtered.length} campos</Counter>
 *   <Counter>{totalTees} tees</Counter>
 *   <Counter icon="🌍">{intlCount} intl</Counter>
 *
 * Múltiplos counters: o primeiro com `ml="auto"` empurra todos para a
 * direita; os seguintes alinham-se na mesma linha.
 */
import React from "react";

interface CounterProps {
  children: React.ReactNode;
  /** Empurrar para a direita (`ml-auto`). Apenas no primeiro counter. */
  ml?: "auto" | undefined;
  /** Ícone à esquerda do conteúdo. */
  icon?: React.ReactNode;
  /** Variante visual. `muted` = cor cinza, `accent` = destaque. */
  variant?: "default" | "muted" | "accent";
  className?: string;
  title?: string;
}

export default function Counter({
  children, ml, icon, variant = "default", className, title,
}: CounterProps) {
  const cls = "chip"
    + (ml === "auto" ? " ml-auto" : "")
    + (variant === "muted" ? " chip-muted" : "")
    + (variant === "accent" ? " chip-accent" : "")
    + (className ? " " + className : "");
  return (
    <div className={cls} title={title}>
      {icon && <span style={{ marginRight: 4 }}>{icon}</span>}
      {children}
    </div>
  );
}
