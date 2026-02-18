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
type Theme = { tx:string;tx2:string;tx3:string;tx4:string;div:string;div2:string;cardBg:string;cardBd:string;greenBg:string;greenBg2:string;parC:string;parBd:string;dash:string;posBd:string;dim:string; };
type Stats = { pF:number;pB:number;pT:number;sF:number;sB:number;sT:number;vpT:number;vpF:number;vpB:number;sd:number;st:{eagles:number;birdies:number;pars:number;bogeys:number;doubles:number;triples:number}};

/* ═══════ THEMES ═══════ */
function mkTheme(mode: "white"|"black"): Theme {
  const L=mode==="white";
  return{tx:L?"#000":"#fff",tx2:L?"rgba(0,0,0,0.7)":"rgba(255,255,255,0.7)",tx3:L?"rgba(0,0,0,0.5)":"rgba(255,255,255,0.5)",tx4:L?"rgba(0,0,0,0.3)":"rgba(255,255,255,0.3)",
    div:L?"rgba(0,0,0,0.15)":"rgba(255,255,255,0.15)",div2:L?"rgba(0,0,0,0.08)":"rgba(255,255,255,0.08)",
    cardBg:L?"rgba(0,0,0,0.04)":"rgba(255,255,255,0.04)",cardBd:L?"rgba(0,0,0,0.12)":"rgba(255,255,255,0.08)",
    greenBg:L?"rgba(45,106,48,0.15)":"rgba(45,106,48,0.6)",greenBg2:L?"rgba(45,106,48,0.1)":"rgba(45,106,48,0.35)",
    parC:L?"rgba(0,0,0,0.65)":"rgba(255,255,255,0.65)",parBd:L?"2px solid rgba(0,0,0,0.15)":"2px solid rgba(255,255,255,0.12)",
    dash:L?"rgba(0,0,0,0.2)":"rgba(255,255,255,0.15)",posBd:L?"rgba(0,0,0,0.2)":"rgba(255,255,255,0.25)",
    dim:L?"rgba(0,0,0,0.55)":"rgba(255,255,255,0.6)"};
}

/* ═══════ SCORE COLORS (GameBook) ═══════ */
function sty(score:number,par:number,t:Theme){const d=score-par;if(d<=-2)return{c:"#fff",bg:"#d4a017",sh:"circle"as const};if(d===-1)return{c:"#fff",bg:"#dc2626",sh:"circle"as const};if(d===0)return{c:t.tx,bg:"transparent",sh:"none"as const};if(d===1)return{c:"#fff",bg:"#5BADE6",sh:"sq"as const};if(d===2)return{c:"#fff",bg:"#2B6EA0",sh:"sq"as const};if(d===3)return{c:"#fff",bg:"#1B4570",sh:"sq"as const};return{c:"#fff",bg:"#0E2A45",sh:"sq"as const};}
function vpc(d:number,t:Theme){if(d<=-2)return"#d4a017";if(d===-1)return"#dc2626";if(d===0)return t.tx2;if(d===1)return"#5BADE6";if(d===2)return"#2B6EA0";if(d===3)return"#1B4570";return"#0E2A45";}
const fvp=(v:number)=>v===0?"E":v>0?`+${v}`:`${v}`;

function SC({score,par,size=28,fs=14,t}:{score:number;par:number;size?:number;fs?:number;t:Theme}){
  const s=sty(score,par,t);
  return <div style={{width:size,height:size,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:s.sh==="circle"?"50%":0,background:s.bg,fontSize:fs,fontWeight:900,color:s.c,lineHeight:1}}>{score}</div>;
}


/* ═══════ STATS ═══════ */
function calcStats(d:DD): Stats {
  const n=d.scores.length;const is18=n>=18;
  const pF=d.par.slice(0,9).reduce((a,b)=>a+b,0);const pB=is18?d.par.slice(9).reduce((a,b)=>a+b,0):0;
  const pT=is18?pF+pB:d.par.reduce((a,b)=>a+b,0);
  const sF=d.scores.slice(0,9).reduce((a,b)=>a+b,0);const sB=is18?d.scores.slice(9).reduce((a,b)=>a+b,0):0;
  const sT=is18?sF+sB:d.scores.reduce((a,b)=>a+b,0);
  const st={eagles:0,birdies:0,pars:0,bogeys:0,doubles:0,triples:0};
  d.scores.forEach((s,i)=>{const x=s-d.par[i];if(x<=-2)st.eagles++;else if(x===-1)st.birdies++;else if(x===0)st.pars++;else if(x===1)st.bogeys++;else if(x===2)st.doubles++;else st.triples++;});
  const sd=d.slope>0?(113/d.slope)*(sT-d.cr):0;
  return{pF,pB,pT,sF,sB,sT,vpT:sT-pT,vpF:sF-pF,vpB:is18?sB-pB:0,sd,st};
}

/* ═══════ SHARED SUB-COMPONENTS ═══════ */
function SubLine({d,v,t}:{d:DD;v:Vis;t:Theme}){
  const parts:string[]=[];
  if(v.course&&d.course)parts.push(d.course);if(v.tee&&d.tee)parts.push(d.tee);
  if(v.teeDist&&d.teeDist)parts.push(`${d.teeDist}m`);if(v.date&&d.date)parts.push(d.date);
  if(!parts.length)return null;
  return <div style={{fontSize:12,color:t.tx3,marginTop:1,fontWeight:700}}>{parts.join(" · ")}</div>;
}
function TitleLine({d,v,t,fs=15}:{d:DD;v:Vis;t:Theme;fs?:number}){
  if(!v.event&&!v.round)return null;
  const ev=v.event&&d.event?d.event:"";const rn=v.round?`R${d.round}`:"";const sep=ev&&rn?" — ":"";
  if(!ev&&!rn)return null;
  return <div style={{fontSize:fs,fontWeight:900,color:t.tx}}>{ev}{sep}{rn}</div>;
}
function HiChSdLine({d,v,t,fs=10}:{d:DD;v:Vis;t:Theme;fs?:number}){
  const parts:string[]=[];
  if(v.hiCh&&d.hi!==null){parts.push(`HI ${d.hi.toFixed(1)}`);if(d.courseHcp!==null)parts.push(`CH ${d.courseHcp}`);}
  if(v.sd&&d.sd!==null)parts.push(`SD ${d.sd.toFixed(1)}`);
  if(!parts.length)return null;
  return <div style={{fontSize:fs,color:t.tx3,marginTop:3,fontWeight:700}}>{parts.join(" · ")}</div>;
}
function StatsRow({s,v,t,fs=20,gap=12}:{s:Stats;v:Vis;t:Theme;fs?:number;gap?:number}){
  if(!v.stats)return null;const bogP=s.st.bogeys+s.st.doubles+s.st.triples;
  return <div style={{display:"flex",justifyContent:"center",gap,marginTop:8}}>
    {s.st.eagles>0&&<div style={{textAlign:"center"}}><div style={{fontSize:fs,fontWeight:900,color:"#d4a017",lineHeight:1}}>{s.st.eagles}</div><div style={{fontSize:11,color:t.tx4,marginTop:2,fontWeight:800}}>EAG</div></div>}
    {s.st.birdies>0&&<div style={{textAlign:"center"}}><div style={{fontSize:fs,fontWeight:900,color:"#dc2626",lineHeight:1}}>{s.st.birdies}</div><div style={{fontSize:11,color:t.tx4,marginTop:2,fontWeight:800}}>BIR</div></div>}
    <div style={{textAlign:"center"}}><div style={{fontSize:fs,fontWeight:900,color:t.dim,lineHeight:1}}>{s.st.pars}</div><div style={{fontSize:11,color:t.tx4,marginTop:2,fontWeight:800}}>PAR</div></div>
    {bogP>0&&<div style={{textAlign:"center"}}><div style={{fontSize:fs,fontWeight:900,color:"#5BADE6",lineHeight:1}}>{bogP}</div><div style={{fontSize:11,color:t.tx4,marginTop:2,fontWeight:800}}>BOG+</div></div>}
  </div>;
}

