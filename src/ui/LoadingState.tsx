/**
 * src/ui/LoadingState.tsx
 *
 * Estado de carregamento unificado.
 * Substitui os 5 padrões visuais de loading dispersos pelas páginas.
 *
 * Variantes:
 *  - "sm"  → inline/compact (empty-state-sm)
 *  - "md"  → centered with icon (empty-state, default)
 *  - "lg"  → full-height with large icon (empty-state-lg)
 */

type Props = {
  message?: string;
  size?: "sm" | "md" | "lg";
  icon?: string;
};

export default function LoadingState({
  message = "A carregar…",
  size = "md",
  icon = "⏳",
}: Props) {
  if (size === "sm")
    return (
      <div className="empty-state-sm">
        {icon} {message}
      </div>
    );

  return (
    <div className={size === "lg" ? "empty-state-lg" : "empty-state"}>
      <div className="empty-icon">{icon}</div>
      <div className={size === "lg" ? "fw-700 c-text-2 fs-14" : "muted"}>
        {message}
      </div>
    </div>
  );
}
