/*
 * Designs GRID — cards completos com fundo e blocos visuais.
 * V11 Giant Score, V22 Magazine, V10 Score Hero, V12 Tournament,
 * V6 Grint Row, V9 18Birdies, V13 Dashboard, V5 Ticket, V26 Signature.
 */
import React from "react";
import { II, OS, LO, BN, SG, TS, TS_SCORE, vpC, metaStr, hiChStr } from "../shared";
import { SC, SCQ, TpBadge, Grid2, StatsRow } from "../badges";
import { fmtToPar } from "../../../utils/format";
import type { P } from "../types";

/* V5 · TICKET */
export function V5({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:LO, width:230, color:tc, background:bg||"rgba(0,0,0,0.82)", borderRadius:6, padding:"3px 6px", border:"1px solid rgba(255,255,255,0.15)", textShadow:TS }}>
      {(v.player&&d.player || v.course&&d.course) && (
        <div style={{ textAlign:"center", borderBottom:"1px dashed rgba(255,255,255,0.2)", paddingBottom:6, marginBottom:4 }}>
          {v.player&&d.player && <div style={{ fontSize:20, fontWeight:700, fontStyle:"italic" }}>{d.player}</div>}
          {v.course&&d.course && <div style={{ fontFamily:II, fontSize:11, color:tc3, marginTop:1 }}>{d.course}</div>}
        </div>
      )}
      <div style={{ textAlign:"center", marginBottom:4 }}>
        <div style={{ fontFamily:II, fontSize:48, fontWeight:900, lineHeight:1, letterSpacing:-2, color:tc }}>{s.sT}</div>
        <div style={{ fontFamily:II, fontSize:22, fontWeight:900, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</div>
      </div>
      {v.holeScores && <Grid2 d={d} sz={28} gap={3} nc="#666" />}
      <div style={{ borderTop:"1px dashed rgba(255,255,255,0.2)", paddingTop:6, marginTop:3, fontFamily:II }}>
        {v.stats && <div className="u-flex-jc"><StatsRow st={s.st} tc3={tc3} gap={5} fs={11} /></div>}
        {(v.date||v.tee||v.teeDist||v.round||hcl||(v.position&&d.position)) && <div style={{ textAlign:"center", fontSize:10, fontWeight:600, color:tc4, marginTop:2 }}>{[v.date&&d.date, v.tee&&d.tee, (v.teeDist&&d.teeDist)?`${d.teeDist}m`:null, v.round&&`R${d.round}`, v.position&&d.position&&`POS ${d.position}`, hcl].filter(Boolean).join(" · ")}</div>}
      </div>
    </div>
  );
}

/* V6 · GRINT ROW */
export function V6({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  const hcl = hiChStr(d, v, s);
  return (
    <div style={{ fontFamily:SG, display:"inline-block", color:tc, background:bg, padding:"4px 6px", borderRadius:8, textShadow:TS }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:5, gap:8 }}>
        <div className="u-col-flex2">
          {(v.course||v.date||v.round) && <div style={{ fontSize:10, fontWeight:700, color:tc3, letterSpacing:.5 }}>{metaStr(d,{course:v.course,date:v.date,round:v.round})}</div>}
          {v.player&&d.player && <div style={{ fontFamily:BN, fontSize:26, letterSpacing:1.5, lineHeight:1.1 }}>{d.player.toUpperCase()}</div>}
        </div>
        <div style={{ textAlign:"right", flexShrink:0, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
          <div style={{ fontFamily:BN, fontSize:56, lineHeight:.9, letterSpacing:-1, color:tc, textShadow:TS_SCORE }}>{s.sT}</div>
          <TpBadge vp={s.vpT} sz={16} />
          {v.position&&d.position && <div style={{ fontSize:10, fontWeight:700, color:tc3 }}>{d.position}</div>}
        </div>
      </div>
      {v.holeScores && (
        <div>
          {(is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len]) => (
            <div key={off} style={{ display:"flex", gap:2, marginBottom:2 }}>
              {d.scores.slice(off,off+len).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} sz={28} />)}
            </div>
          ))}
        </div>
      )}
      {v.stats && <div style={{ marginTop:3 }}><StatsRow st={s.st} tc3={tc4} gap={5} fs={10} /></div>}
      {hcl && <div style={{ marginTop:2, fontSize:9, fontWeight:700, color:tc4, letterSpacing:1, opacity:.85 }}>{hcl}</div>}
    </div>
  );
}

