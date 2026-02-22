/**
 * CompararPage.tsx — Comparação entre jogadores (v2)
 *
 * NOTA: Todas as estatísticas são calculadas APENAS a partir de rondas
 *       de torneio (exclui EDS, treinos e individuais).
 *
 * Secções:
 *   1. Radar chart — perfil comparativo visual
 *   2. Tabela comparativa lado a lado com highlight do melhor
 *   3. Distribuição de scores (eagle→triple) com barras
 *   4. Buraco a buraco (gráfico + tabela) — só torneios
 *   5. Head-to-Head com barra de vitórias
 *   6. Evolução em torneios (SD / Gross) com média móvel
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Player, PlayersDb } from "../data/types";
import {
  loadPlayerData, type PlayerPageData, type RoundData,
  type HoleScores,
} from "../data/playerDataLoader";
import { norm } from "../utils/format";
import { clubShort, hcpDisplay } from "../utils/playerUtils";
import { deepFixMojibake } from "../utils/fixEncoding";
import { sc3m } from "../utils/scoreDisplay";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
const COLORS_LIGHT = ["var(--bg-success-strong)", "var(--bg-info-strong)", "var(--bg-danger-strong)", "var(--bg-warn-strong)"];

interface Slot {
  fed: string; player: Player;
  data: PlayerPageData | null; loading: boolean; error: string | null;
}

/* ─── Tournament round filter ─── */

function isTournamentRound(r: RoundData): boolean {
  if (r.holeCount !== 18 || r._isTreino || r.gross == null || Number(r.gross) <= 50) return false;
  const o = (r.scoreOrigin || "").trim();
  // Exclude known non-tournament origins
  if (o === "EDS" || o === "Indiv" || o === "Treino") return false;
  // Also exclude by eventName as fallback
  const ev = (r.eventName || "").trim();
  if (ev === "EDS" || ev === "Indiv") return false;
  return true;
}

/* ─── Aggregate stats (tournament rounds only) ─── */

interface AggStats {
  totalStrokesOverPar: number;
  parOrBetterPct: number;
  dblOrWorsePct: number;
  byPar: Record<number, { avgVsPar: number; slPerRound: number }>;
  nRounds: number;
  nRoundsWithCard: number;
  scoreDist: { eagle: number; birdie: number; par: number; bogey: number; double: number; triple: number; total: number };
  avgGross: number | null;
  bestGross: number | null;
  f9sl: number | null;
  b9sl: number | null;
  /* SD stats — tournament only */
  avgSD: number | null;
  bestSD: number | null;
  best8of20SD: number | null;
  last5AvgSD: number | null;
}

