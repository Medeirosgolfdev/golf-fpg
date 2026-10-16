/*
 * Designs GRID — cards completos com fundo e blocos visuais.
 * V11 Giant Score, V22 Magazine, V10 Score Hero, V12 Tournament,
 * V6 Grint Row, V9 18Birdies, V13 Dashboard, V5 Ticket, V26 Signature.
 */
import { II, OS, LO, BN, SG, TS, TS_SCORE, vpC, countHoles, ink } from "../shared";
import { SC, SCQ, TpBadge, Grid2, StatsRow, Info } from "../badges";
import { fmtToPar } from "../../../utils/format";
import type { P } from "../types";

/* V5 · TICKET */
export function V5({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  return (
    <div style={{ fontFamily:LO, display:"inline-block", minWidth:230, color:tc, background:bg||"rgba(0,0,0,0.82)", borderRadius:6, padding:"3px 6px", border:`1px solid ${ink(tc, .15)}`, textShadow:TS }}>
      <div style={{ textAlign:"center", borderBottom:`1px dashed ${ink(tc, .2)}`, paddingBottom:6, marginBottom:4 }}>
        {v.player&&d.player && <div style={{ fontSize:20, fontWeight:700, fontStyle:"italic" }}>{d.player}</div>}
        <div style={{ fontFamily:II }}><Info d={d} v={v} keys={["event", "course"]} tc={tc} tc3={tc3} fs={11} align="center" fit /></div>
      </div>
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"center", gap:8, marginBottom:4 }}>
        <div style={{ fontFamily:II, fontSize:48, fontWeight:900, lineHeight:1, letterSpacing:-2, color:tc }}>{s.sT}</div>
        <div style={{ fontFamily:II, fontSize:22, fontWeight:900, color:vpC(s.vpT, tc) }}>{fmtToPar(s.vpT)}</div>
      </div>
      {v.holeScores && <Grid2 d={d} sz={28} gap={3} nc={tc4} />}
      <div style={{ borderTop:`1px dashed ${ink(tc, .2)}`, paddingTop:5, marginTop:3, fontFamily:II }}>
        <Info d={d} v={v} keys={["round", "tee", "teeDist", "date", "position", "hiCh", "sd"]} tc={tc} tc3={tc3} fs={10} align="center" fit st={v.stats ? s.st : null} />
      </div>
    </div>
  );
}

/* V6 · GRINT ROW */
export function V6({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:SG, display:"inline-block", color:tc, background:bg ?? undefined, padding:"4px 6px", borderRadius:8, textShadow:TS }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:5, gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          {v.player&&d.player && <div style={{ fontFamily:BN, fontSize:26, letterSpacing:1.5, lineHeight:1.1 }}>{d.player.toUpperCase()}</div>}
          <Info d={d} v={v} keys={["event", "round", "course", "tee", "teeDist", "date"]} tc={tc} tc3={tc3} fs={10} fit />
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
              {d.scores.slice(off,off+len).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} h={off+i} sz={28} />)}
            </div>
          ))}
        </div>
      )}
      <Info d={d} v={v} keys={["hiCh", "sd"]} tc={tc} tc3={tc3} fs={10} fit st={v.stats ? s.st : null} mt={3} />
    </div>
  );
}

/* V9 · 18BIRDIES */
export function V9({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:SG, display:"inline-block", color:tc, background:bg||"rgba(15,15,25,0.9)", borderRadius:10, padding:"4px 6px", textShadow:TS }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginBottom:4 }}>
        <div style={{ flex:1, minWidth:0 }}>
          {v.player&&d.player && <div style={{ fontSize:15, fontWeight:800, letterSpacing:.3 }}>{d.player}</div>}
          <Info d={d} v={v} keys={["event", "round", "course", "tee", "teeDist", "date"]} tc={tc} tc3={tc3} fs={10} fit />
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
              <SCQ sc={sc} par={d.par[off+i]} h={off+i} sz={28} />
            </div>
          ))}
        </div>
      ))}
      <Info d={d} v={v} keys={["position", "hiCh", "sd"]} tc={tc} tc3={tc3} fs={10} fit st={v.stats ? s.st : null} mt={3} />
    </div>
  );
}

