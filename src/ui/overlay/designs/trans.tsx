/*
 * Designs TRANS — overlays transparentes para fotos.
 * V39 Outline Branco, V41 Hero Score, V42 Glass Panel, V43 Accent Strip.
 */
import { II, OS, LO, BN, SG, vpC, isLightText } from "../shared";
import { SC, SCL, SCO, Info } from "../badges";
import { fmtToPar } from "../../../utils/format";
import type { P } from "../types";

/* V39 · OUTLINE BRANCO — SCO (contornos brancos), score ENORME à direita. */
export function V39({ d, v, s, bg, tc="white", ta = tc, tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg ?? undefined, padding:"4px 6px 6px" }}>
      {v.holeScores && (
        <div style={{ display:"flex", alignItems:"center" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
            {(is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len],ri) => (
              <div key={off}>
                {ri === 0 && <div style={{ display:"flex", gap:2, marginBottom:1 }}>
                  {Array.from({length:len},(_,i) => <div key={i} style={{ width:28, textAlign:"center", fontSize:8, fontWeight:700, color:ta }}>{off+i+1}</div>)}
                </div>}
                <div style={{ display:"flex", gap:2 }}>
                  {d.scores.slice(off,off+len).map((sc,i) => <SCO key={i} sc={sc} par={d.par[off+i]} h={off+i} sz={28} />)}
                </div>
                {ri === 1 && <div style={{ display:"flex", gap:2, marginTop:1 }}>
                  {Array.from({length:len},(_,i) => <div key={i} style={{ width:28, textAlign:"center", fontSize:8, fontWeight:700, color:ta }}>{off+i+1}</div>)}
                </div>}
              </div>
            ))}
          </div>
          {/* Score sozinho na coluna; -1 sai como badge absolute para alturas casarem. */}
          <div style={{ flexShrink:0, marginLeft:6, position:"relative", display:"inline-block" }}>
            <div style={{ fontFamily:BN, fontSize:88, lineHeight:.9, letterSpacing:-3, color:tc }}>{s.sT}</div>
            <div style={{ fontFamily:SG, fontSize:14, fontWeight:800, color:vpC(s.vpT, tc, ta), position:"absolute", right:0, bottom:-6, letterSpacing:.5 }}>{fmtToPar(s.vpT)}</div>
          </div>
        </div>
      )}
      {!v.holeScores && (
        <div style={{ textAlign:"center" }}>
          <div style={{ fontFamily:BN, fontSize:88, lineHeight:.9, letterSpacing:-3, color:tc }}>{s.sT}</div>
          <div style={{ fontFamily:SG, fontSize:16, fontWeight:800, color:vpC(s.vpT, tc, ta), marginTop:2 }}>{fmtToPar(s.vpT)}</div>
        </div>
      )}
      {v.player&&d.player && <div style={{ marginTop:6, fontSize:13, fontWeight:800, letterSpacing:1.5, textTransform:"uppercase" }}>{d.player}</div>}
      <Info d={d} v={v} tc={tc} tc3={tc3} fs={10} upper fit st={v.stats ? s.st : null} mt={v.player&&d.player ? 1 : 6} />
    </div>
  );
}

/* V41 · HERO SCORE — score + to-par + nome compactos sobre foto. */
export function V41({ d, v, s, bg, tc="white", ta = tc, tc3 }: P) {
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg ?? undefined, padding:"4px 8px 6px", minWidth:200 }}>
      <div style={{ display:"flex", alignItems:"baseline", gap:5 }}>
        <div style={{ fontFamily:BN, fontSize:96, lineHeight:.9, letterSpacing:-3, color:tc }}>{s.sT}</div>
        <div style={{ fontFamily:SG, fontSize:18, fontWeight:800, color:vpC(s.vpT, tc, ta), letterSpacing:.5 }}>{fmtToPar(s.vpT)}</div>
      </div>
      {v.player&&d.player && (
        <div style={{ fontFamily:LO, fontSize:18, fontWeight:700, fontStyle:"italic", marginTop:1, letterSpacing:.3, borderBottom:`2px solid ${ta}`, display:"inline-block", paddingBottom:1 }}>{d.player}</div>
      )}
      <Info d={d} v={v} tc={tc} tc3={tc3} fs={10} upper fit st={v.stats ? s.st : null} mt={4} />
    </div>
  );
}

