/*
 * Designs PRO TOUR — estilos PGA / college / Korn Ferry.
 * V45 PGA Broadcast, V46 College Poster, V47 PGA Tour U,
 * V29 Tour Classic, V38 PGA Americas, V30 Korn Ferry.
 */
import { II, OS, LO, BN, SG, TS, fillA, ink, panel, isLightText, onColor } from "../shared";
import { SC, SCL, SCO, SCA, TpBadge, StatsRow, Info } from "../badges";
import type { P } from "../types";

/* V29 · TOUR CLASSIC — Estilo PGA Tour Americas / Auburn.
   Duas linhas de scores com hole numbers, score GRANDE à direita, nome + evento em baixo. */
export function V29({ d, v, s, bg, tc="white", ta = tc, tc3 }: P) {
  const is18 = d.scores.length >= 18;
  return (
    /* O fundo envolve TUDO — o texto por baixo, sem fundo, não se lia sobre fotos claras. */
    <div style={{ display:"inline-block", background:bg ?? undefined, borderRadius:6, padding:"6px 10px 8px" }}>
      <div style={{ fontFamily:II, display:"inline-block", color:tc }}>
        {v.holeScores && (
          <div style={{ display:"flex", alignItems:"center" }}>
            <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
              {(is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len]) => (
                <div key={off} style={{ display:"flex", gap:2 }}>
                  {d.scores.slice(off,off+len).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} h={off+i} sz={30} />)}
                </div>
              ))}
            </div>
            {/* Score e badge empilhados (o badge por cima do número tapava-o) */}
            <div style={{ flexShrink:0, marginLeft:10, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
              <div style={{ fontFamily:BN, fontSize:is18 ? 52 : 40, lineHeight:.9, letterSpacing:-2, color:tc }}>{s.sT}</div>
              <TpBadge vp={s.vpT} sz={is18 ? 15 : 12} />
            </div>
          </div>
        )}
        {!v.holeScores && (
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ fontFamily:BN, fontSize:84, lineHeight:.9, letterSpacing:-3, color:tc }}>{s.sT}</div>
            <TpBadge vp={s.vpT} sz={20} />
          </div>
        )}
      </div>
      {/* Filete no destaque a marcar o bloco do nome/info */}
      <div style={{ fontFamily:II, marginTop:6, borderLeft:`3px solid ${ta}`, paddingLeft:8 }}>
        {v.player&&d.player && <div style={{ fontSize:13, fontWeight:800, letterSpacing:1.5, textTransform:"uppercase", color:tc }}>{d.player}</div>}
        <Info d={d} v={v} tc={tc} tc3={tc3} fs={10} upper fit st={v.stats ? s.st : null} mt={1} />
      </div>
    </div>
  );
}

/* V30 · KORN FERRY — Estilo Korn Ferry Tour.
   Barra de accent com nome do jogador, round + to-par, score grande à direita. */
export function V30({ d, v, s, fa, bg, tc="white", ta = tc, tc3 }: P) {
  const is18 = d.scores.length >= 18;
  /* Barra do nome no destaque do cartão (era verde fixo — não combinava com o fundo) */
  const accent = ta;
  const isDark = isLightText(tc);
  return (
    <div style={{ fontFamily:SG, display:"inline-block", color:tc, background:bg||"rgba(0,0,0,.85)", borderRadius:10, overflow:"hidden", textShadow:isDark?TS:"none" }}>
      <div style={{ display:"flex", alignItems:"stretch" }}>
        <div style={{ flex:1, padding:"6px 10px", display:"flex", flexDirection:"column", justifyContent:"center" }}>
          {v.player&&d.player && (
            <div style={{ display:"inline-block" }}>
              <span style={{ fontFamily:BN, background:fillA(accent, fa), padding:"2px 10px", fontSize:18, letterSpacing:1.5, color:onColor(accent) }}>{d.player.toUpperCase()}</span>
            </div>
          )}
          {v.round && (
            <div style={{ marginTop:3 }}>
              <span style={{ fontSize:9, fontWeight:700, letterSpacing:2, color:tc3 }}>R{d.round}</span>
            </div>
          )}
        </div>
        <div style={{ padding:"6px 12px 2px", display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ fontFamily:BN, fontSize:52, lineHeight:.85, letterSpacing:-2, color:tc }}>{s.sT}</div>
          <TpBadge vp={s.vpT} sz={16} />
        </div>
      </div>
      {v.holeScores && (
        <div style={{ padding:"4px 8px 6px" }}>
          {(is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len],ri) => (
            <div key={off} style={{ display:"flex", gap:3, justifyContent:"center", marginTop:ri>0?3:0 }}>
              {d.scores.slice(off,off+len).map((sc,i) => isDark ? <SC key={i} sc={sc} par={d.par[off+i]} h={off+i} sz={30} /> : <SCL key={i} sc={sc} par={d.par[off+i]} h={off+i} sz={30} />)}
            </div>
          ))}
        </div>
      )}
      <div style={{ padding:"4px 10px 6px", borderTop:`1px solid ${ink(tc, .08)}` }}>
        <Info d={d} v={v} keys={["event", "position", "course", "tee", "teeDist", "date", "hiCh", "sd"]} tc={tc} tc3={tc3} fs={10} fit st={v.stats ? s.st : null} />
      </div>
    </div>
  );
}

