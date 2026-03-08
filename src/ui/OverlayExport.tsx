import React, { useState, useMemo, useRef, useCallback } from "react";

/* ═══════ TYPES ═══════ */
export type OverlayData = {
  courseName: string; teeName: string; teeDist: number | null;
  cr: number; slope: number;
  par: number[]; scores: (number | null)[]; si: number[];
  hi: number | null; courseHcp: number | null; sd: number | null;
  is9h: boolean; hasHoles: boolean;
  player: string; event: string; round: number; date: string; position: string;
};
type DD = {
  player: string; event: string; round: number; date: string; position: string;
  course: string; tee: string; teeDist: number | null;
  cr: number; slope: number;
  par: number[]; scores: number[]; si: number[];
  hi: number | null; courseHcp: number | null; sd: number | null;
  is9h: boolean; hasHoles: boolean;
};
type Vis = Record<string, boolean>;
type StT = { eagles:number; birdies:number; pars:number; bogeys:number; doubles:number; triples:number };
type Stats = { pF:number;pB:number;pT:number;sF:number;sB:number;sT:number;vpT:number;vpF:number;vpB:number;sd:number;st:StT };

/* ═══════ FONTS ═══════ */
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Oswald:wght@400;500;600;700&family=Bebas+Neue&family=Space+Grotesk:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,700;1,400;1,700&display=swap";
const II = "'Inter',sans-serif";
const OS = "'Oswald',sans-serif";
const LO = "'Lora',serif";

/* ═══════ HELPERS ═══════ */
function scBg(d: number): string | null {
  if (d <= -2) return "#d4a017";
  if (d === -1) return "#dc2626";
  if (d === 1)  return "#5BADE6";
  if (d === 2)  return "#2B6EA0";
  if (d >= 3)   return "#1B4570";
  return null;
}
const fvp  = (v: number) => v === 0 ? "E" : v > 0 ? `+${v}` : `${v}`;
const fSD  = (v: number) => (v > 0 ? "+" : "") + v.toFixed(1);
const vpC  = (v: number) => { if (v <= -2) return "#d4a017"; if (v === -1) return "#ef4444"; if (v === 0) return "#a3a3a3"; if (v === 1) return "#7eb8e8"; return "#22c55e"; };
const vpCd = (v: number) => { if (v < 0) return "#16a34a"; if (v === 0) return "#888"; return "#dc2626"; };

function hexToRgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ── SC: score circle/square ── */
function SC({ sc, par, sz = 32 }: { sc: number; par: number; sz?: number }) {
  const d = sc - par;
  const fs = Math.round(sz * 0.52);
  const base: React.CSSProperties = { width: sz, height: sz, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: fs, lineHeight: 1, flexShrink: 0 };
  const bg = scBg(d);
  if (!bg) return <div style={base}>{sc}</div>;
  return <div style={{ ...base, background: bg, color: "#fff", borderRadius: d <= -1 ? "50%" : 0 }}>{sc}</div>;
}
/* light bg variant */
function SCL({ sc, par, sz = 28 }: { sc: number; par: number; sz?: number }) {
  const d = sc - par;
  const fs = Math.round(sz * 0.52);
  const base: React.CSSProperties = { width: sz, height: sz, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: fs, lineHeight: 1, flexShrink: 0 };
  const bg = scBg(d);
  if (!bg) return <div style={{ ...base, color: "#222" }}>{sc}</div>;
  return <div style={{ ...base, background: bg, color: "#fff", borderRadius: d <= -1 ? "50%" : 0 }}>{sc}</div>;
}
/* 18Birdies style: over-par = border only */
function SCQ({ sc, par, sz = 30 }: { sc: number; par: number; sz?: number }) {
  const d = sc - par;
  const fs = Math.round(sz * 0.5);
  const base: React.CSSProperties = { width: sz, height: sz, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: fs, lineHeight: 1, flexShrink: 0 };
  if (d <= -2) return <div style={{ ...base, background: "#d4a017", color: "#fff", borderRadius: "50%" }}>{sc}</div>;
  if (d === -1) return <div style={{ ...base, background: "#dc2626", color: "#fff", borderRadius: "50%" }}>{sc}</div>;
  if (d === 0)  return <div style={base}>{sc}</div>;
  return <div style={{ ...base, border: "1.5px solid rgba(255,255,255,0.45)", color: "#fff" }}>{sc}</div>;
}

/* 2-row 9+9 grid */
function Grid2({ d, sz = 32, gap = 3, nc = "#555" }: { d: DD; sz?: number; gap?: number; nc?: string }) {
  const is18 = d.scores.length >= 18;
  const slices = is18 ? [{ off: 0, len: 9 }, { off: 9, len: 9 }] : [{ off: 0, len: d.scores.length }];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {slices.map(({ off, len }) => (
        <div key={off} style={{ display: "flex", gap }}>
          {d.scores.slice(off, off + len).map((sc, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: nc, width: sz, textAlign: "center" }}>{off + i + 1}</div>
              <SC sc={sc} par={d.par[off + i]} sz={sz} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* stats pills */
function StatsRow({ st, tc3, gap = 8, fs = 11 }: { st: StT; tc3?: string; gap?: number; fs?: number }) {
  const items = [
    { n: st.eagles,  l: "🦅",  c: "#d4a017" },
    { n: st.birdies, l: "Bir", c: "#dc2626"  },
    { n: st.pars,    l: "Par", c: tc3        },
    { n: st.bogeys,  l: "Bog", c: "#5BADE6"  },
    { n: st.doubles, l: "Dbl", c: "#2B6EA0"  },
    { n: st.triples, l: "Tri+",c: "#1B4570"  },
  ].filter(x => x.n > 0);
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap, flexWrap: "wrap" }}>
      {items.map(x => (
        <div key={x.l} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: fs, fontWeight: 700 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: x.c, display: "inline-block", flexShrink: 0 }} />
          <span style={{ color: x.c }}>{x.n} {x.l}</span>
        </div>
      ))}
    </div>
  );
}

function metaStr(d: DD, flags: Partial<Record<string, boolean>>): string {
  return [
    flags.round   && d.round  && `R${d.round}`,
    flags.course  && d.course,
    flags.tee     && d.tee,
    flags.teeDist && d.teeDist && `${d.teeDist}m`,
    flags.date    && d.date,
  ].filter(Boolean).join(" · ");
}
function hiChStr(d: DD, v: Vis, _s: Stats): string {
  const p: string[] = [];
  if (v.hiCh && d.hi !== null)   { p.push(`HI ${d.hi.toFixed(1)}`); if (d.courseHcp !== null) p.push(`CH ${d.courseHcp}`); }
  if (v.sd   && d.sd !== null)   p.push(`SD ${fSD(d.sd)}`);
  return p.join(" · ");
}

function calcStats(d: DD): Stats {
  const n = d.scores.length; const is18 = n >= 18;
  const pF = d.par.slice(0, Math.min(9,n)).reduce((a,b)=>a+b,0);
  const pB = is18 ? d.par.slice(9).reduce((a,b)=>a+b,0) : 0;
  const pT = is18 ? pF+pB : d.par.reduce((a,b)=>a+b,0);
  const sF = d.scores.slice(0, Math.min(9,n)).reduce((a,b)=>a+b,0);
  const sB = is18 ? d.scores.slice(9).reduce((a,b)=>a+b,0) : 0;
  const sT = is18 ? sF+sB : d.scores.reduce((a,b)=>a+b,0);
  const st: StT = { eagles:0, birdies:0, pars:0, bogeys:0, doubles:0, triples:0 };
  d.scores.forEach((sc,i) => { const x=sc-d.par[i]; if(x<=-2)st.eagles++; else if(x===-1)st.birdies++; else if(x===0)st.pars++; else if(x===1)st.bogeys++; else if(x===2)st.doubles++; else st.triples++; });
  const sd = d.slope > 0 ? (113/d.slope)*(sT-d.cr) : 0;
  return { pF, pB, pT, sF, sB, sT, vpT:sT-pT, vpF:sF-pF, vpB:is18?sB-pB:0, sd, st };
}

/* ═══════════════════════════════════
   DESIGNS  V1 – V21
   ═══════════════════════════════════ */
type P = { d:DD; v:Vis; s:Stats; bg?:string|null; tc?:string; tc2?:string; tc3?:string; tc4?:string };

/* V1 · STICKER */
function V1({ d, v, s, bg, tc="white", tc2, tc3 }: P) {
  return (
    <div style={{ fontFamily:II, display:"inline-flex", alignItems:"center", gap:8, padding:"6px 12px", borderRadius:20, background:bg||"rgba(0,0,0,.75)", color:tc }}>
      <span style={{ fontFamily:OS, fontSize:22, fontWeight:900, color:vpC(s.vpT) }}>{fvp(s.vpT)}</span>
      <span style={{ fontFamily:OS, fontSize:22, fontWeight:700 }}>{s.sT}</span>
      {v.player&&d.player && <span style={{ fontSize:13, fontWeight:700, color:tc2 }}>{d.player}</span>}
      {(v.course||v.date||v.round) && <span style={{ fontSize:11, color:tc3 }}>{metaStr(d,{course:v.course,date:v.date,round:v.round})}</span>}
    </div>
  );
}