function aggregateStats(data: PlayerPageData): AggStats | null {
  const dist = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0, total: 0 };
  const parTypeAcc: Record<number, { sumDiff: number; count: number }> = {};
  let grossSum = 0, nRounds = 0, nRoundsWithCard = 0, bestGross: number | null = null;
  let sopSum = 0; // strokes over par total
  let f9diff = 0, b9diff = 0, fbN = 0;
  const sdAll: { sd: number; dateSort: number }[] = [];

  for (const cd of data.DATA) {
    for (const r of cd.rounds) {
      if (!isTournamentRound(r)) continue;
      const g = Number(r.gross);
      grossSum += g;
      nRounds++;
      if (bestGross === null || g < bestGross) bestGross = g;

      // Collect SD
      if (r.sd != null && !isNaN(Number(r.sd))) {
        sdAll.push({ sd: Number(r.sd), dateSort: r.dateSort });
      }

      // Hole-level stats from scorecard
      const holes: HoleScores | undefined = data.HOLES[r.scoreId];
      if (holes && holes.g && holes.g.length >= 18) {
        nRoundsWithCard++;
        let roundPar = 0, f9 = 0, b9 = 0;
        for (let i = 0; i < 18; i++) {
          const hg = holes.g[i];
          const hp = holes.p[i];
          if (hg == null || hp == null) continue;
          const diff = hg - hp;
          roundPar += hp;

          // Score distribution
          if (diff <= -2) dist.eagle++;
          else if (diff === -1) dist.birdie++;
          else if (diff === 0) dist.par++;
          else if (diff === 1) dist.bogey++;
          else if (diff === 2) dist.double++;
          else dist.triple++;
          dist.total++;

          // Par type accumulator
          if (!parTypeAcc[hp]) parTypeAcc[hp] = { sumDiff: 0, count: 0 };
          parTypeAcc[hp].sumDiff += diff;
          parTypeAcc[hp].count++;

          // Front/back 9
          if (i < 9) f9 += diff; else b9 += diff;
        }
        sopSum += (g - roundPar);
        f9diff += f9; b9diff += b9; fbN++;
      } else if (r.par != null) {
        sopSum += (g - Number(r.par));
      }
    }
  }

  if (nRounds < 2) return null;

  const byPar: Record<number, { avgVsPar: number; slPerRound: number }> = {};
  for (const pt of [3, 4, 5]) {
    const a = parTypeAcc[pt];
    if (!a || a.count === 0) continue;
    const avgVsPar = a.sumDiff / a.count;
    const holesPerRound = a.count / (nRoundsWithCard || 1);
    byPar[pt] = { avgVsPar, slPerRound: avgVsPar * holesPerRound };
  }

  const totalHoles = dist.total;
  const pob = totalHoles > 0 ? (dist.eagle + dist.birdie + dist.par) / totalHoles * 100 : 0;
  const dow = totalHoles > 0 ? (dist.double + dist.triple) / totalHoles * 100 : 0;

  // SD calculations (tournament only)
  sdAll.sort((a, b) => b.dateSort - a.dateSort); // most recent first
  const avgSD = sdAll.length > 0 ? sdAll.reduce((s, x) => s + x.sd, 0) / sdAll.length : null;
  const bestSD = sdAll.length > 0 ? Math.min(...sdAll.map(x => x.sd)) : null;
  const last20 = sdAll.slice(0, 20);
  const best8of20SD = last20.length >= 8
    ? [...last20].sort((a, b) => a.sd - b.sd).slice(0, 8).reduce((s, x) => s + x.sd, 0) / 8
    : null;
  const last5 = sdAll.slice(0, 5);
  const last5AvgSD = last5.length >= 3 ? last5.reduce((s, x) => s + x.sd, 0) / last5.length : null;

  return {
    totalStrokesOverPar: sopSum / nRounds,
    parOrBetterPct: pob,
    dblOrWorsePct: dow,
    byPar, nRounds, nRoundsWithCard,
    scoreDist: dist,
    avgGross: grossSum / nRounds,
    bestGross,
    f9sl: fbN > 0 ? f9diff / fbN : null,
    b9sl: fbN > 0 ? b9diff / fbN : null,
    avgSD, bestSD, best8of20SD, last5AvgSD,
  };
}

/* ─── Hole-by-hole stats from tournament rounds only ─── */

interface SimpleHoleEntry {
  h: number;
  par: number | null;
  avg: number | null;
  strokesLost: number | null;
}

interface SimpleHoleStats {
  teeName: string;
  holeCount: number;
  nRounds: number;
  avgGross: number | null;
  holes: SimpleHoleEntry[];
}

