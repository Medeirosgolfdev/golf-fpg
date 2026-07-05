/*
 * Designs TRANS — overlays transparentes para fotos.
 * V39 Outline Branco, V41 Hero Score, V42 Glass Panel, V43 Accent Strip.
 */
import { II, OS, LO, BN, SG, vpC, hiChStr } from "../shared";
import { SC, SCL, SCO, StatsRow } from "../badges";
import { fmtToPar } from "../../../utils/format";
import type { P } from "../types";

/* V39 · OUTLINE BRANCO — SCO (contornos brancos), score ENORME à direita. */
export function V39({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const hcl = hiChStr(d, v, s);
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg ?? undefined, padding:"4px 4px" }}>
      {v.holeScores && (
        <div style={{ display:"flex", alignItems:"center" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
            {(is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len],ri) => (
              <div key={off}>
                {ri === 0 && <div style={{ display:"flex", gap:2, marginBottom:1 }}>
                  {Array.from({length:len},(_,i) => <div key={i} style={{ width:28, textAlign:"center", fontSize:8, fontWeight:700, color:tc3 }}>{off+i+1}</div>)}
                </div>}
                <div style={{ display:"flex", gap:2 }}>
                  {d.scores.slice(off,off+len).map((sc,i) => <SCO key={i} sc={sc} par={d.par[off+i]} sz={28} />)}
                </div>
                {ri === 1 && <div style={{ display:"flex", gap:2, marginTop:1 }}>
                  {Array.from({length:len},(_,i) => <div key={i} style={{ width:28, textAlign:"center", fontSize:8, fontWeight:700, color:tc3 }}>{off+i+1}</div>)}
                </div>}
              </div>
            ))}
          </div>
          {/* Score sozinho na coluna; -1 sai como badge absolute para alturas casarem. */}
          <div style={{ flexShrink:0, marginLeft:6, position:"relative", display:"inline-block" }}>
            <div style={{ fontFamily:BN, fontSize:88, lineHeight:.9, letterSpacing:-3, color:tc }}>{s.sT}</div>
            <div style={{ fontFamily:SG, fontSize:13, fontWeight:800, color:tc3, position:"absolute", right:0, bottom:-6, letterSpacing:.5 }}>{fmtToPar(s.vpT)}</div>
          </div>
        </div>
      )}
      {!v.holeScores && (
        <div style={{ textAlign:"center" }}>
          <div style={{ fontFamily:BN, fontSize:88, lineHeight:.9, letterSpacing:-3, color:tc }}>{s.sT}</div>
          <div style={{ fontFamily:SG, fontSize:16, fontWeight:800, color:tc3, marginTop:2 }}>{fmtToPar(s.vpT)}</div>
        </div>
      )}
      {(v.player||v.event||v.round||v.course||v.date||(v.position&&d.position)||hcl) && (
        /* maxWidth alinhado com a largura da grelha de buracos (9 × 30 + score 88) ~360px. */
        <div style={{ marginTop:6, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", color:tc3, lineHeight:1.4, wordBreak:"break-word", maxWidth:360 }}>
          {v.player&&d.player && <div>{d.player}</div>}
          {[v.event&&d.event,v.course&&d.course,v.round&&`R${d.round}`,v.position&&d.position&&`POS ${d.position}`,v.date&&d.date].filter(Boolean).length > 0 && (
            <div style={{ fontSize:9 }}>{[v.event&&d.event,v.course&&d.course,v.round&&`R${d.round}`,v.position&&d.position&&`POS ${d.position}`,v.date&&d.date].filter(Boolean).join(" · ")}</div>
          )}
          {hcl && <div style={{ fontSize:9, opacity:.85 }}>{hcl}</div>}
          {v.stats && <div style={{ marginTop:2 }}><StatsRow st={s.st} tc3={tc3} gap={4} fs={9} /></div>}
        </div>
      )}
    </div>
  );
}

/* V41 · HERO SCORE — score + to-par + nome compactos sobre foto. */
export function V41({ d, v, s, bg, tc="white", tc3 }: P) {
  const hcl = hiChStr(d, v, s);
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg ?? undefined, padding:"4px 6px" }}>
      <div style={{ display:"flex", alignItems:"baseline", gap:5 }}>
        <div style={{ fontFamily:BN, fontSize:96, lineHeight:.9, letterSpacing:-3, color:tc }}>{s.sT}</div>
        <div style={{ fontFamily:SG, fontSize:18, fontWeight:800, color:vpC(s.vpT), letterSpacing:.5 }}>{fmtToPar(s.vpT)}</div>
      </div>
      {v.player&&d.player && (
        <div style={{ fontFamily:LO, fontSize:18, fontWeight:700, fontStyle:"italic", marginTop:1, letterSpacing:.3 }}>{d.player}</div>
      )}
      {(v.event||v.round||v.course||v.date||(v.position&&d.position)||hcl) && (
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", color:tc3, marginTop:4, lineHeight:1.4, wordBreak:"break-word", maxWidth:280 }}>
          <div>{[v.round&&`R${d.round}`,v.event&&d.event,v.course&&d.course,v.position&&d.position&&`POS ${d.position}`].filter(Boolean).join(" · ")}</div>
          {v.date&&d.date && <div style={{ fontSize:9 }}>{d.date}</div>}
          {hcl && <div style={{ fontSize:9, opacity:.85 }}>{hcl}</div>}
          {v.stats && <div style={{ marginTop:2 }}><StatsRow st={s.st} tc3={tc3} gap={4} fs={9} /></div>}
        </div>
      )}
    </div>
  );
}

