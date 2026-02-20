/**
 * CompararPage.tsx — Comparação entre jogadores (v2)
 *
 * Melhorias:
 *   1. Radar chart — perfil comparativo visual
 *   2. Tabela comparativa lado a lado com highlight do melhor
 *   3. Distribuição de scores (eagle→triple) com barras
 *   4. Buraco a buraco (gráfico + tabela)
 *   5. Head-to-Head com barra de vitórias
 *   6. Evolução HCP com delta no período
 *
 * Classes CSS do design system existente:
 *   .holeAnalysis .haTitle .haSubTitle
 *   .haDiag .haDiagCard .haDiagIcon .haDiagBody .haDiagVal .haDiagLbl
 *   .courseAnalysis .caTitle .caKpis .caKpi .caKpiVal .caKpiLbl
 *   .haParGrid .haParCard .haParHead .haParAvg .haParStat
 *   .pa-table-wrap .pa-table .roundRow
 *   .jog-pill .chip .muted .input .select
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Player, PlayersDb } from "../data/types";
import {
  loadPlayerData, type PlayerPageData, type RoundData,
  type HoleStatsData,
} from "../data/playerDataLoader";
import { loadPlayerStats, type PlayerStatsDb } from "../data/playerStatsTypes";
import { norm } from "../utils/format";
import { clubShort, hcpDisplay } from "../utils/playerUtils";
import { deepFixMojibake } from "../utils/fixEncoding";

const COLORS = ["#16a34a", "#2563eb", "#dc2626", "#d97706"];
const COLORS_LIGHT = ["#dcfce7", "#dbeafe", "#fee2e2", "#fef3c7"];

interface Slot {
  fed: string; player: Player;
  data: PlayerPageData | null; loading: boolean; error: string | null;
}

/* ─── Helpers ─── */

interface AggStats {
  totalStrokesLost: number;
  parOrBetterPct: number;
  dblOrWorsePct: number;
  byPar: Record<number, { avgVsPar: number; slPerRound: number }>;
  nRounds: number;
  scoreDist: { eagle: number; birdie: number; par: number; bogey: number; double: number; triple: number; total: number };
  avgGross: number | null;
  bestGross: number | null;
  f9sl: number | null;
  b9sl: number | null;
}

function aggregateStats(data: PlayerPageData): AggStats | null {
  let totalN = 0, totalSL = 0, totalHoles = 0, nRounds = 0;
  let grossSum = 0, grossN = 0, bestGross: number | null = null;
  let f9slSum = 0, b9slSum = 0, f9n = 0, b9n = 0;
  const distAcc = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0, total: 0 };
  const parAgg: Record<number, { sumVsPar: number; sumSL: number; count: number }> = {};
  for (const ck in data.HOLE_STATS) for (const tk in data.HOLE_STATS[ck]) {
    const hs = data.HOLE_STATS[ck][tk];
    if (hs.holeCount !== 18 || hs.nRounds < 2) continue;
    nRounds += hs.nRounds; totalN++; totalSL += hs.totalStrokesLost;
    if (hs.avgGross != null) { grossSum += hs.avgGross * hs.nRounds; grossN += hs.nRounds; }
    if (hs.bestRound) { if (bestGross === null || hs.bestRound.gross < bestGross) bestGross = hs.bestRound.gross; }
    const td = hs.totalDist;
    if (td) {
      distAcc.eagle += td.eagle; distAcc.birdie += td.birdie; distAcc.par += td.par;
      distAcc.bogey += td.bogey; distAcc.double += td.double; distAcc.triple += td.triple;
      distAcc.total += td.total; totalHoles += td.total;
    }
    if (hs.f9b9) {
      f9slSum += hs.f9b9.f9.strokesLost * hs.nRounds; f9n += hs.nRounds;
      b9slSum += hs.f9b9.b9.strokesLost * hs.nRounds; b9n += hs.nRounds;
    }
    for (const pt of [3, 4, 5]) {
      const g = hs.byParType[pt]; if (!g || g.totalN === 0) continue;
      if (!parAgg[pt]) parAgg[pt] = { sumVsPar: 0, sumSL: 0, count: 0 };
      parAgg[pt].sumVsPar += (g.avgVsPar ?? 0) * g.totalN;
      parAgg[pt].sumSL += g.strokesLostPerRound * hs.nRounds;
      parAgg[pt].count += hs.nRounds;
    }
  }
  if (totalN === 0) return null;
  const byPar: Record<number, { avgVsPar: number; slPerRound: number }> = {};
  for (const pt of [3, 4, 5]) {
    const a = parAgg[pt]; if (!a?.count) continue;
    byPar[pt] = { avgVsPar: a.sumVsPar / a.count, slPerRound: a.sumSL / a.count };
  }
  const pob = totalHoles > 0 ? (distAcc.eagle + distAcc.birdie + distAcc.par) / totalHoles * 100 : 0;
  const dow = totalHoles > 0 ? (distAcc.double + distAcc.triple) / totalHoles * 100 : 0;
  return {
    totalStrokesLost: totalSL / totalN, parOrBetterPct: pob, dblOrWorsePct: dow,
    byPar, nRounds, scoreDist: distAcc,
    avgGross: grossN > 0 ? grossSum / grossN : null,
    bestGross,
    f9sl: f9n > 0 ? f9slSum / f9n : null,
    b9sl: b9n > 0 ? b9slSum / b9n : null,
  };
}

