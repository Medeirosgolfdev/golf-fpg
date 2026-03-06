import { useEffect, useState, useMemo } from "react";
import ScoreCircle from "../ui/ScoreCircle";

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
interface IntlTorneio { id: string; name: string; short: string; date: string; rounds: number; par: number; url: string; circuito?: string; }
interface IntlJogador { n: string; co: string; isM?: boolean; r: Record<string, { p: number; t: number; tp: number; rd: number[] }>; up: string[]; }
interface IntlData { torneios: IntlTorneio[]; proximos: { id: string; name: string }[]; jogadores: IntlJogador[]; }

// ── Matching robusto USKids ↔ BJGT ──────────────────────────────
function normNome(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function apelidos(nome: string): string[] {
  const ignorar = new Set(['de','da','do','dos','das','van','von','le','la','el','al','del','and','jr','ii','iii']);
  const partes = normNome(nome).split(' ');
  return partes.slice(1).filter(p => !ignorar.has(p) && p.length > 2);
}

function scoreMatch(n1: string, n2: string): number {
  const ap1 = new Set(apelidos(n1));
  const ap2 = new Set(apelidos(n2));
  if (!ap1.size || !ap2.size) return 0;
  const comuns = [...ap1].filter(p => ap2.has(p));
  if (!comuns.length) return 0;
  // Exige pelo menos 1 apelido com >5 letras
  if (!comuns.some(c => c.length > 5) && comuns.length < 2) return 0;
  const base = comuns.length / Math.min(ap1.size, ap2.size);
  const bonus = comuns.filter(c => c.length > 7).length * 0.15;
  return Math.min(1.0, base + bonus);
}

function criarMatcherIntl(intlData: IntlData | null) {
  if (!intlData) return (_: string) => null;

  // Mapa canonical → jogador
  const byNorm = new Map<string, IntlJogador>();
  for (const j of intlData.jogadores) {
    byNorm.set(normNome(j.n), j);
  }

  // Aliases: also → canonical
  const aliasMap = new Map<string, string>();
  for (const a of (intlData.aliases ?? [])) {
    for (const also of a.also) {
      aliasMap.set(normNome(also), a.canonical);
    }
  }

  // Pares a não confundir
  const naoConfundir = new Set<string>();
  for (const grupo of (intlData.nao_confundir ?? [])) {
    for (let i = 0; i < grupo.nomes.length; i++) {
      for (let j = i + 1; j < grupo.nomes.length; j++) {
        const chave = [normNome(grupo.nomes[i]), normNome(grupo.nomes[j])].sort().join('|');
        naoConfundir.add(chave);
      }
    }
  }

  const bjgtNomes = intlData.jogadores.filter(j => !j.isM).map(j => j.n);

  return (nomeUskids: string): IntlJogador | null => {
    const nNorm = normNome(nomeUskids);

    // 1. Alias directo
    const canonical = aliasMap.get(nNorm);
    if (canonical) {
      const jog = byNorm.get(normNome(canonical));
      if (jog) return jog;
    }

    // 2. Match exacto normalizado
    const exact = byNorm.get(nNorm);
    if (exact) return exact;

    // 3. Fuzzy por apelidos
    let melhorScore = 0;
    let melhorNome: string | null = null;
    for (const nb of bjgtNomes) {
      const s = scoreMatch(nomeUskids, nb);
      if (s > melhorScore) { melhorScore = s; melhorNome = nb; }
    }

    if (melhorScore >= 0.8 && melhorNome) {
      // Verificar não-confundir
      const chave = [nNorm, normNome(melhorNome)].sort().join('|');
      if (naoConfundir.has(chave)) return null;
      return byNorm.get(normNome(melhorNome)) ?? null;
    }

    return null;
  };
}
// ─────────────────────────────────────────────────────────────────

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
  if (vagas <= 3)   return { bg:"var(--color-warn)", cor:"#ffe0b2", label:`+${vagas}` };
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

// Derivar par por buraco quando não está disponível nos dados:
// usa o percentil 15 dos scores como âncora, ajusta para atingir o total_par exacto
function deriveParsFromLeaderboard(lb: RondaJogador[], total_par: number, n_holes: number): number[] {
  if (!lb.length || !n_holes || !total_par) return [];
  // Calcular total_par real a partir dos jogadores se não vier do servidor
  const computedTotal = lb.find(j => j.score && j.to_par != null)
    ? (lb.find(j => j.score && j.to_par != null)!.score - lb.find(j => j.score && j.to_par != null)!.to_par!)
    : total_par;
  // Sanity check: par total deve ser plausível (entre n_holes*3 e n_holes*5)
  if (computedTotal < n_holes * 3 || computedTotal > n_holes * 5) return [];

  const parEst: { par: number; median: number }[] = [];
  for (let h = 0; h < n_holes; h++) {
    const scores = lb
      .filter(j => Array.isArray(j.strokes) && j.strokes.length > h)
      .map(j => j.strokes[h])
      .filter(s => typeof s === 'number' && s > 0)
      .sort((a, b) => a - b);
    if (!scores.length) { parEst.push({ par: 4, median: 4 }); continue; }
    const idx = Math.max(0, Math.floor(scores.length * 0.15));
    const anchor = scores[idx];
    const med = scores[Math.floor(scores.length / 2)];
    const par = anchor <= 3 ? 3 : anchor >= 5 ? 5 : 4;
    parEst.push({ par, median: med });
  }

  // Ajustar até bater computedTotal exacto
  let diff = computedTotal - parEst.reduce((s, p) => s + p.par, 0);
  if (diff > 0) {
    // Elevar 4→5: prioridade para os com maior mediana
    const fours = parEst
      .map((p, i) => ({ ...p, i }))
      .filter(p => p.par === 4)
      .sort((a, b) => b.median - a.median);
    for (const f of fours) { if (diff <= 0) break; parEst[f.i].par = 5; diff--; }
  } else if (diff < 0) {
    // Reduzir 5→4: prioridade para os com menor mediana
    const fives = parEst
      .map((p, i) => ({ ...p, i }))
      .filter(p => p.par === 5)
      .sort((a, b) => a.median - b.median);
    for (const f of fives) { if (diff >= 0) break; parEst[f.i].par = 4; diff++; }
  }
  return parEst.map(p => p.par);
}

// ─────────────────────────────────────────────
// SCORECARD
// ─────────────────────────────────────────────
function TabelaRonda({ ronda, expanded, onToggle }: { ronda: RondaResult; expanded: boolean; onToggle: () => void }) {
  const jogadores = ronda.leaderboard ?? ronda.jogadores ?? [];
  const buracos   = ronda.buracos || 18;
  const has18     = buracos >= 18;

  // Usar par do servidor se disponível, senão derivar a partir dos scores
  const par: number[] | undefined = (() => {
    if (ronda.par?.length === buracos) return ronda.par;
    const derived = deriveParsFromLeaderboard(jogadores, ronda.total_par ?? 0, buracos);
    return derived.length === buracos ? derived : undefined;
  })();
  const totalPar = par ? par.reduce((s, p) => s + p, 0) : ronda.total_par;

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
            fontSize:10, color:isManuel(j.nome)?"var(--accent)":"var(--text-3)",
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
                    background: manuel ? "var(--accent-light)" : i%2===0?"var(--bg-card)":"var(--bg-detail)",
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
                    {st.slice(0,9).map((s,idx) => <td key={idx} className="tourn-hole-cell"><ScoreCircle gross={s||null} par={par?.[idx]??null} size="small" empty="dot" /></td>)}
                    {has18 && <td className="tourn-sum-col">{out9||"–"}</td>}
                    {has18 && st.slice(9,18).map((s,idx) => <td key={idx+9} className="tourn-hole-cell"><ScoreCircle gross={s||null} par={par?.[idx+9]??null} size="small" empty="dot" /></td>)}
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
function TabCampoDetalhe({ torneio: t }: { torneio: Torneio }) {
  const b12     = t.escaloes.find(e => e.nome === ESCALAO_MANUEL);
  const ptTotal = t.escaloes.flatMap(e => e.jogadores ?? []).filter(j => j.pais === "PT");
  const dias    = diasAte(t.date_inicio);
  const urgente = b12 && b12.vagas <= 3 && b12.vagas > 0;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
          <span style={{ fontSize:18, fontWeight:700, color:"var(--text)" }}>{t.emoji} {t.name}</span>
          {dias >= 0 && dias <= 14 && (
            <span style={{ background:"var(--chart-5)", color:"#fff", padding:"1px 7px", borderRadius:8, fontSize:10 }}>daqui a {dias}d</span>
          )}
          {dias < 0 && diasAte(t.date_fim ?? t.date_inicio) >= -1 && (
            <span style={{ background:"var(--color-good)", color:"#fff", padding:"1px 7px", borderRadius:8, fontSize:10 }}>em curso</span>
          )}
        </div>
        <div style={{ fontSize:12, color:"var(--text-3)" }}>
          📅 {fmtDate(t.date_inicio)}
          {t.date_fim && t.date_fim !== t.date_inicio ? ` → ${fmtDate(t.date_fim)}` : ""}
          {t.rondas ? ` · ${t.rondas}R` : ""}
          {t.campo   ? ` · ${t.campo}` : ""}
          {t.fee_18  ? ` · 💵 ${t.fee_18}` : ""}
        </div>

        {t.sem_flights && (
          <div style={{ color:"var(--text-3)", fontSize:11, marginTop:6 }}>⏳ Flights ainda não publicados</div>
        )}
        {t.erro && <div style={{ color:"var(--color-danger)", fontSize:11, marginTop:6 }}>⚠️ {t.erro}</div>}

        {!t.erro && !t.sem_flights && (
          <div style={{ marginTop:10, display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ background:"var(--color-good-dark)", color:"#fff", padding:"2px 8px", borderRadius:8, fontSize:11 }}>
              {t.total_inscritos}/{t.total_maximo} inscritos
            </span>
            {b12 && (() => {
              const bd = badgeVagas(b12.vagas, b12.maximo);
              return bd ? (
                <span style={{ background: urgente ? bd.bg : "var(--bg-hover)", color: urgente ? bd.cor : "var(--text-2)",
                  border:`1px solid ${bd.bg}`, padding:"2px 8px", borderRadius:8, fontSize:11, fontWeight:700 }}>
                  ★ Boys 12: {b12.inscritos}/{b12.maximo} ({bd.label})
                </span>
              ) : null;
            })()}
          </div>
        )}
      </div>

      {t.erro || t.sem_flights ? null : (
        <>
          {/* Grid de escalões */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))", gap:6, marginBottom:16 }}>
            {t.escaloes.map(e => {
              const bd  = badgeVagas(e.vagas, e.maximo);
              const dst = ESCALOES_DESTAQUE.has(e.nome);
              const man = e.nome === ESCALAO_MANUEL;
              return (
                <div key={e.age_group} style={{
                  background: man?"var(--accent-light)":dst?"var(--bg-detail)":"var(--bg)",
                  border:`1px solid ${man?"var(--accent)":dst?"var(--border)":"transparent"}`,
                  borderRadius:6, padding:"7px 10px",
                }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: e.jogadores?.length ? 5 : 0 }}>
                    <span style={{ fontSize:11, color:man?"var(--accent)":dst?"var(--text-2)":"var(--text-3)" }}>
                      {man?"★ ":""}{e.nome}
                      <span style={{ color:"var(--text-3)", fontSize:10, marginLeft:3 }}>({e.holes}H)</span>
                    </span>
                    <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                      <span style={{ fontSize:10, color:"var(--text-3)" }}>{e.inscritos}/{e.maximo}</span>
                      {bd && <span style={{ background:bd.bg, color:bd.cor, padding:"1px 5px", borderRadius:5, fontSize:9, fontWeight:700 }}>{bd.label}</span>}
                    </div>
                  </div>
                  {e.jogadores && e.jogadores.length > 0 && (
                    <div style={{ borderTop:"1px solid var(--border)", paddingTop:4 }}>
                      {e.jogadores.map((j,i) => (
                        <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:12, padding:"2px 0",
                          color: j.pais==="PT" ? "var(--accent)" : "var(--text)" }}>
                          <span>{j.nome}</span>
                          <span title={j.cidade}>{flag(j.pais)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {!e.jogadores && e.paises && e.paises.length > 0 && (
                    <div style={{ fontSize:10, color:"var(--text-3)", marginTop:3 }}>
                      {e.paises.slice(0,5).map(p=>`${flag(p.pais)}${p.n}`).join(" ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Portugueses */}
          {ptTotal.length > 0 && (
            <div style={{ background:"var(--accent-light)", border:"1px solid var(--accent)", borderRadius:8, padding:"10px 14px", marginBottom:8 }}>
              <div style={{ color:"var(--accent)", fontWeight:700, fontSize:12, marginBottom:6 }}>🇵🇹 Portugueses inscritos</div>
              {t.escaloes.filter(e=>e.jogadores?.some(j=>j.pais==="PT")).map(e=>(
                <div key={e.age_group} style={{ marginBottom:4 }}>
                  <div style={{ color:"var(--accent)", fontSize:10, marginBottom:1 }}>{e.nome}</div>
                  {e.jogadores!.filter(j=>j.pais==="PT").map((j,i)=>(
                    <div key={i} style={{ color:"var(--text)", fontSize:12, paddingLeft:8 }}>
                      {j.nome} <span style={{ color:"var(--text-3)", fontSize:11 }}>{j.cidade}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div style={{ textAlign:"right", color:"var(--text-3)", fontSize:10 }}>{fmtTs(t.ultima_atualizacao)}</div>
        </>
      )}
    </div>
  );
}

// manter TabCampo para compatibilidade (não é usada directamente mas pode existir)
function TabCampo({ data }: { data: FieldData }) {
  return <div>{data.torneios.map(t => <TabCampoDetalhe key={t.t} torneio={t} />)}</div>;
}


// ─────────────────────────────────────────────
// TAB RESULTADOS
// ─────────────────────────────────────────────
function TabResultados({ data, selectedT }: {
  data: ResultsData;
  selectedT: number | null;
}) {
  const t = data.resultados.find(r => r.t === selectedT) ?? null;

  const [expandedRondas, setExpandedRondas] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const tr of data.resultados) {
      const em = tr.escaloes.find(e => e.is_manuel);
      if (em && em.rondas[0]) s.add(`${tr.t}-${em.age_group}-1`);
    }
    return s;
  });

  // Quando muda torneio, expandir automaticamente o escalão do Manuel
  useEffect(() => {
    if (!t) return;
    const em = t.escaloes.find(e => e.is_manuel);
    if (em && em.rondas[0]) {
      const key = `${t.t}-${em.age_group}-1`;
      setExpandedRondas(prev => { const s = new Set(prev); s.add(key); return s; });
    }
  }, [selectedT]);

  if (!data.resultados.length) return (
    <div style={{ color:"var(--text-3)", padding:"32px 0", textAlign:"center", fontSize:13 }}>
      Sem resultados ainda — os scorecards aparecerão aqui durante e após os torneios
    </div>
  );

  if (!t) return (
    <div style={{ color:"var(--text-3)", padding:"32px 0", textAlign:"center", fontSize:13 }}>
      Selecciona um torneio na sidebar
    </div>
  );

  const manuelRows = t.escaloes.flatMap(e =>
    e.rondas.flatMap(r =>
      (r.leaderboard ?? r.jogadores ?? [])
        .filter(j => isManuel(j.nome))
        .map(j => ({ escalao:e.nome, ronda:r.ronda, ...j }))
    )
  );

  return (
    <div>
      {/* Header torneio */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:17, fontWeight:700, color:"var(--text)", marginBottom:4 }}>{t.name}</div>
        <div style={{ fontSize:12, color:"var(--text-3)", display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <span>📅 {fmtDate(t.date_inicio)}{t.campo ? ` · ${t.campo}` : ""}</span>
          <span>Actualizado {fmtTs(t.ultima_atualizacao)}</span>
          {t.url_resultados && (
            <a href={t.url_resultados} target="_blank" rel="noopener noreferrer"
              style={{ color:"var(--text-3)", fontSize:10, textDecoration:"none",
                border:"1px solid var(--border)", borderRadius:5, padding:"1px 7px" }}>
              ver fonte ↗
            </a>
          )}
        </div>
        {manuelRows.length > 0 && (
          <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>
            {manuelRows.map((m,i) => (
              <span key={i} style={{ background:"var(--accent-light)", border:"1px solid var(--accent)",
                color:"var(--accent)", padding:"2px 10px", borderRadius:8, fontSize:12, fontWeight:700 }}>
                ★ {m.escalao} R{m.ronda}: {m.score} · {m.pontos} pts
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Escalões e rondas */}
      {t.escaloes.map(e => {
        const isManuelEscalao = e.is_manuel ||
          (t.escalao_manuel ? e.age_group === t.escalao_manuel : e.nome === ESCALAO_MANUEL);
        const rondasComDados = e.rondas.filter(r => (r.leaderboard ?? r.jogadores ?? []).length > 0);
        if (!rondasComDados.length) return null;
        return (
          <div key={e.age_group} style={{ marginBottom:20 }}>
            <div style={{ fontSize:12, fontWeight:700,
              color: isManuelEscalao ? "var(--accent)" : "var(--text-3)",
              borderBottom:`1px solid ${isManuelEscalao ? "var(--accent)" : "var(--border)"}`,
              paddingBottom:5, marginBottom:8 }}>
              {isManuelEscalao ? "★ " : ""}{e.nome}
            </div>
            {rondasComDados.map(r => {
              const key = `${t.t}-${e.age_group}-${r.ronda}`;
              return (
                <TabelaRonda key={key} ronda={r}
                  expanded={expandedRondas.has(key)}
                  onToggle={() => setExpandedRondas(prev => {
                    const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s;
                  })}
                />
              );
            })}
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
  torneioT, torneioNome, rivals, fieldData, intlData, matchIntl,
}: {
  torneioT: number; torneioNome: string;
  rivals: RivalInfo[]; fieldData: FieldData | null; intlData: IntlData | null;
  matchIntl: (nome: string) => IntlJogador | null;
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
              <th style={{ textAlign:"center", width:80, fontSize:11 }}>Escalão</th>
              <th style={{ textAlign:"left", fontSize:11 }}>Encontros anteriores com o Manuel</th>
            </tr>
          </thead>
          <tbody>
            {conhecidos.map((j, i) => {
              const rival = rivalMap.get(j.nome.toLowerCase().trim())!;
              const torneiosUnicos = [...new Map(rival.encontros.map(e => [e.torneio_t, e])).values()];
              const intlJog    = matchIntl(j.nome);
              const intlTorns  = intlJog ? (intlData?.torneios ?? []).filter(t => intlJog.r[t.id] && t.circuito !== "uskids") : [];
              const manuelIntl = intlData?.jogadores.find(jj => jj.isM);
              return (
                <tr key={i} style={{ background: i%2===0 ? "var(--bg-card)" : "var(--bg-detail)" }}>
                  <td className="tourn-lb-name-col">{j.nome}</td>
                  <td style={{ textAlign:"center" }}>{flag(j.pais)}</td>
                  <td style={{ textAlign:"center", fontSize:11, color:"var(--text-3)" }}>{j.escalao}</td>
                  <td style={{ fontSize:11, padding:"5px 8px", lineHeight:1.8 }}>
                    {/* USKids encontros */}
                    {torneiosUnicos.map(enc => {
                      const manMelhor = enc.man_pos < enc.rival_pos;
                      const manPior   = enc.man_pos > enc.rival_pos;
                      return (
                        <span key={enc.torneio_t} style={{ marginRight:10, whiteSpace:"nowrap" }}>
                          <span style={{ color:"var(--text-2)" }}>{enc.torneio_nome.replace(/\s\d{4}$/, "")}</span>
                          <span style={{ marginLeft:4, fontWeight:700,
                            color: manMelhor?"var(--color-good)":manPior?"var(--color-danger)":"var(--text-3)" }}>
                            {enc.man_pos}º vs {enc.rival_pos}º
                          </span>
                        </span>
                      );
                    })}
                    {/* separador se tem ambos */}
                    {torneiosUnicos.length > 0 && intlTorns.length > 0 && (
                      <span style={{ color:"var(--border)", margin:"0 6px" }}>·</span>
                    )}
                    {/* BJGT/Intl encontros */}
                    {intlTorns.map(t => {
                      const res    = intlJog!.r[t.id];
                      const manRes = manuelIntl?.r[t.id];
                      const manMelhor = manRes ? manRes.p < res.p : false;
                      const manPior   = manRes ? manRes.p > res.p : false;
                      return (
                        <span key={t.id} style={{ marginRight:8, whiteSpace:"nowrap" }}>
                          <span style={{
                            background:"var(--bg-info)", color:"var(--color-info)",
                            fontSize:10, fontWeight:800, padding:"1px 5px", borderRadius:3,
                            textTransform:"uppercase", marginRight:3, letterSpacing:"0.04em",
                          }}>
                            {t.circuito === "bjgt" ? "BJGT" : (t.circuito?.toUpperCase() ?? "INTL")}
                          </span>
                          <a href={t.url} target="_blank" rel="noopener noreferrer"
                            style={{ color:"var(--text-2)", textDecoration:"none", fontWeight:600 }}>
                            {t.short}
                          </a>
                          {manRes ? (
                            <span style={{ marginLeft:4, fontWeight:700,
                              color: manMelhor?"var(--color-good)":manPior?"var(--color-danger)":"var(--text-3)" }}>
                              {manRes.p}º vs {res.p}º
                            </span>
                          ) : (
                            <span style={{ marginLeft:4, color:"var(--text-3)", fontSize:10 }}>
                              {res.p}º (s/ Manuel)
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

  const matchIntl = useMemo(() => criarMatcherIntl(intlData), [intlData]);

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
          <button key={v.key} onClick={() => setVista(v.key)}
            className={`tourn-tab tourn-tab-sm${vista===v.key ? " active" : ""}`}>
            {v.label}
          </button>
        ))}
      </div>

      {vista === "marco" && (
        <TabelaConhecidos torneioT={21080} torneioNome="Marco Simone Invitational 2026"
          rivals={rivals} fieldData={fieldData} intlData={intlData} matchIntl={matchIntl} />
      )}
      {vista === "european" && (
        <TabelaConhecidos torneioT={21131} torneioNome="European Championship 2026"
          rivals={rivals} fieldData={fieldData} intlData={intlData} matchIntl={matchIntl} />
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
                      const intlJog = matchIntl(r.nome);
                      if (!intlJog) return null;
                      const torns = (intlData?.torneios ?? []).filter(t => intlJog.r[t.id] && t.circuito !== "uskids");
                      if (!torns.length) return null;
                      return torns.map(t => {
                        const res = intlJog.r[t.id];
                        const manRes = intlData?.jogadores.find(j => j.isM)?.r[t.id];
                        const manMelhor = manRes && res.p > manRes.p;
                        const manPior   = manRes && res.p < manRes.p;
                        return (
                          <span key={t.id} style={{ marginRight:12, whiteSpace:"nowrap" }}>
                            <span style={{ color:"var(--color-info)", fontSize:10, fontWeight:700,
                              border:"1px solid var(--border-info)", borderRadius:3,
                              padding:"1px 5px", marginRight:3 }}>BJGT</span>
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
  const [selectedT,   setSelectedT]   = useState<number | null>(null);

  useEffect(() => {
    fetch("/data/uskids-field.json?v=" + Date.now())
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: FieldData) => {
        setFieldData(d);
        if (d.torneios.length) setSelectedT(d.torneios[0].t);
      })
      .catch(e => setErro(e.message));

    fetch("/data/uskids-results.json?v=" + Date.now())
      .then(r => r.ok ? r.json() : { gerado_em:"", resultados:[] })
      .then(setResultsData)
      .catch(() => setResultsData({ gerado_em:"", resultados:[] }));
    fetch("/data/rivals-intl.json")
      .then(r => r.ok ? r.json() : null)
      .then(setIntlData)
      .catch(() => {});
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

  const torneiosCampo = useMemo(() => fieldData?.torneios ?? [], [fieldData]);
  const torneiosResultados = useMemo(() => resultsData?.resultados ?? [], [resultsData]);

  const allTorneios = useMemo(() => {
    const map = new Map<number, { t: number; name: string; date: string; temResultados: boolean; temCampo: boolean }>();
    for (const t of torneiosCampo) {
      map.set(t.t, { t: t.t, name: t.name, date: t.date_inicio, temResultados: false, temCampo: true });
    }
    for (const t of torneiosResultados) {
      if (map.has(t.t)) map.get(t.t)!.temResultados = true;
      else map.set(t.t, { t: t.t, name: t.name, date: t.date_inicio, temResultados: true, temCampo: false });
    }
    return [...map.values()].sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)));
  }, [torneiosCampo, torneiosResultados]);

  if (erro) return (
    <div style={{ padding:32, color:"var(--color-danger)", fontFamily:"monospace", fontSize:13 }}>
      ⚠️ {erro}
    </div>
  );
  if (!fieldData) return (
    <div style={{ padding:32, color:"var(--text-3)", fontSize:13 }}>A carregar…</div>
  );

  // Quando muda de tab, verificar se o torneio seleccionado existe nessa tab
  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    // Seleccionar o primeiro torneio disponível para a nova tab se o actual não existir
    if (newTab === "resultados" && selectedT) {
      const exists = torneiosResultados.some(t => t.t === selectedT);
      if (!exists && torneiosResultados.length) setSelectedT(torneiosResultados[0].t);
    }
  };

  const TABS: { id: Tab; label: string; badge: number }[] = [
    { id:"campo",      label:"⛳ Campo",      badge: fieldData.torneios.length },
    { id:"resultados", label:"🏆 Resultados", badge: nResultados },
    { id:"rivais",     label:"🤝 Rivais",     badge: nRivais },
  ];

  const selectedFieldTorneio = fieldData.torneios.find(t => t.t === selectedT) ?? null;

  return (
    <div className="master-detail" style={{ height:"calc(100vh - 52px)" }}>

      {/* ── SIDEBAR ── */}
      <div className="sidebar" style={{ minWidth:220, maxWidth:260 }}>
        <div style={{ padding:"12px 12px 4px", fontSize:13, fontWeight:700, color:"var(--text)" }}>
          USKids Golf
        </div>

        {/* Tabs na sidebar */}
        <div style={{ display:"flex", flexDirection:"column", gap:2, padding:"4px 8px 8px", borderBottom:"1px solid var(--border-light)" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => handleTabChange(t.id)}
              className={`course-item${tab === t.id ? " active" : ""}`}
              style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span>{t.label}</span>
              {t.badge > 0 && (
                <span style={{
                  background: tab === t.id ? "var(--accent)" : "var(--bg-muted)",
                  color: tab === t.id ? "#fff" : "var(--text-3)",
                  borderRadius:10, padding:"0 6px", fontSize:10, fontWeight:700,
                }}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* Lista de torneios */}
        <div className="sidebar-section-title" style={{ marginTop:8 }}>Torneios</div>
        <div style={{ overflowY:"auto", flex:1 }}>
          {allTorneios.map(t => {
            const active = t.t === selectedT;
            const temConteudo = tab === "resultados" ? t.temResultados : t.temCampo;
            return (
              <button key={t.t}
                onClick={() => setSelectedT(t.t)}
                className={`course-item${active ? " active" : ""}`}
                style={{ opacity: temConteudo ? 1 : 0.45, width:"100%", textAlign:"left" }}>
                <div style={{ fontWeight:600, fontSize:12 }}>{t.name.replace(/\s*\d{4}$/, "")}</div>
                <div style={{ fontSize:10, color: active ? "var(--accent-light)" : "var(--text-muted)", marginTop:1 }}>
                  {fmtDate(t.date)}
                  {t.temResultados && <span style={{ marginLeft:4, opacity:0.8 }}>🏆</span>}
                </div>
              </button>
            );
          })}
        </div>

        <div className="muted fs-10" style={{ padding:"8px 12px", borderTop:"1px solid var(--border-light)" }}>
          signupanytime.com · actualização diária
        </div>
      </div>

      {/* ── CONTEÚDO ── */}
      <div style={{ flex:1, overflow:"auto", padding:"16px 20px" }}>

        {tab === "campo" && (
          selectedFieldTorneio
            ? <TabCampoDetalhe torneio={selectedFieldTorneio} />
            : <div className="muted" style={{ padding:32, textAlign:"center" }}>Selecciona um torneio</div>
        )}

        {tab === "resultados" && resultsData && (
          <TabResultados
            data={resultsData}
            selectedT={selectedT}
          />
        )}
        {tab === "resultados" && !resultsData && (
          <div style={{color:"var(--text-3)",padding:"24px 0"}}>A carregar resultados…</div>
        )}

        {tab === "rivais" && resultsData && (
          <TabRivais data={resultsData} fieldData={fieldData} intlData={intlData} />
        )}
        {tab === "rivais" && !resultsData && (
          <div style={{color:"var(--text-3)",padding:"24px 0"}}>A carregar…</div>
        )}

      </div>
    </div>
  );
}
