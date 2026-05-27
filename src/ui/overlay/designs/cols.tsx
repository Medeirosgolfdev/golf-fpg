/*
 * Designs COLS — verticais (story format) e colunares.
 * V24 Story, V19 PGA Columns, V21 DP World, V33 College Grid.
 */
import React from "react";
import { II, OS, BN, TS, TS_SCORE, vpC, vpCd, hiChStr } from "../shared";
import { SC, TpBadge, StatsRow } from "../badges";
import { fmtToPar } from "../../../utils/format";
import type { P } from "../types";

/* V19 · PGA COLUMNS — sem barra horizontal */
export function V19({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const maxW = is18 ? 80 : 42;
  const teeLine = [v.tee && d.tee, v.teeDist && d.teeDist ? `${d.teeDist}m` : ""].filter(Boolean).join(" · ");
  const hcl = hiChStr(d, v, s);
  return (
    <div style={{ fontFamily:OS, display:"inline-flex", flexDirection:"column", alignItems:"center", color:tc, background:bg, overflow:"hidden", borderRadius:8, textShadow:TS, maxWidth: maxW + 40 }}>
      {(v.player||v.event||v.round) && (
        <div style={{ padding:"6px 8px 3px", textAlign:"center", maxWidth: maxW + 30, overflow:"hidden" }}>
          {v.player&&d.player && <div style={{ fontSize:16, fontWeight:700, lineHeight:1.2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{d.player.toUpperCase()}</div>}
          {v.event&&d.event && <div style={{ fontFamily:II, fontSize:8, fontWeight:700, letterSpacing:1, color:tc3, marginTop:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{d.event.toUpperCase()}</div>}
          {v.round && <div style={{ fontFamily:II, fontSize:8, fontWeight:700, letterSpacing:1, color:tc3 }}>R{d.round}</div>}
        </div>
      )}
      {v.holeScores && (
        <div style={{ display:"flex", justifyContent:"center", padding:"2px 5px 3px" }}>
          {is18 ? (
            [{off:0,sc:s.sF},{off:9,sc:s.sB}].map(({off,sc:sub},ci) => (
              <div key={off} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, borderRight:ci===0?"2px solid rgba(220,38,38,.35)":"none", paddingRight:ci===0?6:0, paddingLeft:ci===1?6:0 }}>
                {d.scores.slice(off,off+9).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} sz={22} />)}
                <div style={{ fontFamily:II, fontSize:12, fontWeight:900, marginTop:1 }}>{sub}</div>
              </div>
            ))
          ) : (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
              {d.scores.map((sc,i) => <SC key={i} sc={sc} par={d.par[i]} sz={22} />)}
            </div>
          )}
        </div>
      )}
      <div style={{ background:"rgba(255,255,255,.95)", padding:"3px 7px", textAlign:"center", width:"100%" }}>
        <div style={{ fontFamily:OS, fontSize:26, fontWeight:700, lineHeight:1, color:"#0d1e38" }}>{s.sT}</div>
        <div style={{ fontFamily:II, fontSize:14, fontWeight:900, color:vpCd(s.vpT), marginTop:0 }}>{fmtToPar(s.vpT)}</div>
      </div>
      {(v.course||teeLine||v.date||(v.position&&d.position)||hcl) && (
        <div style={{ fontFamily:II, padding:"3px 6px 5px", fontSize:9, fontWeight:600, color:tc3, textAlign:"center", lineHeight:1.6, maxWidth: maxW + 30, overflow:"hidden" }}>
          {v.course&&d.course && <div style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{d.course}</div>}
          {teeLine && <div>{teeLine}</div>}
          {v.position&&d.position && <div>POS {d.position}</div>}
          {v.date&&d.date && <div>{d.date}</div>}
          {hcl && <div style={{ opacity:.85 }}>{hcl}</div>}
        </div>
      )}
    </div>
  );
}

/* V21 · DP WORLD COLUMNS — extraído para evitar recriação em cada render */
function V21Col({ scores, pars, tc }: { scores:number[]; pars:number[]; tc:string }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, color:tc }}>
      {scores.map((sc,i) => <SC key={i} sc={sc} par={pars[i]} sz={24} />)}
    </div>
  );
}

