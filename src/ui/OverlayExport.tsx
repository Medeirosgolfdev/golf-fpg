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
type Stats = { pF:number;pB:number;pT:number;sF:number;sB:number;sT:number;vpT:number;vpF:number;vpB:number;sd:number;st:{eagles:number;birdies:number;pars:number;bogeys:number;doubles:number;triples:number}};

/* ═══════ FONTS ═══════ */
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Oswald:wght@400;500;600;700&family=Bebas+Neue&family=Space+Grotesk:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,700;1,400;1,700&display=swap";
const II = "'Inter',sans-serif", O = "'Oswald',sans-serif",
  BE = "'Bebas Neue',sans-serif",
  LO = "'Lora',serif";

/* ═══════ SCORE COLORS ═══════ */
function sty(score:number,par:number){
  const d=score-par;
  if(d<=-2)return{c:"#fff",bg:"#d4a017"};
  if(d===-1)return{c:"#fff",bg:"#dc2626"};
  if(d===0)return{c:"inherit",bg:"transparent"};
  if(d===1)return{c:"#fff",bg:"#5BADE6"};
  if(d===2)return{c:"#fff",bg:"#2B6EA0"};
  if(d===3)return{c:"#fff",bg:"#1B4570"};
  return{c:"#fff",bg:"#0E2A45"};
}
const isUnder=(sc:number,par:number)=>sc<par;
const fvp=(v:number)=>v===0?"E":v>0?`+${v}`:`${v}`;
const vpC=(v:number)=>{if(v<0)return"#22c55e";if(v===0)return"#a3a3a3";if(v<=3)return"#f59e0b";if(v<=6)return"#f97316";return"#ef4444";};
const vpCd=(v:number)=>{if(v<0)return"#16a34a";if(v===0)return"#888";if(v<=3)return"#d97706";if(v<=6)return"#ea580c";return"#dc2626";};

function SC({score,par,size=26,fs:fsProp}:{score:number;par:number;size?:number;fs?:number}){
  const s=sty(score,par);const f=fsProp||size*0.5;
  const base:React.CSSProperties={width:size,height:size,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:f,lineHeight:1};
  if(s.bg==="transparent")return<div style={base}>{score}</div>;
  return<div style={{...base,background:s.bg,color:s.c,borderRadius:isUnder(score,par)?"50%":0}}>{score}</div>;
}
function SQ({score,par,size=28,fs:fsProp}:{score:number;par:number;size?:number;fs?:number}){
  const s=sty(score,par);const f=fsProp||size*0.48;
  const base:React.CSSProperties={width:size,height:size,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:f,lineHeight:1};
  if(s.bg==="transparent")return<div style={base}>{score}</div>;
  if(isUnder(score,par))return<div style={{...base,background:s.bg,color:s.c,borderRadius:"50%"}}>{score}</div>;
  return<div style={{...base,border:"2px solid rgba(255,255,255,0.5)",color:"#fff",borderRadius:0}}>{score}</div>;
}
function LSC({score,par,size=26,fs:fsProp}:{score:number;par:number;size?:number;fs?:number}){
  const d=score-par;const f=fsProp||size*0.5;
  const base:React.CSSProperties={width:size,height:size,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:f,lineHeight:1};
  if(d<=-2)return<div style={{...base,background:"#d4a017",color:"#fff",borderRadius:"50%"}}>{score}</div>;
  if(d===-1)return<div style={{...base,background:"#dc2626",color:"#fff",borderRadius:"50%"}}>{score}</div>;
  if(d===0)return<div style={{...base,color:"#333"}}>{score}</div>;
  return<div style={{...base,background:d===1?"#5BADE6":d===2?"#2B6EA0":"#1B4570",color:"#fff",borderRadius:0}}>{score}</div>;
}

function Grid99({d,size=26,gap=4,showNums=false,numFs=8}:{d:DD;size?:number;gap?:number;showNums?:boolean;numFs?:number}){
  const is18=d.scores.length>=18;
  const slices=is18?[{off:0,len:9},{off:9,len:9}]:[{off:0,len:d.scores.length}];
  return<div style={{display:"flex",flexDirection:"column",gap,alignItems:"center"}}>
    {slices.map(({off,len})=><div key={off} style={{display:"flex",gap}}>
      {d.scores.slice(off,off+len).map((sc,i)=><div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
        {showNums&&<div style={{fontSize:numFs,fontWeight:700,color:"rgba(255,255,255,0.3)",fontFamily:II}}>{off+i+1}</div>}
        <SC score={sc} par={d.par[off+i]} size={size}/></div>)}</div>)}</div>;
}

function StatsLine({s,gap=14,fs=13,lfs=8,color="rgba(255,255,255,0.4)"}:{s:Stats;gap?:number;fs?:number;lfs?:number;color?:string}){
  const items=[{n:s.st.eagles,l:"Eagle",c:"#d4a017"},{n:s.st.birdies,l:"Birdie",c:"#dc2626"},{n:s.st.pars,l:"Par",c:color},{n:s.st.bogeys,l:"Bogey",c:"#5BADE6"}].filter(x=>x.n>0);
  if(!items.length)return null;
  return<div style={{display:"flex",justifyContent:"center",gap,flexWrap:"wrap"}}>
    {items.map(x=><div key={x.l} style={{display:"flex",alignItems:"center",gap:4}}>
      <span style={{fontSize:fs,fontWeight:900,color:x.c}}>{x.n}</span>
      <span style={{fontSize:lfs,fontWeight:700,color,letterSpacing:0.5}}>{x.l}</span></div>)}</div>;
}

function calcStats(d:DD):Stats{
  const n=d.scores.length;const is18=n>=18;
  const pF=d.par.slice(0,Math.min(9,n)).reduce((a,b)=>a+b,0);
  const pB=is18?d.par.slice(9).reduce((a,b)=>a+b,0):0;
  const pT=is18?pF+pB:d.par.reduce((a,b)=>a+b,0);
  const sF=d.scores.slice(0,Math.min(9,n)).reduce((a,b)=>a+b,0);
  const sB=is18?d.scores.slice(9).reduce((a,b)=>a+b,0):0;
  const sT=is18?sF+sB:d.scores.reduce((a,b)=>a+b,0);
  const st={eagles:0,birdies:0,pars:0,bogeys:0,doubles:0,triples:0};
  d.scores.forEach((sc,i)=>{const x=sc-d.par[i];if(x<=-2)st.eagles++;else if(x===-1)st.birdies++;else if(x===0)st.pars++;else if(x===1)st.bogeys++;else if(x===2)st.doubles++;else st.triples++;});
  const sd=d.slope>0?(113/d.slope)*(sT-d.cr):0;
  return{pF,pB,pT,sF,sB,sT,vpT:sT-pT,vpF:sF-pF,vpB:is18?sB-pB:0,sd,st};
}

function subParts(d:DD,v:Vis):string{
  return[v.course&&d.course,v.tee&&d.tee,v.teeDist&&d.teeDist&&`${d.teeDist}m`,v.date&&d.date].filter(Boolean).join(" \u00b7 ");
}
function hiChLine(d:DD,v:Vis,s:Stats):string{
  const p:string[]=[];
  if(v.hiCh&&d.hi!==null){p.push(`HI ${d.hi.toFixed(1)}`);if(d.courseHcp!==null)p.push(`CH ${d.courseHcp}`);}
  if(v.sd)p.push(`SD ${s.sd.toFixed(1)}`);
  return p.join(" \u00b7 ");
}
function hexToRgba(hex:string,a:number){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return `rgba(${r},${g},${b},${a})`;}