function buildTourneyHoleStats(data: PlayerPageData): Map<string, { label: string; nR: number; stats: SimpleHoleStats }> {
  const map = new Map<string, { label: string; nR: number; stats: SimpleHoleStats }>();
  const grouped = new Map<string, { tee: string; course: string; scoreIds: string[] }>();

  for (const cd of data.DATA) {
    for (const r of cd.rounds) {
      if (!isTournamentRound(r)) continue;
      if (!data.HOLES[r.scoreId]) continue;
      const holes = data.HOLES[r.scoreId];
      if (!holes.g || holes.g.length < 18) continue;

      const key = cd.course.replace(/ /g, "_") + "|" + r.teeKey;
      if (!grouped.has(key)) grouped.set(key, { tee: r.tee, course: cd.course, scoreIds: [] });
      grouped.get(key)!.scoreIds.push(r.scoreId);
    }
  }

  for (const [key, { tee, course, scoreIds }] of grouped) {
    if (scoreIds.length < 2) continue;
    const nH = 18;
    const holeSums = Array.from({ length: nH }, () => ({ gSum: 0, pSum: 0, n: 0 }));
    let grossTotal = 0, grossN = 0;

    for (const sid of scoreIds) {
      const h = data.HOLES[sid];
      if (!h || h.g.length < nH) continue;
      let rGross = 0, rPar = 0, valid = true;
      for (let i = 0; i < nH; i++) {
        if (h.g[i] != null && h.p[i] != null) {
          holeSums[i].gSum += h.g[i]!;
          holeSums[i].pSum += h.p[i]!;
          holeSums[i].n++;
          rGross += h.g[i]!; rPar += h.p[i]!;
        } else { valid = false; }
      }
      if (valid) { grossTotal += rGross; grossN++; }
    }

    const holes: SimpleHoleEntry[] = holeSums.map((hs, i) => ({
      h: i + 1,
      par: hs.n > 0 ? Math.round(hs.pSum / hs.n) : null,
      avg: hs.n > 0 ? hs.gSum / hs.n : null,
      strokesLost: hs.n > 0 ? (hs.gSum / hs.n) - (hs.pSum / hs.n) : null,
    }));

    const ck = key.split("|")[0];
    map.set(key, {
      label: ck.replace(/_/g, " ") + " — " + tee,
      nR: scoreIds.length,
      stats: { teeName: tee, holeCount: nH, nRounds: scoreIds.length, avgGross: grossN > 0 ? grossTotal / grossN : null, holes },
    });
  }

  return map;
}

