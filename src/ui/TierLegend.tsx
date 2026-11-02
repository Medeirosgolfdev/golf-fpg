/**
 * TierLegend — legenda dos níveis (Elite · Forte · Sólido · Em Desenv. ·
 * Iniciante) com o ponto de cor, a mesma nos Rivais e na Tabela Global.
 */
import { TIER } from "../data/rivalData";
import { TIER_L } from "../constants/config";

export default function TierLegend({ className }: { className?: string }) {
  return (
    <div className={"legend-row" + (className ? " " + className : "")}>
      {(Object.keys(TIER) as Array<keyof typeof TIER>).map((k) => (
        <span key={k} className="legend-item">
          <span className="legend-dot" style={{ background: TIER[k].bg }} />
          <span className="fs-10" style={{ color: TIER[k].c }}>{TIER_L[k]}</span>
        </span>
      ))}
    </div>
  );
}
