import React from "react";
import { firstName, fD, fD2 } from "../../utils/format";
import { daysSince } from "../../data/playerStatsTypes";
import type { Slot, AggStats, PlayerStatsDb, PlayerStats } from "./types";
import { COLORS, COLORS_LIGHT } from "./types";

const pct = (v: number) => v.toFixed(0) + "%";

export default function StatsTable({ slots, allAgg, statsDb }: { slots: Slot[]; allAgg: (AggStats | null)[]; statsDb: PlayerStatsDb }) {
  const loaded = slots.map((s, i) => ({ s, agg: allAgg[i], i })).filter(x => x.agg);
  if (loaded.length < 2) return null;

  type Row = { label: string; values: (string | null)[]; best?: "low" | "high"; emoji?: string; section?: string };
  const rows: Row[] = [];
  const val = (fn: (agg: AggStats | null) => string | null) => loaded.map(x => fn(x.agg));
  const pVal = (fn: (ps: PlayerStats | undefined) => string | null) => loaded.map(x => fn(statsDb[x.s.fed]));

  rows.push({ section: "Actividade", label: "Última ronda", emoji: "🕐", values: pVal(ps => { const d = daysSince(ps); if (d == null) return null; if (d <= 1) return "Hoje"; return `${d} dias`; }), best: "low" });
  rows.push({ label: "Rondas 12m", emoji: "📅", values: pVal(ps => ps?.roundsLast12m != null ? String(ps.roundsLast12m) : null), best: "high" });
  rows.push({ label: "Rondas 3m", emoji: "🗓️", values: pVal(ps => ps?.roundsLast3m != null ? String(ps.roundsLast3m) : null), best: "high" });
  rows.push({ label: "Tendência HCP", emoji: "📉", values: pVal(ps => { if (!ps) return null; const arrow = ps.hcpTrend === "up" ? "↗ A melhorar" : ps.hcpTrend === "down" ? "↘ A subir" : "→ Estável"; return ps.hcpDelta3m != null ? `${arrow} (${ps.hcpDelta3m > 0 ? "+" : ""}${ps.hcpDelta3m})` : arrow; }) });
  rows.push({ label: "Forma", emoji: "🔥", values: pVal(ps => { if (!ps?.formAlert) return "Normal"; return ps.formAlert === "hot" ? "🔥 Boa forma" : "❄️ Má forma"; }) });

  rows.push({ section: "Torneios", label: "Rondas Torneio", emoji: "🏟️", values: val((a) => a ? String(a.nRounds) : null), best: "high" });
  rows.push({ label: "Melhor Gross", emoji: "🏆", values: val((a) => a?.bestGross != null ? String(a.bestGross) : null), best: "low" });
  rows.push({ label: "Gross Médio", emoji: "📊", values: val((a) => a?.avgGross != null ? a.avgGross.toFixed(0) : null), best: "low" });
  rows.push({ label: "SD Médio", emoji: "📈", values: val((a) => a?.avgSD != null ? a.avgSD.toFixed(1) : null), best: "low" });
  rows.push({ label: "SD Últimas 5", emoji: "⭐", values: val((a) => a?.last5AvgSD != null ? a.last5AvgSD.toFixed(1) : null), best: "low" });
  rows.push({ label: "SD de Sempre", emoji: "💎", values: val((a) => a?.bestSD != null ? a.bestSD.toFixed(1) : null), best: "low" });

  rows.push({ section: "Análise", label: "Panc. s/ Par/Volta", emoji: "🎯", values: val((a) => a ? fD(a.totalStrokesOverPar) : null), best: "low" });
  rows.push({ label: "Par ou Melhor", emoji: "⛳", values: val((a) => a ? pct(a.parOrBetterPct) : null), best: "high" });
  rows.push({ label: "Dbl+ ou Pior", emoji: "⚠️", values: val((a) => a ? pct(a.dblOrWorsePct) : null), best: "low" });
  rows.push({ label: "Par 3 vs Par", emoji: "🟢", values: val((a) => a?.byPar[3] ? fD2(a.byPar[3].avgVsPar) : null), best: "low" });
  rows.push({ label: "Par 4 vs Par", emoji: "🔵", values: val((a) => a?.byPar[4] ? fD2(a.byPar[4].avgVsPar) : null), best: "low" });
  rows.push({ label: "Par 5 vs Par", emoji: "🟣", values: val((a) => a?.byPar[5] ? fD2(a.byPar[5].avgVsPar) : null), best: "low" });

  const bestIdx = rows.map(r => {
    const nums = r.values.map(v => v != null ? parseFloat(v.replace(/[+%↗↘→a-zA-ZÀ-ú🔥❄️ ()]/g, "")) : null);
    const valid = nums.filter((n): n is number => n != null && !isNaN(n));
    if (valid.length < 2) return -1;
    const target = r.best === "high" ? Math.max(...valid) : Math.min(...valid);
    return nums.indexOf(target);
  });

  return (
    <div className="card p-0 overflow-hidden">
      <div className="h-md p-14" style={{ paddingBottom: 0 }}>Comparação Detalhada <span className="muted fs-11 fw-400">(apenas torneios)</span></div>
      <div className="scroll-x mt-8">
        <table className="dtable-lg fs-13">
          <thead>
            <tr>
              <th style={{ minWidth: 140 }}>Métrica</th>
              {loaded.map(x => <th key={x.i} className="r" style={{ color: COLORS[x.i], minWidth: 80 }}>{firstName(x.s.player.name)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <React.Fragment key={ri}>
                {r.section && (
                  <tr>
                    <td colSpan={loaded.length + 1} className="fw-700 fs-11 c-text-3 uppercase" style={{ paddingTop: ri > 0 ? 12 : 6, paddingBottom: 2, borderBottom: "1px solid var(--border-light)", letterSpacing: "0.05em" }}>
                      {r.section}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="fw-600 fs-12"><span style={{ marginRight: 6 }}>{r.emoji}</span>{r.label}</td>
                  {loaded.map((x, ci) => {
                    const v = r.values[ci];
                    const isBest = bestIdx[ri] === ci;
                    return (
                      <td key={ci} className="r" style={{ fontWeight: isBest ? 800 : 400, color: isBest ? COLORS[x.i] : undefined, fontFamily: "'JetBrains Mono', monospace", background: isBest ? COLORS_LIGHT[x.i] : undefined }}>
                        {v ?? "–"}
                      </td>
                    );
                  })}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
