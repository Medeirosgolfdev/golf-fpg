import { useState } from "react";
import { firstName } from "../../utils/format";
import { sc3, SC } from "../../utils/scoreDisplay";
import type { Slot, AggStats, ScoreDistBucket, PeriodKey } from "./types";
import { COLORS, COLORS_LIGHT, periodLabel } from "./types";

/* ═════════════════════════════════════════════════════════════════
   Cores partilhadas com a resto da página e com o scoring tradicional
   ═════════════════════════════════════════════════════════════════ */

const C_EAGLE  = "#f59e0b";            // âmbar (token --score-eagle)
const C_BIRDIE = SC.good;               // verde
const C_PAR    = "var(--border-medium)";
const C_BOGEY  = "var(--color-info)";
const C_DBL    = SC.danger;             // vermelho/laranja forte para double+
const C_TRIP   = "var(--color-danger)"; // triple+ (se existir)

/* ═════════════════════════════════════════════════════════════════
   Helpers
   ═════════════════════════════════════════════════════════════════ */

function pctVal(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0;
}

/** Mini donut SVG: mostra `pct%` num anel colorido. */
function MiniDonut({ pct, value, color, label, n, highlight = false }: {
  pct: number; value: string; color: string; label: string; n: number; highlight?: boolean;
}) {
  const R = 22, r = 15;
  const C = 2 * Math.PI * R;
  const clamped = Math.max(0, Math.min(100, pct));
  const dash = (clamped / 100) * C;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"4px 2px", minWidth:66 }}>
      <svg viewBox="-28 -28 56 56" style={{ width:56, height:56 }}>
        {/* background ring */}
        <circle r={R} fill="none" stroke="var(--border-light)" strokeWidth={r - R + 2 * (R - r)} />
        <circle r={(R + r) / 2} fill="none" stroke="var(--border-light)" strokeWidth={R - r} />
        {/* foreground arc — começa no topo (12h) e anda no sentido horário */}
        <circle
          r={(R + r) / 2}
          fill="none"
          stroke={color}
          strokeWidth={R - r}
          strokeDasharray={`${dash.toFixed(2)} ${C.toFixed(2)}`}
          strokeLinecap="butt"
          transform="rotate(-90)"
        />
        {/* central text */}
        <text
          x={0} y={0}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={highlight ? 13 : 12}
          fontWeight={800}
          fill={color === C_PAR ? "var(--text-2)" : color}
          fontFamily="'JetBrains Mono',monospace"
        >{value}</text>
      </svg>
      <div style={{ fontSize:11, fontWeight:700, color:"var(--text-2)", marginTop:2 }}>{label}</div>
      <div style={{ fontSize:10, color:"var(--text-muted)" }}>{n} buraco{n === 1 ? "" : "s"}</div>
    </div>
  );
}