/* V9 · 18BIRDIES */
export function V9({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  const hcl = hiChStr(d, v, s);
  return (
    <div style={{ fontFamily:SG, display:"inline-block", color:tc, background:bg||"rgba(15,15,25,0.9)", borderRadius:10, padding:"4px 6px", textShadow:TS }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
        <div>
          {v.course&&d.course && <div style={{ fontSize:14, fontWeight:700, letterSpacing:.3 }}>{d.course}</div>}
          <div style={{ fontSize:10, fontWeight:600, color:tc3 }}>Par {s.pT}{v.tee&&d.tee?` · ${d.tee}`:""}{v.teeDist&&d.teeDist?` · ${d.teeDist}m`:""}{v.date&&d.date?` · ${d.date}`:""}</div>
        </div>
        <div style={{ textAlign:"right", display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
          <div style={{ fontFamily:BN, fontSize:54, lineHeight:.9, letterSpacing:-1, color:tc, textShadow:TS_SCORE }}>{s.sT}</div>
          <TpBadge vp={s.vpT} sz={14} />
        </div>
      </div>
      {v.holeScores && (is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len]) => (
        <div key={off} style={{ display:"flex", gap:2, marginBottom:2 }}>
          {d.scores.slice(off,off+len).map((sc,i) => (
            <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
              <div style={{ fontSize:8, fontWeight:700, color:tc4 }}>{off+i+1}</div>
              <SCQ sc={sc} par={d.par[off+i]} sz={28} />
            </div>
          ))}
        </div>
      ))}
      {(v.player||(v.position&&d.position)) && (
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:3, fontSize:10, fontWeight:700, color:tc4, gap:4 }}>
          {v.player&&d.player ? <span>{d.player}</span> : <span />}
          {v.position&&d.position && <span>POS {d.position}</span>}
        </div>
      )}
      {v.stats && <div style={{ marginTop:2 }}><StatsRow st={s.st} tc3={tc4} gap={4} fs={10} /></div>}
      {hcl && <div style={{ marginTop:2, fontSize:9, fontWeight:700, color:tc4, opacity:.85 }}>{hcl}</div>}
    </div>
  );
}

/* V10 · SCORE HERO — bg HARDCODED escuro, força secundário sempre claro
   (subTheme do utilizador é ignorado aqui para evitar texto invisível). */
export function V10({ d, v, s, bg, tc="white", tc2 }: P) {
  const hcl = hiChStr(d,v,s);
  /* Secundário sempre claro porque o bg deste design é escuro fixo. */
  const _tc3 = "rgba(255,255,255,.7)";
  const _tc4 = "rgba(255,255,255,.55)";
  /* Calcular metaStr a priori — se for vazio NÃO renderiza o div (evita "espaço vazio"). */
  const metaLine = [metaStr(d,{course:v.course,round:v.round,date:v.date,tee:v.tee,teeDist:v.teeDist}),v.position&&d.position&&`POS ${d.position}`].filter(Boolean).join(" · ");
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg||"rgba(0,0,0,.78)", borderRadius:10, padding:"3px 5px", textAlign:"center", textShadow:TS }}>
      <div style={{ fontSize:9, fontWeight:700, letterSpacing:3, color:_tc3 }}>TO PAR</div>
      <div style={{ fontFamily:OS, fontSize:56, fontWeight:900, lineHeight:.9, letterSpacing:-3, margin:"2px 0", color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</div>
      <div style={{ fontSize:11, fontWeight:700, color:tc2 }}>Gross <span style={{ fontWeight:900, color:tc, fontSize:28 }}>{s.sT}</span></div>
      <div style={{ height:1, background:"rgba(255,255,255,.12)", margin:"6px 0" }} />
      {v.player&&d.player && <div style={{ fontSize:15, fontWeight:900, marginBottom:2 }}>{d.player}</div>}
      {metaLine && <div style={{ fontSize:10, color:_tc3, marginBottom:4, wordBreak:"break-word", lineHeight:1.4 }}>{metaLine}</div>}
      {v.holeScores && <div className="u-flex-jc"><Grid2 d={d} sz={28} gap={3} nc={_tc4} /></div>}
      {v.stats && <div style={{ display:"flex", justifyContent:"center", marginTop:3 }}><StatsRow st={s.st} tc3={_tc3} gap={4} fs={11} /></div>}
      {hcl && <div style={{ fontSize:10, fontWeight:700, color:_tc4, marginTop:3 }}>{hcl}</div>}
    </div>
  );
}