/* ═══════ 20 DESIGNS ═══════ */

/* 1. Cartão Clássico */
function D1({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  const is18=d.scores.length>=18;
  const HT=({pars,scores,sis,start,label}:{pars:number[];scores:number[];sis:number[];start:number;label:string})=>(
    <div style={{marginBottom:2}}>
      <div style={{display:"flex",background:t.greenBg,borderRadius:"4px 4px 0 0",padding:"3px 0"}}>
        <div style={{width:60,padding:"0 4px",color:t.tx,fontWeight:900,fontSize:13}}>Buraco</div>
        {pars.map((_,i)=><div key={i} style={{width:30,textAlign:"center",color:t.tx,fontWeight:800,fontSize:13}}>{start+i}</div>)}
        <div style={{width:34,textAlign:"center",color:t.tx,fontWeight:900,fontSize:13}}>{label}</div></div>
      {v.holeSI&&<div style={{display:"flex",background:t.cardBg,padding:"2px 0"}}>
        <div style={{width:60,padding:"0 4px",color:t.tx3,fontSize:12}}>S.I.</div>
        {sis.map((si,i)=><div key={i} style={{width:30,textAlign:"center",color:t.tx3,fontSize:12}}>{si}</div>)}<div style={{width:34}}/></div>}
      {v.holePar&&<div style={{display:"flex",background:t.cardBg,padding:"2px 0"}}>
        <div style={{width:60,padding:"0 4px",color:t.tx2,fontSize:12,fontWeight:700}}>Par</div>
        {pars.map((p,i)=><div key={i} style={{width:30,textAlign:"center",color:t.tx2,fontSize:13}}>{p}</div>)}
        <div style={{width:34,textAlign:"center",color:t.tx2,fontWeight:800,fontSize:13}}>{pars.reduce((a,b)=>a+b,0)}</div></div>}
      {v.holeScores&&<div style={{display:"flex",padding:"3px 0"}}>
        <div style={{width:60,padding:"0 4px",fontWeight:900,fontSize:13,color:t.tx}}>Score</div>
        {scores.map((sc,i)=><div key={i} style={{width:30,display:"flex",justifyContent:"center"}}><SC score={sc} par={pars[i]} size={24} fs={12} t={t}/></div>)}
        <div style={{width:34,textAlign:"center",fontWeight:900,fontSize:18,color:t.tx}}>{scores.reduce((a,b)=>a+b,0)}</div></div>}
    </div>);
  return <div style={{padding:"14px 10px",fontFamily:"'DM Sans',sans-serif",color:t.tx,width:is18?410:350}}>
    {(v.event||v.course||v.round)&&<div style={{textAlign:"center",marginBottom:10}}><TitleLine d={d} v={v} t={t}/><SubLine d={d} v={v} t={t}/></div>}
    {v.player&&d.player&&<div style={{textAlign:"center",fontSize:15,fontWeight:800,marginBottom:6}}>{d.player}</div>}
    {is18?<><HT pars={d.par.slice(0,9)} scores={d.scores.slice(0,9)} sis={d.si.slice(0,9)} start={1} label="Out"/>
      <HT pars={d.par.slice(9)} scores={d.scores.slice(9)} sis={d.si.slice(9)} start={10} label="In"/></>
      :<HT pars={d.par} scores={d.scores} sis={d.si} start={1} label="Tot"/>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8,padding:"0 4px"}}>
      <span style={{fontSize:14,color:t.tx3}}>Par {s.pT}</span><span style={{fontSize:20,fontWeight:900}}>{s.sT}</span>
      <span style={{fontSize:18,fontWeight:900,color:vpc(s.vpT,t)}}>{fvp(s.vpT)}</span></div>
    <StatsRow s={s} v={v} t={t} fs={15} gap={10}/><div style={{textAlign:"center"}}><HiChSdLine d={d} v={v} s={s} t={t}/></div>
    {v.position&&d.position&&<div style={{textAlign:"center",fontSize:11,color:t.tx4,marginTop:3}}>Posição: {d.position}º</div>}
  </div>;
}

/* 2. Scorecard Pro */
function D2({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  const is18=d.scores.length>=18;
  const R=({label,data,isSc,tot,off=0}:{label:string;data:number[];isSc?:boolean;tot:number|string;off?:number})=>(
    <div style={{display:"flex",alignItems:"center"}}>
      <div style={{width:36,fontSize:12,fontWeight:isSc?700:400,color:isSc?t.tx:t.tx3,padding:"3px 2px"}}>{label}</div>
      {data.map((val,i)=><div key={i} style={{width:26,display:"flex",justifyContent:"center",padding:"2px 0"}}>
        {isSc?<SC score={val} par={d.par[off+i]} size={22} fs={11} t={t}/>:<span style={{fontSize:13,color:t.tx2}}>{val}</span>}</div>)}
      <div style={{width:30,textAlign:"center",fontWeight:900,fontSize:isSc?13:11,color:isSc?t.tx:t.tx2}}>{tot}</div></div>);
  return <div style={{padding:"12px 8px",fontFamily:"'JetBrains Mono',monospace",color:t.tx,width:is18?350:320}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:8,padding:"0 2px"}}>
      <div>{v.player&&d.player&&<div style={{fontSize:15,fontWeight:900}}>{d.player}</div>}<SubLine d={d} v={v} t={t}/></div>
      <div><span style={{fontSize:26,fontWeight:900}}>{s.sT}</span><span style={{fontSize:15,fontWeight:800,marginLeft:4,color:vpc(s.vpT,t)}}>{fvp(s.vpT)}</span></div></div>
    {(v.event||v.round)&&<div style={{fontSize:12,color:t.tx3,marginBottom:6,textAlign:"center"}}>{v.event&&d.event}{v.round&&` R${d.round}`}</div>}
    {(v.holeScores||v.holePar||v.holeSI)&&is18&&<>
      <div style={{display:"flex"}}><div style={{width:36}}/>{[1,2,3,4,5,6,7,8,9].map(h=><div key={h} style={{width:26,textAlign:"center",fontSize:11,color:t.tx4,fontWeight:800}}>{h}</div>)}<div style={{width:30,textAlign:"center",fontSize:10,color:t.tx3,fontWeight:800}}>OUT</div></div>
      {v.holeSI&&<R label="SI" data={d.si.slice(0,9)} tot=""/>}{v.holePar&&<R label="Par" data={d.par.slice(0,9)} tot={s.pF}/>}{v.holeScores&&<R label="Score" data={d.scores.slice(0,9)} isSc tot={s.sF}/>}
      <div style={{height:6}}/>
      <div style={{display:"flex"}}><div style={{width:36}}/>{[10,11,12,13,14,15,16,17,18].map(h=><div key={h} style={{width:26,textAlign:"center",fontSize:11,color:t.tx4,fontWeight:800}}>{h}</div>)}<div style={{width:30,textAlign:"center",fontSize:10,color:t.tx3,fontWeight:800}}>IN</div></div>
      {v.holeSI&&<R label="SI" data={d.si.slice(9)} tot="" off={9}/>}{v.holePar&&<R label="Par" data={d.par.slice(9)} tot={s.pB} off={9}/>}{v.holeScores&&<R label="Score" data={d.scores.slice(9)} isSc tot={s.sB} off={9}/>}
    </>}
    {(v.holeScores||v.holePar||v.holeSI)&&!is18&&<>
      <div style={{display:"flex"}}><div style={{width:36}}/>{d.par.map((_,i)=><div key={i} style={{width:26,textAlign:"center",fontSize:11,color:t.tx4,fontWeight:800}}>{i+1}</div>)}<div style={{width:30,textAlign:"center",fontSize:10,color:t.tx3,fontWeight:800}}>TOT</div></div>
      {v.holeSI&&<R label="SI" data={d.si} tot=""/>}{v.holePar&&<R label="Par" data={d.par} tot={s.pT}/>}{v.holeScores&&<R label="Score" data={d.scores} isSc tot={s.sT}/>}
    </>}
    <StatsRow s={s} v={v} t={t} fs={13} gap={8}/><div style={{textAlign:"center"}}><HiChSdLine d={d} v={v} s={s} t={t}/></div>
  </div>;
}