/** Mini barra multi-segmento para distribuição eagle→dbl+ (20px altura). */
function DistBar({ dist, height = 8 }: { dist: ScoreDistBucket; height?: number }) {
  if (dist.total === 0) return <div style={{ height, background:"var(--border-light)", borderRadius:4 }} />;
  const segs = [
    { pct: pctVal(dist.eagle,  dist.total), c: C_EAGLE  },
    { pct: pctVal(dist.birdie, dist.total), c: C_BIRDIE },
    { pct: pctVal(dist.par,    dist.total), c: C_PAR    },
    { pct: pctVal(dist.bogey,  dist.total), c: C_BOGEY  },
    { pct: pctVal(dist.double, dist.total), c: C_DBL    },
    { pct: pctVal(dist.triple, dist.total), c: C_TRIP   },
  ];
  return (
    <div style={{ display:"flex", height, borderRadius:4, overflow:"hidden", background:"var(--border-light)" }}>
      {segs.map((s, i) => s.pct >= 0.5 ? (
        <div key={i} style={{ width:`${s.pct}%`, background: s.c }} />
      ) : null)}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   SUB-SECÇÕES
   ═════════════════════════════════════════════════════════════════ */

/** Tab 1: painel numérico (σ, streak, ±3 do avg) e dispersão SVG — igual ao anterior. */
function DispersionPane({ loaded }: { loaded: { s: Slot; agg: AggStats | null; i: number }[] }) {
  return (
    <>
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

      <div className="mt-14">
        <div className="fs-11 fw-600 c-text-3 mb-8">Dispersão de Gross (torneios)</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:10 }}>
          {loaded.map(({ s, agg, i }) => {
            if (!agg || agg.grossSeries.length < 3) return null;
            const gs = agg.grossSeries;
            const mn = Math.min(...gs), mx = Math.max(...gs), rng = mx - mn || 1;
            const avg = agg.avgGross!;
            const W = 180, H = 50, pad = 8;
            const x = (j: number) => pad + (j / (gs.length - 1)) * (W - pad * 2);
            const y = (v: number) => H - pad - ((v - mn) / rng) * (H - pad * 2);
            return (
              <div key={i} style={{ border:`1px solid ${COLORS[i]}`, borderRadius:"var(--radius)", padding:8, background: COLORS_LIGHT[i] }}>
                <div className="fs-11 fw-700 mb-4" style={{ color: COLORS[i] }}>{firstName(s.player.name)}</div>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display:"block" }}>
                  <line x1={pad} x2={W - pad} y1={y(avg)} y2={y(avg)} stroke={COLORS[i]} strokeWidth={1} strokeDasharray="4,2" opacity={0.4} />
                  {gs.map((g, j) => (
                    <circle key={j} cx={x(j)} cy={y(g)} r={3} fill={COLORS[i]} opacity={0.7}>
                      <title>Ronda {j + 1}: {g}</title>
                    </circle>
                  ))}
                  <text x={pad} y={H - 2} fontSize={9} fill="var(--text-3)">{mn}</text>
                  <text x={W - pad} y={H - 2} fontSize={9} fill="var(--text-3)" textAnchor="end">{mx}</text>
                  <text x={W / 2} y={y(avg) - 4} fontSize={9} fill={COLORS[i]} textAnchor="middle">avg {avg.toFixed(0)}</text>
                </svg>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** Tab 2: distribuição de scoring em 5 donuts por jogador (estilo Masters). */
function ScoringDonutsPane({ loaded }: { loaded: { s: Slot; agg: AggStats | null; i: number }[] }) {
  const visible = loaded.filter(x => x.agg && x.agg.scoreDist.total > 0);
  if (visible.length === 0) {
    return <div className="muted fs-12 ta-c p-16">Sem scorecards completos no período para computar a distribuição.</div>;
  }

  // Para cada categoria, encontra o melhor (ou seja: birdie/eagle → high; bogey/double → low; par → high)
  const catDirs: Record<string, "low" | "high"> = {
    eagle: "high", birdie: "high", par: "high", bogey: "low", dbl: "low",
  };
  const bestBy: Record<string, number | null> = {};
  for (const cat of ["eagle","birdie","par","bogey","dbl"] as const) {
    const vals = visible.map(x => {
      const d = x.agg!.scoreDist;
      const n = cat === "eagle" ? d.eagle
              : cat === "birdie" ? d.birdie
              : cat === "par"    ? d.par
              : cat === "bogey"  ? d.bogey
              : d.double + d.triple;
      return pctVal(n, d.total);
    });
    bestBy[cat] = catDirs[cat] === "high" ? Math.max(...vals) : Math.min(...vals);
  }

  return (
    <div>
      <div className="fs-11 c-text-3 mb-10">
        Distribuição de buracos por categoria (estilo Masters). Linha a linha: uma ronda por jogador.
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))", gap:12 }}>
        {visible.map(({ s, agg, i }) => {
          if (!agg) return null;
          const d = agg.scoreDist;
          const dblPlus = d.double + d.triple;
          const pEagle  = pctVal(d.eagle,  d.total);
          const pBirdie = pctVal(d.birdie, d.total);
          const pPar    = pctVal(d.par,    d.total);
          const pBogey  = pctVal(d.bogey,  d.total);
          const pDbl    = pctVal(dblPlus,  d.total);

          const isBest = (cat: keyof typeof catDirs, v: number) =>
            bestBy[cat] != null && Math.abs(v - bestBy[cat]!) < 0.001 && visible.length > 1;

          return (
            <div key={i} style={{
              border: `2px solid ${COLORS[i]}`, borderRadius: "var(--radius)",
              padding: 12, background: "var(--bg-1)",
            }}>
              <div className="d-flex items-center gap-8 mb-8">
                <span className="round" style={{ width: 12, height: 12, background: COLORS[i] }} />
                <b style={{ color: COLORS[i], fontSize: 14 }}>{firstName(s.player.name)}</b>
                <span className="muted fs-11">· {agg.nRoundsWithCard} rondas · {d.total} buracos</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:4 }}>
                <MiniDonut pct={pEagle}  value={`${pEagle.toFixed(0)}%`}  color={C_EAGLE}  label="🦅 Eagle"  n={d.eagle}   highlight={isBest("eagle", pEagle)} />
                <MiniDonut pct={pBirdie} value={`${pBirdie.toFixed(0)}%`} color={C_BIRDIE} label="🐦 Birdie" n={d.birdie}  highlight={isBest("birdie", pBirdie)} />
                <MiniDonut pct={pPar}    value={`${pPar.toFixed(0)}%`}    color={C_PAR}    label="✅ Par"    n={d.par}     highlight={isBest("par", pPar)} />
                <MiniDonut pct={pBogey}  value={`${pBogey.toFixed(0)}%`}  color={C_BOGEY}  label="🟡 Bogey"  n={d.bogey}   highlight={isBest("bogey", pBogey)} />
                <MiniDonut pct={pDbl}    value={`${pDbl.toFixed(0)}%`}    color={C_DBL}    label="🔴 Dbl+"   n={dblPlus}   highlight={isBest("dbl", pDbl)} />
              </div>
              <div className="mt-10">
                <DistBar dist={d} height={10} />
                <div className="fs-10 c-text-3 mt-4 d-flex jc-between">
                  <span>Par ou melhor: <b style={{color:SC.good}}>{(pEagle+pBirdie+pPar).toFixed(0)}%</b></span>
                  <span>Bogey ou pior: <b style={{color:SC.danger}}>{(pBogey+pDbl).toFixed(0)}%</b></span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Tab 3: gráfico de barras por buraco-índice (1..18) comparando jogadores. */
function PerHolePane({ loaded }: { loaded: { s: Slot; agg: AggStats | null; i: number }[] }) {
  const visible = loaded.filter(x => x.agg && x.agg.perHoleAvg.some(h => h.n > 0));
  if (visible.length === 0) {
    return <div className="muted fs-12 ta-c p-16">Sem dados hole-by-hole no período.</div>;
  }

  // y = vs-par (avg − parAvg) por buraco
  type Row = { hole: number; par: number; vals: (number | null)[] };
  const rows: Row[] = [];
  for (let h = 0; h < 18; h++) {
    const pars = visible.map(x => x.agg!.perHoleAvg[h].parAvg).filter((p): p is number => p != null);
    const par = pars.length > 0 ? Math.round(pars[0]) : 4;
    const vals = loaded.map(x => {
      const ph = x.agg?.perHoleAvg[h];
      return (ph && ph.avg != null && ph.parAvg != null && ph.n > 0) ? ph.avg - ph.parAvg : null;
    });
    rows.push({ hole: h + 1, par, vals });
  }

  const W = 820, H = 230, PAD = { top: 16, right: 10, bottom: 40, left: 42 };
  const holeW = (W - PAD.left - PAD.right) / 18;
  const allVals = rows.flatMap(r => r.vals).filter((v): v is number => v != null);
  const minV = Math.min(-0.4, ...allVals), maxV = Math.max(0.6, ...allVals);
  const range = maxV - minV || 1;
  const yPos = (v: number) => PAD.top + ((maxV - v) / range) * (H - PAD.top - PAD.bottom);
  const y0 = yPos(0);

  // Barras agrupadas por jogador dentro de cada buraco.
  const nP = loaded.length;
  const groupW = holeW * 0.85;
  const barW = (groupW / nP) - 1;

  return (
    <div>
      <div className="fs-11 c-text-3 mb-6">
        Média do buraco (índice 1..18) em relação ao par. Valores &lt; 0 = abaixo do par (melhor).
      </div>
      <div className="scroll-x">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", maxWidth:W, minWidth:540, display:"block" }}>
          {/* grelha + eixos */}
          {[-0.5, 0, 0.5, 1.0].filter(v => v >= minV && v <= maxV).map(v => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={yPos(v)} y2={yPos(v)}
                stroke={v === 0 ? SC.good : "var(--border-light)"}
                strokeWidth={v === 0 ? 1 : 0.5}
                strokeDasharray={v === 0 ? "4,3" : ""}
                opacity={v === 0 ? 0.6 : 0.5} />
              <text x={PAD.left - 4} y={yPos(v) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">
                {v > 0 ? "+" : ""}{v.toFixed(1)}
              </text>
            </g>
          ))}
          {/* números dos buracos + par */}
          {rows.map(r => (
            <g key={r.hole}>
              <text x={PAD.left + (r.hole - 0.5) * holeW} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--text-2)">{r.hole}</text>
              <text x={PAD.left + (r.hole - 0.5) * holeW} y={H - 22} textAnchor="middle" fontSize={9} fill="var(--text-3)">P{r.par}</text>
            </g>
          ))}
          {/* barras */}
          {rows.map(r => {
            const groupX = PAD.left + (r.hole - 1) * holeW + (holeW - groupW) / 2;
            return (
              <g key={r.hole}>
                {r.vals.map((v, pi) => {
                  if (v == null) return null;
                  const pl = loaded[pi];
                  const color = COLORS[pl.i];
                  const x = groupX + pi * (barW + 1);
                  const y = v <= 0 ? yPos(v) : y0;
                  const h = Math.abs(yPos(v) - y0);
                  return (
                    <rect key={pi} x={x} y={y} width={barW} height={h} fill={color} opacity={0.85} rx={1}>
                      <title>{firstName(pl.s.player.name)} — B{r.hole} (Par {r.par}): {v > 0 ? "+" : ""}{v.toFixed(2)} ({pl.agg?.perHoleAvg[r.hole - 1].n ?? 0} rondas)</title>
                    </rect>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      {/* Ranking por buraco: quem é que ganha onde? */}
      <div className="fs-11 fw-700 c-text-3 mt-10 mb-4">Contagem de vitórias por buraco</div>
      <div className="d-flex flex-wrap gap-6">
        {loaded.map(pl => {
          let wins = 0, ties = 0;
          for (const r of rows) {
            const nums = r.vals
              .map((v, idx) => ({ v, idx }))
              .filter((x): x is { v: number; idx: number } => x.v != null);
            if (nums.length < 2) continue;
            const minV = Math.min(...nums.map(x => x.v));
            const bests = nums.filter(x => x.v === minV);
            if (bests.length === 1 && bests[0].idx === pl.i) wins++;
            else if (bests.some(b => b.idx === pl.i)) ties++;
          }
          return (
            <span key={pl.i} className="chip" style={{ borderColor: COLORS[pl.i], color: COLORS[pl.i] }}>
              {firstName(pl.s.player.name)}: <b>{wins}</b> ganho{wins === 1 ? "" : "s"} · {ties} empate{ties === 1 ? "" : "s"}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Tab 4: F9 vs B9 — cards com ±par médio e distribuição mini-bar. */
function NinesPane({ loaded }: { loaded: { s: Slot; agg: AggStats | null; i: number }[] }) {
  const visible = loaded.filter(x => x.agg && x.agg.nRoundsWithCard > 0);
  if (visible.length === 0) {
    return <div className="muted fs-12 ta-c p-16">Sem rondas com scorecard completo no período.</div>;
  }

  const formatTp = (v: number | null) => v == null ? "–" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;

  return (
    <div>
      <div className="fs-11 c-text-3 mb-10">
        Média de ±par em cada meia-volta (só rondas com scorecard completo).
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2, minmax(280px, 1fr))", gap:12 }}>
        {(["F9", "B9"] as const).map(nine => {
          const get = (a: AggStats) => nine === "F9"
            ? { tp: a.f9toParAvg, g: a.f9grossAvg, dist: a.f9dist }
            : { tp: a.b9toParAvg, g: a.b9grossAvg, dist: a.b9dist };
          // Melhor (mais baixo) ±par
          const tpVals = visible.map(x => get(x.agg!).tp).filter((v): v is number => v != null);
          const bestTp = tpVals.length >= 2 ? Math.min(...tpVals) : null;

          return (
            <div key={nine} className="card p-10" style={{ background:"var(--bg-1)" }}>
              <div className="fw-800 fs-13 mb-8">{nine === "F9" ? "🌅 Front 9 (buracos 1–9)" : "🌇 Back 9 (buracos 10–18)"}</div>
              {visible.map(({ s, agg, i }) => {
                const v = get(agg!);
                const isBest = bestTp != null && v.tp != null && Math.abs(v.tp - bestTp) < 0.001;
                return (
                  <div key={i} style={{ padding:"6px 0", borderTop:"1px solid var(--border-light)" }}>
                    <div className="d-flex items-center jc-between gap-8 mb-4">
                      <div className="d-flex items-center gap-6">
                        <span className="round" style={{ width:9, height:9, background: COLORS[i] }} />
                        <b className="fs-12" style={{ color: COLORS[i] }}>{firstName(s.player.name)}</b>
                      </div>
                      <div className="d-flex items-baseline gap-6">
                        <span className="mono fs-15 fw-800" style={{
                          color: v.tp == null ? "var(--text-muted)"
                               : v.tp <= 0 ? SC.good
                               : v.tp <= 2 ? C_BOGEY
                               : SC.danger,
                          background: isBest ? COLORS_LIGHT[i] : undefined,
                          padding: isBest ? "0 4px" : undefined,
                          borderRadius: isBest ? 3 : undefined,
                        }}>
                          {formatTp(v.tp)}
                        </span>
                        <span className="fs-10 c-text-3">
                          {v.g != null ? `gross ${v.g.toFixed(1)}` : ""}
                        </span>
                      </div>
                    </div>
                    <DistBar dist={v.dist} height={7} />
                    <div className="fs-10 c-text-3 mt-3 d-flex jc-between">
                      <span>🦅 {v.dist.eagle} · 🐦 {v.dist.birdie} · ✅ {v.dist.par}</span>
                      <span>🟡 {v.dist.bogey} · 🔴 {v.dist.double + v.dist.triple}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Resumo do lado forte */}
      <div className="fs-11 c-text-3 mt-10 d-flex flex-wrap gap-8">
        {visible.map(({ s, agg, i }) => {
          const f = agg!.f9toParAvg, b = agg!.b9toParAvg;
          if (f == null || b == null) return null;
          const diff = f - b;
          const forte = Math.abs(diff) < 0.2 ? "equilibrado"
                       : diff > 0 ? "💪 mais forte no Back 9"
                       : "💪 mais forte no Front 9";
          return (
            <span key={i} className="chip" style={{ borderColor: COLORS[i], color: COLORS[i] }}>
              {firstName(s.player.name)}: {forte} (Δ {diff >= 0 ? "+" : ""}{diff.toFixed(1)})
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Tab 5: Strokes Gained vs par — por tipo de par, relativo à média do grupo. */
function SgVsParPane({ loaded }: { loaded: { s: Slot; agg: AggStats | null; i: number }[] }) {
  const visible = loaded.filter(x => x.agg && x.agg.nRoundsWithCard > 0);
  if (visible.length === 0) {
    return <div className="muted fs-12 ta-c p-16">Sem rondas com scorecard no período.</div>;
  }

  // Para cada par (3/4/5), média do grupo = mean dos avgVsPar disponíveis.
  const parTypes: (3 | 4 | 5)[] = [3, 4, 5];
  const groupBaselines: Record<3 | 4 | 5, number | null> = {
    3: null, 4: null, 5: null,
  };
  for (const pt of parTypes) {
    const vals = visible
      .map(x => x.agg!.byPar[pt]?.avgVsPar)
      .filter((v): v is number => v != null && !isNaN(v));
    groupBaselines[pt] = vals.length >= 2 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  }

  return (
    <div>
      <div className="fs-11 c-text-3 mb-10">
        "Strokes Gained vs Grupo" por tipo de par — positivo (verde) = ganha pancadas face à média do grupo
        em cada tipo de buraco; negativo (vermelho) = perde pancadas.
      </div>

      <div className="scroll-x">
        <table className="dtable-lg fs-12">
          <thead>
            <tr>
              <th>Jogador</th>
              {parTypes.map(pt => (
                <th key={pt} className="r" style={{ minWidth: 160 }}>
                  {pt === 3 ? "🟢 Par 3" : pt === 4 ? "🔵 Par 4" : "🟣 Par 5"}
                  <div className="fs-10 c-text-3 fw-400 mt-1">
                    grupo: {groupBaselines[pt] != null
                      ? (groupBaselines[pt]! >= 0 ? "+" : "") + groupBaselines[pt]!.toFixed(2)
                      : "–"}
                  </div>
                </th>
              ))}
              <th className="r" style={{ minWidth: 100 }}>SG Total</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ s, agg, i }) => {
              const perPar = parTypes.map(pt => {
                const p = agg!.byPar[pt];
                const base = groupBaselines[pt];
                if (!p || base == null) return { pt, vsPar: null, sg: null };
                // Strokes gained = baseline − próprio (valores mais baixos são melhores)
                return { pt, vsPar: p.avgVsPar, sg: base - p.avgVsPar };
              });
              const totalSg = perPar.reduce((acc, x) => acc + (x.sg ?? 0), 0);
              const nValid = perPar.filter(x => x.sg != null).length;

              return (
                <tr key={i}>
                  <td style={{ minWidth: 120 }}>
                    <span className="round mr-6" style={{ width: 9, height: 9, background: COLORS[i], display:"inline-block" }} />
                    <b style={{ color: COLORS[i] }}>{firstName(s.player.name)}</b>
                  </td>
                  {perPar.map(({ pt, vsPar, sg }) => {
                    if (sg == null || vsPar == null) return <td key={pt} className="r c-text-3 mono">–</td>;
                    const barPct = Math.min(100, Math.abs(sg) / 0.5 * 100);  // 0.5 strokes = barra cheia
                    const sgCol = sg > 0.05 ? SC.good : sg < -0.05 ? SC.danger : "var(--text-2)";
                    return (
                      <td key={pt} className="r" style={{ padding: "8px 12px" }}>
                        <div className="d-flex items-center jc-end gap-6" style={{ minHeight: 20 }}>
                          <span className="fs-11 c-text-3 mono">
                            vs par: {vsPar >= 0 ? "+" : ""}{vsPar.toFixed(2)}
                          </span>
                          <span className="fw-800 mono" style={{ color: sgCol, minWidth: 52, textAlign: "right" }}>
                            {sg >= 0 ? "+" : ""}{sg.toFixed(2)}
                          </span>
                        </div>
                        <div style={{
                          position:"relative", height:6, borderRadius:3,
                          background:"var(--border-light)", marginTop:4, overflow:"hidden",
                        }}>
                          <div style={{
                            position: "absolute",
                            left: sg >= 0 ? "50%" : `${50 - barPct / 2}%`,
                            width: `${barPct / 2}%`,
                            height: "100%",
                            background: sgCol,
                            opacity: 0.7,
                          }} />
                          <div style={{
                            position: "absolute", left: "50%", top: 0, bottom: 0,
                            width: 1, background: "var(--text-muted)", opacity: 0.5,
                          }} />
                        </div>
                      </td>
                    );
                  })}
                  <td className="r mono fw-800" style={{
                    color: nValid === 0 ? "var(--text-muted)"
                         : totalSg > 0.05 ? SC.good
                         : totalSg < -0.05 ? SC.danger
                         : "var(--text-2)",
                  }}>
                    {nValid === 0 ? "–" : (totalSg >= 0 ? "+" : "") + totalSg.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="muted fs-10 mt-6">
        ℹ️ SG Total é a soma dos três deltas por tipo de par. Não é estritamente Strokes Gained PGA
        (precisa de dados shot-by-shot e baseline nacional), mas aproxima-se: mostra em que tipo de buracos
        cada jogador se distingue do grupo.
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL — com sub-tabs
   ═════════════════════════════════════════════════════════════════ */

type Pane = "dispersion" | "scoring" | "perhole" | "nines" | "sg";

const PANES: { key: Pane; label: string; emoji: string }[] = [
  { key: "dispersion", label: "Dispersão",       emoji: "📐" },
  { key: "scoring",    label: "Scoring",         emoji: "🎯" },
  { key: "perhole",    label: "Buraco-a-buraco", emoji: "🎳" },
  { key: "nines",      label: "F9 vs B9",        emoji: "↔️" },
  { key: "sg",         label: "vs Grupo",        emoji: "⚖️" },
];

export default function ConsistencySection({ slots, allAgg, period }: {
  slots: Slot[];
  allAgg: (AggStats | null)[];
  period: PeriodKey;
}) {
  const [pane, setPane] = useState<Pane>("scoring");
  const loaded = slots.map((s, i) => ({ s, agg: allAgg[i], i })).filter(x => x.agg);
  if (loaded.length < 2) return null;

  return (
    <div className="card">
      <div className="d-flex items-center gap-10 flex-wrap mb-10">
        <div className="h-md mb-0">📐 Consistência &amp; Análise</div>
        <span className="muted fs-11">· período: <b>{periodLabel(period)}</b></span>
      </div>

      {/* Sub-tabs */}
      <div className="d-flex flex-wrap gap-6 mb-14" style={{ borderBottom: "1px solid var(--border-light)" }}>
        {PANES.map(p => (
          <button
            key={p.key}
            className="tab-under"
            onClick={() => setPane(p.key)}
            style={{
              padding: "6px 12px",
              border: "none",
              background: "transparent",
              borderBottom: pane === p.key ? "2px solid var(--color-primary)" : "2px solid transparent",
              color: pane === p.key ? "var(--text-1)" : "var(--text-3)",
              fontWeight: pane === p.key ? 700 : 500,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {p.emoji} {p.label}
          </button>
        ))}
      </div>

      {pane === "dispersion" && <DispersionPane loaded={loaded} />}
      {pane === "scoring"    && <ScoringDonutsPane loaded={loaded} />}
      {pane === "perhole"    && <PerHolePane loaded={loaded} />}
      {pane === "nines"      && <NinesPane loaded={loaded} />}
      {pane === "sg"         && <SgVsParPane loaded={loaded} />}
    </div>
  );
}