/* V11 · GIANT SCORE */
export function V11({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:OS, display:"inline-block", textAlign:"center", color:tc }}>
      <div style={{ background:bg||"rgba(0,0,0,.75)", borderRadius:10, padding:"3px 5px", textShadow:TS }}>
        {v.round && <div style={{ fontFamily:II, fontSize:9, fontWeight:700, letterSpacing:3, color:tc3 }}>ROUND {d.round}</div>}
        {v.player&&d.player && <div style={{ fontSize:18, fontWeight:700, letterSpacing:.3, marginTop:1, wordBreak:"break-word" }}>{d.player.toUpperCase()}</div>}
        {v.event&&d.event && <div style={{ fontFamily:II, fontSize:10, fontWeight:700, color:tc3 }}>{d.event}</div>}
        {(v.course||v.tee||v.teeDist||(v.position&&d.position)) && <div style={{ fontFamily:II, fontSize:10, fontWeight:600, color:tc3 }}>{[v.course&&d.course,v.tee&&d.tee,(v.teeDist&&d.teeDist)?`${d.teeDist}m`:null,v.position&&d.position&&`POS ${d.position}`].filter(Boolean).join(" · ")}</div>}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, margin:"6px 0 4px" }}>
          <span style={{ fontFamily:BN, fontSize:72, lineHeight:1, letterSpacing:-2, color:tc, textShadow:TS_SCORE }}>{s.sT}</span>
          <TpBadge vp={s.vpT} sz={20} />
        </div>
        <div style={{ fontFamily:II, fontSize:10, fontWeight:700, color:tc3, marginBottom:4 }}>Par {s.pT}{v.date&&d.date?` · ${d.date}`:""}</div>
        {v.holeScores && <div className="u-flex-jc"><Grid2 d={d} sz={28} gap={3} nc={tc4} /></div>}
        {v.stats && <div style={{ display:"flex", justifyContent:"center", marginTop:3 }}><StatsRow st={s.st} tc3={tc3} gap={4} fs={11} /></div>}
        {hcl && <div style={{ fontFamily:II, fontSize:10, fontWeight:700, color:tc4, marginTop:3 }}>{hcl}</div>}
      </div>
    </div>
  );
}

