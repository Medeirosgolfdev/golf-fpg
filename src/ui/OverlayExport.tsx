import React, { useState, useMemo, useRef, useCallback } from "react";

/* ═══════ TYPES ═══════ */
export type OverlayData = {
  courseName: string;
  teeName: string;
  teeDist: number | null;
  cr: number;
  slope: number;
  par: number[];
  scores: number[];
  si: number[];
  hi: number | null;
  courseHcp: number | null;
  sd: number | null;
  is9h: boolean;
  /* defaults — ignored internally, manual fields are local state */
  player: string;
  event: string;
  round: number;
  date: string;
  position: string;
};

/** Internal data shape passed to designs */
type DD = {
  player: string; event: string; round: number; date: string; position: string;
  courseName: string; teeName: string; teeDist: number | null;
  cr: number; slope: number;
  par: number[]; scores: number[]; si: number[];
  hi: number | null; courseHcp: number | null; sd: number | null;
  is9h: boolean;
};

type Vis = Record<string, boolean>;
type Theme = {
  tx: string; tx2: string; tx3: string; tx4: string;
  div: string; div2: string; cardBg: string; cardBd: string;
  greenBg: string; greenBg2: string; parC: string; parBd: string;
  dash: string; posBd: string; dim: string;
};

/* ═══════ THEMES ═══════ */
function mkTheme(mode: "white" | "black"): Theme {
  const L = mode === "white";
  return {
    tx: L ? "#000" : "#fff", tx2: L ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)",
    tx3: L ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)", tx4: L ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.3)",
    div: L ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.15)", div2: L ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)",
    cardBg: L ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)", cardBd: L ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.08)",
    greenBg: L ? "rgba(45,106,48,0.15)" : "rgba(45,106,48,0.6)", greenBg2: L ? "rgba(45,106,48,0.1)" : "rgba(45,106,48,0.35)",
    parC: L ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.65)", parBd: L ? "2px solid rgba(0,0,0,0.15)" : "2px solid rgba(255,255,255,0.12)",
    dash: L ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.15)", posBd: L ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.25)",
    dim: L ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.6)",
  };
}

/* ═══════ SCORE COLORS (GameBook style) ═══════ */
function sty(score: number, par: number, t: Theme) {
  const d = score - par;
  if (d <= -2) return { c: "#fff", bg: "#d4a017", sh: "circle" as const };
  if (d === -1) return { c: "#fff", bg: "#dc2626", sh: "circle" as const };
  if (d === 0)  return { c: t.tx, bg: "transparent", sh: "none" as const };
  if (d === 1)  return { c: "#fff", bg: "#5BADE6", sh: "sq" as const };
  if (d === 2)  return { c: "#fff", bg: "#2B6EA0", sh: "sq" as const };
  if (d === 3)  return { c: "#fff", bg: "#1B4570", sh: "sq" as const };
  return { c: "#fff", bg: "#0E2A45", sh: "sq" as const };
}

function vpc(d: number, t: Theme) {
  if (d <= -2) return "#d4a017"; if (d === -1) return "#dc2626";
  if (d === 0) return t.tx2; if (d === 1) return "#5BADE6";
  if (d === 2) return "#2B6EA0"; if (d === 3) return "#1B4570";
  return "#0E2A45";
}

const fvp = (v: number) => v === 0 ? "E" : v > 0 ? `+${v}` : `${v}`;

function SC({ score, par, size = 28, fs = 13, t }: { score: number; par: number; size?: number; fs?: number; t: Theme }) {
  const s = sty(score, par, t);
  return (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center",
      borderRadius: s.sh === "circle" ? "50%" : 0, background: s.bg,
      fontSize: fs, fontWeight: 800, color: s.c, lineHeight: 1 }}>
      {score}
    </div>
  );
}

