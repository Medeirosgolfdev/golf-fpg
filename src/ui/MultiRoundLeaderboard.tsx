// @refresh reset
import { MultiRoundRow, PlayerFilter, EMPTY_FILTER, ExtraColumn } from "./multiRoundTypes";
import { useCompareSelection } from "./useCompareSelection";
import { fmtHcp, medal, birthYearOf, ageAtDate, todayIso } from "../utils/format";
import { birthCells, birthFieldsOf, pillDoAno } from "./BirthCells";
import BirthPill from "./BirthPill";
import { RowsFilterBar, filterRows, buildSexByName } from "./PlayerFilterBar";
import { flag as flagOf, normCountry } from "../utils/flagUtils";
import { semBandeira, clubeEhPais } from "../utils/clubePais";
import { useSort, compareNullsLast, compareTextNullsLast, compareValuesNullsLast } from "../hooks/useSort";
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
  TeeDot,
  TournPName,
  SDPill,
  type PlayersDB,
} from "./tournamentPrimitives";
import { toneClass } from "../utils/scoreDisplay";
import { EscPill } from "../ui/PillBadge";
import { displayFed } from "../utils/fedKeys";
import { MUTED } from "./tableCells";

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
  | `x:${number}` | "modo";

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
  /** CR/Slope estimados → SD a vermelho com esta nota (ver Tournament._sdEstimate). */
  sdEstimate?: string;
  /** Classificação noutra modalidade (Medal Net, Stableford Net): a posição sai deste
   *  valor em vez do gross, e aparece uma coluna com ele ao lado do Total. */
  rankBy?: { label: string; higherIsBetter?: boolean; value: (r: MultiRoundRow) => number | null };
  /** Posição oficial da fonte (`row.pos`) em vez da calculada pelo total —
   *  stroke play + match play, leaderboards parciais (WAGR). */
  officialPos?: boolean;
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
  sdEstimate,
  rankBy,
  officialPos,
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
    toPar: wantToPar = true,
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
  // (leitura partilhada com a tabela da volta — utils/clubePais)
  const clubesSaoPaises = useMemo(() => rows.some(r => r.club) && rows.every(r => !semBandeira(r.club) || clubeEhPais(r.club)), [rows]);
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
  /** Ano para ordenar: o da data, o solto, ou o mais antigo da estimativa. */
  const anoOf = useMemo(() => (r: MultiRoundRow): number | null =>
    birthYearOf(dobOf(r)) ?? r.birthYear ?? r.birthYearEst ?? null, [dobOf]);
  const hasAnyDob  = useMemo(() => rows.some(r => anoOf(r) != null), [rows, anoOf]);
  /** Data do torneio em ISO para as idades — a USKids dá «8/13/2026» (formato americano). */
  const refIso = useMemo(() => {
    if (!tournamentDate) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(tournamentDate)) return tournamentDate.slice(0, 10);
    const d = new Date(tournamentDate);
    return isNaN(+d) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [tournamentDate]);

  const showEsc = wantEsc && hasAnyEsc;
  const showFed = wantFed && hasAnyFed;
  const showClub = wantClub && hasAnyClub;
  const showHcp = wantHcp && hasAnyHcp;
  const showTee = wantTee && hasAnyTee;
  const showBirthYear = wantBirthYear && hasAnyDob;
  const showAge = wantAge && hasAnyDob;
  const showRoundStats = wantRoundStats && (hasAnySD || hasAnyRoundHoleStats);
  // ±Par só quando alguém o tem (fontes sem par — WAGR — não mostram uma coluna de traços).
  const showToPar = wantToPar && rows.some(r => r.toPar != null);
  // Contadores por buraco (🦅 🐦 = ■) só com cartões: as provas só com totais
  // por volta (`_noHbh`) ficam com o SD no mesmo sítio e sem colunas vazias.
  const showHoleStats = showRoundStats && hasAnyRoundHoleStats;
  const showRoundToPar = wantRoundToPar;

  const { sortKey, sortDir, toggleSort: handleSort } = useSort<MRSortKey>("pos", "asc");
  const [filter, setFilter] = useState<PlayerFilter>(EMPTY_FILTER);

  // WD = desistiu; incomplete = ainda nao jogou todas as rondas; cut = eliminado no cut
  const complete   = rows.filter(r => !r.isIncomplete && !r.isWD && !r.isCut);

  /* Posições — apenas jogadores completos e não-WD */
  const withPos: RowWithPos[] = useMemo(() => {
    // Posição oficial (match play, WAGR): a da fonte, tal e qual.
    if (officialPos && !rankBy) {
      return rows.map(r => ({
        ...r,
        _pos: (r.isIncomplete || r.isWD || r.isCut || !(r.pos > 0)) ? null : r.pos,
      }));
    }
    // Sem resultado (gross null) não há posição — nem «1.º empatado» de todos.
    // Com `rankBy` (Medal Net / Stableford Net) a ordem sai desse valor.
    const val = (r: MultiRoundRow) => (rankBy ? rankBy.value(r) : r.gross);
    const melhor = (v: number) => (rankBy?.higherIsBetter ? -v : v);
    const forRank = complete.filter(r => val(r) != null).sort((a, b) => melhor(val(a) as number) - melhor(val(b) as number));
    let counter = 1;
    const posMap = new Map<string, number>();
    forRank.forEach((r, i) => {
      if (i > 0 && val(r) !== val(forRank[i - 1])) counter = i + 1;
      posMap.set(r.key || r.name, counter);
    });
    return rows.map(r => ({
      ...r,
      _pos: (r.isIncomplete || r.isWD || r.isCut) ? null : (posMap.get(r.key || r.name) ?? null),
    }));
  }, [rows, rankBy, officialPos]);

  /* Filtro — passa playersDB para resolver sexo de jogadores sem fedCode */
  const sexByName = useMemo(() => buildSexByName(playersDB), [playersDB]);
  const filteredComplete   = useMemo(() => filterRows(withPos.filter(r => !r.isIncomplete && !r.isWD && !r.isCut), filter, playersDB, sexByName), [withPos, filter, playersDB, sexByName]);
  const filteredCut        = useMemo(() => filterRows(withPos.filter(r =>  r.isCut && !r.isWD), filter, playersDB, sexByName), [withPos, filter, playersDB, sexByName]);
  const filteredIncomplete = useMemo(() => filterRows(withPos.filter(r =>  r.isIncomplete && !r.isWD && !r.isCut), filter, playersDB, sexByName), [withPos, filter, playersDB, sexByName]);
  const filteredWD         = useMemo(() => filterRows(withPos.filter(r =>  r.isWD), filter, playersDB, sexByName),                   [withPos, filter, playersDB, sexByName]);

  /* Sort */
  function cmp(a: RowWithPos, b: RowWithPos): number {
    // Vazios (ronda por jogar, sem lugar/HCP/SD…) sempre no fim, nas duas direcções.
    // `nd` = direcção invertida (eagles/birdies/pares: mais primeiro em asc).
    const d: 1 | -1 = sortDir === "asc" ? 1 : -1;
    const nd: 1 | -1 = sortDir === "asc" ? -1 : 1;
    // Coluna extra com `sortValue`: "x:0", "x:1", ... (índice em extraColumns)
    if (typeof sortKey === "string" && sortKey.startsWith("x:")) {
      const sv = extraColumns?.[parseInt(sortKey.slice(2), 10)]?.sortValue;
      return compareValuesNullsLast(sv?.(a), sv?.(b), d);
    }
    // Gross por ronda específica: "gross:0", "gross:1", ... (índice 0-based)
    // Menos pancadas primeiro em asc. Rondas não jogadas vão para o fim.
    if (typeof sortKey === "string" && sortKey.startsWith("gross:")) {
      const ri = parseInt(sortKey.slice(6), 10);
      return compareNullsLast(a.rounds[ri]?.gross, b.rounds[ri]?.gross, d);
    }
    // ±par por ronda específica: "rtp:0", "rtp:1", ...
    if (typeof sortKey === "string" && sortKey.startsWith("rtp:")) {
      const ri = parseInt(sortKey.slice(4), 10);
      const ra = a.rounds[ri];
      const rb = b.rounds[ri];
      const sa = ra?.gross != null ? ra.gross - (ra.parPerRound ?? 0) : null;
      const sb = rb?.gross != null ? rb.gross - (rb.parPerRound ?? 0) : null;
      return compareNullsLast(sa, sb, d);
    }
    // SD por ronda específica: "sd:0", "sd:1", ... (índice 0-based da ronda)
    if (typeof sortKey === "string" && sortKey.startsWith("sd:")) {
      const ri = parseInt(sortKey.slice(3), 10);
      return compareNullsLast(a.rounds[ri]?.sd, b.rounds[ri]?.sd, d);
    }
    // Eagles por ronda específica: "eag:0", "eag:1", ...
    if (typeof sortKey === "string" && sortKey.startsWith("eag:")) {
      const ri = parseInt(sortKey.slice(4), 10);
      return compareNullsLast(a.rounds[ri]?.eagles, b.rounds[ri]?.eagles, nd);
    }
    // Birdies por ronda específica: "bird:0", "bird:1", ...
    if (typeof sortKey === "string" && sortKey.startsWith("bird:")) {
      const ri = parseInt(sortKey.slice(5), 10);
      // Mais birdies primeiro em asc (mais útil — clica e vê quem fez mais).
      return compareNullsLast(a.rounds[ri]?.birdies, b.rounds[ri]?.birdies, nd);
    }
    // Pares por ronda específica: "par:0", "par:1", ...
    if (typeof sortKey === "string" && sortKey.startsWith("par:")) {
      const ri = parseInt(sortKey.slice(4), 10);
      return compareNullsLast(a.rounds[ri]?.pars, b.rounds[ri]?.pars, nd);
    }
    // Bogeys por ronda específica: "bog:0", "bog:1", ...
    if (typeof sortKey === "string" && sortKey.startsWith("bog:")) {
      const ri = parseInt(sortKey.slice(4), 10);
      // Menos bogeys primeiro em asc (clássico — quem fez menos jogou melhor).
      return compareNullsLast(a.rounds[ri]?.bogeys, b.rounds[ri]?.bogeys, d);
    }
    switch (sortKey) {
      case "pos":   return compareNullsLast(a._pos, b._pos, d);
      case "name":  return sortDir === "asc" ? a.name.localeCompare(b.name,"pt") : b.name.localeCompare(a.name,"pt");
      case "club":  return compareTextNullsLast(a.club, b.club, d);
      case "esc":   return compareTextNullsLast(a.esc, b.esc, d);
      case "tee":   return compareTextNullsLast(a.teeName, b.teeName, d);
      case "fed":   return compareTextNullsLast(a.fed, b.fed, d);
      case "hcp":   return compareNullsLast(a.hcp, b.hcp, d);
      case "modo": {
        const v = (r: RowWithPos) => { const x = rankBy?.value(r); return x == null ? null : rankBy?.higherIsBetter ? -x : x; };
        return compareNullsLast(v(a), v(b), d);
      }
      case "gross": return compareNullsLast(a.gross, b.gross, d);
      case "toPar": {
        // O ±par da linha quando existe (fontes com ±par próprio); senão gross − par.
        const tp = (r: RowWithPos) => r.toPar ?? (r.gross != null ? r.gross - (r.parTotal ?? 0) : null);
        return compareNullsLast(tp(a), tp(b), d);
      }
      case "sd":        return compareNullsLast(a.rounds[0]?.sd, b.rounds[0]?.sd, d);
      case "eag":       return compareNullsLast(a.rounds[0]?.eagles, b.rounds[0]?.eagles, nd);
      case "bird":      return compareNullsLast(a.rounds[0]?.birdies, b.rounds[0]?.birdies, nd);
      case "par-stat":  return compareNullsLast(a.rounds[0]?.pars, b.rounds[0]?.pars, nd);
      case "bog":       return compareNullsLast(a.rounds[0]?.bogeys, b.rounds[0]?.bogeys, d);
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
        const ya = anoOf(a);
        const yb = anoOf(b);
        if (ya == null && yb == null) return 0;
        if (ya == null) return 1;   // sem data → sempre no fim
        if (yb == null) return -1;
        return sortDir === "asc" ? ya - yb : yb - ya;
      }
      case "age": {
        // Idade real à data do torneio (não o ano) — dois jogadores do mesmo
        // ano podem ter idades diferentes consoante já fizeram anos.
        const ref = refIso ?? todayIso();
        const idadeOf = (r: MultiRoundRow) => ageAtDate(dobOf(r), ref) ?? (anoOf(r) != null ? +ref.slice(0, 4) - anoOf(r)! : null);
        const aa = idadeOf(a);
        const ab = idadeOf(b);
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
  }, [filteredComplete, filteredCut, filteredIncomplete, filteredWD, sortKey, sortDir, sortable, dobOf, anoOf, refIso]);

  /* ── Selecção para comparação (hook partilhado da família de tabelas) ──
   * Chave = key da linha ou, sem ela, o nome (o render usa o mesmo fallback). */
  const compareSel = useCompareSelection<string | number>();
  const compareKey = (row: MultiRoundRow) => row.key || row.name;
  const visibleSorted = compareSel.filter(sorted, compareKey);

  // Só depois de TODOS os hooks (10/11/2026): com o `return` lá em cima, uma
  // tabela que passasse de vazia a preenchida (ou o contrário) rebentava o React.
  if (!rows.length) return <EmptyState size="sm" message="Sem resultados." />;

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
              {rankBy && <SHdr k="modo" className="lb-modo">{rankBy.label}</SHdr>}

              {/* Acumulados multi-ronda (entre Total e R1) */}
              {isMulti && showHoleStats && <>
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
                        {showHoleStats && <>
                          <SHdr k={`eag:${r}` as MRSortKey} className="lb-rnd-eag">🦅</SHdr>
                          <SHdr k={`bird:${r}` as MRSortKey} className="lb-rnd-bird">🐦</SHdr>
                          <SHdr k={`par:${r}`  as MRSortKey} className="lb-rnd-par">=</SHdr>
                          <SHdr k={`bog:${r}`  as MRSortKey} className="lb-rnd-bog">■</SHdr>
                        </>}
                      </>}
                    </React.Fragment>
                  ))
                : <>
                    {showRoundStats && <>
                      {hasAnySD && <SHdr k="sd" className="lb-sd">SD</SHdr>}
                      {showHoleStats && <>
                        <SHdr k="eag"      className="lb-eag">🦅</SHdr>
                        <SHdr k="bird"     className="lb-bird">🐦</SHdr>
                        <SHdr k="par-stat" className="lb-par-stat">Par</SHdr>
                        <SHdr k="bog"      className="lb-bog">■</SHdr>
                      </>}
                    </>}
                  </>
              }

              {/* Colunas extra */}
              {extraColumns?.map((col, ci) => (
                col.sortValue && sortable
                  ? <SortableHdr key={ci} k={`x:${ci}` as MRSortKey} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className={col.className}>{col.header}</SortableHdr>
                  : <th key={ci} className={[col.className, col.headerClassName].filter(Boolean).join(" ") || undefined}>{col.header}</th>
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
              const tpTone = (!isInc && !isWD && !isCut) ? toneClass(tp) : "";
              const mdl = !isInc && !isWD && !isCut && dp != null ? medal(dp) : null;
              const showPos = !isInc && !isWD && !isCut && (
                sortable && sortKey === "pos"
                  ? (idx === 0 || dp !== visibleSorted[idx - 1]._pos)
                  : true
              );
              // Fundo/opacidade da linha e das colunas fixas (o Manuel fica com o da .row-manuel).
              const rowBg = row.isHighlighted ? "u-bg-bg-success-subtle"
                : (isWD || isInc) ? "u-bg-bg-hover"
                : "";
              const rowOp = isWD ? "u-op-0_55" : isCut ? "u-op-0_85" : isInc ? "u-op-0_7" : "";
              const stickyBg = row.isHighlighted ? ""
                : (isInc || isWD) ? " u-bg-bg-hover"
                : " u-bg-bg-card";
              const cellOp = (isInc || isWD) ? " u-op-0_5" : isCut ? " u-op-0_85" : "";

              // Manuel toma precedência sobre Portuguese (só uma classe é aplicada).
              const rowCls = row.isHighlighted ? "row-manuel" : (row.isPortuguese ? "row-portuguese" : "");
              return (
                <tr key={row.key || row.name + idx}
                  className={[rowCls, rowBg, rowOp].filter(Boolean).join(" ") || undefined}>
                  <td className={"lb-pos sticky-col-0 u-ws-nowrap" + stickyBg}>
                    {compareSel.checkbox(compareKey(row))}
                    {isWD
                      ? <WdBadge />
                      : isCut
                        ? ""
                        : isInc
                          ? ""
                          : showPos ? (mdl || dp) : ""}
                  </td>
                  <td className={"lb-name sticky-col-1" + stickyBg}>
                    {clubesSaoPaises && row.club && !row.countryFlag && <span title={semBandeira(row.club)} className="u-mr-4px">{flagOf(semBandeira(row.club))}</span>}
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
                          return <span className="p p-sm p-muted" title={`${dob} (${age} anos)`}
>{age}a</span>;
                        }
                      }
                    }
                    return MUTED;
                  })()}</td>}
                  {(showBirthYear || showAge) && (() => {
                    // A peça comum (BirthCells): data/ano lidos em pílula, estimativa a vermelho.
                    // Nas colunas só o ano; a data completa fica no tooltip.
                    const bc = birthCells({ dob: dobOf(row), ...birthFieldsOf(row), showDate: false }, refIso);
                    // Idade pré-calculada pelo adapter (row.age) → CONSISTENTE com as tabs R1/R2/R3.
                    const idade = row.age != null ? <BirthPill {...pillDoAno(anoOf(row), refIso)}>{row.age}a</BirthPill> : bc.idade;
                    const tip = bc.tip || undefined;
                    return <>
                      {showBirthYear && <td className="lb-esc" title={tip}>{bc.nasc}</td>}
                      {showAge && <td className="lb-esc" title={tip}>{idade}</td>}
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
                      return <td className="lb-club" title={code}><span className="u-fs-1_1em">{fl}</span></td>;
                    }
                    return <td className="lb-club">{club || "–"}</td>;
                  })()}
                  {showHcp && <td className="lb-hcp">{fmtHcp(row.hcp)}</td>}
                  {showTee && <td className="lb-tee"><TeeDot teeName={row.teeName} /></td>}

                  {/* ±Par ANTES de Total */}
                  {showToPar && <td className={`lb-topar ${tpTone}${(isInc || isWD) ? " u-op-0_5" : isCut ? " u-op-0_85" : ""}`}>{fmtTP(tp)}</td>}
                  {showGross && <td className={"lb-gross" + cellOp}>{(row.gross ?? 0) > 0 ? row.gross : "–"}</td>}
                  {rankBy && <td className={"lb-modo u-ta-center u-fw-700 u-c-accent" + cellOp}>{rankBy.value(row) ?? "–"}</td>}

                  {/* Acumulados multi-ronda */}
                  {isMulti && showHoleStats && (() => {
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
                        const emptyCols = (showRoundToPar ? 1 : 0) + (showRoundStats && hasAnySD ? 1 : 0) + (showHoleStats ? 4 : 0);
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
                            {showRoundToPar && <td className={`lb-rnd-tp ${toneClass(rtp)}`}>{fmtTP(rtp)}</td>}
                            {showRoundStats && <>
                              {hasAnySD && <td className="lb-rnd-sd">
                                {rd.sd != null
                                  ? <SDPill sd={rd.sd} hcp={row.hcp} est={sdEstimate} />
                                  : MUTED}
                              </td>}
                              {showHoleStats && <>
                                <td className="lb-rnd-eag">{rd.eagles || ""}</td>
                                <td className="lb-rnd-bird">{rd.birdies || ""}</td>
                                <td className="lb-rnd-par">{rd.pars || ""}</td>
                                <td className="lb-rnd-bog">{rd.bogeys || ""}</td>
                              </>}
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
                                ? <SDPill sd={rd.sd} hcp={row.hcp} est={sdEstimate} />
                                : MUTED}
                            </td>}
                            {showHoleStats && <>
                              <td className="lb-eag">{rd?.eagles || ""}</td>
                              <td className="lb-bird">{rd?.birdies || ""}</td>
                              <td className="lb-par-stat">{rd?.pars || ""}</td>
                              <td className="lb-bog">{rd?.bogeys || ""}</td>
                            </>}
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