/* V12 · TOURNAMENT */
export function V12({ d, v, s, bg, tc="white", tc2, tc3, tc4 }: P) {
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg||"rgba(15,35,60,.88)", borderRadius:8, overflow:"hidden", textShadow:TS }}>
      <div style={{ padding:"3px 6px 4px", display:"flex", alignItems:"center", gap:5 }}>
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:2 }}>
          {v.player&&d.player && <div style={{ fontSize:20, fontWeight:900 }}>{d.player}</div>}
          {(v.course||v.round||v.tee||v.teeDist) && <div style={{ fontSize:11, fontWeight:700, color:tc2 }}>{[v.course&&d.course,v.tee&&d.tee,v.teeDist&&d.teeDist&&`${d.teeDist}m`,v.round&&`R${d.round}`].filter(Boolean).join(" · ")}</div>}
          {(v.event||v.date) && <div style={{ fontSize:10, fontWeight:500, color:tc3 }}>{[v.event&&d.event,v.date&&d.date].filter(Boolean).join(" · ")}</div>}
          {hcl && <div style={{ fontSize:10, fontWeight:600, color:tc4 }}>{hcl}</div>}
        </div>
        <div style={{ textAlign:"right", flexShrink:0, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
          <div style={{ fontFamily:BN, fontSize:52, lineHeight:.9, letterSpacing:-1, color:tc, textShadow:TS_SCORE }}>{s.sT}</div>
          <TpBadge vp={s.vpT} sz={14} />
          {v.position&&d.position && <div style={{ fontSize:11, fontWeight:700, color:tc3 }}>{d.position}</div>}
        </div>
      </div>
      {v.holeScores && <div style={{ padding:"0 8px 6px", display:"flex", justifyContent:"center" }}><Grid2 d={d} sz={28} gap={3} nc={tc4} /></div>}
      {v.stats && <div style={{ padding:"3px 7px", background:"rgba(255,255,255,.05)", display:"flex" }}><StatsRow st={s.st} tc3={tc3} gap={5} fs={11} /></div>}
    </div>
  );
}

/* V13 · DASHBOARD — Bx extraído para evitar recriação em cada render */
function V13Bx({ val, label, c, big, tc, tc3 }: { val:string|number; label:string; c?:string; big?:boolean; tc:string; tc3:string }) {
  return (
    <div style={{ flex:1, background:"rgba(255,255,255,.07)", borderRadius:6, padding:big?"8px 8px":"5px 8px", textAlign:"center" }}>
      <div style={{ fontSize:big?30:20, fontWeight:900, color:c||tc }}>{val}</div>
      <div style={{ fontSize:9, fontWeight:700, color:tc3, letterSpacing:1, marginTop:1 }}>{label}</div>
    </div>
  );
}

/* V13 · DASHBOARD */
export function V13({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg||"rgba(15,25,45,.85)", borderRadius:8, padding:"3px 6px", textShadow:TS }}>
      {(v.player||v.course||(v.position&&d.position)) && (
        <div style={{ textAlign:"center", marginBottom:4 }}>
          {v.player&&d.player && <div style={{ fontSize:20, fontWeight:900 }}>{d.player}</div>}
          {(v.course||v.round||(v.position&&d.position)) && <div style={{ fontSize:10, fontWeight:500, color:tc3 }}>{[v.course&&d.course,v.round&&`R${d.round}`,v.position&&d.position&&`POS ${d.position}`].filter(Boolean).join(" · ")}</div>}
        </div>
      )}
      <div style={{ display:"flex", gap:5, marginBottom:3 }}>
        <V13Bx val={s.sT} label="SCORE" big tc={tc} tc3={tc3 || "#9ca3af"} />
        <V13Bx val={fmtToPar(s.vpT)} label="VS PAR" c={vpC(s.vpT)} big tc={tc} tc3={tc3 || "#9ca3af"} />
      </div>
      {v.stats && (
        <div style={{ display:"flex", gap:5, marginBottom:3 }}>
          <V13Bx val={s.st.birdies} label="BIRDIE" c="#dc2626" tc={tc} tc3={tc3 || "#9ca3af"} />
          <V13Bx val={s.st.pars} label="PAR" tc={tc} tc3={tc3 || "#9ca3af"} />
          <V13Bx val={s.st.bogeys} label="BOGEY" c="#5BADE6" tc={tc} tc3={tc3 || "#9ca3af"} />
        </div>
      )}
      {v.holeScores && <div className="u-flex-jc"><Grid2 d={d} sz={28} gap={3} nc={tc4} /></div>}
      {hcl && <div style={{ textAlign:"center", fontSize:10, fontWeight:700, color:tc4, marginTop:3 }}>{hcl}</div>}
    </div>
  );
}