/* V2 · STRIP */
function V2({ d, v, s, bg, tc="white", tc2, tc3 }: P) {
  return (
    <div style={{ fontFamily:II, display:"inline-flex", alignItems:"center", gap:10, padding:"7px 14px", background:bg||"rgba(0,0,0,.78)", color:tc }}>
      <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
        {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:15, fontWeight:700 }}>{d.player.toUpperCase()}</div>}
        {(v.course||v.date||v.round) && <div style={{ fontSize:11, fontWeight:600, color:tc3 }}>{metaStr(d,{course:v.course,date:v.date,round:v.round})}</div>}
        {v.stats && <StatsRow st={s.st} tc3={tc3} gap={6} fs={10} />}
      </div>
      <div style={{ width:1, background:"rgba(255,255,255,.15)", alignSelf:"stretch" }} />
      <div style={{ display:"flex", alignItems:"baseline", gap:5, flexShrink:0 }}>
        <span style={{ fontFamily:OS, fontSize:34, fontWeight:900, lineHeight:1 }}>{s.sT}</span>
        <span style={{ fontSize:20, fontWeight:900, color:vpC(s.vpT) }}>{fvp(s.vpT)}</span>
      </div>
    </div>
  );
}

/* V3 · FRONT/BACK */
function V3({ d, v, s, bg, tc="white", tc2, tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const Half = ({ lbl, score, vpar }: { lbl:string; score:number; vpar:number }) => (
    <div style={{ display:"flex", alignItems:"center", padding:"5px 12px", gap:8 }}>
      <span style={{ fontSize:10, fontWeight:700, letterSpacing:1, color:tc3, minWidth:40 }}>{lbl}</span>
      <span style={{ fontFamily:OS, fontSize:28, fontWeight:900, lineHeight:1, color:tc, flex:1 }}>{score}</span>
      <span style={{ fontSize:15, fontWeight:900, color:vpC(vpar) }}>{fvp(vpar)}</span>
    </div>
  );
  return (
    <div style={{ fontFamily:II, display:"inline-flex", flexDirection:"column", background:bg||"rgba(0,0,0,.80)", color:tc, borderRadius:8, overflow:"hidden", minWidth:220 }}>
      {(v.player&&d.player || v.course&&d.course) && <>
        <div style={{ padding:"6px 12px 4px" }}>
          {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:14, fontWeight:700 }}>{d.player.toUpperCase()}</div>}
          {(v.course||v.date||v.round) && <div style={{ fontSize:10, fontWeight:600, color:tc3 }}>{metaStr(d,{course:v.course,date:v.date,round:v.round})}</div>}
        </div>
        <div style={{ height:1, background:"rgba(255,255,255,.12)" }} />
      </>}
      {is18 && <>
        <Half lbl="FRONT" score={s.sF} vpar={s.vpF} />
        <div style={{ height:1, background:"rgba(255,255,255,.08)" }} />
        <Half lbl="BACK" score={s.sB} vpar={s.vpB} />
        <div style={{ height:1, background:"rgba(255,255,255,.20)" }} />
      </>}
      <div style={{ display:"flex", alignItems:"center", padding:"6px 12px", gap:8, background:"rgba(255,255,255,.07)" }}>
        <span style={{ fontSize:10, fontWeight:700, letterSpacing:1, color:tc2, minWidth:40 }}>TOTAL</span>
        <span style={{ fontFamily:OS, fontSize:32, fontWeight:900, lineHeight:1, color:tc, flex:1 }}>{s.sT}</span>
        <span style={{ fontSize:18, fontWeight:900, color:vpC(s.vpT) }}>{fvp(s.vpT)}</span>
      </div>
      {v.stats && <div style={{ padding:"4px 12px", borderTop:"1px solid rgba(255,255,255,.08)" }}><StatsRow st={s.st} tc3={tc3} gap={6} fs={10} /></div>}
    </div>
  );
}