/* ═══ A. PGA COLUMNS ═══ */
function DA({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){
  const sz=26;const is18=d.scores.length>=18;const sub=subParts(d,v);const hcl=hiChLine(d,v,s);
  return<div style={{fontFamily:BE,width:140,color:tc||"#fff",background:bg||"rgba(20,40,80,0.88)",overflow:"hidden",overflowWrap:"break-word"}}>
    {(v.player||v.round)&&<div style={{padding:"14px 12px 4px"}}>
      {v.player&&d.player&&<div style={{fontSize:30,lineHeight:1,letterSpacing:1}}>{d.player.toUpperCase()}</div>}
      {v.round&&<div style={{fontFamily:II,fontSize:9,fontWeight:700,letterSpacing:2,color:"rgba(255,255,255,0.5)",marginTop:2}}>ROUND {d.round}</div>}</div>}
    <div style={{height:3,background:"#dc2626",margin:"6px 12px"}}/>
    {v.holeScores&&is18?<div style={{display:"flex",padding:"6px 10px 10px"}}>
      {[{off:0,l:"FRONT",sc:s.sF},{off:9,l:"BACK",sc:s.sB}].map(({off,l,sc},ci)=>
        <div key={off} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1,borderRight:ci===0?"2px solid rgba(220,38,38,0.5)":"none",paddingRight:ci===0?7:0,paddingLeft:ci===1?7:0}}>
          {d.scores.slice(off,off+9).map((scr,i)=><SC key={i} score={scr} par={d.par[off+i]} size={sz} fs={14}/>)}
          <div style={{fontFamily:II,fontSize:8,fontWeight:700,letterSpacing:2,color:"rgba(255,255,255,0.4)",marginTop:5}}>{l}</div>
          <div style={{fontSize:28,lineHeight:1}}>{sc}</div></div>)}</div>
    :v.holeScores?<div style={{padding:"6px 10px 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
      {d.scores.map((scr,i)=><SC key={i} score={scr} par={d.par[i]} size={sz} fs={14}/>)}</div>:null}
    <div style={{background:"rgba(255,255,255,0.95)",color:"#14284f",padding:"8px 12px",textAlign:"center"}}>
      <div style={{fontSize:44,lineHeight:1}}>{s.sT}</div>
      <div style={{fontFamily:II,fontSize:18,fontWeight:900,color:vpCd(s.vpT),marginTop:-2}}>{fvp(s.vpT)}</div></div>
    {(sub||hcl)&&<div style={{fontFamily:II,padding:"6px 12px 10px",fontSize:8,fontWeight:600,color:"rgba(255,255,255,0.4)"}}>{sub}{sub&&hcl?<br/>:null}{hcl}</div>}
  </div>;
}

/* ═══ B. GREEN COLUMNS ═══ */
function DB({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){
  const sz=24;const is18=d.scores.length>=18;
  return<div style={{fontFamily:O,width:140,color:tc||"#fff",background:bg||"rgba(10,30,20,0.88)",borderRadius:14,overflow:"hidden",overflowWrap:"break-word"}}>
    <div style={{padding:"14px 12px 4px"}}>
      {(v.round||v.date)&&<div style={{fontFamily:II,fontSize:8,fontWeight:700,letterSpacing:2,color:"rgba(255,255,255,0.4)"}}>
        {[v.round&&`R${d.round}`,v.date&&d.date].filter(Boolean).join(" \u00b7 ")}</div>}
      {v.player&&d.player&&<div style={{fontSize:22,fontWeight:700,letterSpacing:1,marginTop:4}}>{d.player.toUpperCase()}</div>}
      {v.course&&d.course&&<div style={{fontFamily:II,fontSize:9,fontWeight:500,color:"rgba(255,255,255,0.4)"}}>{d.course}</div>}</div>
    <div style={{height:2,background:"#4ade80",margin:"6px 12px"}}/>
    {v.holeScores&&is18?<div style={{display:"flex",padding:"6px 10px 10px"}}>
      {[{off:0,l:"FRONT",sc:s.sF},{off:9,l:"BACK",sc:s.sB}].map(({off,l,sc},ci)=>
        <div key={off} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1,borderRight:ci===0?"2px solid rgba(74,222,128,0.3)":"none",paddingRight:ci===0?7:0,paddingLeft:ci===1?7:0}}>
          {d.scores.slice(off,off+9).map((scr,i)=><SC key={i} score={scr} par={d.par[off+i]} size={sz} fs={13}/>)}
          <div style={{fontFamily:II,fontSize:8,fontWeight:700,letterSpacing:2,color:"#4ade80",marginTop:5}}>{l}</div>
          <div style={{fontSize:26,lineHeight:1}}>{sc}</div></div>)}</div>
    :v.holeScores?<div style={{padding:"6px 10px 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
      {d.scores.map((scr,i)=><SC key={i} score={scr} par={d.par[i]} size={sz} fs={13}/>)}</div>:null}
    <div style={{background:"rgba(255,255,255,0.06)",padding:"8px 12px",textAlign:"center"}}>
      <div style={{display:"flex",alignItems:"baseline",justifyContent:"center",gap:5}}>
        <span style={{fontSize:38,lineHeight:1}}>{s.sT}</span>
        <span style={{fontFamily:II,fontSize:16,fontWeight:900,color:vpC(s.vpT)}}>{fvp(s.vpT)}</span></div>
      {v.stats&&<div style={{fontFamily:II,marginTop:5}}><StatsLine s={s} fs={11} lfs={7} gap={8}/></div>}</div>
  </div>;
}

/* ═══ C. 18BIRDIES ═══ */
function DC({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){
  const is18=d.scores.length>=18;const hcl=hiChLine(d,v,s);
  return<div style={{fontFamily:II,width:360,color:tc||"#fff",background:bg||"rgba(15,15,25,0.9)",borderRadius:16,padding:"14px 10px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,padding:"0 6px"}}>
      <div>
        {v.date&&d.date&&<div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:"rgba(255,255,255,0.4)"}}>{d.date}</div>}
        {v.course&&d.course&&<div style={{fontSize:13,fontWeight:900,marginTop:1}}>{d.course}</div>}
        <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.4)"}}>Par {s.pT}{v.tee&&d.tee?` \u00b7 ${d.tee}`:""}{v.teeDist&&d.teeDist?` \u00b7 ${d.teeDist}m`:""}</div></div>
      <div style={{textAlign:"right"}}><div style={{fontSize:28,fontWeight:900,letterSpacing:-1}}>{s.sT}</div>
        <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.35)"}}>Gross</div></div></div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(255,255,255,0.06)",borderRadius:8,padding:"6px 12px",marginBottom:8}}>
      <span style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.5)"}}>To Par</span>
      <span style={{fontSize:24,fontWeight:900,color:vpC(s.vpT)}}>{fvp(s.vpT)}</span></div>
    {v.holeScores&&(is18?[{off:0,sub:s.sF},{off:9,sub:s.sB}]:[{off:0,sub:s.sT}]).map(({off,sub})=>
      <div key={off} style={{display:"flex",alignItems:"center",marginBottom:3}}>
        <div style={{display:"flex",gap:2}}>{d.scores.slice(off,off+(is18?9:d.scores.length)).map((sc,i)=>
          <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
            <div style={{fontSize:8,fontWeight:700,color:"rgba(255,255,255,0.25)"}}>{off+i+1}</div>
            <SQ score={sc} par={d.par[off+i]} size={30}/></div>)}</div>
        <div style={{marginLeft:6,fontSize:20,fontWeight:900,color:"rgba(255,255,255,0.6)",minWidth:32,textAlign:"center"}}>{sub}</div></div>)}
    <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.3)",padding:"0 4px"}}>
      {v.player&&d.player?<span>{d.player}</span>:<span/>}
      {v.stats?<StatsLine s={s} gap={10} fs={11} lfs={7} color="rgba(255,255,255,0.3)"/>:<span/>}
      {hcl?<span>{hcl}</span>:<span/>}</div>
  </div>;
}

