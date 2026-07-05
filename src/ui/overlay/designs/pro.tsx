/*
 * Designs PRO TOUR — estilos PGA / college / Korn Ferry.
 * V45 PGA Broadcast, V46 College Poster, V47 PGA Tour U,
 * V29 Tour Classic, V38 PGA Americas, V30 Korn Ferry.
 */
import { II, OS, LO, BN, SG, TS, hiChStr } from "../shared";
import { SC, SCL, SCO, SCA, TpBadge, StatsRow } from "../badges";
import type { P } from "../types";

/* V29 · TOUR CLASSIC — Estilo PGA Tour Americas / Auburn.
   Duas linhas de scores com hole numbers, score GRANDE à direita, nome + evento em baixo. */
export function V29({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const hcl = hiChStr(d, v, s);
  return (
    <div style={{ display:"inline-block" }}>
      {/* Bloco azul: só envolve buracos + score */}
      <div style={{ fontFamily:II, display:"inline-block", color:tc, background:bg ?? undefined, padding:"6px 10px", borderRadius:6 }}>
        {v.holeScores && (
          <div style={{ display:"flex", alignItems:"center" }}>
            <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
              {(is18 ? [[0,9],[9,9]] as [number,number][] : [[0,d.scores.length] as [number,number]]).map(([off,len]) => (
                <div key={off} style={{ display:"flex", gap:2 }}>
                  {d.scores.slice(off,off+len).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} sz={30} />)}
                </div>
              ))}
            </div>
            {/* Score com -1 sobreposto (absolute) — alinhamento vertical com buracos via alignItems:center */}
            <div style={{ flexShrink:0, marginLeft:10, position:"relative", display:"inline-block" }}>
              <div style={{ fontFamily:BN, fontSize:68, lineHeight:1, letterSpacing:-3, color:tc, display:"block" }}>{s.sT}</div>
              <div style={{ position:"absolute", right:-6, bottom:-8 }}>
                <TpBadge vp={s.vpT} sz={20} />
              </div>
            </div>
          </div>
        )}
        {!v.holeScores && (
          <div style={{ position:"relative", display:"inline-block" }}>
            <div style={{ fontFamily:BN, fontSize:84, lineHeight:1, letterSpacing:-3, color:tc }}>{s.sT}</div>
            <div style={{ position:"absolute", right:-6, bottom:-8 }}>
              <TpBadge vp={s.vpT} sz={20} />
            </div>
          </div>
        )}
      </div>
      {/* Tournament/course/teeDist/position/HI — FORA do bloco azul, sem fundo */}
      {(v.player||v.event||v.round||v.course||v.teeDist||(v.position&&d.position)||hcl) && (
        <div style={{ marginTop:6, fontFamily:II, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", color:tc3, lineHeight:1.3 }}>
          {v.player&&d.player && <div style={{ fontSize:10 }}>{d.player}</div>}
          {(v.event || v.round || (v.position && d.position)) && (
            <div style={{ fontSize:14 }}>{[v.event&&d.event,v.round&&`R${d.round}`,v.position&&d.position].filter(Boolean).join(" · ")}</div>
          )}
          {(v.course || (v.teeDist && d.teeDist)) && (
            <div style={{ fontSize:10, marginTop:1, opacity:0.85 }}>{[v.course&&d.course, v.teeDist&&d.teeDist?`${d.teeDist}m`:null].filter(Boolean).join(" · ")}</div>
          )}
          {hcl && <div style={{ fontSize:9, marginTop:1, opacity:0.75 }}>{hcl}</div>}
          {v.stats && <div style={{ marginTop:3, display:"flex" }}><StatsRow st={s.st} tc3={tc3} gap={5} fs={10} /></div>}
        </div>
      )}
    </div>
  );
}

/* V30 · KORN FERRY — Estilo Korn Ferry Tour.
   Barra de accent com nome do jogador, round + to-par, score grande à direita. */
export function V30({ d, v, s, bg, tc="white", tc3 }: P) {
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
          {v.round && (
            <div style={{ marginTop:3 }}>
              <span style={{ fontSize:9, fontWeight:700, letterSpacing:2, color:tc3 }}>R{d.round}</span>
            </div>
          )}
        </div>
        <div style={{ padding:"6px 14px", display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ fontFamily:BN, fontSize:60, lineHeight:1, letterSpacing:-2, color:tc }}>{s.sT}</div>
          <TpBadge vp={s.vpT} sz={16} />
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
      {(v.event||v.course||v.date||v.tee||v.teeDist||(v.position&&d.position)) && (
        <div style={{ padding:"4px 10px 4px", borderTop:isDark?"1px solid rgba(255,255,255,.08)":"1px solid rgba(0,0,0,.08)", fontSize:9, fontWeight:600, color:tc3, lineHeight:1.4, wordBreak:"break-word" }}>
          <div>{[v.event&&d.event,v.course&&d.course,v.tee&&d.tee,v.teeDist&&d.teeDist&&`${d.teeDist}m`,v.position&&d.position&&`POS ${d.position}`].filter(Boolean).join(" · ")}</div>
          {v.date&&d.date && <div>{d.date}</div>}
        </div>
      )}
      {hiChStr(d,v,s) && <div style={{ padding:"2px 10px", fontSize:9, fontWeight:600, color:tc3, opacity:.85 }}>{hiChStr(d,v,s)}</div>}
      {v.stats && <div style={{ padding:"2px 10px 6px" }}><StatsRow st={s.st} tc3={tc3} gap={4} fs={9} /></div>}
    </div>
  );
}

