import React from "react";
import type { HoleStatsData } from "../data/playerDataLoader";
import { fD, fD2 } from "../utils/format";
import { sc3m, sc2, SC, scClass } from "../utils/scoreDisplay";
import { sumArr } from "../utils/mathUtils";

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
        {stats.f9b9 && (() => {
          const diff9 = stats.f9b9.b9.strokesLost - stats.f9b9.f9.strokesLost;
          const worse9 = diff9 > 0.3 ? "Back 9" : diff9 < -0.3 ? "Front 9" : null;
          if (!worse9) return null;
          return (
            <div className="haDiagCard">
              <div className="haDiagIcon diag-bg-purple">🔄</div>
              <div className="min-w-0">
                <div className="haDiagVal c-purple">{worse9}</div>
                <div className="haDiagLbl">custa mais {Math.abs(diff9).toFixed(1)} panc./volta (F9: {fD(stats.f9b9!.f9.strokesLost)}, B9: {fD(stats.f9b9!.b9.strokesLost)})</div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* By par type */}
      {parTypes.length > 1 && (
        <div className="mt-10">
          <div className="h-sm">Desempenho por Tipo de Buraco</div>
          <div className="haParGrid">
            {parTypes.map(pt => {
              const g = stats.byParType[pt];
              const isWorst = pt === worstPT && (g.avgVsPar ?? 0) > 0.3;
              const distTotal = g.dist.eagle + g.dist.birdie + g.dist.par + g.dist.bogey + g.dist.double + g.dist.triple;
              const vpCol = sc3m(g.avgVsPar ?? 0, 0, 0.4);
              const segs = [
                { n: g.dist.eagle + g.dist.birdie, cls: "seg-birdie", label: "Birdie+" },
                { n: g.dist.par, cls: "seg-par", label: "Par" },
                { n: g.dist.bogey, cls: "seg-bogey", label: "Bogey" },
                { n: g.dist.double + g.dist.triple, cls: "seg-double", label: "Double+" },
              ];
              return (
                <div key={pt} className="haParCard"
                  style={{ borderColor: isWorst ? SC.danger : "var(--border)", background: isWorst ? "var(--bg-danger)" : "var(--bg-card)" }}>
                  {isWorst && <div className="haParAlert">⚠️ Área a melhorar</div>}
                  <div className="haParHead">Par {pt} <span className="muted">({g.nHoles} buracos)</span></div>
                  <div className="haParAvg" style={{ color: vpCol }}>{fD2(g.avgVsPar ?? 0)} <span style={{ fontSize: 10, color: "var(--text-3)" }}>média vs par</span></div>
                  <div className="haParStat">{fD(g.strokesLostPerRound)} <span>pancadas/volta</span></div>
                  {distTotal > 0 && (
                    <div className="mt-6">
                      <div className="haParDistBar">
                        {segs.map(sg => sg.n > 0 ? <div key={sg.cls} className={`haDistSeg ${sg.cls}`} style={{ width: `${(sg.n / distTotal * 100).toFixed(1)}%` }} title={`${sg.label}: ${sg.n}`} /> : null)}
                      </div>
                      <div className="haParDistNums">{pctF(g.dist.eagle + g.dist.birdie, distTotal)}% birdie+ · {pctF(g.dist.par, distTotal)}% par · {pctF(g.dist.bogey, distTotal)}% bogey · {pctF(g.dist.double + g.dist.triple, distTotal)}% double+</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Strengths & weaknesses */}
      {ranked.length >= 4 && (
        <div className="haTopWrap">
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

      {/* Scoring distribution bar */}
      {td && td.total > 0 && (
        <div className="mt-4">
          <div className="h-sm">Distribuição de Scoring</div>
          <div className="haDistBar">
            {td.eagle > 0 && <div className="haDistSeg seg-eagle" style={{ width: `${(td.eagle / td.total * 100).toFixed(1)}%` }} title={`Eagle+: ${td.eagle}`} />}
            {td.birdie > 0 && <div className="haDistSeg seg-birdie" style={{ width: `${(td.birdie / td.total * 100).toFixed(1)}%` }} title={`Birdie: ${td.birdie}`} />}
            {td.par > 0 && <div className="haDistSeg seg-par" style={{ width: `${(td.par / td.total * 100).toFixed(1)}%` }} title={`Par: ${td.par}`} />}
            {td.bogey > 0 && <div className="haDistSeg seg-bogey" style={{ width: `${(td.bogey / td.total * 100).toFixed(1)}%` }} title={`Bogey: ${td.bogey}`} />}
            {td.double > 0 && <div className="haDistSeg seg-double" style={{ width: `${(td.double / td.total * 100).toFixed(1)}%` }} title={`Double: ${td.double}`} />}
            {td.triple > 0 && <div className="haDistSeg seg-triple" style={{ width: `${(td.triple / td.total * 100).toFixed(1)}%` }} title={`Triple+: ${td.triple}`} />}
          </div>
          <div className="haDistLegend">
            {td.eagle > 0 && <span className="haLeg"><span className="haLegDot seg-eagle" />Eagle+ {(td.eagle / td.total * 100).toFixed(1)}%</span>}
            {td.birdie > 0 && <span className="haLeg"><span className="haLegDot seg-birdie" />Birdie {(td.birdie / td.total * 100).toFixed(1)}%</span>}
            <span className="haLeg"><span className="haLegDot seg-par" />Par {(td.par / td.total * 100).toFixed(1)}%</span>
            {td.bogey > 0 && <span className="haLeg"><span className="haLegDot seg-bogey" />Bogey {(td.bogey / td.total * 100).toFixed(1)}%</span>}
            {td.double > 0 && <span className="haLeg"><span className="haLegDot seg-double" />Double {(td.double / td.total * 100).toFixed(1)}%</span>}
            {td.triple > 0 && <span className="haLeg"><span className="haLegDot seg-triple" />Triple+ {(td.triple / td.total * 100).toFixed(1)}%</span>}
          </div>
        </div>
      )}

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