function Leg({ s = 8, t }: { s?: number; t: Theme }) {
  const items = [
    { l: "Eagle", c: "#d4a017", r: true }, { l: "Birdie", c: "#dc2626", r: true },
    { l: "Par", c: t.tx2, r: false }, { l: "Bog", c: "#5BADE6", r: false },
    { l: "Dbl", c: "#2B6EA0", r: false }, { l: "Tri+", c: "#1B4570", r: false },
  ];
  return (
    <div style={{ display: "flex", gap: s > 7 ? 10 : 6, justifyContent: "center", fontWeight: 600, fontSize: s, color: t.tx, marginTop: 6 }}>
      {items.map(it => (
        <div key={it.l} style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <div style={{ width: s + 2, height: s + 2, borderRadius: it.r ? "50%" : 0, background: it.c }} />
          <span>{it.l}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════ STATS ═══════ */
type Stats = { pF: number; pB: number; pT: number; sF: number; sB: number; sT: number; vpT: number; vpF: number; vpB: number; st: { eagles: number; birdies: number; pars: number; bogeys: number; doubles: number; triples: number } };

function useStats(d: DD): Stats {
  return useMemo(() => {
    const n = d.scores.length;
    const is18 = n >= 18;
    const pF = d.par.slice(0, 9).reduce((a, b) => a + b, 0);
    const pB = is18 ? d.par.slice(9).reduce((a, b) => a + b, 0) : 0;
    const pT = is18 ? pF + pB : d.par.reduce((a, b) => a + b, 0);
    const sF = d.scores.slice(0, 9).reduce((a, b) => a + b, 0);
    const sB = is18 ? d.scores.slice(9).reduce((a, b) => a + b, 0) : 0;
    const sT = is18 ? sF + sB : d.scores.reduce((a, b) => a + b, 0);
    const st = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0, triples: 0 };
    d.scores.forEach((s, i) => {
      const x = s - d.par[i];
      if (x <= -2) st.eagles++; else if (x === -1) st.birdies++;
      else if (x === 0) st.pars++; else if (x === 1) st.bogeys++;
      else if (x === 2) st.doubles++; else st.triples++;
    });
    return { pF, pB, pT, sF, sB, sT, vpT: sT - pT, vpF: sF - pF, vpB: is18 ? sB - pB : 0, st };
  }, [d]);
}

/* ═══════ SHARED SUB-COMPONENTS ═══════ */
function SubLine({ d, v, t }: { d: DD; v: Vis; t: Theme }) {
  const parts: string[] = [];
  if (v.course && d.courseName) parts.push(d.courseName);
  if (v.tee && d.teeName) parts.push(d.teeName);
  if (v.teeDist && d.teeDist) parts.push(`${d.teeDist}m`);
  if (v.date && d.date) parts.push(d.date);
  if (!parts.length) return null;
  return <div style={{ fontSize: 9, color: t.tx3, marginTop: 1, fontWeight: 600 }}>{parts.join(" · ")}</div>;
}

function TitleLine({ d, v, t, fs = 14 }: { d: DD; v: Vis; t: Theme; fs?: number }) {
  if (!v.event && !v.round) return null;
  const ev = v.event && d.event ? d.event : "";
  const rn = v.round ? `R${d.round}` : "";
  const sep = ev && rn ? " — " : "";
  if (!ev && !rn) return null;
  return <div style={{ fontSize: fs, fontWeight: 800, color: t.tx }}>{ev}{sep}{rn}</div>;
}

function HiChSdLine({ d, v, t, fs = 9 }: { d: DD; v: Vis; t: Theme; fs?: number }) {
  const parts: string[] = [];
  if (v.hiCh && d.hi !== null) { parts.push(`HI ${d.hi.toFixed(1)}`); if (d.courseHcp !== null) parts.push(`CH ${d.courseHcp}`); }
  if (v.sd && d.sd !== null) parts.push(`SD ${d.sd.toFixed(1)}`);
  if (!parts.length) return null;
  return <div style={{ fontSize: fs, color: t.tx3, marginTop: 3, fontWeight: 600 }}>{parts.join(" · ")}</div>;
}

function StatsRow({ s, v, t, fs = 20, gap = 12 }: { s: Stats; v: Vis; t: Theme; fs?: number; gap?: number }) {
  if (!v.stats) return null;
  const bogP = s.st.bogeys + s.st.doubles + s.st.triples;
  return (
    <div style={{ display: "flex", justifyContent: "center", gap, marginTop: 8 }}>
      {s.st.eagles > 0 && <div style={{ textAlign: "center" }}><div style={{ fontSize: fs, fontWeight: 800, color: "#d4a017", lineHeight: 1 }}>{s.st.eagles}</div><div style={{ fontSize: 8, color: t.tx4, marginTop: 2, fontWeight: 700 }}>EAG</div></div>}
      {s.st.birdies > 0 && <div style={{ textAlign: "center" }}><div style={{ fontSize: fs, fontWeight: 800, color: "#dc2626", lineHeight: 1 }}>{s.st.birdies}</div><div style={{ fontSize: 8, color: t.tx4, marginTop: 2, fontWeight: 700 }}>BIR</div></div>}
      <div style={{ textAlign: "center" }}><div style={{ fontSize: fs, fontWeight: 800, color: t.dim, lineHeight: 1 }}>{s.st.pars}</div><div style={{ fontSize: 8, color: t.tx4, marginTop: 2, fontWeight: 700 }}>PAR</div></div>
      {bogP > 0 && <div style={{ textAlign: "center" }}><div style={{ fontSize: fs, fontWeight: 800, color: "#5BADE6", lineHeight: 1 }}>{bogP}</div><div style={{ fontSize: 8, color: t.tx4, marginTop: 2, fontWeight: 700 }}>BOG+</div></div>}
    </div>
  );
}

/* ═══════ DESIGN 1: GameBook ═══════ */
function D1({ d, v, s, t }: { d: DD; v: Vis; s: Stats; t: Theme }) {
  const is18 = d.scores.length >= 18;
  const HT = ({ pars, scores, sis, start, label }: { pars: number[]; scores: number[]; sis: number[]; start: number; label: string }) => (
    <div style={{ marginBottom: 2 }}>
      <div style={{ display: "flex", background: t.greenBg, borderRadius: "4px 4px 0 0", padding: "2px 0" }}>
        <div style={{ width: 60, padding: "0 4px", color: t.tx, fontWeight: 800, fontSize: 10 }}>Buraco</div>
        {pars.map((_, i) => <div key={i} style={{ width: 30, textAlign: "center", color: t.tx, fontWeight: 700, fontSize: 10 }}>{start + i}</div>)}
        <div style={{ width: 32, textAlign: "center", color: t.tx, fontWeight: 800, fontSize: 10 }}>{label}</div>
      </div>
      {v.holeSI && <div style={{ display: "flex", background: t.cardBg, padding: "2px 0" }}>
        <div style={{ width: 60, padding: "0 4px", color: t.tx3, fontSize: 9 }}>S.I.</div>
        {sis.map((si, i) => <div key={i} style={{ width: 30, textAlign: "center", color: t.tx3, fontSize: 9 }}>{si}</div>)}
        <div style={{ width: 32 }} /></div>}
      {v.holePar && <div style={{ display: "flex", background: t.cardBg, padding: "2px 0" }}>
        <div style={{ width: 60, padding: "0 4px", color: t.tx2, fontSize: 9, fontWeight: 600 }}>Par</div>
        {pars.map((p, i) => <div key={i} style={{ width: 30, textAlign: "center", color: t.tx2, fontSize: 10 }}>{p}</div>)}
        <div style={{ width: 32, textAlign: "center", color: t.tx2, fontWeight: 700 }}>{pars.reduce((a, b) => a + b, 0)}</div>
      </div>}
      {v.holeScores && <div style={{ display: "flex", padding: "3px 0" }}>
        <div style={{ width: 60, padding: "0 4px", fontWeight: 800, fontSize: 10, color: t.tx }}>Score</div>
        {scores.map((sc, i) => <div key={i} style={{ width: 30, display: "flex", justifyContent: "center" }}><SC score={sc} par={pars[i]} size={24} fs={11} t={t} /></div>)}
        <div style={{ width: 32, textAlign: "center", fontWeight: 800, fontSize: 13, color: t.tx }}>{scores.reduce((a, b) => a + b, 0)}</div>
      </div>}
    </div>
  );

  return (
    <div style={{ padding: "14px 10px", fontFamily: "'DM Sans',sans-serif", color: t.tx, width: is18 ? 410 : 350 }}>
      {(v.event || v.course || v.round) && <div style={{ textAlign: "center", marginBottom: 10 }}><TitleLine d={d} v={v} t={t} /><SubLine d={d} v={v} t={t} /></div>}
      {v.player && d.player && <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{d.player}</div>}
      {is18 ? <>
        <HT pars={d.par.slice(0, 9)} scores={d.scores.slice(0, 9)} sis={d.si.slice(0, 9)} start={1} label="Out" />
        <HT pars={d.par.slice(9)} scores={d.scores.slice(9)} sis={d.si.slice(9)} start={10} label="In" />
      </> : <HT pars={d.par} scores={d.scores} sis={d.si} start={1} label="Tot" />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, padding: "0 4px" }}>
        <span style={{ fontSize: 11, color: t.tx3 }}>Par {s.pT}</span>
        <span style={{ fontSize: 16, fontWeight: 900 }}>{s.sT}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: vpc(s.vpT, t) }}>{fvp(s.vpT)}</span>
      </div>
      <StatsRow s={s} v={v} t={t} fs={14} gap={10} />
      <div style={{ textAlign: "center" }}><HiChSdLine d={d} v={v} s={s} t={t} /></div>
      {v.position && d.position && <div style={{ textAlign: "center", fontSize: 8, color: t.tx4, marginTop: 3 }}>Posição: {d.position}º</div>}
      <Leg s={7} t={t} />
    </div>
  );
}

/* ═══════ DESIGN 2: Scorecard Compacto ═══════ */
function D2({ d, v, s, t }: { d: DD; v: Vis; s: Stats; t: Theme }) {
  const is18 = d.scores.length >= 18;
  const R = ({ label, data, isSc, tot, off = 0 }: { label: string; data: number[]; isSc?: boolean; tot: number | string; off?: number }) => (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ width: 36, fontSize: 9, fontWeight: isSc ? 700 : 400, color: isSc ? t.tx : t.tx3, padding: "3px 2px" }}>{label}</div>
      {data.map((val, i) => <div key={i} style={{ width: 26, display: "flex", justifyContent: "center", padding: "2px 0" }}>
        {isSc ? <SC score={val} par={d.par[off + i]} size={22} fs={10} t={t} /> : <span style={{ fontSize: 10, color: t.tx2 }}>{val}</span>}
      </div>)}
      <div style={{ width: 30, textAlign: "center", fontWeight: 800, fontSize: isSc ? 12 : 10, color: isSc ? t.tx : t.tx2 }}>{tot}</div>
    </div>
  );

  return (
    <div style={{ padding: "12px 8px", fontFamily: "'JetBrains Mono',monospace", color: t.tx, width: is18 ? 350 : 320 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8, padding: "0 2px" }}>
        <div>
          {v.player && d.player && <div style={{ fontSize: 12, fontWeight: 800 }}>{d.player}</div>}
          <SubLine d={d} v={v} t={t} />
        </div>
        <div><span style={{ fontSize: 24, fontWeight: 900 }}>{s.sT}</span><span style={{ fontSize: 12, fontWeight: 700, marginLeft: 4, color: vpc(s.vpT, t) }}>{fvp(s.vpT)}</span></div>
      </div>
      {(v.event || v.round) && <div style={{ fontSize: 9, color: t.tx3, marginBottom: 6, textAlign: "center" }}>{v.event && d.event}{v.round && ` R${d.round}`}</div>}
      {(v.holeScores || v.holePar || v.holeSI) && is18 && <>
        <div style={{ display: "flex" }}><div style={{ width: 36 }} />{[1,2,3,4,5,6,7,8,9].map(h => <div key={h} style={{ width: 26, textAlign: "center", fontSize: 8, color: t.tx4, fontWeight: 700 }}>{h}</div>)}<div style={{ width: 30, textAlign: "center", fontSize: 7, color: t.tx3, fontWeight: 700 }}>OUT</div></div>
        {v.holeSI && <R label="SI" data={d.si.slice(0, 9)} tot="" />}
        {v.holePar && <R label="Par" data={d.par.slice(0, 9)} tot={s.pF} />}
        {v.holeScores && <R label="Score" data={d.scores.slice(0, 9)} isSc tot={s.sF} />}
        <div style={{ height: 6 }} />
        <div style={{ display: "flex" }}><div style={{ width: 36 }} />{[10,11,12,13,14,15,16,17,18].map(h => <div key={h} style={{ width: 26, textAlign: "center", fontSize: 8, color: t.tx4, fontWeight: 700 }}>{h}</div>)}<div style={{ width: 30, textAlign: "center", fontSize: 7, color: t.tx3, fontWeight: 700 }}>IN</div></div>
        {v.holeSI && <R label="SI" data={d.si.slice(9)} tot="" off={9} />}
        {v.holePar && <R label="Par" data={d.par.slice(9)} tot={s.pB} off={9} />}
        {v.holeScores && <R label="Score" data={d.scores.slice(9)} isSc tot={s.sB} off={9} />}
      </>}
      {(v.holeScores || v.holePar || v.holeSI) && !is18 && <>
        <div style={{ display: "flex" }}><div style={{ width: 36 }} />{d.par.map((_, i) => <div key={i} style={{ width: 26, textAlign: "center", fontSize: 8, color: t.tx4, fontWeight: 700 }}>{i + 1}</div>)}<div style={{ width: 30, textAlign: "center", fontSize: 7, color: t.tx3, fontWeight: 700 }}>TOT</div></div>
        {v.holeSI && <R label="SI" data={d.si} tot="" />}
        {v.holePar && <R label="Par" data={d.par} tot={s.pT} />}
        {v.holeScores && <R label="Score" data={d.scores} isSc tot={s.sT} />}
      </>}
      <StatsRow s={s} v={v} t={t} fs={12} gap={8} />
      <div style={{ textAlign: "center" }}><HiChSdLine d={d} v={v} s={s} t={t} /></div>
      <Leg s={6} t={t} />
    </div>
  );
}

