/**
 * CompararPage.tsx — Comparação entre jogadores
 *
 * Classes CSS usadas (TODAS do design system existente):
 *   Secções:  .holeAnalysis .haTitle .haSubTitle
 *   Diag:     .haDiag .haDiagCard .haDiagIcon .haDiagBody .haDiagVal .haDiagLbl
 *   KPI:      .courseAnalysis .caTitle .caKpis .caKpi .caKpiVal .caKpiLbl
 *   ParType:  .haParGrid .haParCard .haParHead .haParAvg .haParStat
 *   Tabelas:  .pa-table-wrap .pa-table .roundRow
 *   Misc:     .jog-pill .chip .muted .input .select
 *
 *   .course-item / .course-item-name / .course-item-meta → APENAS no dropdown de pesquisa
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
import { numSafe } from "../utils/mathUtils";

const COLORS = ["#16a34a", "#2563eb", "#dc2626", "#d97706"];
const COLORS_LIGHT = ["#dcfce7", "#dbeafe", "#fee2e2", "#fef3c7"];

interface Slot {
  fed: string; player: Player;
  data: PlayerPageData | null; loading: boolean; error: string | null;
}

/* ─── Helpers ─── */

function aggregateStats(data: PlayerPageData) {
  let totalN = 0, totalSL = 0, totalPOB = 0, totalDOW = 0, totalHoles = 0, nRounds = 0;
  const parAgg: Record<number, { sumVsPar: number; sumSL: number; count: number }> = {};
  for (const ck in data.HOLE_STATS) for (const tk in data.HOLE_STATS[ck]) {
    const hs = data.HOLE_STATS[ck][tk];
    if (hs.holeCount !== 18 || hs.nRounds < 2) continue;
    nRounds += hs.nRounds; totalN++; totalSL += hs.totalStrokesLost;
    const td = hs.totalDist;
    if (td) { totalPOB += td.eagle + td.birdie + td.par; totalDOW += td.double + td.triple; totalHoles += td.total; }
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
  return { totalStrokesLost: totalSL / totalN, parOrBetterPct: totalHoles > 0 ? totalPOB / totalHoles * 100 : 0, dblOrWorsePct: totalHoles > 0 ? totalDOW / totalHoles * 100 : 0, byPar, nRounds };
}

function shortName(name: string) { return name.split(" ").slice(0, 2).join(" "); }
function firstName(name: string) { return name.split(" ")[0]; }
const fD = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(1);
const fD2 = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);

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
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }} ref={ref}>
        <div style={{ position: "relative", flex: 1 }}>
          <input className="input" value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => q.trim() && setOpen(true)}
            placeholder="Pesquisar jogador..." disabled={slots.length >= 4} style={{ width: "100%" }} />
          {open && results.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-lg)", maxHeight: 260, overflowY: "auto" }}>
              {results.map(p => (
                <button key={p.fed} className="course-item" onClick={() => { onAdd(p.fed); setQ(""); setOpen(false); }}>
                  <div className="course-item-name">{p.name}</div>
                  <div className="course-item-meta">{clubShort(p)} · {p.escalao} · HCP {hcpDisplay(p.hcp)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="chip">{slots.length}/4</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {slots.map((s, i) => (
          <span key={s.fed} className="jog-pill" style={{ borderColor: COLORS[i], background: COLORS_LIGHT[i], display: "flex", alignItems: "center", gap: 5, padding: "3px 10px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS[i] }} />
            <b>{s.player.name}</b>{s.loading && " ⏳"}
            <button onClick={() => onRemove(s.fed)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: "0 2px" }}>✕</button>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════ § 1 CARTÕES-RESUMO ═══════════════════ */

function PlayerCards({ slots, stats }: { slots: Slot[]; stats: PlayerStatsDb }) {
  const loaded = slots.filter(s => s.data);
  if (loaded.length < 2) return null;

  return (
    <div className="haDiag" style={{ marginBottom: 20 }}>
      {loaded.map((s, idx) => {
        const st = stats[s.fed];
        const agg = aggregateStats(s.data!);
        const col = COLORS[idx];
        const slCol = agg ? (agg.totalStrokesLost <= 5 ? "#16a34a" : agg.totalStrokesLost <= 12 ? "#d97706" : "#dc2626") : "#94a3b8";
        const pobCol = agg ? (agg.parOrBetterPct >= 60 ? "#16a34a" : agg.parOrBetterPct >= 40 ? "#d97706" : "#dc2626") : "#94a3b8";
        const trendIcon = st?.hcpTrend === "up" ? "📈" : st?.hcpTrend === "down" ? "📉" : "➡️";
        const alertEmoji = st?.formAlert === "hot" ? " 🔥" : st?.formAlert === "cold" ? " ❄️" : "";

        return (
          <div key={s.fed} className="holeAnalysis" style={{ borderColor: col, borderWidth: 2 }}>
            {/* Header */}
            <div className="haTitle" style={{ color: col, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{shortName(s.player.name)}{alertEmoji}</span>
              <span className="caKpiVal" style={{ color: col }}>{hcpDisplay(st?.currentHcp ?? s.player.hcp)}</span>
            </div>
            <div className="muted" style={{ marginBottom: 10 }}>{clubShort(s.player)} · {s.player.escalao}</div>

            {/* Diagnosis row */}
            <div className="haDiag">
              {st?.avgSD8 != null && (
                <div className="haDiagCard">
                  <div className="haDiagIcon" style={{ background: col + "20", color: col }}>📊</div>
                  <div className="haDiagBody">
                    <div className="haDiagVal" style={{ color: col }}>{st.avgSD8.toFixed(1)}</div>
                    <div className="haDiagLbl">SD best 8/20</div>
                  </div>
                </div>
              )}
              {agg && (
                <div className="haDiagCard">
                  <div className="haDiagIcon" style={{ background: slCol + "20", color: slCol }}>🎯</div>
                  <div className="haDiagBody">
                    <div className="haDiagVal" style={{ color: slCol }}>{fD(agg.totalStrokesLost)}</div>
                    <div className="haDiagLbl">panc. perdidas/volta</div>
                  </div>
                </div>
              )}
              {agg && (
                <div className="haDiagCard">
                  <div className="haDiagIcon" style={{ background: pobCol + "20", color: pobCol }}>⛳</div>
                  <div className="haDiagBody">
                    <div className="haDiagVal" style={{ color: pobCol }}>{agg.parOrBetterPct.toFixed(0)}%</div>
                    <div className="haDiagLbl">par ou melhor</div>
                  </div>
                </div>
              )}
            </div>

            {/* KPIs row */}
            <div className="caKpis" style={{ marginTop: 10 }}>
              <div className="caKpi"><div className="caKpiVal">{st?.roundsLast12m ?? "–"}</div><div className="caKpiLbl">voltas 12m</div></div>
              <div className="caKpi"><div className="caKpiVal">{st?.bestGross ?? "–"}</div><div className="caKpiLbl">melhor gross</div></div>
              <div className="caKpi">
                <div className="caKpiVal">{trendIcon} {st?.hcpDelta3m != null ? ((st.hcpDelta3m > 0 ? "+" : "") + st.hcpDelta3m.toFixed(1)) : "–"}</div>
                <div className="caKpiLbl">Δ HCP 3m</div>
              </div>
            </div>

            {/* Par type mini-cards */}
            {agg && Object.keys(agg.byPar).length > 0 && (
              <div className="haParGrid" style={{ marginTop: 10 }}>
                {[3, 4, 5].map(pt => {
                  const p = agg.byPar[pt]; if (!p) return null;
                  const vpCol = p.avgVsPar <= 0 ? "#16a34a" : p.avgVsPar <= 0.4 ? "#d97706" : "#dc2626";
                  return (
                    <div key={pt} className="haParCard">
                      <div className="haParHead">Par {pt}</div>
                      <div className="haParAvg" style={{ color: vpCol }}>{fD2(p.avgVsPar)}</div>
                      <div className="haParStat">{fD(p.slPerRound)} <span>panc./volta</span></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════ § 2 BURACO A BURACO ═══════════════════ */

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

      {/* Chart */}
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

      {/* Legend */}
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

      {/* Table */}
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

/* ═══════════════════ § 3 HEAD-TO-HEAD ═══════════════════ */

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

  return (
    <div className="courseAnalysis">
      <div className="caTitle">Head-to-Head ({matches.length} torneios comuns)</div>
      <div className="caKpis">
        {loaded.map((s, i) => (
          <div key={i} className="caKpi" style={{ borderColor: wins[i] === Math.max(...wins) ? COLORS[i] : undefined }}>
            <div className="caKpiVal" style={{ color: COLORS[i] }}>{wins[i]}</div>
            <div className="caKpiLbl">{firstName(s.player.name)} vitórias</div>
          </div>
        ))}
        {loaded.length === 2 && (
          <div className="caKpi">
            <div className="caKpiVal">{matches.length - wins[0] - wins[1]}</div>
            <div className="caKpiLbl">Empates</div>
          </div>
        )}
      </div>
      <div className="pa-table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
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
                  return <td key={i} className="r" style={{ color: r.gross === bestGross ? COLORS[i] : undefined }}>{r.gross === bestGross ? <b>{r.gross}</b> : r.gross}</td>;
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

/* ═══════════════════ § 4 EVOLUÇÃO HCP ═══════════════════ */

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
        {series.map((s, i) => (
          <div key={i} className="caKpi" style={{ borderColor: s.color }}>
            <div className="caKpiVal" style={{ color: s.color }}>{s.pts.length > 0 ? s.pts[s.pts.length - 1].h.toFixed(1) : "–"}</div>
            <div className="caKpiLbl">{shortName(s.name)}</div>
          </div>
        ))}
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
      .then(data => setSlots(prev => prev.map(s => s.fed === fed ? { ...s, data, loading: false } : s)))
      .catch(err => setSlots(prev => prev.map(s => s.fed === fed ? { ...s, loading: false, error: err?.message || "Erro" } : s)));
  };
  const removePlayer = (fed: string) => setSlots(prev => prev.filter(s => s.fed !== fed));
  const anyLoading = slots.some(s => s.loading);

  return (
    <div className="course-detail" style={{ maxWidth: 1060, margin: "0 auto" }}>
      <PlayerSearch players={players} slots={slots} onAdd={addPlayer} onRemove={removePlayer} />

      {slots.length === 0 && (
        <div className="holeAnalysis" style={{ textAlign: "center" }}>
          <div className="haTitle" style={{ textAlign: "center" }}>Comparar Jogadores</div>
          <div className="muted">Pesquisa e adiciona até 4 jogadores para comparar</div>
          <div className="muted">Cartões de resumo · Buraco a buraco · Head-to-head · Evolução HCP</div>
        </div>
      )}

      {anyLoading && <div className="muted" style={{ textAlign: "center", padding: 20 }}>A carregar dados dos jogadores...</div>}

      {slots.length >= 2 && !anyLoading && (<>
        <PlayerCards slots={slots} stats={stats} />
        <HoleByHoleSection slots={slots} />
        <HeadToHeadSection slots={slots} />
        <HcpEvolutionSection slots={slots} />
      </>)}

      {slots.length === 1 && !anyLoading && (
        <div className="holeAnalysis" style={{ textAlign: "center" }}>
          <div className="muted">Adiciona mais jogadores para ver a comparação</div>
        </div>
      )}
    </div>
  );
}
