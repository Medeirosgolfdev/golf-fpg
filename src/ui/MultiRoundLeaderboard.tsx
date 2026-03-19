/**
 *
 * ═══════════════════════════════════════════════════════════════
 * FAMÍLIA DE TABELAS — MANTER SEMPRE EM SINCRONIA
 * ═══════════════════════════════════════════════════════════════
 * Este ficheiro faz parte de uma família de componentes de tabela
 * que partilham as mesmas regras visuais (App.css: .sc-lb):
 *
 *   • ScorecardLeaderboard.tsx   — leaderboard buraco-a-buraco
 *   • MultiRoundLeaderboard.tsx  — leaderboard multi-ronda
 *   • CrossSeasonTable.tsx       — tabela temporada cruzada
 *   • tournamentPrimitives.tsx   — primitivas partilhadas
 *
 * Ao alterar qualquer um, verifica se os outros precisam de ser
 * actualizados: fontes, padding, bordas, cores, larguras de colunas.
 * ═══════════════════════════════════════════════════════════════
 * MultiRoundLeaderboard.tsx
 *
 * Leaderboard para torneios multi-ronda (2R, 3R, …).
 * Partilhado entre DrivePage e TorneiosAnalisePage.
 *
 * Estrutura de colunas (nRounds >= 2):
 *   # | Jogador | [ESC·FED·Clube·HCP·Tee] | ±Par | Total
 *   | R1 | ±R1 | SD | 🐦 | = | ■
 *   | R2 | ±R2 | SD | 🐦 | = | ■
 *   | …
 *
 * Estrutura de colunas (nRounds === 1):
 *   # | Jogador | [ESC·FED·Clube·HCP·Tee] | ±Par | Total | SD | 🐦 | = | ■
 *
 * Stats (SD/🐦/=/■) são SEMPRE por ronda — calculadas pelo caller e
 * passadas em `MRRound.sd`, `.birdies`, `.pars`, `.bogeys`.
 */
import React, { useState, useMemo } from "react";
import { getTeeHex } from "../utils/teeColors";
import {
  isManuel, fmtTP, tpColor, EscPill, TeeDot, TournPName,
  ESC_STYLE, SDPill,
  type PlayersDB,
} from "./tournamentPrimitives";
import { toggleArr } from "../utils/mathUtils";

/* ══════════════════════════════════════════════════════════════
   TIPOS PÚBLICOS
   ══════════════════════════════════════════════════════════════ */

/** Ronda individual normalizada, com stats próprias */
export interface MRRound {
  gross: number;
  parPerRound: number;
  /** SD desta ronda (null = não disponível) */
  sd?: number | null;
  sdSource?: string | null;
  birdies?: number;
  pars?: number;
  bogeys?: number;
}

/** Linha normalizada para MultiRoundLeaderboard */
export interface MultiRoundRow {
  key: string;
  name: string;
  fed?: string;
  club: string;
  hcp: number | null;
  esc?: string;
  teeName?: string;
  gross: number;
  parTotal: number;
  isIncomplete: boolean;
  isHighlighted?: boolean;
  /** Uma entrada por ronda, em ordem (rounds[0] = R1, rounds[1] = R2, …) */
  rounds: MRRound[];
}

/* ══════════════════════════════════════════════════════════════
   FILTRO
   ══════════════════════════════════════════════════════════════ */

export interface PlayerFilter {
  name: string; escs: string[]; tees: string[]; club: string;
}
export const EMPTY_FILTER: PlayerFilter = { name: "", escs: [], tees: [], club: "" };

function filterRows(rows: MultiRoundRow[], f: PlayerFilter): MultiRoundRow[] {
  let ps = rows;
  if (f.name) { const q = f.name.toLowerCase(); ps = ps.filter(r => r.name.toLowerCase().includes(q) || r.club.toLowerCase().includes(q)); }
  if (f.escs.length) ps = ps.filter(r => r.esc != null && f.escs.includes(r.esc));
  if (f.tees.length) ps = ps.filter(r => r.teeName != null && f.tees.includes(r.teeName));
  if (f.club) ps = ps.filter(r => r.club === f.club);
  return ps;
}