/* V10 · SCORE HERO — bg HARDCODED escuro, força secundário sempre claro
   (subTheme do utilizador é ignorado aqui para evitar texto invisível). */
export function V10({ d, v, s, bg, tc="white", tc2, tc3, tc4 }: P) {
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg||"rgba(0,0,0,.78)", borderRadius:10, padding:"3px 5px", textAlign:"center", textShadow:TS }}>
      <div style={{ fontSize:9, fontWeight:700, letterSpacing:3, color:tc3 }}>TO PAR</div>
      <div style={{ fontFamily:OS, fontSize:56, fontWeight:900, lineHeight:.9, letterSpacing:-3, margin:"2px 0", color:vpC(s.vpT, tc) }}>{fmtToPar(s.vpT)}</div>
      <div style={{ fontSize:11, fontWeight:700, color:tc2, lineHeight:1 }}>Gross <span style={{ fontWeight:900, color:tc, fontSize:28 }}>{s.sT}</span></div>
      <div style={{ height:1, background:ink(tc, .12), margin:"4px 0" }} />
      {v.player&&d.player && <div style={{ fontSize:15, fontWeight:900, marginBottom:2 }}>{d.player}</div>}
      <div style={{ marginBottom:4 }}><Info d={d} v={v} keys={["event", "round", "course", "tee", "teeDist", "date", "position"]} tc={tc} tc3={tc3} fs={10} align="center" fit /></div>
      {v.holeScores && <div className="u-flex-jc"><Grid2 d={d} sz={28} gap={3} nc={tc4} /></div>}
      <Info d={d} v={v} keys={["hiCh", "sd"]} tc={tc} tc3={tc3} fs={10} align="center" fit st={v.stats ? s.st : null} mt={3} />
    </div>
  );
}

/* V11 · GIANT SCORE */
export function V11({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  return (
    <div style={{ fontFamily:OS, display:"inline-block", textAlign:"center", color:tc }}>
      <div style={{ background:bg||"rgba(0,0,0,.75)", borderRadius:10, padding:"3px 5px", textShadow:TS }}>
        {v.player&&d.player && <div style={{ fontSize:18, fontWeight:700, letterSpacing:.3, marginTop:1, wordBreak:"break-word" }}>{d.player.toUpperCase()}</div>}
        <div style={{ fontFamily:II }}><Info d={d} v={v} keys={["event", "round", "course", "tee", "teeDist"]} tc={tc} tc3={tc3} fs={10} align="center" fit /></div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, margin:"4px 0 3px" }}>
          <span style={{ fontFamily:BN, fontSize:72, lineHeight:.85, letterSpacing:-2, color:tc, textShadow:TS_SCORE }}>{s.sT}</span>
          <TpBadge vp={s.vpT} sz={20} />
        </div>
        <div style={{ fontFamily:II, marginBottom:4 }}><Info d={d} v={v} keys={["date", "position", "hiCh", "sd"]} tc={tc} tc3={tc3} fs={10} align="center" fit /></div>
        {v.holeScores && <div className="u-flex-jc"><Grid2 d={d} sz={28} gap={3} nc={tc4} /></div>}
        {v.stats && <div style={{ fontFamily:II }}><Info d={d} v={v} keys={[]} tc={tc} tc3={tc3} fs={11} align="center" fit st={s.st} mt={3} /></div>}
      </div>
    </div>
  );
}

