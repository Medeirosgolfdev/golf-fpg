/*
 * Designs MINIMAL — compactos: pills, strips, sem detalhe por buraco.
 * V25 Minimal, V1 Sticker, V2 Strip, V3 Front/Back, V4 Neon Ring,
 * V23 TV Broadcast, V27 Score Strip.
 */
import { II, OS, TS, vpC, ink } from "../shared";
import { SC, TpBadge, Info } from "../badges";
import { fmtToPar } from "../../../utils/format";
import type { P } from "../types";

/* V1 · STICKER — pill: score + nome numa linha; a info por baixo quebra na
   largura dessa linha (não estica o sticker). */
export function V1({ d, v, s, bg, tc="white", tc2, tc3 }: P) {
  return (
    <div style={{ fontFamily:II, display:"inline-block", minWidth:220, padding:"3px 10px 4px", borderRadius:12, background:bg||"rgba(0,0,0,.75)", color:tc, textShadow:TS }}>
      <div style={{ display:"flex", alignItems:"baseline", gap:6, whiteSpace:"nowrap" }}>
        <span style={{ fontFamily:OS, fontSize:22, fontWeight:900, color:vpC(s.vpT, tc) }}>{fmtToPar(s.vpT)}</span>
        <span style={{ fontFamily:OS, fontSize:22, fontWeight:700, color:tc }}>{s.sT}</span>
        {v.player&&d.player && <span style={{ fontSize:13, fontWeight:700, color:tc2 }}>{d.player}</span>}
      </div>
      <Info d={d} v={v} tc={tc} tc3={tc3} fs={10} fit st={v.stats ? s.st : null} mt={2} />
    </div>
  );
}

/* V2 · STRIP */
export function V2({ d, v, s, bg, tc="white", tc3 }: P) {
  return (
    <div style={{ fontFamily:II, display:"inline-flex", alignItems:"center", gap:6, padding:"4px 10px", background:bg||"rgba(0,0,0,.78)", color:tc, textShadow:TS }}>
      <div className="u-col-flex2">
        {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:18, fontWeight:700 }}>{d.player.toUpperCase()}</div>}
        <div style={{ minWidth:170, maxWidth:220 }}><Info d={d} v={v} tc={tc} tc3={tc3} fs={10} st={v.stats ? s.st : null} /></div>
      </div>
      <div style={{ width:1, background:ink(tc, .15), alignSelf:"stretch" }} />
      <div style={{ display:"flex", alignItems:"baseline", gap:5, flexShrink:0 }}>
        <span style={{ fontFamily:OS, fontSize:40, fontWeight:900, lineHeight:1, color:tc }}>{s.sT}</span>
        <span style={{ fontSize:18, fontWeight:900, color:vpC(s.vpT, tc) }}>{fmtToPar(s.vpT)}</span>
      </div>
    </div>
  );
}

/* V3 · FRONT/BACK */
export function V3({ d, v, s, bg, tc="white", tc2, tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const Half = ({ lbl, score, vpar }: { lbl:string; score:number; vpar:number }) => (
    <div style={{ display:"flex", alignItems:"center", padding:"3px 8px", gap:5 }}>
      <span style={{ fontSize:10, fontWeight:700, letterSpacing:1, color:tc3, minWidth:40 }}>{lbl}</span>
      <span style={{ fontFamily:OS, fontSize:26, fontWeight:900, lineHeight:1, color:tc, flex:1 }}>{score}</span>
      <span style={{ fontSize:16, fontWeight:900, color:vpC(vpar, tc) }}>{fmtToPar(vpar)}</span>
    </div>
  );
  return (
    <div style={{ fontFamily:II, display:"inline-flex", flexDirection:"column", background:bg||"rgba(0,0,0,.80)", color:tc, borderRadius:8, overflow:"hidden", minWidth:190, textShadow:TS }}>
      <div style={{ padding:"4px 8px 4px" }}>
        {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:18, fontWeight:700 }}>{d.player.toUpperCase()}</div>}
        <Info d={d} v={v} tc={tc} tc3={tc3} fs={10} fit />
      </div>
      <div style={{ height:1, background:ink(tc, .12) }} />
      {is18 && <>
        <Half lbl="FRONT" score={s.sF} vpar={s.vpF} />
        <div style={{ height:1, background:ink(tc, .08) }} />
        <Half lbl="BACK" score={s.sB} vpar={s.vpB} />
        <div style={{ height:1, background:ink(tc, .2) }} />
      </>}
      <div style={{ display:"flex", alignItems:"center", padding:"3px 8px", gap:5, background:ink(tc, .07) }}>
        <span style={{ fontSize:10, fontWeight:700, letterSpacing:1, color:tc2, minWidth:40 }}>TOTAL</span>
        <span style={{ fontFamily:OS, fontSize:36, fontWeight:900, lineHeight:1, color:tc, flex:1 }}>{s.sT}</span>
        <span style={{ fontSize:18, fontWeight:900, color:vpC(s.vpT, tc) }}>{fmtToPar(s.vpT)}</span>
      </div>
      {v.stats && <div style={{ padding:"3px 8px 4px", borderTop:`1px solid ${ink(tc, .08)}` }}><Info d={d} v={v} keys={[]} tc={tc} tc3={tc3} fs={10} fit st={s.st} /></div>}
    </div>
  );
}

