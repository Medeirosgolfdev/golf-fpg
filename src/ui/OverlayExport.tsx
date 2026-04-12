import React, { useState, useMemo, useRef, useCallback } from "react";
import { MONTHS_PT, fmtSD, fmtToPar } from "../utils/format";

/*
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  NOTA — CORES HARDCODED INTENCIONAIS                                    ║
 * ║                                                                          ║
 * ║  Este ficheiro gera scorecards visuais via html-to-image.                ║
 * ║  Cores nos templates estão hardcoded para máxima compatibilidade         ║
 * ║  com o renderer (DOM → SVG → Canvas → PNG).                              ║
 * ║                                                                          ║
 * ║  Para alterar as cores dos scorecards exportados, editar:                ║
 * ║    1. Os valores hardcoded neste ficheiro                                ║
 * ║    2. Os tokens correspondentes em tokens.css (para manter consistência) ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */


/* ═══════ TYPES ═══════ */
export type OverlayData = {
  courseName: string; teeName: string; teeDist: number | null;
  cr: number; slope: number;
  par: number[]; scores: (number | null)[]; si: number[];
  meters?: (number | null)[];  // metros por buraco (do tee)
  hi: number | null; courseHcp: number | null; sd: number | null;
  is9h: boolean; hasHoles: boolean;
  player: string; event: string; round: number; date: string; position: string;
};
type DD = {
  player: string; event: string; round: number; date: string; position: string;
  course: string; tee: string; teeDist: number | null;
  cr: number; slope: number;
  par: number[]; scores: number[]; si: number[];
  meters?: (number | null)[];
  hi: number | null; courseHcp: number | null; sd: number | null;
  is9h: boolean; hasHoles: boolean;
};
type Vis = Record<string, boolean>;
type StT = { hio:number; eagles:number; birdies:number; pars:number; bogeys:number; doubles:number; triples:number };
type Stats = { pF:number;pB:number;pT:number;sF:number;sB:number;sT:number;vpT:number;vpF:number;vpB:number;sd:number;st:StT };

/* ═══════ FONTS ═══════ */
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Oswald:wght@400;500;600;700&family=Bebas+Neue&family=Space+Grotesk:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,700;1,400;1,700&display=swap";
const II = "'Inter',sans-serif";
const OS = "'Oswald',sans-serif";
const LO = "'Lora',serif";
const BN = "'Bebas Neue',sans-serif";
const SG = "'Space Grotesk',sans-serif";

/*
 * Pre-fetch Google Fonts CSS e converte as fonts woff2 para base64 data URIs.
 * Contorna o bug CORS do html-to-image (embed-webfonts.ts → normalizeFontFamily).
 * Resultado cacheado — só faz fetch na 1ª chamada.
 */
let _fontCSSCache: Promise<string> | null = null;
function getFontEmbedCSS(): Promise<string> {
  if (_fontCSSCache) return _fontCSSCache;
  _fontCSSCache = (async () => {
    try {
      /* 1. Fetch CSS do Google Fonts (browser moderno → retorna woff2) */
      const res = await fetch(FONT_LINK);
      let css = await res.text();
      /* 2. Extrair URLs de fonts e converter para base64 data URIs */
      const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1]);
      for (const url of urls) {
        try {
          const fontRes = await fetch(url);
          const buf = await fontRes.arrayBuffer();
          /* Conversão chunked — spread de arrays grandes rebenta a call stack */
          const bytes = new Uint8Array(buf);
          let bin = "";
          for (let i = 0; i < bytes.length; i += 8192) {
            bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.length)));
          }
          const b64 = btoa(bin);
          const mime = url.includes(".woff2") ? "font/woff2" : "font/woff";
          css = css.replace(url, `data:${mime};base64,${b64}`);
        } catch { /* se uma font falhar, manter URL original */ }
      }
      return css;
    } catch {
      return ""; /* fallback: sem embed (usa fonts do browser) */
    }
  })();
  return _fontCSSCache;
}

/* ═══════ HELPERS ═══════ */
const HIO_GREEN = "#10b981"; // hole-in-one — verde esmeralda
function scBg(d: number, sc?: number): string | null {
  if (sc === 1) return HIO_GREEN;  // hole-in-one — SEMPRE verde
  if (d <= -2) return "#d4a017"; // eagle+ — ouro
  if (d === -1) return "#dc2626"; // birdie — vermelho
  if (d === 1)  return "#3b82f6"; // bogey — azul médio
  if (d === 2)  return "#1e6ab0"; // double — azul mais visível
  if (d >= 3)   return "#1e4480"; // triple+ — navy mais visível
  return null;
}
const vpC  = (v: number) => { if (v <= -2) return "#d4a017"; if (v === -1) return "#ef4444"; if (v === 0) return "#d0d0d0"; if (v === 1) return "#7eb8e8"; return "#5b9bd5"; };
const vpCd = (v: number) => { if (v < 0) return "#16a34a"; if (v === 0) return "#666"; return "#dc2626"; };

/* Text shadow for readability over photos — subtle, not heavy */
const TS = "0 1px 2px rgba(0,0,0,.35)";
/* Slightly stronger shadow for large score numbers */
const TS_SCORE = "0 1px 3px rgba(0,0,0,.45)";

