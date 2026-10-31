/**
 * Bolinhas de cor dos tees no cabeçalho dos cartões de eclético (vista
 * «Ecléticos» e eclético por campo): a escolhida leva um anel, as outras
 * ficam esbatidas. O nome do tee e os números vão no tooltip.
 */
import { getTeeHex } from "../utils/teeColors";

export interface TeeDot { key: string; name: string; title: string }

export default function TeeDots({ tees, active, onSelect }: {
  tees: TeeDot[]; active: string | undefined; onSelect: (key: string) => void;
}) {
  return (
    <span className="u-ml-auto u-d-inline-flex u-gap-5px u-ai-center">
      {tees.map(x => {
        const sel = x.key === active;
        return (
          <button key={x.key} type="button" onClick={() => onSelect(x.key)}
            title={x.title} aria-label={x.name} aria-pressed={sel}
            style={{ padding: 0, cursor: "pointer", width: 14, height: 14, borderRadius: "50%",
              background: getTeeHex(x.name), border: "1px solid var(--border)",
              boxShadow: sel ? "0 0 0 2px var(--bg-card, #fff), 0 0 0 3.5px var(--text-2)" : "none",
              opacity: sel ? 1 : 0.55 }} />
        );
      })}
    </span>
  );
}