/* 3. Resumo */
function D3({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  return <div style={{padding:"18px 22px",fontFamily:"'DM Sans',sans-serif",color:t.tx,width:210,textAlign:"center"}}>
    {(v.event||v.round)&&<div style={{fontSize:12,color:t.tx3,marginBottom:6}}>{v.event&&d.event}{v.round&&` R${d.round}`}</div>}
    <div style={{fontSize:56,fontWeight:900,lineHeight:1,letterSpacing:"-3px"}}>{s.sT}</div>
    <div style={{fontSize:22,fontWeight:800,marginTop:2,color:vpc(s.vpT,t)}}>{fvp(s.vpT)}</div>
    <StatsRow s={s} v={v} t={t} fs={18} gap={10}/>
    {(v.player||v.course||v.date)&&<div style={{height:1,background:t.div,margin:"10px 14px"}}/>}
    {v.player&&d.player&&<div style={{fontSize:14,fontWeight:800}}>{d.player}</div>}
    <SubLine d={d} v={v} t={t}/><HiChSdLine d={d} v={v} s={s} t={t}/>
    {v.position&&d.position&&<div style={{fontSize:11,color:t.tx4,marginTop:3}}>{d.position}º lugar</div>}
  </div>;
}

/* 4. Dots */
function D4({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  const is18=d.scores.length>=18;
  return <div style={{padding:"14px 12px",fontFamily:"'JetBrains Mono',monospace",color:t.tx,width:is18?330:300}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
      <div>{v.player&&d.player&&<div style={{fontSize:15,fontWeight:900}}>{d.player}</div>}{(v.event||v.round)&&<div style={{fontSize:12,color:t.tx3,fontWeight:700}}>{v.event&&d.event}{v.round&&` R${d.round}`}</div>}</div>
      <div><span style={{fontSize:28,fontWeight:900}}>{s.sT}</span><span style={{fontSize:18,fontWeight:800,marginLeft:4,color:vpc(s.vpT,t)}}>{fvp(s.vpT)}</span></div></div>
    {v.holeScores&&is18&&[{l:"OUT",o:0},{l:"IN",o:9}].map(h=><div key={h.l} style={{marginBottom:4}}>
      <div style={{display:"flex",alignItems:"center",gap:2}}>
        <div style={{width:24,fontSize:12,fontWeight:900,color:t.tx3,textAlign:"right",paddingRight:3}}>{h.l}</div>
        {d.scores.slice(h.o,h.o+9).map((sc,i)=><SC key={i} score={sc} par={d.par[h.o+i]} size={28} fs={13} t={t}/>)}
        <div style={{width:30,textAlign:"center",fontWeight:900,fontSize:18}}>{d.scores.slice(h.o,h.o+9).reduce((a,b)=>a+b,0)}</div></div>
      <div style={{display:"flex",gap:2}}><div style={{width:24}}/>{Array.from({length:9},(_,i)=><div key={i} style={{width:28,textAlign:"center",fontSize:10,color:t.tx4,fontWeight:700}}>{h.o+i+1}</div>)}</div></div>)}
    {v.holeScores&&!is18&&<div style={{display:"flex",alignItems:"center",gap:2,marginBottom:4}}>
      {d.scores.map((sc,i)=><SC key={i} score={sc} par={d.par[i]} size={28} fs={13} t={t}/>)}
      <div style={{width:30,textAlign:"center",fontWeight:900,fontSize:18}}>{s.sT}</div></div>}
    <SubLine d={d} v={v} t={t}/><StatsRow s={s} v={v} t={t} fs={13} gap={8}/><div style={{textAlign:"center"}}><HiChSdLine d={d} v={v} s={s} t={t}/></div>
    {v.position&&d.position&&<div style={{fontSize:11,color:t.tx4,textAlign:"center",marginTop:2}}>{d.position}º</div>}
  </div>;
}

/* 5. Medalha */
function D5({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  return <div style={{padding:"16px 22px",fontFamily:"'DM Sans',sans-serif",color:t.tx,width:180,textAlign:"center"}}>
    {v.event&&d.event&&<div style={{fontSize:12,fontWeight:900,color:t.tx3,letterSpacing:"1.5px",textTransform:"uppercase"}}>{d.event}</div>}
    {v.round&&<div style={{fontSize:14,fontWeight:900,color:t.tx2,marginTop:2}}>R{d.round}</div>}
    {v.position&&d.position&&<div style={{fontSize:12,color:t.tx3,marginTop:2}}>{d.position}º</div>}
    <div style={{fontSize:48,fontWeight:900,lineHeight:1,marginTop:6}}>{s.sT}</div>
    <div style={{fontSize:20,fontWeight:900,marginTop:2,color:vpc(s.vpT,t)}}>{fvp(s.vpT)}</div>
    <StatsRow s={s} v={v} t={t} fs={15} gap={8}/>
    {(v.player||v.course||v.date)&&<div style={{height:1,background:t.div,margin:"8px 0"}}/>}
    {v.player&&d.player&&<div style={{fontSize:13,fontWeight:800}}>{d.player}</div>}
    <SubLine d={d} v={v} t={t}/><HiChSdLine d={d} v={v} s={s} t={t}/>
  </div>;
}

/* 6. Faixa */
function D6({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  const bogP=s.st.bogeys+s.st.doubles+s.st.triples;
  return <div style={{padding:"10px 16px",fontFamily:"'DM Sans',sans-serif",color:t.tx,display:"flex",alignItems:"center",gap:12}}>
    <div><span style={{fontSize:32,fontWeight:900}}>{s.sT}</span><span style={{fontSize:18,fontWeight:800,marginLeft:4,color:vpc(s.vpT,t)}}>{fvp(s.vpT)}</span></div>
    <div style={{width:1,height:28,background:t.div}}/>
    <div>{v.player&&d.player&&<div style={{fontSize:14,fontWeight:800}}>{d.player}</div>}{(v.event||v.round)&&<div style={{fontSize:12,color:t.tx3,fontWeight:700}}>{v.event&&d.event}{v.round&&` R${d.round}`}</div>}
      <SubLine d={d} v={{...v,event:false,round:false}} t={t}/></div>
    {v.stats&&<><div style={{width:1,height:28,background:t.div}}/>
      <div style={{display:"flex",gap:6}}>
        {s.st.birdies>0&&<div style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:900,color:"#dc2626"}}>{s.st.birdies}</div><div style={{fontSize:10,color:t.tx4,fontWeight:700}}>BIR</div></div>}
        <div style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:900,color:t.dim}}>{s.st.pars}</div><div style={{fontSize:10,color:t.tx4,fontWeight:700}}>PAR</div></div>
        {bogP>0&&<div style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:900,color:"#5BADE6"}}>{bogP}</div><div style={{fontSize:10,color:t.tx4,fontWeight:700}}>BOG</div></div>}
      </div></>}
    {v.sd&&d.sd!==null&&<div style={{textAlign:"center",marginLeft:4}}><div style={{fontSize:11,color:t.tx4,fontWeight:800}}>SD</div><div style={{fontSize:15,fontWeight:900}}>{s.sd.toFixed(1)}</div></div>}
    {v.position&&d.position&&<div style={{fontSize:13,fontWeight:900,color:t.tx3}}>{d.position}º</div>}
  </div>;
}

