/**
 * src/ui/EmptyState.tsx
 *
 * Componente para estados vazios e mensagens de "sem dados".
 * Substitui divs ad-hoc com empty-state, empty-state-sm, empty-state-lg.
 *
 * Uso:
 *   <EmptyState message="Sem dados disponíveis." />
 *   <EmptyState size="sm" message={`Sem dados para ${playerName}`} />
 *   <EmptyState size="lg" icon="🔍" message="Nenhum resultado encontrado." />
 *   <EmptyState icon="⚠️" size="lg">
 *     <p>Mensagem personalizada com <strong>JSX</strong>.</p>
 *   </EmptyState>
 */
import React from "react";

interface EmptyStateProps {
  /** Emoji ou texto curto de ícone */
  icon?: string;
  /** Mensagem principal (alternativa a children) */
  message?: React.ReactNode;
  /** "sm" = compacto · "md" = padrão (default) · "lg" = centrado com mais espaço */
  size?: "sm" | "md" | "lg";
  /** Classe extra no elemento raiz */
  className?: string;
  /** Conteúdo livre (substitui message se fornecido) */
  children?: React.ReactNode;
}

export default function EmptyState({ icon, message, size = "md", className, children }: EmptyStateProps) {
  const baseClass =
    size === "sm" ? "empty-state-sm" :
    size === "lg" ? "empty-state-lg" :
    "empty-state";

  const iconClass = size === "lg" ? "empty-icon-lg" : "empty-icon";

  return (
    <div className={`${baseClass}${className ? " " + className : ""}`}>
      {icon && <div className={iconClass}>{icon}</div>}
      {children ?? message}
    </div>
  );
}