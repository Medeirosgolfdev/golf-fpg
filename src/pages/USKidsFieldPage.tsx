import { useEffect, useState, useMemo } from "react";

// ─────────────────────────────────────────────
// TIPOS — CAMPO (inscritos)
// ─────────────────────────────────────────────
interface Jogador      { nome: string; pais: string; cidade: string; }
interface PaisContagem { pais: string; n: number; }
interface Escalao {
  age_group: number; nome: string; genero: string | null;
  holes: number; flight_id: number;
  inscritos: number; maximo: number; vagas: number; pct_cheio: number;
  jogadores: Jogador[] | null; paises: PaisContagem[] | null;
}
interface Torneio {
  t: number; name: string; emoji?: string;
  date_inicio: string; date_fim?: string; rondas?: number;
  campo: string | null; fee_18?: string | null;
  total_inscritos: number; total_maximo: number;
  escaloes: Escalao[];
  ultima_atualizacao: string;
  sem_flights?: boolean; erro?: string;
}
interface IntlTorneio { id: string; name: string; short: string; date: string; rounds: number; par: number; url: string; }
interface IntlJogador { n: string; co: string; isM?: boolean; r: Record<string, { p: number; t: number; tp: number; rd: number[] }>; up: string[]; }
interface IntlData { torneios: IntlTorneio[]; proximos: { id: string; name: string }[]; jogadores: IntlJogador[]; }

interface FieldData { gerado_em: string; torneios: Torneio[]; }

// ─────────────────────────────────────────────
// TIPOS — RESULTADOS
// ─────────────────────────────────────────────
interface RondaJogador {
  nome: string; pais: string; cidade: string;
  pontos: number; score: number; tee: string;
  to_par: number | null;
  buracos: number;
  start_time: string; grupo: number;
  strokes: number[];  // directamente no jogador (nova estrutura)
  // legacy (estrutura antiga — manter compatibilidade)
  rondas?: Record<string, {
    strokes: number[]; total: number; buracos: number;
    start_time: string; grupo: number;
  }>;
}
interface RondaResult {
  ronda: number;
  par: number[];
  si: number[];
  buracos: number;
  total_par: number | null;
  leaderboard: RondaJogador[];  // nova estrutura
  jogadores?: RondaJogador[];   // legacy
}
interface EscalaoResult  { age_group: number; nome: string; holes: number; is_manuel: boolean; rondas: RondaResult[]; }
interface TorneioResult  {
  t: number; name: string;
  date_inicio: string; date_fim?: string; campo: string | null;
  rondas_total: number;
  escalao_manuel?: number;
  url_resultados?: string;
  escaloes: EscalaoResult[];
  ultima_atualizacao: string;
}
interface ResultsData { gerado_em: string; resultados: TorneioResult[]; }

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const ESCALOES_DESTAQUE  = new Set(["Boys 10","Boys 11","Boys 12","Boys 13","Boys 13-14"]);
const ESCALAO_MANUEL     = "Boys 12";
const MANUEL_FRAGMENT    = "medeiros";

const FLAG: Record<string,string> = {
  PT:"🇵🇹",GB:"🇬🇧",IE:"🇮🇪",FR:"🇫🇷",ES:"🇪🇸",DE:"🇩🇪",IT:"🇮🇹",
  NL:"🇳🇱",SE:"🇸🇪",NO:"🇳🇴",DK:"🇩🇰",FI:"🇫🇮",US:"🇺🇸",CA:"🇨🇦",
  AU:"🇦🇺",ZA:"🇿🇦",MX:"🇲🇽",JP:"🇯🇵",KR:"🇰🇷",CH:"🇨🇭",CN:"🇨🇳",
  IN:"🇮🇳",BR:"🇧🇷",AR:"🇦🇷",BE:"🇧🇪",PL:"🇵🇱",SK:"🇸🇰",HU:"🇭🇺",
  RU:"🇷🇺",PH:"🇵🇭",SG:"🇸🇬",CZ:"🇨🇿",
};
const flag = (p: string) => FLAG[p?.toUpperCase()] ?? p;

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function badgeVagas(vagas: number, maximo: number) {
  if (maximo === 0) return null;
  if (vagas === 0)  return { bg:"#7f0000", cor:"#ffcdd2", label:"FULL" };
  if (vagas <= 1)   return { bg:"#b71c1c", cor:"#ffcdd2", label:`+${vagas}` };
  if (vagas <= 3)   return { bg:"#e65100", cor:"#ffe0b2", label:`+${vagas}` };
  if (vagas <= 6)   return { bg:"#f57f17", cor:"#fff9c4", label:`+${vagas}` };
  return               { bg:"#1b5e20", cor:"#c8e6c9", label:`+${vagas}` };
}

function isoDate(s: string): string {
  if (!s) return "";
  if (s.includes("-")) return s;
  const [m,d,y] = s.split("/");
  return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
}

function fmtDate(s: string) {
  const iso = isoDate(s);
  if (!iso) return s;
  return new Date(iso).toLocaleDateString("pt-PT",{day:"2-digit",month:"short",year:"numeric"});
}

function fmtTs(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-PT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
}