/* ═══ D. LIGHT CARD ═══ */
function DD_({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){
  const is18=d.scores.length>=18;
  return<div style={{fontFamily:II,width:380,background:bg||"rgba(255,255,255,0.92)",borderRadius:14,padding:"16px 14px",color:tc||"#222",border:"1px solid rgba(0,0,0,0.08)"}}>
    <div style={{borderBottom:"2px solid #e5e7eb",paddingBottom:10,marginBottom:12}}>
      {v.course&&d.course&&<div style={{fontSize:16,fontWeight:900}}>{d.course}</div>}
      <div style={{fontSize:10,fontWeight:600,color:"#999",marginTop:2}}>{[v.date&&d.date,v.tee&&d.tee].filter(Boolean).join(" \u00b7 ")}</div></div>
    {v.holeScores&&(is18?[0,9]:[0]).map(off=>{const cnt=is18?9:d.scores.length;const subP=d.par.slice(off,off+cnt).reduce((a,b)=>a+b,0);const subS=d.scores.slice(off,off+cnt).reduce((a,b)=>a+b,0);
      return<div key={off}>
      <div style={{display:"flex",background:"#1e3a2f",borderRadius:off===0?"6px 6px 0 0":0,padding:"3px 0"}}>
        <div style={{width:40,padding:"0 4px",fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.7)",display:"flex",alignItems:"center"}}>Hole</div>
        {d.par.slice(off,off+cnt).map((_,i)=><div key={i} style={{width:34,textAlign:"center",fontSize:11,fontWeight:800,color:"#fff"}}>{off+i+1}</div>)}
        <div style={{width:36,textAlign:"center",fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.7)"}}>{is18?(off===0?"Out":"In"):"Tot"}</div></div>
      {v.holePar&&<div style={{display:"flex",background:"#e8f5e9",padding:"2px 0"}}>
        <div style={{width:40,padding:"0 4px",fontSize:9,fontWeight:700,color:"#2e7d32",display:"flex",alignItems:"center"}}>Par</div>
        {d.par.slice(off,off+cnt).map((p,i)=><div key={i} style={{width:34,textAlign:"center",fontSize:11,color:"#2e7d32",fontWeight:700}}>{p}</div>)}
        <div style={{width:36,textAlign:"center",fontSize:11,fontWeight:800,color:"#2e7d32"}}>{subP}</div></div>}
      <div style={{display:"flex",padding:"4px 0",marginBottom:off===0&&is18?6:0}}>
        <div style={{width:40,padding:"0 4px",fontSize:9,fontWeight:900,color:"#333",display:"flex",alignItems:"center"}}>Score</div>
        {d.scores.slice(off,off+cnt).map((sc,i)=><div key={i} style={{width:34,display:"flex",justifyContent:"center"}}><LSC score={sc} par={d.par[off+i]} size={28}/></div>)}
        <div style={{width:36,textAlign:"center",fontSize:16,fontWeight:900,color:"#333",display:"flex",alignItems:"center",justifyContent:"center"}}>{subS}</div></div></div>;})}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,padding:"8px 6px",background:"#f3f4f6",borderRadius:8}}>
      {v.player&&d.player?<div style={{fontSize:14,fontWeight:900}}>{d.player}</div>:<div/>}
      <div style={{display:"flex",alignItems:"baseline",gap:5}}><span style={{fontSize:28,fontWeight:900}}>{s.sT}</span>
        <span style={{fontSize:18,fontWeight:900,color:vpCd(s.vpT)}}>{fvp(s.vpT)}</span></div></div>
  </div>;
}

/* ═══ E-H: To Par Hero, Hero Giant, Sticker, Strip ═══ */
function DE({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){const sub=subParts(d,{...v,date:false});const hcl=hiChLine(d,v,s);
  return<div style={{fontFamily:II,width:320,color:tc||"#fff",background:bg||"rgba(0,0,0,0.75)",borderRadius:16,padding:"20px 16px",textAlign:"center"}}>
    <div style={{fontSize:10,fontWeight:700,letterSpacing:3,color:"rgba(255,255,255,0.4)"}}>TO PAR</div>
    <div style={{fontSize:80,fontWeight:900,lineHeight:0.9,color:vpC(s.vpT),letterSpacing:-4,margin:"4px 0"}}>{fvp(s.vpT)}</div>
    <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.5)"}}>Gross <span style={{fontWeight:900,color:"#fff",fontSize:22}}>{s.sT}</span></div>
    <div style={{height:1,background:"rgba(255,255,255,0.1)",margin:"14px 0"}}/>
    {v.player&&d.player&&<div style={{fontSize:16,fontWeight:900,marginBottom:2}}>{d.player}</div>}
    {sub&&<div style={{fontSize:10,fontWeight:500,color:"rgba(255,255,255,0.4)",marginBottom:12}}>{sub}{v.round?` \u00b7 R${d.round}`:""}</div>}
    {v.holeScores&&<Grid99 d={d} size={26} gap={4} showNums numFs={8}/>}
    {v.stats&&<div style={{marginTop:12}}><StatsLine s={s} fs={14} lfs={9}/></div>}
    {hcl&&<div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.2)",marginTop:8}}>{hcl}{v.date&&d.date?` \u00b7 ${d.date}`:""}</div>}</div>;}

function DF({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){const hcl=hiChLine(d,v,s);
  return<div style={{fontFamily:O,width:320,textAlign:"center",color:tc||"#fff"}}><div style={{background:bg||"rgba(0,0,0,0.72)",borderRadius:16,padding:"20px 18px 16px"}}>
    {v.round&&<div style={{fontFamily:II,fontSize:9,fontWeight:700,letterSpacing:3,color:"rgba(255,255,255,0.4)"}}>ROUND {d.round}</div>}
    {v.player&&d.player&&<div style={{fontSize:26,fontWeight:700,letterSpacing:1,marginTop:2}}>{d.player.toUpperCase()}</div>}
    {(v.course||v.tee)&&<div style={{fontFamily:II,fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.45)"}}>{[v.course&&d.course,v.tee&&d.tee].filter(Boolean).join(" \u00b7 ")}</div>}
    <div style={{display:"flex",alignItems:"baseline",justifyContent:"center",gap:6,margin:"14px 0 4px"}}>
      <span style={{fontSize:90,lineHeight:0.85,letterSpacing:-2,fontWeight:700}}>{s.sT}</span>
      <span style={{fontSize:40,fontWeight:700,color:vpC(s.vpT)}}>{fvp(s.vpT)}</span></div>
    <div style={{fontFamily:II,fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.35)",marginBottom:12}}>
      Par {s.pT}{v.teeDist&&d.teeDist?` \u00b7 ${d.teeDist}m`:""}{v.date&&d.date?` \u00b7 ${d.date}`:""}</div>
    {v.holeScores&&<Grid99 d={d} size={28} gap={4}/>}
    {v.stats&&<div style={{fontFamily:II,marginTop:12}}><StatsLine s={s} fs={14} lfs={9}/></div>}
    {hcl&&<div style={{fontFamily:II,fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.25)",marginTop:6}}>{hcl}</div>}
  </div></div>;}

function DG({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){
  return<div style={{fontFamily:BE,color:tc||"#fff",background:bg||"rgba(20,40,70,0.85)",borderRadius:10,padding:"8px 14px",display:"inline-flex",alignItems:"center",gap:12,border:"1px solid rgba(255,255,255,0.15)"}}>
    <div style={{fontSize:36,lineHeight:1}}>{s.sT}</div>
    <div style={{fontFamily:II}}>{v.player&&d.player&&<div style={{fontSize:12,fontWeight:800}}>{d.player}</div>}
      {v.course&&d.course&&<div style={{fontSize:9,fontWeight:500,color:"rgba(255,255,255,0.4)"}}>{d.course}</div>}</div>
    <div style={{fontFamily:II,fontSize:20,fontWeight:900,color:vpC(s.vpT)}}>{fvp(s.vpT)}</div></div>;}

function DH({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){
  return<div style={{fontFamily:II,color:tc||"#fff",background:bg||"rgba(0,0,0,0.72)",borderRadius:12,padding:"12px 16px",display:"inline-flex",alignItems:"center",gap:14}}>
    <div>{v.player&&d.player&&<div style={{fontSize:14,fontWeight:700}}>{d.player}</div>}
      <div style={{fontSize:9,fontWeight:500,color:"rgba(255,255,255,0.4)"}}>{[v.course&&d.course,v.round&&`R${d.round}`].filter(Boolean).join(" \u00b7 ")}</div></div>
    <div style={{width:1,height:32,background:"rgba(255,255,255,0.15)"}}/>
    <div style={{display:"flex",alignItems:"baseline",gap:5}}>
      <span style={{fontSize:38,fontWeight:900,letterSpacing:-2}}>{s.sT}</span>
      <span style={{fontSize:22,fontWeight:900,color:vpC(s.vpT)}}>{fvp(s.vpT)}</span></div></div>;}

/* ═══ I. GLASS CARD ═══ */
function DI({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){
  const is18=d.scores.length>=18;const hcl=hiChLine(d,v,s);
  const HT=({off,label}:{off:number;label:string})=>{const cnt=is18?9:d.scores.length;
    return<div style={{marginBottom:off===0&&is18?2:0}}>
      <div style={{display:"flex",background:"rgba(45,106,48,0.7)",borderRadius:off===0?"8px 8px 0 0":0,padding:"4px 0"}}>
        <div style={{width:52,padding:"0 6px",fontWeight:900,fontSize:11}}>Hole</div>
        {d.par.slice(off,off+cnt).map((_,i)=><div key={i} style={{width:32,textAlign:"center",fontWeight:800,fontSize:12}}>{off+i+1}</div>)}
        <div style={{width:38,textAlign:"center",fontWeight:900,fontSize:11}}>{label}</div></div>
      {v.holeSI&&<div style={{display:"flex",padding:"2px 0",background:"rgba(255,255,255,0.03)"}}>
        <div style={{width:52,padding:"0 6px",fontSize:10,color:"rgba(255,255,255,0.35)"}}>S.I.</div>
        {d.si.slice(off,off+cnt).map((si,i)=><div key={i} style={{width:32,textAlign:"center",fontSize:10,color:"rgba(255,255,255,0.35)"}}>{si}</div>)}
        <div style={{width:38}}/></div>}
      {v.holePar&&<div style={{display:"flex",padding:"2px 0",background:"rgba(255,255,255,0.05)"}}>
        <div style={{width:52,padding:"0 6px",fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.55)"}}>Par</div>
        {d.par.slice(off,off+cnt).map((p,i)=><div key={i} style={{width:32,textAlign:"center",fontSize:11,color:"rgba(255,255,255,0.55)"}}>{p}</div>)}
        <div style={{width:38,textAlign:"center",fontWeight:800,fontSize:11,color:"rgba(255,255,255,0.55)"}}>{d.par.slice(off,off+cnt).reduce((a,b)=>a+b,0)}</div></div>}
      <div style={{display:"flex",padding:"4px 0",borderBottom:off===0&&is18?"1px solid rgba(255,255,255,0.08)":"none"}}>
        <div style={{width:52,padding:"0 6px",fontWeight:900,fontSize:12}}>Score</div>
        {d.scores.slice(off,off+cnt).map((sc,i)=><div key={i} style={{width:32,display:"flex",justifyContent:"center"}}><SC score={sc} par={d.par[off+i]} size={26}/></div>)}
        <div style={{width:38,textAlign:"center",fontWeight:900,fontSize:16}}>{d.scores.slice(off,off+cnt).reduce((a,b)=>a+b,0)}</div></div></div>;};
  return<div style={{fontFamily:II,width:420,padding:18,background:bg||"rgba(0,0,0,0.72)",borderRadius:16,color:tc||"#fff",border:"1px solid rgba(255,255,255,0.08)"}}>
    <div style={{textAlign:"center",marginBottom:14}}>
      {v.round&&<div style={{fontSize:10,fontWeight:700,letterSpacing:3,color:"rgba(255,255,255,0.4)"}}>ROUND {d.round}</div>}
      {v.player&&d.player&&<div style={{fontSize:17,fontWeight:900,marginTop:2}}>{d.player}</div>}
      {(v.course||v.tee||v.teeDist)&&<div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.5)",marginTop:2}}>
        {[v.course&&d.course,v.tee&&d.tee,v.teeDist&&d.teeDist&&`${d.teeDist}m`].filter(Boolean).join(" \u00b7 ")}</div>}</div>
    {v.holeScores&&(is18?<><HT off={0} label="Out"/><HT off={9} label="In"/></>:<HT off={0} label="Tot"/>)}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,padding:"10px 14px",background:"rgba(255,255,255,0.06)",borderRadius:10}}>
      <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.4)"}}>Par {s.pT}</div>
      <div style={{display:"flex",alignItems:"baseline",gap:8}}>
        <span style={{fontSize:34,fontWeight:900,letterSpacing:-2}}>{s.sT}</span>
        <span style={{fontSize:22,fontWeight:900,color:vpC(s.vpT)}}>{fvp(s.vpT)}</span></div>
      {hcl&&<div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.4)"}}>{hcl}</div>}</div>
    {v.stats&&<div style={{marginTop:10}}><StatsLine s={s}/></div>}
  </div>;
}

/* ═══ J. CLASSIC TABLE ═══ */
function DJ({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){
  const is18=d.scores.length>=18;const hcl=hiChLine(d,v,s);
  const HT=({off,label}:{off:number;label:string})=>{const cnt=is18?9:d.scores.length;const isLast=!is18||off===9;
    return<div style={{marginBottom:off===0&&is18?2:0}}>
      <div style={{display:"flex",background:"rgba(20,45,75,0.9)",padding:"4px 0"}}>
        <div style={{width:52,padding:"0 6px",fontWeight:900,fontSize:11}}>Hole</div>
        {d.par.slice(off,off+cnt).map((_,i)=><div key={i} style={{width:32,textAlign:"center",fontWeight:800,fontSize:12}}>{off+i+1}</div>)}
        <div style={{width:38,textAlign:"center",fontWeight:900,fontSize:11}}>{label}</div>
        {isLast&&is18&&<div style={{width:38,textAlign:"center",fontWeight:900,fontSize:11}}>TOT</div>}</div>
      {v.holePar&&<div style={{display:"flex",padding:"2px 0",background:"rgba(255,255,255,0.04)"}}>
        <div style={{width:52,padding:"0 6px",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.45)"}}>Par</div>
        {d.par.slice(off,off+cnt).map((p,i)=><div key={i} style={{width:32,textAlign:"center",fontSize:11,color:"rgba(255,255,255,0.5)"}}>{p}</div>)}
        <div style={{width:38,textAlign:"center",fontWeight:700,fontSize:11,color:"rgba(255,255,255,0.5)"}}>{off===0?s.pF:s.pB}</div>
        {isLast&&is18&&<div style={{width:38,textAlign:"center",fontWeight:800,fontSize:11,color:"rgba(255,255,255,0.5)"}}>{s.pT}</div>}</div>}
      <div style={{display:"flex",padding:"4px 0"}}>
        <div style={{width:52,padding:"0 6px",fontWeight:900,fontSize:12}}>Score</div>
        {d.scores.slice(off,off+cnt).map((sc,i)=><div key={i} style={{width:32,display:"flex",justifyContent:"center"}}><SC score={sc} par={d.par[off+i]} size={26}/></div>)}
        <div style={{width:38,textAlign:"center",fontWeight:900,fontSize:15,color:"rgba(255,255,255,0.7)"}}>{off===0?s.sF:s.sB}</div>
        {isLast&&is18&&<div style={{width:38,textAlign:"center",fontWeight:900,fontSize:18}}>{s.sT}</div>}</div></div>;};
  return<div style={{fontFamily:II,width:is18?460:380,padding:16,background:bg||"rgba(15,30,55,0.85)",borderRadius:14,color:tc||"#fff"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <div>{v.player&&d.player&&<div style={{fontSize:15,fontWeight:900}}>{d.player}</div>}
        <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.45)"}}>
          {[v.round&&`Round ${d.round}`,v.course&&d.course,v.tee&&d.tee].filter(Boolean).join(" \u00b7 ")}</div></div>
      <div style={{display:"flex",alignItems:"baseline",gap:5}}>
        <span style={{fontSize:28,fontWeight:900}}>{s.sT}</span>
        <span style={{fontSize:18,fontWeight:900,color:vpC(s.vpT)}}>{fvp(s.vpT)}</span></div></div>
    {v.holeScores&&(is18?<><HT off={0} label="Out"/><div style={{height:2,background:"rgba(100,180,100,0.4)",margin:"3px 0"}}/><HT off={9} label="In"/></>:<HT off={0} label="Tot"/>)}
    <div style={{display:"flex",justifyContent:"space-between",marginTop:10,fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.3)"}}>
      {v.stats?<StatsLine s={s} gap={12} fs={12} lfs={8} color="rgba(255,255,255,0.3)"/>:<span/>}
      {hcl&&<span>{hcl}</span>}</div>
  </div>;
}

/* ═══ K. GRINT ROW ═══ */
function DK({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){
  const is18=d.scores.length>=18;const hcl=hiChLine(d,v,s);
  return<div style={{fontFamily:II,display:"inline-block",color:tc||"#fff",background:bg||"rgba(25,45,75,0.88)",borderRadius:14,padding:"14px 12px",overflowWrap:"break-word"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,gap:20}}>
      <div>
        {v.date&&d.date&&<div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:"rgba(255,255,255,0.4)"}}>{d.date}</div>}
        {v.course&&d.course&&<div style={{fontSize:14,fontWeight:900}}>{d.course.toUpperCase()}</div>}
        <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.45)"}}>
          {[v.player&&d.player,v.tee&&d.tee].filter(Boolean).join(" \u00b7 ")}</div></div>
      <div style={{textAlign:"right"}}><div style={{fontSize:32,fontWeight:900,lineHeight:1,letterSpacing:-2}}>{s.sT}</div>
        <div style={{fontSize:16,fontWeight:900,color:vpC(s.vpT),marginTop:-2}}>{fvp(s.vpT)}</div></div></div>
    {v.holeScores&&<div style={{background:"rgba(0,0,0,0.2)",borderRadius:10,padding:"8px 6px",display:"inline-block"}}>
      {(is18?[{off:0,cnt:9,sub:s.sF},{off:9,cnt:9,sub:s.sB}]:[{off:0,cnt:d.scores.length,sub:s.sT}]).map(({off,cnt,sub})=>
        <div key={off} style={{display:"flex",alignItems:"center",marginBottom:2}}>
          <div style={{display:"flex",gap:2}}>{d.scores.slice(off,off+cnt).map((sc,i)=><div key={i} style={{display:"flex",justifyContent:"center"}}><SC score={sc} par={d.par[off+i]} size={26}/></div>)}</div>
          <div style={{width:2,height:26,background:"rgba(100,180,100,0.5)",margin:"0 5px"}}/>
          <div style={{fontSize:16,fontWeight:900,color:"rgba(255,255,255,0.5)"}}>{sub}</div></div>)}</div>}
    <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.35)"}}>
      {v.stats?<StatsLine s={s} gap={10} fs={11} lfs={8} color="rgba(255,255,255,0.35)"/>:<span/>}
      {hcl&&<span>{hcl}</span>}</div>
  </div>;
}

/* ═══ L. DOTS GRID ═══ */
function DL({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){
  return<div style={{fontFamily:II,width:360,color:tc||"#fff",background:bg||"rgba(15,30,55,0.82)",borderRadius:16,padding:"16px 14px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:14}}>
      <div>
        {(v.round||v.date)&&<div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:"rgba(255,255,255,0.4)"}}>
          {[v.round&&`R${d.round}`,v.date&&d.date].filter(Boolean).join(" \u00b7 ")}</div>}
        {v.player&&d.player&&<div style={{fontSize:18,fontWeight:900,marginTop:2}}>{d.player}</div>}
        {v.course&&d.course&&<div style={{fontSize:10,fontWeight:500,color:"rgba(255,255,255,0.45)"}}>{d.course}</div>}</div>
      <div style={{textAlign:"right"}}><div style={{fontSize:42,fontWeight:900,lineHeight:1,letterSpacing:-2}}>{s.sT}</div>
        <div style={{fontSize:22,fontWeight:900,color:vpC(s.vpT),marginTop:-2}}>{fvp(s.vpT)}</div></div></div>
    {v.holeScores&&<Grid99 d={d} size={32} gap={5} showNums numFs={9}/>}
    {v.stats&&<div style={{marginTop:12}}><StatsLine s={s} gap={16} fs={14} lfs={9}/></div>}
  </div>;
}

/* ═══ M. NEON RING ═══ */
function DM({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){const hcl=hiChLine(d,v,s);
  return<div style={{fontFamily:II,width:190,color:tc||"#fff",textAlign:"center",background:bg||"rgba(0,0,0,0.78)",borderRadius:16,padding:"22px 14px",border:`2px solid ${vpC(s.vpT)}33`}}>
    {v.round&&<div style={{fontSize:9,fontWeight:700,letterSpacing:3,color:"rgba(255,255,255,0.35)"}}>ROUND {d.round}</div>}
    {v.player&&d.player&&<div style={{fontSize:18,fontWeight:900,letterSpacing:0.5,marginTop:4}}>{d.player.toUpperCase()}</div>}
    {v.course&&d.course&&<div style={{fontSize:10,fontWeight:500,color:"rgba(255,255,255,0.45)",marginTop:2}}>{d.course}</div>}
    <div style={{margin:"16px auto",width:120,height:120,borderRadius:"50%",border:`3px solid ${vpC(s.vpT)}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",paddingBottom:14,background:"rgba(255,255,255,0.04)"}}>
      <div style={{fontSize:48,fontWeight:900,lineHeight:1,letterSpacing:-2}}>{s.sT}</div>
      <div style={{fontSize:18,fontWeight:900,color:vpC(s.vpT)}}>{fvp(s.vpT)}</div></div>
    <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.4)"}}>Par {s.pT}{v.tee&&d.tee?` \u00b7 ${d.tee}`:""}</div>
    {v.stats&&<div style={{marginTop:10}}><StatsLine s={s} fs={14} lfs={9} gap={10}/></div>}
    {hcl&&<div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.25)",marginTop:8}}>{hcl}</div>}
  </div>;
}

/* ═══ N. GRADIENT BAR ═══ */
function DN({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){
  const is18=d.scores.length>=18;const hcl=hiChLine(d,v,s);
  return<div style={{fontFamily:II,width:420,color:tc||"#fff",background:bg||"linear-gradient(135deg, rgba(15,30,55,0.85) 0%, rgba(20,50,35,0.8) 100%)",borderRadius:14,padding:"14px 18px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
      <div>{v.player&&d.player&&<div style={{fontSize:15,fontWeight:900}}>{d.player}</div>}
        <div style={{fontSize:10,fontWeight:500,color:"rgba(255,255,255,0.45)"}}>
          {[v.course&&d.course,v.tee&&d.tee,v.round&&`R${d.round}`].filter(Boolean).join(" \u00b7 ")}</div></div>
      <div style={{display:"flex",alignItems:"baseline",gap:6}}>
        <span style={{fontSize:32,fontWeight:900}}>{s.sT}</span>
        <span style={{fontSize:20,fontWeight:900,color:vpC(s.vpT)}}>{fvp(s.vpT)}</span></div></div>
    {v.holeScores&&(is18?[0,9]:[0]).map(off=>{const cnt=is18?9:d.scores.length;
      return<div key={off} style={{display:"flex",gap:3,marginBottom:off===0&&is18?3:0}}>
        {d.scores.slice(off,off+cnt).map((sc,i)=>
          <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
            <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.3)"}}>{off+i+1}</div>
            <SC score={sc} par={d.par[off+i]} size={24}/></div>)}</div>;})}
    <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:8,marginTop:6,fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.35)"}}>
      {v.date&&d.date?<span>{d.date}</span>:<span/>}
      {v.stats?<StatsLine s={s} gap={12} fs={11} lfs={8} color="rgba(255,255,255,0.35)"/>:<span/>}
      {hcl?<span>{hcl}</span>:<span/>}</div>
  </div>;
}

/* ═══ O. TOURNAMENT ═══ */
function DO_({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){const hcl=hiChLine(d,v,s);
  return<div style={{fontFamily:II,width:320,color:tc||"#fff",background:bg||"rgba(15,35,60,0.85)",borderRadius:14,overflow:"hidden"}}>
    <div style={{background:"rgba(45,106,48,0.8)",padding:"12px 16px",textAlign:"center"}}>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:2,color:"rgba(255,255,255,0.6)"}}>
        {[v.round&&`ROUND ${d.round}`,v.date&&d.date].filter(Boolean).join(" \u00b7 ")}</div>
      {v.course&&d.course&&<div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.7)",marginTop:3}}>{d.course}</div>}</div>
    <div style={{padding:"14px 16px 10px",display:"flex",alignItems:"center",gap:14}}>
      <div style={{flex:1}}>{v.player&&d.player&&<div style={{fontSize:17,fontWeight:900}}>{d.player}</div>}
        <div style={{fontSize:10,fontWeight:500,color:"rgba(255,255,255,0.4)"}}>
          {[v.tee&&d.tee,v.teeDist&&d.teeDist&&`${d.teeDist}m`].filter(Boolean).join(" \u00b7 ")}</div></div>
      <div style={{textAlign:"right"}}><div style={{fontSize:36,fontWeight:900,lineHeight:1,letterSpacing:-2}}>{s.sT}</div>
        <div style={{fontSize:20,fontWeight:900,color:vpC(s.vpT),marginTop:-2}}>{fvp(s.vpT)}</div></div></div>
    {v.holeScores&&<div style={{padding:"0 12px 12px"}}><Grid99 d={d} size={28} gap={4}/></div>}
    <div style={{padding:"8px 16px",background:"rgba(255,255,255,0.04)",display:"flex",justifyContent:"space-between"}}>
      {v.stats?<StatsLine s={s} gap={10} fs={12} lfs={8}/>:<span/>}
      {hcl&&<div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.3)"}}>{hcl}</div>}</div>
  </div>;
}

/* ═══ P. DASHBOARD ═══ */
function DPx({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){
  const Bx=({val,label,c,big}:{val:string|number;label:string;c?:string;big?:boolean})=>
    <div style={{flex:1,background:"rgba(255,255,255,0.06)",borderRadius:8,padding:big?"10px 8px":"6px 8px",textAlign:"center"}}>
      <div style={{fontSize:big?28:18,fontWeight:900,color:c||"#fff"}}>{val}</div>
      <div style={{fontSize:8,fontWeight:700,color:"rgba(255,255,255,0.35)",letterSpacing:1,marginTop:2}}>{label}</div></div>;
  const hcl=hiChLine(d,v,s);
  return<div style={{fontFamily:II,width:320,color:tc||"#fff",background:bg||"rgba(15,25,45,0.82)",borderRadius:14,padding:"16px 14px"}}>
    <div style={{textAlign:"center",marginBottom:12}}>
      {v.player&&d.player&&<div style={{fontSize:18,fontWeight:900}}>{d.player}</div>}
      <div style={{fontSize:10,fontWeight:500,color:"rgba(255,255,255,0.45)"}}>
        {[v.course&&d.course,v.round&&`R${d.round}`].filter(Boolean).join(" \u00b7 ")}</div></div>
    <div style={{display:"flex",gap:6,marginBottom:6}}>
      <Bx val={s.sT} label="SCORE" big/><Bx val={fvp(s.vpT)} label="VS PAR" c={vpC(s.vpT)} big/></div>
    {v.stats&&<div style={{display:"flex",gap:6,marginBottom:10}}>
      <Bx val={s.st.eagles} label="EAGLE" c="#d4a017"/><Bx val={s.st.pars} label="PAR"/><Bx val={s.st.bogeys} label="BOGEY" c="#5BADE6"/></div>}
    {v.holeScores&&<Grid99 d={d} size={26} gap={4}/>}
    {hcl&&<div style={{textAlign:"center",fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.25)",marginTop:10}}>
      {[v.tee&&d.tee,v.teeDist&&d.teeDist&&`${d.teeDist}m`].filter(Boolean).join(" \u00b7 ")}{hcl?` \u00b7 ${hcl}`:""}</div>}
  </div>;
}

/* ═══ Q. TICKET ═══ */
function DQ({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){const hcl=hiChLine(d,v,s);
  return<div style={{fontFamily:LO,width:280,color:tc||"#fff",background:bg||"rgba(0,0,0,0.75)",borderRadius:4,padding:"14px 12px",border:"1px solid rgba(255,255,255,0.12)"}}>
    <div style={{textAlign:"center",borderBottom:"1px dashed rgba(255,255,255,0.2)",paddingBottom:10,marginBottom:10}}>
      <div style={{fontFamily:II,fontSize:8,fontWeight:700,letterSpacing:3,color:"rgba(255,255,255,0.35)"}}>SCORECARD</div>
      {v.player&&d.player&&<div style={{fontSize:16,fontWeight:700,fontStyle:"italic",marginTop:3}}>{d.player}</div>}
      {v.course&&d.course&&<div style={{fontFamily:II,fontSize:9,fontWeight:500,color:"rgba(255,255,255,0.45)",marginTop:2}}>{d.course}</div>}</div>
    <div style={{textAlign:"center",marginBottom:10}}>
      <div style={{fontFamily:II,fontSize:42,fontWeight:900,lineHeight:1,letterSpacing:-2}}>{s.sT}</div>
      <div style={{fontFamily:II,fontSize:20,fontWeight:900,color:vpC(s.vpT),marginTop:-2}}>{fvp(s.vpT)}</div></div>
    {v.holeScores&&<Grid99 d={d} size={22} gap={4}/>}
    <div style={{borderTop:"1px dashed rgba(255,255,255,0.2)",paddingTop:8,marginTop:10,fontFamily:II}}>
      {v.stats&&<StatsLine s={s} gap={10} fs={11} lfs={7}/>}
      {(hcl||(v.tee&&d.tee)||(v.date&&d.date))&&<div style={{textAlign:"center",fontSize:8,fontWeight:700,color:"rgba(255,255,255,0.25)",marginTop:6}}>
        {[v.tee&&d.tee,v.teeDist&&d.teeDist&&`${d.teeDist}m`,v.date&&d.date,hcl].filter(Boolean).join(" \u00b7 ")}</div>}</div>
  </div>;
}

/* ═══ R. HORIZONTAL WIDE ═══ */
function DR({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){
  const is18=d.scores.length>=18;const hcl=hiChLine(d,v,s);
  return<div style={{fontFamily:II,display:"inline-block",color:tc||"#fff",background:bg||"rgba(15,25,45,0.85)",borderRadius:14,padding:"12px 12px",overflowWrap:"break-word"}}>
    <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:8}}>
      <div style={{display:"flex",alignItems:"baseline",gap:5}}>
        <span style={{fontSize:32,fontWeight:900,letterSpacing:-2}}>{s.sT}</span>
        <span style={{fontSize:20,fontWeight:900,color:vpC(s.vpT)}}>{fvp(s.vpT)}</span></div>
      <div><div style={{fontSize:13,fontWeight:900}}>
        {v.player&&d.player?d.player:""}{v.round?<>{" "}<span style={{fontWeight:600,color:"rgba(255,255,255,0.5)"}}>R{d.round}</span></>:null}</div>
        <div style={{fontSize:9,fontWeight:500,color:"rgba(255,255,255,0.45)"}}>
          {[v.course&&d.course,v.tee&&d.tee,v.date&&d.date].filter(Boolean).join(" \u00b7 ")}</div></div></div>
    {v.holeScores&&(is18?[{off:0,cnt:9,sub:s.sF,lbl:"Out"},{off:9,cnt:9,sub:s.sB,lbl:"In"}]:[{off:0,cnt:d.scores.length,sub:s.sT,lbl:"Tot"}]).map(({off,cnt,sub,lbl})=>
      <div key={off} style={{display:"flex",alignItems:"center",marginBottom:2}}>
        <div style={{display:"flex",gap:2}}>{d.scores.slice(off,off+cnt).map((sc,i)=>
          <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
            <div style={{fontSize:8,fontWeight:700,color:"rgba(255,255,255,0.25)"}}>{off+i+1}</div>
            <SC score={sc} par={d.par[off+i]} size={26}/></div>)}</div>
        <div style={{width:2,height:26,background:"rgba(100,180,100,0.4)",margin:"0 6px"}}/>
        <div style={{textAlign:"center"}}><div style={{fontSize:8,fontWeight:700,color:"rgba(255,255,255,0.3)"}}>{lbl}</div>
          <div style={{fontSize:16,fontWeight:900}}>{sub}</div></div></div>)}
    <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:6,marginTop:4,fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.3)"}}>
      {v.stats?<StatsLine s={s} gap={10} fs={11} lfs={8} color="rgba(255,255,255,0.3)"/>:<span/>}
      {hcl?<span>{hcl}</span>:<span/>}</div>
  </div>;
}

/* ═══ S. HORIZONTAL TABLE ═══ */
function DS({d,v,s,bg,tc}:{d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string}){
  const is18=d.scores.length>=18;
  return<div style={{fontFamily:II,display:"inline-block",color:tc||"#fff",background:bg||"rgba(20,35,60,0.88)",borderRadius:12,padding:"10px 8px",overflowWrap:"break-word"}}>
    <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:6,padding:"0 4px"}}>
      <div style={{display:"flex",alignItems:"baseline",gap:4}}>
        <span style={{fontSize:22,fontWeight:900}}>{s.sT}</span>
        <span style={{fontSize:14,fontWeight:900,color:vpC(s.vpT)}}>{fvp(s.vpT)}</span></div>
      <div><div style={{fontSize:12,fontWeight:900}}>
        {v.player&&d.player?d.player:""}{" "}<span style={{fontWeight:500,color:"rgba(255,255,255,0.4)",fontSize:9}}>
          {[v.course&&d.course,v.round&&`R${d.round}`].filter(Boolean).join(" \u00b7 ")}</span></div></div></div>
    {v.holeScores&&(is18?[{off:0,cnt:9,sub:s.sF,subP:s.pF,lbl:"Out"},{off:9,cnt:9,sub:s.sB,subP:s.pB,lbl:"In"}]:[{off:0,cnt:d.scores.length,sub:s.sT,subP:s.pT,lbl:"Tot"}]).map(({off,cnt,sub,subP,lbl})=>
      <div key={off} style={{marginBottom:off===0&&is18?2:0}}>
        <div style={{display:"flex",background:"rgba(45,106,48,0.6)",padding:"2px 0",borderRadius:off===0?"6px 6px 0 0":0}}>
          <div style={{display:"flex"}}>{d.par.slice(off,off+cnt).map((_,i)=><div key={i} style={{width:34,textAlign:"center",fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.7)"}}>{off+i+1}</div>)}</div>
          <div style={{width:2,background:"rgba(100,180,100,0.3)"}}/>
          <div style={{padding:"0 6px",fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.5)"}}>{lbl}</div></div>
        {v.holePar&&<div style={{display:"flex",padding:"1px 0",background:"rgba(255,255,255,0.03)"}}>
          <div style={{display:"flex"}}>{d.par.slice(off,off+cnt).map((p,i)=><div key={i} style={{width:34,textAlign:"center",fontSize:9,fontWeight:600,color:"rgba(255,255,255,0.4)"}}>{p}</div>)}</div>
          <div style={{width:2}}/><div style={{padding:"0 6px",fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.4)"}}>{subP}</div></div>}
        <div style={{display:"flex",padding:"3px 0",borderBottom:off===0&&is18?"1px solid rgba(255,255,255,0.06)":"none"}}>
          <div style={{display:"flex"}}>{d.scores.slice(off,off+cnt).map((sc,i)=><div key={i} style={{width:34,display:"flex",justifyContent:"center"}}><SC score={sc} par={d.par[off+i]} size={24}/></div>)}</div>
          <div style={{width:2,background:"rgba(100,180,100,0.3)"}}/>
          <div style={{padding:"0 6px",fontSize:14,fontWeight:900,display:"flex",alignItems:"center"}}>{sub}</div></div></div>)}
  </div>;
}

/* ═══════ DESIGN REGISTRY ═══════ */
type DP_ = {d:DD;v:Vis;s:Stats;bg?:string|null;tc?:string};
type DesignDef = { id:string; label:string; C:React.FC<DP_>; needsHoles:boolean };
const DESIGNS: DesignDef[] = [
  {id:"A",label:"PGA Columns",C:DA,needsHoles:true},
  {id:"B",label:"Green Columns",C:DB,needsHoles:true},
  {id:"C",label:"18Birdies",C:DC,needsHoles:true},
  {id:"D",label:"Light Card",C:DD_,needsHoles:true},
  {id:"E",label:"To Par Hero",C:DE,needsHoles:true},
  {id:"F",label:"Hero Giant",C:DF,needsHoles:true},
  {id:"G",label:"Sticker",C:DG,needsHoles:false},
  {id:"H",label:"Strip",C:DH,needsHoles:false},
  {id:"I",label:"Glass Card",C:DI,needsHoles:true},
  {id:"J",label:"Classic Table",C:DJ,needsHoles:true},
  {id:"K",label:"Grint Row",C:DK,needsHoles:true},
  {id:"L",label:"Dots Grid",C:DL,needsHoles:true},
  {id:"M",label:"Neon Ring",C:DM,needsHoles:false},
  {id:"N",label:"Gradient Bar",C:DN,needsHoles:true},
  {id:"O",label:"Tournament",C:DO_,needsHoles:true},
  {id:"P",label:"Dashboard",C:DPx,needsHoles:true},
  {id:"Q",label:"Ticket",C:DQ,needsHoles:true},
  {id:"R",label:"Horizontal Wide",C:DR,needsHoles:true},
  {id:"S",label:"Horizontal Table",C:DS,needsHoles:true},
];

/* ═══════ TOGGLES ═══════ */
const TOGGLES = [
  {key:"player",label:"Jogador"},{key:"event",label:"Torneio"},{key:"course",label:"Campo"},
  {key:"round",label:"Round"},{key:"date",label:"Data"},{key:"position",label:"Posição"},
  {key:"holeScores",label:"Scores"},{key:"holePar",label:"Par"},{key:"holeSI",label:"S.I."},
  {key:"stats",label:"Estatísticas"},{key:"hiCh",label:"HI / CH"},{key:"sd",label:"SD"},
  {key:"tee",label:"Tee"},{key:"teeDist",label:"Distância"},
];
const defaultVis=():Vis=>Object.fromEntries(TOGGLES.map(t=>[t.key,true]));

/* ═══════ BACKGROUND COLOR OPTIONS ═══════ */
const BG_OPTIONS: {id:string;label:string;hex:string|null}[] = [
  {id:"transparent",label:"Sem fundo",hex:null},
  {id:"white",label:"Branco",hex:"#ffffff"},
  {id:"cream",label:"Creme",hex:"#fdf6e3"},
  {id:"sky",label:"Céu",hex:"#87ceeb"},
  {id:"green",label:"Verde",hex:"#1a6b3c"},
  {id:"navy",label:"Navy",hex:"#14284f"},
  {id:"wine",label:"Vinho",hex:"#722f37"},
  {id:"grey",label:"Cinzento",hex:"#6b7280"},
  {id:"black",label:"Preto",hex:"#000000"},
];

/* ═══════ MAIN COMPONENT ═══════ */
export default function OverlayExport({data}:{data:OverlayData}){
  const [player,setPlayer]=useState(data.player||"Manuel");
  const [event,setEvent]=useState(data.event||"");
  const [round,setRound]=useState(data.round||1);
  const [date,setDate]=useState(()=>data.date||(() => {const n=new Date();const m=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];return`${n.getDate()} ${m[n.getMonth()]} ${n.getFullYear()}`;})());
  const [position,setPosition]=useState(data.position||"");

  const [vis,setVis]=useState<Vis>(defaultVis);
  const [bgId,setBgId]=useState("transparent");
  const [customBg,setCustomBg]=useState("#1a4a2e");
  const [bgAlpha,setBgAlpha]=useState(100);
  const [theme,setTheme]=useState<"dark"|"light">("dark");
  const [exporting,setExporting]=useState(false);
  const [collapsed,setCollapsed]=useState(true);
  const [manualScore,setManualScore]=useState<string>("");
  const designRefs=useRef<Record<string,HTMLDivElement|null>>({});

  /* Build scores */
  const noHoleData=!data.hasHoles||data.scores.length===0;
  const allFilled=!noHoleData&&data.scores.every(s=>s!==null);
  const filledScores:number[]=noHoleData?[]:data.scores.map((s,i)=>s!==null?s:data.par[i]??4);
  const manualTotal=noHoleData?parseInt(manualScore)||null:null;
  const effectiveTotal=noHoleData?(manualTotal??null):null;
  const manualSD=effectiveTotal!==null&&data.slope>0?(113/data.slope)*(effectiveTotal-data.cr):null;
  const manualPar=data.is9h?36:72;

  const dd:DD=useMemo(()=>({
    player,event,round,date,position,
    course:data.courseName,tee:data.teeName,teeDist:data.teeDist,
    cr:data.cr,slope:data.slope,
    par:noHoleData?[]:data.par,scores:filledScores,si:noHoleData?[]:data.si,
    hi:data.hi,courseHcp:data.courseHcp,sd:noHoleData?(manualSD??null):data.sd,
    is9h:data.is9h,hasHoles:data.hasHoles,
  }),[data,player,event,round,date,position,filledScores,noHoleData,manualSD]);

  const stats=useMemo(():Stats=>{
    if(!noHoleData)return calcStats(dd);
    const sT=effectiveTotal??manualPar;
    return{pF:0,pB:0,pT:manualPar,sF:0,sB:0,sT,vpT:sT-manualPar,vpF:0,vpB:0,sd:manualSD??0,
      st:{eagles:0,birdies:0,pars:0,bogeys:0,doubles:0,triples:0}};
  },[dd,noHoleData,effectiveTotal,manualPar,manualSD]);

  const toggle=(key:string)=>setVis(prev=>({...prev,[key]:!prev[key]}));
  const available=DESIGNS.filter(x=>!x.needsHoles||data.hasHoles);

  /* ── Background computation ── */
  const isCustom=bgId==="custom";
  const bgOpt=BG_OPTIONS.find(b=>b.id===bgId);
  const bgHex=isCustom?customBg:(bgOpt?.hex??null);
  const alpha=bgAlpha/100;
  /* The bg color with alpha applied, or null for transparent */
  const bgColor=bgHex?hexToRgba(bgHex,alpha):null;
  /* Text color from theme */
  const tc=theme==="light"?"#1a1a1a":"#fff";

  /* Checkerboard for preview area */
  const checkerBg:React.CSSProperties={
    backgroundImage:"linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)",
    backgroundSize:"12px 12px",backgroundPosition:"0 0,0 6px,6px -6px,-6px 0px",backgroundColor:"#fff"};

  /* ── Export all ── */
  const doExportAll=useCallback(async()=>{
    setExporting(true);
    try{
      const h2c=(await import("html2canvas")).default;
      const files:File[]=[];
      for(const design of available){
        const el=designRefs.current[design.id];if(!el)continue;
        const canvas=await h2c(el,{backgroundColor:null,scale:3,useCORS:true,logging:false});
        const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,"image/png"));
        if(blob)files.push(new File([blob],`${design.label}.png`,{type:"image/png"}));
      }
      if(!files.length)return;
      if(navigator.share&&navigator.canShare){
        if(navigator.canShare({files})){try{await navigator.share({files,title:"Scorecards"});return;}catch{}}
      }
      for(let i=0;i<files.length;i++){
        const url=URL.createObjectURL(files[i]);
        const a=document.createElement("a");a.href=url;a.download=files[i].name;a.click();
        URL.revokeObjectURL(url);
        if(i<files.length-1)await new Promise(r=>setTimeout(r,300));
      }
    }catch(err){console.error(err);alert("Erro ao exportar.");}
    finally{setExporting(false);}
  },[available]);

  /* ── Export one ── */
  const doExportOne=useCallback(async(designId:string)=>{
    const el=designRefs.current[designId];if(!el)return;
    try{
      const h2c=(await import("html2canvas")).default;
      const canvas=await h2c(el,{backgroundColor:null,scale:3,useCORS:true,logging:false});
      canvas.toBlob(async(blob:Blob|null)=>{
        if(!blob)return;
        const file=new File([blob],`scorecard-${designId}.png`,{type:"image/png"});
        if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:"Scorecard"});return;}catch{}}
        const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=file.name;a.click();URL.revokeObjectURL(url);
      },"image/png");
    }catch(err){console.error(err);alert("Erro ao exportar");}
  },[]);

  /* ═══════════ RENDER ═══════════ */
  return <div className="ov-export">
    <link href={FONT_LINK} rel="stylesheet"/>
    <div className="ov-header" onClick={()=>setCollapsed(!collapsed)}>
      <h3 className="sim-section-title" style={{margin:0,cursor:"pointer",userSelect:"none"}}>
        📷 Partilhar Scorecard <span style={{fontSize:13,fontWeight:600,marginLeft:8,color:"#888"}}>{collapsed?"▸ expandir":"▾"}</span>
      </h3>
      {!allFilled&&!noHoleData&&!collapsed&&<div style={{fontSize:13,fontWeight:700,color:"#b45309",marginTop:4}}>⚠ Preenche todos os buracos para scores exactos. A pré-visualização usa o Par como placeholder.</div>}
    </div>

    {!collapsed&&<>
      {/* ── Manual fields ── */}
      <div className="ov-fields">
        <div className="ov-field"><label>Jogador</label><input type="text" value={player} onChange={e=>setPlayer(e.target.value)} placeholder="Nome" className="input" style={{width:130}}/></div>
        <div className="ov-field"><label>Torneio</label><input type="text" value={event} onChange={e=>setEvent(e.target.value)} placeholder="Evento" className="input" style={{width:150}}/></div>
        <div className="ov-field"><label>R</label><input type="number" value={round} min={1} max={9} onChange={e=>setRound(Number(e.target.value))} className="input" style={{width:48}}/></div>
        <div className="ov-field"><label>Data</label><input type="text" value={date} onChange={e=>setDate(e.target.value)} className="input" style={{width:110}}/></div>
        <div className="ov-field"><label>Pos.</label><input type="text" value={position} onChange={e=>setPosition(e.target.value)} placeholder="—" className="input" style={{width:44}}/></div>
        {noHoleData&&<div className="ov-field"><label>Score Total</label><input type="text" inputMode="numeric" value={manualScore} onChange={e=>setManualScore(e.target.value.replace(/\D/g,""))} placeholder={String(manualPar)} className="input" style={{width:60,fontWeight:800}}/></div>}
      </div>

      {/* ── Background color picker ── */}
      <div className="ov-options">
        <div className="ov-opt-group" style={{flexWrap:"wrap",gap:4}}>
          <span className="ov-opt-label">Fundo</span>
          {BG_OPTIONS.map(bg=><button key={bg.id}
            className={`ov-opt-btn${bgId===bg.id?" active":""}`}
            onClick={()=>setBgId(bg.id)}
            style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 8px"}}>
            <span style={{
              display:"inline-block",width:14,height:14,borderRadius:3,flexShrink:0,
              border:"1px solid rgba(128,128,128,0.4)",
              background:bg.hex===null
                ?"linear-gradient(45deg,#ccc 25%,#fff 25%,#fff 50%,#ccc 50%,#ccc 75%,#fff 75%)"
                :bg.hex,
              backgroundSize:bg.hex===null?"6px 6px":undefined,
            }}/>
            <span style={{fontSize:11}}>{bg.label}</span>
          </button>)}
          {/* Custom color picker */}
          <button
            className={`ov-opt-btn${bgId==="custom"?" active":""}`}
            onClick={()=>setBgId("custom")}
            style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 8px"}}>
            <input type="color" value={customBg}
              onClick={e=>e.stopPropagation()}
              onChange={e=>{setCustomBg(e.target.value);setBgId("custom");}}
              style={{width:14,height:14,padding:0,border:"1px solid rgba(128,128,128,0.4)",borderRadius:3,cursor:"pointer"}}/>
            <span style={{fontSize:11}}>Outra…</span>
          </button>
        </div>
        {/* Opacity slider — only when not transparent */}
        {bgHex&&<div className="ov-opt-group">
          <span className="ov-opt-label">Opacidade</span>
          <input type="range" min={0} max={100} value={bgAlpha} onChange={e=>setBgAlpha(parseInt(e.target.value))} style={{width:120,accentColor:"#2e7d32"}}/>
          <span style={{fontSize:13,color:"#888",minWidth:34,fontWeight:700}}>{bgAlpha}%</span>
        </div>}
        <div className="ov-opt-group">
          <span className="ov-opt-label">Tema</span>
          <button className={`ov-opt-btn${theme==="dark"?" active":""}`} onClick={()=>setTheme("dark")}
            style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px"}}>
            <span style={{display:"inline-block",width:14,height:14,borderRadius:3,background:"#1a1a1a",border:"1px solid rgba(128,128,128,0.4)"}}/>
            <span style={{fontSize:11}}>Escuro</span></button>
          <button className={`ov-opt-btn${theme==="light"?" active":""}`} onClick={()=>setTheme("light")}
            style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px"}}>
            <span style={{display:"inline-block",width:14,height:14,borderRadius:3,background:"#fff",border:"1px solid rgba(128,128,128,0.4)"}}/>
            <span style={{fontSize:11}}>Claro</span></button>
        </div>
      </div>

      {/* ── Toggles ── */}
      <div className="ov-toggles">
        {TOGGLES.map(tt=><label key={tt.key} className="ov-toggle"><input type="checkbox" checked={!!vis[tt.key]} onChange={()=>toggle(tt.key)}/><span>{tt.label}</span></label>)}
      </div>

      {/* ── Export All ── */}
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <button className="ov-export-btn" onClick={doExportAll} disabled={exporting}>
          {exporting?"A gerar imagens…":`📷 Descarregar Todos (${available.length})`}
        </button>
      </div>

      {/* ── Gallery ── */}
      {noHoleData&&!effectiveTotal&&<div style={{padding:"12px 16px",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,color:"#92400e",fontSize:13,fontWeight:700,marginBottom:12}}>
        Insere o <strong>Score Total</strong> acima para pré-visualizar os overlays.
      </div>}
      <div className="ov-gallery">
        {available.map(x=><div key={x.id} className="ov-card">
          <div className="ov-card-header">
            <span className="ov-card-label">{x.id}. {x.label}</span>
            <button className="ov-share-btn" onClick={()=>doExportOne(x.id)} title="Partilhar / Descarregar">📤</button>
          </div>
          <div className="ov-card-preview" style={checkerBg}>
            {/* ▼ CAPTURE DIV — bg color behind design, visible through rgba backgrounds */}
            <div ref={el=>{designRefs.current[x.id]=el;}}
              style={{display:"inline-block"}}>
              <x.C d={dd} v={vis} s={stats} bg={bgColor} tc={tc}/>
            </div>
          </div>
        </div>)}
      </div>
    </>}
  </div>;
}
