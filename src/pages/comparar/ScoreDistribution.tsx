import { firstName } from "../../utils/format";
import type { Slot, AggStats } from "./types";
import { COLORS } from "./types";

export default function ScoreDistribution({ slots, allAgg }: { slots: Slot[]; allAgg: (AggStats | null)[] }) {
  const loaded = slots.map((s, i) => ({ s, agg: allAgg[i], i })).filter(x => x.agg && x.agg.scoreDist.total > 0);
  if (loaded.length < 2) return null;

  const cats = [
    { key: "eagle" as const, label: "Eagle", emoji: "🦅" },
    { key: "birdie" as const, label: "Birdie", emoji: "🐦" },
    { key: "par" as const, label: "Par", emoji: "✅" },
    { key: "bogey" as const, label: "Bogey", emoji: "🟡" },
    { key: "double" as const, label: "Double+", emoji: "🔴" },
    { key: "triple" as const, label: "Triple+", emoji: "⛔" },
  ];

  return (
    <div className="card p-16">
      <div className="h-md">Distribuição de Scores <span className="muted fs-11 fw-400">(apenas torneios)</span></div>
      <div className="d-flex flex-col gap-12 mt-8">
        {cats.map(cat => {
          const vals = loaded.map(x => { const d = x.agg!.scoreDist; return d.total > 0 ? (d[cat.key] / d.total * 100) : 0; });
          const maxVal = Math.max(...vals, 1);
          return (
            <div key={cat.key}>
              <div className="d-flex items-center gap-8-mb4"><span className="cmp-stat-label">{cat.emoji} {cat.label}</span></div>
              <div className="d-flex flex-col gap-3">
                {loaded.map(x => {
                  const v = vals[x.i];
                  const barW = Math.max(2, (v / maxVal) * 100);
                  return (
                    <div key={x.i} className="d-flex items-center gap-8">
                      <span className="fs-11 ta-right fw-600 shrink-0" style={{ width: 60, color: COLORS[x.i] }}>{firstName(x.s.player.name)}</span>
                      <div className="cmp-distrib-track">
                        <div style={{ width: `${barW}%`, height: "100%", background: COLORS[x.i], borderRadius: "var(--radius-sm)", opacity: 0.75 }} />
                      </div>
                      <span className="ta-right fw-700 c-text-2 fs-11 mono" style={{ width: 46 }}>{v.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