function diasAte(s: string) {
  const iso = isoDate(s);
  if (!iso) return 999;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function isManuel(nome: string) {
  return nome.toLowerCase().includes(MANUEL_FRAGMENT);
}

// ─────────────────────────────────────────────
// SCORECARD
// ─────────────────────────────────────────────
function TabelaRonda({ ronda, expanded, onToggle }: { ronda: RondaResult; expanded: boolean; onToggle: () => void }) {
  const jogadores = ronda.leaderboard ?? ronda.jogadores ?? [];
  const buracos   = ronda.buracos || 18;
  const par       = ronda.par?.length ? ronda.par : undefined;
  const totalPar  = ronda.total_par;
  const front9    = jogadores[0]?.strokes?.slice(0,9) ?? [];
  const has18     = buracos >= 18;

  // Totais out/in para cada jogador
  const getStrokes = (j: RondaJogador) => j.strokes?.length ? j.strokes : (j.rondas?.["1"]?.strokes ?? []);
  const outPar = par?.slice(0,9).reduce((s,p)=>s+p,0);
  const inPar  = par?.slice(9,18).reduce((s,p)=>s+p,0);

  return (
    <div style={{marginBottom:8, border:"1px solid var(--border)", borderRadius:8, overflow:"hidden"}}>
      {/* Header da ronda */}
      <div onClick={onToggle} style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"8px 12px", cursor:"pointer",
        background: expanded ? "var(--bg-header)" : "var(--bg-card)",
        borderBottom: expanded ? "1px solid var(--border)" : "none",
      }}>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <span style={{fontWeight:700, fontSize:13, color:"var(--text)"}}>Ronda {ronda.ronda}</span>
          {totalPar && <span style={{fontSize:11, color:"var(--text-3)"}}>Par {totalPar}</span>}
          <span style={{fontSize:11, color:"var(--text-3)"}}>{jogadores.length} jogadores · {buracos}H</span>
        </div>
        {/* Mini resumo dos top 3 */}
        {!expanded && jogadores.slice(0,3).map((j,i) => (
          <span key={i} style={{
            fontSize:10, color:isManuel(j.nome)?"var(--color-info)":"var(--text-3)",
            fontWeight:isManuel(j.nome)?700:400,
          }}>
            {i+1}. {j.nome.split(" ")[0]} {j.to_par!==null&&j.to_par!==undefined?(j.to_par===0?"E":j.to_par>0?"+"+j.to_par:j.to_par):"–"}
          </span>
        ))}
        <span style={{color:"var(--text-3)", fontSize:12}}>{expanded?"▲":"▼"}</span>
      </div>

      {expanded && (
        <div style={{overflowX:"auto"}}>
          <table className="tourn-scorecard" style={{width:"100%", minWidth:500}}>
            <thead>
              {/* Linha par */}
              {par && (
                <tr className="sc-par-row">
                  <td className="tourn-lbl" colSpan={3}>PAR</td>
                  {par.slice(0,9).map((p,i) => <td key={i} className="tourn-hole-cell" style={{fontSize:10,fontWeight:600,color:"var(--text-2)"}}>{p}</td>)}
                  {has18 && <td className="tourn-sum-col" style={{fontSize:10,fontWeight:600}}>{outPar}</td>}
                  {has18 && par.slice(9,18).map((p,i) => <td key={i} className="tourn-hole-cell" style={{fontSize:10,fontWeight:600,color:"var(--text-2)"}}>{p}</td>)}
                  {has18 && <td className="tourn-sum-col" style={{fontSize:10,fontWeight:600}}>{inPar}</td>}
                  <td className="tourn-sum-col" style={{fontSize:10,fontWeight:600}}>{totalPar}</td>
                  <td/><td/>
                </tr>
              )}
              {/* Números dos buracos */}
              <tr style={{background:"var(--bg-header)"}}>
                <th className="tourn-pos-col">#</th>
                <th className="tourn-lb-name-col">Jogador</th>
                <th style={{width:28}}></th>
                {Array.from({length:9},(_,i)=>(
                  <th key={i} className="tourn-hole-cell" style={{fontSize:10,color:"var(--text-3)",fontWeight:400}}>{i+1}</th>
                ))}
                {has18 && <th className="tourn-sum-col" style={{fontSize:10}}>OUT</th>}
                {has18 && Array.from({length:9},(_,i)=>(
                  <th key={i+9} className="tourn-hole-cell" style={{fontSize:10,color:"var(--text-3)",fontWeight:400}}>{i+10}</th>
                ))}
                {has18 && <th className="tourn-sum-col" style={{fontSize:10}}>IN</th>}
                <th className="tourn-sum-col" style={{fontSize:11}}>TOT</th>
                <th className="tourn-sum-col" style={{fontSize:11}}>±</th>
                {jogadores.some(j=>j.pontos>0) && <th className="tourn-sum-col" style={{fontSize:11}}>PTS</th>}
              </tr>
            </thead>
            <tbody>
              {jogadores.map((j,i) => {
                const st = getStrokes(j);
                const out9 = st.slice(0,9).reduce((s,v)=>s+(v||0),0);
                const in9  = st.slice(9,18).reduce((s,v)=>s+(v||0),0);
                const manuel = isManuel(j.nome);
                return (
                  <tr key={i} style={{
                    background: manuel ? "var(--bg-info)" : i%2===0?"var(--bg-card)":"var(--bg-detail)",
                    fontWeight: manuel ? 700 : 400,
                  }}>
                    <td className="tourn-pos-col" style={{textAlign:"center"}}>
                      <span className="tourn-pos">{i+1}</span>
                    </td>
                    <td className="tourn-lb-name-col">
                      {manuel && <span style={{color:"var(--color-warn)",marginRight:4}}>★</span>}
                      {j.nome}
                    </td>
                    <td style={{textAlign:"center",fontSize:13}}>{flag(j.pais)}</td>
                    {st.slice(0,9).map((s,idx) => <ScoreCell key={idx} s={s} par={par?.[idx]} />)}
                    {has18 && <td className="tourn-sum-col">{out9||"–"}</td>}
                    {has18 && st.slice(9,18).map((s,idx) => <ScoreCell key={idx+9} s={s} par={par?.[idx+9]} />)}
                    {has18 && <td className="tourn-sum-col">{in9||"–"}</td>}
                    <td className={`tourn-sum-col ${j.score && j.to_par!==null && j.to_par!==undefined && j.to_par<0?"tourn-sum-under":""}`}
                      style={{fontWeight:700}}>
                      {j.score||"–"}
                    </td>
                    <td className="tourn-sum-col" style={{
                      fontWeight:700,
                      color: (j.to_par===null||j.to_par===undefined)?"var(--text-3)":j.to_par<0?"var(--color-good)":j.to_par===0?"var(--text-2)":"var(--color-danger)",
                    }}>
                      {j.to_par===null||j.to_par===undefined?"–":j.to_par===0?"E":j.to_par>0?"+"+j.to_par:j.to_par}
                    </td>
                    {jogadores.some(jj=>jj.pontos>0) && (
                      <td className="tourn-sum-col" style={{color:"var(--color-amber)",fontWeight:700}}>
                        {j.pontos>0?j.pontos:"–"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB CAMPO
// ─────────────────────────────────────────────
function TabCampo({ data }: { data: FieldData }) {
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  const toggle = (t: number) => setAbertos(p => {
    const n = new Set(p); n.has(t) ? n.delete(t) : n.add(t); return n;
  });

  return (
    <div>
      <div style={{ color:"#37474f", fontSize:11, marginBottom:14 }}>
        Actualizado {fmtTs(data.gerado_em)} · ★ = categoria do Manuel
      </div>

      {data.torneios.map(t => {
        const isAberto = abertos.has(t.t);
        const b12      = t.escaloes.find(e => e.nome === ESCALAO_MANUEL);
        const ptTotal  = t.escaloes.flatMap(e => e.jogadores ?? []).filter(j => j.pais === "PT");
        const dias     = diasAte(t.date_inicio);
        const urgente  = b12 && b12.vagas <= 3 && b12.vagas > 0;

        return (
          <div key={t.t} style={{
            background:"#0d1f2d",
            border:`1px solid ${urgente ? "#e65100" : "#1e3448"}`,
            borderRadius:10, marginBottom:12, overflow:"hidden",
          }}>
            <div onClick={() => toggle(t.t)} style={{
              cursor:"pointer", padding:"13px 16px",
              display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12
            }}>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:3, flexWrap:"wrap" }}>
                  <span style={{ fontSize:15, fontWeight:700, color:"#e0e0e0" }}>
                    {t.emoji} {t.name}
                  </span>
                  {dias >= 0 && dias <= 14 && (
                    <span style={{ background:"#4a148c", color:"#e1bee7",
                      padding:"1px 7px", borderRadius:8, fontSize:10 }}>daqui a {dias}d</span>
                  )}
                  {dias < 0 && diasAte(t.date_fim ?? t.date_inicio) >= -1 && (
                    <span style={{ background:"#1b5e20", color:"#c8e6c9",
                      padding:"1px 7px", borderRadius:8, fontSize:10 }}>em curso</span>
                  )}
                </div>
                <div style={{ fontSize:11, color:"#546e7a" }}>
                  📅 {fmtDate(t.date_inicio)}
                  {t.date_fim && t.date_fim !== t.date_inicio ? ` → ${fmtDate(t.date_fim)}` : ""}
                  {t.rondas ? ` · ${t.rondas}R` : ""}
                  {t.campo   ? ` · ${t.campo}` : ""}
                  {t.fee_18  ? ` · 💵 ${t.fee_18}` : ""}
                </div>
                {t.sem_flights && (
                  <div style={{ color:"#546e7a", fontSize:11, marginTop:4 }}>⏳ Flights ainda não publicados</div>
                )}
                {t.erro && <div style={{ color:"#ef9a9a", fontSize:11, marginTop:4 }}>⚠️ {t.erro}</div>}
                {!t.erro && !t.sem_flights && (
                  <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                    <span style={{ background:"#1b3a1b", color:"#81c784",
                      padding:"2px 8px", borderRadius:8, fontSize:11 }}>
                      {t.total_inscritos}/{t.total_maximo}
                    </span>
                    {b12 && (() => {
                      const bd = badgeVagas(b12.vagas, b12.maximo);
                      return bd ? (
                        <span style={{ background:bd.bg, color:bd.cor,
                          padding:"2px 8px", borderRadius:8, fontSize:11, fontWeight:700 }}>
                          ★ Boys 12: {b12.inscritos}/{b12.maximo} ({bd.label})
                        </span>
                      ) : null;
                    })()}
                    {ptTotal.length > 0 && (
                      <span style={{ background:"#1a237e", color:"#9fa8da",
                        padding:"2px 8px", borderRadius:8, fontSize:11 }}>
                        🇵🇹 {ptTotal.map(j=>j.nome).join(", ")}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span style={{ color:"#546e7a", fontSize:14, userSelect:"none" }}>
                {isAberto ? "▲" : "▼"}
              </span>
            </div>

            {isAberto && !t.erro && !t.sem_flights && (
              <div style={{ borderTop:"1px solid #1e3448", padding:"12px 16px" }}>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))", gap:6, marginBottom:12 }}>
                  {t.escaloes.map(e => {
                    const bd  = badgeVagas(e.vagas, e.maximo);
                    const dst = ESCALOES_DESTAQUE.has(e.nome);
                    const man = e.nome === ESCALAO_MANUEL;
                    return (
                      <div key={e.age_group} style={{
                        background: man?"#0d2a4a":dst?"#0d1f35":"#0a1628",
                        border:`1px solid ${man?"#1565c0":dst?"#1a3a5c":"transparent"}`,
                        borderRadius:6, padding:"7px 10px",
                      }}>
                        <div style={{ display:"flex", justifyContent:"space-between",
                          alignItems:"center", marginBottom: e.jogadores?.length ? 5 : 0 }}>
                          <span style={{ fontSize:11, color:man?"#90caf9":dst?"#78909c":"#546e7a" }}>
                            {man?"★ ":""}{e.nome}
                            <span style={{ color:"#37474f", fontSize:10, marginLeft:3 }}>({e.holes}H)</span>
                          </span>
                          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                            <span style={{ fontSize:10, color:"#546e7a" }}>{e.inscritos}/{e.maximo}</span>
                            {bd && <span style={{ background:bd.bg, color:bd.cor,
                              padding:"1px 5px", borderRadius:5, fontSize:9, fontWeight:700 }}>{bd.label}</span>}
                          </div>
                        </div>
                        {e.jogadores && e.jogadores.length > 0 && (
                          <div style={{ borderTop:"1px solid #0d1628", paddingTop:4 }}>
                            {e.jogadores.map((j,i) => (
                              <div key={i} style={{ display:"flex", justifyContent:"space-between",
                                fontSize:10, padding:"1px 0",
                                color: j.pais==="PT" ? "#90caf9" : "#607d8b" }}>
                                <span>{j.nome}</span>
                                <span title={j.cidade}>{flag(j.pais)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {!e.jogadores && e.paises && e.paises.length > 0 && (
                          <div style={{ fontSize:10, color:"#455a64", marginTop:3 }}>
                            {e.paises.slice(0,5).map(p=>`${flag(p.pais)}${p.n}`).join(" ")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {ptTotal.length > 0 && (
                  <div style={{ background:"#1a237e", borderRadius:8, padding:"10px 14px", marginBottom:8 }}>
                    <div style={{ color:"#7986cb", fontWeight:700, fontSize:12, marginBottom:6 }}>🇵🇹 Portugueses inscritos</div>
                    {t.escaloes.filter(e=>e.jogadores?.some(j=>j.pais==="PT")).map(e=>(
                      <div key={e.age_group} style={{ marginBottom:4 }}>
                        <div style={{ color:"#5c6bc0", fontSize:10, marginBottom:1 }}>{e.nome}</div>
                        {e.jogadores!.filter(j=>j.pais==="PT").map((j,i)=>(
                          <div key={i} style={{ color:"#c5cae9", fontSize:12, paddingLeft:8 }}>
                            {j.nome} <span style={{ color:"#546e7a", fontSize:10 }}>{j.cidade}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ textAlign:"right", color:"#263238", fontSize:10 }}>
                  {fmtTs(t.ultima_atualizacao)}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB RESULTADOS
// ─────────────────────────────────────────────
function TabResultados({ data }: { data: ResultsData }) {
  const [expandedRondas, setExpandedRondas] = useState<Set<string>>(() => {
    // Expandir automaticamente o escalão do Manuel na ronda 1
    const s = new Set<string>();
    for (const t of data.resultados) {
      const em = t.escaloes.find(e => e.is_manuel);
      if (em && em.rondas[0]) s.add(`${t.t}-${em.age_group}-1`);
    }
    return s;
  });
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  const toggle = (t: number) => setAbertos(p => {
    const n = new Set(p); n.has(t) ? n.delete(t) : n.add(t); return n;
  });

  if (!data.resultados.length) return (
    <div style={{ color:"#37474f", padding:"32px 0", textAlign:"center", fontSize:13 }}>
      Sem resultados ainda — os scorecards aparecerão aqui durante e após os torneios
    </div>
  );

  return (
    <div>
      <div style={{ color:"#37474f", fontSize:11, marginBottom:14 }}>
        Actualizado {fmtTs(data.gerado_em)}
      </div>

      {data.resultados.map(t => {
        const isAberto = abertos.has(t.t);

        // Resumo do Manuel neste torneio
        const manuelRows = t.escaloes.flatMap(e =>
          e.rondas.flatMap(r =>
            (r.leaderboard ?? r.jogadores ?? [])
              .filter(j => isManuel(j.nome))
              .map(j => ({ escalao:e.nome, ronda:r.ronda, ...j }))
          )
        );

        return (
          <div key={t.t} style={{ background:"#0d1f2d", border:"1px solid #1e3448",
            borderRadius:10, marginBottom:12, overflow:"hidden" }}>
            <div onClick={() => toggle(t.t)} style={{ cursor:"pointer", padding:"13px 16px",
              display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:700, color:"#e0e0e0", marginBottom:3 }}>
                  {t.name}
                </div>
                <div style={{ fontSize:11, color:"#546e7a", display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                  <span>📅 {fmtDate(t.date_inicio)}{t.campo ? ` · ${t.campo}` : ""}</span>
                  {t.url_resultados && (
                    <a href={t.url_resultados} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ color:"#546e7a", fontSize:10, textDecoration:"none",
                        border:"1px solid #1e3448", borderRadius:5, padding:"1px 7px" }}>
                      ver fonte ↗
                    </a>
                  )}
                </div>
                {manuelRows.length > 0 && (
                  <div style={{ marginTop:7, display:"flex", gap:6, flexWrap:"wrap" }}>
                    {manuelRows.map((m,i) => (
                      <span key={i} style={{ background:"#0d2a4a", border:"1px solid #1565c0",
                        color:"#90caf9", padding:"2px 10px", borderRadius:8, fontSize:11, fontWeight:700 }}>
                        ★ {m.escalao} R{m.ronda}: {m.score} pan · {m.pontos} pts
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span style={{ color:"#546e7a", fontSize:14, userSelect:"none" }}>
                {isAberto ? "▲" : "▼"}
              </span>
            </div>

            {isAberto && (
              <div style={{ borderTop:"1px solid #1e3448", padding:"12px 16px" }}>
                {t.escaloes.map(e => {
                  const isManuelEscalao = e.is_manuel ||
                    (t.escalao_manuel ? e.age_group === t.escalao_manuel : e.nome === ESCALAO_MANUEL);
                  const rondasComDados = e.rondas.filter(r =>
                    (r.leaderboard ?? r.jogadores ?? []).length > 0
                  );
                  return (
                  <div key={e.age_group} style={{ marginBottom:20 }}>
                    <div style={{ fontSize:12, fontWeight:700,
                      color: isManuelEscalao ? "#90caf9" : "#546e7a",
                      borderBottom:`1px solid ${isManuelEscalao ? "#1565c0" : "#1e3448"}`,
                      paddingBottom:5, marginBottom:8 }}>
                      {isManuelEscalao ? "★ " : ""}{e.nome}
                    </div>
                    {rondasComDados.map(r => {
                      const key = `${t.t}-${e.age_group}-${r.ronda}`;
                      return (
                        <TabelaRonda key={key} ronda={r}
                          expanded={expandedRondas.has(key)}
                          onToggle={() => setExpandedRondas(prev => {
                            const s = new Set(prev);
                            s.has(key) ? s.delete(key) : s.add(key);
                            return s;
                          })}
                        />
                      );
                    })}
                  </div>
                  );
                })}
                <div style={{ textAlign:"right", color:"#263238", fontSize:10 }}>
                  {fmtTs(t.ultima_atualizacao)}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB RIVAIS
// ─────────────────────────────────────────────

interface Encontro {
  torneio_t: number;
  torneio_nome: string;
  torneio_data: string;
  escalao: string;
  man_score: number;
  rival_score: number;
  man_to_par: number | null;
  rival_to_par: number | null;
  man_pos: number;
  rival_pos: number;
}

interface RivalInfo {
  nome: string; pais: string; cidade: string;
  encontros: Encontro[];
}

function TabelaConhecidos({
  torneioT, torneioNome, rivals, fieldData, intlData,
}: {
  torneioT: number; torneioNome: string;
  rivals: RivalInfo[]; fieldData: FieldData | null; intlData: IntlData | null;
}) {
  const torneio = fieldData?.torneios.find(t => t.t === torneioT);
  if (!torneio) return (
    <div style={{ color:"var(--text-3)", fontSize:12 }}>Dados de inscritos não disponíveis para {torneioNome}</div>
  );

  const inscritos: { nome: string; pais: string; escalao: string }[] = [];
  for (const e of torneio.escaloes) {
    for (const j of (e.jogadores ?? [])) inscritos.push({ ...j, escalao: e.nome });
  }

  if (!inscritos.length) return (
    <div style={{ color:"var(--text-3)", fontSize:12 }}>Sem inscritos ainda</div>
  );

  const rivalMap = new Map(rivals.map(r => [r.nome.toLowerCase().trim(), r]));
  const conhecidos    = inscritos.filter(j => rivalMap.has(j.nome.toLowerCase().trim()));
  const desconhecidos = inscritos.filter(j => !rivalMap.has(j.nome.toLowerCase().trim()));

  return (
    <div>
      <div style={{ fontWeight:700, fontSize:14, color:"var(--text)", marginBottom:4 }}>
        {torneioNome}
      </div>
      <div style={{ fontSize:12, color:"var(--text-3)", marginBottom:12 }}>
        <span style={{ color:"var(--color-good)", fontWeight:700 }}>{conhecidos.length} conhecidos</span>
        {" · "}
        {desconhecidos.length} ainda não cruzou
        {" · "}
        {inscritos.length} total inscritos
      </div>

      {conhecidos.length === 0 ? (
        <div style={{ fontSize:13, color:"var(--text-3)", padding:"16px 0" }}>
          Nenhum adversário conhecido ainda inscrito neste torneio.
        </div>
      ) : (
        <table className="tourn-scorecard" style={{ width:"100%", marginBottom:16 }}>
          <thead>
            <tr>
              <th className="tourn-lb-name-col">Jogador</th>
              <th style={{ width:30 }}></th>
              <th style={{ textAlign:"center", width:80, fontSize:10 }}>Escalão</th>
              <th style={{ textAlign:"left", fontSize:10 }}>Quando se encontraram</th>
            </tr>
          </thead>
          <tbody>
            {conhecidos.map((j, i) => {
              const rival = rivalMap.get(j.nome.toLowerCase().trim())!;
              const torneiosUnicos = [...new Map(rival.encontros.map(e => [e.torneio_t, e])).values()];
              return (
                <tr key={i} style={{ background: i%2===0 ? "var(--bg-card)" : "var(--bg-detail)" }}>
                  <td className="tourn-lb-name-col">{j.nome}</td>
                  <td style={{ textAlign:"center" }}>{flag(j.pais)}</td>
                  <td style={{ textAlign:"center", fontSize:11, color:"var(--text-3)" }}>{j.escalao}</td>
                  <td style={{ fontSize:11, padding:"5px 8px" }}>
                    {torneiosUnicos.map(enc => {
                      const manMelhor = enc.man_pos < enc.rival_pos;
                      const manPior   = enc.man_pos > enc.rival_pos;
                      return (
                        <span key={enc.torneio_t} style={{ marginRight:12, whiteSpace:"nowrap" }}>
                          <span style={{ color:"var(--text-2)" }}>{enc.torneio_nome.replace(/\s\d{4}$/, "")}</span>
                          <span style={{ marginLeft:5 }}>
                            <span style={{ fontWeight:700, color: manMelhor?"var(--color-good)":manPior?"var(--color-danger)":"var(--text-3)" }}>
                              {enc.man_pos}º
                            </span>
                            <span style={{ color:"var(--text-3)" }}> vs </span>
                            <span style={{ fontWeight:700, color:"var(--text-2)" }}>{enc.rival_pos}º</span>
                          </span>
                          {enc.man_to_par !== null && (
                            <span style={{ marginLeft:4, fontSize:10, color:"var(--text-3)" }}>
                              ({enc.man_to_par===0?"E":enc.man_to_par>0?"+"+enc.man_to_par:enc.man_to_par}
                              {" vs "}
                              {enc.rival_to_par===null?"-":enc.rival_to_par===0?"E":enc.rival_to_par>0?"+"+enc.rival_to_par:enc.rival_to_par})
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TabRivais({ data, fieldData, intlData }: { data: ResultsData; fieldData: FieldData | null; intlData: IntlData | null }) {
  const [filtro, setFiltro] = useState("");
  const [ordem,  setOrdem]  = useState<"encontros"|"pais"|"nome">("encontros");
  const [vista,  setVista]  = useState<"lista"|"marco"|"european">("lista");

  const rivals = useMemo<RivalInfo[]>(() => {
    const mapa = new Map<string, RivalInfo>();

    for (const t of data.resultados) {
      for (const e of t.escaloes) {
        const todasRondas = e.rondas.flatMap(r => r.leaderboard ?? r.jogadores ?? []);
        const manuelJogs = todasRondas.filter(j => isManuel(j.nome));
        if (!manuelJogs.length) continue;

        const manuelJog = manuelJogs[0];
        const lb0 = e.rondas[0]?.leaderboard ?? e.rondas[0]?.jogadores ?? [];
        const manuelPos = lb0.findIndex(j => isManuel(j.nome)) + 1 || 99;

        const adversariosVistos = new Set<string>();
        for (const r of e.rondas) {
          for (const j of (r.leaderboard ?? r.jogadores ?? [])) {
            if (!isManuel(j.nome)) adversariosVistos.add(j.nome.trim());
          }
        }

        for (const nomeAdv of adversariosVistos) {
          const key = nomeAdv.toLowerCase().trim();
          const advJog = todasRondas.find(j => j.nome.trim() === nomeAdv);
          if (!advJog) continue;
          const advPos = lb0.findIndex(j => j.nome.trim() === nomeAdv) + 1 || 99;

          if (!mapa.has(key)) {
            mapa.set(key, { nome: advJog.nome, pais: advJog.pais, cidade: advJog.cidade, encontros: [] });
          }
          mapa.get(key)!.encontros.push({
            torneio_t:    t.t,
            torneio_nome: t.name,
            torneio_data: t.date_inicio,
            escalao:      e.nome,
            man_score:    manuelJog.score || 0,
            rival_score:  advJog.score || 0,
            man_to_par:   manuelJog.to_par ?? null,
            rival_to_par: advJog.to_par ?? null,
            man_pos:      manuelPos,
            rival_pos:    advPos,
          });
        }
      }
    }
    return [...mapa.values()];
  }, [data]);

  const ordenados = useMemo(() => {
    let lista = filtro.trim()
      ? rivals.filter(r =>
          r.nome.toLowerCase().includes(filtro.toLowerCase()) ||
          r.pais.toLowerCase().includes(filtro.toLowerCase()))
      : [...rivals];
    if (ordem === "encontros") lista.sort((a,b) => b.encontros.length - a.encontros.length);
    else if (ordem === "pais")  lista.sort((a,b) => a.pais.localeCompare(b.pais));
    else lista.sort((a,b) => a.nome.localeCompare(b.nome));
    return lista;
  }, [rivals, filtro, ordem]);

  if (!rivals.length) return (
    <div style={{ color:"var(--text-3)", padding:"32px 0", textAlign:"center", fontSize:13 }}>
      Sem dados de rivais ainda — os scorecards aparecem após os torneios
    </div>
  );

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:16, borderBottom:"1px solid var(--border)", paddingBottom:8, flexWrap:"wrap" }}>
        {([
          { key:"lista",    label:`Todos os adversários (${rivals.length})` },
          { key:"marco",    label:"Marco Simone — já conhece?" },
          { key:"european", label:"European Championship — já conhece?" },
        ] as const).map(v => (
          <button key={v.key} onClick={() => setVista(v.key)} style={{
            padding:"5px 12px", fontSize:11, borderRadius:6, cursor:"pointer",
            background: vista===v.key ? "var(--bg-active)" : "var(--bg-card)",
            border:`1px solid ${vista===v.key ? "var(--border-success)" : "var(--border)"}`,
            fontWeight: vista===v.key ? 700 : 400, color:"var(--text-2)",
          }}>{v.label}</button>
        ))}
      </div>

      {vista === "marco" && (
        <TabelaConhecidos torneioT={21080} torneioNome="Marco Simone Invitational 2026"
          rivals={rivals} fieldData={fieldData} intlData={intlData} />
      )}
      {vista === "european" && (
        <TabelaConhecidos torneioT={21131} torneioNome="European Championship 2026"
          rivals={rivals} fieldData={fieldData} intlData={intlData} />
      )}

      {vista === "lista" && (<>
        <div style={{ display:"flex", gap:8, marginBottom:12, alignItems:"center", flexWrap:"wrap" }}>
          <input value={filtro} onChange={e=>setFiltro(e.target.value)}
            placeholder="Nome ou país…"
            style={{ border:"1px solid var(--border)", borderRadius:7,
              color:"var(--text)", background:"var(--bg-card)",
              padding:"6px 11px", fontSize:12, width:180, outline:"none" }} />
          {(["encontros","nome","pais"] as const).map(o => (
            <button key={o} onClick={() => setOrdem(o)} style={{
              background: ordem===o ? "var(--bg-active)" : "var(--bg-card)",
              border:`1px solid ${ordem===o ? "var(--border-success)" : "var(--border)"}`,
              color:"var(--text-2)", borderRadius:7, padding:"5px 10px",
              fontSize:11, cursor:"pointer", fontWeight: ordem===o ? 700 : 400,
            }}>
              {o === "encontros" ? "Mais encontros" : o === "nome" ? "Nome" : "País"}
            </button>
          ))}
          <span style={{ color:"var(--text-3)", fontSize:11 }}>{ordenados.length} jogadores</span>
        </div>

        <table className="tourn-scorecard" style={{ width:"100%" }}>
          <thead>
            <tr>
              <th className="tourn-pos-col">#</th>
              <th className="tourn-lb-name-col">Jogador</th>
              <th style={{ width:30 }}></th>
              <th style={{ textAlign:"center", width:70, fontSize:10 }}>Torneios</th>
              <th style={{ textAlign:"left", fontSize:10, padding:"6px 8px" }}>Historial</th>
            </tr>
          </thead>
          <tbody>
            {ordenados.map((r, i) => {
              const torneiosUnicos = [...new Map(r.encontros.map(e => [e.torneio_t, e])).values()];
              return (
                <tr key={r.nome} style={{ background: i%2===0 ? "var(--bg-card)" : "var(--bg-detail)" }}>
                  <td className="tourn-pos-col" style={{ textAlign:"center" }}>
                    <span className="tourn-pos">{i+1}</span>
                  </td>
                  <td className="tourn-lb-name-col">
                    {r.nome}
                    {r.cidade && <span style={{ color:"var(--text-3)", fontSize:10, marginLeft:6 }}>{r.cidade}</span>}
                  </td>
                  <td style={{ textAlign:"center", fontSize:14 }}>{flag(r.pais)}</td>
                  <td style={{ textAlign:"center", fontWeight:700, color:"var(--text-2)" }}>
                    {torneiosUnicos.length}
                  </td>
                  <td style={{ fontSize:11, color:"var(--text-3)", padding:"5px 8px" }}>
                    {/* USKids */}
                    {torneiosUnicos.map(enc => {
                      const manMelhor = enc.man_pos < enc.rival_pos;
                      const manPior   = enc.man_pos > enc.rival_pos;
                      return (
                        <span key={enc.torneio_t} style={{ marginRight:12, whiteSpace:"nowrap" }}>
                          <span style={{ color:"var(--text-2)" }}>
                            {enc.torneio_nome.replace(/\s\d{4}$/, "")}
                          </span>
                          <span style={{ marginLeft:5 }}>
                            <span style={{ fontWeight:700, color: manMelhor?"var(--color-good)":manPior?"var(--color-danger)":"var(--text-3)" }}>
                              {enc.man_pos}º
                            </span>
                            <span style={{ color:"var(--text-3)" }}> vs </span>
                            <span style={{ fontWeight:700, color:"var(--text-2)" }}>{enc.rival_pos}º</span>
                          </span>
                        </span>
                      );
                    })}
                    {/* BJGT/Intl */}
                    {(() => {
                      const intlJog = intlData?.jogadores.find(j =>
                        j.n.toLowerCase().trim() === r.nome.toLowerCase().trim() && !j.isM
                      );
                      if (!intlJog) return null;
                      const torns = intlData!.torneios.filter(t => intlJog.r[t.id]);
                      if (!torns.length) return null;
                      return torns.map(t => {
                        const res = intlJog.r[t.id];
                        const manRes = intlData!.jogadores.find(j => j.isM)?.r[t.id];
                        const manMelhor = manRes && res.p > manRes.p;
                        const manPior   = manRes && res.p < manRes.p;
                        return (
                          <span key={t.id} style={{ marginRight:12, whiteSpace:"nowrap" }}>
                            <span style={{ color:"var(--color-info)", fontSize:9, fontWeight:700,
                              border:"1px solid var(--border-info)", borderRadius:3,
                              padding:"0 3px", marginRight:3 }}>BJGT</span>
                            <a href={t.url} target="_blank" rel="noopener noreferrer"
                              style={{ color:"var(--text-2)", textDecoration:"none" }}>{t.short}</a>
                            {manRes && (
                              <span style={{ marginLeft:4 }}>
                                <span style={{ fontWeight:700, color: manMelhor?"var(--color-good)":manPior?"var(--color-danger)":"var(--text-3)" }}>
                                  {manRes.p}º
                                </span>
                                <span style={{ color:"var(--text-3)" }}> vs </span>
                                <span style={{ fontWeight:700, color:"var(--text-2)" }}>{res.p}º</span>
                              </span>
                            )}
                          </span>
                        );
                      });
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </>)}
    </div>
  );
}

// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
type Tab = "campo" | "resultados" | "rivais";

export default function USKidsFieldPage() {
  const [fieldData,   setFieldData]   = useState<FieldData | null>(null);
  const [resultsData, setResultsData] = useState<ResultsData | null>(null);
  const [intlData,    setIntlData]    = useState<IntlData | null>(null);
  const [tab,         setTab]         = useState<Tab>("campo");
  const [erro,        setErro]        = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/uskids-field.json?v=" + Date.now())
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setFieldData)
      .catch(e => setErro(e.message));

    fetch("/data/uskids-results.json?v=" + Date.now())
      .then(r => r.ok ? r.json() : { gerado_em:"", resultados:[] })
      .then(setResultsData)
      .catch(() => setResultsData({ gerado_em:"", resultados:[] }));
  }, []);

  const nResultados = resultsData?.resultados?.length ?? 0;

  const nRivais = useMemo(() => {
    if (!resultsData) return 0;
    const nomes = new Set<string>();
    for (const t of resultsData.resultados)
      for (const e of t.escaloes)
        for (const r of e.rondas)
          for (const j of (r.leaderboard ?? r.jogadores ?? []))
            if (!isManuel(j.nome)) nomes.add(j.nome.toLowerCase().trim());
    return nomes.size;
  }, [resultsData]);

  if (erro) return (
    <div style={{ padding:32, color:"#ef9a9a", fontFamily:"monospace", fontSize:13 }}>
      ⚠️ {erro}
    </div>
  );
  if (!fieldData) return (
    <div style={{ padding:32, color:"#546e7a", fontSize:13 }}>A carregar…</div>
  );

  const TABS: { id: Tab; label: string; badge: number }[] = [
    { id:"campo",      label:"⛳ Campo",      badge: fieldData.torneios.length },
    { id:"resultados", label:"🏆 Resultados", badge: nResultados },
    { id:"rivais",     label:"🤝 Rivais",     badge: nRivais },
  ];

  return (
    <div style={{ padding:"20px 16px", maxWidth:900, margin:"0 auto",
      fontFamily:"system-ui, sans-serif" }}>

      <div style={{ marginBottom:20 }}>
        <h1 style={{ margin:0, fontSize:20, color:"#e0e0e0", fontWeight:700 }}>
          USKids Golf Internacional
        </h1>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:2, marginBottom:20, borderBottom:"1px solid #1e3448" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: tab===t.id ? "#0d2a4a" : "transparent",
            border:"none",
            borderBottom: `2px solid ${tab===t.id ? "#1565c0" : "transparent"}`,
            borderRadius:"6px 6px 0 0",
            color: tab===t.id ? "#90caf9" : "#546e7a",
            padding:"8px 14px", cursor:"pointer", fontSize:13,
            fontWeight: tab===t.id ? 700 : 400,
            display:"flex", alignItems:"center", gap:6,
          }}>
            {t.label}
            {t.badge > 0 && (
              <span style={{
                background: tab===t.id ? "#1565c0" : "#1e3448",
                color: tab===t.id ? "#e3f2fd" : "#546e7a",
                borderRadius:10, padding:"0 6px", fontSize:10, fontWeight:700,
              }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "campo"      && <TabCampo data={fieldData} />}
      {tab === "resultados" && (
        resultsData
          ? <TabResultados data={resultsData} />
          : <div style={{color:"#546e7a",padding:"24px 0"}}>A carregar resultados…</div>
      )}
      {tab === "rivais" && (
        resultsData
          ? <TabRivais data={resultsData} fieldData={fieldData} intlData={intlData} />
          : <div style={{color:"#546e7a",padding:"24px 0"}}>A carregar…</div>
      )}

      <div style={{ color:"#1e3448", fontSize:10, textAlign:"center", marginTop:16 }}>
        signupanytime.com · actualização automática diária
      </div>
    </div>
  );
}
