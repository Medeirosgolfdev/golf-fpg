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
interface FieldData { gerado_em: string; torneios: Torneio[]; }

// ─────────────────────────────────────────────
// TIPOS — RESULTADOS
// ─────────────────────────────────────────────
interface RondaJogador {
  nome: string; pais: string; cidade: string;
  pontos: number; score: number; tee: string;
  rondas: Record<string, {
    strokes: number[]; total: number; buracos: number;
    start_time: string; grupo: number;
  }>;
}
interface RondaResult    { ronda: number; jogadores: RondaJogador[]; }
interface EscalaoResult  { age_group: number; nome: string; rondas: RondaResult[]; }
interface TorneioResult  {
  t: number; name: string;
  date_inicio: string; date_fim?: string; campo: string | null;
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
function LinhaScorecard({ j, buracos }: { j: RondaJogador; buracos: number }) {
  const manuel  = isManuel(j.nome);
  const r1      = j.rondas?.["1"];
  const strokes = (r1?.strokes ?? []).slice(0, buracos);

  return (
    <tr style={{ background: manuel ? "rgba(144,202,249,0.07)" : undefined,
      borderBottom:"1px solid #0a1628" }}>
      <td style={{ padding:"5px 8px", fontSize:11,
        color: manuel ? "#90caf9" : "#90a4ae", whiteSpace:"nowrap" }}>
        {manuel && <span style={{marginRight:4,color:"#ffb74d"}}>★</span>}{j.nome}
      </td>
      <td style={{ padding:"5px 6px", textAlign:"center", fontSize:11 }}>{flag(j.pais)}</td>
      {strokes.map((s,i) => (
        <td key={i} style={{
          padding:"4px 4px", textAlign:"center", fontSize:10,
          fontVariantNumeric:"tabular-nums",
          color: s === 0 ? "#263238" : s <= 3 ? "#80cbc4" : s >= 7 ? "#ef9a9a" : "#cfd8dc",
        }}>{s || "·"}</td>
      ))}
      {strokes.length < buracos && Array.from({length: buracos - strokes.length}).map((_,i) => (
        <td key={"e"+i} style={{padding:"4px 4px",textAlign:"center",fontSize:10,color:"#263238"}}>·</td>
      ))}
      <td style={{ padding:"5px 8px", textAlign:"center", fontSize:12, fontWeight:700,
        color: manuel ? "#90caf9" : "#78909c" }}>{j.score || "–"}</td>
      <td style={{ padding:"5px 8px", textAlign:"center", fontSize:12, fontWeight:700,
        color:"#ffb74d" }}>{j.pontos > 0 ? j.pontos : "–"}</td>
    </tr>
  );
}

function TabelaRonda({ ronda, buracos }: { ronda: RondaResult; buracos: number }) {
  const nums = Array.from({length: buracos}, (_,i) => i+1);
  return (
    <div style={{ overflowX:"auto", marginBottom:14 }}>
      <div style={{ fontSize:10, color:"#546e7a", marginBottom:3, fontWeight:600 }}>
        RONDA {ronda.ronda}
      </div>
      <table style={{ borderCollapse:"collapse", fontSize:11, minWidth:400 }}>
        <thead>
          <tr style={{ background:"#060f1a", borderBottom:"1px solid #1e3448" }}>
            <th style={{padding:"4px 8px",textAlign:"left",color:"#37474f",fontWeight:400,minWidth:130}}>Jogador</th>
            <th style={{padding:"4px 6px",minWidth:22}}></th>
            {nums.map(n => (
              <th key={n} style={{padding:"3px 4px",textAlign:"center",color:"#263238",
                fontWeight:400,fontSize:9,minWidth:20}}>{n}</th>
            ))}
            <th style={{padding:"4px 8px",textAlign:"center",color:"#546e7a",fontSize:10}}>Tot</th>
            <th style={{padding:"4px 8px",textAlign:"center",color:"#ffb74d",fontSize:10}}>Pts</th>
          </tr>
        </thead>
        <tbody>
          {ronda.jogadores.map((j,i) => (
            <LinhaScorecard key={i} j={j} buracos={buracos} />
          ))}
        </tbody>
      </table>
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
            r.jogadores
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
                <div style={{ fontSize:11, color:"#546e7a" }}>
                  📅 {fmtDate(t.date_inicio)}
                  {t.campo ? ` · ${t.campo}` : ""}
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
                {t.escaloes.map(e => (
                  <div key={e.age_group} style={{ marginBottom:20 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"#546e7a",
                      borderBottom:"1px solid #1e3448", paddingBottom:5, marginBottom:8 }}>
                      {e.nome === ESCALAO_MANUEL ? "★ " : ""}{e.nome}
                    </div>
                    {e.rondas.filter(r => r.jogadores.length > 0).map(r => {
                      // inferir buracos do primeiro jogador que tenha dados
                      const buracos = r.jogadores[0]?.rondas?.["1"]?.buracos
                        ?? r.jogadores[0]?.rondas?.["1"]?.strokes?.filter(s=>s>0).length
                        ?? 9;
                      return <TabelaRonda key={r.ronda} ronda={r} buracos={buracos} />;
                    })}
                  </div>
                ))}
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
interface RivalInfo {
  nome: string; pais: string; cidade: string;
  encontros: number;
  man_ganhou: number;   // rondas em que Manuel teve mais pontos
  rival_ganhou: number;
  empates: number;
  torneios: { nome: string; data: string; manPts: number; rivPts: number; ronda: number }[];
}

function TabRivais({ data }: { data: ResultsData }) {
  const [filtro, setFiltro] = useState("");
  const [ordem,  setOrdem]  = useState<"encontros"|"pais"|"balance">("encontros");

  const rivais = useMemo<RivalInfo[]>(() => {
    const mapa = new Map<string, RivalInfo>();

    for (const t of data.resultados) {
      for (const e of t.escaloes) {
        for (const r of e.rondas) {
          const manuelJog = r.jogadores.find(j => isManuel(j.nome));
          if (!manuelJog) continue;

          for (const j of r.jogadores) {
            if (isManuel(j.nome)) continue;
            const key = j.nome.toLowerCase().trim();
            if (!mapa.has(key)) {
              mapa.set(key, { nome:j.nome, pais:j.pais, cidade:j.cidade,
                encontros:0, man_ganhou:0, rival_ganhou:0, empates:0, torneios:[] });
            }
            const rival = mapa.get(key)!;
            rival.encontros++;
            if (manuelJog.pontos > j.pontos) rival.man_ganhou++;
            else if (j.pontos > manuelJog.pontos) rival.rival_ganhou++;
            else rival.empates++;
            rival.torneios.push({
              nome: t.name, data: t.date_inicio,
              manPts: manuelJog.pontos, rivPts: j.pontos, ronda: r.ronda,
            });
          }
        }
      }
    }
    return [...mapa.values()];
  }, [data]);

  const ordenados = useMemo(() => {
    let lista = filtro.trim()
      ? rivais.filter(r =>
          r.nome.toLowerCase().includes(filtro.toLowerCase()) ||
          r.pais.toLowerCase().includes(filtro.toLowerCase()))
      : [...rivais];

    if (ordem === "encontros") lista.sort((a,b) => b.encontros - a.encontros);
    else if (ordem === "pais")  lista.sort((a,b) => a.pais.localeCompare(b.pais) || b.encontros - a.encontros);
    else lista.sort((a,b) => (b.man_ganhou - b.rival_ganhou) - (a.man_ganhou - a.rival_ganhou));
    return lista;
  }, [rivais, filtro, ordem]);

  if (!rivais.length) return (
    <div style={{ color:"#37474f", padding:"32px 0", textAlign:"center", fontSize:13 }}>
      Sem dados de rivais ainda — precisamos de resultados de torneios
    </div>
  );

  const totalEncontros = rivais.reduce((s,r) => s+r.encontros, 0);
  const totalManGanhou = rivais.reduce((s,r) => s+r.man_ganhou, 0);

  return (
    <div>
      {/* Resumo */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        {[
          { label:"Adversários", val: rivais.length, cor:"#78909c" },
          { label:"Rondas disputadas", val: totalEncontros, cor:"#78909c" },
          { label:"Manuel ganhou", val: `${totalManGanhou}`, cor:"#81c784" },
        ].map(s => (
          <div key={s.label} style={{ background:"#0a1628", border:"1px solid #1e3448",
            borderRadius:8, padding:"8px 14px", minWidth:110 }}>
            <div style={{ fontSize:18, fontWeight:700, color:s.cor }}>{s.val}</div>
            <div style={{ fontSize:10, color:"#546e7a" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:"flex", gap:8, marginBottom:12, alignItems:"center", flexWrap:"wrap" }}>
        <input value={filtro} onChange={e=>setFiltro(e.target.value)}
          placeholder="Nome ou país…"
          style={{ background:"#0a1628", border:"1px solid #1e3448", borderRadius:7,
            color:"#e0e0e0", padding:"6px 11px", fontSize:12, width:180, outline:"none" }} />
        {(["encontros","balance","pais"] as const).map(o => (
          <button key={o} onClick={() => setOrdem(o)} style={{
            background: ordem===o ? "#1e3448" : "transparent",
            border:`1px solid ${ordem===o?"#1565c0":"#1e3448"}`,
            color: ordem===o ? "#90caf9" : "#546e7a",
            borderRadius:7, padding:"5px 10px", fontSize:11, cursor:"pointer",
          }}>
            {o === "encontros" ? "Mais encontros" : o === "balance" ? "Balanço" : "Por país"}
          </button>
        ))}
        <span style={{ color:"#37474f", fontSize:11, marginLeft:4 }}>
          {ordenados.length} jogadores
        </span>
      </div>

      {/* Tabela */}
      <div style={{ overflowX:"auto" }}>
        <table style={{ borderCollapse:"collapse", width:"100%", fontSize:12 }}>
          <thead>
            <tr style={{ background:"#060f1a", borderBottom:"2px solid #1e3448" }}>
              {[
                {label:"#",        w:30,  align:"center" as const},
                {label:"Jogador",  w:160, align:"left"   as const},
                {label:"País",     w:40,  align:"center" as const},
                {label:"Rondas",   w:55,  align:"center" as const},
                {label:"M 🏆",     w:45,  align:"center" as const},
                {label:"R 🏆",     w:45,  align:"center" as const},
                {label:"=",        w:35,  align:"center" as const},
                {label:"Torneios", w:null,align:"left"   as const},
              ].map(h => (
                <th key={h.label} style={{ padding:"7px 8px", textAlign:h.align,
                  color:"#37474f", fontWeight:600, fontSize:10,
                  width:h.w ?? undefined }}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenados.map((r,i) => {
              const balance = r.man_ganhou - r.rival_ganhou;
              return (
                <tr key={r.nome} style={{ borderBottom:"1px solid #0a1628",
                  background: i%2===0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                  <td style={{ padding:"6px 8px", textAlign:"center", color:"#263238", fontSize:10 }}>{i+1}</td>
                  <td style={{ padding:"6px 8px", color:"#cfd8dc",
                    fontWeight: r.encontros >= 3 ? 600 : 400 }}>
                    {r.nome}
                    {r.cidade && <span style={{ color:"#37474f", fontSize:10, marginLeft:5 }}>{r.cidade}</span>}
                  </td>
                  <td style={{ padding:"6px 8px", textAlign:"center", fontSize:14 }}>
                    <span title={r.pais}>{flag(r.pais)}</span>
                  </td>
                  <td style={{ padding:"6px 8px", textAlign:"center", fontWeight:700, color:"#78909c" }}>
                    {r.encontros}
                  </td>
                  <td style={{ padding:"6px 8px", textAlign:"center", fontWeight:700,
                    color: r.man_ganhou > 0 ? "#81c784" : "#546e7a" }}>
                    {r.man_ganhou}
                  </td>
                  <td style={{ padding:"6px 8px", textAlign:"center", fontWeight:700,
                    color: r.rival_ganhou > 0 ? "#ef9a9a" : "#546e7a" }}>
                    {r.rival_ganhou}
                  </td>
                  <td style={{ padding:"6px 8px", textAlign:"center", color:"#546e7a" }}>
                    {r.empates}
                  </td>
                  <td style={{ padding:"6px 8px", color:"#455a64", fontSize:10 }}>
                    {r.torneios.slice(0,3).map((t,j) => (
                      <span key={j} style={{ marginRight:8, whiteSpace:"nowrap" }}>
                        <span style={{ color:"#546e7a" }}>{t.nome.replace(/\s?\d{4}$/, "").trim()}</span>
                        <span style={{
                          marginLeft:3,
                          color: t.manPts > t.rivPts ? "#81c784"
                               : t.rivPts > t.manPts ? "#ef9a9a" : "#78909c",
                        }}>({t.manPts}v{t.rivPts})</span>
                      </span>
                    ))}
                    {r.torneios.length > 3 && (
                      <span style={{ color:"#37474f" }}>+{r.torneios.length-3}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
type Tab = "campo" | "resultados" | "rivais";

export default function USKidsFieldPage() {
  const [fieldData,   setFieldData]   = useState<FieldData | null>(null);
  const [resultsData, setResultsData] = useState<ResultsData | null>(null);
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
          for (const j of r.jogadores)
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
          ? <TabRivais data={resultsData} />
          : <div style={{color:"#546e7a",padding:"24px 0"}}>A carregar…</div>
      )}

      <div style={{ color:"#1e3448", fontSize:10, textAlign:"center", marginTop:16 }}>
        signupanytime.com · actualização automática diária
      </div>
    </div>
  );
}
