// @refresh reset
import { MultiRoundRow, PlayerFilter, EMPTY_FILTER, ExtraColumn } from "./multiRoundTypes";
import { useCompareSelection } from "./useCompareSelection";
import { fmtHcp, medal, fmtDobPt, birthYearOf, ageAtDate, todayIso } from "../utils/format";
import { RowsFilterBar, filterRows, buildSexByName } from "./PlayerFilterBar";
import { flag as flagOf, normCountry } from "../utils/flagUtils";
import { useSort } from "../hooks/useSort";
import WdBadge from "../ui/WdBadge";
import EmptyState from "../ui/EmptyState";
import SortableHdr from "../ui/SortableHdr";
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
import {
  fmtTP,
  tpColor,
  TeeDot,
  TournPName,
  SDPill,
  type PlayersDB,
} from "./tournamentPrimitives";
import { EscPill } from "../ui/PillBadge";
import { displayFed } from "../utils/fedKeys";

/* ══════════════════════════════════════════════════════════════
   TIPOS SORT
   ══════════════════════════════════════════════════════════════ */
type MRSortKey =
  | "pos" | "name" | "club" | "esc" | "hcp" | "gross" | "toPar" | "tee" | "fed"
  | "sd" | "birthYear" | "age"
  | "eag" | "bird" | "par-stat" | "bog"
  | "acc:eag" | "acc:bird" | "acc:par" | "acc:bog"
  | `gross:${number}` | `rtp:${number}`
  | `sd:${number}` | `eag:${number}` | `bird:${number}` | `par:${number}` | `bog:${number}`
  | `x:${number}`;

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
    /** Mostrar coluna de ano de nascimento. Default: true (auto-escondida sem dados) */
    birthYear?: boolean;
    /** Mostrar coluna de idade à data do torneio. Default: true (auto-escondida sem dados) */
    age?: boolean;
    /** Mostrar colunas de stats por ronda (SD/🐦/=/■). Default: true */
    roundStats?: boolean;
    /** Mostrar colunas de ±par por ronda. Default: true */
    roundToPar?: boolean;
    /** Mostrar a coluna ±Par do total. Default: true (false quando a fonte não tem par — WAGR). */
    toPar?: boolean;
    /** Mostrar a coluna Total. Default: true (false quando não há resultados — só destaques). */
    gross?: boolean;
  };
  sortable?: boolean;
  filterable?: boolean;
  /** Labels de data para cada ronda (ex: ["25 Fev", "26 Fev"]) */
  roundDates?: string[];
  /** Data do torneio (ISO) — usada para calcular a idade dos jogadores. */
  tournamentDate?: string;
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
  tournamentDate,
  extraColumns,
  renderName,
}: MultiRoundLBProps) {
  const {
    esc: wantEsc = true,
    fed: wantFed = true,
    tee: wantTee = true,
    club: wantClub = true,
    hcp: wantHcp = true,
    birthYear: wantBirthYear = true,
    age: wantAge = true,
    roundStats: wantRoundStats = true,
    roundToPar: wantRoundToPar = true,
    toPar: showToPar = true,
    gross: showGross = true,
  } = showCols;

  // Auto-hide: mesmo que showCols permita, esconder se nenhum jogador ALÉM DO
  // MANUEL tem dados (20/10/2026 — num torneio internacional só ele tem escalão,
  // federado e HCP). Para ESC, também conta com DOB no playersDB (idade).
  const outros = useMemo(() => rows.filter(r => !r.isHighlighted), [rows]);
  const hasAnyEsc  = useMemo(
    () => outros.some(r => (r.esc != null && r.esc !== "") || (r.fed && playersDB?.[r.fed]?.dob)),
    [outros, playersDB]
  );
  const hasAnyFed  = useMemo(() => outros.some(r => r.fed != null && r.fed !== ""), [outros]);
  // «Clube» que é só o país (USKids, internacionais: IT, GB-ENG…): a bandeira vai
  // para antes do nome e a coluna sai — com clubes a sério a coluna fica.
  // O código pode vir sozinho («IT») ou já com a bandeira à frente («🇮🇹 IT», USKids).
  const semBandeira = (c?: string | null) => (c || "").replace(/^[\u{1F1E6}-\u{1F1FF}\u{1F3F4}][\u{1F1E6}-\u{1F1FF}\u{E0000}-\u{E007F}]*\s*/u, "").trim();
  const clubesSaoPaises = useMemo(() => rows.some(r => r.club) && rows.every(r => {
    const u = semBandeira(r.club).toUpperCase();
    return !u || (/^[A-Z]{2,3}(-[A-Z]{2,4})?$/.test(u) && flagOf(u) !== "🏳️");
  }), [rows]);
  const hasAnyClub = useMemo(() => !clubesSaoPaises && outros.some(r => r.club != null && r.club !== ""), [outros, clubesSaoPaises]);
  const hasAnyHcp  = useMemo(() => outros.some(r => r.hcp != null), [outros]);
  // TEE: também sai quando todos jogam do mesmo tee (já está na informação da prova).
  const hasAnyTee  = useMemo(() => outros.some(r => r.teeName != null && r.teeName !== "")
    && new Set(rows.map(r => r.teeName || "")).size > 1, [outros, rows]);
  const hasAnySD   = useMemo(() => rows.some(r => r.rounds?.some(rd => rd?.sd != null)), [rows]);
  // Dados buraco-a-buraco (birdies/pars/bogeys) existem mesmo quando não há CR/Slope
  // para calcular SD (ex.: torneios RFEG/LGS). Mostrar as stats por ronda na mesma —
  // o SD cai para "–" graciosamente — para o Resumo ficar igual ao da FPGPage.
  const hasAnyRoundHoleStats = useMemo(() => rows.some(r => r.rounds?.some(rd => rd && ((rd.birdies || 0) + (rd.pars || 0) + (rd.bogeys || 0)) > 0)), [rows]);
  // Nasc./Idade: usa dob da row, com fallback ao playersDB[fed].dob.
  const dobOf = useMemo(() => (r: MultiRoundRow): string | null =>
    r.dob || (r.fed ? (playersDB?.[r.fed] as any)?.dob ?? null : null), [playersDB]);
  const hasAnyDob  = useMemo(() => rows.some(r => birthYearOf(dobOf(r)) != null), [rows, dobOf]);

  const showEsc = wantEsc && hasAnyEsc;
  const showFed = wantFed && hasAnyFed;
  const showClub = wantClub && hasAnyClub;
  const showHcp = wantHcp && hasAnyHcp;
  const showTee = wantTee && hasAnyTee;
  const showBirthYear = wantBirthYear && hasAnyDob;
  const showAge = wantAge && hasAnyDob;
  const showRoundStats = wantRoundStats && (hasAnySD || hasAnyRoundHoleStats);
  const showRoundToPar = wantRoundToPar;

  const { sortKey, sortDir, toggleSort: handleSort } = useSort<MRSortKey>("pos", "asc");
  const [filter, setFilter] = useState<PlayerFilter>(EMPTY_FILTER);

  if (!rows.length) return <EmptyState size="sm" message="Sem resultados." />;

  // WD = desistiu; incomplete = ainda nao jogou todas as rondas; cut = eliminado no cut
  const complete   = rows.filter(r => !r.isIncomplete && !r.isWD && !r.isCut);

  /* Posições — apenas jogadores completos e não-WD */
  const withPos: RowWithPos[] = useMemo(() => {
    // Sem resultado (gross null) não há posição — nem «1.º empatado» de todos.
    const forRank = complete.filter(r => r.gross != null).sort((a, b) => (a.gross as number) - (b.gross as number));
    let counter = 1;
    const posMap = new Map<string, number>();
    forRank.forEach((r, i) => {
      if (i > 0 && r.gross !== forRank[i - 1].gross) counter = i + 1;
      posMap.set(r.key || r.name, counter);
    });
    return rows.map(r => ({
      ...r,
      _pos: (r.isIncomplete || r.isWD || r.isCut) ? null : (posMap.get(r.key || r.name) ?? null),
    }));
  }, [rows]);

  /* Filtro — passa playersDB para resolver sexo de jogadores sem fedCode */
  const sexByName = useMemo(() => buildSexByName(playersDB), [playersDB]);
  const filteredComplete   = useMemo(() => filterRows(withPos.filter(r => !r.isIncomplete && !r.isWD && !r.isCut), filter, playersDB, sexByName), [withPos, filter, playersDB, sexByName]);
  const filteredCut        = useMemo(() => filterRows(withPos.filter(r =>  r.isCut && !r.isWD), filter, playersDB, sexByName), [withPos, filter, playersDB, sexByName]);
  const filteredIncomplete = useMemo(() => filterRows(withPos.filter(r =>  r.isIncomplete && !r.isWD && !r.isCut), filter, playersDB, sexByName), [withPos, filter, playersDB, sexByName]);
  const filteredWD         = useMemo(() => filterRows(withPos.filter(r =>  r.isWD), filter, playersDB, sexByName),                   [withPos, filter, playersDB, sexByName]);

  /* Sort */
  function cmp(a: RowWithPos, b: RowWithPos): number {
    const INF = 9999;
    // Coluna extra com `sortValue`: "x:0", "x:1", ... (índice em extraColumns)
    if (typeof sortKey === "string" && sortKey.startsWith("x:")) {
      const sv = extraColumns?.[parseInt(sortKey.slice(2), 10)]?.sortValue;
      const va = sv?.(a), vb = sv?.(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const d = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt");
      return sortDir === "asc" ? d : -d;
    }
    // Gross por ronda específica: "gross:0", "gross:1", ... (índice 0-based)
    // Menos pancadas primeiro em asc. Rondas não jogadas vão para o fim.
    if (typeof sortKey === "string" && sortKey.startsWith("gross:")) {
      const ri = parseInt(sortKey.slice(6), 10);
      const sa = a.rounds[ri]?.gross ?? INF;
      const sb = b.rounds[ri]?.gross ?? INF;
      return sortDir === "asc" ? sa - sb : sb - sa;
    }
    // ±par por ronda específica: "rtp:0", "rtp:1", ...
    if (typeof sortKey === "string" && sortKey.startsWith("rtp:")) {
      const ri = parseInt(sortKey.slice(4), 10);
      const ra = a.rounds[ri];
      const rb = b.rounds[ri];
      const sa = ra ? (ra.gross ?? INF) - (ra.parPerRound ?? 0) : INF;
      const sb = rb ? (rb.gross ?? INF) - (rb.parPerRound ?? 0) : INF;
      return sortDir === "asc" ? sa - sb : sb - sa;
    }
    // SD por ronda específica: "sd:0", "sd:1", ... (índice 0-based da ronda)
    if (typeof sortKey === "string" && sortKey.startsWith("sd:")) {
      const ri = parseInt(sortKey.slice(3), 10);
      const sa = a.rounds[ri]?.sd ?? INF;
      const sb = b.rounds[ri]?.sd ?? INF;
      return sortDir === "asc" ? sa - sb : sb - sa;
    }
    // Eagles por ronda específica: "eag:0", "eag:1", ...
    if (typeof sortKey === "string" && sortKey.startsWith("eag:")) {
      const ri = parseInt(sortKey.slice(4), 10);
      const sa = a.rounds[ri]?.eagles ?? 0;
      const sb = b.rounds[ri]?.eagles ?? 0;
      return sortDir === "asc" ? sb - sa : sa - sb;
    }
    // Birdies por ronda específica: "bird:0", "bird:1", ...
    if (typeof sortKey === "string" && sortKey.startsWith("bird:")) {
      const ri = parseInt(sortKey.slice(5), 10);
      const sa = a.rounds[ri]?.birdies ?? 0;
      const sb = b.rounds[ri]?.birdies ?? 0;
      // Mais birdies primeiro em asc (mais útil — clica e vê quem fez mais).
      return sortDir === "asc" ? sb - sa : sa - sb;
    }
    // Pares por ronda específica: "par:0", "par:1", ...
    if (typeof sortKey === "string" && sortKey.startsWith("par:")) {
      const ri = parseInt(sortKey.slice(4), 10);
      const sa = a.rounds[ri]?.pars ?? 0;
      const sb = b.rounds[ri]?.pars ?? 0;
      return sortDir === "asc" ? sb - sa : sa - sb;
    }
    // Bogeys por ronda específica: "bog:0", "bog:1", ...
    if (typeof sortKey === "string" && sortKey.startsWith("bog:")) {
      const ri = parseInt(sortKey.slice(4), 10);
      const sa = a.rounds[ri]?.bogeys ?? 999;
      const sb = b.rounds[ri]?.bogeys ?? 999;
      // Menos bogeys primeiro em asc (clássico — quem fez menos jogou melhor).
      return sortDir === "asc" ? sa - sb : sb - sa;
    }
    switch (sortKey) {
      case "pos":   return sortDir === "asc" ? (a._pos ?? INF) - (b._pos ?? INF) : (b._pos ?? INF) - (a._pos ?? INF);
      case "name":  return sortDir === "asc" ? a.name.localeCompare(b.name,"pt") : b.name.localeCompare(a.name,"pt");
      case "club":  return sortDir === "asc" ? (a.club||"").localeCompare(b.club||"","pt") : (b.club||"").localeCompare(a.club||"","pt");
      case "esc":   return sortDir === "asc" ? (a.esc||"").localeCompare(b.esc||"") : (b.esc||"").localeCompare(a.esc||"");
      case "tee":   return sortDir === "asc" ? (a.teeName||"").localeCompare(b.teeName||"") : (b.teeName||"").localeCompare(a.teeName||"");
      case "fed":   return sortDir === "asc" ? (a.fed||"").localeCompare(b.fed||"") : (b.fed||"").localeCompare(a.fed||"");
      case "hcp":   return sortDir === "asc" ? (a.hcp ?? INF) - (b.hcp ?? INF) : (b.hcp ?? INF) - (a.hcp ?? INF);
      case "gross": return sortDir === "asc" ? (a.gross ?? INF) - (b.gross ?? INF) : (b.gross ?? INF) - (a.gross ?? INF);
      case "toPar": {
        // O ±par da linha quando existe (fontes com ±par próprio); senão gross − par.
        const tp = (r: RowWithPos) => r.toPar ?? ((r.gross ?? INF) - (r.parTotal ?? 0));
        return sortDir === "asc" ? tp(a) - tp(b) : tp(b) - tp(a);
      }
      case "sd":    { const sa = a.rounds[0]?.sd ?? INF; const sb = b.rounds[0]?.sd ?? INF; return sortDir === "asc" ? sa - sb : sb - sa; }
      case "eag":       { const sa = a.rounds[0]?.eagles ?? 0;   const sb = b.rounds[0]?.eagles ?? 0;   return sortDir === "asc" ? sb - sa : sa - sb; }
      case "bird":      { const sa = a.rounds[0]?.birdies ?? 0;  const sb = b.rounds[0]?.birdies ?? 0;  return sortDir === "asc" ? sb - sa : sa - sb; }
      case "par-stat":  { const sa = a.rounds[0]?.pars ?? 0;     const sb = b.rounds[0]?.pars ?? 0;     return sortDir === "asc" ? sb - sa : sa - sb; }
      case "bog":       { const sa = a.rounds[0]?.bogeys ?? 999; const sb = b.rounds[0]?.bogeys ?? 999; return sortDir === "asc" ? sa - sb : sb - sa; }
      case "acc:eag":   {
        const sa = a.rounds.reduce((t, r) => t + (r?.eagles || 0), 0);
        const sb = b.rounds.reduce((t, r) => t + (r?.eagles || 0), 0);
        return sortDir === "asc" ? sb - sa : sa - sb;
      }
      case "acc:bird":  {
        const sa = a.rounds.reduce((t, r) => t + (r?.birdies || 0), 0);
        const sb = b.rounds.reduce((t, r) => t + (r?.birdies || 0), 0);
        return sortDir === "asc" ? sb - sa : sa - sb;
      }
      case "acc:par":   {
        const sa = a.rounds.reduce((t, r) => t + (r?.pars || 0), 0);
        const sb = b.rounds.reduce((t, r) => t + (r?.pars || 0), 0);
        return sortDir === "asc" ? sb - sa : sa - sb;
      }
      case "acc:bog":   {
        const sa = a.rounds.reduce((t, r) => t + (r?.bogeys || 0), 0);
        const sb = b.rounds.reduce((t, r) => t + (r?.bogeys || 0), 0);
        return sortDir === "asc" ? sa - sb : sb - sa;
      }
      case "birthYear": {
        const ya = birthYearOf(dobOf(a));
        const yb = birthYearOf(dobOf(b));
        if (ya == null && yb == null) return 0;
        if (ya == null) return 1;   // sem data → sempre no fim
        if (yb == null) return -1;
        return sortDir === "asc" ? ya - yb : yb - ya;
      }
      case "age": {
        // Idade real à data do torneio (não o ano) — dois jogadores do mesmo
        // ano podem ter idades diferentes consoante já fizeram anos.
        const aa = ageAtDate(dobOf(a), tournamentDate ?? todayIso());
        const ab = ageAtDate(dobOf(b), tournamentDate ?? todayIso());
        if (aa == null && ab == null) return 0;
        if (aa == null) return 1;   // sem data → sempre no fim
        if (ab == null) return -1;
        return sortDir === "asc" ? aa - ab : ab - aa;
      }
      default:      return 0;
    }
  }

  // Comparador para cut/incomplete/wd: ordenar sempre por gross (asc).
  // No header sort principal os cut continuam separados (sempre depois dos completos).
  function cmpGross(a: RowWithPos, b: RowWithPos): number {
    return (a.gross ?? 9999) - (b.gross ?? 9999);
  }
  const sorted = useMemo(() => {
    if (!sortable) return [...filteredComplete, ...filteredCut, ...filteredIncomplete, ...filteredWD];
    return [...filteredComplete].sort(cmp).concat(
      [...filteredCut].sort(cmpGross),
      [...filteredIncomplete].sort(cmpGross),
      [...filteredWD].sort(cmpGross),
    );
  }, [filteredComplete, filteredCut, filteredIncomplete, filteredWD, sortKey, sortDir, sortable]);

  /* ── Selecção para comparação (hook partilhado da família de tabelas) ──
   * Chave = key da linha ou, sem ela, o nome (o render usa o mesmo fallback). */
  const compareSel = useCompareSelection<string | number>();
  const compareKey = (row: MultiRoundRow) => row.key || row.name;
  const visibleSorted = compareSel.filter(sorted, compareKey);

  function SHdr({ k, children, className }: { k: MRSortKey; children: React.ReactNode; className?: string }) {
    if (!sortable) return <th className={className}>{children}</th>;
    return (
      <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className={className}>
        {children}
      </SortableHdr>
    );
  }

  const isMulti = nRounds >= 2;

  return (
    <div>
      {filterable && (
        <RowsFilterBar rows={withPos} filter={filter} onChange={setFilter} total={rows.length} playersDB={playersDB} />
      )}
      {compareSel.bar}
      <div className="bjgt-chart-scroll">
        <table className={"sc-lb sc-lb-lbd has-cmp" + (isMulti ? " sc-lb-multi" : "")}>
          <thead>
            <tr>
              <th className="lb-pos sticky-col-0">#</th>
              <SHdr k="name" className="lb-name sticky-col-1">Jogador</SHdr>
              {showEsc && <SHdr k="esc" className="lb-esc">ESC.</SHdr>}
              {showBirthYear && <SHdr k="birthYear" className="lb-esc">Nasc.</SHdr>}
              {showAge && <SHdr k="age" className="lb-esc">Idade</SHdr>}
              {showFed && <SHdr k="fed" className="lb-fed">FED</SHdr>}
              {showClub && <SHdr k="club" className="lb-club">Clube</SHdr>}
              {showHcp && <SHdr k="hcp"  className="lb-hcp">HCP</SHdr>}
              {showTee && <SHdr k="tee" className="lb-tee">TEE</SHdr>}

              {/* ±Par ANTES de Total */}
              {showToPar && <SHdr k="toPar" className="lb-topar">±Par</SHdr>}
              {showGross && <SHdr k="gross" className="lb-gross">{isMulti ? "Total" : "Tot"}</SHdr>}

              {/* Acumulados multi-ronda (entre Total e R1) */}
              {isMulti && showRoundStats && <>
                <SHdr k="acc:eag"  className="lb-acc-eag">🦅</SHdr>
                <SHdr k="acc:bird" className="lb-acc-bird">🐦</SHdr>
                <SHdr k="acc:par"  className="lb-acc-par">=</SHdr>
                <SHdr k="acc:bog"  className="lb-acc-bog">■</SHdr>
              </>}

              {/* Por ronda */}
              {isMulti
                ? Array.from({ length: nRounds }, (_, r) => (
                    <React.Fragment key={r}>
                      <SHdr k={`gross:${r}` as MRSortKey} className="lb-rnd">
                        R{r + 1}
                        {roundDates?.[r] && <><br /><span className="th-sub">{roundDates[r]}</span></>}
                      </SHdr>
                      {showRoundToPar && <SHdr k={`rtp:${r}` as MRSortKey} className="lb-rnd-tp">±</SHdr>}
                      {showRoundStats && <>
                        {hasAnySD && <SHdr k={`sd:${r}` as MRSortKey} className="lb-rnd-sd">SD</SHdr>}
                        <SHdr k={`eag:${r}` as MRSortKey} className="lb-rnd-eag">🦅</SHdr>
                        <SHdr k={`bird:${r}` as MRSortKey} className="lb-rnd-bird">🐦</SHdr>
                        <SHdr k={`par:${r}`  as MRSortKey} className="lb-rnd-par">=</SHdr>
                        <SHdr k={`bog:${r}`  as MRSortKey} className="lb-rnd-bog">■</SHdr>
                      </>}
                    </React.Fragment>
                  ))
                : <>
                    {showRoundStats && <>
                      {hasAnySD && <SHdr k="sd" className="lb-sd">SD</SHdr>}
                      <SHdr k="eag"      className="lb-eag">🦅</SHdr>
                      <SHdr k="bird"     className="lb-bird">🐦</SHdr>
                      <SHdr k="par-stat" className="lb-par-stat">Par</SHdr>
                      <SHdr k="bog"      className="lb-bog">■</SHdr>
                    </>}
                  </>
              }

              {/* Colunas extra */}
              {extraColumns?.map((col, ci) => (
                col.sortValue && sortable
                  ? <SortableHdr key={ci} k={`x:${ci}` as MRSortKey} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className={col.className}>{col.header}</SortableHdr>
                  : <th key={ci} className={col.className} style={col.headerStyle}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleSorted.map((row, idx) => {
              // Sem ±par nem par total (fonte sem par) → «–», nunca gross − 0.
              const tp = row.toPar != null ? row.toPar : row.parTotal ? (row.gross ?? 0) - row.parTotal : null;
              const isInc = row.isIncomplete && !row.isWD && !row.isCut;  // ronda ainda por jogar
              const isWD  = !!row.isWD;                     // desistiu
              const isCut = !!row.isCut && !row.isWD;       // eliminado no cut
              const dp = row._pos;
              const tpCol = (!isInc && !isWD && !isCut) ? tpColor(tp) : undefined;
              const mdl = !isInc && !isWD && !isCut && dp != null ? medal(dp) : null;
              const showPos = !isInc && !isWD && !isCut && (
                sortable && sortKey === "pos"
                  ? (idx === 0 || dp !== visibleSorted[idx - 1]._pos)
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
                  style={(isInc || isWD || isCut) ? { background: rowBg, opacity: isWD ? 0.55 : isCut ? 0.85 : 0.7 } : row.isHighlighted ? { background: rowBg } : undefined}>
                  <td className="lb-pos sticky-col-0" style={{ ...(row.isHighlighted ? {} : { background: stickyBg }), whiteSpace: "nowrap" }}>
                    {compareSel.checkbox(compareKey(row))}
                    {isWD
                      ? <WdBadge />
                      : isCut
                        ? ""
                        : isInc
                          ? ""
                          : showPos ? (mdl || dp) : ""}
                  </td>
                  <td className="lb-name sticky-col-1" style={row.isHighlighted ? undefined : { background: stickyBg }}>
                    {clubesSaoPaises && row.club && !row.countryFlag && <span title={semBandeira(row.club)} style={{ marginRight: 4 }}>{flagOf(semBandeira(row.club))}</span>}
                    {renderName
                      ? renderName(row)
                      : playersDB
                        ? <TournPName name={row.name} fedCode={row.fed} playersDB={playersDB} />
                        : <>{row.countryFlag && <>{row.countryFlag} </>}<span className="fw-700">{row.name}</span></>
                    }
                    {isCut && <span className="badge-inc" title="Eliminado no cut">CUT</span>}
                    {isInc && <span className="badge-inc">INC</span>}
                  </td>
                  {showEsc && <td className="lb-esc">{(() => {
                    if (row.esc) return <EscPill esc={row.esc} />;
                    // Fallback: idade exacta se temos DOB no playersDB
                    const dob = row.fed && playersDB?.[row.fed]?.dob;
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
                  {(showBirthYear || showAge) && (() => {
                    const dob = dobOf(row);
                    const yr = birthYearOf(dob);
                    // ⚠ "X anos à data do torneio" SÓ quando há data real do torneio.
                    // Sem ela o ageAt caía em HOJE e o tooltip contradizia o pill
                    // (pill "19a" = idade no ano do torneio, tooltip "18 anos" = hoje).
                    const hasTDate = !!(tournamentDate && !isNaN(+new Date(tournamentDate)));
                    const ageReal = hasTDate ? ageAtDate(dob, tournamentDate) : null;
                    // Tooltip COMPLETO (DOB + idade) nas DUAS colunas — o utilizador
                    // pousa o rato numa qualquer e recebe a informação toda.
                    const tip = [
                      yr != null ? `Nascido a ${fmtDobPt(dob)}` : null,
                      ageReal != null ? `${ageReal} anos à data do torneio` : null,
                    ].filter(Boolean).join(" · ") || undefined;
                    // Preferir a idade pré-calculada pelo adapter (row.age) → CONSISTENTE
                    // com as tabs R1/R2/R3. Só recalcular por dob se o adapter não a deu.
                    const age = row.age != null ? row.age : ageReal;
                    const pill = (v: React.ReactNode) => (
                      <span className="p p-sm" style={{ background: "var(--bg-muted, #e5e7eb)", color: "var(--text-2)", borderColor: "transparent" }}>{v}</span>
                    );
                    return <>
                      {showBirthYear && (
                        <td className="lb-esc" title={tip} style={tip ? { cursor: "help" } : undefined}>
                          {yr != null ? pill(yr) : <span className="muted">–</span>}
                        </td>
                      )}
                      {showAge && (
                        <td className="lb-esc" title={tip} style={tip ? { cursor: "help" } : undefined}>
                          {age != null ? pill(`${age}a`) : <span className="muted">–</span>}
                        </td>
                      )}
                    </>;
                  })()}
                  {showFed && <td className="lb-fed">{displayFed(row.fed) || "–"}</td>}
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
                  {showToPar && <td className="lb-topar" style={{ color: tpCol, opacity: (isInc || isWD) ? 0.5 : isCut ? 0.85 : 1 }}>{fmtTP(tp)}</td>}
                  {showGross && <td className="lb-gross" style={{ opacity: (isInc || isWD) ? 0.5 : isCut ? 0.85 : 1 }}>{(row.gross ?? 0) > 0 ? row.gross : "–"}</td>}

                  {/* Acumulados multi-ronda */}
                  {isMulti && showRoundStats && (() => {
                    let tEag = 0, tBird = 0, tPar = 0, tBog = 0;
                    for (const rd of row.rounds) { if (rd) { tEag += rd.eagles || 0; tBird += rd.birdies || 0; tPar += rd.pars || 0; tBog += rd.bogeys || 0; } }
                    return <>
                      <td className="lb-acc-eag">{tEag || ""}</td>
                      <td className="lb-acc-bird">{tBird || ""}</td>
                      <td className="lb-acc-par">{tPar || ""}</td>
                      <td className="lb-acc-bog">{tBog || ""}</td>
                    </>;
                  })()}

                  {/* Colunas por ronda */}
                  {isMulti
                    ? Array.from({ length: nRounds }, (_, r) => {
                        const rd = row.rounds[r];
                        const emptyCols = (showRoundToPar ? 1 : 0) + (showRoundStats ? (hasAnySD ? 5 : 4) : 0);
                        if (!rd) return (
                          <React.Fragment key={r}>
                            <td className="lb-rnd c-muted">–</td>
                            {Array.from({ length: emptyCols }, (_, j) => (
                              <td key={j} className="c-muted">–</td>
                            ))}
                          </React.Fragment>
                        );
                        const rtp = rd.parPerRound ? (rd.gross ?? 0) - rd.parPerRound : null;
                        return (
                          <React.Fragment key={r}>
                            <td className="lb-rnd">{rd.gross}</td>
                            {showRoundToPar && <td className="lb-rnd-tp" style={{ color: tpColor(rtp) }}>{fmtTP(rtp)}</td>}
                            {showRoundStats && <>
                              {hasAnySD && <td className="lb-rnd-sd">
                                {rd.sd != null
                                  ? <SDPill sd={rd.sd} hcp={row.hcp} />
                                  : <span className="muted">–</span>}
                              </td>}
                              <td className="lb-rnd-eag">{rd.eagles || ""}</td>
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
                            {hasAnySD && <td className="lb-sd">
                              {rd?.sd != null
                                ? <SDPill sd={rd.sd} hcp={row.hcp} />
                                : <span className="muted">–</span>}
                            </td>}
                            <td className="lb-eag">{rd?.eagles || ""}</td>
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
  );
}