/* V4 · NEON RING */
export function V4({ d, v, s, bg, tc="white", tc3 }: P) {
  return (
    <div style={{ fontFamily:II, width:180, color:tc, textAlign:"center", background:bg ?? undefined, padding:"3px 6px", borderRadius:10, textShadow:TS }}>
      {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:16, fontWeight:700, marginTop:2 }}>{d.player.toUpperCase()}</div>}
      <Info d={d} v={v} keys={["event", "round", "course", "tee", "teeDist"]} tc={tc} tc3={tc3} fs={10} align="center" />
      <div style={{ margin:"4px auto", width:90, height:90, borderRadius:"50%", border:`3px solid ${vpC(s.vpT, tc)}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <div style={{ fontFamily:OS, fontSize:34, fontWeight:900, lineHeight:1, letterSpacing:-1, color:tc }}>{s.sT}</div>
        <div style={{ fontSize:20, fontWeight:900, color:vpC(s.vpT, tc) }}>{fmtToPar(s.vpT)}</div>
      </div>
      <Info d={d} v={v} keys={["position", "date", "hiCh", "sd"]} tc={tc} tc3={tc3} fs={10} align="center" st={v.stats ? s.st : null} />
    </div>
  );
}

/* V23 · BROADCAST — Barra de TV, nome a esquerda, front·back·total à direita. */
export function V23({ d, v, s, bg, tc="white", tc2, tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:II, display:"inline-flex", alignItems:"stretch", background:bg||"rgba(15,30,60,.92)", color:tc, overflow:"hidden", borderRadius:6, textShadow:TS }}>
      <div style={{ padding:"4px 10px", display:"flex", flexDirection:"column", justifyContent:"center", borderRight:`2px solid ${ink(tc, .12)}`, minWidth:150, maxWidth:210 }}>
        {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:14, fontWeight:700, letterSpacing:.5, lineHeight:1.1 }}>{d.player.toUpperCase()}</div>}
        <Info d={d} v={v} keys={["event", "round", "course", "tee", "teeDist", "date", "hiCh", "sd"]} tc={tc} tc3={tc3} fs={9} st={v.stats ? s.st : null} mt={2} />
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:0 }}>
        {is18 && v.holeScores && (
          <>
            <div style={{ padding:"6px 8px", textAlign:"center", borderRight:`1px solid ${ink(tc, .08)}` }}>
              <div style={{ fontFamily:OS, fontSize:20, fontWeight:700, lineHeight:1 }}>{s.sF}</div>
              <div style={{ fontSize:8, fontWeight:700, letterSpacing:1, color:tc3 }}>FRONT</div>
            </div>
            <div style={{ padding:"6px 8px", textAlign:"center", borderRight:`1px solid ${ink(tc, .08)}` }}>
              <div style={{ fontFamily:OS, fontSize:20, fontWeight:700, lineHeight:1 }}>{s.sB}</div>
              <div style={{ fontSize:8, fontWeight:700, letterSpacing:1, color:tc3 }}>BACK</div>
            </div>
          </>
        )}
        <div style={{ padding:"4px 12px", textAlign:"center", background:ink(tc, .07) }}>
          <div style={{ fontFamily:OS, fontSize:28, fontWeight:900, lineHeight:1 }}>{s.sT}</div>
          <div style={{ fontSize:13, fontWeight:900, color:vpC(s.vpT, tc), marginTop:0 }}>{fmtToPar(s.vpT)}</div>
        </div>
      </div>
      {v.position&&d.position && <div style={{ padding:"4px 8px", display:"flex", alignItems:"center", fontSize:12, fontWeight:800, color:tc2 }}>{d.position}</div>}
    </div>
  );
}

/* V25 · MINIMAL — ultra-compacto: só score + toPar + nome. */
export function V25({ d, v, s, bg, tc="white", tc3 }: P) {
  return (
    <div style={{ fontFamily:OS, display:"inline-block", color:tc, background:bg||"rgba(0,0,0,.65)", borderRadius:8, padding:"4px 10px", textShadow:TS }}>
      <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
        <span style={{ fontSize:42, fontWeight:900, lineHeight:.85, letterSpacing:-2, color:tc }}>{s.sT}</span>
        <span style={{ fontFamily:II, fontSize:18, fontWeight:900, color:vpC(s.vpT, tc) }}>{fmtToPar(s.vpT)}</span>
        {v.player&&d.player && <span style={{ fontFamily:II, fontSize:12, fontWeight:700, color:tc3, marginLeft:2 }}>{d.player}</span>}
      </div>
      <div style={{ fontFamily:II, minWidth:200 }}><Info d={d} v={v} tc={tc} tc3={tc3} fs={10} fit st={v.stats ? s.st : null} mt={3} /></div>
    </div>
  );
}

/* V27 · SCORE STRIP — score grande + grid inline; nome e info por baixo,
   na largura da barra (ao lado ficavam numa coluna estreita e alta). */
export function V27({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg||"rgba(0,0,0,.78)", borderRadius:8, padding:"4px 10px 6px", textShadow:TS }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
          <span style={{ fontFamily:OS, fontSize:44, fontWeight:900, lineHeight:1, letterSpacing:-2, color:tc }}>{s.sT}</span>
          <TpBadge vp={s.vpT} sz={14} />
        </div>
        {v.holeScores && (
          <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
            {(is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len]) => (
              <div key={off} style={{ display:"flex", gap:1 }}>
                {d.scores.slice(off,off+len).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} h={off+i} sz={20} />)}
              </div>
            ))}
          </div>
        )}
      </div>
      {v.player&&d.player && <div style={{ fontSize:12, fontWeight:800, marginTop:3 }}>{d.player}</div>}
      <Info d={d} v={v} tc={tc} tc3={tc3} fs={9} fit st={v.stats ? s.st : null} mt={1} />
    </div>
  );
}