/* 7. Painel */
function D7({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  const B=({val,l,c,big}:{val:string|number;l:string;c?:string;big?:boolean})=><div style={{textAlign:"center",padding:big?"8px 12px":"6px 8px",background:t.cardBg,borderRadius:6,border:`1px solid ${t.cardBd}`}}>
    <div style={{fontSize:big?30:20,fontWeight:900,color:c||t.tx,lineHeight:1}}>{val}</div><div style={{fontSize:11,fontWeight:800,color:t.tx4,marginTop:3,letterSpacing:"0.5px"}}>{l}</div></div>;
  return <div style={{padding:16,fontFamily:"'DM Sans',sans-serif",color:t.tx,width:260}}>
    <div style={{textAlign:"center",marginBottom:12}}>{v.player&&d.player&&<div style={{fontSize:18,fontWeight:900}}>{d.player}</div>}{(v.event||v.round)&&<div style={{fontSize:12,color:t.tx3,marginTop:1}}>{v.event&&d.event}{v.round&&` R${d.round}`}</div>}<SubLine d={d} v={{...v,event:false,round:false}} t={t}/></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}><B val={s.sT} l="RESULTADO" big/><B val={fvp(s.vpT)} l="VS PAR" c={vpc(s.vpT,t)} big/></div>
    {v.stats&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4}}><B val={s.st.birdies} l="BIRDIES" c="#dc2626"/><B val={s.st.pars} l="PARS" c={t.dim}/><B val={s.st.bogeys+s.st.doubles+s.st.triples} l="BOGEY+" c="#5BADE6"/></div>}
    {(v.hiCh||v.sd)&&d.hi!==null&&<div style={{display:"grid",gridTemplateColumns:v.hiCh&&v.sd?"1fr 1fr 1fr":"1fr 1fr",gap:4,marginTop:6}}>{v.hiCh&&<B val={d.hi.toFixed(1)} l="HI"/>}{v.hiCh&&d.courseHcp!==null&&<B val={d.courseHcp} l="CH"/>}{v.sd&&<B val={s.sd.toFixed(1)} l="SD"/>}</div>}
    {v.position&&d.position&&<div style={{textAlign:"center",fontSize:11,color:t.tx4,marginTop:6}}>{d.position}º</div>}
  </div>;
}

/* 8. Pódio */
function D8({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  return <div style={{padding:"18px 22px",fontFamily:"'DM Sans',sans-serif",color:t.tx,width:210,textAlign:"center"}}>
    {v.position&&d.position&&<div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:44,height:44,borderRadius:"50%",border:`2px solid ${t.posBd}`,fontSize:22,fontWeight:900}}>{d.position}º</div>}
    {v.player&&d.player&&<div style={{fontSize:15,fontWeight:900,marginTop:8}}>{d.player}</div>}
    {(v.event||v.round)&&<div style={{fontSize:12,color:t.tx3,marginTop:2}}>{v.event&&d.event}{v.round&&` R${d.round}`}</div>}
    <div style={{height:1,background:t.div,margin:"10px 0"}}/>
    <div style={{display:"flex",justifyContent:"center",gap:14}}>
      <div><div style={{fontSize:26,fontWeight:900}}>{s.sT}</div><div style={{fontSize:11,color:t.tx4,fontWeight:800}}>SCORE</div></div>
      <div><div style={{fontSize:26,fontWeight:900,color:vpc(s.vpT,t)}}>{fvp(s.vpT)}</div><div style={{fontSize:11,color:t.tx4,fontWeight:800}}>VS PAR</div></div>
      {v.sd&&<div><div style={{fontSize:26,fontWeight:900}}>{s.sd.toFixed(1)}</div><div style={{fontSize:11,color:t.tx4,fontWeight:800}}>SD</div></div>}</div>
    <StatsRow s={s} v={v} t={t} fs={15} gap={8}/><SubLine d={d} v={v} t={t}/><HiChSdLine d={d} v={{...v,sd:false}} s={s} t={t}/>
  </div>;
}

/* 9. Grelha */
function D9({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  const H=({label,scores,pars,total,pt,start}:{label:string;scores:number[];pars:number[];total:number;pt:number;start:number})=><div style={{flex:1}}>
    <div style={{fontSize:12,fontWeight:900,color:t.tx3,marginBottom:4,textAlign:"center"}}>{label}</div>
    {v.holeScores&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:2,justifyItems:"center"}}>
      {scores.map((sc,i)=><div key={i}><SC score={sc} par={pars[i]} size={28} fs={13} t={t}/><div style={{fontSize:10,color:t.tx4,fontWeight:700,textAlign:"center"}}>{start+i}</div></div>)}</div>}
    <div style={{textAlign:"center",marginTop:6}}><span style={{fontSize:20,fontWeight:900}}>{total}</span><span style={{fontSize:13,fontWeight:700,marginLeft:3,color:vpc(total-pt,t)}}>{fvp(total-pt)}</span></div></div>;
  return <div style={{padding:"14px 12px",fontFamily:"'DM Sans',sans-serif",color:t.tx,width:v.holeScores?250:190}}>
    <div style={{textAlign:"center",marginBottom:10}}>{v.player&&d.player&&<div style={{fontSize:15,fontWeight:900}}>{d.player}</div>}{(v.event||v.round)&&<div style={{fontSize:12,color:t.tx3,fontWeight:700}}>{v.event&&d.event}{v.round&&` R${d.round}`}</div>}<SubLine d={d} v={{...v,event:false,round:false}} t={t}/></div>
    <div style={{display:"flex",gap:10}}><H label="OUT" scores={d.scores.slice(0,9)} pars={d.par.slice(0,9)} total={s.sF} pt={s.pF} start={1}/><div style={{width:1,background:t.div2}}/><H label="IN" scores={d.scores.slice(9)} pars={d.par.slice(9)} total={s.sB} pt={s.pB} start={10}/></div>
    <div style={{textAlign:"center",marginTop:10}}><span style={{fontSize:30,fontWeight:900}}>{s.sT}</span><span style={{fontSize:17,fontWeight:800,marginLeft:4,color:vpc(s.vpT,t)}}>{fvp(s.vpT)}</span></div>
    <StatsRow s={s} v={v} t={t} fs={13} gap={8}/><div style={{textAlign:"center"}}><HiChSdLine d={d} v={v} s={s} t={t}/></div>
    {v.position&&d.position&&<div style={{textAlign:"center",fontSize:11,color:t.tx4,marginTop:2}}>{d.position}º</div>}
  </div>;
}

/* 10. Clean */
function D10({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  return <div style={{padding:"12px 20px",fontFamily:"'DM Sans',sans-serif",color:t.tx,textAlign:"center"}}>
    {(v.event||v.round)&&<div style={{fontSize:12,color:t.tx4,marginBottom:4}}>{v.event&&d.event}{v.round&&` R${d.round}`}</div>}
    <div style={{fontSize:72,fontWeight:900,lineHeight:1,letterSpacing:"-4px"}}>{s.sT}</div>
    <div style={{fontSize:26,fontWeight:900,color:vpc(s.vpT,t),marginTop:2}}>{fvp(s.vpT)}</div>
    {v.player&&d.player&&<div style={{fontSize:13,color:t.tx3,marginTop:6}}>{d.player}</div>}
    <SubLine d={d} v={v} t={t}/><HiChSdLine d={d} v={v} s={s} t={t}/>
    {v.position&&d.position&&<div style={{fontSize:11,color:t.tx4,marginTop:2}}>{d.position}º</div>}
  </div>;
}

/* 11. Dual */
function D11({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  return <div style={{padding:"18px 14px",fontFamily:"'DM Sans',sans-serif",color:t.tx,width:200}}>
    <div style={{textAlign:"center",marginBottom:2}}>
      {v.event&&d.event&&<div style={{fontSize:12,fontWeight:900,color:t.tx3,letterSpacing:"1.5px"}}>{d.event.toUpperCase()}</div>}
      {v.round&&<div style={{fontSize:22,fontWeight:900,marginTop:1}}>ROUND {d.round}</div>}
      {v.player&&d.player&&<div style={{fontSize:13,fontWeight:700,color:t.tx2,marginTop:2}}>{d.player.toUpperCase()}</div>}
      <SubLine d={d} v={{...v,event:false,round:false,player:false}} t={t}/></div>
    {v.holeScores&&<div style={{display:"flex",gap:6,marginTop:8}}>
      <div style={{flex:1}}>{d.scores.slice(0,9).map((sc,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"2px 2px",borderBottom:`1px solid ${t.div2}`}}>
        <span style={{fontSize:12,color:t.tx4,width:14}}>{i+1}</span>{v.holePar&&<span style={{fontSize:11,color:t.tx4,width:14}}>{d.par[i]}</span>}<SC score={sc} par={d.par[i]} size={22} fs={11} t={t}/></div>)}</div>
      <div style={{width:1,background:t.div2}}/>
      <div style={{flex:1}}>{d.scores.slice(9).map((sc,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"2px 2px",borderBottom:`1px solid ${t.div2}`}}>
        <SC score={sc} par={d.par[9+i]} size={22} fs={11} t={t}/>{v.holePar&&<span style={{fontSize:11,color:t.tx4,width:14,textAlign:"right"}}>{d.par[9+i]}</span>}<span style={{fontSize:12,color:t.tx4,width:14,textAlign:"right"}}>{10+i}</span></div>)}</div>
    </div>}
    <div style={{textAlign:"center",marginTop:10}}><span style={{fontSize:40,fontWeight:900,color:vpc(s.vpT,t)}}>{s.sT}</span><span style={{fontSize:20,fontWeight:900,marginLeft:3,color:t.tx2}}>{fvp(s.vpT)}</span></div>
    <StatsRow s={s} v={v} t={t} fs={15} gap={8}/><div style={{textAlign:"center"}}><HiChSdLine d={d} v={v} s={s} t={t}/></div>
    {v.position&&d.position&&<div style={{textAlign:"center",fontSize:11,color:t.tx4,marginTop:2}}>{d.position}º</div>}
  </div>;
}