function PlayerFilterBar({ rows, filter, onChange, total }: {
  rows: MultiRoundRow[]; filter: PlayerFilter; onChange: (f: PlayerFilter) => void; total: number;
}) {
  const availEsc   = useMemo(() => { const s = new Set<string>(); for (const r of rows) if (r.esc) s.add(r.esc); return [...s].sort((a,b) => a.localeCompare(b)); }, [rows]);
  const availTees  = useMemo(() => { const s = new Set<string>(); for (const r of rows) if (r.teeName) s.add(r.teeName); return [...s].sort(); }, [rows]);
  const availClubs = useMemo(() => { const s = new Set<string>(); for (const r of rows) if (r.club) s.add(r.club); return [...s].sort((a,b) => a.localeCompare(b,"pt")); }, [rows]);
  const isActive = filter.name || filter.escs.length || filter.tees.length || filter.club;
  const filtered = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const hasOpts = availClubs.length > 1 || availEsc.length > 1 || availTees.length > 1;
  if (total < 8 && !isActive) return null;
  const chip = (active: boolean, label: React.ReactNode, onClick: () => void, color?: string): React.ReactNode => (
    <button key={String(label)} onClick={onClick} style={{ fontSize:10, padding:"2px 8px", borderRadius:20,
      border:`1px solid ${active?(color||"var(--accent,#2563eb)"):"var(--border)"}`,
      background:active?(color||"var(--accent,#2563eb)"):"var(--bg-hover)", color:active?"#fff":"var(--text-muted)",
      cursor:"pointer", whiteSpace:"nowrap", fontWeight:active?700:500 }}>{label}</button>
  );
  return (
    <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:6, padding:"6px 0 8px", borderBottom:"1px solid var(--border)", marginBottom:8 }}>
      <div style={{ position:"relative", flexShrink:0 }}>
        <span style={{ position:"absolute", left:7, top:"50%", transform:"translateY(-50%)", fontSize:11, color:"var(--text-muted)", pointerEvents:"none" }}>🔍</span>
        <input type="text" placeholder="Nome ou clube…" value={filter.name} onChange={e => onChange({ ...filter, name:e.target.value })}
          style={{ fontSize:11, padding:"3px 8px 3px 22px", borderRadius:6, border:"1px solid var(--border)", background:"var(--bg-card,#fff)", color:"var(--text)", width:140, outline:"none" }} />
      </div>
      {hasOpts && <span style={{ color:"var(--border)", fontSize:11 }}>|</span>}
      {availEsc.length > 1 && availEsc.map(e => { const k = e.toLowerCase().replace(/[\s-]/g,""); const s = ESC_STYLE[k]; return chip(filter.escs.includes(e), e, () => onChange({ ...filter, escs:toggleArr(filter.escs,e) }), s?.bg); })}
      {availTees.length > 1 && availTees.map(t => { const hex = getTeeHex(t); return (
        <React.Fragment key={t}>{chip(filter.tees.includes(t),
          <span style={{ display:"flex", alignItems:"center", gap:4 }}>
            <span style={{ display:"inline-block", width:8, height:8, borderRadius:2, background:hex, border:"1px solid rgba(0,0,0,.18)" }} />{t}
          </span>,
          () => onChange({ ...filter, tees:toggleArr(filter.tees,t) }), hex)}</React.Fragment>
      ); })}
      {availClubs.length > 2 && <select value={filter.club} onChange={e => onChange({ ...filter, club:e.target.value })} style={{ fontSize:11, padding:"3px 6px", borderRadius:6, border:`1px solid ${filter.club?"var(--accent,#2563eb)":"var(--border)"}`, background:"var(--bg-card,#fff)", color:"var(--text)", cursor:"pointer", fontWeight:filter.club?700:400 }}><option value="">Todos os clubes</option>{availClubs.map(c => <option key={c} value={c}>{c}</option>)}</select>}
      {isActive && <><span style={{ fontSize:10, color:"var(--text-muted)", marginLeft:2 }}>{filtered.length} de {total}</span><button onClick={() => onChange(EMPTY_FILTER)} style={{ fontSize:10, padding:"2px 8px", borderRadius:20, border:"1px solid var(--border)", background:"var(--bg-hover)", color:"var(--text-muted)", cursor:"pointer" }}>✕ limpar</button></>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   TIPOS SORT
   ══════════════════════════════════════════════════════════════ */
type MRSortKey = "pos" | "name" | "club" | "esc" | "hcp" | "gross" | "toPar" | "tee" | "sd";

/* ══════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════════════════════════════ */

export interface MultiRoundLBProps {
  rows: MultiRoundRow[];
  nRounds: number;
  playersDB: PlayersDB;
  showCols?: { esc?: boolean; fed?: boolean; tee?: boolean };
  sortable?: boolean;
  filterable?: boolean;
}

export function MultiRoundLeaderboard({
  rows, nRounds, playersDB,
  showCols = {},
  sortable = false,
  filterable = false,
}: MultiRoundLBProps) {
  const { esc: showEsc = false, fed: showFed = false, tee: showTee = false } = showCols;

  const [sortKey, setSortKey] = useState<MRSortKey>("pos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState<PlayerFilter>(EMPTY_FILTER);

  if (!rows.length) return <div className="muted ta-center p-16">Sem resultados.</div>;

  const complete   = rows.filter(r => !r.isIncomplete);
  const incomplete = rows.filter(r =>  r.isIncomplete);

  /* Posições — WD (gross=0 com isIncomplete) excluídos do ranking */
  const withPos = useMemo(() => {
    const forRank = [...complete].sort((a, b) => a.gross - b.gross);
    let counter = 1;
    const posMap = new Map<string, number>();
    forRank.forEach((r, i) => {
      if (i > 0 && r.gross !== forRank[i - 1].gross) counter = i + 1;
      posMap.set(r.key, counter);
    });
    return rows.map(r => ({ ...r, _pos: r.isIncomplete ? null : (posMap.get(r.key) ?? null) }));
  }, [rows]);

  /* Filtro */
  const filteredComplete   = useMemo(() => filterRows(withPos.filter(r => !r.isIncomplete), filter), [withPos, filter]);
  const filteredIncomplete = useMemo(() => filterRows(withPos.filter(r =>  r.isIncomplete), filter), [withPos, filter]);

  /* Sort */
  function handleSort(k: MRSortKey) {
    if (!sortable) return;
    if (k === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  function cmp(a: typeof withPos[0], b: typeof withPos[0]): number {
    const INF = 9999;
    switch (sortKey) {
      case "pos":   return sortDir === "asc" ? (a._pos ?? INF) - (b._pos ?? INF) : (b._pos ?? INF) - (a._pos ?? INF);
      case "name":  return sortDir === "asc" ? a.name.localeCompare(b.name,"pt") : b.name.localeCompare(a.name,"pt");
      case "club":  return sortDir === "asc" ? (a.club||"").localeCompare(b.club||"","pt") : (b.club||"").localeCompare(a.club||"","pt");
      case "esc":   return sortDir === "asc" ? (a.esc||"").localeCompare(b.esc||"") : (b.esc||"").localeCompare(a.esc||"");
      case "tee":   return sortDir === "asc" ? (a.teeName||"").localeCompare(b.teeName||"") : (b.teeName||"").localeCompare(a.teeName||"");
      case "hcp":   return sortDir === "asc" ? (a.hcp ?? INF) - (b.hcp ?? INF) : (b.hcp ?? INF) - (a.hcp ?? INF);
      case "gross": return sortDir === "asc" ? a.gross - b.gross : b.gross - a.gross;
      case "toPar": return sortDir === "asc" ? (a.gross - a.parTotal) - (b.gross - b.parTotal) : (b.gross - b.parTotal) - (a.gross - a.parTotal);
      case "sd":    { const sa = a.rounds[0]?.sd ?? INF; const sb = b.rounds[0]?.sd ?? INF; return sortDir === "asc" ? sa - sb : sb - sa; }
      default:      return 0;
    }
  }

  const sorted = useMemo(() => {
    if (!sortable) return [...filteredComplete, ...filteredIncomplete];
    return [...filteredComplete.sort(cmp), ...filteredIncomplete.sort(cmp)];
  }, [filteredComplete, filteredIncomplete, sortKey, sortDir, sortable]);

  function SHdr({ k, children, className }: { k: MRSortKey; children: React.ReactNode; className?: string }) {
    const active = sortable && sortKey === k;
    return (
      <th className={(className || "") + (sortable ? " lb-sortable" : "")} onClick={() => handleSort(k)}>
        {children}{active && <span className="sort-arrow">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </th>
    );
  }

  const medals = ["🥇", "🥈", "🥉"];
  const isMulti = nRounds >= 2;

  return (
    <div>
      {filterable && (
        <PlayerFilterBar rows={withPos} filter={filter} onChange={setFilter} total={rows.length} />
      )}
      <div className="bjgt-chart-scroll">
        <table className="sc-lb sc-lb-lbd">
          <thead>
            <tr>
              <th className="lb-pos sticky-col-0">#</th>
              <SHdr k="name" className="lb-name sticky-col-1">Jogador</SHdr>
              {showEsc && <SHdr k="esc" className="lb-esc">ESC.</SHdr>}
              {showFed && <th className="lb-fed">FED</th>}
              <SHdr k="club" className="lb-club">Clube</SHdr>
              <SHdr k="hcp"  className="lb-hcp">HCP</SHdr>
              {showTee && <th className="lb-tee">TEE</th>}

              {/* ±Par ANTES de Total */}
              <SHdr k="toPar" className="lb-topar">±Par</SHdr>
              <SHdr k="gross" className="lb-gross">{isMulti ? "Total" : "Tot"}</SHdr>

              {/* Por ronda */}
              {isMulti
                ? Array.from({ length: nRounds }, (_, r) => (
                    <React.Fragment key={r}>
                      <th className="lb-rnd">R{r + 1}</th>
                      <th className="lb-rnd-tp">±</th>
                      <th className="lb-rnd-sd">SD</th>
                      <th className="lb-rnd-bird">🐦</th>
                      <th className="lb-rnd-par">=</th>
                      <th className="lb-rnd-bog">■</th>
                    </React.Fragment>
                  ))
                : <>
                    <th className="lb-sd">SD</th>
                    <th className="lb-bird">🐦</th>
                    <th className="lb-par-stat">Par</th>
                    <th className="lb-bog">■</th>
                  </>
              }
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const tp = row.gross - row.parTotal;
              const isInc = row.isIncomplete;
              const dp = row._pos;
              const tpCol = !isInc ? tpColor(tp) : undefined;
              const medal = !isInc && dp != null && dp <= 3 ? medals[dp - 1] : null;
              const showPos = !isInc && (
                sortable && sortKey === "pos"
                  ? (idx === 0 || dp !== sorted[idx - 1]._pos)
                  : true
              );
              const rowBg = row.isHighlighted ? "var(--bg-success-subtle,#d1fae5)" : isInc ? "var(--bg-hover)" : undefined;
              const stickyBg = row.isHighlighted ? "var(--bg-manuel-sticky,#c3f5dc)" : isInc ? "var(--bg-hover)" : "var(--bg-card,#fff)";

              return (
                <tr key={row.key} className={row.isHighlighted ? "row-manuel" : undefined} style={isInc ? { background: "var(--bg-hover)", opacity: 0.7 } : undefined}>
                  <td className="lb-pos sticky-col-0" style={row.isHighlighted ? undefined : { background: stickyBg }}>
                    {isInc
                      ? <span className="badge-wd">WD</span>
                      : showPos ? (medal || dp) : ""}
                  </td>
                  <td className="lb-name sticky-col-1" style={row.isHighlighted ? undefined : { background: stickyBg }}>
                    <TournPName name={row.name} fedCode={row.fed} playersDB={playersDB} />
                    {isInc && <span className="badge-inc">INC</span>}
                  </td>
                  {showEsc && <td className="lb-esc">{row.esc ? <EscPill esc={row.esc} /> : <span className="muted">–</span>}</td>}
                  {showFed && <td className="lb-fed">{row.fed || "–"}</td>}
                  <td className="lb-club">{row.club || "–"}</td>
                  <td className="lb-hcp">{row.hcp != null ? row.hcp.toFixed(1) : "–"}</td>
                  {showTee && <td className="lb-tee"><TeeDot teeName={row.teeName} /></td>}

                  {/* ±Par ANTES de Total */}
                  <td className="lb-topar" style={{ color: tpCol, opacity: isInc ? 0.5 : 1 }}>{fmtTP(tp)}</td>
                  <td className="lb-gross" style={{ opacity: isInc ? 0.5 : 1 }}>{row.gross}</td>

                  {/* Colunas por ronda */}
                  {isMulti
                    ? Array.from({ length: nRounds }, (_, r) => {
                        const rd = row.rounds[r];
                        if (!rd) return (
                          <React.Fragment key={r}>
                            <td className="lb-rnd c-muted">–</td>
                            <td className="lb-rnd-tp c-muted">–</td>
                            <td className="lb-rnd-sd c-muted">–</td>
                            <td className="lb-rnd-bird">–</td>
                            <td className="lb-rnd-par">–</td>
                            <td className="lb-rnd-bog">–</td>
                          </React.Fragment>
                        );
                        const rtp = rd.gross - rd.parPerRound;
                        return (
                          <React.Fragment key={r}>
                            <td className="lb-rnd">{rd.gross}</td>
                            <td className="lb-rnd-tp" style={{ color: tpColor(rtp) }}>{fmtTP(rtp)}</td>
                            <td className="lb-rnd-sd">
                              {rd.sd != null
                                ? <SDPill sd={rd.sd} source={rd.sdSource ?? null} hcp={row.hcp} />
                                : <span className="muted">–</span>}
                            </td>
                            <td className="lb-rnd-bird">{rd.birdies || ""}</td>
                            <td className="lb-rnd-par">{rd.pars || ""}</td>
                            <td className="lb-rnd-bog">{rd.bogeys || ""}</td>
                          </React.Fragment>
                        );
                      })
                    : (() => {
                        const rd = row.rounds[0];
                        return (
                          <>
                            <td className="lb-sd">
                              {rd?.sd != null
                                ? <SDPill sd={rd.sd} source={rd.sdSource ?? null} hcp={row.hcp} />
                                : <span className="muted">–</span>}
                            </td>
                            <td className="lb-bird">{rd?.birdies || ""}</td>
                            <td className="lb-par-stat">{rd?.pars || ""}</td>
                            <td className="lb-bog">{rd?.bogeys || ""}</td>
                          </>
                        );
                      })()
                  }
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