/* V38 · PGA AMERICAS — Estilo PGA Tour Americas.
   Transparente. Nome GRANDE em cima, hole numbers + 2 filas de circles, score ENORME à direita. */
export function V38({ d, v, s, bg, tc="white", tc3 }: P) {
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
                  {Array.from({length:len},(_,i) => <div key={i} style={{ width:36, textAlign:"center", fontSize:9, fontWeight:600, color:tc3 }}>{off+i+1}</div>)}
                </div>}
                <div style={{ display:"flex", gap:2 }}>
                  {d.scores.slice(off,off+len).map((sc,i) => <SC key={i} sc={sc} par={d.par[off+i]} sz={28} />)}
                </div>
                {is18 && ri === 1 && <div style={{ display:"flex", gap:2, marginTop:1 }}>
                  {Array.from({length:len},(_,i) => <div key={i} style={{ width:36, textAlign:"center", fontSize:9, fontWeight:600, color:tc3 }}>{off+i+1}</div>)}
                </div>}
              </div>
            ))}
          </div>
          {/* Score sozinho na coluna para a altura bater com a dos buracos
             (alignItems:center centra-os correctamente); badge sai como
             pill absolute no canto inferior-direito. */}
          <div style={{ flexShrink:0, position:"relative", display:"inline-block" }}>
            <div style={{ fontFamily:BN, fontSize:scoreFs, lineHeight:1, letterSpacing:-4, color:tc, paddingTop:2 }}>{s.sT}</div>
            <div style={{ position:"absolute", right:-6, bottom:-6 }}>
              <TpBadge vp={s.vpT} sz={16} />
            </div>
          </div>
        </div>
      )}
      {!v.holeScores && (
        <div style={{ position:"relative", display:"inline-block" }}>
          <div style={{ fontFamily:BN, fontSize:scoreFs, lineHeight:1, letterSpacing:-4, color:tc, paddingTop:2 }}>{s.sT}</div>
          <div style={{ position:"absolute", right:-6, bottom:-6 }}>
            <TpBadge vp={s.vpT} sz={18} />
          </div>
        </div>
      )}
      {(v.round||v.event||v.course||v.date||v.tee||v.teeDist||(v.position&&d.position)||hiChStr(d,v,s)) && (
        <div style={{ marginTop:6, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", lineHeight:1.4, wordBreak:"break-word" }}>
          {v.round && <span style={{ background:"#dc2626", padding:"2px 8px", fontSize:10, fontWeight:800, color:"#fff", marginRight:4 }}>R{d.round}</span>}
          {v.position && d.position && <span style={{ background:"rgba(255,255,255,.15)", padding:"2px 8px", fontSize:10, fontWeight:800, color:tc, marginRight:4 }}>POS {d.position}</span>}
          {v.event&&d.event && <div style={{ fontSize:9, color:tc3, marginTop:2 }}>{d.event}</div>}
          {(v.course||v.date||v.tee||v.teeDist) && <div style={{ fontSize:9, color:tc3 }}>{[v.course&&d.course,v.tee&&d.tee,v.teeDist&&d.teeDist&&`${d.teeDist}m`,v.date&&d.date].filter(Boolean).join(" · ")}</div>}
          {hiChStr(d,v,s) && <div style={{ fontSize:9, color:tc3, opacity:.85 }}>{hiChStr(d,v,s)}</div>}
          {v.stats && <div style={{ marginTop:3, display:"flex", justifyContent:"flex-start" }}><StatsRow st={s.st} tc3={tc3} gap={4} fs={9} /></div>}
        </div>
      )}
    </div>
  );
}

