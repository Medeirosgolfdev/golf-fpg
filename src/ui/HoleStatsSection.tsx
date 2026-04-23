import React from "react";
import type { HoleStatsData, HoleStatEntry } from "../data/playerDataLoader";
import { fD, fD2, fmtSign } from "../utils/format";
import { sc3m, sc2, SC, scClass } from "../utils/scoreDisplay";
import { sumArr } from "../utils/mathUtils";

/* ─── Heatmap de buracos: grelha 1×9 (9H) ou 2×9 (18H) ─── */
function HoleHeatmap({ holes, hc }: { holes: HoleStatEntry[]; hc: number }) {
  const is9 = hc === 9;
  const rows: HoleStatEntry[][] = is9 ? [holes.slice(0, 9)] : [holes.slice(0, 9), holes.slice(9, 18)];
  const labels = is9 ? [""] : ["F9", "B9"];

  // Cor do fundo consoante strokesLost (gradient verde→neutro→vermelho)
  const cellStyle = (sl: number, n: number): React.CSSProperties => {
    if (n === 0) return { background: "var(--bg-detail)", color: "var(--text-muted)" };
    if (sl <= -0.3) return { background: "var(--color-good)", color: "#fff" };
    if (sl <= -0.1) return { background: "var(--color-good-alpha)", color: "var(--text-1)" };
    if (sl <= 0.15) return { background: "var(--bg-detail)", color: "var(--text-1)" };
    if (sl <= 0.4) return { background: "var(--color-warn-alpha)", color: "var(--text-1)" };
    if (sl <= 0.7) return { background: "var(--color-danger-alpha)", color: "var(--text-1)" };
    return { background: "var(--color-danger)", color: "#fff" };
  };

  return (
    <div className="mt-10">
      <div className="h-sm">🗺️ Mapa de calor por buraco <span className="muted fs-11">(verde = forte, vermelho = perdes pancadas)</span></div>
      <div className="heatmap-wrap">
        {rows.map((row, ri) => (
          <div key={ri} className="heatmap-row">
            {!is9 && <div className="heatmap-rowlabel">{labels[ri]}</div>}
            {row.map(h => {
              const sl = h.strokesLost ?? 0;
              const vp = h.avg != null && h.par != null ? h.avg - h.par : null;
              return (
                <div key={h.h} className="heatmap-cell" style={cellStyle(sl, h.n)}
                     title={h.n ? `Buraco ${h.h} · Par ${h.par} · média ${h.avg?.toFixed(1)} · ${fD(sl)} panc. perd./volta` : `Buraco ${h.h} — sem dados`}>
                  <div className="heatmap-hole">{h.h}</div>
                  <div className="heatmap-par">Par {h.par ?? "—"}</div>
                  <div className="heatmap-vp">{vp != null ? fmtSign(vp, 1) : "—"}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Comparação F9 vs B9 ─── */
function F9B9Comparison({ stats }: { stats: HoleStatsData }) {
  if (!stats.f9b9 || stats.holeCount !== 18) return null;

  // Distribuição por 9 (soma das distribuições dos 9 buracos correspondentes)
  const distFor = (start: number, end: number) => {
    const acc = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0, total: 0 };
    for (let i = start; i < end; i++) {
      const d = stats.holes[i]?.dist;
      if (!d) continue;
      acc.eagle += d.eagle; acc.birdie += d.birdie; acc.par += d.par;
      acc.bogey += d.bogey; acc.double += d.double; acc.triple += d.triple;
      acc.total += d.eagle + d.birdie + d.par + d.bogey + d.double + d.triple;
    }
    return acc;
  };
  const fD9 = distFor(0, 9);
  const bD9 = distFor(9, 18);

  const segsOf = (d: typeof fD9) => [
    { n: d.eagle + d.birdie, cls: "seg-birdie" },
    { n: d.par, cls: "seg-par" },
    { n: d.bogey, cls: "seg-bogey" },
    { n: d.double + d.triple, cls: "seg-double" },
  ];

  const diffSl = stats.f9b9.b9.strokesLost - stats.f9b9.f9.strokesLost;
  const worseSide = diffSl > 0.2 ? "b9" : diffSl < -0.2 ? "f9" : null;

  const Side = ({ side, label }: { side: "f9" | "b9"; label: string }) => {
    const s = side === "f9" ? stats.f9b9!.f9 : stats.f9b9!.b9;
    const d = side === "f9" ? fD9 : bD9;
    const isWorse = side === worseSide;
    const slCol = sc3m(s.strokesLost, 2.5, 6);
    return (
      <div className={`f9b9-card${isWorse ? " f9b9-worse" : ""}`}>
        <div className="f9b9-head">
          <span className="f9b9-label">{label}</span>
          <span className="muted fs-11">par {s.par}</span>
        </div>
        <div className="f9b9-sl" style={{ color: slCol }}>{fD(s.strokesLost)}<span className="fs-10 c-text-3"> panc. perd./volta</span></div>
        <div className="f9b9-dbl">{s.dblPct.toFixed(0)}% <span className="fs-10 c-text-3">double bogey ou pior</span></div>
        {d.total > 0 && (
          <div className="haParDistBar mt-6">
            {segsOf(d).map(sg => sg.n > 0 ? <div key={sg.cls} className={`haDistSeg ${sg.cls}`} style={{ width: `${(sg.n / d.total * 100).toFixed(1)}%` }} title={`${sg.cls}: ${sg.n}`} /> : null)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mt-10">
      <div className="h-sm">↔️ Front 9 vs Back 9</div>
      <div className="f9b9-grid">
        <Side side="f9" label="Front 9" />
        <div className="f9b9-diff" title={`Diferença de pancadas perdidas: ${fmtSign(diffSl, 2)}`}>
          {Math.abs(diffSl) < 0.2
            ? <><span className="f9b9-diff-icon">≈</span><span className="f9b9-diff-txt muted">equilibrado</span></>
            : <><span className="f9b9-diff-icon">{diffSl > 0 ? "→" : "←"}</span><span className="f9b9-diff-txt" style={{ color: SC.danger }}>{diffSl > 0 ? "B9" : "F9"} custa +{Math.abs(diffSl).toFixed(1)}</span></>
          }
        </div>
        <Side side="b9" label="Back 9" />
      </div>
    </div>
  );
}

/* ─── Bar chart vertical da distribuição de scores ─── */
function ScoreDistributionChart({ td }: { td: HoleStatsData["totalDist"] }) {
  if (!td || td.total === 0) return null;
  const cats = [
    { key: "eagle", label: "Eagle+", n: td.eagle, cls: "seg-eagle" },
    { key: "birdie", label: "Birdie", n: td.birdie, cls: "seg-birdie" },
    { key: "par", label: "Par", n: td.par, cls: "seg-par" },
    { key: "bogey", label: "Bogey", n: td.bogey, cls: "seg-bogey" },
    { key: "double", label: "Double", n: td.double, cls: "seg-double" },
    { key: "triple", label: "Triple+", n: td.triple, cls: "seg-triple" },
  ];
  // Altura máxima para normalizar as barras
  const maxN = Math.max(...cats.map(c => c.n), 1);
  return (
    <div className="mt-10">
      <div className="h-sm">📊 Distribuição de scores <span className="muted fs-11">({td.total} buracos)</span></div>
      <div className="score-dist">
        {cats.map(c => {
          const pct = (c.n / td.total) * 100;
          const barH = (c.n / maxN) * 100; // % da altura máxima
          return (
            <div key={c.key} className="score-dist-col" title={`${c.label}: ${c.n} (${pct.toFixed(1)}%)`}>
              <div className="score-dist-val">{c.n > 0 ? c.n : ""}</div>
              <div className="score-dist-barwrap">
                <div className={`score-dist-bar ${c.cls}`} style={{ height: `${barH}%` }} />
              </div>
              <div className="score-dist-pct">{pct.toFixed(1)}%</div>
              <div className="score-dist-lbl">{c.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HoleStatsSection({ stats }: { stats: HoleStatsData }) {
  const pctF = (n: number, tot: number) => tot ? (n / tot * 100).toFixed(0) : "0";

  const td = stats.totalDist;
  const parOrBetter = td ? (td.eagle + td.birdie + td.par) : 0;
  const dblOrWorse = td ? (td.double + td.triple) : 0;
  const parOrBetterPct = td?.total ? parOrBetter / td.total * 100 : 0;
  const dblOrWorsePct = td?.total ? dblOrWorse / td.total * 100 : 0;

  const slColor = sc3m(stats.totalStrokesLost, 5, 12);
  const pobCol = sc3m(parOrBetterPct, 40, 60, "desc");
  const dowCol = sc3m(dblOrWorsePct, 5, 15);

  // By par type
  const parTypes = [3, 4, 5].filter(p => stats.byParType[p]);
  const worstPT = parTypes.length > 1
    ? parTypes.reduce((a, b) => (stats.byParType[a]?.avgVsPar ?? 0) > (stats.byParType[b]?.avgVsPar ?? 0) ? a : b)
    : null;

  // Strengths & weaknesses
  const ranked = stats.holes
    .filter(h => h.avg != null && h.par != null && h.n >= 2)
    .map(h => ({ h: h.h, par: h.par!, si: h.si, avg: h.avg!, diff: h.avg! - h.par!, n: h.n, dist: h.dist, strokesLost: h.strokesLost ?? 0 }))
    .sort((a, b) => a.diff - b.diff);
  const strengths = ranked.filter(h => h.diff <= 0.15).slice(0, 4);
  const weaknesses = [...ranked].sort((a, b) => b.strokesLost - a.strokesLost).filter(h => h.strokesLost > 0.2).slice(0, 4);

  // Hole-by-hole table
  const hc = stats.holeCount;
  const is9 = hc === 9;
  const fe = is9 ? hc : 9;
  const parArr = stats.holes.slice(0, hc).map(x => x.par ?? 0);


  return (
    <div className="card">
      <div className="h-md">📊 Análise de Performance <span className="muted fs-11">({stats.nRounds} rondas)</span></div>

      {/* Diagnosis cards */}
      <div className="haDiag">
        <div className="haDiagCard">
          <div className="haDiagIcon" style={{ background: slColor + "20", color: slColor }}>🎯</div>
          <div className="min-w-0">
            <div className="haDiagVal" style={{ color: slColor }}>{fD(stats.totalStrokesLost)}</div>
            <div className="haDiagLbl">pancadas perdidas p/ volta vs par</div>
          </div>
        </div>
        <div className="haDiagCard">
          <div className="haDiagIcon" style={{ background: pobCol + "20", color: pobCol }}>⛳</div>
          <div className="min-w-0">
            <div className="haDiagVal" style={{ color: pobCol }}>{parOrBetterPct.toFixed(0)}%</div>
            <div className="haDiagLbl">par ou melhor ({parOrBetter}/{td?.total ?? 0} buracos)</div>
          </div>
        </div>
        <div className="haDiagCard">
          <div className="haDiagIcon" style={{ background: dowCol + "20", color: dowCol }}>💣</div>
          <div className="min-w-0">
            <div className="haDiagVal" style={{ color: dowCol }}>{dblOrWorsePct.toFixed(0)}%</div>
            <div className="haDiagLbl">double bogey ou pior ({dblOrWorse}/{td?.total ?? 0})</div>
          </div>
        </div>
      </div>

      {/* Heatmap de buracos */}
      <HoleHeatmap holes={stats.holes} hc={hc} />

      {/* Front 9 vs Back 9 (só em 18H) */}
      <F9B9Comparison stats={stats} />

      {/* By par type (colapsado por defeito) */}
      {parTypes.length > 1 && (
        <details className="details-block mt-10">
          <summary className="details-summary">🎯 Desempenho por tipo de buraco <span className="muted fs-11">(vs par · clica para abrir)</span></summary>
          {/* Bar chart horizontal comparativo */}
          <div className="par-type-chart">
            {(() => {
              const maxAbs = Math.max(0.3, ...parTypes.map(pt => Math.abs(stats.byParType[pt].avgVsPar ?? 0)));
              return parTypes.map(pt => {
                const g = stats.byParType[pt];
                const vp = g.avgVsPar ?? 0;
                const isWorst = pt === worstPT && vp > 0.3;
                const pct = Math.min(100, (Math.abs(vp) / maxAbs) * 100);
                const vpCol = sc3m(vp, 0, 0.4);
                const distTotal = g.dist.eagle + g.dist.birdie + g.dist.par + g.dist.bogey + g.dist.double + g.dist.triple;
                const segs = [
                  { n: g.dist.eagle + g.dist.birdie, cls: "seg-birdie", label: "Birdie+" },
                  { n: g.dist.par, cls: "seg-par", label: "Par" },
                  { n: g.dist.bogey, cls: "seg-bogey", label: "Bogey" },
                  { n: g.dist.double + g.dist.triple, cls: "seg-double", label: "Double+" },
                ];
                return (
                  <div key={pt} className={`par-type-row${isWorst ? " par-type-worst" : ""}`}>
                    <div className="par-type-label">
                      <span className="par-type-name">Par {pt}</span>
                      <span className="muted fs-10">{g.nHoles} buracos</span>
                    </div>
                    {/* Barra simétrica centrada no zero: negativo à esquerda (verde), positivo à direita (vermelho) */}
                    <div className="par-type-bar-track">
                      <div className="par-type-zero" />
                      <div className={`par-type-bar ${vp < 0 ? "bar-neg" : "bar-pos"}`}
                           style={{ width: `${pct / 2}%`, background: vpCol, [vp < 0 ? "right" : "left"]: "50%" } as React.CSSProperties} />
                    </div>
                    <div className="par-type-val" style={{ color: vpCol }}>{fD2(vp)}</div>
                    <div className="par-type-sl">{fD(g.strokesLostPerRound)} <span className="fs-10 c-text-3">p/volta</span></div>
                    {/* Distribuição mini */}
                    {distTotal > 0 && (
                      <div className="par-type-dist">
                        <div className="haParDistBar">
                          {segs.map(sg => sg.n > 0 ? <div key={sg.cls} className={`haDistSeg ${sg.cls}`} style={{ width: `${(sg.n / distTotal * 100).toFixed(1)}%` }} title={`${sg.label}: ${sg.n}`} /> : null)}
                        </div>
                        <div className="par-type-dist-nums">{pctF(g.dist.eagle + g.dist.birdie, distTotal)}% birdie+ · {pctF(g.dist.par, distTotal)}% par · {pctF(g.dist.bogey, distTotal)}% bogey · {pctF(g.dist.double + g.dist.triple, distTotal)}% double+</div>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </details>
      )}

      {/* Strengths & weaknesses (colapsado por defeito) */}
      {ranked.length >= 4 && (
        <details className="details-block mt-10">
          <summary className="details-summary">💪 Pontos fortes &amp; onde perdes mais <span className="muted fs-11">(clica para ver top 4)</span></summary>
        <div className="haTopWrap mt-6">
          <div className="haTopCol haTopStrength">
            <div className="h-sm"><span className="c-par-ok">💪 Pontos Fortes</span></div>
            {strengths.length === 0
              ? <div className="haTopEmpty">Nenhum buraco consistentemente ao par ou melhor.</div>
              : strengths.map(bh => {
                  const pobN = bh.dist ? bh.dist.eagle + bh.dist.birdie + bh.dist.par : 0;
                  const pobPct = bh.n ? Math.round(pobN / bh.n * 100) : 0;
                  return (
                    <div key={bh.h} className="haTopItem">
                      <div className="haTopHole">{bh.h}</div>
                      <div className="min-w-0">
                        <div><b>Bur. {bh.h}</b> · Par {bh.par}{bh.si ? ` · SI ${bh.si}` : ""}</div>
                        <div className="haTopMeta">
                          <span className="cb-par-ok">{fD2(bh.diff)}</span> média vs par · <span className="c-par-ok">{pobPct}% par ou melhor</span>
                        </div>
                      </div>
                    </div>
                  );
                })
            }
          </div>
          <div className="haTopCol haTopWeakness">
            <div className="h-sm"><span className="c-birdie">🔻 Onde Perdes Mais Pancadas</span></div>
            {weaknesses.length === 0
              ? <div className="haTopEmpty">Sem buracos com perdas significativas.</div>
              : <>
                  {weaknesses.map(wh => {
                    const dblN = wh.dist ? wh.dist.double + wh.dist.triple : 0;
                    const dblPct = wh.n ? Math.round(dblN / wh.n * 100) : 0;
                    return (
                      <div key={wh.h} className="haTopItem">
                        <div className="haTopHole haTopHoleRed">{wh.h}</div>
                        <div className="min-w-0">
                          <div><b>Bur. {wh.h}</b> · Par {wh.par}{wh.si ? ` · SI ${wh.si}` : ""}</div>
                          <div className="haTopMeta">
                            <span className="cb-birdie">{fD(wh.strokesLost)}</span> pancadas/volta
                            {dblPct > 0 && <> · <span className="c-birdie">{dblPct}% double+</span></>}
                            {" "}· Média {wh.avg.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {(() => {
                    const totalWeakSL = weaknesses.reduce((a, w) => a + w.strokesLost, 0);
                    return (
                      <div className="haTopSummary">Estes {weaknesses.length} buracos custam-te <b>{totalWeakSL.toFixed(1)} pancadas por volta</b> ({Math.round(totalWeakSL / stats.totalStrokesLost * 100)}% do total).</div>
                    );
                  })()}
                </>
            }
          </div>
        </div>
      )}

      {/* Scoring distribution chart (bar chart vertical) */}
      <ScoreDistributionChart td={td} />

      {/* Hole-by-hole table */}
      <div className="mt-4">
        <div className="card">
          <div className="sc-bar-head"><span>Detalhe Buraco a Buraco</span></div>
          <div className="scroll-x">
            <table className="w-full fs-11 bc-collapse">
              <tbody>
                {/* Buraco row */}
                <tr className="bg-detail">
                  <td className="fw-700 fs-11 hs-label" style={{ color: "var(--text-3)", borderBottom: "1px solid var(--border-light)" }}>Buraco</td>
                  {stats.holes.slice(0, hc).map((_, i) => (
                    <React.Fragment key={i}>
                      <td className="fw-700 fs-11 hs-cell" style={{ color: "var(--text-3)", borderBottom: "1px solid var(--border-light)" }}>{i + 1}</td>
                      {i === fe - 1 && !is9 && <td className="fw-700 fs-10 hs-out" style={{ color: "var(--text-3)", borderBottom: "1px solid var(--border-light)" }}>Out</td>}
                    </React.Fragment>
                  ))}
                  <td className={`fw-700 fs-10 ${is9 ? "hs-total" : "hs-in"}`} style={{ color: "var(--text-3)", borderBottom: "1px solid var(--border-light)" }}>{is9 ? "TOTAL" : "In"}</td>
                  {!is9 && <td className="fs-11 hs-total" style={{ color: "var(--text-2)", borderBottom: "1px solid var(--border-light)" }}>TOTAL</td>}
                </tr>
                {/* SI row */}
                {stats.holes.some(h => h.si != null) && (
                  <tr>
                    <td className="fs-10 hs-label" style={{ color: "var(--text-muted)" }}>S.I.</td>
                    {stats.holes.slice(0, hc).map((h, i) => (
                      <React.Fragment key={i}>
                        <td className="fs-10 hs-cell" style={{ color: "var(--text-muted)" }}>{h.si ?? ""}</td>
                        {i === fe - 1 && !is9 && <td className="hs-out" />}
                      </React.Fragment>
                    ))}
                    <td className={is9 ? "hs-total" : "hs-in"} />
                    {!is9 && <td className="hs-total" />}
                  </tr>
                )}
                {/* Par row */}
                <tr>
                  <td className="fw-600 fs-11 hs-label" style={{ color: "var(--text-muted)", borderBottom: "2px solid var(--border)" }}>Par</td>
                  {stats.holes.slice(0, hc).map((h, i) => (
                    <React.Fragment key={i}>
                      <td className="hs-cell" style={{ borderBottom: "2px solid var(--border)" }}>{h.par ?? ""}</td>
                      {i === fe - 1 && !is9 && <td className="fw-700 hs-out" style={{ borderBottom: "2px solid var(--border)" }}>{sumArr(parArr, 0, fe)}</td>}
                    </React.Fragment>
                  ))}
                  <td className={`fw-700 ${is9 ? "hs-total" : "hs-in"}`} style={{ borderBottom: "2px solid var(--border)" }}>
                    {is9 ? sumArr(parArr, 0, hc) : sumArr(parArr, 9, hc)}
                  </td>
                  {!is9 && <td className="hs-total" style={{ borderBottom: "2px solid var(--border)" }}>{sumArr(parArr, 0, hc)}</td>}
                </tr>
                {/* Avg row */}
                <tr>
                  <td className="fw-700 hs-label" style={{ color: "var(--text)" }}>Média</td>
                  {stats.holes.slice(0, hc).map((h, i) => {
                    const vp = h.avg != null && h.par != null ? h.avg - h.par : null;
                    const col = vp == null ? SC.muted : vp <= -0.1 ? SC.good : vp <= 0.3 ? SC.muted : SC.danger;
                    return (
                      <React.Fragment key={i}>
                        <td className="fw-700 hs-cell" style={{ color: col }}>{h.avg?.toFixed(1) ?? ""}</td>
                        {i === fe - 1 && !is9 && <td className="fw-700 hs-out">{(stats.holes.slice(0, fe).reduce((s, x) => s + (x.avg ?? 0), 0)).toFixed(1)}</td>}
                      </React.Fragment>
                    );
                  })}
                  <td className={`fw-700 ${is9 ? "hs-total" : "hs-in"}`}>
                    {(is9 ? stats.holes.slice(0, hc) : stats.holes.slice(9, hc)).reduce((s, x) => s + (x.avg ?? 0), 0).toFixed(1)}
                  </td>
                  {!is9 && <td className="fw-900 hs-total">{stats.holes.slice(0, hc).reduce((s, x) => s + (x.avg ?? 0), 0).toFixed(1)}</td>}
                </tr>
                {/* Best row */}
                <tr>
                  <td className="fw-700 fs-10 hs-label" style={{ color: SC.good }}>Melhor</td>
                  {stats.holes.slice(0, hc).map((h, i) => {
                    const cls = h.best != null && h.par != null ? scClass(h.best, h.par) : "";
                    return (
                      <React.Fragment key={i}>
                        <td className="hs-cell">{h.best != null ? <span className={`sc-score ${cls}`}>{h.best}</span> : ""}</td>
                        {i === fe - 1 && !is9 && <td className="hs-out" />}
                      </React.Fragment>
                    );
                  })}
                  <td className={is9 ? "hs-total" : "hs-in"} />
                  {!is9 && <td className="hs-total" />}
                </tr>
                {/* Worst row */}
                <tr>
                  <td className="fw-700 fs-10 hs-label" style={{ color: SC.danger }}>Pior</td>
                  {stats.holes.slice(0, hc).map((h, i) => {
                    const cls = h.worst != null && h.par != null ? scClass(h.worst, h.par) : "";
                    return (
                      <React.Fragment key={i}>
                        <td className="hs-cell">{h.worst != null ? <span className={`sc-score ${cls}`}>{h.worst}</span> : ""}</td>
                        {i === fe - 1 && !is9 && <td className="hs-out" />}
                      </React.Fragment>
                    );
                  })}
                  <td className={is9 ? "hs-total" : "hs-in"} />
                  {!is9 && <td className="hs-total" />}
                </tr>
                {/* Strokes lost row */}
                <tr>
                  <td className="fw-700 fs-10 hs-label" style={{ color: "var(--text-3)" }}>Panc. perd.</td>
                  {stats.holes.slice(0, hc).map((h, i) => {
                    const sl = h.strokesLost ?? 0;
                    let slBg = "";
                    if (sl <= -0.3) slBg = "rgba(22,163,74,0.2)";
                    else if (sl <= 0.15) slBg = "";
                    else if (sl <= 0.4) slBg = "rgba(220,38,38,0.1)";
                    else if (sl <= 0.7) slBg = "rgba(220,38,38,0.2)";
                    else slBg = "rgba(220,38,38,0.35)";
                    const slCol = sl <= -0.3 ? SC.good : sl <= 0.15 ? SC.muted : SC.danger;
                    return (
                      <React.Fragment key={i}>
                        <td className="fw-700 fs-10 hs-cell" style={{ background: slBg, color: slCol }}>{h.n > 0 ? fD(sl) : ""}</td>
                        {i === fe - 1 && !is9 && (() => {
                          const outSL = stats.holes.slice(0, fe).reduce((s, x) => s + (x.strokesLost ?? 0), 0);
                          return <td className="fw-700 fs-10 hs-out" style={{ color: sc2(outSL, 0) }}>{fD(outSL)}</td>;
                        })()}
                      </React.Fragment>
                    );
                  })}
                  {(() => {
                    const inSL = (is9 ? stats.holes.slice(0, hc) : stats.holes.slice(9, hc)).reduce((s, x) => s + (x.strokesLost ?? 0), 0);
                    return <td className={`fw-700 fs-10 ${is9 ? "hs-total" : "hs-in"}`} style={{ color: sc2(inSL, 0) }}>{fD(inSL)}</td>;
                  })()}
                  {!is9 && <td className="fw-900 fs-11 hs-total" style={{ color: sc2(stats.totalStrokesLost, 0) }}>{fD(stats.totalStrokesLost)}</td>}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HoleStatsSection;