/* V12 · TOURNAMENT */
export function V12({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg||"rgba(15,35,60,.88)", borderRadius:8, overflow:"hidden", textShadow:TS }}>
      <div style={{ padding:"3px 6px 4px", display:"flex", alignItems:"center", gap:5 }}>
        <div style={{ flex:1, minWidth:0 }}>
          {v.player&&d.player && <div style={{ fontSize:20, fontWeight:900 }}>{d.player}</div>}
          <Info d={d} v={v} keys={["event", "round", "course", "tee", "teeDist", "date", "hiCh", "sd"]} tc={tc} tc3={tc3} fs={10} fit />
        </div>
        <div style={{ textAlign:"right", flexShrink:0, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
          <div style={{ fontFamily:BN, fontSize:52, lineHeight:.9, letterSpacing:-1, color:tc, textShadow:TS_SCORE }}>{s.sT}</div>
          <TpBadge vp={s.vpT} sz={14} />
          {v.position&&d.position && <div style={{ fontSize:11, fontWeight:700, color:tc3 }}>{d.position}</div>}
        </div>
      </div>
      {v.holeScores && <div style={{ padding:"0 8px 6px", display:"flex", justifyContent:"center" }}><Grid2 d={d} sz={28} gap={3} nc={tc4} /></div>}
      {v.stats && <div style={{ padding:"3px 7px", background:ink(tc, .05), display:"flex" }}><StatsRow st={s.st} tc3={tc3} gap={5} fs={11} /></div>}
    </div>
  );
}

/* V13 · DASHBOARD — Bx extraído para evitar recriação em cada render */
function V13Bx({ val, label, c, big, tc, tc3 }: { val:string|number; label:string; c?:string; big?:boolean; tc:string; tc3:string }) {
  return (
    <div style={{ flex:1, background:ink(tc, .07), borderRadius:6, padding:big?"4px 6px":"3px 4px", textAlign:"center" }}>
      <div style={{ fontSize:big?28:17, fontWeight:900, lineHeight:1.05, color:c||tc }}>{val}</div>
      <div style={{ fontSize:big?9:8, fontWeight:700, color:tc3, letterSpacing:big?1:.5, marginTop:1 }}>{label}</div>
    </div>
  );
}

/* V13 · DASHBOARD */
export function V13({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg||"rgba(15,25,45,.85)", borderRadius:8, padding:"3px 6px", textShadow:TS }}>
      <div style={{ textAlign:"center", marginBottom:4 }}>
        {v.player&&d.player && <div style={{ fontSize:20, fontWeight:900 }}>{d.player}</div>}
        <Info d={d} v={v} keys={["event", "round", "position", "course", "tee", "teeDist", "date"]} tc={tc} tc3={tc3} fs={10} align="center" fit />
      </div>
      <div style={{ display:"flex", gap:5, marginBottom:3 }}>
        <V13Bx val={s.sT} label="SCORE" big tc={tc} tc3={tc3 || "#9ca3af"} />
        <V13Bx val={fmtToPar(s.vpT)} label="VS PAR" c={vpC(s.vpT, tc)} big tc={tc} tc3={tc3 || "#9ca3af"} />
      </div>
      {v.stats && (
        <div style={{ display:"flex", gap:5, marginBottom:3 }}>
          {/* Só as categorias que aconteceram (um «0 BIRDIE» ocupava espaço sem dizer nada) */}
          {[
            { n: s.st.hio, l: "HIO", c: "#10b981" },
            { n: s.st.eagles, l: "EAGLE", c: "#d4a017" },
            { n: s.st.birdies, l: "BIRDIE", c: "#ef4444" },
            { n: s.st.pars, l: "PAR", c: undefined },
            { n: s.st.bogeys, l: "BOGEY", c: "#5BADE6" },
            { n: s.st.doubles + s.st.triples + s.st.quads, l: "DBL+", c: undefined },
          ].filter((x) => x.n > 0).map((x) => <V13Bx key={x.l} val={x.n} label={x.l} c={x.c} tc={tc} tc3={tc3 || "#9ca3af"} />)}
        </div>
      )}
      {v.holeScores && <div className="u-flex-jc"><Grid2 d={d} sz={28} gap={3} nc={tc4} /></div>}
      <Info d={d} v={v} keys={["hiCh", "sd"]} tc={tc} tc3={tc3} fs={10} align="center" fit mt={3} />
    </div>
  );
}

