/**
 * Bolinhas de cor dos tees no cabeçalho dos cartões de eclético (vista
 * «Ecléticos» e eclético por campo): a escolhida leva um anel, as outras
 * ficam esbatidas. O nome do tee e os números vão no tooltip.
 */
import { getTeeHex } from "../utils/teeColors";
import { Tint } from "./DataStyle";

export interface TeeDot { key: string; name: string; title: string }

export default function TeeDots({ tees, active, onSelect }: {
  tees: TeeDot[]; active: string | undefined; onSelect: (key: string) => void;
}) {
  return (
    <span className="u-ml-auto u-d-inline-flex u-gap-4px u-ai-center">
      {tees.map(x => {
        const sel = x.key === active;
        return (
          <button key={x.key} type="button" onClick={() => onSelect(x.key)}
            title={x.title} aria-label={x.name} aria-pressed={sel}
            className={sel ? "tee-dot-btn is-sel" : "tee-dot-btn"}>
            <Tint className="tee-dot-btn-cor" bg={getTeeHex(x.name)} />
          </button>
        );
      })}
    </span>
  );
}