/* ─── Other helpers ─── */

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
      <div className="flex-center-gap8 mb-10" ref={ref}>
        <div className="cmp-search-wrap">
          <input className="input" value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => q.trim() && setOpen(true)}
            placeholder="Pesquisar jogador…" disabled={slots.length >= 4}
            className="cmp-search-input" />
          {open && results.length > 0 && (
            <div className="cmp-dropdown">
              {results.map(p => (
                <button key={p.fed} className="course-item" onClick={() => { onAdd(p.fed); setQ(""); setOpen(false); }}>
                  <div className="course-item-name">{p.name}</div>
                  <div className="course-item-meta">{clubShort(p)} · {p.escalao} · HCP {hcpDisplay(p.hcp)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="chip cmp-chip">{slots.length}/4</span>
      </div>
      {slots.length > 0 && (
        <div className="flex-wrap-gap8">
          {slots.map((s, i) => (
            <span key={s.fed} className="jog-pill" style={{
              borderColor: COLORS[i], background: COLORS_LIGHT[i],
              display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", fontSize: 13, borderRadius: "var(--radius-pill)",
            }}>
 <span className="round flex-shrink-0" style={{ width: 10, height: 10, background: COLORS[i] }} />
              <b>{shortName(s.player.name)}</b>
              <span className="muted fs-11">HCP {hcpDisplay(s.player.hcp)}</span>
              {s.loading && <span className="fs-11">⏳</span>}
              <button onClick={() => onRemove(s.fed)} className="cmp-remove-btn" title="Remover">✕</button>
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
    { label: "Panc. s/ Par", getValue: a => a.totalStrokesOverPar, invert: true },
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
    <div className="courseAnalysis p-16">
      <div className="caTitle">Perfil Comparativo <span className="muted fs-11 fw-400">(apenas torneios)</span></div>
      <svg viewBox="0 0 300 290" className="cmp-radar-wrap">
        {[0.25, 0.5, 0.75, 1].map(frac => (
          <polygon key={frac}
            points={Array.from({ length: N }, (_, i) => { const p = pointOnAxis(i, frac); return `${p.x},${p.y}`; }).join(" ")}
            fill="none" stroke="var(--border)" strokeWidth={frac === 1 ? 1 : 0.5} opacity={0.6}
          />
        ))}
        {axes.map((_, i) => {
          const p = pointOnAxis(i, 1);
          return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="var(--border)" strokeWidth={0.5} />;
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
              fontSize={10} fontWeight={600} fill="var(--text-2)">{ax.label}</text>
          );
        })}
      </svg>
    </div>
  );
}

/* ═══════════════════ § 2 TABELA COMPARATIVA ═══════════════════ */

function StatsTable({ slots, allAgg }: { slots: Slot[]; allAgg: (AggStats | null)[] }) {
  const loaded = slots.map((s, i) => ({ s, agg: allAgg[i], i })).filter(x => x.agg);
  if (loaded.length < 2) return null;

  type Row = { label: string; values: (string | null)[]; best?: "low" | "high"; emoji?: string };
  const rows: Row[] = [];
  const val = (fn: (agg: AggStats | null) => string | null) =>
    loaded.map(x => fn(x.agg));

  rows.push({ label: "Rondas Torneio", emoji: "🏟️", values: val((a) => a ? String(a.nRounds) : null), best: "high" });
  rows.push({ label: "Melhor Gross", emoji: "🏆", values: val((a) => a?.bestGross != null ? String(a.bestGross) : null), best: "low" });
  rows.push({ label: "Gross Médio", emoji: "📊", values: val((a) => a?.avgGross != null ? a.avgGross.toFixed(0) : null), best: "low" });
  rows.push({ label: "SD Médio", emoji: "📈", values: val((a) => a?.avgSD != null ? a.avgSD.toFixed(1) : null), best: "low" });
  rows.push({ label: "SD Best 8/20", emoji: "🎖️", values: val((a) => a?.best8of20SD != null ? a.best8of20SD.toFixed(1) : null), best: "low" });
  rows.push({ label: "SD Últimas 5", emoji: "🔥", values: val((a) => a?.last5AvgSD != null ? a.last5AvgSD.toFixed(1) : null), best: "low" });
  rows.push({ label: "Melhor SD", emoji: "⭐", values: val((a) => a?.bestSD != null ? a.bestSD.toFixed(1) : null), best: "low" });
  rows.push({ label: "Panc. s/ Par/Volta", emoji: "🎯", values: val((a) => a ? fD(a.totalStrokesOverPar) : null), best: "low" });
  rows.push({ label: "Par ou Melhor", emoji: "⛳", values: val((a) => a ? pct(a.parOrBetterPct) : null), best: "high" });
  rows.push({ label: "Dbl+ ou Pior", emoji: "⚠️", values: val((a) => a ? pct(a.dblOrWorsePct) : null), best: "low" });
  rows.push({ label: "Par 3 vs Par", emoji: "🟢", values: val((a) => a?.byPar[3] ? fD2(a.byPar[3].avgVsPar) : null), best: "low" });
  rows.push({ label: "Par 4 vs Par", emoji: "🔵", values: val((a) => a?.byPar[4] ? fD2(a.byPar[4].avgVsPar) : null), best: "low" });
  rows.push({ label: "Par 5 vs Par", emoji: "🟣", values: val((a) => a?.byPar[5] ? fD2(a.byPar[5].avgVsPar) : null), best: "low" });

  const bestIdx = rows.map(r => {
    const nums = r.values.map(v => v != null ? parseFloat(v.replace(/[+%]/g, "")) : null);
    const valid = nums.filter((n): n is number => n != null && !isNaN(n));
    if (valid.length < 2) return -1;
    const target = r.best === "high" ? Math.max(...valid) : Math.min(...valid);
    return nums.indexOf(target);
  });

  return (
    <div className="courseAnalysis p-0 no-overflow">
      <div className="caTitle" style={{ padding: "14px 16px 0" }}>Comparação Detalhada <span className="muted fs-11 fw-400">(apenas torneios)</span></div>
      <div className="pa-table-wrap mt-8">
        <table className="pa-table fs-13">
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
                <td className="fw-600 fs-12">
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
    <div className="courseAnalysis p-16">
      <div className="caTitle">Distribuição de Scores <span className="muted fs-11 fw-400">(apenas torneios)</span></div>
      <div className="flex-col-gap12 mt-8">
        {cats.filter(c => c.key !== "total").map(cat => {
          const vals = loaded.map(x => {
            const d = x.agg!.scoreDist;
            return d.total > 0 ? ((d[cat.key] as number) / d.total * 100) : 0;
          });
          const maxVal = Math.max(...vals, 1);
          return (
            <div key={cat.key}>
              <div className="flex-center-gap8-mb4">
                <span className="cmp-stat-label">
                  {cat.emoji} {cat.label}
                </span>
              </div>
              <div className="flex-col-gap3">
                {loaded.map(x => {
                  const d = x.agg!.scoreDist;
                  const v = d.total > 0 ? ((d[cat.key] as number) / d.total * 100) : 0;
                  const barW = Math.max(2, (v / maxVal) * 100);
                  return (
                    <div key={x.i} className="flex-center-gap8">
 <span className="fs-11 ta-right fw-600 flex-shrink-0" style={{ width: 60, color: COLORS[x.i] }}>
                        {firstName(x.s.player.name)}
                      </span>
                      <div className="cmp-distrib-track">
                        <div style={{
                          width: `${barW}%`, height: "100%", background: COLORS[x.i],
                          borderRadius: "var(--radius-sm)", opacity: 0.75,
                        }} />
                      </div>
 <span className="ta-right fw-700 c-text-2 fs-11" style={{ fontFamily: "'JetBrains Mono', monospace", width: 46 }}>
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

/* ═══════════════════ § 4 BURACO A BURACO (torneios) ═══════════════════ */

function HoleByHoleSection({ slots }: { slots: Slot[] }) {
  const loaded = slots.filter(s => s.data);
  if (loaded.length < 2) return null;

  const combos = useMemo(() => {
    const maps = loaded.map(s => buildTourneyHoleStats(s.data!));

    const allKeys = new Set<string>();
    maps.forEach(m => m.forEach((_, k) => allKeys.add(k)));
    const result: { label: string; nRounds: number[]; stats: (SimpleHoleStats | null)[] }[] = [];
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
      <div className="caTitle flex-center-gap10 flex-wrap">
        Buraco a Buraco <span className="muted fs-11 fw-400">(torneios)</span>
        <select className="select" value={sel} onChange={e => setSel(Number(e.target.value))}>
          {combos.map((c, i) => <option key={i} value={i}>{c.label} ({c.nRounds.filter(n => n > 0).join("/")} rondas)</option>)}
        </select>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="cmp-radar-sm">
        <line x1={PAD.left} x2={W - PAD.right} y1={yPos(0)} y2={yPos(0)} stroke="var(--color-good)" strokeWidth={1} strokeDasharray="4,3" opacity={0.5} />
        {[-0.5, 0.5, 1.0].filter(v => v >= minV && v <= maxV).map(v => (
          <g key={v}><line x1={PAD.left} x2={W - PAD.right} y1={yPos(v)} y2={yPos(v)} stroke="var(--border-light)" strokeWidth={0.5} />
          <text x={PAD.left - 4} y={yPos(v) + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)">{v > 0 ? "+" : ""}{v.toFixed(1)}</text></g>
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

      <div className="caKpis mt-6">
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

      <div className="pa-table-wrap mt-8">
        <table className="pa-table">
          <thead><tr>
            <th className="r">H</th><th className="r">Par</th>
            {loaded.map((s, i) => (<React.Fragment key={s.fed}>
              <th className="r" style={{ color: COLORS[i] }}>{firstName(s.player.name)} Avg</th>
              <th className="r" style={{ color: COLORS[i] }}>vs Par</th>
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
                <td className="r c-text-3">{par}</td>
                {entries.map((e, i) => {
                  const diff = e?.avg != null && e?.par != null ? e.avg - e.par : null;
                  const isBest = diff != null && diff === bestAvg && avgs.filter(v => v === bestAvg).length === 1;
                  const diffCol = diff == null ? undefined : sc3(diff, 0, 0.3);
                  return (<React.Fragment key={i}>
                    <td className="r" style={{ color: COLORS[i] }}>{e?.avg != null ? e.avg.toFixed(1) : "–"}</td>
                    <td className="r" style={{ color: diffCol }}>{diff != null ? (isBest ? <b>{fD2(diff)}</b> : fD2(diff)) : "–"}</td>
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
        if (!isTournamentRound(r)) continue;
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
      <div className="cmp-distrib-bar">
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
            background: "var(--border-light)", display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-3)", fontWeight: 700, fontSize: 12,
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

      <div className="pa-table-wrap cmp-result-list">
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
                <td className="c-text-3 nowrap">{m.date}</td>
                <td>{m.event}</td>
                {loaded.map((_, i) => {
                  const r = m.results.find(r => r.idx === i);
                  if (!r) return <td key={i} className="r">–</td>;
                  return <td key={i} className="r" style={{ color: r.gross === bestGross ? COLORS[i] : undefined, fontWeight: r.gross === bestGross ? 800 : 400 }}>{r.gross}</td>;
                })}
                <td className="r c-text-3">
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

/* ═══════════════════ § 6 EVOLUÇÃO EM TORNEIOS ═══════════════════ */

function TournamentEvolutionSection({ slots }: { slots: Slot[] }) {
  const [period, setPeriod] = useState(12);
  const [metric, setMetric] = useState<"sd" | "gross">("sd");
  const loaded = slots.filter(s => s.data);
  if (loaded.length < 2) return null;

  const cutoff = period > 0 ? Date.now() - period * 30.44 * 86400000 : 0;

  // Build tournament-only series from DATA rounds
  const series = useMemo(() => loaded.map((s, i) => {
    const pts: { d: number; sd: number; gross: number; event: string }[] = [];
    for (const cd of s.data!.DATA) {
      for (const r of cd.rounds) {
        if (!isTournamentRound(r)) continue;
        if (r.dateSort < cutoff) continue;
        const sd = r.sd != null ? Number(r.sd) : null;
        const gross = Number(r.gross);
        if (sd != null && !isNaN(sd) && gross > 50) {
          pts.push({ d: r.dateSort, sd, gross, event: r.eventName });
        }
      }
    }
    pts.sort((a, b) => a.d - b.d);

    // Compute rolling average (5-round window)
    const rolling: { d: number; val: number; raw: number; event: string }[] = [];
    const window = 5;
    for (let j = 0; j < pts.length; j++) {
      const start = Math.max(0, j - window + 1);
      const slice = pts.slice(start, j + 1);
      const avg = slice.reduce((s, p) => s + (metric === "sd" ? p.sd : p.gross), 0) / slice.length;
      rolling.push({ d: pts[j].d, val: avg, raw: metric === "sd" ? pts[j].sd : pts[j].gross, event: pts[j].event });
    }
    return { name: s.player.name, color: COLORS[i], pts: rolling };
  }), [loaded, cutoff, metric]);

  const allPts = series.flatMap(s => s.pts);
  if (allPts.length < 4) return null;

  const W = 800, H = 260, PAD = { top: 20, right: 20, bottom: 30, left: 45 };
  const minD = Math.min(...allPts.map(p => p.d)), maxD = Math.max(...allPts.map(p => p.d));
  const allVals = allPts.map(p => p.val);
  const minV = Math.min(...allVals), maxV = Math.max(...allVals);
  const rangeD = maxD - minD || 1, rangeV = maxV - minV || 1, padV = rangeV * 0.1;
  const xPos = (d: number) => PAD.left + ((d - minD) / rangeD) * (W - PAD.left - PAD.right);
  const yPos = (v: number) => H - PAD.bottom - ((v - (minV - padV)) / (rangeV + 2 * padV)) * (H - PAD.top - PAD.bottom);

  // For SD: lower is better, so invert visual logic in KPIs
  const metricLabel = metric === "sd" ? "SD" : "Gross";

  return (
    <div className="courseAnalysis">
      <div className="caTitle flex-center-gap10 flex-wrap">
        Evolução em Torneios
        <select className="select" value={metric} onChange={e => setMetric(e.target.value as "sd" | "gross")}>
          <option value="sd">Score Differential</option>
          <option value="gross">Gross</option>
        </select>
        <select className="select" value={period} onChange={e => setPeriod(Number(e.target.value))}>
          <option value={0}>Total</option><option value={36}>3 anos</option><option value={24}>2 anos</option><option value={12}>1 ano</option><option value={6}>6 meses</option>
        </select>
        <span className="muted fs-10 fw-400">média móvel 5 rondas</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="cmp-radar-wrap-sm">
        {Array.from({ length: 5 }, (_, i) => {
          const val = minV - padV + (rangeV + 2 * padV) * (i / 4);
          return (
            <g key={i}>
              <line x1={PAD.left} y1={yPos(val)} x2={W - PAD.right} y2={yPos(val)} stroke="var(--border-light)" strokeWidth={0.5} />
              <text x={PAD.left - 4} y={yPos(val) + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)">{val.toFixed(1)}</text>
            </g>
          );
        })}
        {series.map((s, si) => {
          if (s.pts.length < 2) return null;
          const d = s.pts.map(pt => `${xPos(pt.d).toFixed(1)},${yPos(pt.val).toFixed(1)}`).join(" L ");
          return (
            <g key={si}>
              <path d={`M ${d}`} fill="none" stroke={s.color} strokeWidth={2} opacity={0.8} strokeLinejoin="round" />
              {s.pts.map((pt, j) => (
                <circle key={j} cx={xPos(pt.d)} cy={yPos(pt.val)} r={2.5} fill={s.color} opacity={0.5}>
                  <title>{s.name}: {metricLabel} {pt.raw.toFixed(1)} (avg {pt.val.toFixed(1)}) — {pt.event} ({new Date(pt.d).toLocaleDateString("pt-PT")})</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="caKpis mt-8">
        {series.map((s, i) => {
          const last = s.pts.length > 0 ? s.pts[s.pts.length - 1].val : null;
          const first = s.pts.length > 0 ? s.pts[0].val : null;
          const delta = last != null && first != null ? last - first : null;
          const best = s.pts.length > 0 ? Math.min(...s.pts.map(p => p.raw)) : null;
          return (
            <div key={i} className="caKpi" style={{ borderColor: s.color }}>
              <div className="caKpiVal" style={{ color: s.color }}>{last != null ? last.toFixed(1) : "–"}</div>
              <div className="caKpiLbl">{shortName(s.name)} · {s.pts.length} rondas</div>
 <div className="flex-wrap-gap8 jc-center" style={{ marginTop: 3 }}>
                {delta != null && (
 <span className="fw-700 fs-10" style={{ color: sc3m(delta, 0, 0) }}>
                    {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                  </span>
                )}
                {best != null && (
                  <span className="fs-10 fw-600 c-text-3">
                    melhor: {best.toFixed(metric === "sd" ? 1 : 0)}
                  </span>
                )}
              </div>
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
    <div className="course-detail mx-auto" style={{ maxWidth: 1060 }}>
      <PlayerSearch players={players} slots={slots} onAdd={addPlayer} onRemove={removePlayer} />

      {slots.length === 0 && (
        <div className="holeAnalysis empty-state">
          <div className="cmp-empty-icon">⚔️</div>
          <div className="haTitle cmp-empty-title">Comparar Jogadores</div>
          <div className="muted fs-13-lh16">
            Pesquisa e adiciona até 4 jogadores para comparar lado a lado.
          </div>
          <div className="muted fs-12 mt-4 c-text-3">
            📌 Todas as estatísticas consideram apenas rondas de torneio (sem EDS nem individuais).
          </div>
          <div className="cmp-feature-tags">
            {["Perfil radar", "Tabela detalhada", "Distribuição de scores", "Buraco a buraco", "Head-to-head", "Evolução torneios"].map(label => (
              <span key={label} style={{
                padding: "4px 12px", borderRadius: "var(--radius-xl)", background: "var(--bg-hover)",
                fontSize: 11, fontWeight: 600, color: "var(--text-2)",
              }}>{label}</span>
            ))}
          </div>
        </div>
      )}

      {anyLoading && (
        <div className="holeAnalysis ta-c p-24">
 <div className="mb-8 fs-24" >⏳</div>
          <div className="muted">A carregar dados dos jogadores…</div>
        </div>
      )}

      {slots.length >= 2 && !anyLoading && (<>
        <RadarChart slots={slots} allAgg={allAgg} />
        <StatsTable slots={slots} allAgg={allAgg} />
        <ScoreDistribution slots={slots} allAgg={allAgg} />
        <HoleByHoleSection slots={slots} />
        <HeadToHeadSection slots={slots} />
        <TournamentEvolutionSection slots={slots} />
      </>)}

      {slots.length === 1 && !anyLoading && (
        <div className="holeAnalysis ta-c p-24">
 <div className="mb-8 fs-24" >👆</div>
          <div className="muted">Adiciona mais jogadores para ver a comparação</div>
        </div>
      )}
    </div>
  );
}