/* 12. Instagram */
function D12({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  return <div style={{padding:"20px 12px",fontFamily:"'DM Sans',sans-serif",color:t.tx,width:180}}>
    <div style={{textAlign:"center",marginBottom:14}}>
      {(v.event||v.round)&&<div style={{fontSize:12,fontWeight:900,color:t.tx3}}>{v.event&&d.event.toUpperCase()}{v.round&&` · R${d.round}`}</div>}
      {v.player&&d.player&&<div style={{fontSize:14,fontWeight:900,marginTop:3}}>{d.player}</div>}
      <SubLine d={d} v={{...v,event:false,round:false,player:false}} t={t}/></div>
    {v.holeScores&&d.scores.map((sc,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3px 6px",borderBottom:i===8?`2px solid ${t.div}`:`1px solid ${t.div2}`}}>
      <span style={{fontSize:12,color:t.tx4,width:16}}>{i+1}</span>{v.holeSI&&<span style={{fontSize:11,color:t.tx4,width:16,textAlign:"center"}}>{d.si[i]}</span>}{v.holePar&&<span style={{fontSize:12,color:t.tx3,width:16,textAlign:"center"}}>{d.par[i]}</span>}<SC score={sc} par={d.par[i]} size={22} fs={11} t={t}/></div>)}
    <div style={{textAlign:"center",marginTop:12}}><div style={{fontSize:36,fontWeight:900}}>{s.sT}</div><div style={{fontSize:17,fontWeight:900,color:vpc(s.vpT,t)}}>{fvp(s.vpT)}</div></div>
    <StatsRow s={s} v={v} t={t} fs={13} gap={6}/><div style={{textAlign:"center"}}><HiChSdLine d={d} v={v} s={s} t={t}/></div>
    {v.position&&d.position&&<div style={{textAlign:"center",fontSize:11,color:t.tx4,marginTop:2}}>{d.position}º</div>}
  </div>;
}

/* 13. Vertical */
function D13({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  return <div style={{padding:"14px 10px",fontFamily:"'JetBrains Mono',monospace",color:t.tx,width:v.holeSI?230:210}}>
    <div style={{textAlign:"center",marginBottom:8}}>{v.player&&d.player&&<div style={{fontSize:15,fontWeight:900}}>{d.player}</div>}{(v.event||v.round)&&<div style={{fontSize:12,color:t.tx3,fontWeight:700}}>{v.event&&d.event}{v.round&&` R${d.round}`}</div>}<SubLine d={d} v={{...v,event:false,round:false,player:false}} t={t}/></div>
    {v.holeScores&&<><div style={{display:"flex",padding:"2px 0",borderBottom:`1px solid ${t.div}`}}>
      <div style={{width:18,fontSize:11,color:t.tx4,fontWeight:800}}>H</div>{v.holeSI&&<div style={{width:18,fontSize:11,color:t.tx4,fontWeight:800,textAlign:"center"}}>SI</div>}{v.holePar&&<div style={{width:18,fontSize:11,color:t.tx4,fontWeight:800,textAlign:"center"}}>P</div>}<div style={{flex:1,fontSize:11,color:t.tx4,fontWeight:800,textAlign:"center"}}>Sc</div><div style={{width:24,fontSize:11,color:t.tx4,fontWeight:800,textAlign:"right"}}>±</div></div>
    {d.scores.map((sc,i)=>{const x=sc-d.par[i];return <div key={i} style={{display:"flex",alignItems:"center",padding:"2px 0",borderBottom:i===8?`2px solid ${t.div}`:`1px solid ${t.div2}`}}>
      <div style={{width:18,fontSize:12,color:t.tx4,fontWeight:700}}>{i+1}</div>{v.holeSI&&<div style={{width:18,fontSize:12,color:t.tx4,textAlign:"center"}}>{d.si[i]}</div>}{v.holePar&&<div style={{width:18,fontSize:12,color:t.tx3,textAlign:"center"}}>{d.par[i]}</div>}
      <div style={{flex:1,display:"flex",justifyContent:"center"}}><SC score={sc} par={d.par[i]} size={22} fs={11} t={t}/></div>
      <div style={{width:24,fontSize:12,fontWeight:700,textAlign:"right",color:vpc(x,t)}}>{x===0?"·":x>0?`+${x}`:x}</div></div>;})}</>}
    <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}><span style={{fontSize:12,color:t.tx3,fontWeight:700}}>Par {s.pT}</span><span style={{fontSize:20,fontWeight:900}}>{s.sT}</span><span style={{fontSize:15,fontWeight:900,color:vpc(s.vpT,t)}}>{fvp(s.vpT)}</span></div>
    <StatsRow s={s} v={v} t={t} fs={13} gap={6}/><div style={{textAlign:"center"}}><HiChSdLine d={d} v={v} s={s} t={t}/></div>
    {v.position&&d.position&&<div style={{textAlign:"center",fontSize:11,color:t.tx4,marginTop:2}}>{d.position}º</div>}
  </div>;
}

/* 14. Poster */
function D14({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  return <div style={{padding:"24px 22px",fontFamily:"'DM Sans',sans-serif",color:t.tx,width:250,textAlign:"center"}}>
    {(v.event||v.round)&&<div style={{fontSize:12,fontWeight:900,color:t.tx3,letterSpacing:"2px"}}>{v.event&&d.event.toUpperCase()}{v.round&&` · R${d.round}`}</div>}
    {v.position&&d.position&&<div style={{fontSize:12,color:t.tx3,marginTop:2}}>{d.position}º lugar</div>}
    <div style={{fontSize:80,fontWeight:900,lineHeight:0.9,marginTop:6,letterSpacing:"-5px"}}>{s.sT}</div>
    <div style={{fontSize:28,fontWeight:900,color:vpc(s.vpT,t),marginTop:2}}>{fvp(s.vpT)}</div>
    <div style={{height:2,background:t.div,margin:"12px 30px"}}/>
    {v.player&&d.player&&<div style={{fontSize:18,fontWeight:900}}>{d.player}</div>}
    <SubLine d={d} v={{...v,player:false}} t={t}/>
    <StatsRow s={s} v={v} t={t} fs={20} gap={14}/><HiChSdLine d={d} v={v} s={s} t={t}/>
  </div>;
}

/* 15. Colunas */
function D15({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  const Col=({label,scores,pars,sis,start,tot,pt}:{label:string;scores:number[];pars:number[];sis:number[];start:number;tot:number;pt:number})=><div>
    <div style={{fontSize:12,fontWeight:900,color:t.tx3,textAlign:"center",marginBottom:4}}>{label}</div>
    {v.holeScores&&scores.map((sc,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:3,padding:"1px 0"}}>
      <span style={{fontSize:11,color:t.tx4,width:14,textAlign:"right"}}>{start+i}</span>{v.holeSI&&<span style={{fontSize:11,color:t.tx4,fontWeight:800,width:14}}>{sis[i]}</span>}{v.holePar&&<span style={{fontSize:11,color:t.tx3,width:14}}>{pars[i]}</span>}<SC score={sc} par={pars[i]} size={22} fs={11} t={t}/></div>)}
    <div style={{textAlign:"center",marginTop:4}}><span style={{fontSize:17,fontWeight:900}}>{tot}</span><span style={{fontSize:12,fontWeight:700,marginLeft:2,color:vpc(tot-pt,t)}}>{fvp(tot-pt)}</span></div></div>;
  return <div style={{padding:"14px 12px",fontFamily:"'DM Sans',sans-serif",color:t.tx,width:v.holeSI?240:220}}>
    <div style={{textAlign:"center",marginBottom:10}}>{v.player&&d.player&&<div style={{fontSize:14,fontWeight:900}}>{d.player}</div>}{(v.event||v.round)&&<div style={{fontSize:12,color:t.tx3,fontWeight:700}}>{v.event&&d.event}{v.round&&` R${d.round}`}</div>}<SubLine d={d} v={{...v,event:false,round:false,player:false}} t={t}/></div>
    <div style={{display:"flex",gap:10,justifyContent:"center"}}>
      <Col label="OUT" scores={d.scores.slice(0,9)} pars={d.par.slice(0,9)} sis={d.si.slice(0,9)} start={1} tot={s.sF} pt={s.pF}/>
      <div style={{width:1,background:t.div2}}/><Col label="IN" scores={d.scores.slice(9)} pars={d.par.slice(9)} sis={d.si.slice(9)} start={10} tot={s.sB} pt={s.pB}/></div>
    <div style={{textAlign:"center",marginTop:10}}><span style={{fontSize:30,fontWeight:900}}>{s.sT}</span><span style={{fontSize:17,fontWeight:800,marginLeft:4,color:vpc(s.vpT,t)}}>{fvp(s.vpT)}</span></div>
    <StatsRow s={s} v={v} t={t} fs={13} gap={8}/><div style={{textAlign:"center"}}><HiChSdLine d={d} v={v} s={s} t={t}/></div>
    {v.position&&d.position&&<div style={{textAlign:"center",fontSize:11,color:t.tx4,marginTop:2}}>{d.position}º</div>}
  </div>;
}

/* 16. Mini */
function D16({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  return <div style={{padding:"14px 10px",fontFamily:"'JetBrains Mono',monospace",color:t.tx,width:180}}>
    <div style={{textAlign:"center",marginBottom:8}}>{v.player&&d.player&&<div style={{fontSize:13,fontWeight:900}}>{d.player}</div>}{(v.event||v.round)&&<div style={{fontSize:11,color:t.tx3}}>{v.event&&d.event}{v.round&&` R${d.round}`}</div>}</div>
    {v.holeScores&&<><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:3,justifyItems:"center"}}>{d.scores.slice(0,9).map((sc,i)=><div key={i}><div style={{fontSize:10,color:t.tx4,fontWeight:700,textAlign:"center"}}>{i+1}</div><SC score={sc} par={d.par[i]} size={28} fs={12} t={t}/></div>)}</div>
    <div style={{height:1,background:t.div2,margin:"4px 0"}}/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:3,justifyItems:"center"}}>{d.scores.slice(9).map((sc,i)=><div key={i}><div style={{fontSize:10,color:t.tx4,fontWeight:700,textAlign:"center"}}>{10+i}</div><SC score={sc} par={d.par[9+i]} size={28} fs={12} t={t}/></div>)}</div></>}
    <div style={{textAlign:"center",marginTop:8}}><span style={{fontSize:30,fontWeight:900}}>{s.sT}</span><span style={{fontSize:17,fontWeight:800,marginLeft:3,color:vpc(s.vpT,t)}}>{fvp(s.vpT)}</span></div>
    <StatsRow s={s} v={v} t={t} fs={13} gap={6}/><SubLine d={d} v={v} t={t}/><div style={{textAlign:"center"}}><HiChSdLine d={d} v={v} s={s} t={t}/></div>
    {v.position&&d.position&&<div style={{textAlign:"center",fontSize:11,color:t.tx4,marginTop:2}}>{d.position}º</div>}
  </div>;
}