function hexToRgba(hex: string, a: number) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
  const r = parseInt(safe.slice(1,3),16), g = parseInt(safe.slice(3,5),16), b = parseInt(safe.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ── SC: score circle/square ── */
function SC({ sc, par, sz = 32 }: { sc: number; par: number; sz?: number }) {
  const d = sc - par;
  const fs = Math.round(sz * 0.52);
  const base: React.CSSProperties = { width: sz, height: sz, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: fs, lineHeight: 1, flexShrink: 0 };
  const bg = scBg(d, sc);
  if (!bg) return <div style={{ ...base, color: "inherit", textShadow: "0 1px 2px rgba(0,0,0,.3)" }}>{sc}</div>;
  return <div style={{ ...base, background: bg, color: "#fff", borderRadius: d <= -1 ? "50%" : 0 }}>{sc}</div>;
}
/* light bg variant */
function SCL({ sc, par, sz = 28 }: { sc: number; par: number; sz?: number }) {
  const d = sc - par;
  const fs = Math.round(sz * 0.52);
  const base: React.CSSProperties = { width: sz, height: sz, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: fs, lineHeight: 1, flexShrink: 0 };
  const bg = scBg(d, sc);
  if (!bg) return <div style={{ ...base, color: "#333" }}>{sc}</div>;
  return <div style={{ ...base, background: bg, color: "#fff", borderRadius: d <= -1 ? "50%" : 0 }}>{sc}</div>;
}
/* 18Birdies style: over-par = border only */
function SCQ({ sc, par, sz = 24 }: { sc: number; par: number; sz?: number }) {
  const d = sc - par;
  const fs = Math.round(sz * 0.5);
  const base: React.CSSProperties = { width: sz, height: sz, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: fs, lineHeight: 1, flexShrink: 0 };
  if (sc === 1) return <div style={{ ...base, background: HIO_GREEN, color: "#fff", borderRadius: "50%" }}>{sc}</div>;
  if (d <= -2) return <div style={{ ...base, background: "#d4a017", color: "#fff", borderRadius: "50%" }}>{sc}</div>;
  if (d === -1) return <div style={{ ...base, background: "#dc2626", color: "#fff", borderRadius: "50%" }}>{sc}</div>;
  if (d === 0)  return <div style={{ ...base, color: "inherit" }}>{sc}</div>;
  return <div style={{ ...base, border: "1.5px solid rgba(255,255,255,0.45)", color: "inherit" }}>{sc}</div>;
}

/* ── SCO: score circle OUTLINE only — all white, for transparent overlays ── */
/* HIO = green circle, Birdies/eagles = white circle outline, bogeys+ = white square outline, par = plain number */
function SCO({ sc, par, sz = 36 }: { sc: number; par: number; sz?: number }) {
  const d = sc - par;
  const fs = Math.round(sz * 0.52);
  const base: React.CSSProperties = { width: sz, height: sz, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: fs, lineHeight: 1, flexShrink: 0, color: "#fff" };
  if (sc === 1) return <div style={{ ...base, background: HIO_GREEN, borderRadius: "50%" }}>{sc}</div>;
  if (d <= -2) return <div style={{ ...base, border: "2.5px solid #fff", borderRadius: "50%" }}>{sc}</div>;
  if (d === -1) return <div style={{ ...base, border: "2px solid #fff", borderRadius: "50%" }}>{sc}</div>;
  if (d === 0)  return <div style={base}>{sc}</div>;
  if (d === 1)  return <div style={{ ...base, border: "2px solid rgba(255,255,255,.6)" }}>{sc}</div>;
  return <div style={{ ...base, border: "2.5px solid rgba(255,255,255,.6)" }}>{sc}</div>;
}

/* 2-row 9+9 grid */
function Grid2({ d, sz = 24, gap = 2, nc = "#555" }: { d: DD; sz?: number; gap?: number; nc?: string }) {
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
    { n: st.hio,     l: "HIO", c: HIO_GREEN  },
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
  if (v.sd   && d.sd !== null)   p.push(`SD ${fmtSD(d.sd)}`);
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
  const st: StT = { hio:0, eagles:0, birdies:0, pars:0, bogeys:0, doubles:0, triples:0 };
  d.scores.forEach((sc,i) => { const x=sc-d.par[i]; if(sc===1){st.hio++;} else if(x<=-2)st.eagles++; else if(x===-1)st.birdies++; else if(x===0)st.pars++; else if(x===1)st.bogeys++; else if(x===2)st.doubles++; else st.triples++; });
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
    <div style={{ fontFamily:II, display:"inline-flex", alignItems:"center", gap:5, padding:"3px 6px", borderRadius:12, background:bg||"rgba(0,0,0,.75)", color:tc, textShadow:TS }}>
      <span style={{ fontFamily:OS, fontSize:22, fontWeight:900, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</span>
      <span style={{ fontFamily:OS, fontSize:22, fontWeight:700, color:tc }}>{s.sT}</span>
      {v.player&&d.player && <span style={{ fontSize:13, fontWeight:700, color:tc2 }}>{d.player}</span>}
      {(v.course||v.date||v.round) && <span style={{ fontSize:11, color:tc3 }}>{metaStr(d,{course:v.course,date:v.date,round:v.round})}</span>}
    </div>
  );
}

/* V2 · STRIP */
function V2({ d, v, s, bg, tc="white", tc2, tc3 }: P) {
  return (
    <div style={{ fontFamily:II, display:"inline-flex", alignItems:"center", gap:6, padding:"4px 10px", background:bg||"rgba(0,0,0,.78)", color:tc, textShadow:TS }}>
      <div className="u-col-flex2">
        {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:18, fontWeight:700 }}>{d.player.toUpperCase()}</div>}
        {(v.course||v.date||v.round) && <div style={{ fontSize:11, fontWeight:600, color:tc3 }}>{metaStr(d,{course:v.course,date:v.date,round:v.round})}</div>}
        {v.stats && <StatsRow st={s.st} tc3={tc3} gap={4} fs={10} />}
      </div>
      <div style={{ width:1, background:"rgba(255,255,255,.15)", alignSelf:"stretch" }} />
      <div style={{ display:"flex", alignItems:"baseline", gap:5, flexShrink:0 }}>
        <span style={{ fontFamily:OS, fontSize:40, fontWeight:900, lineHeight:1, color:tc }}>{s.sT}</span>
        <span style={{ fontSize:18, fontWeight:900, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</span>
      </div>
    </div>
  );
}

/* V3 · FRONT/BACK */
function V3({ d, v, s, bg, tc="white", tc2, tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const Half = ({ lbl, score, vpar }: { lbl:string; score:number; vpar:number }) => (
    <div style={{ display:"flex", alignItems:"center", padding:"3px 8px", gap:5 }}>
      <span style={{ fontSize:10, fontWeight:700, letterSpacing:1, color:tc3, minWidth:40 }}>{lbl}</span>
      <span style={{ fontFamily:OS, fontSize:26, fontWeight:900, lineHeight:1, color:tc, flex:1 }}>{score}</span>
      <span style={{ fontSize:16, fontWeight:900, color:vpC(vpar) }}>{fmtToPar(vpar)}</span>
    </div>
  );
  return (
    <div style={{ fontFamily:II, display:"inline-flex", flexDirection:"column", background:bg||"rgba(0,0,0,.80)", color:tc, borderRadius:8, overflow:"hidden", minWidth:160, textShadow:TS }}>
      {(v.player&&d.player || v.course&&d.course) && <>
        <div style={{ padding:"3px 6px 2px" }}>
          {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:18, fontWeight:700 }}>{d.player.toUpperCase()}</div>}
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
      <div style={{ display:"flex", alignItems:"center", padding:"3px 6px", gap:5, background:"rgba(255,255,255,.07)" }}>
        <span style={{ fontSize:10, fontWeight:700, letterSpacing:1, color:tc2, minWidth:40 }}>TOTAL</span>
        <span style={{ fontFamily:OS, fontSize:36, fontWeight:900, lineHeight:1, color:tc, flex:1 }}>{s.sT}</span>
        <span style={{ fontSize:18, fontWeight:900, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</span>
      </div>
      {v.stats && <div style={{ padding:"3px 8px", borderTop:"1px solid rgba(255,255,255,.08)" }}><StatsRow st={s.st} tc3={tc3} gap={4} fs={10} /></div>}
    </div>
  );
}

/* V4 · NEON RING */
function V4({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  return (
    <div style={{ fontFamily:II, width:160, color:tc, textAlign:"center", background:bg, padding:"3px 6px", borderRadius:10, textShadow:TS }}>
      {v.course&&d.course && <div style={{ fontSize:11, fontWeight:700, letterSpacing:1, color:tc3 }}>{d.course}</div>}
      {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:14, fontWeight:700, marginTop:2 }}>{d.player.toUpperCase()}</div>}
      <div style={{ margin:"4px auto", width:90, height:90, borderRadius:"50%", border:`3px solid ${vpC(s.vpT)}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <div style={{ fontFamily:OS, fontSize:34, fontWeight:900, lineHeight:1, letterSpacing:-1, color:tc }}>{s.sT}</div>
        <div style={{ fontSize:20, fontWeight:900, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</div>
      </div>
      {v.stats && <div style={{ display:"flex", justifyContent:"center", marginTop:2 }}><StatsRow st={s.st} tc3={tc3} gap={5} fs={11} /></div>}
      {(v.date||v.round) && <div style={{ fontSize:10, fontWeight:600, color:tc4, marginTop:2 }}>{metaStr(d,{date:v.date,round:v.round})}</div>}
    </div>
  );
}

/* V5 · TICKET */
function V5({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
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
        {(v.date||v.tee||v.round||hcl) && <div style={{ textAlign:"center", fontSize:10, fontWeight:600, color:tc4, marginTop:2 }}>{[v.date&&d.date, v.tee&&d.tee, v.round&&`R${d.round}`, hcl].filter(Boolean).join(" · ")}</div>}
      </div>
    </div>
  );
}

/* V6 · GRINT ROW */
function V6({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:SG, display:"inline-block", color:tc, background:bg, padding:"4px 6px", borderRadius:8, textShadow:TS }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:5, gap:8 }}>
        <div className="u-col-flex2">
          {(v.course||v.date||v.round) && <div style={{ fontSize:10, fontWeight:700, color:tc3, letterSpacing:.5 }}>{metaStr(d,{course:v.course,date:v.date,round:v.round})}</div>}
          {v.player&&d.player && <div style={{ fontFamily:BN, fontSize:26, letterSpacing:1.5, lineHeight:1.1 }}>{d.player.toUpperCase()}</div>}
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontFamily:BN, fontSize:56, lineHeight:.85, letterSpacing:-1, color:tc, textShadow:TS_SCORE }}>{s.sT}</div>
          <div style={{ fontFamily:SG, fontSize:18, fontWeight:700, color:vpC(s.vpT), marginTop:1 }}>{fmtToPar(s.vpT)}</div>
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
    </div>
  );
}

/* V9 · 18BIRDIES */
function V9({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:SG, display:"inline-block", color:tc, background:bg||"rgba(15,15,25,0.9)", borderRadius:10, padding:"4px 6px", textShadow:TS }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
        <div>
          {v.course&&d.course && <div style={{ fontSize:14, fontWeight:700, letterSpacing:.3 }}>{d.course}</div>}
          <div style={{ fontSize:10, fontWeight:600, color:tc3 }}>Par {s.pT}{v.tee&&d.tee?` · ${d.tee}`:""}{v.date&&d.date?` · ${d.date}`:""}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontFamily:BN, fontSize:54, lineHeight:.85, letterSpacing:-1, color:tc, textShadow:TS_SCORE }}>{s.sT}</div>
          <div style={{ fontFamily:SG, fontSize:16, fontWeight:700, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</div>
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
      {(v.player||v.stats) && (
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:3, fontSize:10, fontWeight:700, color:tc4 }}>
          {v.player&&d.player ? <span>{d.player}</span> : <span />}
          {v.stats ? <StatsRow st={s.st} tc3={tc4} gap={4} fs={10} /> : <span />}
        </div>
      )}
    </div>
  );
}

/* V10 · SCORE HERO */
function V10({ d, v, s, bg, tc="white", tc2, tc3, tc4 }: P) {
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg||"rgba(0,0,0,.78)", borderRadius:10, padding:"3px 5px", textAlign:"center", textShadow:TS }}>
      <div style={{ fontSize:9, fontWeight:700, letterSpacing:3, color:tc3 }}>TO PAR</div>
      <div style={{ fontFamily:OS, fontSize:56, fontWeight:900, lineHeight:.9, letterSpacing:-3, margin:"2px 0", color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</div>
      <div style={{ fontSize:11, fontWeight:700, color:tc2 }}>Gross <span style={{ fontWeight:900, color:tc, fontSize:28 }}>{s.sT}</span></div>
      <div style={{ height:1, background:"rgba(255,255,255,.12)", margin:"6px 0" }} />
      {v.player&&d.player && <div style={{ fontSize:15, fontWeight:900, marginBottom:2 }}>{d.player}</div>}
      {(v.course||v.round||v.date) && <div style={{ fontSize:10, color:tc3, marginBottom:4 }}>{metaStr(d,{course:v.course,round:v.round,date:v.date})}</div>}
      {v.holeScores && <div className="u-flex-jc"><Grid2 d={d} sz={28} gap={3} nc={tc4} /></div>}
      {v.stats && <div style={{ display:"flex", justifyContent:"center", marginTop:3 }}><StatsRow st={s.st} tc3={tc3} gap={4} fs={11} /></div>}
      {hcl && <div style={{ fontSize:10, fontWeight:700, color:tc4, marginTop:3 }}>{hcl}</div>}
    </div>
  );
}

/* V11 · GIANT SCORE */
function V11({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:OS, display:"inline-block", textAlign:"center", color:tc }}>
      <div style={{ background:bg||"rgba(0,0,0,.75)", borderRadius:10, padding:"3px 5px", textShadow:TS }}>
        {v.round && <div style={{ fontFamily:II, fontSize:9, fontWeight:700, letterSpacing:3, color:tc3 }}>ROUND {d.round}</div>}
        {v.player&&d.player && <div style={{ fontSize:18, fontWeight:700, letterSpacing:.3, marginTop:1, wordBreak:"break-word" }}>{d.player.toUpperCase()}</div>}
        {(v.course||v.tee) && <div style={{ fontFamily:II, fontSize:10, fontWeight:600, color:tc3 }}>{[v.course&&d.course,v.tee&&d.tee].filter(Boolean).join(" · ")}</div>}
        <div style={{ display:"flex", alignItems:"baseline", justifyContent:"center", gap:6, margin:"6px 0 4px" }}>
          <span style={{ fontFamily:BN, fontSize:72, lineHeight:.8, letterSpacing:-2, color:tc, textShadow:TS_SCORE }}>{s.sT}</span>
          <span style={{ fontFamily:SG, fontSize:28, fontWeight:700, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</span>
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
function V12({ d, v, s, bg, tc="white", tc2, tc3, tc4 }: P) {
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg||"rgba(15,35,60,.88)", borderRadius:8, overflow:"hidden", textShadow:TS }}>
      <div style={{ padding:"3px 6px 4px", display:"flex", alignItems:"center", gap:5 }}>
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:2 }}>
          {v.player&&d.player && <div style={{ fontSize:20, fontWeight:900 }}>{d.player}</div>}
          {(v.course||v.round) && <div style={{ fontSize:11, fontWeight:700, color:tc2 }}>{[v.course&&d.course,v.round&&`R${d.round}`].filter(Boolean).join(" · ")}</div>}
          {(v.event||v.date) && <div style={{ fontSize:10, fontWeight:500, color:tc3 }}>{[v.event&&d.event,v.date&&d.date].filter(Boolean).join(" · ")}</div>}
          {hcl && <div style={{ fontSize:10, fontWeight:600, color:tc4 }}>{hcl}</div>}
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontFamily:BN, fontSize:52, lineHeight:.85, letterSpacing:-1, color:tc, textShadow:TS_SCORE }}>{s.sT}</div>
          <div style={{ fontFamily:SG, fontSize:18, fontWeight:700, color:vpC(s.vpT), marginTop:1 }}>{fmtToPar(s.vpT)}</div>
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
function V13({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg||"rgba(15,25,45,.85)", borderRadius:8, padding:"3px 6px", textShadow:TS }}>
      {(v.player||v.course) && (
        <div style={{ textAlign:"center", marginBottom:4 }}>
          {v.player&&d.player && <div style={{ fontSize:20, fontWeight:900 }}>{d.player}</div>}
          {(v.course||v.round) && <div style={{ fontSize:10, fontWeight:500, color:tc3 }}>{[v.course&&d.course,v.round&&`R${d.round}`].filter(Boolean).join(" · ")}</div>}
        </div>
      )}
      <div style={{ display:"flex", gap:5, marginBottom:3 }}>
        <V13Bx val={s.sT} label="SCORE" big tc={tc} tc3={tc3} /><V13Bx val={fmtToPar(s.vpT)} label="VS PAR" c={vpC(s.vpT)} big tc={tc} tc3={tc3} />
      </div>
      {v.stats && (
        <div style={{ display:"flex", gap:5, marginBottom:3 }}>
          <V13Bx val={s.st.birdies} label="BIRDIE" c="#dc2626" tc={tc} tc3={tc3} /><V13Bx val={s.st.pars} label="PAR" tc={tc} tc3={tc3} /><V13Bx val={s.st.bogeys} label="BOGEY" c="#5BADE6" tc={tc} tc3={tc3} />
        </div>
      )}
      {v.holeScores && <div className="u-flex-jc"><Grid2 d={d} sz={28} gap={3} nc={tc4} /></div>}
      {hcl && <div style={{ textAlign:"center", fontSize:10, fontWeight:700, color:tc4, marginTop:3 }}>{hcl}</div>}
    </div>
  );
}

/* V14 · COMPACT TABLE */
function V14({ d, v, s, bg, tc="white", tc2, tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18; const W = 24;
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg, padding:"2px 5px", borderRadius:8, textShadow:TS }}>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3, flexWrap:"wrap" }}>
        <span style={{ fontFamily:OS, fontSize:36, fontWeight:700, lineHeight:1 }}>{s.sT}</span>
        <span style={{ fontSize:20, fontWeight:900, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</span>
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
function V15({ d, v, s, bg }: P) {
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
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"3px 6px", background:"#f8fafc", borderTop:"1px solid #e5e7eb", flexWrap:"wrap", gap:3 }}>
        {v.stats ? <StatsRow st={s.st} tc3="#94a3b8" gap={5} fs={10} /> : <span />}
        {(v.course||v.date) && <div style={{ fontSize:10, fontWeight:600, color:"#9ca3af" }}>{metaStr(d,{course:v.course,date:v.date})}</div>}
      </div>
    </div>
  );
}

/* V16 · LIGHT CARD */
function V16({ d, v, s, bg }: P) {
  const is18 = d.scores.length >= 18; const W = 26;
  return (
    <div style={{ fontFamily:II, display:"inline-block", background:bg||"rgba(255,255,255,0.92)", borderRadius:8, padding:"3px 5px", color:"#222", border:"1px solid rgba(0,0,0,.08)" }}>
      {/* Header: apenas campo + data, sem score */}
      {(v.course||v.date||v.tee||v.round) && (
        <div style={{ borderBottom:"1px solid #e5e7eb", paddingBottom:3, marginBottom:3 }}>
          {v.course&&d.course && <div style={{ fontSize:13, fontWeight:900, color:"#111" }}>{d.course}</div>}
          {(v.date||v.tee||v.round) && <div style={{ fontSize:9, fontWeight:600, color:"#999" }}>{metaStr(d,{date:v.date,tee:v.tee,round:v.round})}</div>}
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

/* V17 · GLASS CARD */
function V17({ d, v, s, bg, tc="white", tc2, tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18; const W = 20;
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
              {d.scores.slice(off,off+cnt).map((sc,i) => <div key={i} style={{width:W,display:"flex",justifyContent:"center"}}><SC sc={sc} par={d.par[off+i]} sz={24} /></div>)}
              <div style={{ width:34, textAlign:"center", fontWeight:900, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", color:tc }}>{subS}</div>
            </div>
          </div>
        );
      })}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:3, padding:"3px 6px", background:"rgba(255,255,255,.07)", borderRadius:8, gap:5 }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:5, flexShrink:0 }}>
          <span style={{ fontFamily:OS, fontSize:28, fontWeight:900, letterSpacing:-1 }}>{s.sT}</span>
          <span style={{ fontSize:16, fontWeight:900, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</span>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
          {v.player&&d.player && <div style={{ fontSize:13, fontWeight:900 }}>{d.player}</div>}
          {(v.course||v.date) && <div style={{ fontSize:10, fontWeight:600, color:tc2 }}>{[v.course&&d.course,v.date&&d.date].filter(Boolean).join(" · ")}</div>}
          {hcl && <div style={{ fontSize:10, fontWeight:700, color:tc4 }}>{hcl}</div>}
          {v.stats && <div style={{ display:"flex", justifyContent:"flex-end" }}><StatsRow st={s.st} tc3={tc3} gap={4} fs={10} /></div>}
        </div>
      </div>
    </div>
  );
}

/* V19 · PGA COLUMNS — sem barra horizontal */
function V19({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  /* max width driven by the 2-column grid (~80px) — text must not exceed it */
  const maxW = is18 ? 80 : 42;
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
      {(v.course||v.tee||v.date) && (
        <div style={{ fontFamily:II, padding:"3px 6px 5px", fontSize:9, fontWeight:600, color:tc3, textAlign:"center", lineHeight:1.6, maxWidth: maxW + 30, overflow:"hidden" }}>
          {v.course&&d.course && <div style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{d.course}</div>}
          {v.tee&&d.tee && <div>{d.tee}{v.teeDist&&d.teeDist?` · ${d.teeDist}m`:""}</div>}
          {v.date&&d.date && <div>{d.date}</div>}
        </div>
      )}
    </div>
  );
}

/* V21 · DP WORLD COLUMNS — Col extraído para evitar recriação em cada render */
function V21Col({ scores, pars, tc }: { scores:number[]; pars:number[]; tc:string }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, color:tc }}>
      {scores.map((sc,i) => <SC key={i} sc={sc} par={pars[i]} sz={24} />)}
    </div>
  );
}

/* V21 · DP WORLD COLUMNS */
function V21({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
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
      {(v.course||v.date) && (
        <div style={{ marginTop:4, textAlign:"center" }}>
          {[v.course&&d.course,v.date&&d.date].filter(Boolean).map((p,i) => (
            <div key={i} style={{ fontSize:10, fontWeight:600, color:tc4, lineHeight:1.7 }}>{p}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/* V22 · MAGAZINE — Inspirado no estilo Golf Digest / Tyrrell Hatton.
   Score enorme como elemento dominante, grid compacto 2×9 abaixo, tipografia limpa. */
function V22({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:OS, display:"inline-flex", flexDirection:"column", alignItems:"center", color:tc, background:bg||"rgba(0,0,0,.72)", borderRadius:10, padding:"6px 12px 8px", minWidth:160, textShadow:TS }}>
      {v.player&&d.player && <div style={{ fontFamily:II, fontSize:11, fontWeight:800, letterSpacing:2, color:tc3, textTransform:"uppercase", wordBreak:"break-word", textAlign:"center" }}>{d.player}</div>}
      {(v.course||v.event) && <div style={{ fontFamily:II, fontSize:9, fontWeight:600, color:tc4, textAlign:"center", marginTop:1 }}>{[v.course&&d.course,v.event&&d.event].filter(Boolean).join(" · ")}</div>}
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
      {(v.date||v.round||v.stats) && (
        <div style={{ fontFamily:II, display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginTop:4, flexWrap:"wrap" }}>
          {(v.date||v.round) && <span style={{ fontSize:9, fontWeight:700, color:tc4 }}>{[v.round&&`R${d.round}`,v.date&&d.date].filter(Boolean).join(" · ")}</span>}
          {v.stats && <StatsRow st={s.st} tc3={tc4} gap={4} fs={9} />}
        </div>
      )}
    </div>
  );
}

/* V23 · BROADCAST — Estilo banner de TV / Grace Gipper.
   Barra horizontal compacta, nome à esquerda, front·back·total à direita. */
function V23({ d, v, s, bg, tc="white", tc2, tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:II, display:"inline-flex", alignItems:"stretch", background:bg||"rgba(15,30,60,.92)", color:tc, overflow:"hidden", borderRadius:6, textShadow:TS }}>
      {/* Left: player info */}
      <div style={{ padding:"4px 10px", display:"flex", flexDirection:"column", justifyContent:"center", borderRight:"2px solid rgba(255,255,255,.12)", minWidth:80 }}>
        {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:14, fontWeight:700, letterSpacing:.5, lineHeight:1.1 }}>{d.player.toUpperCase()}</div>}
        {(v.course||v.event) && <div style={{ fontSize:9, fontWeight:600, color:tc3, marginTop:2 }}>{[v.event&&d.event,v.course&&d.course].filter(Boolean).join(" · ")}</div>}
        {(v.date||v.round) && <div style={{ fontSize:9, fontWeight:600, color:tc3 }}>{[v.round&&`R${d.round}`,v.date&&d.date].filter(Boolean).join(" · ")}</div>}
      </div>
      {/* Right: scores */}
      <div style={{ display:"flex", alignItems:"center", gap:0 }}>
        {is18 && v.holeScores && (
          <>
            <div style={{ padding:"6px 8px", textAlign:"center", borderRight:"1px solid rgba(255,255,255,.08)" }}>
              <div style={{ fontFamily:OS, fontSize:20, fontWeight:700, lineHeight:1 }}>{s.sF}</div>
              <div style={{ fontSize:8, fontWeight:700, letterSpacing:1, color:tc3 }}>FRONT</div>
            </div>
            <div style={{ padding:"6px 8px", textAlign:"center", borderRight:"1px solid rgba(255,255,255,.08)" }}>
              <div style={{ fontFamily:OS, fontSize:20, fontWeight:700, lineHeight:1 }}>{s.sB}</div>
              <div style={{ fontSize:8, fontWeight:700, letterSpacing:1, color:tc3 }}>BACK</div>
            </div>
          </>
        )}
        <div style={{ padding:"4px 12px", textAlign:"center", background:"rgba(255,255,255,.07)" }}>
          <div style={{ fontFamily:OS, fontSize:28, fontWeight:900, lineHeight:1 }}>{s.sT}</div>
          <div style={{ fontSize:13, fontWeight:900, color:vpC(s.vpT), marginTop:0 }}>{fmtToPar(s.vpT)}</div>
        </div>
      </div>
      {v.position&&d.position && <div style={{ padding:"4px 8px", display:"flex", alignItems:"center", fontSize:12, fontWeight:800, color:tc2 }}>{d.position}</div>}
    </div>
  );
}

/* V24 · STORY — Optimizado para formato 9:16 (stories).
   Score enorme no topo, grid vertical de scores, info condensada no fundo. */
function V24({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  const hcl = hiChStr(d,v,s);
  return (
    <div style={{ fontFamily:OS, display:"inline-flex", flexDirection:"column", alignItems:"center", color:tc, background:bg||"rgba(0,0,0,.78)", borderRadius:12, padding:"8px 14px 10px", minWidth:120, textShadow:TS }}>
      {(v.round||v.event) && <div style={{ fontFamily:II, fontSize:8, fontWeight:800, letterSpacing:3, color:tc4, textTransform:"uppercase" }}>{[v.event&&d.event,v.round&&`ROUND ${d.round}`].filter(Boolean).join(" · ")}</div>}
      {v.player&&d.player && <div style={{ fontSize:14, fontWeight:700, letterSpacing:1, marginTop:2, textTransform:"uppercase", wordBreak:"break-word", textAlign:"center" }}>{d.player}</div>}
      {/* Giant score */}
      <div style={{ margin:"4px 0 2px", textAlign:"center" }}>
        <div style={{ fontSize:80, fontWeight:700, lineHeight:.82, letterSpacing:-5 }}>{s.sT}</div>
        <div style={{ fontFamily:II, fontSize:20, fontWeight:900, color:vpC(s.vpT), marginTop:2 }}>{fmtToPar(s.vpT)}</div>
      </div>
      {/* Vertical 2-col scores */}
      {v.holeScores && is18 && (
        <div style={{ display:"flex", gap:6, marginTop:4 }}>
          {[{off:0,sub:s.sF},{off:9,sub:s.sB}].map(({off,sub},ci) => (
            <div key={off} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, borderRight:ci===0?"1px solid rgba(255,255,255,.15)":"none", paddingRight:ci===0?6:0 }}>
              {d.scores.slice(off,off+9).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} sz={26} />)}
              <div style={{ fontFamily:II, fontSize:12, fontWeight:900, color:tc3, marginTop:2 }}>{sub}</div>
            </div>
          ))}
        </div>
      )}
      {v.holeScores && !is18 && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, marginTop:4 }}>
          {d.scores.map((sc,i) => <SC key={i} sc={sc} par={d.par[i]} sz={26} />)}
        </div>
      )}
      {/* Footer */}
      {(v.course||v.date||v.stats||hcl) && (
        <div style={{ fontFamily:II, textAlign:"center", marginTop:6 }}>
          {v.course&&d.course && <div style={{ fontSize:10, fontWeight:600, color:tc3 }}>{d.course}</div>}
          {v.date&&d.date && <div style={{ fontSize:9, fontWeight:600, color:tc4 }}>{d.date}</div>}
          {v.stats && <div style={{ display:"flex", justifyContent:"center", marginTop:2 }}><StatsRow st={s.st} tc3={tc4} gap={4} fs={9} /></div>}
          {hcl && <div style={{ fontSize:9, fontWeight:700, color:tc4, marginTop:2 }}>{hcl}</div>}
        </div>
      )}
    </div>
  );
}

/* V25 · MINIMAL — Ultra-compacto: só score + toPar + nome.
   Para quando a foto é tudo e o overlay deve ser o mais pequeno possível. */
function V25({ d, v, s, bg, tc="white", tc3 }: P) {
  return (
    <div style={{ fontFamily:OS, display:"inline-flex", alignItems:"baseline", gap:6, color:tc, background:bg||"rgba(0,0,0,.65)", borderRadius:8, padding:"4px 10px", textShadow:TS }}>
      <span style={{ fontSize:42, fontWeight:900, lineHeight:.85, letterSpacing:-2, color:tc }}>{s.sT}</span>
      <span style={{ fontFamily:II, fontSize:18, fontWeight:900, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</span>
      {v.player&&d.player && <span style={{ fontFamily:II, fontSize:12, fontWeight:700, color:tc3, marginLeft:2 }}>{d.player}</span>}
    </div>
  );
}

/* V26 · SIGNATURE — Elegante com tipografia serif, score dominante, grid compacto.
   Inspirado nos overlays editoriais (Golf Digest, LPGA). */
function V26({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:LO, display:"inline-flex", flexDirection:"column", alignItems:"center", color:tc, background:bg||"rgba(0,0,0,.75)", borderRadius:10, padding:"6px 14px 8px", minWidth:140, textShadow:TS }}>
      {v.player&&d.player && <div style={{ fontSize:16, fontWeight:700, fontStyle:"italic", letterSpacing:.5, marginBottom:2, wordBreak:"break-word", textAlign:"center" }}>{d.player}</div>}
      {(v.course||v.event) && <div style={{ fontFamily:II, fontSize:9, fontWeight:600, color:tc3, textTransform:"uppercase", letterSpacing:2, textAlign:"center" }}>{[v.event&&d.event,v.course&&d.course].filter(Boolean).join(" · ")}</div>}
      <div style={{ fontFamily:OS, fontSize:64, fontWeight:700, lineHeight:.82, letterSpacing:-3, margin:"4px 0 2px", color:tc }}>{s.sT}</div>
      <div style={{ fontFamily:II, fontSize:18, fontWeight:900, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</div>
      {/* Thin separator */}
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
      {(v.round||v.date||v.stats) && (
        <div style={{ fontFamily:II, display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginTop:4, flexWrap:"wrap" }}>
          {(v.round||v.date) && <span style={{ fontSize:9, fontWeight:600, color:tc4 }}>{[v.round&&`R${d.round}`,v.date&&d.date].filter(Boolean).join(" · ")}</span>}
          {v.stats && <StatsRow st={s.st} tc3={tc4} gap={4} fs={9} />}
        </div>
      )}
    </div>
  );
}

/* V27 · SCORE STRIP — Barra horizontal mínima com score grande + grid inline.
   Ideal para topo/fundo de story, ocupando toda a largura mas pouca altura. */
function V27({ d, v, s, bg, tc="white", tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:II, display:"inline-flex", alignItems:"center", gap:8, color:tc, background:bg||"rgba(0,0,0,.78)", borderRadius:8, padding:"4px 10px", textShadow:TS }}>
      <div style={{ display:"flex", alignItems:"baseline", gap:4, flexShrink:0 }}>
        <span style={{ fontFamily:OS, fontSize:44, fontWeight:900, lineHeight:1, letterSpacing:-2, color:tc }}>{s.sT}</span>
        <span style={{ fontSize:20, fontWeight:900, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</span>
      </div>
      {v.holeScores && (
        <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
          {(is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len]) => (
            <div key={off} style={{ display:"flex", gap:1 }}>
              {d.scores.slice(off,off+len).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} sz={20} />)}
            </div>
          ))}
        </div>
      )}
      {v.player&&d.player && <div style={{ fontSize:11, fontWeight:700, color:tc3, flexShrink:0 }}>{d.player}</div>}
    </div>
  );
}

/* V28 · FULL TABLE — Scorecard completo estilo Taylor McCormick/Grandhall.
   Tabela front+back com HOLE/PAR/SCORE, birdies com círculo, bogeys com quadrado, compacto. */
function V28({ d, v, s, bg, tc="white", tc2, tc3, tc4 }: P) {
  const is18 = d.scores.length >= 18; const W = 26;
  const hcl = hiChStr(d,v,s);
  const accent = "#e87722"; /* laranja estilo Grandhall */
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg||"rgba(0,0,0,.88)", borderRadius:8, overflow:"hidden", textShadow:TS }}>
      {/* Header com nome + score */}
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
      {/* Table */}
      {v.holeScores && (is18 ? [[0,9,s.sF,s.pF,"FRONT"],[9,9,s.sB,s.pB,"BACK"]] as [number,number,number,number,string][] : [[0,d.scores.length,s.sT,s.pT,"TOT"] as [number,number,number,number,string]]).map(([off,len,sub,subP,lbl],ri) => (
        <div key={off}>
          {/* Hole row */}
          <div style={{ display:"flex", background:accent, padding:"2px 0" }}>
            <div style={{ width:36, fontSize:8, fontWeight:800, color:"#fff", letterSpacing:1, display:"flex", alignItems:"center", paddingLeft:4 }}>HOLE</div>
            {Array.from({length:len},(_,i) => <div key={i} style={{width:W,textAlign:"center",fontSize:10,fontWeight:800,color:"#fff"}}>{off+i+1}</div>)}
            <div style={{ width:30, textAlign:"center", fontSize:8, fontWeight:800, color:"#fff", letterSpacing:1, display:"flex", alignItems:"center", justifyContent:"center" }}>{lbl}</div>
          </div>
          {/* Par row */}
          {v.holePar && (
            <div style={{ display:"flex", padding:"2px 0", background:"rgba(255,255,255,.06)" }}>
              <div style={{ width:36, fontSize:9, fontWeight:700, color:tc3, paddingLeft:4, display:"flex", alignItems:"center" }}>PAR</div>
              {d.par.slice(off,off+len).map((p,i) => <div key={i} style={{width:W,textAlign:"center",fontSize:10,fontWeight:700,color:tc2}}>{p}</div>)}
              <div style={{ width:30, textAlign:"center", fontSize:10, fontWeight:800, color:tc2 }}>{subP}</div>
            </div>
          )}
          {/* Score row */}
          <div style={{ display:"flex", padding:"2px 0", borderBottom:ri===0&&is18?`1px solid ${accent}`:"none" }}>
            <div style={{ width:36, fontSize:9, fontWeight:900, color:tc, paddingLeft:4, display:"flex", alignItems:"center" }}>SCORE</div>
            {d.scores.slice(off,off+len).map((sc,i) => <div key={i} style={{width:W,display:"flex",justifyContent:"center"}}><SC sc={sc} par={d.par[off+i]} sz={24} /></div>)}
            <div style={{ width:30, textAlign:"center", fontFamily:OS, fontSize:15, fontWeight:900, display:"flex", alignItems:"center", justifyContent:"center" }}>{sub}</div>
          </div>
        </div>
      ))}
      {/* Footer */}
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

/* V29 · TOUR — Estilo PGA Tour Americas / Auburn.
   Duas linhas de scores com hole numbers, score GRANDE à direita, nome + evento em baixo.
   O layout mais usado nas redes sociais profissionais. */
function V29({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg, padding:"4px 6px" }}>
      {v.holeScores && (
        <div style={{ display:"flex", alignItems:"center" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
            {(is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len]) => (
              <div key={off} style={{ display:"flex", gap:2 }}>
                {d.scores.slice(off,off+len).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} sz={36} />)}
              </div>
            ))}
          </div>
          <div style={{ textAlign:"right", flexShrink:0, marginLeft:8 }}>
            <div style={{ fontFamily:BN, fontSize:100, lineHeight:.75, letterSpacing:-3, color:tc }}>{s.sT}</div>
            <div style={{ fontFamily:SG, fontSize:16, fontWeight:700, color:vpC(s.vpT), marginTop:2 }}>{fmtToPar(s.vpT)}</div>
          </div>
        </div>
      )}
      {!v.holeScores && (
        <div style={{ display:"flex", alignItems:"baseline", gap:6, justifyContent:"center" }}>
          <span style={{ fontFamily:BN, fontSize:100, lineHeight:.75, letterSpacing:-3, color:tc }}>{s.sT}</span>
          <span style={{ fontFamily:SG, fontSize:18, fontWeight:700, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</span>
        </div>
      )}
      {(v.player||v.event||v.round||v.course) && (
        <div style={{ marginTop:5, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", color:tc3, lineHeight:1.4 }}>
          {v.player&&d.player && <div>{d.player}</div>}
          {[v.event&&d.event,v.round&&`R${d.round}`].filter(Boolean).length > 0 && (
            <div style={{ fontSize:9 }}>{[v.event&&d.event,v.round&&`R${d.round}`].filter(Boolean).join(" · ")}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* V30 · KORN FERRY — Estilo Korn Ferry Tour.
   Barra de accent com nome do jogador, round + to-par, score grande à direita.
   Duas linhas de scores grandes abaixo. */
function V30({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const accent = "#047857";
  const isDark = tc === "#ffffff" || tc === "white";
  return (
    <div style={{ fontFamily:SG, display:"inline-block", color:tc, background:bg||"rgba(0,0,0,.85)", borderRadius:10, overflow:"hidden", textShadow:isDark?TS:"none" }}>
      <div style={{ display:"flex", alignItems:"stretch" }}>
        <div style={{ flex:1, padding:"6px 10px", display:"flex", flexDirection:"column", justifyContent:"center" }}>
          {v.player&&d.player && (
            <div style={{ display:"inline-block" }}>
              <span style={{ fontFamily:BN, background:accent, padding:"2px 10px", fontSize:18, letterSpacing:1.5, color:"#fff" }}>{d.player.toUpperCase()}</span>
            </div>
          )}
          <div style={{ display:"flex", gap:8, marginTop:3, alignItems:"center" }}>
            {v.round && <span style={{ fontSize:9, fontWeight:700, letterSpacing:2, color:tc3 }}>R{d.round}</span>}
            <span style={{ fontSize:14, fontWeight:700, color:isDark?vpC(s.vpT):vpCd(s.vpT) }}>{fmtToPar(s.vpT)}</span>
          </div>
        </div>
        <div style={{ padding:"6px 14px", display:"flex", alignItems:"center" }}>
          <div style={{ fontFamily:BN, fontSize:60, lineHeight:.8, letterSpacing:-2, color:tc }}>{s.sT}</div>
        </div>
      </div>
      {v.holeScores && (
        <div style={{ padding:"6px 8px 8px" }}>
          {(is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len],ri) => (
            <div key={off} style={{ display:"flex", gap:3, justifyContent:"center", marginTop:ri>0?4:0 }}>
              {d.scores.slice(off,off+len).map((sc,i) => isDark ? <SC key={i} sc={sc} par={d.par[off+i]} sz={30} /> : <SCL key={i} sc={sc} par={d.par[off+i]} sz={30} />)}
            </div>
          ))}
        </div>
      )}
      {(v.event||v.course||v.date) && (
        <div style={{ padding:"4px 10px 6px", borderTop:isDark?"1px solid rgba(255,255,255,.08)":"1px solid rgba(0,0,0,.08)", fontSize:9, fontWeight:600, color:tc3, display:"flex", justifyContent:"space-between" }}>
          <span>{[v.event&&d.event,v.course&&d.course].filter(Boolean).join(" · ")}</span>
          {v.date&&d.date && <span>{d.date}</span>}
        </div>
      )}
    </div>
  );
}

/* V31 · RUNNING TO-PAR TABLE — Estilo Pope's Back Nine / CBS broadcast.
   Tabela branca com hole numbers, par, scores e to-par cumulativo por buraco. */
function V31({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const isDark = tc === "#ffffff" || tc === "white";
  const bdr = isDark ? "1px solid #444" : "1px solid #ddd";
  const bgFinal = bg || (isDark ? "rgba(20,20,30,0.95)" : "rgba(255,255,255,0.95)");
  const txColor = isDark ? "#eee" : "#222";
  /* calcular to-par cumulativo */
  const cumToPar: number[] = [];
  let cum = 0;
  d.scores.forEach((sc, i) => { cum += sc - d.par[i]; cumToPar.push(cum); });

  return (
    <div style={{ fontFamily:II, display:"inline-block", background:bgFinal, color:txColor, borderRadius:8, overflow:"hidden", border:isDark?"1px solid #333":"1px solid #e0e0e0" }}>
      {(v.player||v.event) && (
        <div style={{ padding:"5px 8px", background:isDark?"#1a2744":"#1a2744", color:"#fff", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
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
          {/* Hole row */}
          <div style={{ display:"flex", background:isDark?"#1e2a3d":"#f1f5f9", borderBottom:bdr }}>
            <div style={{ width:42, padding:"2px 6px", fontSize:10, fontWeight:700, color:isDark?"#94a3b8":"#64748b", borderRight:bdr }}>{lbl}</div>
            {Array.from({length:len},(_,i) => <div key={i} style={{ width:28, textAlign:"center", fontSize:10, fontWeight:700, color:isDark?"#cbd5e1":"#374151", borderRight:bdr }}>{off+i+1}</div>)}
          </div>
          {/* Par row */}
          {v.holePar && (
            <div style={{ display:"flex", borderBottom:bdr }}>
              <div style={{ width:42, padding:"2px 6px", fontSize:10, fontWeight:600, color:isDark?"#94a3b8":"#6b7280", borderRight:bdr }}>Par</div>
              {d.par.slice(off,off+len).map((p,i) => <div key={i} style={{ width:28, textAlign:"center", fontSize:10, color:isDark?"#94a3b8":"#6b7280", borderRight:bdr }}>{p}</div>)}
            </div>
          )}
          {/* Score row */}
          <div style={{ display:"flex", borderBottom:bdr }}>
            <div style={{ width:42, padding:"2px 6px", fontSize:10, fontWeight:800, color:txColor, borderRight:bdr }}>Score</div>
            {d.scores.slice(off,off+len).map((sc,i) => <div key={i} style={{ width:28, display:"flex", justifyContent:"center", borderRight:bdr }}>{isDark ? <SC sc={sc} par={d.par[off+i]} sz={24} /> : <SCL sc={sc} par={d.par[off+i]} sz={24} />}</div>)}
          </div>
          {/* Cumulative to-par row */}
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

/* V32 · OLE MISS TABLE — Tabela colorida estilo Ole Miss / SEC.
   Cabeçalho escuro, hole numbers em accent, scores coloridos, OUT/IN, score grande à direita. */
function V32({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const isDark = tc === "#ffffff" || tc === "white";
  const accent = "#be1e2d"; /* vermelho Ole Miss / SEC */
  const navy = "#14213d";
  const txColor = isDark ? "#eee" : navy;
  return (
    <div style={{ fontFamily:OS, display:"inline-block", background:bg||(isDark?"rgba(20,20,40,0.95)":"rgba(255,255,255,0.95)"), color:txColor, borderRadius:8, overflow:"hidden" }}>
      {/* Header with player name + score */}
      <div style={{ background:navy, padding:"6px 10px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          {v.player&&d.player && <div style={{ fontFamily:OS, fontSize:18, fontWeight:700, color:"#fff", letterSpacing:1 }}>{d.player.toUpperCase()}</div>}
          {(v.event||v.round) && <div style={{ fontFamily:II, fontSize:9, fontWeight:600, color:"#94a3b8" }}>{[v.event&&d.event,v.round&&`R${d.round}`].filter(Boolean).join(" · ")}</div>}
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:40, fontWeight:700, color:"#fff", lineHeight:.85, letterSpacing:-2 }}>{s.sT}</div>
        </div>
      </div>
      {/* Score table */}
      {v.holeScores && (is18 ? [[0,9,s.sF,"OUT"],[9,9,s.sB,"IN"]] as [number,number,number,string][] : [[0,d.scores.length,s.sT,"TOT"] as [number,number,number,string]]).map(([off,len,sub,lbl]) => (
        <div key={off}>
          {/* Hole numbers in accent */}
          <div style={{ display:"flex", background:accent }}>
            {Array.from({length:len},(_,i) => <div key={i} style={{ width:30, textAlign:"center", fontSize:11, fontWeight:700, color:"#fff", padding:"2px 0" }}>{off+i+1}</div>)}
            <div style={{ width:36, textAlign:"center", fontSize:10, fontWeight:800, color:"#fff", padding:"2px 0", letterSpacing:1 }}>{lbl}</div>
          </div>
          {/* Scores */}
          <div style={{ display:"flex", borderBottom:"1px solid #e5e7eb" }}>
            {d.scores.slice(off,off+len).map((sc,i) => <div key={i} style={{ width:30, display:"flex", justifyContent:"center", padding:"2px 0" }}><SCL sc={sc} par={d.par[off+i]} sz={26} /></div>)}
            <div style={{ width:36, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:16, color:txColor }}>{sub}</div>
          </div>
        </div>
      ))}
      {/* Footer */}
      {(v.course||v.date||v.position) && (
        <div style={{ fontFamily:II, padding:"4px 10px", fontSize:9, fontWeight:600, color:tc3||"#9ca3af", display:"flex", justifyContent:"space-between", background:isDark?"rgba(255,255,255,.03)":"#f8fafc" }}>
          <span>{[v.course&&d.course,v.date&&d.date].filter(Boolean).join(" · ")}</span>
          {v.position&&d.position && <span style={{ fontWeight:800, color:txColor }}>{d.position}</span>}
        </div>
      )}
    </div>
  );
}

/* V33 · COLLEGE GRID — Estilo Texas A&M / duas colunas verticais com quadrados grandes.
   Front esquerda, Back direita, subtotais no fundo de cada coluna, total + to-par em baixo. */
function V33({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
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
      {/* Total score + to-par */}
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"center", gap:6, marginTop:6, paddingTop:4, borderTop:"1px solid rgba(255,255,255,.12)" }}>
        <span style={{ fontFamily:BN, fontSize:56, lineHeight:.8, letterSpacing:-1, color:tc, textShadow:TS_SCORE }}>{s.sT}</span>
        <span style={{ fontFamily:SG, fontSize:20, fontWeight:700, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</span>
      </div>
      {(v.event||v.course||v.date||v.round) && (
        <div style={{ fontFamily:II, textAlign:"center", marginTop:3, fontSize:9, fontWeight:600, color:tc3, lineHeight:1.4, maxWidth:200 }}>
          {[v.event&&d.event,v.course&&d.course,v.round&&`R${d.round}`,v.date&&d.date].filter(Boolean).join(" · ")}
        </div>
      )}
    </div>
  );
}

/* V38 · PGA AMERICAS — Estilo PGA Tour Americas.
   Transparente. Nome GRANDE em cima, hole numbers + 2 filas de circles,
   score ENORME à direita, round + tournament em barra em baixo. */
function V38({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg, padding:"4px 4px 4px 4px" }}>
      {v.player&&d.player && (
        <div style={{ fontFamily:LO, fontSize:32, fontWeight:700, fontStyle:"italic", marginBottom:4, letterSpacing:.5 }}>
          {d.player}
        </div>
      )}
      {v.holeScores && (
        <div style={{ display:"flex", alignItems:"center" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
            {(is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len],ri) => (
              <div key={off}>
                {ri === 0 && <div style={{ display:"flex", gap:2, marginBottom:1 }}>
                  {Array.from({length:len},(_,i) => <div key={i} style={{ width:36, textAlign:"center", fontSize:9, fontWeight:600, color:tc3 }}>{off+i+1}</div>)}
                </div>}
                <div style={{ display:"flex", gap:2 }}>
                  {d.scores.slice(off,off+len).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} sz={36} />)}
                </div>
                {ri === (is18 ? 1 : 0) && <div style={{ display:"flex", gap:2, marginTop:1 }}>
                  {Array.from({length:len},(_,i) => <div key={i} style={{ width:36, textAlign:"center", fontSize:9, fontWeight:600, color:tc3 }}>{off+i+1}</div>)}
                </div>}
              </div>
            ))}
          </div>
          <div style={{ textAlign:"right", flexShrink:0, marginLeft:8 }}>
            <div style={{ fontFamily:BN, fontSize:120, lineHeight:.75, letterSpacing:-4, color:tc }}>{s.sT}</div>
            <div style={{ fontFamily:SG, fontSize:16, fontWeight:700, marginTop:4 }}>
              <span style={{ color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</span>
            </div>
          </div>
        </div>
      )}
      {!v.holeScores && (
        <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
          <div style={{ fontFamily:BN, fontSize:120, lineHeight:.75, letterSpacing:-4, color:tc }}>{s.sT}</div>
          <div style={{ fontFamily:SG, fontSize:20, fontWeight:700, color:vpC(s.vpT) }}>{fmtToPar(s.vpT)}</div>
        </div>
      )}
      {(v.round||v.event||v.course||v.date) && (
        <div style={{ marginTop:6, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", lineHeight:1.4 }}>
          {v.round && <span style={{ background:"#dc2626", padding:"2px 8px", fontSize:10, fontWeight:800, color:"#fff", marginRight:4 }}>R{d.round}</span>}
          <div style={{ fontSize:9, color:tc3, marginTop:2 }}>{[v.event&&d.event,v.course&&d.course,v.date&&d.date].filter(Boolean).join(" · ")}</div>
        </div>
      )}
    </div>
  );
}

/* V34 · CLEAN WHITE — Estilo PGA/CBS broadcast. Fundo branco puro, linhas cinza finas,
   cor APENAS nos scores. Muito limpo e profissional. */
function V34({ d, v, s, bg, tc="white", tc3 }: P) {
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
    <div style={{ fontFamily:SG, display:"inline-block", background:bgF, color:tx, borderRadius:6, overflow:"hidden", border:isDark?"1px solid #333":"1px solid #ddd" }}>
      {(v.player||v.event||v.course) && (
        <div style={{ padding:"6px 10px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            {v.player&&d.player && <div style={{ fontFamily:BN, fontSize:22, letterSpacing:1 }}>{d.player.toUpperCase()}</div>}
            {(v.course||v.event||v.date) && <div style={{ fontSize:10, fontWeight:600, color:tc3||tx3 }}>{[v.event&&d.event,v.course&&d.course,v.date&&d.date].filter(Boolean).join(" · ")}</div>}
          </div>
          <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
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

/* V35 · ACCENT BAR — Barra colorida no topo, resto branco. Estilo college teams (Auburn, Illinois). */
function V35({ d, v, s, bg, tc="white", tc3 }: P) {
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
    <div style={{ fontFamily:SG, display:"inline-block", background:bgF, color:tx, borderRadius:6, overflow:"hidden" }}>
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

/* V39 · GHOST WHITE — SCO (contornos brancos).
   Transparente. 2 filas de circles outline à esquerda, score ENORME à direita. */
function V39({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg, padding:"4px 4px 4px 4px" }}>
      {v.holeScores && (
        <div style={{ display:"flex", alignItems:"center" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            {(is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len],ri) => (
              <div key={off}>
                {ri === 0 && <div style={{ display:"flex", gap:2, marginBottom:1 }}>
                  {Array.from({length:len},(_,i) => <div key={i} style={{ width:36, textAlign:"center", fontSize:9, fontWeight:600, color:tc3 }}>{off+i+1}</div>)}
                </div>}
                <div style={{ display:"flex", gap:2 }}>
                  {d.scores.slice(off,off+len).map((sc,i) => <SCO key={i} sc={sc} par={d.par[off+i]} sz={36} />)}
                </div>
                {ri === 1 && <div style={{ display:"flex", gap:2, marginTop:1 }}>
                  {Array.from({length:len},(_,i) => <div key={i} style={{ width:36, textAlign:"center", fontSize:9, fontWeight:600, color:tc3 }}>{off+i+1}</div>)}
                </div>}
              </div>
            ))}
          </div>
          <div style={{ textAlign:"right", flexShrink:0, marginLeft:8 }}>
            <div style={{ fontFamily:BN, fontSize:120, lineHeight:.75, letterSpacing:-4, color:tc }}>{s.sT}</div>
            <div style={{ fontFamily:SG, fontSize:16, fontWeight:700, color:tc3, marginTop:2, letterSpacing:1 }}>{fmtToPar(s.vpT)}</div>
          </div>
        </div>
      )}
      {!v.holeScores && (
        <div style={{ textAlign:"center" }}>
          <div style={{ fontFamily:BN, fontSize:120, lineHeight:.75, letterSpacing:-4, color:tc }}>{s.sT}</div>
          <div style={{ fontFamily:SG, fontSize:20, fontWeight:700, color:tc3, marginTop:4 }}>{fmtToPar(s.vpT)}</div>
        </div>
      )}
      {(v.player||v.event||v.round||v.course||v.date) && (
        <div style={{ marginTop:6, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", color:tc3, lineHeight:1.4 }}>
          {v.player&&d.player && <div>{d.player}</div>}
          {[v.event&&d.event,v.course&&d.course,v.round&&`R${d.round}`,v.date&&d.date].filter(Boolean).length > 0 && (
            <div style={{ fontSize:9 }}>{[v.event&&d.event,v.course&&d.course,v.round&&`R${d.round}`,v.date&&d.date].filter(Boolean).join(" · ")}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* V41 · HERO SCORE — SÓ score enorme + to-par + nome. Sem buracos. */
function V41({ d, v, s, bg, tc="white", tc3 }: P) {
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg, padding:4 }}>
      <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
        <div style={{ fontFamily:BN, fontSize:140, lineHeight:.72, letterSpacing:-5, color:tc }}>{s.sT}</div>
        <div style={{ fontFamily:SG, fontSize:24, fontWeight:700, color:vpC(s.vpT), letterSpacing:1 }}>{fmtToPar(s.vpT)}</div>
      </div>
      {v.player&&d.player && (
        <div style={{ fontFamily:LO, fontSize:28, fontWeight:700, fontStyle:"italic", marginTop:4, letterSpacing:.5 }}>{d.player}</div>
      )}
      {(v.event||v.round||v.course||v.date) && (
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", color:tc3, marginTop:4, lineHeight:1.4 }}>
          {[v.round&&`R${d.round}`,v.event&&d.event,v.course&&d.course].filter(Boolean).join(" · ")}
          {v.date&&d.date && <div style={{ fontSize:9 }}>{d.date}</div>}
        </div>
      )}
    </div>
  );
}

/* V42 · GLASS PANEL — Painel semi-transparente, score em accent color. */
function V42({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const isDark = tc === "#ffffff" || tc === "white";
  const accent = s.vpT < 0 ? "#dc2626" : "#1e40af";
  const bgF = bg || (isDark ? "rgba(20,20,30,.88)" : "rgba(255,255,255,.88)");
  const tx = isDark ? "#eee" : "#222";
  return (
    <div style={{ fontFamily:SG, display:"inline-block", background:bgF, color:tx, borderRadius:10, padding:"10px 14px" }}>
      <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
        <span style={{ fontFamily:BN, fontSize:80, lineHeight:.72, letterSpacing:-3, color:accent }}>{s.sT}</span>
        <span style={{ fontSize:22, fontWeight:700, color:accent }}>{fmtToPar(s.vpT)}</span>
      </div>
      {v.player&&d.player && (
        <div style={{ fontFamily:OS, fontSize:18, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", marginTop:2 }}>{d.player}</div>
      )}
      {v.holeScores && (
        <div style={{ marginTop:6 }}>
          {(is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len]) => (
            <div key={off} style={{ display:"flex", gap:3, marginBottom:3 }}>
              {d.scores.slice(off,off+len).map((sc,i) => (
                <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
                  <div style={{ fontSize:8, fontWeight:600, color:tc3 }}>{off+i+1}</div>
                  {isDark ? <SC sc={sc} par={d.par[off+i]} sz={28} /> : <SCL sc={sc} par={d.par[off+i]} sz={28} />}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {(v.event||v.course||v.round||v.date) && (
        <div style={{ fontSize:9, fontWeight:600, color:tc3, marginTop:4, letterSpacing:1, lineHeight:1.4 }}>
          {[v.event&&d.event,v.round&&`R${d.round}`,v.course&&d.course].filter(Boolean).join(" · ")}
          {v.date&&d.date && <div>{d.date}</div>}
        </div>
      )}
    </div>
  );
}

/* V43 · ACCENT STRIP — Barra vertical accent + score enorme. */
function V43({ d, v, s, bg, tc="white", tc3 }: P) {
  const accent = s.vpT < 0 ? "#dc2626" : s.vpT === 0 ? (tc === "#ffffff" || tc === "white" ? "#fff" : "#222") : "#3b82f6";
  return (
    <div style={{ fontFamily:II, display:"inline-flex", alignItems:"stretch", color:tc, background:bg, padding:2 }}>
      <div style={{ width:4, background:accent, borderRadius:2, marginRight:8, flexShrink:0 }} />
      <div>
        <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
          <span style={{ fontFamily:BN, fontSize:100, lineHeight:.72, letterSpacing:-4, color:tc }}>{s.sT}</span>
          <span style={{ fontFamily:SG, fontSize:20, fontWeight:700, color:vpC(s.vpT), letterSpacing:1 }}>{fmtToPar(s.vpT)}</span>
        </div>
        {v.player&&d.player && (
          <div style={{ fontFamily:OS, fontSize:14, fontWeight:700, letterSpacing:2, textTransform:"uppercase", marginTop:2 }}>{d.player}</div>
        )}
        {(v.event||v.round||v.course||v.date) && (
          <div style={{ fontSize:9, fontWeight:600, letterSpacing:1, color:tc3, marginTop:2, textTransform:"uppercase", lineHeight:1.4 }}>
            {[v.round&&`R${d.round}`,v.event&&d.event,v.course&&d.course,v.date&&d.date].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   V45–V47 — PGA TOUR PREMIUM DESIGNS
   Baseados nos overlays oficiais de @pgatour, @pgatouru, @auburngolf
   ═══════════════════════════════════════════════════════════ */

/* To-par badge — pill colorida como nos posts do PGA Tour */
function TpBadge({ vp, sz = 22 }: { vp: number; sz?: number }) {
  const bg = vp < 0 ? "#dc2626" : vp > 0 ? "#2563eb" : "#666";
  const txt = vp < 0 ? String(vp) : vp > 0 ? `+${vp}` : "E";
  return (
    <div style={{ background: bg, color: "#fff", fontFamily: II, fontSize: sz, fontWeight: 900, padding: `${Math.round(sz * 0.22)}px ${Math.round(sz * 0.55)}px`, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
      {txt}
    </div>
  );
}

/* Score circle com contorno accent — birdies com circle colorido, bogeys com square */
function SCA({ sc, par, sz = 36, accent = "#e87722" }: { sc: number; par: number; sz?: number; accent?: string }) {
  const d = sc - par;
  const fs = Math.round(sz * 0.5);
  const base: React.CSSProperties = { width: sz, height: sz, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: fs, lineHeight: 1, flexShrink: 0 };
  if (d <= -2) return <div style={{ ...base, border: `2.5px solid ${accent}`, borderRadius: "50%", color: "inherit" }}>{sc}</div>;
  if (d === -1) return <div style={{ ...base, border: `2px solid ${accent}`, borderRadius: "50%", color: "inherit" }}>{sc}</div>;
  if (d === 0)  return <div style={{ ...base, color: "inherit" }}>{sc}</div>;
  if (d === 1)  return <div style={{ ...base, background: "rgba(255,255,255,.12)", color: "inherit" }}>{sc}</div>;
  return <div style={{ ...base, background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.25)", color: "inherit" }}>{sc}</div>;
}

/* V45 · PGA BROADCAST — Estilo @pgatour Min Woo Lee / Houston Open.
   Score ENORME em fundo semi-transparente, badge de to-par vermelho,
   2 filas de circles em baixo, barra de torneio+round no fundo. */
function V45({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily: II, display: "inline-block", color: tc, background: bg, padding: "4px 6px 0" }}>
      {/* Name */}
      {v.player && d.player && (
        <div style={{ fontFamily: LO, fontSize: 24, fontWeight: 700, fontStyle: "italic", letterSpacing: .5, marginBottom: 2 }}>
          {d.player}
        </div>
      )}
      {/* Giant score + to-par badge */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
        <TpBadge vp={s.vpT} sz={20} />
        <div style={{ fontFamily: BN, fontSize: 140, lineHeight: .72, letterSpacing: -6, color: tc }}>{s.sT}</div>
      </div>
      {/* Score circles 2×9 com hole numbers */}
      {v.holeScores && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {(is18 ? [[0, 9], [9, 9]] as [number, number][] : [[0, d.scores.length] as [number, number]]).map(([off, len], ri) => (
            <div key={off}>
              <div style={{ display: "flex", gap: 2 }}>
                {d.scores.slice(off, off + len).map((sc, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                    {ri === 0 && <div style={{ fontSize: 9, fontWeight: 600, color: tc3 }}>{off + i + 1}</div>}
                    <SC sc={sc} par={d.par[off + i]} sz={36} />
                    {ri === (is18 ? 1 : 0) && <div style={{ fontSize: 9, fontWeight: 600, color: tc3 }}>{off + i + 1}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Tournament bar */}
      {(v.event || v.round || v.course || v.date) && (
        <div style={{ display: "flex", gap: 0, marginTop: 6 }}>
          {(v.event || v.course) && (
            <div style={{ background: "#dc2626", padding: "3px 10px", fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: "#fff", textTransform: "uppercase" }}>
              {[v.event && d.event, v.course && d.course].filter(Boolean).join(" · ")}
            </div>
          )}
          {v.round && (
            <div style={{ background: "rgba(255,255,255,.15)", padding: "3px 10px", fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: tc, textTransform: "uppercase" }}>
              ROUND {d.round}
            </div>
          )}
          {v.date && d.date && (
            <div style={{ background: "rgba(255,255,255,.08)", padding: "3px 10px", fontSize: 9, fontWeight: 700, letterSpacing: 1, color: tc3, textTransform: "uppercase" }}>
              {d.date}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* V46 · COLLEGE POSTER — Estilo @auburngolf / Jackson Koivun.
   2 filas de circles com separador, score ENORME à direita,
   nome + torneio + round em small caps no fundo. */
function V46({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily: II, display: "inline-block", color: tc, background: bg, padding: "4px 6px" }}>
      {v.holeScores && (
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {(is18 ? [[0, 9], [9, 9]] as [number, number][] : [[0, d.scores.length] as [number, number]]).map(([off, len], ri) => (
              <div key={off}>
                {/* Hole numbers acima da fila 1, abaixo da fila 2 */}
                {ri === 0 && (
                  <div style={{ display: "flex", gap: 3, marginBottom: 1 }}>
                    {Array.from({ length: len }, (_, i) => (
                      <div key={i} style={{ width: 36, textAlign: "center", fontSize: 9, fontWeight: 600, color: tc3 }}>{off + i + 1}</div>
                    ))}
                  </div>
                )}
                {/* Score circles */}
                <div style={{ display: "flex", gap: 3 }}>
                  {d.scores.slice(off, off + len).map((sc, i) => <SCO key={i} sc={sc} par={d.par[off + i]} sz={36} />)}
                </div>
                {/* Separator line between front and back */}
                {ri === 0 && is18 && (
                  <div style={{ height: 2, background: "rgba(255,255,255,.35)", margin: "4px 0" }} />
                )}
                {/* Hole numbers below row 2 */}
                {ri === (is18 ? 1 : 0) && (
                  <div style={{ display: "flex", gap: 3, marginTop: 1 }}>
                    {Array.from({ length: len }, (_, i) => (
                      <div key={i} style={{ width: 36, textAlign: "center", fontSize: 9, fontWeight: 600, color: tc3 }}>{off + i + 1}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Giant score + to-par */}
          <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 10 }}>
            <div style={{ fontFamily: BN, fontSize: 130, lineHeight: .72, letterSpacing: -5, color: tc }}>
              {s.sT}
            </div>
            <TpBadge vp={s.vpT} sz={18} />
          </div>
        </div>
      )}
      {!v.holeScores && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontFamily: BN, fontSize: 130, lineHeight: .72, letterSpacing: -5, color: tc }}>{s.sT}</div>
          <TpBadge vp={s.vpT} sz={22} />
        </div>
      )}
      {/* Footer bar: NOME · TORNEIO · ROUND */}
      {(v.player || v.event || v.round || v.course || v.date) && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 9, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: tc3, lineHeight: 1 }}>
          {v.player && d.player && <span>{d.player}</span>}
          <span>{[v.event && d.event, v.course && d.course].filter(Boolean).join(" · ")}</span>
          {v.round && <span>ROUND {d.round}</span>}
        </div>
      )}
    </div>
  );
}

/* V47 · PGA TOUR U — Estilo @pgatouru David Ford / Phichaksn Maichon.
   Nome ENORME, barra accent com torneio/round/to-par, circles com accent color,
   score enorme em baixo. Transparente para fotos. */
function V47({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const accent = "#e87722"; /* laranja estilo PGA Tour U */
  const accentBar = "#3b1f7e"; /* roxo para barra de info */
  return (
    <div style={{ fontFamily: II, display: "inline-block", color: tc, background: bg, padding: "4px 6px" }}>
      {/* Player name — HUGE */}
      {v.player && d.player && (() => {
        const parts = d.player.split(" ");
        const first = parts.slice(0, -1).join(" ");
        const last = parts[parts.length - 1] || "";
        return (
          <div style={{ fontFamily: OS, textTransform: "uppercase", lineHeight: .95, marginBottom: 2 }}>
            {first && <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: 2 }}>{first}</div>}
            <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: 1 }}>{last.toUpperCase()}</div>
          </div>
        );
      })()}
      {/* Info bar — roxo com torneio + round + to-par */}
      {(v.event || v.round || v.course) && (
        <div style={{ background: accentBar, padding: "3px 10px", display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1.5, color: "rgba(255,255,255,.8)", textTransform: "uppercase" }}>
            {[v.event && d.event, v.round && `ROUND ${d.round}`, v.course && d.course].filter(Boolean).join("  /  ")}
          </div>
        </div>
      )}
      {/* Score circles 2×9 com accent color + hole numbers */}
      {v.holeScores && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {(is18 ? [[0, 9], [9, 9]] as [number, number][] : [[0, d.scores.length] as [number, number]]).map(([off, len], ri) => (
            <div key={off}>
              <div style={{ display: "flex", gap: 2, marginBottom: 1 }}>
                {Array.from({ length: len }, (_, i) => (
                  <div key={i} style={{ width: 36, textAlign: "center", fontSize: 8, fontWeight: 700, color: accent, letterSpacing: .5 }}>{off + i + 1}</div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 2 }}>
                {d.scores.slice(off, off + len).map((sc, i) => <SCA key={i} sc={sc} par={d.par[off + i]} sz={36} accent={accent} />)}
              </div>
              {ri === 0 && is18 && (
                <div style={{ display: "flex", gap: 2, marginTop: 1, marginBottom: 2 }}>
                  {Array.from({ length: len }, (_, i) => (
                    <div key={i} style={{ width: 36, textAlign: "center", fontSize: 8, fontWeight: 700, color: tc3 }}>{off + i + 1}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Giant score + to-par */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginTop: 2 }}>
        <div style={{ fontFamily: BN, fontSize: 120, lineHeight: .72, letterSpacing: -4, color: tc }}>{s.sT}</div>
        <TpBadge vp={s.vpT} sz={24} />
      </div>
      {/* Date */}
      {v.date && d.date && (
        <div style={{ fontSize: 9, fontWeight: 600, color: tc3, marginTop: 4, letterSpacing: 1 }}>{d.date}</div>
      )}
    </div>
  );
}

/* V48 · HOLE-IN-ONE CELEBRATION — design especial para HIO (score=1) */
function V48({ d, v, s, bg, tc="white", tc2="#aaa", tc3="#888" }: P) {
  /* Detectar buracos com HIO */
  const hioHoles: { hole: number; par: number; meters: number | null }[] = [];
  d.scores.forEach((sc, i) => { if (sc === 1) hioHoles.push({ hole: i + 1, par: d.par[i], meters: d.meters?.[i] ?? null }); });
  /* Se não há HIO, mostrar fallback discreto */
  if (hioHoles.length === 0) {
    return (
      <div style={{ fontFamily: II, background: bg || "#111", color: tc, padding: 20, borderRadius: 10, textAlign: "center", minWidth: 280 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: tc3 }}>Sem Hole-in-One neste scorecard</div>
      </div>
    );
  }
  const hio = hioHoles[0]; // primeiro HIO (raramente haverá mais)
  return (
    <div style={{ fontFamily: II, background: bg || "#111", color: tc, padding: 0, borderRadius: 10, overflow: "hidden", minWidth: 320, maxWidth: 380, textAlign: "center" }}>
      {/* Top banner verde */}
      <div style={{ background: HIO_GREEN, padding: "14px 20px 10px", position: "relative" }}>
        <div style={{ fontFamily: OS, fontSize: 14, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "rgba(255,255,255,.85)" }}>Hole-in-One</div>
        <div style={{ fontFamily: BN, fontSize: 72, lineHeight: .85, color: "#fff", marginTop: 2, textShadow: "0 2px 8px rgba(0,0,0,.3)" }}>ACE!</div>
      </div>
      {/* Hole info */}
      <div style={{ padding: "18px 20px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {/* Hole + Par + Distance */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: tc3, letterSpacing: 1.5, textTransform: "uppercase" }}>Buraco</div>
            <div style={{ fontFamily: BN, fontSize: 64, lineHeight: .85, color: HIO_GREEN }}>{hio.hole}</div>
          </div>
          <div style={{ width: 1, height: 50, background: "rgba(255,255,255,.15)" }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: tc3, letterSpacing: 1.5, textTransform: "uppercase" }}>Par</div>
            <div style={{ fontFamily: BN, fontSize: 64, lineHeight: .85, color: tc2 }}>{hio.par}</div>
          </div>
          {hio.meters != null && hio.meters > 0 && <>
            <div style={{ width: 1, height: 50, background: "rgba(255,255,255,.15)" }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: tc3, letterSpacing: 1.5, textTransform: "uppercase" }}>Metros</div>
              <div style={{ fontFamily: BN, fontSize: 64, lineHeight: .85, color: tc2 }}>{hio.meters}</div>
            </div>
          </>}
        </div>
        {/* Player */}
        {v.player && d.player && (
          <div style={{ fontFamily: OS, fontSize: 22, fontWeight: 700, color: tc, letterSpacing: 1, marginTop: 4 }}>{d.player.toUpperCase()}</div>
        )}
        {/* Course + Event */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, marginTop: 2 }}>
          {v.course && d.course && <div style={{ fontSize: 13, fontWeight: 600, color: tc2 }}>{d.course}</div>}
          {v.event && d.event && <div style={{ fontSize: 12, fontWeight: 500, color: tc3 }}>{d.event}</div>}
          {v.date && d.date && <div style={{ fontSize: 11, fontWeight: 500, color: tc3 }}>{d.date}</div>}
        </div>
        {/* Score total discreto */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, padding: "4px 12px", background: "rgba(255,255,255,.06)", borderRadius: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: tc3 }}>Score Total</span>
          <span style={{ fontFamily: OS, fontSize: 18, fontWeight: 700, color: tc }}>{s.sT}</span>
          <span style={{ fontFamily: OS, fontSize: 14, fontWeight: 700, color: vpC(s.vpT) }}>{fmtToPar(s.vpT)}</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════ REGISTRY ═══════ */
type DesignDef = { id:string; label:string; C:React.FC<P>; needsHoles:boolean; needsHIO?:boolean; cat:string };
const CAT_HIO     = "🏌️ Hole-in-One";
const CAT_PRO     = "⭐ Pro Tour";
const CAT_TRANS   = "📷 Para Fotos";
const CAT_MINIMAL = "💬 Compactos";
const CAT_GRID    = "🏆 Cards";
const CAT_TABLE   = "📊 Tabelas";
const CAT_COLS    = "📱 Verticais";
const CAT_ORDER = [CAT_HIO, CAT_PRO, CAT_TRANS, CAT_MINIMAL, CAT_GRID, CAT_TABLE, CAT_COLS];

const DESIGNS: DesignDef[] = [
  /* 🏌️ Hole-in-One — design celebratório para HIO */
  { id:"V48", label:"Ace Celebration", C:V48, needsHoles:true, needsHIO:true, cat:CAT_HIO },
  /* ⭐ Pro Tour — estilo PGA Tour / PGA Tour U / College Golf */
  { id:"V45", label:"PGA Broadcast",  C:V45, needsHoles:true, cat:CAT_PRO },
  { id:"V46", label:"College Poster", C:V46, needsHoles:true, cat:CAT_PRO },
  { id:"V47", label:"PGA Tour U",     C:V47, needsHoles:true, cat:CAT_PRO },
  { id:"V29", label:"Tour Classic",   C:V29, needsHoles:true, cat:CAT_PRO },
  { id:"V38", label:"Tour + Nome",    C:V38, needsHoles:true, cat:CAT_PRO },
  { id:"V30", label:"Korn Ferry",     C:V30, needsHoles:true, cat:CAT_PRO },
  /* 📷 Para Fotos — transparentes, flutuam sobre foto */
  { id:"V39", label:"Outline Branco", C:V39, needsHoles:true, cat:CAT_TRANS },
  { id:"V41", label:"Só Score",       C:V41, needsHoles:false, cat:CAT_TRANS },
  { id:"V43", label:"Barra Accent",   C:V43, needsHoles:false, cat:CAT_TRANS },
  { id:"V42", label:"Painel Glass",   C:V42, needsHoles:true, cat:CAT_TRANS },
  /* 💬 Compactos — badges, strips, sem scores por buraco */
  { id:"V25", label:"Minimal",        C:V25, needsHoles:false, cat:CAT_MINIMAL },
  { id:"V1",  label:"Sticker",        C:V1,  needsHoles:false, cat:CAT_MINIMAL },
  { id:"V2",  label:"Strip",          C:V2,  needsHoles:false, cat:CAT_MINIMAL },
  { id:"V3",  label:"Front / Back",   C:V3,  needsHoles:false, cat:CAT_MINIMAL },
  { id:"V4",  label:"Neon Ring",      C:V4,  needsHoles:false, cat:CAT_MINIMAL },
  { id:"V23", label:"TV Broadcast",   C:V23, needsHoles:false, cat:CAT_MINIMAL },
  { id:"V27", label:"Score Strip",    C:V27, needsHoles:true, cat:CAT_MINIMAL },
  /* 🏆 Cards — designs completos com fundo */
  { id:"V11", label:"Giant Score",    C:V11, needsHoles:true, cat:CAT_GRID },
  { id:"V22", label:"Magazine",       C:V22, needsHoles:true, cat:CAT_GRID },
  { id:"V10", label:"Score Hero",     C:V10, needsHoles:true, cat:CAT_GRID },
  { id:"V12", label:"Tournament",     C:V12, needsHoles:true, cat:CAT_GRID },
  { id:"V6",  label:"Grint Row",      C:V6,  needsHoles:true, cat:CAT_GRID },
  { id:"V9",  label:"18Birdies",      C:V9,  needsHoles:true, cat:CAT_GRID },
  { id:"V13", label:"Dashboard",      C:V13, needsHoles:true, cat:CAT_GRID },
  { id:"V5",  label:"Ticket",         C:V5,  needsHoles:true, cat:CAT_GRID },
  { id:"V26", label:"Signature",      C:V26, needsHoles:true, cat:CAT_GRID },
  /* 📊 Tabelas — scorecards detalhados */
  { id:"V15", label:"B&W Card",       C:V15, needsHoles:true, cat:CAT_TABLE },
  { id:"V28", label:"Full Table",     C:V28, needsHoles:true, cat:CAT_TABLE },
  { id:"V31", label:"To-Par Cumulat.",C:V31, needsHoles:true, cat:CAT_TABLE },
  { id:"V32", label:"College Red",    C:V32, needsHoles:true, cat:CAT_TABLE },
  { id:"V34", label:"Clean White",    C:V34, needsHoles:true, cat:CAT_TABLE },
  { id:"V35", label:"Accent Bar",     C:V35, needsHoles:true, cat:CAT_TABLE },
  { id:"V14", label:"Compact Table",  C:V14, needsHoles:true, cat:CAT_TABLE },
  { id:"V16", label:"Light Card",     C:V16, needsHoles:true, cat:CAT_TABLE },
  { id:"V17", label:"Glass Card",     C:V17, needsHoles:true, cat:CAT_TABLE },
  /* 📱 Verticais — formato story / colunas */
  { id:"V24", label:"Story",          C:V24, needsHoles:true, cat:CAT_COLS },
  { id:"V19", label:"PGA Columns",    C:V19, needsHoles:true, cat:CAT_COLS },
  { id:"V21", label:"DP World",       C:V21, needsHoles:true, cat:CAT_COLS },
  { id:"V33", label:"College Grid",   C:V33, needsHoles:true, cat:CAT_COLS },
];

/* ═══════ TOGGLES ═══════ */
const ALL_TOGGLES: {key:string;label:string;def:boolean}[] = [
  {key:"holeScores",label:"Scores",def:true},{key:"holePar",label:"Par",def:true},{key:"holeSI",label:"S.I.",def:false},{key:"stats",label:"Stats",def:true},
  {key:"course",label:"Campo",def:true},{key:"tee",label:"Tee",def:false},{key:"teeDist",label:"Dist.",def:false},
  {key:"player",label:"Nome",def:true},{key:"hiCh",label:"HI/CH",def:false},{key:"sd",label:"SD",def:false},
  {key:"event",label:"Torneio",def:true},{key:"round",label:"Round",def:false},{key:"date",label:"Data",def:true},{key:"position",label:"Pos.",def:false},
];
const defaultVis = (): Vis => Object.fromEntries(ALL_TOGGLES.map(t => [t.key, t.def]));

/* Presets rápidos */
const VIS_PRESETS: {label:string; desc:string; vis:Vis}[] = [
  { label:"⭐ PGA Tour", desc:"Nome + torneio + round + posição — ideal para os designs Pro Tour", vis:{ holeScores:true, holePar:false, holeSI:false, stats:false, course:false, tee:false, teeDist:false, player:true, hiCh:false, sd:false, event:true, round:true, date:false, position:true } },
  { label:"Torneio",   desc:"Jogador + torneio + campo + stats", vis:{ holeScores:true, holePar:true, holeSI:false, stats:true, course:true, tee:false, teeDist:false, player:true, hiCh:false, sd:false, event:true, round:true, date:true, position:true } },
  { label:"Essencial", desc:"Scores + campo + nome + data", vis:{ holeScores:true, holePar:true, holeSI:false, stats:true, course:true, tee:false, teeDist:false, player:true, hiCh:false, sd:false, event:false, round:false, date:true, position:false } },
  { label:"Completo",  desc:"Tudo ligado", vis:{ holeScores:true, holePar:true, holeSI:true, stats:true, course:true, tee:true, teeDist:true, player:true, hiCh:true, sd:true, event:true, round:true, date:true, position:true } },
  { label:"Só Scores", desc:"Scores sem texto — limpo", vis:{ holeScores:true, holePar:false, holeSI:false, stats:false, course:false, tee:false, teeDist:false, player:false, hiCh:false, sd:false, event:false, round:false, date:false, position:false } },
];

/* ═══════ BACKGROUNDS ═══════ */
const BG_OPTIONS: { id:string; label:string; hex:string|null }[] = [
  { id:"transparent", label:"Sem fundo", hex:null     },
  { id:"black",       label:"Preto",     hex:"#000000" },
  { id:"navy",        label:"Navy",      hex:"#0f1e35" },
  { id:"pga",         label:"PGA Blue",  hex:"#00205b" },
  { id:"masters",     label:"Masters",   hex:"#006747" },
  { id:"green",       label:"Verde",     hex:"#0d3320" },
  { id:"wine",        label:"Vinho",     hex:"#4a1020" },
  { id:"white",       label:"Branco",    hex:"#f2f2f2" },
];

/* ═══════ MAIN ═══════ */
export default function OverlayExport({ data, inline, nextEvent }: { data: OverlayData; inline?: boolean; nextEvent?: string }) {
  const [player,      setPlayer]      = useState(() => {
    try { return localStorage.getItem("ov_player") || "Manuel"; } catch { return "Manuel"; }
  });
  const [event,       setEvent]       = useState(data.event || nextEvent || "");
  const [round,       setRound]       = useState(data.round  || 1);
  const [date,        setDate]        = useState(() => {
    if (data.date) return data.date;
    const n = new Date();
    return `${n.getDate()} ${MONTHS_PT[n.getMonth()]} ${n.getFullYear()}`;
  });
  const [position,    setPosition]    = useState(data.position || "");
  const [vis,         setVis]         = useState<Vis>(defaultVis);
  const [bgId,        setBgId]        = useState("navy");
  const [customBg,    setCustomBg]    = useState("#1a4a2e");
  const [bgAlpha,     setBgAlpha]     = useState(88);
  const [theme,       setTheme]       = useState<"dark"|"light">("dark");
  const [exporting,   setExporting]   = useState(false);
  const [exportingId, setExportingId] = useState<string|null>(null);
  const [collapsed,   setCollapsed]   = useState(true);
  const [manualScore, setManualScore] = useState("");
  const designRefs = useRef<Record<string, HTMLDivElement|null>>({});

  /* Persistir nome do jogador entre sessões */
  React.useEffect(() => {
    try { localStorage.setItem("ov_player", player); } catch { /* ignore */ }
  }, [player]);

  const noHoleData   = !data.hasHoles || data.scores.length === 0;
  const allFilled    = !noHoleData && data.scores.every(s => s !== null);
  const filledScores = useMemo<number[]>(
    () => noHoleData ? [] : data.scores.map((s, i) => s !== null ? s : (data.par[i] ?? 4)),
    [noHoleData, data.scores, data.par],
  );
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
    meters: data.meters,
    hi: data.hi, courseHcp: data.courseHcp,
    sd: noHoleData ? (manualSD ?? null) : data.sd,
    is9h: data.is9h, hasHoles: data.hasHoles,
  }), [data, player, event, round, date, position, filledScores, noHoleData, manualSD]);

  const stats = useMemo((): Stats => {
    if (!noHoleData) return calcStats(dd);
    const sT = manualTotal ?? manualPar;
    return { pF:0,pB:0,pT:manualPar, sF:0,sB:0,sT, vpT:sT-manualPar, vpF:0,vpB:0, sd:manualSD??0,
      st:{ hio:0, eagles:0, birdies:0, pars:0, bogeys:0, doubles:0, triples:0 } };
  }, [dd, noHoleData, manualTotal, manualPar, manualSD]);

  const toggle = useCallback((key: string) => setVis(prev => ({ ...prev, [key]: !prev[key] })), []);
  const hasHIO = useMemo(() => dd.scores.some(sc => sc === 1), [dd.scores]);
  const available = useMemo(
    () => DESIGNS.filter(x => (!x.needsHoles || data.hasHoles) && (!x.needsHIO || hasHIO)),
    [data.hasHoles, hasHIO],
  );

  const bgOpt   = BG_OPTIONS.find(b => b.id === bgId);
  const bgHex   = bgId === "custom" ? customBg : (bgOpt?.hex ?? null);
  const bgColor = bgHex ? hexToRgba(bgHex, bgAlpha/100) : "transparent";

  const tc  = theme === "light" ? "#111111" : "#ffffff";
  const tc2 = theme === "light" ? "#555555" : "#cccccc"; // texto secundário — totalmente opaco
  const tc3 = theme === "light" ? "#777777" : "#b0b0b0"; // labels — opaco, legível sobre foto
  const tc4 = theme === "light" ? "#999999" : "#999999"; // metadata — opaco, legível sobre foto

  const checkerBg: React.CSSProperties = {
    backgroundImage:"linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)",
    backgroundSize:"12px 12px", backgroundPosition:"0 0,0 6px,6px -6px,-6px 0px", backgroundColor:"#fff",
  };

  /* ── Helpers de export ── */
  const renderDesign = useCallback(async (designId: string): Promise<Blob|null> => {
    const el = designRefs.current[designId];
    if (!el) { console.warn("[overlay] ref not found:", designId); return null; }
    try { await document.fonts.ready; } catch { /* ignore */ }
    const { toBlob } = await import("html-to-image");
    /* Pre-fetch fonts como base64 — contorna bug CORS do html-to-image */
    const fontEmbedCSS = await getFontEmbedCSS();
    const opts = {
      pixelRatio: 3,
      backgroundColor: undefined as string | undefined,
      fontEmbedCSS, /* fonts já embebidas — skipFonts implícito */
      cacheBust: true,
    };
    /*
     * Safari/iOS: html-to-image precisa de múltiplas passagens
     * para "aquecer" o renderer SVG foreignObject.
     */
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
      || (/iPad|iPhone/.test(navigator.userAgent) && !("MSStream" in window));
    if (isSafari) {
      await toBlob(el, opts).catch(() => null);
      await toBlob(el, opts).catch(() => null);
    }
    return toBlob(el, opts);
  }, []);

  const shareFiles = async (files: File[]): Promise<boolean> => {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      if (!navigator.canShare({ files })) return false;
      await navigator.share({ files, title:"Scorecards" });
      return true;
    } catch (e: unknown) {
      /* Utilizador cancelou → não fazer fallback */
      if (e instanceof DOMException && e.name === "AbortError") return true;
      return false; /* erro real → tentar fallback */
    }
  };

  const doExportAll = useCallback(async () => {
    setExporting(true);
    try {
      const files: File[] = [];
      for (const design of available) {
        const blob = await renderDesign(design.id);
        if (blob) files.push(new File([blob], `${design.label}.png`, { type:"image/png" }));
      }
      if (!files.length) return;
      /* 1. Tentar share nativo (ideal para mobile — "Guardar X imagens") */
      if (await shareFiles(files)) return;
      /* 2. Fallback desktop: downloads individuais */
      for (let i = 0; i < files.length; i++) {
        const url = URL.createObjectURL(files[i]);
        const a = document.createElement("a"); a.href=url; a.download=files[i].name; a.click();
        URL.revokeObjectURL(url);
        if (i < files.length-1) await new Promise(r => setTimeout(r, 300));
      }
    } catch(err) {
      console.error("[overlay] export-all error:", err);
      alert(`Erro ao exportar: ${err instanceof Error ? err.message : String(err)}`);
    }
    finally { setExporting(false); }
  }, [available, renderDesign]);

  const doExportOne = useCallback(async (designId: string) => {
    setExportingId(designId);
    try {
      const blob = await renderDesign(designId);
      if (!blob) { alert("Não foi possível gerar a imagem."); return; }
      const file = new File([blob], `scorecard-${designId}.png`, { type:"image/png" });
      /* 1. Tentar share nativo (mobile) */
      if (await shareFiles([file])) return;
      /* 2. Fallback: download directo */
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href=url; a.download=file.name; a.click();
      URL.revokeObjectURL(url);
    } catch(err) {
      console.error("[overlay] export error:", err);
      alert(`Erro ao exportar: ${err instanceof Error ? err.message : String(err)}`);
    }
    finally { setExportingId(null); }
  }, [renderDesign]);

  return (
    <div className={inline ? "ov-export-inline" : "ov-export"}>
      {!inline && (
        <div className="ov-header" onClick={() => setCollapsed(!collapsed)}>
          <h3 className="h-xs" style={{ margin:0, cursor:"pointer", userSelect:"none" }}>
            📷 Partilhar Scorecard{" "}
            <span style={{ fontSize:13, fontWeight:600, marginLeft:8, color:"#888" }}>{collapsed ? "▸ expandir" : "▾"}</span>
          </h3>
          {!allFilled && !noHoleData && !collapsed && (
            <div style={{ fontSize:12, color:"#999", marginTop:2 }}>Buracos em branco assumidos como Par.</div>
          )}
        </div>
      )}
      {inline && !allFilled && !noHoleData && (
        <div style={{ fontSize:12, color:"#888", marginBottom:4 }}>Buracos em branco assumidos como Par.</div>
      )}

      {(inline || !collapsed) && <>
        <link href={FONT_LINK} rel="stylesheet" />

        {/* ── 1. DADOS ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 10px", marginBottom:10 }}>
          <div className="ov-field" style={{ gridColumn:"1/3" }}>
            <label style={{ fontSize:11, fontWeight:700, color:"#888" }}>Jogador</label>
            <input type="text" value={player} onChange={e=>setPlayer(e.target.value)} placeholder="Nome do jogador" className="input" style={{ width:"100%" }} />
          </div>
          <div className="ov-field">
            <label style={{ fontSize:11, fontWeight:700, color:"#888" }}>Torneio</label>
            <input type="text" value={event} onChange={e=>setEvent(e.target.value)} placeholder="Nome do torneio" className="input" style={{ width:"100%" }} />
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <div className="ov-field" style={{ flex:1 }}>
              <label style={{ fontSize:11, fontWeight:700, color:"#888" }}>Round</label>
              <input type="number" value={round} min={1} max={9} onChange={e=>setRound(Number(e.target.value))} className="input" style={{ width:"100%" }} />
            </div>
            <div className="ov-field" style={{ flex:1 }}>
              <label style={{ fontSize:11, fontWeight:700, color:"#888" }}>Pos.</label>
              <input type="text" value={position} onChange={e=>setPosition(e.target.value)} placeholder="—" className="input" style={{ width:"100%" }} />
            </div>
          </div>
          <div className="ov-field">
            <label style={{ fontSize:11, fontWeight:700, color:"#888" }}>Data</label>
            <input type="text" value={date} onChange={e=>setDate(e.target.value)} className="input" style={{ width:"100%" }} />
          </div>
          {noHoleData && (
            <div className="ov-field">
              <label style={{ fontSize:11, fontWeight:700, color:"#888" }}>Score Total</label>
              <input type="text" inputMode="numeric" value={manualScore} onChange={e=>setManualScore(e.target.value.replace(/\D/g,""))} placeholder={String(manualPar)} className="input" style={{ width:"100%", fontWeight:800 }} />
            </div>
          )}
        </div>

        {/* ── 2. PERSONALIZAÇÃO ── */}
        <div className="ov-section">
          {/* Fundo + Tema */}
          <div className="ov-section-label">Fundo</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:5, alignItems:"center", marginBottom:8 }}>
            {BG_OPTIONS.map(bg => (
              <button key={bg.id} className={`ov-opt-btn${bgId===bg.id?" active":""}`} onClick={()=>setBgId(bg.id)}
                style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
                <span style={{ display:"inline-block", width:16, height:16, borderRadius:4, flexShrink:0,
                  border:"1.5px solid rgba(128,128,128,0.3)",
                  background: bg.hex===null ? "linear-gradient(45deg,#ccc 25%,#fff 25%,#fff 50%,#ccc 50%,#ccc 75%,#fff 75%)" : bg.hex,
                  backgroundSize: bg.hex===null ? "6px 6px" : undefined }} />
                <span>{bg.label}</span>
              </button>
            ))}
            <button className={`ov-opt-btn${bgId==="custom"?" active":""}`} onClick={()=>setBgId("custom")}
              style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
              <input type="color" value={customBg} onClick={e=>e.stopPropagation()}
                onChange={e=>{ setCustomBg(e.target.value); setBgId("custom"); }}
                style={{ width:16, height:16, padding:0, border:"1.5px solid rgba(128,128,128,0.3)", borderRadius:4, cursor:"pointer" }} />
              <span>Outra</span>
            </button>
            <span style={{ width:1, height:18, background:"rgba(128,128,128,.2)", margin:"0 2px" }} />
            {(["dark","light"] as const).map(t => (
              <button key={t} className={`ov-opt-btn${theme===t?" active":""}`} onClick={()=>setTheme(t)}
                style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
                <span style={{ display:"inline-block", width:16, height:16, borderRadius:4, background:t==="dark"?"#1a1a1a":"#fff", border:"1.5px solid rgba(128,128,128,0.3)" }} />
                <span>{t==="dark"?"Escuro":"Claro"}</span>
              </button>
            ))}
          </div>
          {bgHex && (
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <span style={{ fontSize:11, fontWeight:800, color:"#888" }}>Opacidade</span>
              <input type="range" min={0} max={100} value={bgAlpha} onChange={e=>setBgAlpha(parseInt(e.target.value))} style={{ flex:1, maxWidth:160, accentColor:"#2e7d32" }} />
              <span style={{ fontSize:12, color:"#666", fontWeight:800, minWidth:32 }}>{bgAlpha}%</span>
            </div>
          )}

          {/* Presets */}
          <div className="ov-section-label" style={{ marginTop:4 }}>Preset</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:8 }}>
            {VIS_PRESETS.map(p => (
              <button key={p.label} className="ov-opt-btn" onClick={()=>setVis(p.vis)} title={p.desc}>{p.label}</button>
            ))}
          </div>

          {/* Toggles */}
          <div className="ov-section-label">Mostrar</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 6px" }}>
            {ALL_TOGGLES.map(t => (
              <label key={t.key} className="ov-toggle">
                <input type="checkbox" checked={!!vis[t.key]} onChange={()=>toggle(t.key)} />
                <span>{t.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ── 3. EXPORT ALL ── */}
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          <button className="ov-export-btn" onClick={doExportAll} disabled={exporting}>
            {exporting ? "A gerar imagens…" : `📷 Descarregar Todos (${available.length})`}
          </button>
        </div>

        {/* Aviso sem dados */}
        {noHoleData && !manualTotal && (
          <div style={{ padding:"10px 14px", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, color:"#92400e", fontSize:13, fontWeight:700, marginBottom:12 }}>
            Insere o <strong>Score Total</strong> acima para pré-visualizar os overlays.
          </div>
        )}

        {/* ── 5. GALERIA POR CATEGORIAS ── */}
        {CAT_ORDER.map(cat => {
          const items = available.filter(x => x.cat === cat);
          if (!items.length) return null;
          return (
            <div key={cat} style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:800, color:"#888", letterSpacing:.5, textTransform:"uppercase", marginBottom:6, borderBottom:"1px solid rgba(128,128,128,.15)", paddingBottom:3 }}>{cat}</div>
              <div className="ov-gallery">
                {items.map(x => (
                  <div key={x.id} className="ov-card">
                    <div className="ov-card-header">
                      <span className="ov-card-label">{x.label}</span>
                      <button className="ov-share-btn" onClick={()=>doExportOne(x.id)} disabled={exportingId===x.id} title="Partilhar / Descarregar">
                        {exportingId===x.id ? "⏳" : "📤"}
                      </button>
                    </div>
                    <div className="ov-card-preview" style={checkerBg}>
                      <div ref={el=>{ designRefs.current[x.id]=el; }} style={{ display:"inline-block", color:tc }}>
                        <x.C d={dd} v={vis} s={stats} bg={bgColor} tc={tc} tc2={tc2} tc3={tc3} tc4={tc4} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </>}
    </div>
  );
}
