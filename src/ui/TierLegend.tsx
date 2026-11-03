/**
 * TierLegend — legenda dos níveis (Elite · Forte · Sólido · Em Desenv. ·
 * Iniciante) com o ponto de cor, a mesma nos Rivais e na Tabela Global.
 */
import { TIER } from "../data/rivalData";
import { TIER_L } from "../constants/config";
import { Tint } from "./DataStyle";

export default function TierLegend({ className }: { className?: string }) {
  return (
    <div className={"legend-row" + (className ? " " + className : "")}>
      {(Object.keys(TIER) as Array<keyof typeof TIER>).map((k) => (
        <span key={k} className="legend-item">
          <Tint className="legend-dot" bg={TIER[k].bg} />
          <Tint className="fs-10" fg={TIER[k].c}>{TIER_L[k]}</Tint>
        </span>
      ))}
    </div>
  );
}