/* V22 · MAGAZINE — score enorme dominante, grid 2×9 compacto abaixo. */
export function V22({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  const hcl = hiChStr(d, v, s);
  return (
    <div style={{ fontFamily:OS, display:"inline-flex", flexDirection:"column", alignItems:"center", color:tc, background:bg||"rgba(0,0,0,.72)", borderRadius:10, padding:"6px 12px 8px", minWidth:160, textShadow:TS }}>
      {v.player&&d.player && <div style={{ fontFamily:II, fontSize:11, fontWeight:800, letterSpacing:2, color:tc3, textTransform:"uppercase", wordBreak:"break-word", textAlign:"center" }}>{d.player}</div>}
      {(v.course||v.event||v.tee||v.teeDist) && <div style={{ fontFamily:II, fontSize:9, fontWeight:600, color:tc4, textAlign:"center", marginTop:1 }}>{[v.course&&d.course,v.event&&d.event,v.tee&&d.tee,v.teeDist&&d.teeDist&&`${d.teeDist}m`].filter(Boolean).join(" · ")}</div>}
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"center", gap:6, margin:"2px 0" }}>
        <span style={{ fontSize:72, fontWeight:700, lineHeight:.85, letterSpacing:-4 }}>{s.sT}</span>
        <span style={{ fontFamily:II, fontSize:22, fontWeight:900, color:vpC(s.vpT), paddingBottom:4 }}>{fmtToPar(s.vpT)}</span>
      </div>
      {v.holeScores && (
        <div style={{ display:"flex", flexDirection:"column", gap:2, marginTop:2 }}>
          {(is18 ? [[0,9,s.sF],[9,9,s.sB]] as [number,number,number][] : [[0,d.scores.length,s.sT] as [number,number,number]]).map(([off,len,sub]) => (
            <div key={off} style={{ display:"flex", alignItems:"center", gap:3 }}>
              <div style={{ display:"flex", gap:2 }}>
                {d.scores.slice(off,off+len).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} sz={26} />)}
              </div>
              <div style={{ fontFamily:II, fontSize:16, fontWeight:900, color:tc3, minWidth:22, textAlign:"center" }}>{sub}</div>
            </div>
          ))}
        </div>
      )}
      {(v.date||v.round||v.stats||(v.position&&d.position)) && (
        <div style={{ fontFamily:II, display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginTop:4 }}>
          {(v.date||v.round||(v.position&&d.position)) && <span style={{ fontSize:9, fontWeight:700, color:tc4 }}>{[v.round&&`R${d.round}`,v.position&&d.position&&`POS ${d.position}`,v.date&&d.date].filter(Boolean).join(" · ")}</span>}
          {v.stats && <StatsRow st={s.st} tc3={tc4} gap={4} fs={9} />}
        </div>
      )}
      {hcl && <div style={{ fontFamily:II, fontSize:9, fontWeight:700, color:tc4, opacity:.85, textAlign:"center", marginTop:2 }}>{hcl}</div>}
    </div>
  );
}

