/*
 * Designs COLS — verticais (story format) e colunares.
 * V24 Story, V19 PGA Columns, V21 DP World, V33 College Grid.
 */
import { II, OS, BN, TS, TS_SCORE, vpC, fillA, ink, panel, isLightText, onColor } from "../shared";
import { SC, TpBadge, Info } from "../badges";
import { fmtToPar } from "../../../utils/format";
import type { P } from "../types";

/* V19 · PGA COLUMNS — sem barra horizontal */
export function V19({ d, v, s, fa, bg, tc="white", ta = tc, tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const maxW = is18 ? 80 : 42;
  return (
    <div style={{ fontFamily:OS, display:"inline-flex", flexDirection:"column", alignItems:"center", color:tc, background:bg ?? undefined, overflow:"hidden", borderRadius:8, textShadow:TS, maxWidth: maxW + 40 }}>
      {(v.player||v.event||v.round) && (
        <div style={{ padding:"6px 8px 3px", textAlign:"center", alignSelf:"stretch", wordBreak:"break-word" }}>
          {v.player&&d.player && <div style={{ fontSize:16, fontWeight:700, lineHeight:1.2, wordBreak:"break-word" }}>{d.player.toUpperCase()}</div>}
          <div style={{ fontFamily:II, marginTop:1 }}><Info d={d} v={v} keys={["event", "round"]} tc={tc} tc3={tc3} fs={9} upper align="center" fit /></div>
        </div>
      )}
      {v.holeScores && (
        <div style={{ display:"flex", justifyContent:"center", padding:"2px 5px 3px" }}>
          {is18 ? (
            [{off:0,sc:s.sF},{off:9,sc:s.sB}].map(({off,sc:sub},ci) => (
              <div key={off} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, borderRight:ci===0?`2px solid ${ink(tc, .25)}`:"none", paddingRight:ci===0?6:0, paddingLeft:ci===1?6:0 }}>
                {d.scores.slice(off,off+9).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} h={off+i} sz={22} />)}
                <div style={{ fontFamily:II, fontSize:12, fontWeight:900, marginTop:1 }}>{sub}</div>
              </div>
            ))
          ) : (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
              {d.scores.map((sc,i) => <SC key={i} sc={sc} par={d.par[i]} h={i} sz={22} />)}
            </div>
          )}
        </div>
      )}
      {/* Faixa do total no destaque do cartão */}
      <div style={{ background:fillA(ta, fa), padding:"3px 7px", textAlign:"center", width:"100%" }}>
        <div style={{ fontFamily:OS, fontSize:26, fontWeight:700, lineHeight:1, color:onColor(ta) }}>{s.sT}</div>
        <div style={{ fontFamily:II, fontSize:14, fontWeight:900, color:onColor(ta), opacity:.8, marginTop:0 }}>{fmtToPar(s.vpT)}</div>
      </div>
      <div style={{ fontFamily:II, padding:"3px 6px 5px", alignSelf:"stretch" }}>
        <Info d={d} v={v} keys={["course", "tee", "teeDist", "position", "date", "hiCh", "sd"]} tc={tc} tc3={tc3} fs={9} align="center" fit st={v.stats ? s.st : null} />
      </div>
    </div>
  );
}

/* V21 · DP WORLD COLUMNS — extraído para evitar recriação em cada render */
function V21Col({ scores, pars, tc, off = 0 }: { scores:number[]; pars:number[]; tc:string; off?: number }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, color:tc }}>
      {scores.map((sc,i) => <SC key={i} sc={sc} par={pars[i]} sz={24} h={off+i} />)}
    </div>
  );
}

/* V21 · DP WORLD COLUMNS */
export function V21({ d, v, s, bg, tc="white", ta = tc, tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    /* maxWidth ~150 (scores são só ~90px, força wrap em ~2 linhas de texto). */
    <div style={{ fontFamily:II, display:"inline-flex", flexDirection:"column", alignItems:"center", color:tc, background:bg||"rgba(0,0,0,.72)", padding:"10px 12px", borderRadius:10, textShadow:TS, maxWidth:150 }}>
      {(v.player||v.position||v.event||v.round) && (
        <div style={{ width:"100%", marginBottom:4, wordBreak:"break-word", overflowWrap:"anywhere" }}>
          {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:13, fontWeight:700, letterSpacing:.3, textTransform:"uppercase" }}>{d.player}</div>}
          <Info d={d} v={v} keys={["event", "round", "position"]} tc={tc} tc3={tc3} fs={10} mt={2} />
        </div>
      )}
      <div style={{ display:"flex", alignItems:"flex-start", gap:6, margin:"4px 0" }}>
        <div style={{ fontFamily:OS, fontSize:38, fontWeight:900, letterSpacing:-2, lineHeight:1, color:tc }}>{s.sT}</div>
        <div style={{ fontFamily:II, fontSize:18, fontWeight:900, color:vpC(s.vpT, tc, ta), paddingTop:4 }}>{fmtToPar(s.vpT)}</div>
      </div>
      {v.holeScores && (
        <div style={{ display:"flex", alignItems:"flex-start" }}>
          <V21Col scores={d.scores.slice(0,is18?9:d.scores.length)} pars={d.par.slice(0,is18?9:d.par.length)} tc={tc} />
          {is18 && <>
            <div style={{ width:1, background:ta, opacity:.6, margin:"0 8px", alignSelf:"stretch" }} />
            <V21Col scores={d.scores.slice(9)} pars={d.par.slice(9)} tc={tc} off={9} />
          </>}
        </div>
      )}
      <div style={{ alignSelf:"stretch" }}><Info d={d} v={v} keys={["course", "tee", "teeDist", "date", "hiCh", "sd"]} tc={tc} tc3={tc3} fs={10} align="center" fit st={v.stats ? s.st : null} mt={4} /></div>
    </div>
  );
}