/* ═══════ DESIGN 3: Resumo ═══════ */
function D3({ d, v, s, t }: { d: DD; v: Vis; s: Stats; t: Theme }) {
  return (
    <div style={{ padding: "18px 22px", fontFamily: "'DM Sans',sans-serif", color: t.tx, width: 200, textAlign: "center" }}>
      {(v.event || v.round) && <div style={{ fontSize: 8, color: t.tx3, marginBottom: 6 }}>{v.event && d.event}{v.round && ` R${d.round}`}</div>}
      <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, letterSpacing: "-3px" }}>{s.sT}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: vpc(s.vpT, t) }}>{fvp(s.vpT)}</div>
      <StatsRow s={s} v={v} t={t} fs={18} gap={10} />
      {(v.player || v.course || v.date) && <div style={{ height: 1, background: t.div, margin: "10px 14px" }} />}
      {v.player && d.player && <div style={{ fontSize: 11, fontWeight: 700 }}>{d.player}</div>}
      <SubLine d={d} v={v} t={t} />
      <HiChSdLine d={d} v={v} s={s} t={t} />
      {v.position && d.position && <div style={{ fontSize: 8, color: t.tx4, marginTop: 3 }}>{d.position}º lugar</div>}
    </div>
  );
}

/* ═══════ DESIGN 4: Dots ═══════ */
function D4({ d, v, s, t }: { d: DD; v: Vis; s: Stats; t: Theme }) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ padding: "14px 12px", fontFamily: "'JetBrains Mono',monospace", color: t.tx, width: is18 ? 330 : 300 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          {v.player && d.player && <div style={{ fontSize: 12, fontWeight: 800 }}>{d.player}</div>}
          {(v.event || v.round) && <div style={{ fontSize: 9, color: t.tx3, fontWeight: 600 }}>{v.event && d.event}{v.round && ` R${d.round}`}</div>}
        </div>
        <div><span style={{ fontSize: 28, fontWeight: 900 }}>{s.sT}</span><span style={{ fontSize: 14, fontWeight: 700, marginLeft: 4, color: vpc(s.vpT, t) }}>{fvp(s.vpT)}</span></div>
      </div>
      {v.holeScores && is18 && [{ l: "OUT", o: 0 }, { l: "IN", o: 9 }].map(h => (
        <div key={h.l} style={{ marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <div style={{ width: 24, fontSize: 9, fontWeight: 800, color: t.tx3, textAlign: "right", paddingRight: 3 }}>{h.l}</div>
            {d.scores.slice(h.o, h.o + 9).map((sc, i) => <SC key={i} score={sc} par={d.par[h.o + i]} size={28} fs={12} t={t} />)}
            <div style={{ width: 30, textAlign: "center", fontWeight: 800, fontSize: 13 }}>{d.scores.slice(h.o, h.o + 9).reduce((a, b) => a + b, 0)}</div>
          </div>
        </div>
      ))}
      {v.holeScores && !is18 && <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 4 }}>
        {d.scores.map((sc, i) => <SC key={i} score={sc} par={d.par[i]} size={28} fs={12} t={t} />)}
        <div style={{ width: 30, textAlign: "center", fontWeight: 800, fontSize: 13 }}>{s.sT}</div>
      </div>}
      <SubLine d={d} v={v} t={t} />
      <StatsRow s={s} v={v} t={t} fs={14} gap={8} />
      <div style={{ textAlign: "center" }}><HiChSdLine d={d} v={v} s={s} t={t} /></div>
      <Leg s={6} t={t} />
    </div>
  );
}

