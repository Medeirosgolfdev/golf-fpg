/*
 * Designs TRANS — overlays transparentes para fotos.
 * V39 Outline Branco, V41 Hero Score, V42 Glass Panel, V43 Accent Strip.
 */
import React from "react";
import { II, OS, LO, BN, SG, vpC } from "../shared";
import { SC, SCL, SCO } from "../badges";
import { fmtToPar } from "../../../utils/format";
import type { P } from "../types";

/* V39 · OUTLINE BRANCO — SCO (contornos brancos), score ENORME à direita. */
export function V39({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg, padding:"10px 6px 6px" }}>
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
          {/* Score sozinho na coluna; -1 sai como badge absolute para alturas casarem. */}
          <div style={{ flexShrink:0, marginLeft:8, position:"relative", display:"inline-block" }}>
            <div style={{ fontFamily:BN, fontSize:120, lineHeight:.9, letterSpacing:-4, color:tc }}>{s.sT}</div>
            <div style={{ fontFamily:SG, fontSize:16, fontWeight:700, color:tc3, position:"absolute", right:0, bottom:-10, letterSpacing:1 }}>{fmtToPar(s.vpT)}</div>
          </div>
        </div>
      )}
      {!v.holeScores && (
        <div style={{ textAlign:"center" }}>
          <div style={{ fontFamily:BN, fontSize:120, lineHeight:.9, letterSpacing:-4, color:tc }}>{s.sT}</div>
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
export function V41({ d, v, s, bg, tc="white", tc3 }: P) {
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg, padding:"14px 6px 6px" }}>
      <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
        <div style={{ fontFamily:BN, fontSize:140, lineHeight:.9, letterSpacing:-5, color:tc }}>{s.sT}</div>
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
export function V42({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const isDark = tc === "#ffffff" || tc === "white";
  const accent = s.vpT < 0 ? "#dc2626" : "#1e40af";
  const bgF = bg || (isDark ? "rgba(20,20,30,.88)" : "rgba(255,255,255,.88)");
  const tx = isDark ? "#eee" : "#222";
  return (
    <div style={{ fontFamily:SG, display:"inline-block", background:bgF, color:tx, borderRadius:10, padding:"10px 14px" }}>
      <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
        <span style={{ fontFamily:BN, fontSize:80, lineHeight:.9, letterSpacing:-3, color:accent }}>{s.sT}</span>
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
export function V43({ d, v, s, bg, tc="white", tc3 }: P) {
  const accent = s.vpT < 0 ? "#dc2626" : s.vpT === 0 ? (tc === "#ffffff" || tc === "white" ? "#fff" : "#222") : "#3b82f6";
  return (
    <div style={{ fontFamily:II, display:"inline-flex", alignItems:"stretch", color:tc, background:bg, padding:"10px 4px 4px" }}>
      <div style={{ width:4, background:accent, borderRadius:2, marginRight:8, flexShrink:0 }} />
      <div>
        <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
          <span style={{ fontFamily:BN, fontSize:100, lineHeight:.9, letterSpacing:-4, color:tc }}>{s.sT}</span>
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
