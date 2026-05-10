// @refresh reset
import { MultiRoundRow, PlayerFilter, EMPTY_FILTER, ExtraColumn } from "./multiRoundTypes";
import { fmtHcp, medal } from "../utils/format";
import { flag as flagOf, normCountry } from "../utils/flagUtils";
import { useSort } from "../hooks/useSort";
import FilterChip from "../ui/FilterChip";
import WdBadge from "../ui/WdBadge";
import EmptyState from "../ui/EmptyState";
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
 * Partilhado entre DrivePage, FPGPage, BJGTPage e USKIDSPage.
 *
 * Estrutura de colunas (nRounds >= 2):
 *   # | Jogador | [ESC·FED·Clube·HCP·Tee] | ±Par | Total
 *   | R1 | ±R1 | [SD | 🐦 | = | ■]
 *   | R2 | ±R2 | [SD | 🐦 | = | ■]
 *   | …  | [extraColumns]
 *
 * Estrutura de colunas (nRounds === 1):
 *   # | Jogador | [ESC·FED·Clube·HCP·Tee] | ±Par | Total | [SD | 🐦 | = | ■] | [extraColumns]
 *
 * Stats (SD/🐦/=/■) controladas por `showRoundStats` (default true).
 * Colunas extra (evolução, etc.) via `extraColumns` render prop.
 * Datas nas rondas via `roundDates`.
 */
import React, { useState, useMemo } from "react";
import { getTeeHex } from "../utils/teeColors";
import {
  isManuel,
  fmtTP,
  tpColor,
  TeeDot,
  TournPName,
  SDPill,
  type PlayersDB,
} from "./tournamentPrimitives";
import { toggleArr } from "../utils/mathUtils";
import { EscPill, ESC_STYLE } from "../ui/PillBadge";

/* ══════════════════════════════════════════════════════════════
   TIPOS PÚBLICOS
   ══════════════════════════════════════════════════════════════ */

/** Ronda individual normalizada, com stats próprias */
/** Linha normalizada para MultiRoundLeaderboard */
/* ══════════════════════════════════════════════════════════════
   FILTRO
   ══════════════════════════════════════════════════════════════ */

/** Resolve sexo de uma row via row.sex, fed→playersDB[fed].sex, ou nome
 *  via playersDB. Replica a lógica do PlayerFilterBar partilhado. */
function resolveSex(row: MultiRoundRow, playersDB?: PlayersDB, byName?: Map<string, string>): "M" | "F" | undefined {
  const s = row.sex || (row.fed && playersDB?.[row.fed]?.sex);
  if (s === "M" || s === "F") return s;
  if (row.name && byName) {
    const norm = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const v = byName.get(norm(row.name));
    if (v === "M" || v === "F") return v;
  }
  return undefined;
}

function buildSexByName(playersDB?: PlayersDB): Map<string, string> {
  const m = new Map<string, string>();
  if (!playersDB) return m;
  const norm = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  for (const k in playersDB) {
    const e = (playersDB as any)[k];
    if ((e?.sex === "M" || e?.sex === "F") && e?.name) {
      const nn = norm(e.name);
      if (!m.has(nn)) m.set(nn, e.sex);
    }
  }
  return m;
}

function filterRows(rows: MultiRoundRow[], f: PlayerFilter, playersDB?: PlayersDB, byName?: Map<string, string>): MultiRoundRow[] {
  let ps = rows;
  if (f.name) { const q = f.name.toLowerCase(); ps = ps.filter(r => r.name.toLowerCase().includes(q) || (r.club || "").toLowerCase().includes(q)); }
  if (f.escs.length) ps = ps.filter(r => r.esc != null && f.escs.includes(r.esc));
  if (f.tees.length) ps = ps.filter(r => r.teeName != null && f.tees.includes(r.teeName));
  if (f.club) ps = ps.filter(r => r.club === f.club);
  if (f.sex) ps = ps.filter(r => resolveSex(r, playersDB, byName) === f.sex);
  return ps;
}