/* ═══════ DESIGN 5: Badge ═══════ */
function D5({ d, v, s, t }: { d: DD; v: Vis; s: Stats; t: Theme }) {
  return (
    <div style={{ padding: "12px 16px", fontFamily: "'DM Sans',sans-serif", color: t.tx, display: "flex", alignItems: "center", gap: 14, width: "auto" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 1 }}>{s.sT}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: vpc(s.vpT, t), marginTop: 2 }}>{fvp(s.vpT)}</div>
      </div>
      <div style={{ width: 1, height: 44, background: t.div }} />
      <div>
        {v.player && d.player && <div style={{ fontSize: 11, fontWeight: 800 }}>{d.player}</div>}
        {(v.event || v.round) && <div style={{ fontSize: 9, color: t.tx3, fontWeight: 600 }}>{v.event && d.event}{v.round && ` R${d.round}`}</div>}
        <SubLine d={d} v={v} t={t} />
        <HiChSdLine d={d} v={v} s={s} t={t} />
      </div>
    </div>
  );
}

/* ═══════ DESIGN REGISTRY ═══════ */
const DESIGNS: { key: string; label: string; C: React.FC<{ d: DD; v: Vis; s: Stats; t: Theme }> }[] = [
  { key: "gamebook", label: "GameBook", C: D1 },
  { key: "scorecard", label: "Scorecard", C: D2 },
  { key: "resumo", label: "Resumo", C: D3 },
  { key: "dots", label: "Dots", C: D4 },
  { key: "badge", label: "Badge", C: D5 },
];