/* 17. Números */
function D17({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  const R=({val,l,c,big}:{val:string|number;l:string;c?:string;big?:boolean})=><div style={{display:"flex",alignItems:"center",gap:8,padding:big?"8px 0":"4px 0",borderBottom:`1px solid ${t.div2}`}}>
    <div style={{fontSize:big?34:22,fontWeight:900,color:c||t.tx,width:50,textAlign:"right"}}>{val}</div><div style={{fontSize:big?11:10,color:t.tx3,fontWeight:700}}>{l}</div></div>;
  return <div style={{padding:"18px 14px",fontFamily:"'DM Sans',sans-serif",color:t.tx,width:200}}>
    <div style={{textAlign:"center",marginBottom:12}}>{v.player&&d.player&&<div style={{fontSize:15,fontWeight:900}}>{d.player}</div>}{(v.event||v.round)&&<div style={{fontSize:12,color:t.tx3,fontWeight:700}}>{v.event&&d.event}{v.round&&` R${d.round}`}</div>}<SubLine d={d} v={{...v,event:false,round:false,player:false}} t={t}/></div>
    <R val={s.sT} l="RESULTADO" big/><R val={fvp(s.vpT)} l="VS PAR" c={vpc(s.vpT,t)} big/>
    {v.stats&&<><R val={s.st.birdies} l="BIRDIES" c="#dc2626"/><R val={s.st.pars} l="PARS" c={t.dim}/><R val={s.st.bogeys+s.st.doubles+s.st.triples} l="BOGEY+" c="#5BADE6"/></>}
    {v.sd&&<R val={s.sd.toFixed(1)} l="SD"/>}{v.hiCh&&d.hi!==null&&<><R val={d.hi.toFixed(1)} l="HI"/>{d.courseHcp!==null&&<R val={d.courseHcp} l="COURSE HCP"/>}</>}
    {v.position&&d.position&&<R val={`${d.position}º`} l="POSIÇÃO"/>}
  </div>;
}

/* 18. Elegante */
function D18({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  return <div style={{padding:"20px 18px",fontFamily:"'DM Sans',sans-serif",color:t.tx,width:180}}>
    {(v.event||v.round)&&<div style={{fontSize:11,color:t.tx4,letterSpacing:"1px"}}>{v.event&&d.event}{v.round&&` · R${d.round}`}</div>}
    {v.date&&d.date&&<div style={{fontSize:11,color:t.tx4,marginTop:2}}>{d.date}</div>}
    {v.player&&d.player&&<div style={{fontSize:15,fontWeight:900,marginTop:4}}>{d.player}</div>}
    {v.course&&d.course&&<div style={{fontSize:12,color:t.tx3,marginTop:1}}>{d.course}{v.tee&&d.tee&&` · ${d.tee}`}{v.teeDist&&d.teeDist&&` · ${d.teeDist}m`}</div>}
    <div style={{marginTop:14}}><div style={{fontSize:52,fontWeight:900,lineHeight:1}}>{s.sT}</div><div style={{fontSize:22,fontWeight:900,color:vpc(s.vpT,t),marginTop:2}}>{fvp(s.vpT)}</div></div>
    {v.stats&&<div style={{marginTop:14,display:"flex",flexDirection:"column",gap:3}}>
      {[{n:s.st.birdies,l:"Birdies",c:"#dc2626"},{n:s.st.pars,l:"Pars",c:t.dim},{n:s.st.bogeys,l:"Bogeys",c:"#5BADE6"},{n:s.st.doubles+s.st.triples,l:"Doubles+",c:"#2B6EA0"}].filter(x=>x.n>0).map(x=>
        <div key={x.l} style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:3,height:14,background:x.c}}/><span style={{fontSize:20,fontWeight:900,color:x.c}}>{x.n}</span><span style={{fontSize:12,color:t.tx3,fontWeight:700}}>{x.l}</span></div>)}</div>}
    <HiChSdLine d={d} v={v} s={s} t={t}/>
    {v.position&&d.position&&<div style={{fontSize:11,color:t.tx4,marginTop:4}}>{d.position}º</div>}
  </div>;
}