/* V22 · MAGAZINE — score enorme dominante, grid 2×9 compacto abaixo. */
export function V22({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:OS, display:"inline-flex", flexDirection:"column", alignItems:"center", color:tc, background:bg||"rgba(0,0,0,.72)", borderRadius:10, padding:"6px 12px 8px", minWidth:160, textShadow:TS }}>
      {v.player&&d.player && <div style={{ fontFamily:II, fontSize:13, fontWeight:800, letterSpacing:2, textTransform:"uppercase", wordBreak:"break-word", textAlign:"center" }}>{d.player}</div>}
      <div style={{ fontFamily:II, alignSelf:"stretch" }}><Info d={d} v={v} keys={["event", "round", "course", "tee", "teeDist"]} tc={tc} tc3={tc3} fs={10} align="center" fit /></div>
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"center", gap:6, margin:"2px 0" }}>
        <span style={{ fontSize:72, fontWeight:700, lineHeight:.85, letterSpacing:-4 }}>{s.sT}</span>
        <span style={{ fontFamily:II, fontSize:22, fontWeight:900, color:vpC(s.vpT, tc), paddingBottom:4 }}>{fmtToPar(s.vpT)}</span>
      </div>
      {v.holeScores && (
        <div style={{ display:"flex", flexDirection:"column", gap:2, marginTop:2 }}>
          {(is18 ? [[0,9,s.sF],[9,9,s.sB]] as [number,number,number][] : [[0,d.scores.length,s.sT] as [number,number,number]]).map(([off,len,sub]) => (
            <div key={off} style={{ display:"flex", alignItems:"center", gap:3 }}>
              <div style={{ display:"flex", gap:2 }}>
                {d.scores.slice(off,off+len).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} h={off+i} sz={26} />)}
              </div>
              <div style={{ fontFamily:II, fontSize:16, fontWeight:900, color:tc3, minWidth:22, textAlign:"center" }}>{sub}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontFamily:II, alignSelf:"stretch" }}><Info d={d} v={v} keys={["date", "position", "hiCh", "sd"]} tc={tc} tc3={tc3} fs={10} align="center" fit st={v.stats ? s.st : null} mt={4} /></div>
    </div>
  );
}

/* V26 · SIGNATURE — Elegante editorial, score dominante, grid compacto. */
export function V26({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:LO, display:"inline-flex", flexDirection:"column", alignItems:"center", color:tc, background:bg||"rgba(0,0,0,.75)", borderRadius:10, padding:"6px 14px 8px", minWidth:140, textShadow:TS }}>
      {v.player&&d.player && <div style={{ fontSize:16, fontWeight:700, fontStyle:"italic", letterSpacing:.5, marginBottom:2, wordBreak:"break-word", textAlign:"center" }}>{d.player}</div>}
      <div style={{ fontFamily:II, alignSelf:"stretch" }}><Info d={d} v={v} keys={["event", "round", "course", "tee", "teeDist"]} tc={tc} tc3={tc3} fs={9} upper align="center" fit /></div>
      <div style={{ display:"flex", alignItems:"baseline", gap:6, margin:"4px 0 2px" }}>
        <span style={{ fontFamily:OS, fontSize:60, fontWeight:700, lineHeight:.9, letterSpacing:-3, color:tc }}>{s.sT}</span>
        <span style={{ fontFamily:II, fontSize:18, fontWeight:900, color:vpC(s.vpT, tc) }}>{fmtToPar(s.vpT)}</span>
      </div>
      {v.holeScores && <div style={{ width:40, height:1, background:ink(tc, .25), margin:"3px 0 4px" }} />}
      {v.holeScores && (
        <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
          {(is18 ? [[0,9,s.sF],[9,9,s.sB]] as [number,number,number][] : [[0,d.scores.length,s.sT] as [number,number,number]]).map(([off,len,sub]) => (
            <div key={off} style={{ display:"flex", alignItems:"center", gap:2 }}>
              <div style={{ display:"flex", gap:2 }}>
                {d.scores.slice(off,off+len).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} h={off+i} sz={24} />)}
              </div>
              <div style={{ fontFamily:II, fontSize:14, fontWeight:900, color:tc3, minWidth:20, textAlign:"center" }}>{sub}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontFamily:II, alignSelf:"stretch" }}><Info d={d} v={v} keys={["date", "position", "hiCh", "sd"]} tc={tc} tc3={tc3} fs={10} align="center" fit st={v.stats ? s.st : null} mt={4} /></div>
    </div>
  );
}