/* ═══════ TOGGLES ═══════ */
const TOGGLES = [
  { key: "player", label: "Jogador" }, { key: "event", label: "Torneio" },
  { key: "course", label: "Campo" }, { key: "round", label: "Round" },
  { key: "date", label: "Data" }, { key: "position", label: "Posição" },
  { key: "holeScores", label: "Scores" }, { key: "holePar", label: "Par" },
  { key: "holeSI", label: "S.I." }, { key: "stats", label: "Estatísticas" },
  { key: "hiCh", label: "HI / CH" }, { key: "sd", label: "SD" },
  { key: "tee", label: "Tee" }, { key: "teeDist", label: "Distância" },
];

const defaultVis = (): Vis => Object.fromEntries(TOGGLES.map(t => [t.key, true]));

/* ═══════ MAIN COMPONENT ═══════ */
export default function OverlayExport({ data }: { data: OverlayData }) {
  /* Manual editable fields */
  const [player, setPlayer] = useState("");
  const [event, setEvent] = useState("");
  const [round, setRound] = useState(1);
  const [date, setDate] = useState(() => {
    const now = new Date();
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  });
  const [position, setPosition] = useState("");

  /* UI state */
  const [design, setDesign] = useState("gamebook");
  const [vis, setVis] = useState<Vis>(defaultVis);
  const [theme, setTheme] = useState<"white" | "black">("black");
  const [bg, setBg] = useState<"transparent" | "white" | "black">("transparent");
  const [exporting, setExporting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const t = useMemo(() => mkTheme(theme), [theme]);

  /* Build combined data for designs */
  const dd: DD = useMemo(() => ({
    ...data, player, event, round, date, position,
  }), [data, player, event, round, date, position]);

  const stats = useStats(dd);

  const toggle = (key: string) => setVis(prev => ({ ...prev, [key]: !prev[key] }));

  const DesignComp = DESIGNS.find(d => d.key === design)?.C ?? D1;

  /* PNG Export */
  const doExport = useCallback(async () => {
    if (!previewRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const bgColor = bg === "transparent" ? null : bg;
      const canvas = await html2canvas(previewRef.current, {
        backgroundColor: bgColor,
        scale: 3,
        useCORS: true,
        logging: false,
      });
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) { alert("Erro ao exportar"); return; }

      // Try Web Share API (mobile)
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], `scorecard-${design}.png`, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: "Scorecard" });
            return;
          } catch { /* user cancelled share, fall through to download */ }
        }
      }

      // Desktop download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scorecard-${design}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
      alert("Erro ao exportar. Verifica se html2canvas está instalado: npm install html2canvas");
    } finally {
      setExporting(false);
    }
  }, [design, bg]);

  return (
    <div className="ov-export">
      <div className="ov-header" onClick={() => setCollapsed(!collapsed)}>
        <h3 className="sim-section-title" style={{ margin: 0, cursor: "pointer", userSelect: "none" }}>
          📷 Partilhar Scorecard
          <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 8, color: "#888" }}>
            {collapsed ? "▸ expandir" : "▾"}
          </span>
        </h3>
      </div>

      {!collapsed && <>
        {/* Design selector */}
        <div className="ov-designs">
          {DESIGNS.map(d => (
            <button key={d.key} className={`ov-design-btn${design === d.key ? " active" : ""}`}
              onClick={() => setDesign(d.key)}>{d.label}</button>
          ))}
        </div>

        {/* Manual fields */}
        <div className="ov-fields">
          <div className="ov-field">
            <label>Jogador</label>
            <input type="text" value={player} onChange={e => setPlayer(e.target.value)}
              placeholder="Nome" className="input" style={{ width: 130 }} />
          </div>
          <div className="ov-field">
            <label>Torneio</label>
            <input type="text" value={event} onChange={e => setEvent(e.target.value)}
              placeholder="Evento" className="input" style={{ width: 150 }} />
          </div>
          <div className="ov-field">
            <label>R</label>
            <input type="number" value={round} min={1} max={9}
              onChange={e => setRound(Number(e.target.value))} className="input" style={{ width: 48 }} />
          </div>
          <div className="ov-field">
            <label>Data</label>
            <input type="text" value={date} onChange={e => setDate(e.target.value)}
              placeholder="Data" className="input" style={{ width: 110 }} />
          </div>
          <div className="ov-field">
            <label>Pos.</label>
            <input type="text" value={position} onChange={e => setPosition(e.target.value)}
              placeholder="–" className="input" style={{ width: 44 }} />
          </div>
        </div>

        {/* Theme + Background */}
        <div className="ov-options">
          <div className="ov-opt-group">
            <span className="ov-opt-label">Tema</span>
            <button className={`ov-opt-btn${theme === "white" ? " active" : ""}`} onClick={() => setTheme("white")}>☀ Claro</button>
            <button className={`ov-opt-btn${theme === "black" ? " active" : ""}`} onClick={() => setTheme("black")}>🌙 Escuro</button>
          </div>
          <div className="ov-opt-group">
            <span className="ov-opt-label">Fundo</span>
            <button className={`ov-opt-btn${bg === "transparent" ? " active" : ""}`} onClick={() => setBg("transparent")}>Transparente</button>
            <button className={`ov-opt-btn${bg === "white" ? " active" : ""}`} onClick={() => setBg("white")}>Branco</button>
            <button className={`ov-opt-btn${bg === "black" ? " active" : ""}`} onClick={() => setBg("black")}>Preto</button>
          </div>
        </div>

        {/* Toggles */}
        <div className="ov-toggles">
          {TOGGLES.map(tt => (
            <label key={tt.key} className="ov-toggle">
              <input type="checkbox" checked={vis[tt.key]} onChange={() => toggle(tt.key)} />
              <span>{tt.label}</span>
            </label>
          ))}
        </div>

        {/* Preview */}
        <div className="ov-preview-wrap" style={{
          background: bg === "transparent"
            ? "repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 0 0 / 16px 16px"
            : bg,
        }}>
          <div ref={previewRef} style={{ display: "inline-block" }}>
            <DesignComp d={dd} v={vis} s={stats} t={t} />
          </div>
        </div>

        {/* Export */}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="ov-export-btn" onClick={doExport} disabled={exporting}>
            {exporting ? "A exportar…" : "📷 Exportar PNG"}
          </button>
        </div>
      </>}
    </div>
  );
}