function PlayerFilterBar({ rows, filter, onChange, total, playersDB }: {
  rows: MultiRoundRow[]; filter: PlayerFilter; onChange: (f: PlayerFilter) => void; total: number; playersDB?: PlayersDB;
}) {
  const availEsc   = useMemo(() => { const s = new Set<string>(); for (const r of rows) if (r.esc) s.add(r.esc); return [...s].sort((a,b) => a.localeCompare(b)); }, [rows]);
  const availTees  = useMemo(() => { const s = new Set<string>(); for (const r of rows) if (r.teeName) s.add(r.teeName); return [...s].sort(); }, [rows]);
  const availClubs = useMemo(() => { const s = new Set<string>(); for (const r of rows) if (r.club) s.add(r.club); return [...s].sort((a,b) => a.localeCompare(b,"pt")); }, [rows]);
  const sexByName = useMemo(() => buildSexByName(playersDB), [playersDB]);
  const availSex   = useMemo(() => { const s = new Set<string>(); for (const r of rows) { const sx = resolveSex(r, playersDB, sexByName); if (sx) s.add(sx); } return [...s] as ("M"|"F")[]; }, [rows, playersDB, sexByName]);
  const isActive = filter.name || filter.escs.length || filter.tees.length || filter.club || filter.sex;
  const filtered = useMemo(() => filterRows(rows, filter, playersDB, sexByName), [rows, filter, playersDB, sexByName]);
  const hasOpts = availClubs.length > 1 || availEsc.length > 1 || availTees.length > 1 || availSex.length === 2;
  if (total < 8 && !isActive) return null;

  return (
    <div className="filter-bar">
      <div className="search-wrap">
        <span className="search-icon-abs">🔍</span>
        <input type="text" placeholder="Nome ou clube…" value={filter.name} onChange={e => onChange({ ...filter, name:e.target.value })}
          style={{ fontSize:11, padding:"3px 8px 3px 22px", borderRadius:6, border:"1px solid var(--border)", background:"var(--bg-card,#fff)", color:"var(--text)", width:140, outline:"none" }} />
      </div>
      {hasOpts && <span style={{ color:"var(--border)", fontSize:11 }}>|</span>}
      {availEsc.length > 1 && availEsc.map(e => { const k = e.toLowerCase().replace(/[\s-]/g,""); const s = ESC_STYLE[k]; return <FilterChip key={e} active={filter.escs.includes(e)} onClick={() => onChange({ ...filter, escs:toggleArr(filter.escs,e) })} color={s?.bg}>{e}</FilterChip>; })}
      {availTees.length > 1 && availTees.map(t => { const hex = getTeeHex(t); return (
        <FilterChip key={t} active={filter.tees.includes(t)} onClick={() => onChange({ ...filter, tees:toggleArr(filter.tees,t) })} color={hex}>
          <span style={{ display:"flex", alignItems:"center", gap:4 }}>
            <span className="tee-dot-sq" style={{ background:hex }} />{t}
          </span>
        </FilterChip>
      ); })}
      {availClubs.length > 2 && <select value={filter.club} onChange={e => onChange({ ...filter, club:e.target.value })} style={{ fontSize:11, padding:"3px 6px", borderRadius:6, border:`1px solid ${filter.club?"var(--accent)":"var(--border)"}`, background:"var(--bg-card,#fff)", color:"var(--text)", cursor:"pointer", fontWeight:filter.club?700:400 }}><option value="">Todos os clubes</option>{availClubs.map(c => <option key={c} value={c}>{c}</option>)}</select>}
      {availSex.length === 2 && (
        <>
          <FilterChip active={filter.sex === "M"} onClick={() => onChange({ ...filter, sex: filter.sex === "M" ? "" : "M" })} color="var(--badge-male, #2563eb)">M</FilterChip>
          <FilterChip active={filter.sex === "F"} onClick={() => onChange({ ...filter, sex: filter.sex === "F" ? "" : "F" })} color="var(--badge-female, #ec4899)">F</FilterChip>
        </>
      )}
      {isActive && <><span style={{ fontSize:10, color:"var(--text-muted)", marginLeft:2 }}>{filtered.length} de {total}</span><button onClick={() => onChange(EMPTY_FILTER)} className="filter-clear-btn" style={{ fontSize:10, color:"var(--text-muted)" }}>✕ limpar</button></>}
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

type RowWithPos = MultiRoundRow & { _pos: number | null };

interface MultiRoundLBProps {
  rows: MultiRoundRow[];
  nRounds: number;
  playersDB?: PlayersDB;
  showCols?: {
    esc?: boolean;
    fed?: boolean;
    tee?: boolean;
    club?: boolean;
    hcp?: boolean;
    /** Mostrar colunas de stats por ronda (SD/🐦/=/■). Default: true */
    roundStats?: boolean;
    /** Mostrar colunas de ±par por ronda. Default: true */
    roundToPar?: boolean;
  };
  sortable?: boolean;
  filterable?: boolean;
  /** Labels de data para cada ronda (ex: ["25 Fev", "26 Fev"]) */
  roundDates?: string[];
  /** Colunas extra no final da tabela (ex: evolução) */
  extraColumns?: ExtraColumn<RowWithPos>[];
  /** Renderização customizada do nome do jogador. Se omitido, usa TournPName */
  renderName?: (row: MultiRoundRow) => React.ReactNode;
}

export function MultiRoundLeaderboard({
  rows, nRounds, playersDB,
  showCols = {},
  sortable = false,
  filterable = false,
  roundDates,
  extraColumns,
  renderName,
}: MultiRoundLBProps) {
  const {
    esc: wantEsc = true,
    fed: wantFed = true,
    tee: wantTee = true,
    club: wantClub = true,
    hcp: wantHcp = true,
    roundStats: wantRoundStats = true,
    roundToPar: wantRoundToPar = true,
  } = showCols;

  // Auto-hide: mesmo que showCols permita, esconder se NENHUM row tem dados.
  // Para ESC, também conta com rows que têm DOB no playersDB (idade computável).
  const hasAnyEsc  = useMemo(
    () => rows.some(r => (r.esc != null && r.esc !== "") || (r.fed && playersDB[r.fed]?.dob)),
    [rows, playersDB]
  );
  const hasAnyFed  = useMemo(() => rows.some(r => r.fed != null && r.fed !== ""), [rows]);
  const hasAnyClub = useMemo(() => rows.some(r => r.club != null && r.club !== ""), [rows]);
  const hasAnyHcp  = useMemo(() => rows.some(r => r.hcp != null), [rows]);
  const hasAnyTee  = useMemo(() => rows.some(r => r.teeName != null && r.teeName !== ""), [rows]);
  const hasAnySD   = useMemo(() => rows.some(r => r.rounds?.some(rd => rd?.sd != null)), [rows]);

  const showEsc = wantEsc && hasAnyEsc;
  const showFed = wantFed && hasAnyFed;
  const showClub = wantClub && hasAnyClub;
  const showHcp = wantHcp && hasAnyHcp;
  const showTee = wantTee && hasAnyTee;
  const showRoundStats = wantRoundStats && hasAnySD;
  const showRoundToPar = wantRoundToPar;

  const { sortKey, sortDir, toggleSort: handleSort } = useSort<MRSortKey>("pos", "asc");
  const [filter, setFilter] = useState<PlayerFilter>(EMPTY_FILTER);

  if (!rows.length) return <EmptyState size="sm" message="Sem resultados." />;

  // WD = desistiu; incomplete = ainda não jogou todas as rondas disponíveis
  const complete   = rows.filter(r => !r.isIncomplete && !r.isWD);
  const incomplete = rows.filter(r =>  r.isIncomplete && !r.isWD);
  const wdRows     = rows.filter(r =>  r.isWD);

  /* Posições — apenas jogadores completos e não-WD */
  const withPos: RowWithPos[] = useMemo(() => {
    const forRank = [...complete].sort((a, b) => (a.gross ?? 9999) - (b.gross ?? 9999));
    let counter = 1;
    const posMap = new Map<string, number>();
    forRank.forEach((r, i) => {
      if (i > 0 && r.gross !== forRank[i - 1].gross) counter = i + 1;
      posMap.set(r.key || r.name, counter);
    });
    return rows.map(r => ({
      ...r,
      _pos: (r.isIncomplete || r.isWD) ? null : (posMap.get(r.key || r.name) ?? null),
    }));
  }, [rows]);

  /* Filtro — passa playersDB para resolver sexo de jogadores sem fedCode */
  const sexByName = useMemo(() => buildSexByName(playersDB), [playersDB]);
  const filteredComplete   = useMemo(() => filterRows(withPos.filter(r => !r.isIncomplete && !r.isWD), filter, playersDB, sexByName), [withPos, filter, playersDB, sexByName]);
  const filteredIncomplete = useMemo(() => filterRows(withPos.filter(r =>  r.isIncomplete && !r.isWD), filter, playersDB, sexByName), [withPos, filter, playersDB, sexByName]);
  const filteredWD         = useMemo(() => filterRows(withPos.filter(r =>  r.isWD), filter, playersDB, sexByName),                   [withPos, filter, playersDB, sexByName]);

  /* Sort */
  function cmp(a: RowWithPos, b: RowWithPos): number {
    const INF = 9999;
    switch (sortKey) {
      case "pos":   return sortDir === "asc" ? (a._pos ?? INF) - (b._pos ?? INF) : (b._pos ?? INF) - (a._pos ?? INF);
      case "name":  return sortDir === "asc" ? a.name.localeCompare(b.name,"pt") : b.name.localeCompare(a.name,"pt");
      case "club":  return sortDir === "asc" ? (a.club||"").localeCompare(b.club||"","pt") : (b.club||"").localeCompare(a.club||"","pt");
      case "esc":   return sortDir === "asc" ? (a.esc||"").localeCompare(b.esc||"") : (b.esc||"").localeCompare(a.esc||"");
      case "tee":   return sortDir === "asc" ? (a.teeName||"").localeCompare(b.teeName||"") : (b.teeName||"").localeCompare(a.teeName||"");
      case "hcp":   return sortDir === "asc" ? (a.hcp ?? INF) - (b.hcp ?? INF) : (b.hcp ?? INF) - (a.hcp ?? INF);
      case "gross": return sortDir === "asc" ? (a.gross ?? INF) - (b.gross ?? INF) : (b.gross ?? INF) - (a.gross ?? INF);
      case "toPar": return sortDir === "asc" ? ((a.gross ?? INF) - (a.parTotal ?? 0)) - ((b.gross ?? INF) - (b.parTotal ?? 0)) : ((b.gross ?? INF) - (b.parTotal ?? 0)) - ((a.gross ?? INF) - (a.parTotal ?? 0));
      case "sd":    { const sa = a.rounds[0]?.sd ?? INF; const sb = b.rounds[0]?.sd ?? INF; return sortDir === "asc" ? sa - sb : sb - sa; }
      default:      return 0;
    }
  }

  const sorted = useMemo(() => {
    if (!sortable) return [...filteredComplete, ...filteredIncomplete, ...filteredWD];
    return [...filteredComplete].sort(cmp).concat([...filteredIncomplete].sort(cmp), [...filteredWD].sort(cmp));
  }, [filteredComplete, filteredIncomplete, filteredWD, sortKey, sortDir, sortable]);

  function SHdr({ k, children, className }: { k: MRSortKey; children: React.ReactNode; className?: string }) {
    const active = sortable && sortKey === k;
    return (
      <th className={(className || "") + (sortable ? " lb-sortable" : "")} onClick={() => handleSort(k)}>
        {children}{active && <span className="sort-arrow">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </th>
    );
  }

  const isMulti = nRounds >= 2;

  return (
    <div>
      {filterable && (
        <PlayerFilterBar rows={withPos} filter={filter} onChange={setFilter} total={rows.length} playersDB={playersDB} />
      )}
      <div className="bjgt-chart-scroll">
        <table className={"sc-lb sc-lb-lbd" + (isMulti ? " sc-lb-multi" : "")}>
          <thead>
            <tr>
              <th className="lb-pos sticky-col-0">#</th>
              <SHdr k="name" className="lb-name sticky-col-1">Jogador</SHdr>
              {showEsc && <SHdr k="esc" className="lb-esc">ESC.</SHdr>}
              {showFed && <th className="lb-fed">FED</th>}
              {showClub && <SHdr k="club" className="lb-club">Clube</SHdr>}
              {showHcp && <SHdr k="hcp"  className="lb-hcp">HCP</SHdr>}
              {showTee && <th className="lb-tee">TEE</th>}

              {/* ±Par ANTES de Total */}
              <SHdr k="toPar" className="lb-topar">±Par</SHdr>
              <SHdr k="gross" className="lb-gross">{isMulti ? "Total" : "Tot"}</SHdr>

              {/* Acumulados multi-ronda (entre Total e R1) */}
              {isMulti && showRoundStats && <>
                <th className="lb-acc-bird">🐦</th>
                <th className="lb-acc-par">=</th>
                <th className="lb-acc-bog">■</th>
              </>}

              {/* Por ronda */}
              {isMulti
                ? Array.from({ length: nRounds }, (_, r) => (
                    <React.Fragment key={r}>
                      <th className="lb-rnd">
                        R{r + 1}
                        {roundDates?.[r] && <><br /><span className="th-sub">{roundDates[r]}</span></>}
                      </th>
                      {showRoundToPar && <th className="lb-rnd-tp">±</th>}
                      {showRoundStats && <>
                        <th className="lb-rnd-sd">SD</th>
                        <th className="lb-rnd-bird">🐦</th>
                        <th className="lb-rnd-par">=</th>
                        <th className="lb-rnd-bog">■</th>
                      </>}
                    </React.Fragment>
                  ))
                : <>
                    {showRoundStats && <>
                      <th className="lb-sd">SD</th>
                      <th className="lb-bird">🐦</th>
                      <th className="lb-par-stat">Par</th>
                      <th className="lb-bog">■</th>
                    </>}
                  </>
              }

              {/* Colunas extra */}
              {extraColumns?.map((col, ci) => (
                <th key={ci} className={col.className} style={col.headerStyle}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const tp = (row.gross ?? 0) - (row.parTotal ?? 0);
              const isInc = row.isIncomplete && !row.isWD;  // ronda ainda por jogar
              const isWD  = !!row.isWD;                     // desistiu
              const dp = row._pos;
              const tpCol = (!isInc && !isWD) ? tpColor(tp) : undefined;
              const mdl = !isInc && !isWD && dp != null ? medal(dp) : null;
              const showPos = !isInc && !isWD && (
                sortable && sortKey === "pos"
                  ? (idx === 0 || dp !== sorted[idx - 1]._pos)
                  : true
              );
              const rowBg = row.isHighlighted ? "var(--bg-success-subtle)"
                : isWD  ? "var(--bg-hover)"
                : isInc ? "var(--bg-hover)"
                : undefined;
              const stickyBg = row.isHighlighted ? "var(--bg-manuel-sticky)"
                : (isInc || isWD) ? "var(--bg-hover)"
                : "var(--bg-card,#fff)";

              // Manuel toma precedência sobre Portuguese (só uma classe é aplicada).
              const rowCls = row.isHighlighted ? "row-manuel" : (row.isPortuguese ? "row-portuguese" : undefined);
              return (
                <tr key={row.key || row.name + idx}
                  className={rowCls}
                  style={(isInc || isWD) ? { background: rowBg, opacity: isWD ? 0.55 : 0.7 } : row.isHighlighted ? { background: rowBg } : undefined}>
                  <td className="lb-pos sticky-col-0" style={row.isHighlighted ? undefined : { background: stickyBg }}>
                    {isWD
                      ? <WdBadge />
                      : isInc
                        ? ""
                        : showPos ? (mdl || dp) : ""}
                  </td>
                  <td className="lb-name sticky-col-1" style={row.isHighlighted ? undefined : { background: stickyBg }}>
                    {renderName
                      ? renderName(row)
                      : playersDB
                        ? <TournPName name={row.name} fedCode={row.fed} playersDB={playersDB} />
                        : <>{row.countryFlag && <>{row.countryFlag} </>}<span className="fw-700">{row.name}</span></>
                    }
                    {isInc && <span className="badge-inc">INC</span>}
                  </td>
                  {showEsc && <td className="lb-esc">{(() => {
                    if (row.esc) return <EscPill esc={row.esc} />;
                    // Fallback: idade exacta se temos DOB no playersDB
                    const dob = row.fed && playersDB[row.fed]?.dob;
                    const tDate = roundDates?.[roundDates.length - 1] || roundDates?.[0];
                    if (dob && tDate) {
                      const d = new Date(dob); const t = new Date(tDate);
                      if (!isNaN(+d) && !isNaN(+t)) {
                        let age = t.getFullYear() - d.getFullYear();
                        const m = t.getMonth() - d.getMonth();
                        if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
                        if (age >= 0 && age < 100) {
                          return <span className="p p-sm" title={`${dob} (${age} anos)`}
                            style={{ background: "var(--bg-muted, #e5e7eb)", color: "var(--text-2)", borderColor: "transparent" }}>{age}a</span>;
                        }
                      }
                    }
                    return <span className="muted">–</span>;
                  })()}</td>}
                  {showFed && <td className="lb-fed">{row.fed || "–"}</td>}
                  {showClub && (() => {
                    // Em torneios internacionais o "clube" é frequentemente
                    // um código ISO-3 (FRA, ESP, SUI, EST). Mostrar bandeira
                    // em vez do código quando reconhecível.
                    const club = row.club || "";
                    const upper = club.trim().toUpperCase();
                    const isCC = /^[A-Z]{2,3}$/.test(upper);
                    const fl = isCC ? flagOf(club) : null;
                    if (isCC && fl && fl !== "🏳️") {
                      const code = normCountry(club).toUpperCase();
                      return <td className="lb-club" title={code}><span style={{ fontSize: "1.1em" }}>{fl}</span></td>;
                    }
                    return <td className="lb-club">{club || "–"}</td>;
                  })()}
                  {showHcp && <td className="lb-hcp">{fmtHcp(row.hcp)}</td>}
                  {showTee && <td className="lb-tee"><TeeDot teeName={row.teeName} /></td>}

                  {/* ±Par ANTES de Total */}
                  <td className="lb-topar" style={{ color: tpCol, opacity: (isInc || isWD) ? 0.5 : 1 }}>{fmtTP(tp)}</td>
                  <td className="lb-gross" style={{ opacity: (isInc || isWD) ? 0.5 : 1 }}>{(row.gross ?? 0) > 0 ? row.gross : "–"}</td>

                  {/* Acumulados multi-ronda */}
                  {isMulti && showRoundStats && (() => {
                    let tBird = 0, tPar = 0, tBog = 0;
                    for (const rd of row.rounds) { if (rd) { tBird += rd.birdies || 0; tPar += rd.pars || 0; tBog += rd.bogeys || 0; } }
                    return <>
                      <td className="lb-acc-bird">{tBird || ""}</td>
                      <td className="lb-acc-par">{tPar || ""}</td>
                      <td className="lb-acc-bog">{tBog || ""}</td>
                    </>;
                  })()}

                  {/* Colunas por ronda */}
                  {isMulti
                    ? Array.from({ length: nRounds }, (_, r) => {
                        const rd = row.rounds[r];
                        const emptyCols = (showRoundToPar ? 1 : 0) + (showRoundStats ? 4 : 0);
                        if (!rd) return (
                          <React.Fragment key={r}>
                            <td className="lb-rnd c-muted">–</td>
                            {Array.from({ length: emptyCols }, (_, j) => (
                              <td key={j} className="c-muted">–</td>
                            ))}
                          </React.Fragment>
                        );
                        const rtp = (rd.gross ?? 0) - (rd.parPerRound ?? 0);
                        return (
                          <React.Fragment key={r}>
                            <td className="lb-rnd">{rd.gross}</td>
                            {showRoundToPar && <td className="lb-rnd-tp" style={{ color: tpColor(rtp) }}>{fmtTP(rtp)}</td>}
                            {showRoundStats && <>
                              <td className="lb-rnd-sd">
                                {rd.sd != null
                                  ? <SDPill sd={rd.sd} source={rd.sdSource ?? null} hcp={row.hcp} />
                                  : <span className="muted">–</span>}
                              </td>
                              <td className="lb-rnd-bird">{rd.birdies || ""}</td>
                              <td className="lb-rnd-par">{rd.pars || ""}</td>
                              <td className="lb-rnd-bog">{rd.bogeys || ""}</td>
                            </>}
                          </React.Fragment>
                        );
                      })
                    : showRoundStats ? (() => {
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
                      })() : null
                  }

                  {/* Colunas extra */}
                  {extraColumns?.map((col, ci) => (
                    <td key={ci} className={col.className}>{col.cell(row, idx)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );}