/* V24 · STORY — formato 9:16, fundo apenas na coluna de scores. */
export function V24({ d, v, s, bg, tc="white", ta = tc, tc3 }: P) {
  const is18 = d.scores.length >= 18;
  /* Com fundo escolhido, o fundo envolve tudo (o texto solto não se lia sobre
     fotos claras) e a coluna dos scores fica um tom mais escura. */
  const scoreBg = bg ? panel(tc, isLightText(tc) ? .22 : .3) : "rgba(0,0,0,.78)";
  return (
    <div style={{ fontFamily:OS, display:"inline-flex", flexDirection:"column", alignItems:"center", color:tc, minWidth:120, textShadow:TS, background:bg ?? undefined, borderRadius:12, padding:bg ? "6px 10px 8px" : undefined }}>
      <div style={{ fontFamily:II, maxWidth:180 }}><Info d={d} v={v} keys={["event", "round"]} tc={tc} tc3={tc3} fs={9} upper align="center" /></div>
      {v.player&&d.player && <div style={{ fontSize:14, fontWeight:700, letterSpacing:1, marginTop:2, textTransform:"uppercase", wordBreak:"break-word", textAlign:"center" }}>{d.player}</div>}
      <div style={{ margin:"4px 0 2px", display:"flex", alignItems:"baseline", gap:6 }}>
        <div style={{ fontSize:72, fontWeight:700, lineHeight:.9, letterSpacing:-4 }}>{s.sT}</div>
        <div style={{ fontFamily:II, fontSize:20, fontWeight:900, color:vpC(s.vpT, tc, ta) }}>{fmtToPar(s.vpT)}</div>
      </div>
      {v.holeScores && is18 && (
        <div style={{ display:"flex", gap:6, marginTop:4, background:scoreBg, borderRadius:10, padding:"6px 8px" }}>
          {[{off:0,sub:s.sF},{off:9,sub:s.sB}].map(({off,sub},ci) => (
            <div key={off} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, borderRight:ci===0?`1px solid ${ta}`:"none", paddingRight:ci===0?6:0 }}>
              {d.scores.slice(off,off+9).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} h={off+i} sz={26} />)}
              <div style={{ fontFamily:II, fontSize:12, fontWeight:900, color:tc3, marginTop:2 }}>{sub}</div>
            </div>
          ))}
        </div>
      )}
      {v.holeScores && !is18 && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, marginTop:4, background:scoreBg, borderRadius:12, padding:"10px 12px" }}>
          {d.scores.map((sc,i) => <SC key={i} sc={sc} par={d.par[i]} h={i} sz={26} />)}
        </div>
      )}
      <div style={{ fontFamily:II, alignSelf:"stretch" }}><Info d={d} v={v} keys={["course", "tee", "teeDist", "position", "date", "hiCh", "sd"]} tc={tc} tc3={tc3} fs={10} align="center" fit st={v.stats ? s.st : null} mt={6} /></div>
    </div>
  );
}

/* V33 · COLLEGE GRID — Estilo Texas A&M, duas colunas verticais. */
export function V33({ d, v, s, bg, tc="white", ta = tc, tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    /* maxWidth ~160 (scores ~90px, força wrap do titulo do torneio). */
    <div style={{ fontFamily:OS, display:"inline-block", color:tc, background:bg||"rgba(0,0,0,.85)", borderRadius:10, padding:"6px 8px", textShadow:TS, maxWidth:160 }}>
      {v.player&&d.player && <div style={{ fontSize:12, fontFamily:II, fontWeight:800, letterSpacing:1, textTransform:"uppercase", textAlign:"center", marginBottom:4 }}>{d.player}</div>}
      {v.holeScores && is18 && (
        <div style={{ display:"flex", gap:4, justifyContent:"center" }}>
          {[{off:0,sub:s.sF,lbl:"FRONT"},{off:9,sub:s.sB,lbl:"BACK"}].map(({off,sub,lbl}) => (
            <div key={off} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
              {d.scores.slice(off,off+9).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} h={off+i} sz={30} />)}
              <div style={{ borderTop:`2px solid ${ta}`, width:"100%", textAlign:"center", paddingTop:3, marginTop:2 }}>
                <div style={{ fontFamily:II, fontSize:8, fontWeight:700, letterSpacing:1, color:tc3 }}>{lbl}</div>
                <div style={{ fontSize:20, fontWeight:900, lineHeight:1 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {v.holeScores && !is18 && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
          {d.scores.map((sc,i) => <SC key={i} sc={sc} par={d.par[i]} h={i} sz={30} />)}
        </div>
      )}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginTop:6, paddingTop:4, borderTop:`1px solid ${ink(tc, .12)}` }}>
        <span style={{ fontFamily:BN, fontSize:56, lineHeight:.85, letterSpacing:-1, color:tc, textShadow:TS_SCORE }}>{s.sT}</span>
        <TpBadge vp={s.vpT} sz={16} />
      </div>
      <div style={{ fontFamily:II }}><Info d={d} v={v} tc={tc} tc3={tc3} fs={10} align="center" fit st={v.stats ? s.st : null} mt={3} /></div>
    </div>
  );
}