/* V42 · GLASS PANEL — Painel semi-transparente, score em accent color. */
export function V42({ d, v, s, bg, tc="white", ta = tc, tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const isDark = isLightText(tc);
  /* Abaixo do par em vermelho; senão na cor do texto (o azul competia com os bogeys). */
  const accent = s.vpT < 0 ? "#dc2626" : tc;
  const bgF = bg || (isDark ? "rgba(20,20,30,.88)" : "rgba(255,255,255,.88)");
  const tx = isDark ? "#eee" : "#222";
  return (
    <div style={{ fontFamily:SG, display:"inline-block", background:bgF ?? undefined, color:tx, borderRadius:8, padding:"5px 8px", borderTop:`3px solid ${ta}` }}>
      {/* Topo: 2 colunas — score+nome à esquerda, metadata à direita
         (aproveita o espaço vazio em vez de empurrar tudo para baixo). */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
        <div style={{ flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:5 }}>
            <span style={{ fontFamily:BN, fontSize:62, lineHeight:.9, letterSpacing:-2, color:accent }}>{s.sT}</span>
            <span style={{ fontSize:16, fontWeight:800, color:s.vpT < 0 ? accent : vpC(s.vpT, tc, ta) }}>{fmtToPar(s.vpT)}</span>
          </div>
          {v.player&&d.player && (
            <div style={{ fontFamily:OS, fontSize:14, fontWeight:800, letterSpacing:1, textTransform:"uppercase", marginTop:1 }}>{d.player}</div>
          )}
        </div>
        <div style={{ flex:1, minWidth:0, paddingTop:4 }}><Info d={d} v={v} tc={tx} tc3={tc3} fs={10} fit /></div>
      </div>
      {v.holeScores && (
        <div style={{ marginTop:6 }}>
          {(is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len]) => (
            <div key={off} style={{ display:"flex", gap:3, marginBottom:3 }}>
              {d.scores.slice(off,off+len).map((sc,i) => (
                <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
                  <div style={{ fontSize:8, fontWeight:600, color:tc3 }}>{off+i+1}</div>
                  {isDark ? <SC sc={sc} par={d.par[off+i]} h={off+i} sz={28} /> : <SCL sc={sc} par={d.par[off+i]} h={off+i} sz={28} />}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {v.stats && <Info d={d} v={v} keys={[]} tc={tx} tc3={tc3} fs={10} fit st={s.st} mt={2} />}
    </div>
  );
}

/* V43 · ACCENT STRIP — Barra vertical accent + score enorme. */
export function V43({ d, v, s, bg, tc="white", ta = tc, tc3 }: P) {
  /* Barra vermelha abaixo do par; senão no destaque do cartão. */
  const accent = s.vpT < 0 ? "#dc2626" : ta;
  return (
    <div style={{ fontFamily:II, display:"inline-flex", alignItems:"stretch", color:tc, background:bg ?? undefined, padding:"4px 4px" }}>
      <div style={{ width:3, background:accent, borderRadius:2, marginRight:6, flexShrink:0 }} />
      <div style={{ minWidth:190 }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:5 }}>
          <span style={{ fontFamily:BN, fontSize:78, lineHeight:.9, letterSpacing:-3, color:tc }}>{s.sT}</span>
          <span style={{ fontFamily:SG, fontSize:16, fontWeight:800, color:vpC(s.vpT, tc, ta), letterSpacing:.5 }}>{fmtToPar(s.vpT)}</span>
        </div>
        {v.player&&d.player && (
          <div style={{ fontFamily:OS, fontSize:12, fontWeight:800, letterSpacing:1.5, textTransform:"uppercase", marginTop:1 }}>{d.player}</div>
        )}
        <Info d={d} v={v} tc={tc} tc3={tc3} fs={10} upper fit st={v.stats ? s.st : null} mt={2} />
      </div>
    </div>
  );
}