/* V38 · PGA AMERICAS — Estilo PGA Tour Americas.
   Transparente. Nome GRANDE em cima, hole numbers + 2 filas de circles, score ENORME à direita. */
export function V38({ d, v, s, fa, bg, tc="white", ta = tc, tc3 }: P) {
  const is18 = d.scores.length >= 18;
  /* Score fontSize compacto: 18H 80px (~altura 2 filas circles 28+28+gap) vs 9H 56px */
  const scoreFs = is18 ? 80 : 56;
  return (
    <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg ?? undefined, padding:"6px 8px" }}>
      {v.player&&d.player && (
        <div style={{ fontFamily:LO, fontSize:20, fontWeight:700, fontStyle:"italic", marginBottom:2, letterSpacing:.3 }}>
          {d.player}
        </div>
      )}
      {v.holeScores && (
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
            {(is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len],ri) => (
              <div key={off}>
                {ri === 0 && <div style={{ display:"flex", gap:2, marginBottom:1 }}>
                  {Array.from({length:len},(_,i) => <div key={i} style={{ width:28, textAlign:"center", fontSize:9, fontWeight:600, color:tc3 }}>{off+i+1}</div>)}
                </div>}
                <div style={{ display:"flex", gap:2 }}>
                  {d.scores.slice(off,off+len).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} h={off+i} sz={28} />)}
                </div>
                {is18 && ri === 1 && <div style={{ display:"flex", gap:2, marginTop:1 }}>
                  {Array.from({length:len},(_,i) => <div key={i} style={{ width:28, textAlign:"center", fontSize:9, fontWeight:600, color:tc3 }}>{off+i+1}</div>)}
                </div>}
              </div>
            ))}
          </div>
          {/* Score sozinho na coluna para a altura bater com a dos buracos
             (alignItems:center centra-os correctamente); badge sai como
             pill absolute no canto inferior-direito. */}
          <div style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
            <div style={{ fontFamily:BN, fontSize:scoreFs * .78, lineHeight:.9, letterSpacing:-3, color:tc }}>{s.sT}</div>
            <TpBadge vp={s.vpT} sz={is18 ? 15 : 12} />
          </div>
        </div>
      )}
      {!v.holeScores && (
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ fontFamily:BN, fontSize:scoreFs, lineHeight:.9, letterSpacing:-4, color:tc }}>{s.sT}</div>
          <TpBadge vp={s.vpT} sz={18} />
        </div>
      )}
      {((v.round && d.round) || (v.position && d.position)) && (
        <div style={{ marginTop:6, display:"flex", gap:4, fontSize:10, fontWeight:800, letterSpacing:1.5, textTransform:"uppercase" }}>
          {v.round && d.round > 0 && <span style={{ background:fillA(ta, fa), padding:"2px 8px", color:onColor(ta) }}>R{d.round}</span>}
          {v.position && d.position && <span style={{ background:ink(tc, .15), padding:"2px 8px", color:tc }}>POS {d.position}</span>}
        </div>
      )}
      <Info d={d} v={v} keys={["event", "course", "tee", "teeDist", "date", "hiCh", "sd"]} tc={tc} tc3={tc3} fs={10} upper fit st={v.stats ? s.st : null} mt={4} />
    </div>
  );
}

/* V45 · PGA BROADCAST — Estilo @pgatour Min Woo Lee / Houston Open.
   Score ENORME a esquerda + metadata empilhada a direita, blocos buracos com fundo. */