/* V21 · DP WORLD COLUMNS */
export function V21({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:II, display:"inline-flex", flexDirection:"column", alignItems:"center", color:tc, background:bg||"rgba(0,0,0,.72)", padding:"10px 12px", borderRadius:10, textShadow:TS }}>
      {(v.player||v.position||v.event||v.round) && (
        <div style={{ width:"100%", marginBottom:4 }}>
          {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:13, fontWeight:700, letterSpacing:.3, textTransform:"uppercase", wordBreak:"break-word" }}>{d.player}</div>}
          {(v.position||v.event) && <div style={{ fontSize:10, fontWeight:600, color:tc3, marginTop:2 }}>{[v.position&&d.position,v.event&&d.event].filter(Boolean).join(" · ")}</div>}
          {v.round && <div style={{ fontSize:10, fontWeight:600, color:tc3 }}>Round {d.round}</div>}
        </div>
      )}
      <div style={{ display:"flex", alignItems:"flex-start", gap:6, margin:"4px 0" }}>
        <div style={{ fontFamily:OS, fontSize:38, fontWeight:900, letterSpacing:-2, lineHeight:1, color:tc }}>{s.sT}</div>
        <div style={{ fontFamily:II, fontSize:18, fontWeight:900, color:vpC(s.vpT), paddingTop:4 }}>{fmtToPar(s.vpT)}</div>
      </div>
      {v.holeScores && (
        <div style={{ display:"flex", alignItems:"flex-start" }}>
          <V21Col scores={d.scores.slice(0,is18?9:d.scores.length)} pars={d.par.slice(0,is18?9:d.par.length)} tc={tc} />
          {is18 && <>
            <div style={{ width:1, background:"rgba(255,255,255,.2)", margin:"0 8px", alignSelf:"stretch" }} />
            <V21Col scores={d.scores.slice(9)} pars={d.par.slice(9)} tc={tc} />
          </>}
        </div>
      )}
      {(v.course||v.date||(v.position&&d.position)||hiChStr(d,v,s)) && (
        <div style={{ marginTop:4, textAlign:"center" }}>
          {[v.course&&d.course,v.position&&d.position&&`POS ${d.position}`,v.date&&d.date].filter(Boolean).map((p,i) => (
            <div key={i} style={{ fontSize:10, fontWeight:600, color:tc4, lineHeight:1.7 }}>{p}</div>
          ))}
          {hiChStr(d,v,s) && <div style={{ fontSize:9, fontWeight:600, color:tc4, lineHeight:1.7, opacity:.85 }}>{hiChStr(d,v,s)}</div>}
        </div>
      )}
    </div>
  );
}

