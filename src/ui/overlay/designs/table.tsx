/*
 * Designs TABLE — scorecards detalhados estilo broadcast/college.
 * V15 B&W Card, V28 Full Table, V31 To-Par Cumulat., V32 College Red,
 * V34 Clean White, V35 Accent Bar, V14 Compact Table, V16 Light Card, V17 Glass Card.
 */
import { II, OS, BN, SG, TS, vpC, vpCd, metaStr, hiChStr } from "../shared";
import { SC, SCL, TpBadge, StatsRow } from "../badges";
import { fmtToPar } from "../../../utils/format";
import type { P } from "../types";
void TpBadge;

/* V14 · COMPACT TABLE */
export function V14({ d, v, s, bg, tc="white", tc2, tc3 }: P) {
  /* W tem de ser >= sz (24) para evitar overlap dos badges nos bordos. */
  const is18 = d.scores.length >= 18; const W = 26;
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg ?? undefined, padding:"2px 5px", borderRadius:8, textShadow:TS }}>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3, flexWrap:"wrap" }}>
        <span style={{ fontFamily:OS, fontSize:36, fontWeight:700, lineHeight:1 }}>{s.sT}</span>
        <span style={{ fontSize:20, fontWeight:900, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</span>
        {(v.player||v.round) && <span style={{ fontSize:12, fontWeight:700, color:tc2, marginLeft:4 }}>{[v.player&&d.player,v.round&&`R${d.round}`].filter(Boolean).join(" · ")}</span>}
      </div>
      {(v.course||v.date||v.tee||v.teeDist) && <div style={{ fontSize:10, fontWeight:600, color:tc3, marginBottom:4 }}>{metaStr(d,{course:v.course,date:v.date,tee:v.tee,teeDist:v.teeDist})}</div>}
      {v.holeScores && (is18 ? [[0,9,s.sF,s.pF],[9,9,s.sB,s.pB]] as [number,number,number,number][] : [[0,d.scores.length,s.sT,s.pT] as [number,number,number,number]]).map(([off,len,sub,subP],ri) => (
        <div key={off}>
          <div style={{ display:"flex", background:"rgba(45,106,48,.65)", padding:"2px 0", borderRadius:ri===0?"5px 5px 0 0":0 }}>
            {Array.from({length:len},(_,i) => <div key={i} style={{width:W,textAlign:"center",fontSize:10,fontWeight:800,color:tc2}}>{off+i+1}</div>)}
            <div style={{ width:32, padding:"0 3px", fontSize:10, fontWeight:800, color:tc2 }}>{is18?(ri===0?"Out":"In"):"Tot"}</div>
          </div>
          {v.holePar && (
            <div style={{ display:"flex", padding:"1px 0", background:"rgba(255,255,255,.04)" }}>
              {d.par.slice(off,off+len).map((p,i) => <div key={i} style={{width:W,textAlign:"center",fontSize:10,fontWeight:600,color:tc3}}>{p}</div>)}
              <div style={{ width:32, padding:"0 3px", fontSize:10, fontWeight:700, color:tc3 }}>{subP}</div>
            </div>
          )}
          <div style={{ display:"flex", padding:"2px 0", borderBottom:ri===0&&is18?"1px solid rgba(255,255,255,.07)":"none" }}>
            {d.scores.slice(off,off+len).map((sc,i) => <div key={i} style={{width:W,display:"flex",justifyContent:"center"}}><SC sc={sc} par={d.par[off+i]} sz={24} /></div>)}
            <div style={{ width:32, padding:"0 3px", fontFamily:OS, fontSize:18, fontWeight:900, color:tc, display:"flex", alignItems:"center" }}>{sub}</div>
          </div>
          {ri===0&&is18 && <div style={{height:3}} />}
        </div>
      ))}
      {v.stats && <div style={{ marginTop:3 }}><StatsRow st={s.st} tc3={tc3} gap={5} fs={10} /></div>}
    </div>
  );
}