export function V45({ d, v, s, fa, bg, tc="white", ta = tc, tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const hasMeta = (v.player&&d.player) || (v.event&&d.event) || (v.course&&d.course) || v.round || (v.date&&d.date) || (v.position&&d.position) || v.hiCh || v.sd;
  return (
    /* O fundo envolve tudo (o texto do topo, sem fundo, não se lia sobre fotos claras). */
    <div style={{ fontFamily: II, display: "inline-block", color: tc, padding: "6px 8px 8px", background: bg ?? undefined, borderRadius: 8 }}>
      {/* Topo: score gigante + metadata empilhada */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flexShrink: 0 }}>
          <TpBadge vp={s.vpT} sz={20} />
          <div style={{ fontFamily: BN, fontSize: 100, lineHeight: .9, letterSpacing: -4, color: tc }}>{s.sT}</div>
        </div>
        {hasMeta && (
          /* maxWidth aperta a coluna do subtitulo para o pill do evento
             quebrar em 3+ linhas em nomes longos como "Torneio Clube de Golf Santo da Serra". */
          <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start", paddingBottom: 6, maxWidth: 180, minWidth: 0 }}>
            {v.player && d.player && (
              <div style={{ fontFamily: LO, fontSize: 18, fontWeight: 700, fontStyle: "italic", letterSpacing: .3 }}>{d.player}</div>
            )}
            {v.event && d.event && (
              <div style={{ background: fillA(ta, fa), padding: "3px 10px", fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: onColor(ta), textTransform: "uppercase", lineHeight: 1.35, wordBreak: "break-word" }}>{d.event}{v.division && d.division ? <span style={{ fontWeight: 600, opacity: .8 }}>{" · "}{d.division}</span> : null}</div>
            )}
            {(v.course || v.tee || v.teeDist) && (v.course&&d.course || v.tee&&d.tee || v.teeDist&&d.teeDist) && (
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: tc3, textTransform: "uppercase", lineHeight: 1.35, wordBreak: "break-word" }}>{[v.course&&d.course, v.tee&&d.tee, v.teeDist&&d.teeDist?`${d.teeDist}m`:null].filter(Boolean).join(" · ")}</div>
            )}
            {(v.round || (v.date && d.date) || (v.position && d.position)) && (
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {v.round && (
                  <div style={{ background: ink(tc, .15), padding: "2px 8px", fontSize: 9, fontWeight: 800, letterSpacing: 1.2, color: tc, textTransform: "uppercase" }}>R{d.round}</div>
                )}
                {v.position && d.position && (
                  <div style={{ background: ink(tc, .10), padding: "2px 8px", fontSize: 9, fontWeight: 800, letterSpacing: 1.2, color: tc, textTransform: "uppercase" }}>POS {d.position}</div>
                )}
                {v.date && d.date && (
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: tc3, textTransform: "uppercase", display: "flex", alignItems: "center" }}>{d.date}</div>
                )}
              </div>
            )}
            <Info d={d} v={v} keys={["hiCh", "sd"]} tc={tc} tc3={tc3} fs={9} upper />
          </div>
        )}
      </div>
      {/* Bloco azul só com os buracos */}
      {v.holeScores && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1, background: panel(tc, (fa ?? .88) * .25), padding: "6px 8px", borderRadius: 8 }}>
          {(is18 ? [[0, 9], [9, 9]] as [number, number][] : [[0, d.scores.length] as [number, number]]).map(([off, len], ri) => (
            <div key={off}>
              <div style={{ display: "flex", gap: 2 }}>
                {d.scores.slice(off, off + len).map((sc, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                    {ri === 0 && <div style={{ fontSize: 9, fontWeight: 600, color: tc3 }}>{off + i + 1}</div>}
                    <SC sc={sc} par={d.par[off + i]} h={off + i} sz={36} />
                    {is18 && ri === 1 && <div style={{ fontSize: 9, fontWeight: 600, color: tc3 }}>{off + i + 1}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {v.stats && <div style={{ marginTop: 6 }}><StatsRow st={s.st} tc3={tc3} gap={6} fs={10} /></div>}
    </div>
  );
}

/* V46 · COLLEGE POSTER — Estilo @auburngolf / Jackson Koivun.
   2 filas de circles outline com separador, score ENORME à direita com badge em baixo. */
export function V46({ d, v, s, bg, tc="white", ta = tc, tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const scoreFs = is18 ? 100 : 78;
  return (
    <div style={{ fontFamily: II, display: "inline-block", color: tc, background: bg ?? undefined, padding: "6px 10px" }}>
      {v.holeScores && (
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {(is18 ? [[0, 9], [9, 9]] as [number, number][] : [[0, d.scores.length] as [number, number]]).map(([off, len], ri) => (
              <div key={off}>
                {ri === 0 && (
                  <div style={{ display: "flex", gap: 3, marginBottom: 1 }}>
                    {Array.from({ length: len }, (_, i) => (
                      <div key={i} style={{ width: 36, textAlign: "center", fontSize: 9, fontWeight: 600, color: tc3 }}>{off + i + 1}</div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 3 }}>
                  {d.scores.slice(off, off + len).map((sc, i) => <SCO key={i} sc={sc} par={d.par[off + i]} h={off + i} sz={36} />)}
                </div>
                {ri === 0 && is18 && (
                  <div style={{ height: 2, background: ta, opacity: .7, margin: "4px 0" }} />
                )}
                {is18 && ri === 1 && (
                  <div style={{ display: "flex", gap: 3, marginTop: 1 }}>
                    {Array.from({ length: len }, (_, i) => (
                      <div key={i} style={{ width: 36, textAlign: "center", fontSize: 9, fontWeight: 600, color: tc3 }}>{off + i + 1}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Score com o badge centrado POR BAIXO (por cima tapava o número) */}
          <div style={{ flexShrink: 0, display:"flex", flexDirection:"column", alignItems:"center", gap: 4 }}>
            <div style={{ fontFamily: BN, fontSize: scoreFs * .9, lineHeight: .85, letterSpacing: -4, color: tc }}>{s.sT}</div>
            <TpBadge vp={s.vpT} sz={Math.round(scoreFs * 0.18)} />
          </div>
        </div>
      )}
      {!v.holeScores && (
        <div style={{ display:"inline-flex", flexDirection:"column", alignItems:"center", gap: 4 }}>
          <div style={{ fontFamily: BN, fontSize: 110, lineHeight: 1, letterSpacing: -4, color: tc, paddingTop: 2 }}>{s.sT}</div>
          <TpBadge vp={s.vpT} sz={22} />
        </div>
      )}
      {/* Footer com wrap em multi-linhas para evitar overflow horizontal. */}
      {v.player && d.player && <div style={{ marginTop: 6, fontSize: 13, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>{d.player}</div>}
      <Info d={d} v={v} tc={tc} tc3={tc3} fs={10} upper fit st={v.stats ? s.st : null} mt={v.player && d.player ? 1 : 6} />
    </div>
  );
}

/* V47 · PGA TOUR U — Estilo @pgatouru David Ford / Phichaksn Maichon.
   Nome ENORME, barra accent, circles com accent color, score enorme em baixo. */
export function V47({ d, v, s, fa, bg, tc="white", ta = tc, tc3 }: P) {
  const is18 = d.scores.length >= 18;
  /* Números e contornos no destaque do cartão; a barra da info é um painel
     neutro (o roxo/laranja fixos não combinavam com fundo nenhum). */
  const accent = ta;
  return (
    <div style={{ fontFamily: II, display: "inline-block", color: tc, background: bg ?? undefined, padding: "4px 6px" }}>
      {/* Nome — HUGE (last name dominante) */}
      {/* Cabeçalho: nome à esquerda, score + badge à direita (poupa a linha do score em baixo) */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginBottom: 3 }}>
        {v.player && d.player ? (() => {
          const parts = d.player.split(" ");
          const first = parts.slice(0, -1).join(" ");
          const last = parts[parts.length - 1] || "";
          return (
            <div style={{ fontFamily: OS, textTransform: "uppercase", lineHeight: .95 }}>
              {first && <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: 1.5 }}>{first}</div>}
              <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: 1 }}>{last.toUpperCase()}</div>
            </div>
          );
        })() : <span />}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <div style={{ fontFamily: BN, fontSize: 62, lineHeight: .85, letterSpacing: -2, color: tc }}>{s.sT}</div>
          <TpBadge vp={s.vpT} sz={18} />
        </div>
      </div>
      {/* Barra da info: painel neutro com o filete no destaque. */}
      {((v.event && d.event) || v.round || (v.course && d.course) || (v.tee && d.tee) || (v.teeDist && d.teeDist) || (v.position && d.position)) && (
        <div style={{ background: panel(tc, (fa ?? .88) * .3), borderLeft: `3px solid ${accent}`, padding: "3px 10px 4px", marginBottom: 4 }}>
          <Info d={d} v={v} keys={["event", "round", "course", "tee", "teeDist", "position"]} tc={tc} tc3={tc3} fs={9} upper fit />
        </div>
      )}
      {/* Score circles 2×9 com accent color */}
      {v.holeScores && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {(is18 ? [[0, 9], [9, 9]] as [number, number][] : [[0, d.scores.length] as [number, number]]).map(([off, len]) => (
            <div key={off}>
              <div style={{ display: "flex", gap: 2, marginBottom: 1 }}>
                {Array.from({ length: len }, (_, i) => (
                  <div key={i} style={{ width: 36, textAlign: "center", fontSize: 8, fontWeight: 700, color: accent, letterSpacing: .5 }}>{off + i + 1}</div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 2 }}>
                {d.scores.slice(off, off + len).map((sc, i) => <SCA key={i} sc={sc} par={d.par[off + i]} h={off + i} sz={36} accent={accent} />)}
              </div>
            </div>
          ))}
        </div>
      )}
      <Info d={d} v={v} keys={["date", "hiCh", "sd"]} tc={tc} tc3={tc3} fs={10} fit st={v.stats ? s.st : null} mt={4} />
    </div>
  );
}