/* V26 · SIGNATURE — Elegante editorial, score dominante, grid compacto. */
export function V26({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  const hcl = hiChStr(d, v, s);
  return (
    <div style={{ fontFamily:LO, display:"inline-flex", flexDirection:"column", alignItems:"center", color:tc, background:bg||"rgba(0,0,0,.75)", borderRadius:10, padding:"6px 14px 8px", minWidth:140, textShadow:TS }}>
      {v.player&&d.player && <div style={{ fontSize:16, fontWeight:700, fontStyle:"italic", letterSpacing:.5, marginBottom:2, wordBreak:"break-word", textAlign:"center" }}>{d.player}</div>}
      {v.event&&d.event && <div style={{ fontFamily:II, fontSize:9, fontWeight:700, color:tc3, textTransform:"uppercase", letterSpacing:2, textAlign:"center", lineHeight:1.4 }}>{d.event}</div>}
      {(v.course||v.tee||v.teeDist) && <div style={{ fontFamily:II, fontSize:9, fontWeight:600, color:tc4, textTransform:"uppercase", letterSpacing:1.5, textAlign:"center", lineHeight:1.4 }}>{[v.course&&d.course,v.tee&&d.tee,v.teeDist&&d.teeDist&&`${d.teeDist}m`].filter(Boolean).join(" · ")}</div>}
      <div style={{ fontFamily:OS, fontSize:64, fontWeight:700, lineHeight:.9, letterSpacing:-3, margin:"4px 0 2px", color:tc }}>{s.sT}</div>
      <div style={{ fontFamily:II, fontSize:18, fontWeight:900, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</div>
      {v.holeScores && <div style={{ width:40, height:1, background:"rgba(255,255,255,.25)", margin:"6px 0 4px" }} />}
      {v.holeScores && (
        <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
          {(is18 ? [[0,9,s.sF],[9,9,s.sB]] as [number,number,number][] : [[0,d.scores.length,s.sT] as [number,number,number]]).map(([off,len,sub]) => (
            <div key={off} style={{ display:"flex", alignItems:"center", gap:2 }}>
              <div style={{ display:"flex", gap:2 }}>
                {d.scores.slice(off,off+len).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} sz={24} />)}
              </div>
              <div style={{ fontFamily:II, fontSize:14, fontWeight:900, color:tc3, minWidth:20, textAlign:"center" }}>{sub}</div>
            </div>
          ))}
        </div>
      )}
      {(v.round||v.date||v.stats||(v.position&&d.position)) && (
        <div style={{ fontFamily:II, display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginTop:4 }}>
          {(v.round||v.date||(v.position&&d.position)) && <span style={{ fontSize:9, fontWeight:600, color:tc4 }}>{[v.round&&`R${d.round}`,v.position&&d.position&&`POS ${d.position}`,v.date&&d.date].filter(Boolean).join(" · ")}</span>}
          {v.stats && <StatsRow st={s.st} tc3={tc4} gap={4} fs={9} />}
        </div>
      )}
      {hcl && <div style={{ fontFamily:II, fontSize:9, fontWeight:600, color:tc4, opacity:.85, textAlign:"center", marginTop:2 }}>{hcl}</div>}
    </div>
  );
}

/* V36 · F9 vs B9 COMPARE — análise das duas voltas em linhas horizontais.
   Cada nine é UMA linha com label + 9 circles + subtotal + vs par.
   Por baixo: breakdown stats por nine + linha de diferença. */
export function V36({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  const hcl = hiChStr(d, v, s);
  /* Stats por nine: contagem de eagles/birdies/pars/bogeys/etc. */
  const calcNine = (start: number) => {
    const st = { hio:0, eagles:0, birdies:0, pars:0, bogeys:0, doubles:0, triples:0 };
    for (let i = start; i < start + 9; i++) {
      const sc = d.scores[i]; const x = sc - d.par[i];
      if (sc === 1) st.hio++;
      else if (x <= -2) st.eagles++;
      else if (x === -1) st.birdies++;
      else if (x === 0) st.pars++;
      else if (x === 1) st.bogeys++;
      else if (x === 2) st.doubles++;
      else st.triples++;
    }
    return st;
  };
  /* Fallback para 9H — não dá para comparar. */
  if (!is18) {
    return (
      <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg||"rgba(0,0,0,.78)", borderRadius:10, padding:"10px 14px", textAlign:"center", minWidth:200 }}>
        <div style={{ fontSize:11, fontWeight:700, color:tc3, letterSpacing:1, textTransform:"uppercase" }}>F9 / B9 Compare</div>
        <div style={{ fontSize:12, color:tc3, marginTop:6 }}>Round de 9 buracos — sem comparação possível.</div>
      </div>
    );
  }
  const fNine = calcNine(0);
  const bNine = calcNine(9);
  /* Uma linha de stats inline. */
  const StatsLine = ({ st }: { st: typeof fNine }) => {
    const items = [
      { n:st.hio, l:"HIO", c:"#10b981" },
      { n:st.eagles, l:"Eagle", c:"#d4a017" },
      { n:st.birdies, l:"Bir", c:"#dc2626" },
      { n:st.pars, l:"Par", c:tc4 },
      { n:st.bogeys, l:"Bog", c:"#5BADE6" },
      { n:st.doubles, l:"Dbl", c:"#2B6EA0" },
      { n:st.triples, l:"Tri+", c:"#1B4570" },
    ].filter(x => x.n > 0);
    if (!items.length) return null;
    return (
      <div style={{ display:"flex", gap:6, alignItems:"center", fontSize:9, fontWeight:700, flexWrap:"wrap" }}>
        {items.map(x => (
          <span key={x.l} style={{ display:"inline-flex", alignItems:"center", gap:3 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:x.c, display:"inline-block" }} />
            <span style={{ color:x.c }}>{x.n} {x.l}</span>
          </span>
        ))}
      </div>
    );
  };
  /* Uma linha (Front 9 ou Back 9): label · 9 circles · subtotal · vs par. */
  const NineRow = ({ label, sub, vpar, scores, pars }: { label: string; sub: number; vpar: number; scores: number[]; pars: number[] }) => (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ fontFamily:OS, fontSize:10, fontWeight:800, letterSpacing:1.5, color:tc3, textTransform:"uppercase", minWidth:46, flexShrink:0 }}>{label}</span>
        {v.holeScores && (
          <div style={{ display:"flex", gap:1, flexShrink:0 }}>
            {scores.map((sc,i) => <SC key={i} sc={sc} par={pars[i]} sz={22} />)}
          </div>
        )}
        <span style={{ fontFamily:OS, fontSize:20, fontWeight:900, color:tc, marginLeft:"auto", minWidth:24, textAlign:"right" }}>{sub}</span>
        <span style={{ fontSize:11, fontWeight:900, color:vpC(vpar), minWidth:22, textAlign:"right" }}>{fmtToPar(vpar)}</span>
      </div>
    </div>
  );
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg||"rgba(0,0,0,.82)", borderRadius:10, padding:"6px 10px" }}>
      {/* Header: player + total */}
      {(v.player&&d.player) && (
        <div style={{ fontSize:13, fontWeight:900, textAlign:"center", letterSpacing:.5, marginBottom:3 }}>{d.player.toUpperCase()}</div>
      )}
      <div style={{ display:"flex", justifyContent:"center", alignItems:"baseline", gap:6, marginBottom:5 }}>
        <span style={{ fontSize:9, fontWeight:700, letterSpacing:2, color:tc3 }}>TOTAL</span>
        <span style={{ fontFamily:OS, fontSize:24, fontWeight:900, color:tc }}>{s.sT}</span>
        <span style={{ fontSize:13, fontWeight:900, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</span>
      </div>
      {/* 2 linhas: F9 + B9, cada uma com label · circles · sub · vs par */}
      <div style={{ display:"flex", flexDirection:"column", gap:4, paddingTop:6, borderTop:"1px solid rgba(255,255,255,.12)" }}>
        <NineRow label="Front 9" sub={s.sF} vpar={s.vpF} scores={d.scores.slice(0,9)} pars={d.par.slice(0,9)} />
        <NineRow label="Back 9"  sub={s.sB} vpar={s.vpB} scores={d.scores.slice(9)}   pars={d.par.slice(9)}   />
      </div>
      {/* Stats por nine + diff */}
      {v.stats && (
        <div style={{ marginTop:5, paddingTop:4, borderTop:"1px solid rgba(255,255,255,.08)", display:"flex", flexDirection:"column", gap:2 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:8, fontWeight:700, letterSpacing:1, color:tc3, minWidth:30 }}>F9</span>
            <StatsLine st={fNine} />
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:8, fontWeight:700, letterSpacing:1, color:tc3, minWidth:30 }}>B9</span>
            <StatsLine st={bNine} />
          </div>
        </div>
      )}
      {(v.event||v.course||v.date||(v.position&&d.position)||hcl) && (
        <div style={{ marginTop:4, fontSize:9, fontWeight:600, color:tc4, textAlign:"center", lineHeight:1.4, wordBreak:"break-word" }}>
          <div>{[v.event&&d.event,v.course&&d.course,v.position&&d.position&&`POS ${d.position}`,v.date&&d.date].filter(Boolean).join(" · ")}</div>
          {hcl && <div style={{ opacity:.85 }}>{hcl}</div>}
        </div>
      )}
    </div>
  );
}