/* V15 · B&W CARD */
export function V15({ d, v, s, bg }: P) {
  const is18 = d.scores.length >= 18; const W = 24;
  const bdr = "1px solid #e5e7eb";
  return (
    <div style={{ fontFamily:II, display:"inline-block", background:bg||"rgba(255,255,255,0.95)", color:"#111", overflow:"hidden", borderRadius:8 }}>
      <div style={{ background:"rgba(26,39,68,0.95)", padding:"4px 8px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:6 }}>
        <div>
          {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:16, fontWeight:700, color:"#fff" }}>{d.player.toUpperCase()}</div>}
          {(v.event||v.round||v.position) && <div style={{ fontSize:10, fontWeight:700, color:"#e2e8f0", letterSpacing:.5 }}>{[v.event&&d.event,v.round&&`R${d.round}`,v.position&&d.position].filter(Boolean).join(" · ")}</div>}
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", flexShrink:0 }}>
          <div style={{ fontFamily:OS, fontSize:28, fontWeight:700, color:"#fff", lineHeight:1 }}>{s.sT}</div>
          <div style={{ fontSize:15, fontWeight:900, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</div>
        </div>
      </div>
      {v.holeScores && (is18 ? [[0,9,s.sF,s.pF,"Out"],[9,9,s.sB,s.pB,"In"]] as [number,number,number,number,string][] : [[0,d.scores.length,s.sT,s.pT,"Tot"] as [number,number,number,number,string]]).map(([off,len,sub,subP,lbl],ri) => (
        <div key={off}>
          <div style={{ display:"flex", background:"#f1f5f9", borderBottom:bdr }}>
            <div style={{ width:36, padding:"2px 4px", fontSize:10, fontWeight:700, color:"#64748b", borderRight:bdr }}>Hole</div>
            {Array.from({length:len},(_,i) => <div key={i} style={{width:W,textAlign:"center",fontSize:10,fontWeight:700,color:"#374151",borderRight:bdr}}>{off+i+1}</div>)}
            <div style={{ width:32, textAlign:"center", fontSize:10, fontWeight:800, color:"#374151" }}>{lbl}</div>
          </div>
          {v.holePar && (
            <div style={{ display:"flex", borderBottom:bdr }}>
              <div style={{ width:36, padding:"2px 4px", fontSize:10, fontWeight:600, color:"#6b7280", borderRight:bdr }}>Par</div>
              {d.par.slice(off,off+len).map((p,i) => <div key={i} style={{width:W,textAlign:"center",fontSize:10,color:"#6b7280",borderRight:bdr}}>{p}</div>)}
              <div style={{ width:32, textAlign:"center", fontSize:11, fontWeight:700, color:"#374151" }}>{subP}</div>
            </div>
          )}
          <div style={{ display:"flex", borderBottom:ri===0&&is18?"2px solid #e5e7eb":bdr }}>
            <div style={{ width:36, padding:"2px 4px", fontSize:11, fontWeight:800, color:"#111", borderRight:bdr }}>Score</div>
            {d.scores.slice(off,off+len).map((sc,i) => <div key={i} style={{width:W,display:"flex",justifyContent:"center",padding:"1px 0",borderRight:bdr}}><SCL sc={sc} par={d.par[off+i]} sz={22} /></div>)}
            <div style={{ width:32, textAlign:"center", fontFamily:OS, fontSize:16, fontWeight:900, color:"#111", display:"flex", alignItems:"center", justifyContent:"center" }}>{sub}</div>
          </div>
        </div>
      ))}
      <div style={{ padding:"3px 6px", background:"#f8fafc", borderTop:"1px solid #e5e7eb" }}>
        {v.stats && <div style={{ marginBottom:2 }}><StatsRow st={s.st} tc3="#94a3b8" gap={5} fs={10} /></div>}
        {(v.course||v.date||v.tee||v.teeDist||hiChStr(d,v,s)) && <div style={{ fontSize:10, fontWeight:600, color:"#9ca3af", wordBreak:"break-word", lineHeight:1.4 }}>{[metaStr(d,{course:v.course,date:v.date,tee:v.tee,teeDist:v.teeDist}),hiChStr(d,v,s)].filter(Boolean).join(" · ")}</div>}
      </div>
    </div>
  );
}

/* V16 · LIGHT CARD */
export function V16({ d, v, s, bg }: P) {
  const is18 = d.scores.length >= 18; const W = 26;
  return (
    <div style={{ fontFamily:II, display:"inline-block", background:bg||"rgba(255,255,255,0.92)", borderRadius:8, padding:"3px 5px", color:"#222", border:"1px solid rgba(0,0,0,.08)" }}>
      {(v.course||v.date||v.tee||v.teeDist||v.round) && (
        <div style={{ borderBottom:"1px solid #e5e7eb", paddingBottom:3, marginBottom:3 }}>
          {v.course&&d.course && <div style={{ fontSize:13, fontWeight:900, color:"#111" }}>{d.course}</div>}
          {(v.date||v.tee||v.teeDist||v.round) && <div style={{ fontSize:9, fontWeight:600, color:"#999" }}>{metaStr(d,{date:v.date,tee:v.tee,teeDist:v.teeDist,round:v.round})}</div>}
        </div>
      )}
      {v.holeScores && (is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len],ri) => {
        const isLast = !is18 || ri===1;
        const subP = d.par.slice(off,off+len).reduce((a,b)=>a+b,0);
        const subS = d.scores.slice(off,off+len).reduce((a,b)=>a+b,0);
        return (
          <div key={off}>
            <div style={{ display:"flex", background:"#1e3a2f", borderRadius:ri===0?"5px 5px 0 0":0, padding:"2px 0" }}>
              <div style={{ width:36, padding:"0 4px", fontSize:9, fontWeight:800, color:"#aaaaaa", display:"flex", alignItems:"center" }}>Hole</div>
              {Array.from({length:len},(_,i) => <div key={i} style={{width:W,textAlign:"center",fontSize:10,fontWeight:800,color:"#fff"}}>{off+i+1}</div>)}
              <div style={{ width:28, textAlign:"center", fontSize:9, fontWeight:800, color:"#aaaaaa" }}>{is18?(ri===0?"Out":"In"):"Tot"}</div>
              {isLast && <div style={{ width:34, textAlign:"center", fontSize:9, fontWeight:800, color:"#aaaaaa" }}>Tot</div>}
            </div>
            {v.holePar && (
              <div style={{ display:"flex", background:"#e8f5e9", padding:"1px 0" }}>
                <div style={{ width:36, padding:"0 4px", fontSize:10, fontWeight:700, color:"#2e7d32", display:"flex", alignItems:"center" }}>Par</div>
                {d.par.slice(off,off+len).map((p,i) => <div key={i} style={{width:W,textAlign:"center",fontSize:10,color:"#2e7d32",fontWeight:700}}>{p}</div>)}
                <div style={{ width:28, textAlign:"center", fontSize:11, fontWeight:800, color:"#2e7d32" }}>{subP}</div>
                {isLast && <div style={{ width:34, textAlign:"center", fontSize:11, fontWeight:800, color:"#2e7d32" }}>{s.pT}</div>}
              </div>
            )}
            <div style={{ display:"flex", padding:"2px 0", marginBottom:ri===0&&is18?3:0, alignItems:"center" }}>
              <div style={{ width:36, padding:"0 4px", fontSize:10, fontWeight:900, color:"#333", display:"flex", alignItems:"center" }}>Score</div>
              {d.scores.slice(off,off+len).map((sc,i) => <div key={i} style={{width:W,display:"flex",justifyContent:"center"}}><SCL sc={sc} par={d.par[off+i]} sz={24} /></div>)}
              <div style={{ width:28, textAlign:"center", fontSize:14, fontWeight:900, color:"#333", display:"flex", alignItems:"center", justifyContent:"center" }}>{subS}</div>
              {isLast && (
                <div style={{ width:34, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", borderLeft:"2px solid #1e3a2f", marginLeft:1, paddingLeft:3 }}>
                  <span style={{ fontFamily:OS, fontSize:16, fontWeight:900, color:"#111", lineHeight:1 }}>{s.sT}</span>
                  <span style={{ fontSize:10, fontWeight:900, color:vpCd(s.vpT), lineHeight:1 }}>{fmtToPar(s.vpT)}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {v.stats && <div style={{ marginTop:2 }}><StatsRow st={s.st} tc3="#94a3b8" gap={5} fs={9} /></div>}
    </div>
  );
}

/* V17 · GLASS CARD — W >= sz (26 >= 22) garante que nada se sobrepoe. */
export function V17({ d, v, s, bg, tc="white", tc2, tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18; const W = 26;
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:II, display:"inline-block", padding:"3px 6px 4px", background:bg||"rgba(0,0,0,.75)", borderRadius:10, color:tc, border:"1px solid rgba(255,255,255,.1)", textShadow:TS }}>
      {v.holeScores && (is18 ? [[0,"Out"],[9,"In"]] as [number,string][] : [[0,"Tot"] as [number,string]]).map(([off,label],ri) => {
        const cnt = is18?9:d.scores.length;
        const subS = d.scores.slice(off,off+cnt).reduce((a,b)=>a+b,0);
        const subP = d.par.slice(off,off+cnt).reduce((a,b)=>a+b,0);
        return (
          <div key={off} style={{ marginBottom:ri===0&&is18?2:0 }}>
            <div style={{ display:"flex", background:"rgba(45,106,48,.75)", borderRadius:ri===0?"6px 6px 0 0":0, padding:"3px 0" }}>
              <div style={{ width:46, padding:"0 6px", fontWeight:900, fontSize:11, color:"#fff" }}>Hole</div>
              {d.par.slice(off,off+cnt).map((_,i) => <div key={i} style={{width:W,textAlign:"center",fontWeight:800,fontSize:11,color:"#fff"}}>{off+i+1}</div>)}
              <div style={{ width:34, textAlign:"center", fontWeight:900, fontSize:11, color:"#fff" }}>{label}</div>
            </div>
            {v.holeSI && (
              <div style={{ display:"flex", padding:"1px 0", background:"rgba(255,255,255,.04)" }}>
                <div style={{ width:46, padding:"0 6px", fontSize:9, color:tc3 }}>S.I.</div>
                {d.si.slice(off,off+cnt).map((si,i) => <div key={i} style={{width:W,textAlign:"center",fontSize:9,color:tc3}}>{si}</div>)}
                <div style={{ width:34 }} />
              </div>
            )}
            {v.holePar && (
              <div style={{ display:"flex", padding:"2px 0", background:"rgba(255,255,255,.06)" }}>
                <div style={{ width:46, padding:"0 6px", fontSize:11, fontWeight:700, color:tc2 }}>Par</div>
                {d.par.slice(off,off+cnt).map((p,i) => <div key={i} style={{width:W,textAlign:"center",fontSize:11,color:tc2}}>{p}</div>)}
                <div style={{ width:34, textAlign:"center", fontWeight:800, fontSize:11, color:tc2 }}>{subP}</div>
              </div>
            )}
            <div style={{ display:"flex", padding:"2px 0", borderBottom:ri===0&&is18?"1px solid rgba(255,255,255,.09)":"none" }}>
              <div style={{ width:46, padding:"0 6px", fontWeight:900, fontSize:11, color:tc }}>Score</div>
              {d.scores.slice(off,off+cnt).map((sc,i) => <div key={i} style={{width:W,display:"flex",justifyContent:"center"}}><SC sc={sc} par={d.par[off+i]} sz={22} /></div>)}
              <div style={{ width:34, textAlign:"center", fontWeight:900, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", color:tc }}>{subS}</div>
            </div>
          </div>
        );
      })}
      {/* Footer: linha topo com 68 -4 + player/course/HI; stats em linha propria abaixo */}
      <div style={{ marginTop:3, padding:"3px 6px", background:"rgba(255,255,255,.07)", borderRadius:8 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:5 }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:5, flexShrink:0 }}>
            <span style={{ fontFamily:OS, fontSize:28, fontWeight:900, letterSpacing:-1 }}>{s.sT}</span>
            <span style={{ fontSize:16, fontWeight:900, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2, minWidth:0 }}>
            {v.player&&d.player && <div style={{ fontSize:13, fontWeight:900 }}>{d.player}</div>}
            {(v.course||v.date) && <div style={{ fontSize:10, fontWeight:600, color:tc2 }}>{[v.course&&d.course,v.date&&d.date].filter(Boolean).join(" · ")}</div>}
            {hcl && <div style={{ fontSize:10, fontWeight:700, color:tc4 }}>{hcl}</div>}
          </div>
        </div>
        {v.stats && (
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:4, paddingTop:3, borderTop:"1px solid rgba(255,255,255,.08)" }}>
            <StatsRow st={s.st} tc3={tc3} gap={5} fs={10} />
          </div>
        )}
      </div>
    </div>
  );
}

/* V28 · FULL TABLE — scorecard completo estilo Taylor McCormick/Grandhall. */
export function V28({ d, v, s, bg, tc="white", tc2, tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18; const W = 26;
  const hcl = hiChStr(d,v,s);
  const accent = "#e87722";
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg||"rgba(0,0,0,.88)", borderRadius:8, overflow:"hidden", textShadow:TS }}>
      {(v.player||v.event||v.round) && (
        <div style={{ padding:"4px 8px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`2px solid ${accent}` }}>
          <div>
            {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:15, fontWeight:700, letterSpacing:.5 }}>{d.player.toUpperCase()}</div>}
            {(v.event||v.round) && <div style={{ fontSize:9, fontWeight:700, color:tc3 }}>{[v.event&&d.event,v.round&&`ROUND ${d.round}`].filter(Boolean).join(" · ")}</div>}
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:OS, fontSize:32, fontWeight:900, lineHeight:1 }}>{s.sT}</div>
            <div style={{ fontSize:18, fontWeight:900, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</div>
          </div>
        </div>
      )}
      {v.holeScores && (is18 ? [[0,9,s.sF,s.pF,"FRONT"],[9,9,s.sB,s.pB,"BACK"]] as [number,number,number,number,string][] : [[0,d.scores.length,s.sT,s.pT,"TOT"] as [number,number,number,number,string]]).map(([off,len,sub,subP,lbl],ri) => (
        <div key={off}>
          <div style={{ display:"flex", background:accent, padding:"2px 0" }}>
            <div style={{ width:36, fontSize:8, fontWeight:800, color:"#fff", letterSpacing:1, display:"flex", alignItems:"center", paddingLeft:4 }}>HOLE</div>
            {Array.from({length:len},(_,i) => <div key={i} style={{width:W,textAlign:"center",fontSize:10,fontWeight:800,color:"#fff"}}>{off+i+1}</div>)}
            <div style={{ width:30, textAlign:"center", fontSize:8, fontWeight:800, color:"#fff", letterSpacing:1, display:"flex", alignItems:"center", justifyContent:"center" }}>{lbl}</div>
          </div>
          {v.holePar && (
            <div style={{ display:"flex", padding:"2px 0", background:"rgba(255,255,255,.06)" }}>
              <div style={{ width:36, fontSize:9, fontWeight:700, color:tc3, paddingLeft:4, display:"flex", alignItems:"center" }}>PAR</div>
              {d.par.slice(off,off+len).map((p,i) => <div key={i} style={{width:W,textAlign:"center",fontSize:10,fontWeight:700,color:tc2}}>{p}</div>)}
              <div style={{ width:30, textAlign:"center", fontSize:10, fontWeight:800, color:tc2 }}>{subP}</div>
            </div>
          )}
          <div style={{ display:"flex", padding:"2px 0", borderBottom:ri===0&&is18?`1px solid ${accent}`:"none" }}>
            <div style={{ width:36, fontSize:9, fontWeight:900, color:tc, paddingLeft:4, display:"flex", alignItems:"center" }}>SCORE</div>
            {d.scores.slice(off,off+len).map((sc,i) => <div key={i} style={{width:W,display:"flex",justifyContent:"center"}}><SC sc={sc} par={d.par[off+i]} sz={24} /></div>)}
            <div style={{ width:30, textAlign:"center", fontFamily:OS, fontSize:15, fontWeight:900, display:"flex", alignItems:"center", justifyContent:"center" }}>{sub}</div>
          </div>
        </div>
      ))}
      {(v.course||v.date||v.stats||hcl) && (
        <div style={{ padding:"3px 8px", background:"rgba(255,255,255,.05)", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:3 }}>
          <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
            {v.course&&d.course && <span style={{ fontSize:10, fontWeight:600, color:tc3 }}>{d.course}</span>}
            {v.date&&d.date && <span style={{ fontSize:9, fontWeight:600, color:tc4 }}>{d.date}</span>}
          </div>
          {v.stats && <StatsRow st={s.st} tc3={tc4} gap={4} fs={9} />}
        </div>
      )}
    </div>
  );
}

/* V31 · RUNNING TO-PAR TABLE */
export function V31({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const isDark = tc === "#ffffff" || tc === "white";
  const bdr = isDark ? "1px solid #444" : "1px solid #ddd";
  const bgFinal = bg || (isDark ? "rgba(20,20,30,0.95)" : "rgba(255,255,255,0.95)");
  const txColor = isDark ? "#eee" : "#222";
  const cumToPar: number[] = [];
  let cum = 0;
  d.scores.forEach((sc, i) => { cum += sc - d.par[i]; cumToPar.push(cum); });
  return (
    <div style={{ fontFamily:II, display:"inline-block", background:bgFinal ?? undefined, color:txColor, borderRadius:8, overflow:"hidden", border:isDark?"1px solid #333":"1px solid #e0e0e0" }}>
      {(v.player||v.event) && (
        <div style={{ padding:"5px 8px", background:"#1a2744", color:"#fff", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:16, fontWeight:700 }}>{d.player.toUpperCase()}</div>}
            {v.event&&d.event && <div style={{ fontSize:9, fontWeight:600, color:"#9ca3af" }}>{d.event}</div>}
          </div>
          <div style={{ textAlign:"right" }}>
            <span style={{ fontFamily:OS, fontSize:24, fontWeight:700 }}>{s.sT}</span>
            <span style={{ fontSize:14, fontWeight:900, color:vpC(s.vpT), marginLeft:4 }}>{fmtToPar(s.vpT)}</span>
          </div>
        </div>
      )}
      {v.holeScores && (is18 ? [[0,9,"Out"],[9,9,"In"]] as [number,number,string][] : [[0,d.scores.length,"Tot"] as [number,number,string]]).map(([off,len,lbl]) => (
        <div key={off}>
          <div style={{ display:"flex", background:isDark?"#1e2a3d":"#f1f5f9", borderBottom:bdr }}>
            <div style={{ width:42, padding:"2px 6px", fontSize:10, fontWeight:700, color:isDark?"#94a3b8":"#64748b", borderRight:bdr }}>{lbl}</div>
            {Array.from({length:len},(_,i) => <div key={i} style={{ width:28, textAlign:"center", fontSize:10, fontWeight:700, color:isDark?"#cbd5e1":"#374151", borderRight:bdr }}>{off+i+1}</div>)}
          </div>
          {v.holePar && (
            <div style={{ display:"flex", borderBottom:bdr }}>
              <div style={{ width:42, padding:"2px 6px", fontSize:10, fontWeight:600, color:isDark?"#94a3b8":"#6b7280", borderRight:bdr }}>Par</div>
              {d.par.slice(off,off+len).map((p,i) => <div key={i} style={{ width:28, textAlign:"center", fontSize:10, color:isDark?"#94a3b8":"#6b7280", borderRight:bdr }}>{p}</div>)}
            </div>
          )}
          <div style={{ display:"flex", borderBottom:bdr }}>
            <div style={{ width:42, padding:"2px 6px", fontSize:10, fontWeight:800, color:txColor, borderRight:bdr }}>Score</div>
            {d.scores.slice(off,off+len).map((sc,i) => <div key={i} style={{ width:28, display:"flex", justifyContent:"center", borderRight:bdr }}>{isDark ? <SC sc={sc} par={d.par[off+i]} sz={24} /> : <SCL sc={sc} par={d.par[off+i]} sz={24} />}</div>)}
          </div>
          <div style={{ display:"flex", borderBottom:isDark?"2px solid #333":"2px solid #e5e7eb" }}>
            <div style={{ width:42, padding:"2px 6px", fontSize:9, fontWeight:700, color:tc3||"#9ca3af", borderRight:bdr }}>To Par</div>
            {Array.from({length:len},(_,i) => {
              const tp = cumToPar[off+i];
              const col = tp < 0 ? "#dc2626" : tp > 0 ? "#2563eb" : (isDark?"#94a3b8":"#6b7280");
              return <div key={i} style={{ width:28, textAlign:"center", fontSize:9, fontWeight:700, color:col, borderRight:bdr }}>{tp > 0 ? `+${tp}` : tp === 0 ? "E" : String(tp)}</div>;
            })}
          </div>
        </div>
      ))}
      {(v.course||v.date||v.round) && (
        <div style={{ padding:"3px 8px", fontSize:9, fontWeight:600, color:tc3||"#9ca3af", display:"flex", justifyContent:"space-between" }}>
          <span>{[v.course&&d.course,v.round&&`R${d.round}`].filter(Boolean).join(" · ")}</span>
          {v.date&&d.date && <span>{d.date}</span>}
        </div>
      )}
    </div>
  );
}

/* V32 · OLE MISS TABLE — Tabela colorida estilo Ole Miss/SEC. */
export function V32({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const isDark = tc === "#ffffff" || tc === "white";
  const accent = "#be1e2d";
  const navy = "#14213d";
  const txColor = isDark ? "#eee" : navy;
  type Row = [number, number, number, string];
  const rows: Row[] = is18
    ? [[0, 9, s.sF, "OUT"], [9, 9, s.sB, "IN"]]
    : [[0, d.scores.length, s.sT, "TOT"]];
  return (
    <div style={{ fontFamily:OS, display:"inline-block", background:bg||(isDark?"rgba(20,20,40,0.95)":"rgba(255,255,255,0.95)"), color:txColor, borderRadius:8, overflow:"hidden" }}>
      <div style={{ background:navy, padding:"6px 10px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:18, fontWeight:700, color:"#fff", letterSpacing:1 }}>{d.player.toUpperCase()}</div>}
          {(v.event||v.round) && <div style={{ fontFamily:II, fontSize:9, fontWeight:600, color:"#94a3b8" }}>{[v.event&&d.event,v.round&&`R${d.round}`].filter(Boolean).join(" · ")}</div>}
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:40, fontWeight:700, color:"#fff", lineHeight:.85, letterSpacing:-2 }}>{s.sT}</div>
        </div>
      </div>
      {v.holeScores && rows.map(([off,len,sub,lbl]) => (
        <div key={off}>
          <div style={{ display:"flex", background:accent }}>
            {Array.from({length:len},(_,i) => <div key={i} style={{ width:30, textAlign:"center", fontSize:11, fontWeight:700, color:"#fff", padding:"2px 0" }}>{off+i+1}</div>)}
            <div style={{ width:36, textAlign:"center", fontSize:10, fontWeight:800, color:"#fff", padding:"2px 0", letterSpacing:1 }}>{lbl}</div>
          </div>
          <div style={{ display:"flex", borderBottom:"1px solid #e5e7eb" }}>
            {d.scores.slice(off,off+len).map((sc,i) => <div key={i} style={{ width:30, display:"flex", justifyContent:"center", padding:"2px 0" }}><SCL sc={sc} par={d.par[off+i]} sz={26} /></div>)}
            <div style={{ width:36, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:16, color:txColor }}>{sub}</div>
          </div>
        </div>
      ))}
      {(v.course||v.date||v.position) && (
        <div style={{ fontFamily:II, padding:"4px 10px", fontSize:9, fontWeight:600, color:tc3||"#9ca3af", display:"flex", justifyContent:"space-between", background:isDark?"rgba(255,255,255,.03)":"#f8fafc" }}>
          <span>{[v.course&&d.course,v.date&&d.date].filter(Boolean).join(" · ")}</span>
          {v.position&&d.position && <span style={{ fontWeight:800, color:txColor }}>{d.position}</span>}
        </div>
      )}
    </div>
  );
}

/* V34 · CLEAN WHITE — Estilo PGA/CBS broadcast, fundo branco puro. */
export function V34({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const isDark = tc === "#ffffff" || tc === "white";
  const bgF = bg || (isDark ? "#1a1e2a" : "#fff");
  const tx = isDark ? "#eee" : "#222";
  const tx2 = isDark ? "#94a3b8" : "#888";
  const tx3 = isDark ? "#64748b" : "#aaa";
  const bdr = isDark ? "1px solid #333" : "1px solid #e2e2e2";
  const rowBg = isDark ? "#1e2535" : "#fafafa";
  const cw = 28; const hw = 36;
  return (
    <div style={{ fontFamily:SG, display:"inline-block", background:bgF ?? undefined, color:tx, borderRadius:6, overflow:"hidden", border:isDark?"1px solid #333":"1px solid #ddd" }}>
      {(v.player||v.event||v.course) && (
        <div style={{ padding:"6px 10px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
          <div style={{ minWidth:0 }}>
            {v.player&&d.player && <div style={{ fontFamily:BN, fontSize:22, letterSpacing:1 }}>{d.player.toUpperCase()}</div>}
            {v.event&&d.event && <div style={{ fontSize:10, fontWeight:700, color:tc3||tx3, lineHeight:1.35 }}>{d.event}</div>}
            {(v.course||v.date) && <div style={{ fontSize:10, fontWeight:600, color:tc3||tx3, lineHeight:1.35 }}>{[v.course&&d.course,v.date&&d.date].filter(Boolean).join(" · ")}</div>}
          </div>
          <div style={{ display:"flex", alignItems:"baseline", gap:4, flexShrink:0 }}>
            <span style={{ fontFamily:BN, fontSize:36, color:tx }}>{s.sT}</span>
            <span style={{ fontSize:14, fontWeight:700, color:isDark?vpC(s.vpT):vpCd(s.vpT) }}>{fmtToPar(s.vpT)}</span>
          </div>
        </div>
      )}
      {v.holeScores && (is18 ? [[0,9,"Out",s.sF],[9,9,"In",s.sB]] as [number,number,string,number][] : [[0,d.scores.length,"Tot",s.sT] as [number,number,string,number]]).map(([off,len,lbl,sub]) => (
        <div key={off}>
          <div style={{ display:"flex", borderTop:bdr, background:rowBg }}>
            <div style={{ width:hw, textAlign:"center", fontSize:10, fontWeight:700, color:tx3, padding:"3px 0", borderRight:bdr }}>Hole</div>
            {Array.from({length:len},(_,i) => <div key={i} style={{ width:cw, textAlign:"center", fontSize:10, fontWeight:600, color:tx2, padding:"3px 0", borderRight:bdr }}>{off+i+1}</div>)}
            <div style={{ width:32, textAlign:"center", fontSize:10, fontWeight:700, color:tx3, padding:"3px 0" }}>{lbl}</div>
          </div>
          {v.holePar && (
            <div style={{ display:"flex", borderTop:bdr }}>
              <div style={{ width:hw, textAlign:"center", fontSize:10, fontWeight:600, color:tx3, padding:"2px 0", borderRight:bdr }}>Par</div>
              {d.par.slice(off,off+len).map((p,i) => <div key={i} style={{ width:cw, textAlign:"center", fontSize:10, color:tx3, padding:"2px 0", borderRight:bdr }}>{p}</div>)}
              <div style={{ width:32, textAlign:"center", fontSize:10, fontWeight:600, color:tx3, padding:"2px 0" }}>{off===0?s.pF:s.pB}</div>
            </div>
          )}
          <div style={{ display:"flex", borderTop:bdr }}>
            <div style={{ width:hw, textAlign:"center", fontSize:10, fontWeight:700, color:tx2, padding:"2px 0", borderRight:bdr }}></div>
            {d.scores.slice(off,off+len).map((sc,i) => <div key={i} style={{ width:cw, display:"flex", justifyContent:"center", padding:"2px 0", borderRight:bdr }}>{isDark ? <SC sc={sc} par={d.par[off+i]} sz={24} /> : <SCL sc={sc} par={d.par[off+i]} sz={24} />}</div>)}
            <div style={{ width:32, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:BN, fontSize:18 }}>{sub}</div>
          </div>
        </div>
      ))}
      {v.stats && (
        <div style={{ padding:"4px 10px", borderTop:bdr, display:"flex", justifyContent:"center" }}>
          <StatsRow st={s.st} tc3={tx3} gap={6} fs={10} />
        </div>
      )}
    </div>
  );
}

/* V35 · ACCENT BAR — Barra colorida no topo, resto branco. */
export function V35({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const isDark = tc === "#ffffff" || tc === "white";
  const accent = "#1a5632";
  const bgF = bg || (isDark ? "#1a1e2a" : "#fff");
  const tx = isDark ? "#eee" : "#222";
  const tx3 = isDark ? "#64748b" : "#aaa";
  const bdr = isDark ? "1px solid #333" : "1px solid #e5e5e5";
  const rowBg = isDark ? "#1e2535" : "#f8f8f8";
  const cw = 28;
  return (
    <div style={{ fontFamily:SG, display:"inline-block", background:bgF ?? undefined, color:tx, borderRadius:6, overflow:"hidden" }}>
      <div style={{ background:accent, padding:"6px 10px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          {v.player&&d.player && <div style={{ fontFamily:BN, fontSize:20, letterSpacing:1.5, color:"#fff" }}>{d.player.toUpperCase()}</div>}
          {(v.round||v.event) && <div style={{ fontSize:9, fontWeight:600, color:"rgba(255,255,255,.7)" }}>{[v.event&&d.event,v.round&&`R${d.round}`].filter(Boolean).join(" · ")}</div>}
        </div>
        <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
          <span style={{ fontFamily:BN, fontSize:34, color:"#fff" }}>{s.sT}</span>
          <span style={{ fontSize:14, fontWeight:700, color:"rgba(255,255,255,.85)" }}>{fmtToPar(s.vpT)}</span>
        </div>
      </div>
      {v.holeScores && (is18 ? [[0,9,"Out",s.sF],[9,9,"In",s.sB]] as [number,number,string,number][] : [[0,d.scores.length,"Tot",s.sT] as [number,number,string,number]]).map(([off,len,lbl,sub]) => (
        <div key={off}>
          <div style={{ display:"flex", borderTop:bdr, background:rowBg }}>
            {Array.from({length:len},(_,i) => <div key={i} style={{ width:cw, textAlign:"center", fontSize:10, fontWeight:700, color:tx3, padding:"2px 0", borderRight:bdr }}>{off+i+1}</div>)}
            <div style={{ width:32, textAlign:"center", fontSize:9, fontWeight:800, color:tx3, padding:"2px 0", letterSpacing:1 }}>{lbl}</div>
          </div>
          <div style={{ display:"flex", borderTop:bdr }}>
            {d.scores.slice(off,off+len).map((sc,i) => <div key={i} style={{ width:cw, display:"flex", justifyContent:"center", padding:"2px 0", borderRight:bdr }}>{isDark ? <SC sc={sc} par={d.par[off+i]} sz={24} /> : <SCL sc={sc} par={d.par[off+i]} sz={24} />}</div>)}
            <div style={{ width:32, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:BN, fontSize:18 }}>{sub}</div>
          </div>
        </div>
      ))}
      {(v.course||v.date) && (
        <div style={{ padding:"4px 10px", borderTop:bdr, fontSize:9, fontWeight:600, color:tc3||tx3, display:"flex", justifyContent:"space-between" }}>
          <span>{[v.course&&d.course,v.date&&d.date].filter(Boolean).join(" · ")}</span>
          {v.position&&d.position && <span style={{ fontWeight:800, color:tx }}>{d.position}</span>}
        </div>
      )}
    </div>
  );
}
