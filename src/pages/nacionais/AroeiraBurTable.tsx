import React from "react";
import type { AggStats } from "./types";

/* ── Aroeira buraco a buraco ── */
export default function AroeiraBurTable({ players }: { players: { nome: string; fed: string; agg: AggStats }[] }) {
  const com = players.filter(p => p.agg.aroeira.nRounds > 0 && p.agg.aroeira.holes.length === 18);
  if (com.length < 1) return null;
  const pars = com[0].agg.aroeira.holes.map(h => h.par ?? 4);
  const totalPar = pars.reduce((s, p) => s + p, 0);
  function bestAt(idx: number) {
    const vs = com.map(p => ({ fed: p.fed, d: p.agg.aroeira.holes[idx]?.diff })).filter(x => x.d != null);
    if (!vs.length) return null;
    return vs.reduce((b, x) => x.d! < b.d! ? x : b).fed;
  }
  const dc = (d: number | null) => d == null ? "var(--text-3)" : d <= 0 ? "var(--color-good)" : d < 0.75 ? "var(--text-1)" : d < 1.5 ? "var(--color-warn)" : "var(--color-bad)";
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-page)" }}>
        <div className="fw-800 fs-14">Aroeira — performance histórica no campo</div>
        <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>
          Médias buraco-a-buraco · últimos 6 meses · ★ melhor do grupo
        </div>
      </div>
      <div style={{ padding: "12px 16px", overflowX: "auto" }}>
        <table className="dtable-lg fs-12" >
          <thead>
            <tr>
              <th className="fs-11" style={{ width: 32 }}>B.</th>
              <th className="fs-11 ta-c" style={{ width: 28 }}>Par</th>
              {com.map(p => (
                <th key={p.fed} className="ta-c fs-12">
                  <a href={`/jogadores/${p.fed}?view=by_date`} target="_blank" rel="noopener noreferrer"
                    className="td-none"
                    style={{ color: "inherit" }}>{p.nome.split(" ").slice(0,2).join(" ")}</a>
                  <div style={{ fontSize: 9, color: "var(--text-3)", fontWeight: 400 }}>{p.agg.aroeira.nRounds}× · {p.agg.aroeira.avgGross?.toFixed(1)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[{l:"1ª Volta",r:[0,8]},{l:"2ª Volta",r:[9,17]}].map(({l,r}) => (
              <React.Fragment key={l}>
                <tr><td colSpan={2+com.length} style={{ fontSize: 10, fontWeight: 800, color:"var(--text-3)", padding:"8px 8px 3px", textTransform:"uppercase", letterSpacing:"0.07em", background:"var(--bg-page)" }}>{l}</td></tr>
                {Array.from({length:r[1]-r[0]+1},(_,i)=>r[0]+i).map(idx => {
                  const par=pars[idx]; const best=bestAt(idx);
                  return (
                    <tr key={idx}>
                      <td style={{ fontWeight:700 }}>{idx+1}</td>
                      <td style={{ textAlign:"center", fontWeight:700, fontSize:11,
                        color: par===3?"#92400e":par===5?"#1e40af":"var(--text-2)",
                        background: par===3?"#fef9c3":par===5?"#eff6ff":"transparent" }}>{par}</td>
                      {com.map(p => {
                        const h=p.agg.aroeira.holes[idx]; const isBest=best===p.fed;
                        return (
                          <td key={p.fed} className="ta-c">
                            <span style={{ fontWeight:isBest?800:600, color:dc(h?.diff??null) }}>
                              {h?.diff != null ? `${h.diff>0?"+":""}${h.diff.toFixed(2)}` : "–"}
                              {isBest && com.length>1 && <span style={{ color:"var(--color-good)", fontSize:9, marginLeft:2 }}>★</span>}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr style={{ borderTop:"1px solid var(--border)", background:"var(--bg-hover)" }}>
                  <td style={{ fontWeight:800, fontSize:11 }}>Sub</td>
                  <td style={{ textAlign:"center", fontWeight:700, color:"var(--text-2)" }}>{pars.slice(r[0],r[1]+1).reduce((s,p)=>s+p,0)}</td>
                  {com.map(p => {
                    const sub=p.agg.aroeira.holes.slice(r[0],r[1]+1).reduce((s,h)=>s+(h.diff??0),0);
                    return <td key={p.fed} style={{ textAlign:"center", fontWeight:800, color:dc(sub/(r[1]-r[0]+1)) }}>{sub>0?"+":""}{sub.toFixed(1)}</td>;
                  })}
                </tr>
              </React.Fragment>
            ))}
            <tr style={{ borderTop:"2px solid var(--border)" }}>
              <td style={{ fontWeight:800 }}>Total</td>
              <td style={{ textAlign:"center", fontWeight:700, color:"var(--text-2)" }}>{totalPar}</td>
              {com.map(p => {
                const total=p.agg.aroeira.holes.reduce((s,h)=>s+(h.diff??0),0);
                return (
                  <td key={p.fed} className="ta-c">
                    <div style={{ fontWeight:900, fontSize:14 }}>{p.agg.aroeira.avgGross?.toFixed(1)}</div>
                    <div style={{ fontSize:10, color:dc(total/18) }}>{total>0?"+":""}{total.toFixed(1)} vs par</div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