/* 19. Talão */
function D19({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  return <div style={{padding:"12px 10px",fontFamily:"'JetBrains Mono',monospace",color:t.tx,width:170}}>
    <div style={{textAlign:"center",fontSize:11,color:t.tx3,letterSpacing:"0.5px",paddingBottom:6,borderBottom:`1px dashed ${t.dash}`}}>
      {v.event&&d.event&&<div>{d.event}{v.round&&` R${d.round}`}</div>}{v.course&&d.course&&<div>{d.course.toUpperCase()}</div>}{v.date&&d.date&&<div>{d.date}</div>}</div>
    {v.player&&d.player&&<div style={{textAlign:"center",fontSize:12,fontWeight:800,padding:"4px 0",borderBottom:`1px dashed ${t.dash}`}}>{d.player}</div>}
    {v.holeScores&&<div style={{padding:"4px 0"}}>{d.scores.map((sc,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"1px 2px",fontSize:13,borderBottom:i===8?`1px dashed ${t.dash}`:"none"}}>
      <span style={{color:t.tx4,width:14,fontWeight:700}}>{i+1}</span>{v.holeSI&&<span style={{color:t.tx4,width:14,fontSize:11}}>{d.si[i]}</span>}{v.holePar&&<span style={{color:t.tx3,width:14,fontWeight:700}}>{d.par[i]}</span>}
      <SC score={sc} par={d.par[i]} size={22} fs={10} t={t}/><span style={{fontSize:11,color:vpc(sc-d.par[i],t),fontWeight:700,width:18,textAlign:"right"}}>{(sc-d.par[i])===0?"·":(sc-d.par[i])>0?`+${sc-d.par[i]}`:sc-d.par[i]}</span></div>)}</div>}
    <div style={{borderTop:`1px dashed ${t.dash}`,paddingTop:6,textAlign:"center"}}><div style={{fontSize:26,fontWeight:900}}>{s.sT}</div><div style={{fontSize:15,fontWeight:800,color:vpc(s.vpT,t)}}>{fvp(s.vpT)}</div></div>
    <StatsRow s={s} v={v} t={t} fs={11} gap={6}/><div style={{textAlign:"center"}}><HiChSdLine d={d} v={v} s={s} t={t} fs={9}/></div>
    {v.position&&d.position&&<div style={{borderTop:`1px dashed ${t.dash}`,marginTop:4,paddingTop:4,textAlign:"center",fontSize:12,color:t.tx4,fontWeight:700}}>{d.position}º</div>}
  </div>;
}