/* V36 · F9 vs B9 COMPARE — análise das duas voltas em linhas horizontais.
   Cada nine é UMA linha com label + 9 circles + subtotal + vs par.
   Por baixo: breakdown stats por nine + linha de diferença. */
export function V36({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  /* Fallback para 9H — não dá para comparar. */
  if (!is18) {
    return (
      <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg||"rgba(0,0,0,.78)", borderRadius:10, padding:"10px 14px", textAlign:"center", minWidth:200 }}>
        <div style={{ fontSize:11, fontWeight:700, color:tc3, letterSpacing:1, textTransform:"uppercase" }}>F9 / B9 Compare</div>
        <div style={{ fontSize:12, color:tc3, marginTop:6 }}>Round de 9 buracos — sem comparação possível.</div>
      </div>
    );
  }
  const fNine = countHoles(d.scores, d.par, 0, 9);
  const bNine = countHoles(d.scores, d.par, 9, 18);
  /* Uma linha (Front 9 ou Back 9): label · 9 circles · subtotal · vs par. */
  const NineRow = ({ label, sub, vpar, scores, pars, off }: { label: string; sub: number; vpar: number; scores: number[]; pars: number[]; off: number }) => (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ fontFamily:OS, fontSize:10, fontWeight:800, letterSpacing:1.5, color:tc3, textTransform:"uppercase", minWidth:46, flexShrink:0 }}>{label}</span>
        {v.holeScores && (
          <div style={{ display:"flex", gap:1, flexShrink:0 }}>
            {scores.map((sc,i) => <SC key={i} sc={sc} par={pars[i]} sz={22} h={off+i} />)}
          </div>
        )}
        <span style={{ fontFamily:OS, fontSize:20, fontWeight:900, color:tc, marginLeft:"auto", minWidth:24, textAlign:"right" }}>{sub}</span>
        <span style={{ fontSize:11, fontWeight:900, color:vpC(vpar, tc), minWidth:22, textAlign:"right" }}>{fmtToPar(vpar)}</span>
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
        <span style={{ fontSize:13, fontWeight:900, color:vpC(s.vpT, tc) }}>{fmtToPar(s.vpT)}</span>
      </div>
      {/* 2 linhas: F9 + B9, cada uma com label · circles · sub · vs par */}
      <div style={{ display:"flex", flexDirection:"column", gap:4, paddingTop:6, borderTop:`1px solid ${ink(tc, .12)}` }}>
        <NineRow label="Front 9" sub={s.sF} vpar={s.vpF} scores={d.scores.slice(0,9)} pars={d.par.slice(0,9)} off={0} />
        <NineRow label="Back 9"  sub={s.sB} vpar={s.vpB} scores={d.scores.slice(9)}   pars={d.par.slice(9)}   off={9} />
      </div>
      {/* Stats por nine + diff */}
      {v.stats && (
        <div style={{ marginTop:5, paddingTop:4, borderTop:`1px solid ${ink(tc, .08)}`, display:"flex", flexDirection:"column", gap:2 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:8, fontWeight:700, letterSpacing:1, color:tc3, minWidth:30 }}>F9</span>
            <StatsRow st={fNine} tc3={tc4} gap={6} fs={9} />
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:8, fontWeight:700, letterSpacing:1, color:tc3, minWidth:30 }}>B9</span>
            <StatsRow st={bNine} tc3={tc4} gap={6} fs={9} />
          </div>
        </div>
      )}
      <Info d={d} v={v} tc={tc} tc3={tc3} fs={10} align="center" fit mt={5} />
    </div>
  );
}