/* V4 · NEON RING */
function V4({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  return (
    <div style={{ fontFamily:II, width:200, color:tc, textAlign:"center", background:bg, padding:"8px 10px", borderRadius:10 }}>
      {v.course&&d.course && <div style={{ fontSize:11, fontWeight:700, letterSpacing:1, color:tc3 }}>{d.course}</div>}
      {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:14, fontWeight:700, marginTop:2 }}>{d.player.toUpperCase()}</div>}
      <div style={{ margin:"6px auto", width:90, height:90, borderRadius:"50%", border:`3px solid ${vpC(s.vpT)}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <div style={{ fontFamily:OS, fontSize:34, fontWeight:900, lineHeight:1, letterSpacing:-1 }}>{s.sT}</div>
        <div style={{ fontSize:16, fontWeight:900, color:vpC(s.vpT) }}>{fvp(s.vpT)}</div>
      </div>
      {v.stats && <div style={{ display:"flex", justifyContent:"center", marginTop:4 }}><StatsRow st={s.st} tc3={tc3} gap={8} fs={11} /></div>}
      {(v.date||v.round) && <div style={{ fontSize:10, fontWeight:600, color:tc4, marginTop:4 }}>{metaStr(d,{date:v.date,round:v.round})}</div>}
    </div>
  );
}

/* V5 · TICKET */
function V5({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:LO, width:300, color:tc, background:bg||"rgba(0,0,0,0.82)", borderRadius:6, padding:"6px 12px", border:"1px solid rgba(255,255,255,0.15)" }}>
      {(v.player&&d.player || v.course&&d.course) && (
        <div style={{ textAlign:"center", borderBottom:"1px dashed rgba(255,255,255,0.2)", paddingBottom:6, marginBottom:6 }}>
          {v.player&&d.player && <div style={{ fontSize:16, fontWeight:700, fontStyle:"italic" }}>{d.player}</div>}
          {v.course&&d.course && <div style={{ fontFamily:II, fontSize:11, color:tc3, marginTop:1 }}>{d.course}</div>}
        </div>
      )}
      <div style={{ textAlign:"center", marginBottom:4 }}>
        <div style={{ fontFamily:II, fontSize:48, fontWeight:900, lineHeight:1, letterSpacing:-2 }}>{s.sT}</div>
        <div style={{ fontFamily:II, fontSize:22, fontWeight:900, color:vpC(s.vpT) }}>{fvp(s.vpT)}</div>
      </div>
      {v.holeScores && <Grid2 d={d} sz={28} gap={3} nc="#666" />}
      <div style={{ borderTop:"1px dashed rgba(255,255,255,0.2)", paddingTop:6, marginTop:6, fontFamily:II }}>
        {v.stats && <div style={{ display:"flex", justifyContent:"center" }}><StatsRow st={s.st} tc3={tc3} gap={8} fs={11} /></div>}
        {(v.date||v.tee||v.round||hcl) && <div style={{ textAlign:"center", fontSize:10, fontWeight:600, color:tc4, marginTop:4 }}>{[v.date&&d.date, v.tee&&d.tee, v.round&&`R${d.round}`, hcl].filter(Boolean).join(" · ")}</div>}
      </div>
    </div>
  );
}

/* V6 · GRINT ROW */
function V6({ d, v, s, bg, tc="white", tc2, tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg, padding:"8px 12px", borderRadius:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6, gap:10 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
          {(v.course||v.date||v.round) && <div style={{ fontSize:10, fontWeight:700, color:tc3 }}>{metaStr(d,{course:v.course,date:v.date,round:v.round})}</div>}
          {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:15, fontWeight:700 }}>{d.player}</div>}
          {hcl && <div style={{ fontSize:10, fontWeight:600, color:tc4 }}>{hcl}</div>}
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontFamily:OS, fontSize:36, fontWeight:900, lineHeight:1, letterSpacing:-1 }}>{s.sT}</div>
          <div style={{ fontSize:18, fontWeight:900, color:vpC(s.vpT) }}>{fvp(s.vpT)}</div>
          {v.position&&d.position && <div style={{ fontSize:11, fontWeight:700, color:tc3 }}>{d.position}</div>}
        </div>
      </div>
      {v.holeScores && (
        <div style={{ background:"rgba(0,0,0,0.2)", display:"inline-block", padding:"5px 6px", borderRadius:6 }}>
          {(is18 ? [[0,9,s.sF],[9,9,s.sB]] as [number,number,number][] : [[0,d.scores.length,s.sT] as [number,number,number]]).map(([off,len,sub]) => (
            <div key={off} style={{ display:"flex", alignItems:"center", gap:4, marginBottom:2 }}>
              <div style={{ display:"flex", gap:3 }}>
                {d.scores.slice(off,off+len).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} sz={32} />)}
              </div>
              <div style={{ width:3, height:32, background:"rgba(100,180,100,0.4)", flexShrink:0 }} />
              <div style={{ fontSize:18, fontWeight:900, color:tc2, minWidth:28 }}>{sub}</div>
            </div>
          ))}
        </div>
      )}
      {v.stats && <div style={{ marginTop:4 }}><StatsRow st={s.st} tc3={tc3} gap={8} fs={11} /></div>}
    </div>
  );
}

/* V7 · WIDE ROW */
function V7({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg, padding:"7px 10px", borderRadius:8 }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:5 }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:4, flexShrink:0 }}>
          <span style={{ fontFamily:OS, fontSize:36, fontWeight:900, lineHeight:1, letterSpacing:-1 }}>{s.sT}</span>
          <span style={{ fontSize:20, fontWeight:900, color:vpC(s.vpT) }}>{fvp(s.vpT)}</span>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
          {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:14, fontWeight:700 }}>{d.player}</div>}
          {(v.course||v.date||v.round) && <div style={{ fontSize:10, fontWeight:500, color:tc3 }}>{metaStr(d,{course:v.course,date:v.date,round:v.round})}</div>}
          {hcl && <div style={{ fontSize:10, fontWeight:600, color:tc4 }}>{hcl}</div>}
        </div>
      </div>
      {v.holeScores && (is18 ? [[0,9,s.sF,"Out"],[9,9,s.sB,"In"]] as [number,number,number,string][] : [[0,d.scores.length,s.sT,"Tot"] as [number,number,number,string]]).map(([off,len,sub,lbl]) => (
        <div key={off} style={{ display:"flex", alignItems:"center", gap:3, marginBottom:2 }}>
          <div style={{ display:"flex", gap:3 }}>
            {d.scores.slice(off,off+len).map((sc,i) => (
              <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
                <div style={{ fontSize:9, fontWeight:700, color:tc4, width:32, textAlign:"center" }}>{off+i+1}</div>
                {v.holePar && <div style={{ fontSize:9, color:tc4, width:32, textAlign:"center" }}>{d.par[off+i]}</div>}
                <SC sc={sc} par={d.par[off+i]} sz={32} />
              </div>
            ))}
          </div>
          <div style={{ width:2, background:"rgba(100,180,100,0.35)", margin:"0 4px", alignSelf:"stretch" }} />
          <div style={{ textAlign:"center", alignSelf:"flex-end" }}>
            <div style={{ fontSize:9, fontWeight:700, color:tc4 }}>{lbl}</div>
            <div style={{ fontFamily:OS, fontSize:18, fontWeight:700 }}>{sub}</div>
          </div>
        </div>
      ))}
      {v.stats && <div style={{ borderTop:"1px solid rgba(255,255,255,.08)", paddingTop:5, marginTop:4 }}><StatsRow st={s.st} tc3={tc4} gap={8} fs={10} /></div>}
    </div>
  );
}

/* V8 · GRADIENT */
function V8({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:II, width:480, color:tc, background:bg||"linear-gradient(135deg,rgba(15,30,55,.88),rgba(20,50,35,.82))", borderRadius:8, padding:"10px 14px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
        <div>
          {v.player&&d.player && <div style={{ fontSize:14, fontWeight:900 }}>{d.player}</div>}
          {(v.course||v.round||v.date) && <div style={{ fontSize:10, fontWeight:500, color:tc3 }}>{metaStr(d,{course:v.course,round:v.round,date:v.date})}</div>}
          {hcl && <div style={{ fontSize:10, fontWeight:600, color:tc4 }}>{hcl}</div>}
        </div>
        <div style={{ display:"flex", alignItems:"baseline", gap:5, flexShrink:0 }}>
          <span style={{ fontFamily:OS, fontSize:36, fontWeight:900 }}>{s.sT}</span>
          <span style={{ fontSize:20, fontWeight:900, color:vpC(s.vpT) }}>{fvp(s.vpT)}</span>
        </div>
      </div>
      {v.holeScores && (is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len]) => (
        <div key={off} style={{ display:"flex", gap:3, marginBottom:off===0&&is18?2:0 }}>
          {d.scores.slice(off,off+len).map((sc,i) => (
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
              <div style={{ fontSize:9, fontWeight:700, color:tc4 }}>{off+i+1}</div>
              <SC sc={sc} par={d.par[off+i]} sz={32} />
            </div>
          ))}
        </div>
      ))}
      <div style={{ display:"flex", justifyContent:"space-between", borderTop:"1px solid rgba(255,255,255,.08)", paddingTop:6, marginTop:5, fontSize:10, fontWeight:700, color:tc3 }}>
        {v.date&&d.date ? <span>{d.date}</span> : <span />}
        {v.stats ? <StatsRow st={s.st} tc3={tc3} gap={8} fs={10} /> : <span />}
      </div>
    </div>
  );
}

/* V9 · 18BIRDIES */
function V9({ d, v, s, bg, tc="white", tc2, tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:II, width:420, color:tc, background:bg||"rgba(15,15,25,0.9)", borderRadius:10, padding:"8px 10px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
        <div>
          {v.date&&d.date && <div style={{ fontSize:9, fontWeight:700, letterSpacing:2, color:tc3 }}>{d.date}</div>}
          {v.course&&d.course && <div style={{ fontSize:14, fontWeight:900, marginTop:1 }}>{d.course}</div>}
          <div style={{ fontSize:10, fontWeight:600, color:tc3 }}>Par {s.pT}{v.tee&&d.tee?` · ${d.tee}`:""}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontFamily:OS, fontSize:34, fontWeight:900, letterSpacing:-1 }}>{s.sT}</div>
          <div style={{ fontSize:10, fontWeight:700, color:tc3 }}>Gross</div>
        </div>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(255,255,255,.07)", borderRadius:6, padding:"5px 10px", marginBottom:5 }}>
        <span style={{ fontSize:11, fontWeight:700, color:tc2 }}>To Par</span>
        <span style={{ fontFamily:OS, fontSize:26, fontWeight:900, color:vpC(s.vpT) }}>{fvp(s.vpT)}</span>
      </div>
      {v.holeScores && (is18 ? [[0,9,s.sF],[9,9,s.sB]] as [number,number,number][] : [[0,d.scores.length,s.sT] as [number,number,number]]).map(([off,len,sub]) => (
        <div key={off} style={{ display:"flex", alignItems:"center", marginBottom:2 }}>
          <div style={{ display:"flex", gap:3 }}>
            {d.scores.slice(off,off+len).map((sc,i) => (
              <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
                <div style={{ fontSize:9, fontWeight:700, color:tc4 }}>{off+i+1}</div>
                <SCQ sc={sc} par={d.par[off+i]} sz={30} />
              </div>
            ))}
          </div>
          <div style={{ marginLeft:5, fontSize:18, fontWeight:900, color:tc2, minWidth:28, textAlign:"center" }}>{sub}</div>
        </div>
      ))}
      {(v.player||v.stats) && (
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:5, fontSize:10, fontWeight:700, color:tc4 }}>
          {v.player&&d.player ? <span>{d.player}</span> : <span />}
          {v.stats ? <StatsRow st={s.st} tc3={tc4} gap={6} fs={10} /> : <span />}
        </div>
      )}
    </div>
  );
}

/* V10 · SCORE HERO */
function V10({ d, v, s, bg, tc="white", tc2, tc3, tc4 }: P) {
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:II, width:360, color:tc, background:bg||"rgba(0,0,0,.78)", borderRadius:10, padding:"10px 14px", textAlign:"center" }}>
      <div style={{ fontSize:9, fontWeight:700, letterSpacing:3, color:tc3 }}>TO PAR</div>
      <div style={{ fontFamily:OS, fontSize:64, fontWeight:900, lineHeight:.9, letterSpacing:-3, margin:"2px 0", color:vpC(s.vpT) }}>{fvp(s.vpT)}</div>
      <div style={{ fontSize:14, fontWeight:700, color:tc2 }}>Gross <span style={{ fontWeight:900, color:tc, fontSize:22 }}>{s.sT}</span></div>
      <div style={{ height:1, background:"rgba(255,255,255,.12)", margin:"6px 0" }} />
      {v.player&&d.player && <div style={{ fontSize:15, fontWeight:900, marginBottom:2 }}>{d.player}</div>}
      {(v.course||v.round||v.date) && <div style={{ fontSize:10, color:tc3, marginBottom:6 }}>{metaStr(d,{course:v.course,round:v.round,date:v.date})}</div>}
      {v.holeScores && <div style={{ display:"flex", justifyContent:"center" }}><Grid2 d={d} sz={30} gap={3} nc={tc4} /></div>}
      {v.stats && <div style={{ display:"flex", justifyContent:"center", marginTop:5 }}><StatsRow st={s.st} tc3={tc3} gap={10} fs={11} /></div>}
      {hcl && <div style={{ fontSize:10, fontWeight:700, color:tc4, marginTop:5 }}>{hcl}</div>}
    </div>
  );
}

/* V11 · GIANT SCORE */
function V11({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:OS, width:360, textAlign:"center", color:tc }}>
      <div style={{ background:bg||"rgba(0,0,0,.75)", borderRadius:10, padding:"10px 14px" }}>
        {v.round && <div style={{ fontFamily:II, fontSize:9, fontWeight:700, letterSpacing:3, color:tc3 }}>ROUND {d.round}</div>}
        {v.player&&d.player && <div style={{ fontSize:18, fontWeight:700, letterSpacing:.5, marginTop:2, wordBreak:"break-word" }}>{d.player.toUpperCase()}</div>}
        {(v.course||v.tee) && <div style={{ fontFamily:II, fontSize:10, fontWeight:600, color:tc3 }}>{[v.course&&d.course,v.tee&&d.tee].filter(Boolean).join(" · ")}</div>}
        <div style={{ display:"flex", alignItems:"baseline", justifyContent:"center", gap:6, margin:"6px 0 4px" }}>
          <span style={{ fontSize:72, lineHeight:.85, letterSpacing:-3, fontWeight:700 }}>{s.sT}</span>
          <span style={{ fontSize:32, fontWeight:700, color:vpC(s.vpT) }}>{fvp(s.vpT)}</span>
        </div>
        <div style={{ fontFamily:II, fontSize:10, fontWeight:700, color:tc3, marginBottom:6 }}>Par {s.pT}{v.date&&d.date?` · ${d.date}`:""}</div>
        {v.holeScores && <div style={{ display:"flex", justifyContent:"center" }}><Grid2 d={d} sz={30} gap={3} nc={tc4} /></div>}
        {v.stats && <div style={{ display:"flex", justifyContent:"center", marginTop:5 }}><StatsRow st={s.st} tc3={tc3} gap={10} fs={11} /></div>}
        {hcl && <div style={{ fontFamily:II, fontSize:10, fontWeight:700, color:tc4, marginTop:5 }}>{hcl}</div>}
      </div>
    </div>
  );
}

/* V12 · TOURNAMENT */
function V12({ d, v, s, bg, tc="white", tc2, tc3, tc4 }: P) {
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:II, width:380, color:tc, background:bg||"rgba(15,35,60,.88)", borderRadius:8, overflow:"hidden" }}>
      <div style={{ padding:"6px 10px 8px", display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:2 }}>
          {v.player&&d.player && <div style={{ fontSize:16, fontWeight:900 }}>{d.player}</div>}
          {(v.course||v.round) && <div style={{ fontSize:11, fontWeight:700, color:tc2 }}>{[v.course&&d.course,v.round&&`R${d.round}`].filter(Boolean).join(" · ")}</div>}
          {(v.event||v.date) && <div style={{ fontSize:10, fontWeight:500, color:tc3 }}>{[v.event&&d.event,v.date&&d.date].filter(Boolean).join(" · ")}</div>}
          {hcl && <div style={{ fontSize:10, fontWeight:600, color:tc4 }}>{hcl}</div>}
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontFamily:OS, fontSize:36, fontWeight:900, lineHeight:1, letterSpacing:-1 }}>{s.sT}</div>
          <div style={{ fontSize:20, fontWeight:900, color:vpC(s.vpT), marginTop:-1 }}>{fvp(s.vpT)}</div>
          {v.position&&d.position && <div style={{ fontSize:11, fontWeight:700, color:tc3 }}>{d.position}</div>}
        </div>
      </div>
      {v.holeScores && <div style={{ padding:"0 8px 6px", display:"flex", justifyContent:"center" }}><Grid2 d={d} sz={30} gap={3} nc={tc4} /></div>}
      {v.stats && <div style={{ padding:"5px 10px", background:"rgba(255,255,255,.05)", display:"flex" }}><StatsRow st={s.st} tc3={tc3} gap={8} fs={11} /></div>}
    </div>
  );
}

/* V13 · DASHBOARD */
function V13({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const hcl = hiChStr(d,v,s);
  const Bx = ({ val, label, c, big }: { val:string|number; label:string; c?:string; big?:boolean }) => (
    <div style={{ flex:1, background:"rgba(255,255,255,.07)", borderRadius:6, padding:big?"8px 8px":"5px 8px", textAlign:"center" }}>
      <div style={{ fontSize:big?30:20, fontWeight:900, color:c||tc }}>{val}</div>
      <div style={{ fontSize:9, fontWeight:700, color:tc3, letterSpacing:1, marginTop:1 }}>{label}</div>
    </div>
  );
  return (
    <div style={{ fontFamily:II, width:360, color:tc, background:bg||"rgba(15,25,45,.85)", borderRadius:8, padding:"6px 8px" }}>
      {(v.player||v.course) && (
        <div style={{ textAlign:"center", marginBottom:6 }}>
          {v.player&&d.player && <div style={{ fontSize:16, fontWeight:900 }}>{d.player}</div>}
          {(v.course||v.round) && <div style={{ fontSize:10, fontWeight:500, color:tc3 }}>{[v.course&&d.course,v.round&&`R${d.round}`].filter(Boolean).join(" · ")}</div>}
        </div>
      )}
      <div style={{ display:"flex", gap:5, marginBottom:5 }}>
        <Bx val={s.sT} label="SCORE" big /><Bx val={fvp(s.vpT)} label="VS PAR" c={vpC(s.vpT)} big />
      </div>
      {v.stats && (
        <div style={{ display:"flex", gap:5, marginBottom:5 }}>
          <Bx val={s.st.birdies} label="BIRDIE" c="#dc2626" /><Bx val={s.st.pars} label="PAR" /><Bx val={s.st.bogeys} label="BOGEY" c="#5BADE6" />
        </div>
      )}
      {v.holeScores && <div style={{ display:"flex", justifyContent:"center" }}><Grid2 d={d} sz={30} gap={3} nc={tc4} /></div>}
      {hcl && <div style={{ textAlign:"center", fontSize:10, fontWeight:700, color:tc4, marginTop:5 }}>{hcl}</div>}
    </div>
  );
}

/* V14 · COMPACT TABLE */
function V14({ d, v, s, bg, tc="white", tc2, tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18; const W = 28;
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg, padding:"8px 8px", borderRadius:8 }}>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5, flexWrap:"wrap" }}>
        <span style={{ fontFamily:OS, fontSize:26, fontWeight:700, lineHeight:1 }}>{s.sT}</span>
        <span style={{ fontSize:16, fontWeight:900, color:vpC(s.vpT) }}>{fvp(s.vpT)}</span>
        {(v.player||v.round) && <span style={{ fontSize:12, fontWeight:700, color:tc2, marginLeft:4 }}>{[v.player&&d.player,v.round&&`R${d.round}`].filter(Boolean).join(" · ")}</span>}
      </div>
      {(v.course||v.date||v.tee) && <div style={{ fontSize:10, fontWeight:600, color:tc3, marginBottom:4 }}>{metaStr(d,{course:v.course,date:v.date,tee:v.tee})}</div>}
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
            {d.scores.slice(off,off+len).map((sc,i) => <div key={i} style={{width:W,display:"flex",justifyContent:"center"}}><SC sc={sc} par={d.par[off+i]} sz={28} /></div>)}
            <div style={{ width:32, padding:"0 3px", fontFamily:OS, fontSize:16, fontWeight:900, color:tc, display:"flex", alignItems:"center" }}>{sub}</div>
          </div>
          {ri===0&&is18 && <div style={{height:3}} />}
        </div>
      ))}
      {v.stats && <div style={{ marginTop:5 }}><StatsRow st={s.st} tc3={tc3} gap={8} fs={10} /></div>}
    </div>
  );
}

/* V15 · B&W CARD */
function V15({ d, v, s }: P) {
  const is18 = d.scores.length >= 18; const W = 28;
  const bdr = "1px solid #e5e7eb";
  return (
    <div style={{ fontFamily:II, display:"inline-block", background:"#fff", color:"#111", overflow:"hidden", borderRadius:8 }}>
      <div style={{ background:"#1a2744", padding:"5px 10px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
        <div>
          {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:16, fontWeight:700, color:"#fff" }}>{d.player.toUpperCase()}</div>}
          {(v.event||v.round||v.position) && <div style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,.55)", letterSpacing:.5 }}>{[v.event&&d.event,v.round&&`R${d.round}`,v.position&&d.position].filter(Boolean).join(" · ")}</div>}
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", flexShrink:0 }}>
          <div style={{ fontFamily:OS, fontSize:28, fontWeight:700, color:"#fff", lineHeight:1 }}>{s.sT}</div>
          <div style={{ fontSize:15, fontWeight:900, color:vpC(s.vpT) }}>{fvp(s.vpT)}</div>
        </div>
      </div>
      {v.holeScores && (is18 ? [[0,9,s.sF,s.pF,"Out"],[9,9,s.sB,s.pB,"In"]] as [number,number,number,number,string][] : [[0,d.scores.length,s.sT,s.pT,"Tot"] as [number,number,number,number,string]]).map(([off,len,sub,subP,lbl],ri) => (
        <div key={off}>
          <div style={{ display:"flex", background:"#f1f5f9", borderBottom:bdr }}>
            <div style={{ width:40, padding:"3px 6px", fontSize:10, fontWeight:700, color:"#64748b", borderRight:bdr }}>Hole</div>
            {Array.from({length:len},(_,i) => <div key={i} style={{width:W,textAlign:"center",fontSize:10,fontWeight:700,color:"#374151",borderRight:bdr}}>{off+i+1}</div>)}
            <div style={{ width:30, textAlign:"center", fontSize:10, fontWeight:800, color:"#374151" }}>{lbl}</div>
          </div>
          {v.holePar && (
            <div style={{ display:"flex", borderBottom:bdr }}>
              <div style={{ width:40, padding:"2px 6px", fontSize:10, fontWeight:600, color:"#6b7280", borderRight:bdr }}>Par</div>
              {d.par.slice(off,off+len).map((p,i) => <div key={i} style={{width:W,textAlign:"center",fontSize:10,color:"#6b7280",borderRight:bdr}}>{p}</div>)}
              <div style={{ width:30, textAlign:"center", fontSize:11, fontWeight:700, color:"#374151" }}>{subP}</div>
            </div>
          )}
          <div style={{ display:"flex", borderBottom:ri===0&&is18?"2px solid #e5e7eb":bdr }}>
            <div style={{ width:40, padding:"3px 6px", fontSize:11, fontWeight:800, color:"#111", borderRight:bdr }}>Score</div>
            {d.scores.slice(off,off+len).map((sc,i) => <div key={i} style={{width:W,display:"flex",justifyContent:"center",padding:"2px 0",borderRight:bdr}}><SCL sc={sc} par={d.par[off+i]} sz={26} /></div>)}
            <div style={{ width:30, textAlign:"center", fontFamily:OS, fontSize:16, fontWeight:900, color:"#111", display:"flex", alignItems:"center", justifyContent:"center" }}>{sub}</div>
          </div>
        </div>
      ))}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 8px", background:"#f8fafc", borderTop:"1px solid #e5e7eb", flexWrap:"wrap", gap:3 }}>
        {v.stats ? <StatsRow st={s.st} tc3="#94a3b8" gap={8} fs={10} /> : <span />}
        {(v.course||v.date) && <div style={{ fontSize:10, fontWeight:600, color:"#9ca3af" }}>{metaStr(d,{course:v.course,date:v.date})}</div>}
      </div>
    </div>
  );
}

/* V16 · LIGHT CARD */
function V16({ d, v, s }: P) {
  const is18 = d.scores.length >= 18; const W = 30;
  return (
    <div style={{ fontFamily:II, width:440, background:"#fff", borderRadius:8, padding:"6px 10px", color:"#222", border:"1px solid rgba(0,0,0,.08)" }}>
      <div style={{ borderBottom:"2px solid #e5e7eb", paddingBottom:6, marginBottom:6 }}>
        {v.course&&d.course && <div style={{ fontSize:16, fontWeight:900, color:"#111" }}>{d.course}</div>}
        {(v.date||v.tee||v.round) && <div style={{ fontSize:10, fontWeight:600, color:"#999", marginTop:2 }}>{metaStr(d,{date:v.date,tee:v.tee,round:v.round})}</div>}
      </div>
      {v.holeScores && (is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len],ri) => {
        const subP = d.par.slice(off,off+len).reduce((a,b)=>a+b,0);
        const subS = d.scores.slice(off,off+len).reduce((a,b)=>a+b,0);
        return (
          <div key={off}>
            <div style={{ display:"flex", background:"#1e3a2f", borderRadius:ri===0?"6px 6px 0 0":0, padding:"3px 0" }}>
              <div style={{ width:40, padding:"0 5px", fontSize:10, fontWeight:800, color:"rgba(255,255,255,.6)", display:"flex", alignItems:"center" }}>Hole</div>
              {Array.from({length:len},(_,i) => <div key={i} style={{width:W,textAlign:"center",fontSize:11,fontWeight:800,color:"#fff"}}>{off+i+1}</div>)}
              <div style={{ width:34, textAlign:"center", fontSize:10, fontWeight:800, color:"rgba(255,255,255,.6)" }}>{is18?(ri===0?"Out":"In"):"Tot"}</div>
            </div>
            {v.holePar && (
              <div style={{ display:"flex", background:"#e8f5e9", padding:"2px 0" }}>
                <div style={{ width:40, padding:"0 5px", fontSize:11, fontWeight:700, color:"#2e7d32", display:"flex", alignItems:"center" }}>Par</div>
                {d.par.slice(off,off+len).map((p,i) => <div key={i} style={{width:W,textAlign:"center",fontSize:11,color:"#2e7d32",fontWeight:700}}>{p}</div>)}
                <div style={{ width:34, textAlign:"center", fontSize:12, fontWeight:800, color:"#2e7d32" }}>{subP}</div>
              </div>
            )}
            <div style={{ display:"flex", padding:"3px 0", marginBottom:ri===0&&is18?5:0 }}>
              <div style={{ width:40, padding:"0 5px", fontSize:11, fontWeight:900, color:"#333", display:"flex", alignItems:"center" }}>Score</div>
              {d.scores.slice(off,off+len).map((sc,i) => <div key={i} style={{width:W,display:"flex",justifyContent:"center"}}><SCL sc={sc} par={d.par[off+i]} sz={28} /></div>)}
              <div style={{ width:34, textAlign:"center", fontSize:16, fontWeight:900, color:"#333", display:"flex", alignItems:"center", justifyContent:"center" }}>{subS}</div>
            </div>
          </div>
        );
      })}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:6, padding:"4px 6px", background:"#f3f4f6", borderRadius:6 }}>
        {v.player&&d.player ? <div style={{ fontSize:14, fontWeight:900, color:"#111" }}>{d.player}</div> : <div />}
        <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
          <span style={{ fontFamily:OS, fontSize:28, fontWeight:900, color:"#111" }}>{s.sT}</span>
          <span style={{ fontSize:18, fontWeight:900, color:vpCd(s.vpT) }}>{fvp(s.vpT)}</span>
        </div>
      </div>
    </div>
  );
}

/* V17 · GLASS CARD */
function V17({ d, v, s, bg, tc="white", tc2, tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18; const W = 28;
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:II, width:480, padding:"10px 14px 12px", background:bg||"rgba(0,0,0,.75)", borderRadius:10, color:tc, border:"1px solid rgba(255,255,255,.1)" }}>
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
              {d.scores.slice(off,off+cnt).map((sc,i) => <div key={i} style={{width:W,display:"flex",justifyContent:"center"}}><SC sc={sc} par={d.par[off+i]} sz={28} /></div>)}
              <div style={{ width:34, textAlign:"center", fontWeight:900, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", color:tc }}>{subS}</div>
            </div>
          </div>
        );
      })}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:6, padding:"4px 8px", background:"rgba(255,255,255,.07)", borderRadius:8, gap:8 }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:5, flexShrink:0 }}>
          <span style={{ fontFamily:OS, fontSize:28, fontWeight:900, letterSpacing:-1 }}>{s.sT}</span>
          <span style={{ fontSize:16, fontWeight:900, color:vpC(s.vpT) }}>{fvp(s.vpT)}</span>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
          {v.player&&d.player && <div style={{ fontSize:13, fontWeight:900 }}>{d.player}</div>}
          {(v.course||v.date) && <div style={{ fontSize:10, fontWeight:600, color:tc2 }}>{[v.course&&d.course,v.date&&d.date].filter(Boolean).join(" · ")}</div>}
          {hcl && <div style={{ fontSize:10, fontWeight:700, color:tc4 }}>{hcl}</div>}
          {v.stats && <div style={{ display:"flex", justifyContent:"flex-end" }}><StatsRow st={s.st} tc3={tc3} gap={6} fs={10} /></div>}
        </div>
      </div>
    </div>
  );
}

/* V18 · CLASSIC TABLE */
function V18({ d, v, s, bg, tc="white", tc2, tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18; const W = 28;
  const hcl = hiChStr(d,v,s);
  const vl = "1px solid rgba(255,255,255,.15)";
  return (
    <div style={{ fontFamily:II, padding:10, display:"inline-block", background:bg||"rgba(15,30,55,.90)", borderRadius:8, color:tc }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7, gap:10 }}>
        <div>
          {v.player&&d.player && <div style={{ fontSize:15, fontWeight:900 }}>{d.player}</div>}
          {(v.round||v.course) && <div style={{ fontSize:10, fontWeight:600, color:tc3 }}>{[v.round&&`Round ${d.round}`,v.course&&d.course].filter(Boolean).join(" · ")}</div>}
        </div>
        <div style={{ display:"flex", alignItems:"baseline", gap:4, flexShrink:0 }}>
          <span style={{ fontFamily:OS, fontSize:30, fontWeight:900 }}>{s.sT}</span>
          <span style={{ fontSize:18, fontWeight:900, color:vpC(s.vpT) }}>{fvp(s.vpT)}</span>
        </div>
      </div>
      {v.holeScores && (is18 ? [[0,"Out",s.sF,s.pF],[9,"In",s.sB,s.pB]] as [number,string,number,number][] : [[0,"Tot",s.sT,s.pT] as [number,string,number,number]]).map(([off,label,sub,subP],ri) => {
        const cnt = is18?9:d.scores.length;
        return (
          <div key={off} style={{ marginBottom:ri===0&&is18?2:0 }}>
            <div style={{ display:"flex", background:"rgba(20,45,75,.95)", padding:"3px 0" }}>
              <div style={{ width:46, padding:"0 6px", fontWeight:900, fontSize:11, color:"#fff" }}>Hole</div>
              {Array.from({length:cnt},(_,i) => <div key={i} style={{width:W,textAlign:"center",fontWeight:800,fontSize:11,color:"#fff"}}>{off+i+1}</div>)}
              <div style={{ width:34, textAlign:"center", fontWeight:900, fontSize:11, borderLeft:vl, color:"#fff" }}>{label}</div>
            </div>
            {v.holePar && (
              <div style={{ display:"flex", padding:"2px 0", background:"rgba(255,255,255,.05)" }}>
                <div style={{ width:46, padding:"0 6px", fontSize:10, fontWeight:600, color:tc3 }}>Par</div>
                {d.par.slice(off,off+cnt).map((p,i) => <div key={i} style={{width:W,textAlign:"center",fontSize:10,color:tc2}}>{p}</div>)}
                <div style={{ width:34, textAlign:"center", fontWeight:700, fontSize:10, color:tc2, borderLeft:vl }}>{subP}</div>
              </div>
            )}
            <div style={{ display:"flex", padding:"2px 0" }}>
              <div style={{ width:46, padding:"0 6px", fontWeight:900, fontSize:11, color:tc }}>Score</div>
              {d.scores.slice(off,off+cnt).map((sc,i) => <div key={i} style={{width:W,display:"flex",justifyContent:"center"}}><SC sc={sc} par={d.par[off+i]} sz={28} /></div>)}
              <div style={{ width:34, textAlign:"center", fontWeight:900, fontSize:15, borderLeft:vl, display:"flex", alignItems:"center", justifyContent:"center", color:tc }}>{sub}</div>
            </div>
            {ri===0&&is18 && <div style={{ height:2, background:"rgba(100,180,100,.4)", margin:"2px 0" }} />}
          </div>
        );
      })}
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:7, fontSize:10, fontWeight:700, color:tc4 }}>
        {v.stats ? <StatsRow st={s.st} tc3={tc4} gap={8} fs={10} /> : <span />}
        {hcl && <span>{hcl}</span>}
      </div>
    </div>
  );
}

/* V19 · PGA COLUMNS — sem barra horizontal */
function V19({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:OS, display:"inline-flex", flexDirection:"column", alignItems:"stretch", color:tc, background:bg, overflow:"hidden", borderRadius:8 }}>
      {(v.player||v.event||v.round) && (
        <div style={{ padding:"8px 10px 4px", textAlign:"center" }}>
          {v.player&&d.player && <div style={{ fontSize:18, fontWeight:700, lineHeight:1.2, wordBreak:"break-word" }}>{d.player.toUpperCase()}</div>}
          {v.event&&d.event && <div style={{ fontFamily:II, fontSize:9, fontWeight:700, letterSpacing:2, color:tc3, marginTop:2 }}>{d.event.toUpperCase()}</div>}
          {v.round && <div style={{ fontFamily:II, fontSize:9, fontWeight:700, letterSpacing:2, color:tc3 }}>ROUND {d.round}</div>}
        </div>
      )}
      {v.holeScores && is18 && (
        <div style={{ display:"flex", justifyContent:"center", padding:"4px 8px 6px" }}>
          {[{off:0,l:"FRONT",sc:s.sF},{off:9,l:"BACK",sc:s.sB}].map(({off,l,sc:sc_},ci) => (
            <div key={off} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, borderRight:ci===0?"2px solid rgba(220,38,38,.35)":"none", paddingRight:ci===0?8:0, paddingLeft:ci===1?8:0 }}>
              {d.scores.slice(off,off+9).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} sz={32} />)}
              <div style={{ fontFamily:II, fontSize:9, fontWeight:700, letterSpacing:2, color:tc3, marginTop:4 }}>{l}</div>
              <div style={{ fontSize:22, fontWeight:700 }}>{sc_}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ background:"rgba(255,255,255,.95)", padding:"5px 10px", textAlign:"center" }}>
        <div style={{ fontFamily:OS, fontSize:38, fontWeight:700, lineHeight:1, color:"#0d1e38" }}>{s.sT}</div>
        <div style={{ fontFamily:II, fontSize:20, fontWeight:900, color:vpCd(s.vpT), marginTop:-2 }}>{fvp(s.vpT)}</div>
      </div>
      {(v.course||v.tee||v.date) && (
        <div style={{ fontFamily:II, padding:"4px 10px 8px", fontSize:10, fontWeight:600, color:tc3, textAlign:"center", lineHeight:1.8 }}>
          {v.course&&d.course && <div>{d.course}</div>}
          {v.tee&&d.tee && <div>{d.tee}{v.teeDist&&d.teeDist?` · ${d.teeDist}m`:""}</div>}
          {v.date&&d.date && <div>{d.date}</div>}
        </div>
      )}
    </div>
  );
}

/* V20 · GREEN COLUMNS — sem barra horizontal */
function V20({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:OS, display:"inline-flex", flexDirection:"column", alignItems:"stretch", color:tc, background:bg||"rgba(10,30,20,.90)", borderRadius:8, overflow:"hidden" }}>
      {(v.player||v.course||v.round||v.date) && (
        <div style={{ padding:"5px 8px 3px", textAlign:"center" }}>
          {(v.round||v.date) && <div style={{ fontFamily:II, fontSize:9, fontWeight:700, letterSpacing:2, color:tc3 }}>{[v.round&&`R${d.round}`,v.date&&d.date].filter(Boolean).join(" · ")}</div>}
          {v.player&&d.player && <div style={{ fontSize:16, fontWeight:700, letterSpacing:1, marginTop:3, wordBreak:"break-word" }}>{d.player.toUpperCase()}</div>}
          {v.course&&d.course && <div style={{ fontFamily:II, fontSize:10, fontWeight:500, color:tc3 }}>{d.course}</div>}
        </div>
      )}
      {v.holeScores && is18 && (
        <div style={{ display:"flex", justifyContent:"center", padding:"4px 8px 8px" }}>
          {[{off:0,l:"FRONT",sc:s.sF},{off:9,l:"BACK",sc:s.sB}].map(({off,l,sc:sc_},ci) => (
            <div key={off} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, borderRight:ci===0?"2px solid rgba(74,222,128,.25)":"none", paddingRight:ci===0?8:0, paddingLeft:ci===1?8:0 }}>
              {d.scores.slice(off,off+9).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} sz={30} />)}
              <div style={{ fontFamily:II, fontSize:9, fontWeight:700, letterSpacing:2, color:"#4ade80", marginTop:5 }}>{l}</div>
              <div style={{ fontSize:24, lineHeight:1 }}>{sc_}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ background:"rgba(255,255,255,.07)", padding:"5px 10px", textAlign:"center" }}>
        <div style={{ display:"flex", alignItems:"baseline", justifyContent:"center", gap:5 }}>
          <span style={{ fontSize:30, lineHeight:1 }}>{s.sT}</span>
          <span style={{ fontFamily:II, fontSize:16, fontWeight:900, color:vpC(s.vpT) }}>{fvp(s.vpT)}</span>
        </div>
        {v.stats && <div style={{ display:"flex", justifyContent:"center", marginTop:4 }}><StatsRow st={s.st} tc3={tc3} gap={8} fs={11} /></div>}
      </div>
    </div>
  );
}

/* V21 · DP WORLD COLUMNS */
function V21({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  const Col = ({ scores, pars }: { scores:number[]; pars:number[] }) => (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
      {scores.map((sc,i) => <SC key={i} sc={sc} par={pars[i]} sz={32} />)}
      <div style={{ height:1, background:"rgba(255,255,255,.2)", margin:"2px 0", alignSelf:"stretch" }} />
      <div style={{ fontFamily:OS, fontSize:16, fontWeight:700, color:tc, textAlign:"center" }}>{scores.reduce((a,x)=>a+x,0)}</div>
    </div>
  );
  return (
    <div style={{ fontFamily:II, display:"inline-flex", flexDirection:"column", alignItems:"center", color:tc, background:bg, padding:"10px 12px", borderRadius:10 }}>
      {(v.player||v.position||v.event||v.round) && (
        <div style={{ width:"100%", marginBottom:4 }}>
          {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:13, fontWeight:700, letterSpacing:.3, textTransform:"uppercase", wordBreak:"break-word" }}>{d.player}</div>}
          {(v.position||v.event) && <div style={{ fontSize:10, fontWeight:600, color:tc3, marginTop:2 }}>{[v.position&&d.position,v.event&&d.event].filter(Boolean).join(" · ")}</div>}
          {v.round && <div style={{ fontSize:10, fontWeight:600, color:tc3 }}>Round {d.round}</div>}
        </div>
      )}
      <div style={{ position:"relative", display:"inline-block", margin:"4px 0" }}>
        <div style={{ fontFamily:OS, fontSize:88, fontWeight:900, letterSpacing:-4, lineHeight:1, color:tc }}>{s.sT}</div>
        <div style={{ fontFamily:II, position:"absolute", top:4, right:-36, fontSize:28, fontWeight:900, color:vpC(s.vpT) }}>{fvp(s.vpT)}</div>
      </div>
      {v.holeScores && (
        <div style={{ display:"flex", alignItems:"flex-start" }}>
          <Col scores={d.scores.slice(0,is18?9:d.scores.length)} pars={d.par.slice(0,is18?9:d.par.length)} />
          {is18 && <>
            <div style={{ width:1, background:"rgba(255,255,255,.2)", margin:"0 8px", alignSelf:"stretch" }} />
            <Col scores={d.scores.slice(9)} pars={d.par.slice(9)} />
          </>}
        </div>
      )}
      {(v.course||v.date) && (
        <div style={{ marginTop:8, textAlign:"center" }}>
          {[v.course&&d.course,v.date&&d.date].filter(Boolean).map((p,i) => (
            <div key={i} style={{ fontSize:10, fontWeight:600, color:tc4, lineHeight:1.7 }}>{p}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════ REGISTRY ═══════ */
type DesignDef = { id:string; label:string; C:React.FC<P>; needsHoles:boolean };
const DESIGNS: DesignDef[] = [
  { id:"V1",  label:"V1 · Sticker",       C:V1,  needsHoles:false },
  { id:"V2",  label:"V2 · Strip",          C:V2,  needsHoles:false },
  { id:"V3",  label:"V3 · Front/Back",     C:V3,  needsHoles:false },
  { id:"V4",  label:"V4 · Neon Ring",      C:V4,  needsHoles:false },
  { id:"V5",  label:"V5 · Ticket",         C:V5,  needsHoles:true  },
  { id:"V6",  label:"V6 · Grint Row",      C:V6,  needsHoles:true  },
  { id:"V7",  label:"V7 · Wide Row",       C:V7,  needsHoles:true  },
  { id:"V8",  label:"V8 · Gradient",       C:V8,  needsHoles:true  },
  { id:"V9",  label:"V9 · 18Birdies",      C:V9,  needsHoles:true  },
  { id:"V10", label:"V10 · Score Hero",    C:V10, needsHoles:true  },
  { id:"V11", label:"V11 · Giant Score",   C:V11, needsHoles:true  },
  { id:"V12", label:"V12 · Tournament",    C:V12, needsHoles:true  },
  { id:"V13", label:"V13 · Dashboard",     C:V13, needsHoles:true  },
  { id:"V14", label:"V14 · Compact Table", C:V14, needsHoles:true  },
  { id:"V15", label:"V15 · B&W Card",      C:V15, needsHoles:true  },
  { id:"V16", label:"V16 · Light Card",    C:V16, needsHoles:true  },
  { id:"V17", label:"V17 · Glass Card",    C:V17, needsHoles:true  },
  { id:"V18", label:"V18 · Classic Table", C:V18, needsHoles:true  },
  { id:"V19", label:"V19 · PGA Columns",   C:V19, needsHoles:true  },
  { id:"V20", label:"V20 · Green Columns", C:V20, needsHoles:true  },
  { id:"V21", label:"V21 · DP World",      C:V21, needsHoles:true  },
];

/* ═══════ TOGGLES ═══════ */
const TOGGLE_GROUPS = [
  { grp:"Score",   items:[{key:"holeScores",label:"Scores",def:true},{key:"holePar",label:"Par",def:true},{key:"holeSI",label:"S.I.",def:false},{key:"stats",label:"Stats",def:true}] },
  { grp:"Campo",   items:[{key:"course",label:"Campo",def:true},{key:"tee",label:"Tee",def:false},{key:"teeDist",label:"Dist.",def:false}] },
  { grp:"Jogador", items:[{key:"player",label:"Nome",def:false},{key:"hiCh",label:"HI/CH",def:false},{key:"sd",label:"SD",def:false}] },
  { grp:"Torneio", items:[{key:"event",label:"Torneio",def:false},{key:"round",label:"Round",def:false},{key:"date",label:"Data",def:true},{key:"position",label:"Pos.",def:false}] },
];
const ALL_TOGGLES = TOGGLE_GROUPS.flatMap(g => g.items);
const defaultVis = (): Vis => Object.fromEntries(ALL_TOGGLES.map(t => [t.key, t.def]));

/* ═══════ BACKGROUNDS ═══════ */
const BG_OPTIONS: { id:string; label:string; hex:string|null }[] = [
  { id:"transparent", label:"Sem fundo", hex:null     },
  { id:"black",       label:"Preto",     hex:"#000000" },
  { id:"navy",        label:"Navy",      hex:"#0f1e35" },
  { id:"navy2",       label:"Navy 2",    hex:"#14284f" },
  { id:"green",       label:"Verde",     hex:"#0d3320" },
  { id:"wine",        label:"Vinho",     hex:"#4a1020" },
  { id:"white",       label:"Branco",    hex:"#f2f2f2" },
];

/* ═══════ MAIN ═══════ */
export default function OverlayExport({ data, inline }: { data: OverlayData; inline?: boolean }) {
  const [player,      setPlayer]      = useState(data.player || "Manuel");
  const [event,       setEvent]       = useState(data.event  || "");
  const [round,       setRound]       = useState(data.round  || 1);
  const [date,        setDate]        = useState(() => {
    if (data.date) return data.date;
    const n = new Date();
    const m = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return `${n.getDate()} ${m[n.getMonth()]} ${n.getFullYear()}`;
  });
  const [position,    setPosition]    = useState(data.position || "");
  const [vis,         setVis]         = useState<Vis>(defaultVis);
  const [bgId,        setBgId]        = useState("navy");
  const [customBg,    setCustomBg]    = useState("#1a4a2e");
  const [bgAlpha,     setBgAlpha]     = useState(88);
  const [theme,       setTheme]       = useState<"dark"|"light">("dark");
  const [exporting,   setExporting]   = useState(false);
  const [collapsed,   setCollapsed]   = useState(true);
  const [manualScore, setManualScore] = useState("");
  const designRefs = useRef<Record<string, HTMLDivElement|null>>({});

  const noHoleData   = !data.hasHoles || data.scores.length === 0;
  const allFilled    = !noHoleData && data.scores.every(s => s !== null);
  const filledScores: number[] = noHoleData ? [] : data.scores.map((s,i) => s !== null ? s : (data.par[i] ?? 4));
  const manualTotal  = noHoleData ? parseInt(manualScore) || null : null;
  const manualPar    = data.is9h ? 36 : 72;
  const manualSD     = manualTotal !== null && data.slope > 0 ? (113/data.slope)*(manualTotal - data.cr) : null;

  const dd: DD = useMemo(() => ({
    player, event, round, date, position,
    course: data.courseName, tee: data.teeName, teeDist: data.teeDist,
    cr: data.cr, slope: data.slope,
    par: noHoleData ? [] : data.par,
    scores: filledScores,
    si: noHoleData ? [] : data.si,
    hi: data.hi, courseHcp: data.courseHcp,
    sd: noHoleData ? (manualSD ?? null) : data.sd,
    is9h: data.is9h, hasHoles: data.hasHoles,
  }), [data, player, event, round, date, position, filledScores, noHoleData, manualSD]);

  const stats = useMemo((): Stats => {
    if (!noHoleData) return calcStats(dd);
    const sT = manualTotal ?? manualPar;
    return { pF:0,pB:0,pT:manualPar, sF:0,sB:0,sT, vpT:sT-manualPar, vpF:0,vpB:0, sd:manualSD??0,
      st:{ eagles:0, birdies:0, pars:0, bogeys:0, doubles:0, triples:0 } };
  }, [dd, noHoleData, manualTotal, manualPar, manualSD]);

  const toggle = (key: string) => setVis(prev => ({ ...prev, [key]: !prev[key] }));
  const available = DESIGNS.filter(x => !x.needsHoles || data.hasHoles);

  const bgOpt   = BG_OPTIONS.find(b => b.id === bgId);
  const bgHex   = bgId === "custom" ? customBg : (bgOpt?.hex ?? null);
  const bgColor = bgHex ? hexToRgba(bgHex, bgAlpha/100) : null;

  const tc  = theme === "light" ? "#111"               : "#fff";
  const tc2 = theme === "light" ? "rgba(0,0,0,0.55)"   : "rgba(255,255,255,0.6)";
  const tc3 = theme === "light" ? "rgba(0,0,0,0.35)"   : "rgba(255,255,255,0.4)";
  const tc4 = theme === "light" ? "rgba(0,0,0,0.2)"    : "rgba(255,255,255,0.25)";

  const checkerBg: React.CSSProperties = {
    backgroundImage:"linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)",
    backgroundSize:"12px 12px", backgroundPosition:"0 0,0 6px,6px -6px,-6px 0px", backgroundColor:"#fff",
  };

  const doExportAll = useCallback(async () => {
    setExporting(true);
    try {
      const h2c = (await import("html2canvas")).default;
      const files: File[] = [];
      for (const design of available) {
        const el = designRefs.current[design.id]; if (!el) continue;
        const canvas = await h2c(el, { backgroundColor:null, scale:3, useCORS:true, logging:false });
        const blob = await new Promise<Blob|null>(r => canvas.toBlob(r, "image/png"));
        if (blob) files.push(new File([blob], `${design.label}.png`, { type:"image/png" }));
      }
      if (!files.length) return;
      if (navigator.share && navigator.canShare && navigator.canShare({ files })) {
        try { await navigator.share({ files, title:"Scorecards" }); return; } catch {}
      }
      for (let i = 0; i < files.length; i++) {
        const url = URL.createObjectURL(files[i]);
        const a = document.createElement("a"); a.href=url; a.download=files[i].name; a.click();
        URL.revokeObjectURL(url);
        if (i < files.length-1) await new Promise(r => setTimeout(r, 300));
      }
    } catch(err) { console.error(err); alert("Erro ao exportar."); }
    finally { setExporting(false); }
  }, [available]);

  const doExportOne = useCallback(async (designId: string) => {
    const el = designRefs.current[designId]; if (!el) return;
    try {
      const h2c = (await import("html2canvas")).default;
      const canvas = await h2c(el, { backgroundColor:null, scale:3, useCORS:true, logging:false });
      canvas.toBlob(async (blob: Blob|null) => {
        if (!blob) return;
        const file = new File([blob], `scorecard-${designId}.png`, { type:"image/png" });
        if (navigator.share && navigator.canShare && navigator.canShare({ files:[file] })) {
          try { await navigator.share({ files:[file], title:"Scorecard" }); return; } catch {}
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href=url; a.download=file.name; a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch(err) { console.error(err); alert("Erro ao exportar"); }
  }, []);

  return (
    <div className={inline ? "ov-export-inline" : "ov-export"}>
      {!inline && (
        <div className="ov-header" onClick={() => setCollapsed(!collapsed)}>
          <h3 className="h-xs" style={{ margin:0, cursor:"pointer", userSelect:"none" }}>
            📷 Partilhar Scorecard{" "}
            <span style={{ fontSize:13, fontWeight:600, marginLeft:8, color:"#888" }}>{collapsed ? "▸ expandir" : "▾"}</span>
          </h3>
          {!allFilled && !noHoleData && !collapsed && (
            <div style={{ fontSize:13, fontWeight:700, color:"#b45309", marginTop:4 }}>⚠ Preenche todos os buracos para scores exactos.</div>
          )}
        </div>
      )}
      {inline && !allFilled && !noHoleData && (
        <div style={{ fontSize:13, fontWeight:700, color:"#b45309", marginBottom:8 }}>⚠ Preenche todos os buracos para scores exactos.</div>
      )}

      {(inline || !collapsed) && <>
        <link href={FONT_LINK} rel="stylesheet" />

        {/* Campos */}
        <div className="ov-fields">
          <div className="ov-field"><label>Jogador</label><input type="text" value={player} onChange={e=>setPlayer(e.target.value)} placeholder="Nome" className="input" style={{width:130}}/></div>
          <div className="ov-field"><label>Torneio</label><input type="text" value={event} onChange={e=>setEvent(e.target.value)} placeholder="Evento" className="input" style={{width:150}}/></div>
          <div className="ov-field"><label>R</label><input type="number" value={round} min={1} max={9} onChange={e=>setRound(Number(e.target.value))} className="input" style={{width:48}}/></div>
          <div className="ov-field"><label>Data</label><input type="text" value={date} onChange={e=>setDate(e.target.value)} className="input" style={{width:110}}/></div>
          <div className="ov-field"><label>Pos.</label><input type="text" value={position} onChange={e=>setPosition(e.target.value)} placeholder="—" className="input" style={{width:44}}/></div>
          {noHoleData && <div className="ov-field"><label>Score Total</label><input type="text" inputMode="numeric" value={manualScore} onChange={e=>setManualScore(e.target.value.replace(/\D/g,""))} placeholder={String(manualPar)} className="input" style={{width:60,fontWeight:800}}/></div>}
        </div>

        {/* Fundo */}
        <div className="ov-options">
          <div className="ov-opt-group" style={{ flexWrap:"wrap", gap:4 }}>
            <span className="ov-opt-label">Fundo</span>
            {BG_OPTIONS.map(bg => (
              <button key={bg.id} className={`ov-opt-btn${bgId===bg.id?" active":""}`} onClick={()=>setBgId(bg.id)}
                style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 8px" }}>
                <span style={{ display:"inline-block", width:14, height:14, borderRadius:3, flexShrink:0,
                  border:"1px solid rgba(128,128,128,0.4)",
                  background: bg.hex===null ? "linear-gradient(45deg,#ccc 25%,#fff 25%,#fff 50%,#ccc 50%,#ccc 75%,#fff 75%)" : bg.hex,
                  backgroundSize: bg.hex===null ? "6px 6px" : undefined }} />
                <span style={{ fontSize:11 }}>{bg.label}</span>
              </button>
            ))}
            <button className={`ov-opt-btn${bgId==="custom"?" active":""}`} onClick={()=>setBgId("custom")}
              style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 8px" }}>
              <input type="color" value={customBg} onClick={e=>e.stopPropagation()}
                onChange={e=>{ setCustomBg(e.target.value); setBgId("custom"); }}
                style={{ width:14, height:14, padding:0, border:"1px solid rgba(128,128,128,0.4)", borderRadius:3, cursor:"pointer" }} />
              <span style={{ fontSize:11 }}>Outra…</span>
            </button>
          </div>
          {bgHex && (
            <div className="ov-opt-group">
              <span className="ov-opt-label">Opacidade</span>
              <input type="range" min={0} max={100} value={bgAlpha} onChange={e=>setBgAlpha(parseInt(e.target.value))} style={{ width:120, accentColor:"#2e7d32" }} />
              <span style={{ fontSize:13, color:"#888", minWidth:34, fontWeight:700 }}>{bgAlpha}%</span>
            </div>
          )}
          <div className="ov-opt-group">
            <span className="ov-opt-label">Tema</span>
            {(["dark","light"] as const).map(t => (
              <button key={t} className={`ov-opt-btn${theme===t?" active":""}`} onClick={()=>setTheme(t)}
                style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px" }}>
                <span style={{ display:"inline-block", width:14, height:14, borderRadius:3, background:t==="dark"?"#1a1a1a":"#fff", border:"1px solid rgba(128,128,128,0.4)" }} />
                <span style={{ fontSize:11 }}>{t==="dark"?"Escuro":"Claro"}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Toggles por grupo */}
        <div className="ov-toggles" style={{ display:"flex", flexWrap:"wrap", gap:"6px 16px" }}>
          {TOGGLE_GROUPS.map(g => (
            <div key={g.grp} style={{ display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
              <span style={{ fontSize:10, fontWeight:700, color:"#888", letterSpacing:.5, minWidth:42 }}>{g.grp}</span>
              {g.items.map(t => (
                <label key={t.key} className="ov-toggle">
                  <input type="checkbox" checked={!!vis[t.key]} onChange={()=>toggle(t.key)} />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>

        {/* Export all */}
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          <button className="ov-export-btn" onClick={doExportAll} disabled={exporting}>
            {exporting ? "A gerar imagens…" : `📷 Descarregar Todos (${available.length})`}
          </button>
        </div>

        {/* Aviso */}
        {noHoleData && !manualTotal && (
          <div style={{ padding:"12px 16px", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, color:"#92400e", fontSize:13, fontWeight:700, marginBottom:12 }}>
            Insere o <strong>Score Total</strong> acima para pré-visualizar os overlays.
          </div>
        )}

        {/* Gallery */}
        <div className="ov-gallery">
          {available.map(x => (
            <div key={x.id} className="ov-card">
              <div className="ov-card-header">
                <span className="ov-card-label">{x.label}</span>
                <button className="ov-share-btn" onClick={()=>doExportOne(x.id)} title="Partilhar / Descarregar">📤</button>
              </div>
              <div className="ov-card-preview" style={checkerBg}>
                <div ref={el=>{ designRefs.current[x.id]=el; }} style={{ display:"inline-block" }}>
                  <x.C d={dd} v={vis} s={stats} bg={bgColor} tc={tc} tc2={tc2} tc3={tc3} tc4={tc4} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </>}
    </div>
  );
}