/* 20. Torneio */
function D20({d,v,s,t}:{d:DD;v:Vis;s:Stats;t:Theme}){
  return <div style={{padding:"16px 14px",fontFamily:"'DM Sans',sans-serif",color:t.tx,width:240}}>
    {(v.event||v.course)&&<div style={{background:t.greenBg2,borderRadius:6,padding:"6px 10px",textAlign:"center",marginBottom:10}}>
      {(v.event||v.round)&&<div style={{fontSize:12,fontWeight:800,letterSpacing:"1px",color:t.tx2}}>{v.event&&d.event.toUpperCase()}{v.round&&` · R${d.round}`}</div>}
      <SubLine d={d} v={{...v,event:false,round:false}} t={t}/></div>}
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
      {v.position&&d.position&&<div style={{width:36,height:36,borderRadius:"50%",border:`2px solid ${t.posBd}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,flexShrink:0}}>{d.position}º</div>}
      <div>{v.player&&d.player&&<div style={{fontSize:18,fontWeight:900}}>{d.player}</div>}{v.hiCh&&d.hi!==null&&<div style={{fontSize:12,color:t.tx3,fontWeight:700}}>HI {d.hi.toFixed(1)} · CH {d.courseHcp}</div>}</div></div>
    <div style={{display:"flex",justifyContent:"space-around",padding:"8px 0",background:t.cardBg,borderRadius:6,marginBottom:8}}>
      <div style={{textAlign:"center"}}><div style={{fontSize:26,fontWeight:900}}>{s.sT}</div><div style={{fontSize:11,color:t.tx4,fontWeight:800}}>SCORE</div></div>
      <div style={{textAlign:"center"}}><div style={{fontSize:26,fontWeight:900,color:vpc(s.vpT,t)}}>{fvp(s.vpT)}</div><div style={{fontSize:11,color:t.tx4,fontWeight:800}}>VS PAR</div></div>
      {v.sd&&<div style={{textAlign:"center"}}><div style={{fontSize:26,fontWeight:900}}>{s.sd.toFixed(1)}</div><div style={{fontSize:11,color:t.tx4,fontWeight:800}}>SD</div></div>}</div>
    {v.holeScores&&<div style={{display:"flex",gap:1,justifyContent:"center",flexWrap:"wrap"}}>{d.scores.map((sc,i)=><SC key={i} score={sc} par={d.par[i]} size={20} fs={9} t={t}/>)}</div>}
    <StatsRow s={s} v={v} t={t} fs={13} gap={6}/>
  </div>;
}

/* ═══════ DESIGN REGISTRY ═══════ */
type DesignDef = { id:string; label:string; C:React.FC<{d:DD;v:Vis;s:Stats;t:Theme}>; needsHoles:boolean };
const DESIGNS: DesignDef[] = [
  {id:"d1",label:"Cartão Clássico",C:D1,needsHoles:true},{id:"d2",label:"Scorecard Pro",C:D2,needsHoles:true},
  {id:"d3",label:"Resumo",C:D3,needsHoles:false},{id:"d4",label:"Dots",C:D4,needsHoles:true},
  {id:"d5",label:"Medalha",C:D5,needsHoles:false},{id:"d6",label:"Faixa",C:D6,needsHoles:false},
  {id:"d7",label:"Painel",C:D7,needsHoles:false},{id:"d8",label:"Pódio",C:D8,needsHoles:false},
  {id:"d9",label:"Grelha",C:D9,needsHoles:true},{id:"d10",label:"Clean",C:D10,needsHoles:false},
  {id:"d11",label:"Dual",C:D11,needsHoles:true},{id:"d12",label:"Instagram",C:D12,needsHoles:true},
  {id:"d13",label:"Vertical",C:D13,needsHoles:true},{id:"d14",label:"Poster",C:D14,needsHoles:false},
  {id:"d15",label:"Colunas",C:D15,needsHoles:true},{id:"d16",label:"Mini",C:D16,needsHoles:true},
  {id:"d17",label:"Números",C:D17,needsHoles:false},{id:"d18",label:"Elegante",C:D18,needsHoles:false},
  {id:"d19",label:"Talão",C:D19,needsHoles:true},{id:"d20",label:"Torneio",C:D20,needsHoles:false},
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

/* ═══════ MAIN COMPONENT ═══════ */
export default function OverlayExport({data}:{data:OverlayData}){
  const [player,setPlayer]=useState("");
  const [event,setEvent]=useState("");
  const [round,setRound]=useState(1);
  const [date,setDate]=useState(()=>{const n=new Date();const m=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];return`${n.getDate()} ${m[n.getMonth()]} ${n.getFullYear()}`;});
  const [position,setPosition]=useState("");

  const [vis,setVis]=useState<Vis>(defaultVis);
  const [theme,setTheme]=useState<"white"|"black">("black");
  const [bgMode,setBgMode]=useState<"transparent"|"white"|"black">("transparent");
  const [bgAlpha,setBgAlpha]=useState(100);
  const [exporting,setExporting]=useState(false);
  const [collapsed,setCollapsed]=useState(true);
  const designRefs=useRef<Record<string,HTMLDivElement|null>>({});

  const t=useMemo(()=>mkTheme(theme),[theme]);

  // Build scores: replace nulls with par (placeholder)
  const allFilled=data.scores.length>0&&data.scores.every(s=>s!==null);
  const filledScores:number[]=data.scores.map((s,i)=>s!==null?s:data.par[i]??4);

  const dd:DD=useMemo(()=>({
    player,event,round,date,position,
    course:data.courseName,tee:data.teeName,teeDist:data.teeDist,
    cr:data.cr,slope:data.slope,
    par:data.par,scores:filledScores,si:data.si,
    hi:data.hi,courseHcp:data.courseHcp,sd:data.sd,
    is9h:data.is9h,hasHoles:data.hasHoles,
  }),[data,player,event,round,date,position,filledScores]);

  const stats=useMemo(()=>calcStats(dd),[dd]);

  const toggle=(key:string)=>setVis(prev=>({...prev,[key]:!prev[key]}));

  // Available designs: filter by hasHoles
  const available=DESIGNS.filter(x=>!x.needsHoles||data.hasHoles);

  // Background for preview
  const checkerBg:React.CSSProperties={
    backgroundImage:"linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)",
    backgroundSize:"12px 12px",backgroundPosition:"0 0,0 6px,6px -6px,-6px 0px",backgroundColor:"#fff"};
  const alpha=bgAlpha/100;
  const overlayBg:React.CSSProperties=bgMode==="transparent"?checkerBg:bgMode==="white"?{background:`rgba(255,255,255,${alpha})`}:{background:`rgba(0,0,0,${alpha})`};

  const bgColorForExport=bgMode==="transparent"?null:bgMode==="white"?`rgba(255,255,255,${alpha})`:`rgba(0,0,0,${alpha})`;

  /* Export all — individual PNGs sequentially */
  const doExportAll=useCallback(async()=>{
    setExporting(true);
    try{
      const h2c=(await import("html2canvas")).default;
      for(let idx=0;idx<available.length;idx++){
        const design=available[idx];
        const el=designRefs.current[design.id];
        if(!el)continue;
        const canvas=await h2c(el,{backgroundColor:bgColorForExport,scale:3,useCORS:true,logging:false});
        const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,"image/png"));
        if(!blob)continue;
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");a.href=url;a.download=`${design.label}.png`;a.click();
        URL.revokeObjectURL(url);
        // Small delay between downloads so browser doesn't block them
        if(idx<available.length-1)await new Promise(r=>setTimeout(r,300));
      }
    }catch(err){console.error(err);alert("Erro ao exportar. Verifica: npm install html2canvas");}
    finally{setExporting(false);}
  },[available,bgColorForExport]);

  /* Export individual */
  const doExportOne=useCallback(async(designId:string)=>{
    const el=designRefs.current[designId];if(!el)return;
    try{
      const h2c=(await import("html2canvas")).default;
      const canvas=await h2c(el,{backgroundColor:bgColorForExport,scale:3,useCORS:true,logging:false});
      canvas.toBlob(async(blob:Blob|null)=>{
        if(!blob)return;
        const file=new File([blob],`scorecard-${designId}.png`,{type:"image/png"});
        if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:"Scorecard"});return;}catch{}}
        const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=file.name;a.click();URL.revokeObjectURL(url);
      },"image/png");
    }catch(err){console.error(err);alert("Erro ao exportar");}
  },[bgColorForExport]);

  return <div className="ov-export">
    <div className="ov-header" onClick={()=>setCollapsed(!collapsed)}>
      <h3 className="sim-section-title" style={{margin:0,cursor:"pointer",userSelect:"none"}}>
        📷 Partilhar Scorecard <span style={{fontSize:13,fontWeight:600,marginLeft:8,color:"#888"}}>{collapsed?"▸ expandir":"▾"}</span>
      </h3>
      {!allFilled&&!collapsed&&<div style={{fontSize:13,fontWeight:700,color:"#b45309",marginTop:4}}>⚠ Preenche todos os buracos para scores exactos. A pré-visualização usa o Par como placeholder.</div>}
    </div>

    {!collapsed&&<>
      {/* Manual fields */}
      <div className="ov-fields">
        <div className="ov-field"><label>Jogador</label><input type="text" value={player} onChange={e=>setPlayer(e.target.value)} placeholder="Nome" className="input" style={{width:130}}/></div>
        <div className="ov-field"><label>Torneio</label><input type="text" value={event} onChange={e=>setEvent(e.target.value)} placeholder="Evento" className="input" style={{width:150}}/></div>
        <div className="ov-field"><label>R</label><input type="number" value={round} min={1} max={9} onChange={e=>setRound(Number(e.target.value))} className="input" style={{width:48}}/></div>
        <div className="ov-field"><label>Data</label><input type="text" value={date} onChange={e=>setDate(e.target.value)} className="input" style={{width:110}}/></div>
        <div className="ov-field"><label>Pos.</label><input type="text" value={position} onChange={e=>setPosition(e.target.value)} placeholder="–" className="input" style={{width:44}}/></div>
      </div>

      {/* Theme + Background + Opacity */}
      <div className="ov-options">
        <div className="ov-opt-group">
          <span className="ov-opt-label">Tema</span>
          <button className={`ov-opt-btn${theme==="white"?" active":""}`} onClick={()=>setTheme("white")}>☀ Claro</button>
          <button className={`ov-opt-btn${theme==="black"?" active":""}`} onClick={()=>setTheme("black")}>🌙 Escuro</button>
        </div>
        <div className="ov-opt-group">
          <span className="ov-opt-label">Fundo</span>
          <button className={`ov-opt-btn${bgMode==="transparent"?" active":""}`} onClick={()=>setBgMode("transparent")}>Transparente</button>
          <button className={`ov-opt-btn${bgMode==="white"?" active":""}`} onClick={()=>setBgMode("white")}>Branco</button>
          <button className={`ov-opt-btn${bgMode==="black"?" active":""}`} onClick={()=>setBgMode("black")}>Preto</button>
        </div>
        {bgMode!=="transparent"&&<div className="ov-opt-group">
          <span className="ov-opt-label">Opacidade</span>
          <input type="range" min={0} max={100} value={bgAlpha} onChange={e=>setBgAlpha(parseInt(e.target.value))} style={{width:100,accentColor:"#2e7d32"}}/>
          <span style={{fontSize:13,color:"#888",minWidth:30}}>{bgAlpha}%</span>
        </div>}
      </div>

      {/* Toggles */}
      <div className="ov-toggles">
        {TOGGLES.map(tt=><label key={tt.key} className="ov-toggle"><input type="checkbox" checked={vis[tt.key]} onChange={()=>toggle(tt.key)}/><span>{tt.label}</span></label>)}
      </div>

      {/* Export All button */}
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <button className="ov-export-btn" onClick={doExportAll} disabled={exporting}>
          {exporting?"A exportar…":`📷 Descarregar Todos (${available.length} PNGs)`}
        </button>
      </div>

      {/* Gallery */}
      <div className="ov-gallery">
        {available.map(x=><div key={x.id} className="ov-card">
          <div className="ov-card-header">
            <span className="ov-card-label">{x.label}</span>
            <button className="ov-share-btn" onClick={()=>doExportOne(x.id)} title="Partilhar / Descarregar">📤</button>
          </div>
          <div className="ov-card-preview" style={overlayBg}>
            <div ref={el=>{designRefs.current[x.id]=el;}} style={{display:"inline-block"}}>
              <x.C d={dd} v={vis} s={stats} t={t}/>
            </div>
          </div>
        </div>)}
      </div>
    </>}
  </div>;
}