function shortName(name: string) { return name.split(" ").slice(0, 2).join(" "); }
function firstName(name: string) { return name.split(" ")[0]; }
const fD = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(1);
const fD2 = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);
const pct = (v: number) => v.toFixed(0) + "%";

/* ═══════════════════ Search + Chips ═══════════════════ */

function PlayerSearch({ players, slots, onAdd, onRemove }: {
  players: PlayersDb; slots: Slot[];
  onAdd: (fed: string) => void; onRemove: (fed: string) => void;
}) {
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedFeds = new Set(slots.map(s => s.fed));
  const results = useMemo(() => {
    if (!q.trim()) return [];
    const words = norm(q).split(/\s+/).filter(Boolean);
    return Object.entries(players).filter(([fed, p]) => {
      if (selectedFeds.has(fed)) return false;
      return words.every(w => norm([p.name, clubShort(p), p.escalao, fed, p.region].join(" ")).includes(w));
    }).slice(0, 8).map(([fed, p]) => ({ fed, ...p }));
  }, [q, players, selectedFeds]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }} ref={ref}>
        <div style={{ position: "relative", flex: 1 }}>
          <input className="input" value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => q.trim() && setOpen(true)}
            placeholder="Pesquisar jogador…" disabled={slots.length >= 4}
            style={{ width: "100%", fontSize: 14, padding: "10px 14px" }} />
          {open && results.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-lg)", maxHeight: 280, overflowY: "auto" }}>
              {results.map(p => (
                <button key={p.fed} className="course-item" onClick={() => { onAdd(p.fed); setQ(""); setOpen(false); }}>
                  <div className="course-item-name">{p.name}</div>
                  <div className="course-item-meta">{clubShort(p)} · {p.escalao} · HCP {hcpDisplay(p.hcp)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="chip" style={{ fontSize: 13, padding: "6px 12px" }}>{slots.length}/4</span>
      </div>
      {slots.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {slots.map((s, i) => (
            <span key={s.fed} className="jog-pill" style={{
              borderColor: COLORS[i], background: COLORS_LIGHT[i],
              display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", fontSize: 13, borderRadius: 20,
            }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: COLORS[i], flexShrink: 0 }} />
              <b>{shortName(s.player.name)}</b>
              <span className="muted" style={{ fontSize: 11 }}>HCP {hcpDisplay(s.player.hcp)}</span>
              {s.loading && <span style={{ fontSize: 11 }}>⏳</span>}
              <button onClick={() => onRemove(s.fed)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: "0 2px", fontSize: 15, lineHeight: 1 }} title="Remover">✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ § 1 RADAR CHART ═══════════════════ */

function RadarChart({ slots, allAgg }: { slots: Slot[]; allAgg: (AggStats | null)[] }) {
  const loaded = slots.map((s, i) => ({ s, agg: allAgg[i], i })).filter(x => x.agg);
  if (loaded.length < 2) return null;

  type Axis = { label: string; getValue: (a: AggStats) => number | null; invert?: boolean };
  const axes: Axis[] = [
    { label: "Par 3", getValue: a => a.byPar[3]?.avgVsPar ?? null, invert: true },
    { label: "Par 4", getValue: a => a.byPar[4]?.avgVsPar ?? null, invert: true },
    { label: "Par 5", getValue: a => a.byPar[5]?.avgVsPar ?? null, invert: true },
    { label: "Par≤ %", getValue: a => a.parOrBetterPct },
    { label: "Panc. Perd.", getValue: a => a.totalStrokesLost, invert: true },
    { label: "Dbl+ %", getValue: a => a.dblOrWorsePct, invert: true },
  ];

  const axisData = axes.map(ax => {
    const vals = loaded.map(x => ax.getValue(x.agg!)).filter((v): v is number => v != null);
    if (vals.length === 0) return { ...ax, min: 0, max: 1, range: 1 };
    const min = Math.min(...vals), max = Math.max(...vals);
    return { ...ax, min, max, range: max - min || 1 };
  });

  const CX = 150, CY = 140, R = 110;
  const N = axes.length;
  const angleStep = (2 * Math.PI) / N;
  const startAngle = -Math.PI / 2;

  const pointOnAxis = (axIdx: number, fraction: number) => {
    const angle = startAngle + axIdx * angleStep;
    const r = R * (0.15 + 0.85 * fraction);
    return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
  };

  return (
    <div className="courseAnalysis" style={{ padding: 16 }}>
      <div className="caTitle">Perfil Comparativo</div>
      <svg viewBox="0 0 300 290" style={{ width: "100%", maxWidth: 420, display: "block", margin: "0 auto" }}>
        {[0.25, 0.5, 0.75, 1].map(frac => (
          <polygon key={frac}
            points={Array.from({ length: N }, (_, i) => { const p = pointOnAxis(i, frac); return `${p.x},${p.y}`; }).join(" ")}
            fill="none" stroke="#d5dac9" strokeWidth={frac === 1 ? 1 : 0.5} opacity={0.6}
          />
        ))}
        {axes.map((_, i) => {
          const p = pointOnAxis(i, 1);
          return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="#d5dac9" strokeWidth={0.5} />;
        })}
        {loaded.map(({ s, agg, i: si }) => {
          const pts = axisData.map((ad, ai) => {
            const raw = ad.getValue(agg!);
            if (raw == null) return pointOnAxis(ai, 0.5);
            let norm01 = (raw - ad.min) / (ad.range || 1);
            if (ad.invert) norm01 = 1 - norm01;
            norm01 = Math.max(0, Math.min(1, norm01));
            return pointOnAxis(ai, norm01);
          });
          const polyStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          return (
            <g key={si}>
              <polygon points={polyStr} fill={COLORS[si]} fillOpacity={0.12} stroke={COLORS[si]} strokeWidth={2} strokeLinejoin="round" />
              {pts.map((p, j) => (
                <circle key={j} cx={p.x} cy={p.y} r={3.5} fill={COLORS[si]} stroke="#fff" strokeWidth={1}>
                  <title>{shortName(s.player.name)}: {axes[j].label}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {axes.map((ax, i) => {
          const p = pointOnAxis(i, 1.18);
          return (
            <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
              fontSize={10} fontWeight={600} fill="#4a5940">{ax.label}</text>
          );
        })}
      </svg>
    </div>
  );
}

/* ═══════════════════ § 2 TABELA COMPARATIVA ═══════════════════ */

function StatsTable({ slots, allAgg, stats }: { slots: Slot[]; allAgg: (AggStats | null)[]; stats: PlayerStatsDb }) {
  const loaded = slots.map((s, i) => ({ s, agg: allAgg[i], st: stats[s.fed], i })).filter(x => x.agg || x.st);
  if (loaded.length < 2) return null;

  type Row = { label: string; values: (string | null)[]; best?: "low" | "high"; emoji?: string };
  const rows: Row[] = [];
  const val = (fn: (agg: AggStats | null, st: typeof loaded[0]["st"]) => string | null) =>
    loaded.map(x => fn(x.agg, x.st));

  rows.push({ label: "HCP Atual", emoji: "🏌️", values: val((_, st) => st?.currentHcp != null ? st.currentHcp.toFixed(1) : null), best: "low" });
  rows.push({ label: "Melhor Gross", emoji: "🏆", values: val((a, st) => {
    const v = a?.bestGross ?? st?.bestGross; return v != null ? String(v) : null;
  }), best: "low" });
  rows.push({ label: "Gross Médio", emoji: "📊", values: val((a, st) => {
    const v = a?.avgGross ?? st?.avgGross5; return v != null ? v.toFixed(0) : null;
  }), best: "low" });
  rows.push({ label: "SD Best 8/20", emoji: "📈", values: val((_, st) => st?.avgSD8 != null ? st.avgSD8.toFixed(1) : null), best: "low" });
  rows.push({ label: "Panc. Perdidas/Volta", emoji: "🎯", values: val((a) => a ? fD(a.totalStrokesLost) : null), best: "low" });
  rows.push({ label: "Par ou Melhor", emoji: "⛳", values: val((a) => a ? pct(a.parOrBetterPct) : null), best: "high" });
  rows.push({ label: "Dbl+ ou Pior", emoji: "⚠️", values: val((a) => a ? pct(a.dblOrWorsePct) : null), best: "low" });
  rows.push({ label: "Par 3 vs Par", emoji: "🟢", values: val((a) => a?.byPar[3] ? fD2(a.byPar[3].avgVsPar) : null), best: "low" });
  rows.push({ label: "Par 4 vs Par", emoji: "🔵", values: val((a) => a?.byPar[4] ? fD2(a.byPar[4].avgVsPar) : null), best: "low" });
  rows.push({ label: "Par 5 vs Par", emoji: "🟣", values: val((a) => a?.byPar[5] ? fD2(a.byPar[5].avgVsPar) : null), best: "low" });
  rows.push({ label: "Voltas 12m", emoji: "📅", values: val((_, st) => st?.roundsLast12m != null ? String(st.roundsLast12m) : null), best: "high" });
  rows.push({ label: "Δ HCP 3m", emoji: "📉", values: val((_, st) => st?.hcpDelta3m != null ? ((st.hcpDelta3m > 0 ? "+" : "") + st.hcpDelta3m.toFixed(1)) : null), best: "low" });

  const bestIdx = rows.map(r => {
    const nums = r.values.map(v => v != null ? parseFloat(v.replace(/[+%]/g, "")) : null);
    const valid = nums.filter((n): n is number => n != null && !isNaN(n));
    if (valid.length < 2) return -1;
    const target = r.best === "high" ? Math.max(...valid) : Math.min(...valid);
    return nums.indexOf(target);
  });

  return (
    <div className="courseAnalysis" style={{ padding: 0, overflow: "hidden" }}>
      <div className="caTitle" style={{ padding: "14px 16px 0" }}>Comparação Detalhada</div>
      <div className="pa-table-wrap" style={{ marginTop: 8 }}>
        <table className="pa-table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 140 }}>Métrica</th>
              {loaded.map(x => (
                <th key={x.i} className="r" style={{ color: COLORS[x.i], minWidth: 80 }}>
                  {firstName(x.s.player.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                <td style={{ fontWeight: 600, fontSize: 12 }}>
                  <span style={{ marginRight: 6 }}>{r.emoji}</span>{r.label}
                </td>
                {loaded.map((x, ci) => {
                  const v = r.values[ci];
                  const isBest = bestIdx[ri] === ci;
                  return (
                    <td key={ci} className="r" style={{
                      fontWeight: isBest ? 800 : 400,
                      color: isBest ? COLORS[x.i] : undefined,
                      fontFamily: "'JetBrains Mono', monospace",
                      background: isBest ? COLORS_LIGHT[x.i] : undefined,
                    }}>
                      {v ?? "–"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════ § 3 DISTRIBUIÇÃO DE SCORES ═══════════════════ */

function ScoreDistribution({ slots, allAgg }: { slots: Slot[]; allAgg: (AggStats | null)[] }) {
  const loaded = slots.map((s, i) => ({ s, agg: allAgg[i], i })).filter(x => x.agg && x.agg.scoreDist.total > 0);
  if (loaded.length < 2) return null;

  const cats: { key: keyof AggStats["scoreDist"]; label: string; emoji: string }[] = [
    { key: "eagle", label: "Eagle", emoji: "🦅" },
    { key: "birdie", label: "Birdie", emoji: "🐦" },
    { key: "par", label: "Par", emoji: "✅" },
    { key: "bogey", label: "Bogey", emoji: "🟡" },
    { key: "double", label: "Double+", emoji: "🔴" },
    { key: "triple", label: "Triple+", emoji: "⛔" },
  ];

  return (
    <div className="courseAnalysis" style={{ padding: 16 }}>
      <div className="caTitle">Distribuição de Scores</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
        {cats.filter(c => c.key !== "total").map(cat => {
          const vals = loaded.map(x => {
            const d = x.agg!.scoreDist;
            return d.total > 0 ? ((d[cat.key] as number) / d.total * 100) : 0;
          });
          const maxVal = Math.max(...vals, 1);
          return (
            <div key={cat.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12, width: 75, fontWeight: 600, color: "#4a5940" }}>
                  {cat.emoji} {cat.label}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {loaded.map(x => {
                  const d = x.agg!.scoreDist;
                  const v = d.total > 0 ? ((d[cat.key] as number) / d.total * 100) : 0;
                  const barW = Math.max(2, (v / maxVal) * 100);
                  return (
                    <div key={x.i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, width: 60, textAlign: "right", color: COLORS[x.i], fontWeight: 600, flexShrink: 0 }}>
                        {firstName(x.s.player.name)}
                      </span>
                      <div style={{ flex: 1, background: "#f0f2ec", borderRadius: 4, height: 18, overflow: "hidden" }}>
                        <div style={{
                          width: `${barW}%`, height: "100%", background: COLORS[x.i],
                          borderRadius: 4, opacity: 0.75,
                        }} />
                      </div>
                      <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, width: 46, textAlign: "right", color: "#4a5940" }}>
                        {v.toFixed(1)}%
                      </span>
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

/* ═══════════════════ § 4 BURACO A BURACO ═══════════════════ */

function HoleByHoleSection({ slots }: { slots: Slot[] }) {
  const loaded = slots.filter(s => s.data);
  if (loaded.length < 2) return null;

  const combos = useMemo(() => {
    const maps = loaded.map(s => {
      const m = new Map<string, { label: string; nR: number; stats: HoleStatsData }>();
      for (const ck in s.data!.HOLE_STATS) for (const tk in s.data!.HOLE_STATS[ck]) {
        const hs = s.data!.HOLE_STATS[ck][tk];
        if (hs.holeCount !== 18 || hs.nRounds < 2) continue;
        m.set(ck + "|" + tk, { label: ck.replace(/_/g, " ") + " — " + hs.teeName, nR: hs.nRounds, stats: hs });
      }
      return m;
    });
    const allKeys = new Set<string>();
    maps.forEach(m => m.forEach((_, k) => allKeys.add(k)));
    const result: { label: string; nRounds: number[]; stats: (HoleStatsData | null)[] }[] = [];
    for (const k of allKeys) {
      const entries = maps.map(m => m.get(k) || null);
      if (entries.filter(Boolean).length < 2) continue;
      const first = entries.find(Boolean)!;
      result.push({ label: first.label, nRounds: entries.map(e => e?.nR ?? 0), stats: entries.map(e => e?.stats ?? null) });
    }
    result.sort((a, b) => b.nRounds.reduce((s, v) => s + v, 0) - a.nRounds.reduce((s, v) => s + v, 0));
    return result;
  }, [loaded]);

  const [sel, setSel] = useState(0);
  if (combos.length === 0) return null;
  const combo = combos[Math.min(sel, combos.length - 1)];
  const refStats = combo.stats.find(Boolean)!;

  const W = 780, H = 200, PAD = { top: 20, right: 10, bottom: 40, left: 40 };
  const holeW = (W - PAD.left - PAD.right) / refStats.holes.length;
  const allAvgs: number[] = [];
  combo.stats.forEach(st => { if (st) st.holes.forEach(h => { if (h.avg != null && h.par != null) allAvgs.push(h.avg - h.par); }); });
  const minV = Math.min(-0.5, ...allAvgs), maxV = Math.max(1, ...allAvgs), range = maxV - minV;
  const yPos = (v: number) => PAD.top + ((maxV - v) / range) * (H - PAD.top - PAD.bottom);

  return (
    <div className="courseAnalysis">
      <div className="caTitle" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        Buraco a Buraco
        <select className="select" value={sel} onChange={e => setSel(Number(e.target.value))}>
          {combos.map((c, i) => <option key={i} value={i}>{c.label} ({c.nRounds.filter(n => n > 0).join("/")} rondas)</option>)}
        </select>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxHeight: 230, marginTop: 8 }}>
        <line x1={PAD.left} x2={W - PAD.right} y1={yPos(0)} y2={yPos(0)} stroke="#16a34a" strokeWidth={1} strokeDasharray="4,3" opacity={0.5} />
        {[-0.5, 0.5, 1.0].filter(v => v >= minV && v <= maxV).map(v => (
          <g key={v}><line x1={PAD.left} x2={W - PAD.right} y1={yPos(v)} y2={yPos(v)} stroke="#e2e8f0" strokeWidth={0.5} />
          <text x={PAD.left - 4} y={yPos(v) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">{v > 0 ? "+" : ""}{v.toFixed(1)}</text></g>
        ))}
        {refStats.holes.map((h, i) => (
          <React.Fragment key={i}>
            <text x={PAD.left + i * holeW + holeW / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--text)">{i + 1}</text>
            <text x={PAD.left + i * holeW + holeW / 2} y={H - 22} textAnchor="middle" fontSize={8} fill="var(--text-3)">P{h.par}</text>
          </React.Fragment>
        ))}
        {loaded.map((s, si) => {
          const st = combo.stats[si]; if (!st) return null;
          const pts = st.holes.filter(h => h.avg != null && h.par != null).map(h => ({ x: PAD.left + (h.h - 1) * holeW + holeW / 2, y: yPos(h.avg! - h.par!), val: h.avg! - h.par!, hole: h.h }));
          if (pts.length < 2) return null;
          const d = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ");
          return (<g key={si}>
            <path d={`M ${d}`} fill="none" stroke={COLORS[si]} strokeWidth={2.5} opacity={0.8} strokeLinejoin="round" />
            {pts.map((p, j) => (<circle key={j} cx={p.x} cy={p.y} r={3.5} fill={COLORS[si]} stroke="#fff" strokeWidth={1}><title>{shortName(s.player.name)}: Bur. {p.hole} {fD2(p.val)} vs par</title></circle>))}
          </g>);
        })}
      </svg>

      <div className="caKpis" style={{ marginTop: 6 }}>
        {loaded.map((s, i) => {
          const st = combo.stats[i];
          return (
            <div key={i} className="caKpi" style={{ borderColor: COLORS[i] }}>
              <div className="caKpiVal" style={{ color: COLORS[i] }}>{st ? st.avgGross?.toFixed(0) ?? "–" : "–"}</div>
              <div className="caKpiLbl">{shortName(s.player.name)} · {st?.nRounds ?? 0} rondas</div>
            </div>
          );
        })}
      </div>

      <div className="pa-table-wrap" style={{ marginTop: 8 }}>
        <table className="pa-table">
          <thead><tr>
            <th className="r">H</th><th className="r">Par</th>
            {loaded.map((s, i) => (<React.Fragment key={s.fed}>
              <th className="r" style={{ color: COLORS[i] }}>{firstName(s.player.name)} Avg</th>
              <th className="r" style={{ color: COLORS[i] }}>SL</th>
            </React.Fragment>))}
          </tr></thead>
          <tbody>
            {refStats.holes.map((_, hi) => {
              const entries = loaded.map((_, si) => combo.stats[si]?.holes[hi] ?? null);
              const par = entries.map(e => e?.par ?? 0).find(p => p > 0) || 0;
              const avgs = entries.map(e => e?.avg != null && e?.par != null ? e.avg - e.par : null);
              const bestAvg = Math.min(...avgs.filter((v): v is number => v != null));
              return (<tr key={hi}>
                <td className="r"><b>{hi + 1}</b></td>
                <td className="r" style={{ color: "var(--text-3)" }}>{par}</td>
                {entries.map((e, i) => {
                  const diff = e?.avg != null && e?.par != null ? e.avg - e.par : null;
                  const sl = e?.strokesLost ?? null;
                  const isBest = diff != null && diff === bestAvg && avgs.filter(v => v === bestAvg).length === 1;
                  const diffCol = diff == null ? undefined : diff <= 0 ? "#16a34a" : diff <= 0.3 ? "#d97706" : "#dc2626";
                  return (<React.Fragment key={i}>
                    <td className="r" style={{ color: diffCol }}>{diff != null ? (isBest ? <b>{fD2(diff)}</b> : fD2(diff)) : "–"}</td>
                    <td className="r" style={{ color: sl != null && sl > 0.2 ? "#dc2626" : "var(--text-3)" }}>{sl != null ? fD2(sl) : "–"}</td>
                  </React.Fragment>);
                })}
              </tr>);
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════ § 5 HEAD-TO-HEAD ═══════════════════ */

function HeadToHeadSection({ slots }: { slots: Slot[] }) {
  const loaded = slots.filter(s => s.data);
  if (loaded.length < 2) return null;

  const matches = useMemo(() => {
    const eventMap = new Map<string, Map<number, RoundData & { course: string }>>();
    loaded.forEach((s, si) => {
      for (const c of s.data!.DATA) for (const r of c.rounds) {
        if (!r.eventName || r.eventName === "EDS" || r.eventName === "Indiv" || r.holeCount !== 18) continue;
        const key = norm(r.eventName) + "|" + r.date;
        if (!eventMap.has(key)) eventMap.set(key, new Map());
        eventMap.get(key)!.set(si, { ...r, course: c.course });
      }
    });
    type Match = { event: string; date: string; dateSort: number; results: { idx: number; gross: number }[] };
    const res: Match[] = [];
    for (const [, m] of eventMap) {
      if (m.size < 2) continue;
      const first = [...m.values()][0];
      const results = [...m.entries()].map(([idx, r]) => ({ idx, gross: Number(r.gross) })).filter(r => r.gross > 50);
      if (results.length < 2) continue;
      results.sort((a, b) => a.gross - b.gross);
      res.push({ event: first.eventName, date: first.date, dateSort: first.dateSort, results });
    }
    res.sort((a, b) => b.dateSort - a.dateSort);
    return res;
  }, [loaded]);

  if (matches.length === 0) return null;
  const wins = loaded.map(() => 0);
  matches.forEach(m => { wins[m.results[0].idx]++; });
  const totalMatches = matches.length;

  return (
    <div className="courseAnalysis">
      <div className="caTitle">Head-to-Head ({totalMatches} torneios comuns)</div>

      {/* Win progress bar */}
      <div style={{ display: "flex", height: 32, borderRadius: 8, overflow: "hidden", marginBottom: 12, border: "1px solid #d5dac9" }}>
        {loaded.map((s, i) => {
          const w = totalMatches > 0 ? (wins[i] / totalMatches * 100) : 0;
          if (w === 0) return null;
          return (
            <div key={i} style={{
              width: `${w}%`, background: COLORS[i], display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 800, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
            }}>
              {wins[i] > 0 && `${firstName(s.player.name)} ${wins[i]}`}
            </div>
          );
        })}
        {loaded.length === 2 && totalMatches - wins[0] - wins[1] > 0 && (
          <div style={{
            width: `${(totalMatches - wins[0] - wins[1]) / totalMatches * 100}%`,
            background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center",
            color: "#64748b", fontWeight: 700, fontSize: 12,
          }}>
            {totalMatches - wins[0] - wins[1]}
          </div>
        )}
      </div>

      <div className="caKpis">
        {loaded.map((s, i) => (
          <div key={i} className="caKpi" style={{ borderColor: wins[i] === Math.max(...wins) ? COLORS[i] : undefined }}>
            <div className="caKpiVal" style={{ color: COLORS[i] }}>{wins[i]}</div>
            <div className="caKpiLbl">{firstName(s.player.name)} vitórias</div>
          </div>
        ))}
        {loaded.length === 2 && (
          <div className="caKpi">
            <div className="caKpiVal">{totalMatches - wins[0] - wins[1]}</div>
            <div className="caKpiLbl">Empates</div>
          </div>
        )}
      </div>

      <div className="pa-table-wrap" style={{ maxHeight: 340, overflowY: "auto" }}>
        <table className="pa-table">
          <thead><tr>
            <th>Data</th><th>Torneio</th>
            {loaded.map((s, i) => <th key={i} className="r" style={{ color: COLORS[i] }}>{firstName(s.player.name)}</th>)}
            <th className="r">Δ</th>
          </tr></thead>
          <tbody>
            {matches.slice(0, 30).map((m, mi) => {
              const bestGross = Math.min(...m.results.map(r => r.gross));
              return (<tr key={mi} className="roundRow">
                <td style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>{m.date}</td>
                <td>{m.event}</td>
                {loaded.map((_, i) => {
                  const r = m.results.find(r => r.idx === i);
                  if (!r) return <td key={i} className="r">–</td>;
                  return <td key={i} className="r" style={{ color: r.gross === bestGross ? COLORS[i] : undefined, fontWeight: r.gross === bestGross ? 800 : 400 }}>{r.gross}</td>;
                })}
                <td className="r" style={{ color: "var(--text-3)" }}>
                  {loaded.length === 2 ? (() => {
                    const r0 = m.results.find(r => r.idx === 0), r1 = m.results.find(r => r.idx === 1);
                    if (!r0 || !r1) return "–"; const diff = r0.gross - r1.gross;
                    return diff === 0 ? "=" : diff < 0 ? `${firstName(loaded[0].player.name)} ${diff}` : `${firstName(loaded[1].player.name)} ${-diff}`;
                  })() : ""}
                </td>
              </tr>);
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════ § 6 EVOLUÇÃO HCP ═══════════════════ */

function HcpEvolutionSection({ slots }: { slots: Slot[] }) {
  const [period, setPeriod] = useState(12);
  const loaded = slots.filter(s => s.data && s.data.CROSS_DATA[s.fed]?.hcpHistory?.length >= 2);
  if (loaded.length < 2) return null;
  const cutoff = period > 0 ? Date.now() - period * 30.44 * 86400000 : 0;
  const W = 800, H = 260, PAD = { top: 20, right: 20, bottom: 30, left: 45 };
  const series = loaded.map((s, i) => ({ name: s.player.name, color: COLORS[i], pts: (s.data!.CROSS_DATA[s.fed]?.hcpHistory || []).filter(p => p.d >= cutoff).sort((a, b) => a.d - b.d) }));
  const allPts = series.flatMap(s => s.pts);
  if (allPts.length === 0) return null;
  const minD = Math.min(...allPts.map(p => p.d)), maxD = Math.max(...allPts.map(p => p.d));
  const minH = Math.min(...allPts.map(p => p.h)), maxH = Math.max(...allPts.map(p => p.h));
  const rangeD = maxD - minD || 1, rangeH = maxH - minH || 1, padH = rangeH * 0.1;
  const xPos = (d: number) => PAD.left + ((d - minD) / rangeD) * (W - PAD.left - PAD.right);
  const yPos = (h: number) => H - PAD.bottom - ((h - (minH - padH)) / (rangeH + 2 * padH)) * (H - PAD.top - PAD.bottom);

  return (
    <div className="courseAnalysis">
      <div className="caTitle" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        Evolução HCP
        <select className="select" value={period} onChange={e => setPeriod(Number(e.target.value))}>
          <option value={0}>Total</option><option value={36}>3 anos</option><option value={24}>2 anos</option><option value={12}>1 ano</option><option value={6}>6 meses</option>
        </select>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxHeight: 280, background: "#fafafa", borderRadius: 8, border: "1px solid var(--border-light)" }}>
        {Array.from({ length: 5 }, (_, i) => { const val = minH - padH + (rangeH + 2 * padH) * (i / 4); return (<g key={i}><line x1={PAD.left} y1={yPos(val)} x2={W - PAD.right} y2={yPos(val)} stroke="#e2e8f0" strokeWidth={0.5} /><text x={PAD.left - 4} y={yPos(val) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">{val.toFixed(1)}</text></g>); })}
        {series.map((s, si) => { if (s.pts.length < 2) return null; const d = s.pts.map(pt => `${xPos(pt.d).toFixed(1)},${yPos(pt.h).toFixed(1)}`).join(" L "); return (<g key={si}><path d={`M ${d}`} fill="none" stroke={s.color} strokeWidth={2} opacity={0.8} strokeLinejoin="round" />{s.pts.map((pt, j) => (<circle key={j} cx={xPos(pt.d)} cy={yPos(pt.h)} r={2.5} fill={s.color} opacity={0.5}><title>{s.name}: HCP {pt.h} ({new Date(pt.d).toLocaleDateString("pt-PT")})</title></circle>))}</g>); })}
      </svg>
      <div className="caKpis" style={{ marginTop: 8 }}>
        {series.map((s, i) => {
          const last = s.pts.length > 0 ? s.pts[s.pts.length - 1].h : null;
          const first = s.pts.length > 0 ? s.pts[0].h : null;
          const delta = last != null && first != null ? last - first : null;
          return (
            <div key={i} className="caKpi" style={{ borderColor: s.color }}>
              <div className="caKpiVal" style={{ color: s.color }}>{last != null ? last.toFixed(1) : "–"}</div>
              <div className="caKpiLbl">{shortName(s.name)}</div>
              {delta != null && (
                <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2, color: delta < 0 ? "#16a34a" : delta > 0 ? "#dc2626" : "#7a8a6e" }}>
                  {delta > 0 ? "+" : ""}{delta.toFixed(1)} no período
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════ MAIN ═══════════════════ */

export default function CompararPage({ players }: { players: PlayersDb }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [stats, setStats] = useState<PlayerStatsDb>({});
  useEffect(() => { loadPlayerStats().then(setStats); }, []);

  const addPlayer = (fed: string) => {
    if (slots.length >= 4 || slots.find(s => s.fed === fed)) return;
    const player = players[fed]; if (!player) return;
    setSlots(prev => [...prev, { fed, player, data: null, loading: true, error: null }]);
    loadPlayerData(fed)
      .then(data => { deepFixMojibake(data); setSlots(prev => prev.map(s => s.fed === fed ? { ...s, data, loading: false } : s)); })
      .catch(err => setSlots(prev => prev.map(s => s.fed === fed ? { ...s, loading: false, error: err?.message || "Erro" } : s)));
  };
  const removePlayer = (fed: string) => setSlots(prev => prev.filter(s => s.fed !== fed));
  const anyLoading = slots.some(s => s.loading);

  const allAgg = useMemo(() => slots.map(s => s.data ? aggregateStats(s.data) : null), [slots]);

  return (
    <div className="course-detail" style={{ maxWidth: 1060, margin: "0 auto" }}>
      <PlayerSearch players={players} slots={slots} onAdd={addPlayer} onRemove={removePlayer} />

      {slots.length === 0 && (
        <div className="holeAnalysis" style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚔️</div>
          <div className="haTitle" style={{ textAlign: "center", fontSize: 16, marginBottom: 6 }}>Comparar Jogadores</div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
            Pesquisa e adiciona até 4 jogadores para comparar lado a lado.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 16 }}>
            {["Perfil radar", "Tabela detalhada", "Distribuição de scores", "Buraco a buraco", "Head-to-head", "Evolução HCP"].map(label => (
              <span key={label} style={{
                padding: "4px 12px", borderRadius: 12, background: "#f0f2ec",
                fontSize: 11, fontWeight: 600, color: "#4a5940",
              }}>{label}</span>
            ))}
          </div>
        </div>
      )}

      {anyLoading && (
        <div className="holeAnalysis" style={{ textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          <div className="muted">A carregar dados dos jogadores…</div>
        </div>
      )}

      {slots.length >= 2 && !anyLoading && (<>
        <RadarChart slots={slots} allAgg={allAgg} />
        <StatsTable slots={slots} allAgg={allAgg} stats={stats} />
        <ScoreDistribution slots={slots} allAgg={allAgg} />
        <HoleByHoleSection slots={slots} />
        <HeadToHeadSection slots={slots} />
        <HcpEvolutionSection slots={slots} />
      </>)}

      {slots.length === 1 && !anyLoading && (
        <div className="holeAnalysis" style={{ textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>👆</div>
          <div className="muted">Adiciona mais jogadores para ver a comparação</div>
        </div>
      )}
    </div>
  );
}