/* V24 · STORY — formato 9:16, fundo apenas na coluna de scores. */
export function V24({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  const hcl = hiChStr(d,v,s);
  const scoreBg = bg || "rgba(0,0,0,.78)";
  return (
    <div style={{ fontFamily:OS, display:"inline-flex", flexDirection:"column", alignItems:"center", color:tc, minWidth:120, textShadow:TS }}>
      {(v.round||v.event) && <div style={{ fontFamily:II, fontSize:8, fontWeight:800, letterSpacing:3, color:tc4, textTransform:"uppercase", maxWidth:180, textAlign:"center", wordBreak:"break-word", lineHeight:1.4 }}>{[v.event&&d.event,v.round&&`ROUND ${d.round}`].filter(Boolean).join(" · ")}</div>}
      {v.player&&d.player && <div style={{ fontSize:14, fontWeight:700, letterSpacing:1, marginTop:2, textTransform:"uppercase", wordBreak:"break-word", textAlign:"center" }}>{d.player}</div>}
      <div style={{ margin:"4px 0 2px", textAlign:"center" }}>
        <div style={{ fontSize:80, fontWeight:700, lineHeight:.9, letterSpacing:-5 }}>{s.sT}</div>
        <div style={{ fontFamily:II, fontSize:20, fontWeight:900, color:vpC(s.vpT), marginTop:2 }}>{fmtToPar(s.vpT)}</div>
      </div>
      {v.holeScores && is18 && (
        <div style={{ display:"flex", gap:6, marginTop:4, background:scoreBg, borderRadius:12, padding:"10px 12px" }}>
          {[{off:0,sub:s.sF},{off:9,sub:s.sB}].map(({off,sub},ci) => (
            <div key={off} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, borderRight:ci===0?"1px solid rgba(255,255,255,.15)":"none", paddingRight:ci===0?6:0 }}>
              {d.scores.slice(off,off+9).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} sz={26} />)}
              <div style={{ fontFamily:II, fontSize:12, fontWeight:900, color:tc3, marginTop:2 }}>{sub}</div>
            </div>
          ))}
        </div>
      )}
      {v.holeScores && !is18 && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, marginTop:4, background:scoreBg, borderRadius:12, padding:"10px 12px" }}>
          {d.scores.map((sc,i) => <SC key={i} sc={sc} par={d.par[i]} sz={26} />)}
        </div>
      )}
      {(v.course||v.date||v.stats||hcl||(v.position&&d.position)) && (
        <div style={{ fontFamily:II, textAlign:"center", marginTop:6, maxWidth:180, wordBreak:"break-word" }}>
          {v.course&&d.course && <div style={{ fontSize:10, fontWeight:600, color:tc3, lineHeight:1.4 }}>{d.course}</div>}
          {v.position&&d.position && <div style={{ fontSize:10, fontWeight:700, color:tc3 }}>POS {d.position}</div>}
          {v.date&&d.date && <div style={{ fontSize:9, fontWeight:600, color:tc4 }}>{d.date}</div>}
          {v.stats && <div style={{ display:"flex", justifyContent:"center", marginTop:2 }}><StatsRow st={s.st} tc3={tc4} gap={4} fs={9} /></div>}
          {hcl && <div style={{ fontSize:9, fontWeight:700, color:tc4, marginTop:2 }}>{hcl}</div>}
        </div>
      )}
    </div>
  );
}

/* V33 · COLLEGE GRID — Estilo Texas A&M, duas colunas verticais. */
export function V33({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const hcl = hiChStr(d, v, s);
  return (
    <div style={{ fontFamily:OS, display:"inline-block", color:tc, background:bg||"rgba(0,0,0,.85)", borderRadius:10, padding:"6px 8px", textShadow:TS }}>
      {v.player&&d.player && <div style={{ fontSize:12, fontFamily:II, fontWeight:800, letterSpacing:1, textTransform:"uppercase", textAlign:"center", marginBottom:4, color:tc3 }}>{d.player}</div>}
      {v.holeScores && is18 && (
        <div style={{ display:"flex", gap:4, justifyContent:"center" }}>
          {[{off:0,sub:s.sF,lbl:"FRONT"},{off:9,sub:s.sB,lbl:"BACK"}].map(({off,sub,lbl}) => (
            <div key={off} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
              {d.scores.slice(off,off+9).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} sz={30} />)}
              <div style={{ borderTop:"2px solid rgba(255,255,255,.2)", width:"100%", textAlign:"center", paddingTop:3, marginTop:2 }}>
                <div style={{ fontFamily:II, fontSize:8, fontWeight:700, letterSpacing:1, color:tc3 }}>{lbl}</div>
                <div style={{ fontSize:20, fontWeight:900, lineHeight:1 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {v.holeScores && !is18 && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
          {d.scores.map((sc,i) => <SC key={i} sc={sc} par={d.par[i]} sz={30} />)}
        </div>
      )}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginTop:6, paddingTop:4, borderTop:"1px solid rgba(255,255,255,.12)" }}>
        <span style={{ fontFamily:BN, fontSize:56, lineHeight:1, letterSpacing:-1, color:tc, textShadow:TS_SCORE }}>{s.sT}</span>
        <TpBadge vp={s.vpT} sz={16} />
      </div>
      {(v.event||v.course||v.date||v.round||(v.position&&d.position)||hcl) && (
        <div style={{ fontFamily:II, textAlign:"center", marginTop:3, fontSize:9, fontWeight:600, color:tc3, lineHeight:1.4, maxWidth:200, wordBreak:"break-word" }}>
          <div>{[v.event&&d.event,v.course&&d.course,v.round&&`R${d.round}`,v.position&&d.position&&`POS ${d.position}`,v.date&&d.date].filter(Boolean).join(" · ")}</div>
          {hcl && <div style={{ opacity:.85 }}>{hcl}</div>}
        </div>
      )}
    </div>
  );
}
