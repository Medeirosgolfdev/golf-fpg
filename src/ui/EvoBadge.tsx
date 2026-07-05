/**
 * src/ui/EvoBadge.tsx
 *
 * Badge de evolução de posição entre edições de um torneio.
 * Substitui o ternário badge-evo-up / badge-evo-eq / badge-evo-new
 * repetido em BJGTPage, DORALPage e BJGTAnalysisPage.
 *
 * Uso:
 *   <EvoBadge pill="UP" from={3} to={1} />
 *   <EvoBadge pill="EQ" from={2} prevPos={2} fieldSize={18} />
 *   <EvoBadge pill="NEW" label="novo" />
 */

interface EvoBadgeProps {
  pill: "UP" | "EQ" | "NEW";
  from?: number | string;
  to?: number | string;
  prevPos?: number | null;
  fieldSize?: number | null;
  /** Texto do badge NEW — default "novo" */
  label?: string;
}

export default function EvoBadge({ pill, from, to, prevPos, fieldSize, label = "novo" }: EvoBadgeProps) {
  const extra = prevPos != null ? ` · ${prevPos}${fieldSize != null ? `/${fieldSize}` : ""}` : "";

  if (pill === "UP") {
    return (
      <span className="badge-evo-up">
        ⬆ {from}→{to}{extra}
      </span>
    );
  }
  if (pill === "EQ") {
    return (
      <span className="badge-evo-eq">
        = {from}{extra}
      </span>
    );
  }
  return <span className="badge-evo-new">{label}</span>;
}
