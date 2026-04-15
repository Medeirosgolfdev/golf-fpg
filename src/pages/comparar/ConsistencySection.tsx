import { firstName } from "../../utils/format";
import { sc3 } from "../../utils/scoreDisplay";
import type { Slot, AggStats } from "./types";
import { COLORS, COLORS_LIGHT } from "./types";

export default function ConsistencySection({ slots, allAgg }: { slots: Slot[]; allAgg: (AggStats | null)[] }) {
  const loaded = slots.map((s, i) => ({ s, agg: allAgg[i], i })).filter(x => x.agg);
  if (loaded.length < 2) return null;

  return (
    <div className="card">
      <div className="h-md mb-12">📐 Consistência</div>

      {/* KPIs */}
      <div className="caKpis mb-16">
        {loaded.map(({ s, agg, i }) => {
          if (!agg) return null;
          const stdLabel = agg.grossStdDev != null ? agg.grossStdDev.toFixed(1) : "–";
          const stdColor = agg.grossStdDev == null ? undefined : sc3(agg.grossStdDev, 3, 5.5);
          return (
            <div key={i} className="caKpi" style={{ borderColor: COLORS[i] }}>
              <div className="caKpiVal" style={{ color: stdColor ?? COLORS[i] }}>{stdLabel}</div>
              <div className="caKpiLbl">{firstName(s.player.name)} · σ Gross</div>
              <div className="d-flex flex-wrap gap-8 jc-center mt-4">
                {agg.sdStdDev != null && <span className="fs-10 c-text-3">σ SD: {agg.sdStdDev.toFixed(1)}</span>}
                {agg.longestStreak > 0 && <span className="fs-10 c-text-3">Streak: {agg.longestStreak}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabela de consistência */}
      <div className="scroll-x">
        <table className="dtable-lg fs-12">
          <thead>
            <tr>
              <th>Métrica</th>
              {loaded.map(x => <th key={x.i} className="r" style={{ color: COLORS[x.i] }}>{firstName(x.s.player.name)}</th>)}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "σ Gross (desvio padrão)", key: "grossStdDev" as const, dir: "low" },
              { label: "σ SD (desvio padrão)", key: "sdStdDev" as const, dir: "low" },
              { label: "Intervalo Gross (max − min)", key: null, dir: "low" },
              { label: "Maior sequência crescente", key: "longestStreak" as const, dir: "high" },
              { label: "% dentro de ±3 do avg", key: null, dir: "high" },
            ].map((row, ri) => {
              const vals = loaded.map(({ agg }) => {
                if (!agg) return null;
                if (row.key) return agg[row.key] as number | null;
                if (row.label.includes("Intervalo") && agg.grossSeries.length > 1) {
                  return Math.max(...agg.grossSeries) - Math.min(...agg.grossSeries);
                }
                if (row.label.includes("±3") && agg.grossSeries.length > 0) {
                  const avg = agg.avgGross!;
                  const inRange = agg.grossSeries.filter(g => Math.abs(g - avg) <= 3).length;
                  return inRange / agg.grossSeries.length * 100;
                }
                return null;
              });
              const nums = vals.filter((v): v is number => v != null);
              const best = nums.length >= 2 ? (row.dir === "low" ? Math.min(...nums) : Math.max(...nums)) : null;

              return (
                <tr key={ri}>
                  <td className="fw-600 fs-11">{row.label}</td>
                  {vals.map((v, ci) => {
                    const isBest = v != null && best != null && v === best && nums.filter(n => n === best).length === 1;
                    const formatted = v == null ? "–" : row.label.includes("±3") ? `${v.toFixed(0)}%` : v.toFixed(1);
                    return (
                      <td key={ci} className="r mono" style={{
                        fontWeight: isBest ? 800 : 400,
                        color: isBest ? COLORS[ci] : undefined,
                        background: isBest ? COLORS_LIGHT[ci] : undefined,
                      }}>
                        {formatted}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mini sparklines de dispersão */}
      <div className="mt-14">
        <div className="fs-11 fw-600 c-text-3 mb-8">Dispersão de Gross (torneios)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {loaded.map(({ s, agg, i }) => {
            if (!agg || agg.grossSeries.length < 3) return null;
            const gs = agg.grossSeries;
            const mn = Math.min(...gs), mx = Math.max(...gs), rng = mx - mn || 1;
            const avg = agg.avgGross!;
            const W = 180, H = 50, pad = 8;
            const x = (j: number) => pad + (j / (gs.length - 1)) * (W - pad * 2);
            const y = (v: number) => H - pad - ((v - mn) / rng) * (H - pad * 2);
            return (
              <div key={i} style={{ border: `1px solid ${COLORS[i]}`, borderRadius: "var(--radius)", padding: 8, background: COLORS_LIGHT[i] }}>
                <div className="fs-11 fw-700 mb-4" style={{ color: COLORS[i] }}>{firstName(s.player.name)}</div>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block" }}>
                  {/* avg line */}
                  <line x1={pad} x2={W - pad} y1={y(avg)} y2={y(avg)} stroke={COLORS[i]} strokeWidth={1} strokeDasharray="4,2" opacity={0.4} />
                  {/* points */}
                  {gs.map((g, j) => (
                    <circle key={j} cx={x(j)} cy={y(g)} r={3} fill={COLORS[i]} opacity={0.7}>
                      <title>Ronda {j + 1}: {g}</title>
                    </circle>
                  ))}
                  {/* labels */}
                  <text x={pad} y={H - 2} fontSize={9} fill="var(--text-3)">{mn}</text>
                  <text x={W - pad} y={H - 2} fontSize={9} fill="var(--text-3)" textAnchor="end">{mx}</text>
                  <text x={W / 2} y={y(avg) - 4} fontSize={9} fill={COLORS[i]} textAnchor="middle">avg {avg.toFixed(0)}</text>
                </svg>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