/* V45 · PGA BROADCAST — Estilo @pgatour Min Woo Lee / Houston Open.
   Score ENORME a esquerda + metadata empilhada a direita, blocos buracos com fundo. */
export function V45({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const hcl = hiChStr(d, v, s);
  const hasMeta = (v.player&&d.player) || (v.event&&d.event) || (v.course&&d.course) || v.round || (v.date&&d.date) || (v.position&&d.position) || hcl;
  return (
    <div style={{ fontFamily: II, display: "inline-block", color: tc, padding: "4px 6px 0" }}>
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
              <div style={{ background: "#dc2626", padding: "3px 10px", fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: "#fff", textTransform: "uppercase", lineHeight: 1.35, wordBreak: "break-word" }}>{d.event}</div>
            )}
            {(v.course || v.tee || v.teeDist) && (v.course&&d.course || v.tee&&d.tee || v.teeDist&&d.teeDist) && (
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: tc3, textTransform: "uppercase", lineHeight: 1.35, wordBreak: "break-word" }}>{[v.course&&d.course, v.tee&&d.tee, v.teeDist&&d.teeDist?`${d.teeDist}m`:null].filter(Boolean).join(" · ")}</div>
            )}
            {(v.round || (v.date && d.date) || (v.position && d.position)) && (
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {v.round && (
                  <div style={{ background: "rgba(255,255,255,.15)", padding: "2px 8px", fontSize: 9, fontWeight: 800, letterSpacing: 1.2, color: tc, textTransform: "uppercase" }}>R{d.round}</div>
                )}
                {v.position && d.position && (
                  <div style={{ background: "rgba(255,255,255,.10)", padding: "2px 8px", fontSize: 9, fontWeight: 800, letterSpacing: 1.2, color: tc, textTransform: "uppercase" }}>POS {d.position}</div>
                )}
                {v.date && d.date && (
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: tc3, textTransform: "uppercase", display: "flex", alignItems: "center" }}>{d.date}</div>
                )}
              </div>
            )}
            {hcl && (
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: tc3, textTransform: "uppercase" }}>{hcl}</div>
            )}
          </div>
        )}
      </div>
      {/* Bloco azul só com os buracos */}
      {v.holeScores && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1, background: bg ?? undefined, padding: "6px 8px", borderRadius: 8 }}>
          {(is18 ? [[0, 9], [9, 9]] as [number, number][] : [[0, d.scores.length] as [number, number]]).map(([off, len], ri) => (
            <div key={off}>
              <div style={{ display: "flex", gap: 2 }}>
                {d.scores.slice(off, off + len).map((sc, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                    {ri === 0 && <div style={{ fontSize: 9, fontWeight: 600, color: tc3 }}>{off + i + 1}</div>}
                    <SC sc={sc} par={d.par[off + i]} sz={36} />
                    {is18 && ri === 1 && <div style={{ fontSize: 9, fontWeight: 600, color: tc3 }}>{off + i + 1}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* V46 · COLLEGE POSTER — Estilo @auburngolf / Jackson Koivun.
   2 filas de circles outline com separador, score ENORME à direita com badge em baixo. */
export function V46({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const scoreFs = is18 ? 100 : 78;
  const hcl = hiChStr(d, v, s);
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
                  {d.scores.slice(off, off + len).map((sc, i) => <SCO key={i} sc={sc} par={d.par[off + i]} sz={36} />)}
                </div>
                {ri === 0 && is18 && (
                  <div style={{ height: 2, background: "rgba(255,255,255,.35)", margin: "4px 0" }} />
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
          {/* Score com badge centrado em baixo (sticker semi-transparente) */}
          <div style={{ flexShrink: 0, position:"relative", display:"inline-block" }}>
            <div style={{ fontFamily: BN, fontSize: scoreFs, lineHeight: 1, letterSpacing: -4, color: tc, position:"relative", zIndex: 1, paddingTop: 2 }}>{s.sT}</div>
            <div style={{ position:"absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", zIndex: 2, opacity: 0.85 }}>
              <TpBadge vp={s.vpT} sz={Math.round(scoreFs * 0.2)} />
            </div>
          </div>
        </div>
      )}
      {!v.holeScores && (
        <div style={{ position:"relative", display:"inline-block" }}>
          <div style={{ fontFamily: BN, fontSize: 110, lineHeight: 1, letterSpacing: -4, color: tc, position:"relative", zIndex: 1, paddingTop: 2 }}>{s.sT}</div>
          <div style={{ position:"absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", zIndex: 2, opacity: 0.85 }}>
            <TpBadge vp={s.vpT} sz={22} />
          </div>
        </div>
      )}
      {/* Footer com wrap em multi-linhas para evitar overflow horizontal. */}
      {(v.player || v.event || v.round || v.course || v.tee || v.teeDist || v.date || (v.position && d.position) || hcl) && (
        <div style={{ marginTop: 6, fontSize: 9, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: tc3, lineHeight: 1.4, wordBreak: "break-word" }}>
          {v.player && d.player && <div>{d.player}</div>}
          {(v.event||v.course||v.tee||v.teeDist) && <div>{[v.event && d.event, v.course && d.course, v.tee && d.tee, v.teeDist && d.teeDist && `${d.teeDist}m`].filter(Boolean).join(" · ")}</div>}
          {(v.round||(v.position&&d.position)||v.date) && <div>{[v.round && `ROUND ${d.round}`, v.position && d.position && `POS ${d.position}`, v.date && d.date].filter(Boolean).join(" · ")}</div>}
          {hcl && <div style={{ fontSize: 8, letterSpacing: 1.5, opacity: .8 }}>{hcl}</div>}
        </div>
      )}
    </div>
  );
}

/* V47 · PGA TOUR U — Estilo @pgatouru David Ford / Phichaksn Maichon.
   Nome ENORME, barra accent, circles com accent color, score enorme em baixo. */
export function V47({ d, v, s, bg, tc="white", tc3 }: P) {
  const is18 = d.scores.length >= 18;
  const accent = "#e87722";
  const accentBar = "#3b1f7e";
  const hcl = hiChStr(d, v, s);
  return (
    <div style={{ fontFamily: II, display: "inline-block", color: tc, background: bg ?? undefined, padding: "4px 6px" }}>
      {/* Nome — HUGE (last name dominante) */}
      {v.player && d.player && (() => {
        const parts = d.player.split(" ");
        const first = parts.slice(0, -1).join(" ");
        const last = parts[parts.length - 1] || "";
        return (
          <div style={{ fontFamily: OS, textTransform: "uppercase", lineHeight: .95, marginBottom: 2 }}>
            {first && <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: 1.5 }}>{first}</div>}
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: 1 }}>{last.toUpperCase()}</div>
          </div>
        );
      })()}
      {/* Info bar roxo — wordBreak garante que texto longo quebra para multi-linhas. */}
      {(v.event || v.round || v.course || v.tee || v.teeDist || (v.position && d.position)) && (
        <div style={{ background: accentBar, padding: "3px 10px", marginBottom: 4 }}>
          <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1.5, color: "rgba(255,255,255,.8)", textTransform: "uppercase", wordBreak: "break-word", lineHeight: 1.5 }}>
            {[v.event && d.event, v.round && `ROUND ${d.round}`, v.position && d.position && `POS ${d.position}`, v.course && d.course, v.tee && d.tee, v.teeDist && d.teeDist && `${d.teeDist}m`].filter(Boolean).join("  /  ")}
          </div>
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
                {d.scores.slice(off, off + len).map((sc, i) => <SCA key={i} sc={sc} par={d.par[off + i]} sz={36} accent={accent} />)}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Score com badge em baixo (sticker semi-transparente) */}
      <div style={{ position:"relative", display:"inline-block", marginTop: 2 }}>
        <div style={{ fontFamily: BN, fontSize: 90, lineHeight: 1, letterSpacing: -3, color: tc, position:"relative", zIndex: 1 }}>{s.sT}</div>
        <div style={{ position:"absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", zIndex: 2, opacity: 0.85 }}>
          <TpBadge vp={s.vpT} sz={26} />
        </div>
      </div>
      {(v.date && d.date) || hcl || v.stats ? (
        <div style={{ fontSize: 9, fontWeight: 600, color: tc3, marginTop: 4, letterSpacing: 1, display: "flex", gap: 8, flexWrap:"wrap" }}>
          {v.date && d.date && <span>{d.date}</span>}
          {hcl && <span style={{ opacity: .85 }}>{hcl}</span>}
          {v.stats && <span style={{ width:"100%" }}><StatsRow st={s.st} tc3={tc3} gap={4} fs={9} /></span>}
        </div>
      ) : null}
    </div>
  );
}