/* V42 · GLASS PANEL — Painel semi-transparente, score em accent color. */
export function V42({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const isDark = tc === "#ffffff" || tc === "white";
  const hcl = hiChStr(d, v, s);
  const accent = s.vpT < 0 ? "#dc2626" : "#1e40af";
  const bgF = bg || (isDark ? "rgba(20,20,30,.88)" : "rgba(255,255,255,.88)");
  const tx = isDark ? "#eee" : "#222";
  return (
    <div style={{ fontFamily:SG, display:"inline-block", background:bgF ?? undefined, color:tx, borderRadius:8, padding:"5px 8px" }}>
      {/* Topo: 2 colunas — score+nome à esquerda, metadata à direita
         (aproveita o espaço vazio em vez de empurrar tudo para baixo). */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
        <div style={{ flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:5 }}>
            <span style={{ fontFamily:BN, fontSize:62, lineHeight:.9, letterSpacing:-2, color:accent }}>{s.sT}</span>
            <span style={{ fontSize:16, fontWeight:800, color:accent }}>{fmtToPar(s.vpT)}</span>
          </div>
          {v.player&&d.player && (
            <div style={{ fontFamily:OS, fontSize:14, fontWeight:800, letterSpacing:1, textTransform:"uppercase", marginTop:1 }}>{d.player}</div>
          )}
        </div>
        {(v.event||v.course||v.round||v.date||(v.position&&d.position)||hcl) && (
          <div style={{ fontSize:9, fontWeight:600, color:tc3, letterSpacing:.5, lineHeight:1.4, wordBreak:"break-word", maxWidth:170, paddingTop:4 }}>
            <div>{[v.event&&d.event,v.round&&`R${d.round}`,v.course&&d.course,v.position&&d.position&&`POS ${d.position}`].filter(Boolean).join(" · ")}</div>
            {v.date&&d.date && <div style={{ marginTop:1 }}>{d.date}</div>}
            {hcl && <div style={{ opacity:.85, marginTop:1 }}>{hcl}</div>}
          </div>
        )}
      </div>
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
      {v.stats && <div style={{ marginTop:4 }}><StatsRow st={s.st} tc3={tc3} gap={4} fs={9} /></div>}
    </div>
  );
}

/* V43 · ACCENT STRIP — Barra vertical accent + score enorme. */
export function V43({ d, v, s, bg, tc="white", tc3 }: P) {
  const accent = s.vpT < 0 ? "#dc2626" : s.vpT === 0 ? (tc === "#ffffff" || tc === "white" ? "#fff" : "#222") : "#3b82f6";
  const hcl = hiChStr(d, v, s);
  return (
    <div style={{ fontFamily:II, display:"inline-flex", alignItems:"stretch", color:tc, background:bg ?? undefined, padding:"4px 4px" }}>
      <div style={{ width:3, background:accent, borderRadius:2, marginRight:6, flexShrink:0 }} />
      <div>
        <div style={{ display:"flex", alignItems:"baseline", gap:5 }}>
          <span style={{ fontFamily:BN, fontSize:78, lineHeight:.9, letterSpacing:-3, color:tc }}>{s.sT}</span>
          <span style={{ fontFamily:SG, fontSize:16, fontWeight:800, color:vpC(s.vpT), letterSpacing:.5 }}>{fmtToPar(s.vpT)}</span>
        </div>
        {v.player&&d.player && (
          <div style={{ fontFamily:OS, fontSize:12, fontWeight:800, letterSpacing:1.5, textTransform:"uppercase", marginTop:1 }}>{d.player}</div>
        )}
        {(v.event||v.round||v.course||v.date||(v.position&&d.position)||hcl) && (
          <div style={{ fontSize:9, fontWeight:600, letterSpacing:1, color:tc3, marginTop:2, textTransform:"uppercase", lineHeight:1.4, wordBreak:"break-word", maxWidth:260 }}>
            <div>{[v.round&&`R${d.round}`,v.event&&d.event,v.course&&d.course,v.position&&d.position&&`POS ${d.position}`,v.date&&d.date].filter(Boolean).join(" · ")}</div>
            {hcl && <div style={{ opacity:.85 }}>{hcl}</div>}
            {v.stats && <div style={{ marginTop:2 }}><StatsRow st={s.st} tc3={tc3} gap={4} fs={9} /></div>}
          </div>
        )}
      </div>
    </div>
  );
}
