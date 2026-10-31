import React, { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { useSort } from "../hooks/useSort";
import { escPillCls } from "../utils/playerUtils";
import { ESC_STYLE, RoundPill } from "./PillBadge";
import SexBadge from "./SexBadge";
import LoadingState from "./LoadingState";
import FilterChip from "./FilterChip";
import { CrossSeasonTable, SortTh as CSortTh } from "./CrossSeasonTable";
import { isManuel, fmtTP, tpColor, TournPName, type PlayersDB } from "./tournamentPrimitives";
import { shortDateSlash, medal, fmtHcp } from "../utils/format";
import { RankingTable, type RankingCol } from "./ranking/RankingPage";
import { CircuitRankingView, type CircuitRanking, type CircuitRankingContext } from "./circuit/CircuitRanking";
import type { Tournament } from "../data/fpgTypes";
import { notasPJA } from "../../ranking-pja/pja-rules.mjs";
import {
  BEST_SD_N, MIN_SD_ROUNDS, fmtPts, shortTournName, rankingYears, buildYearTournaments,
  buildTournCols, buildRankRows, visibleTournCols as visibleCols, rankPositions, cutInfo, playerRounds,
  type RankMetric, type RankRow, type RankRoundResult, type RankTournCol, type RankPlayerRound,
} from "../data/ranking/fpgRanking";

/* ─────────────────────────────────────────────
   RANKINGS DA /FPG — Ranking PJA, Ranking Sub-12 por SD e Classificações.

   As CONTAS vivem em `src/data/ranking/fpgRanking.ts` (as regras PJA no
   `ranking-pja/pja-rules.mjs`); aqui só se desenha. A vista é a da capacidade
   `ranking` do CircuitShell (`CircuitRankingView`), como no Drive:
     · 📊 Tabela  — a grelha por torneio/volta (pontos ou SD, cortes, metros);
     · 🏆 Ranking — a `RankingTable` partilhada (a do EGR/WAGR/Drive).
   Clicar num jogador abre as voltas dele (também numa `RankingTable`). A vista
   vive no URL (`rv`).
   ───────────────────────────────────────────── */

const PName = ({ name, fedCode, playersDB, sex }: { name: string; fedCode?: string; playersDB: PlayersDB; sex?: string }) =>
  <TournPName name={name} fedCode={fedCode} playersDB={playersDB} sex={sex} />;

/** Notas de elegibilidade — visíveis a quem abre o ranking, sem ter de clicar
 *  em nada. A lista vem do `pja-rules.mjs` (a MESMA que a página standalone
 *  ranking-pja.vercel.app mostra) — aqui só vive a apresentação. */
const RankingNotas = ({ year }: { year: string | number }) => {
  const notas = notasPJA(year);
  if (!notas.length) return null;
  return (
    <div className="print-hide u-d-grid u-gap-6px u-m-10px-0-14px">
      {notas.map((n, i) => (
        <div
          key={i}
          style={{
            display: "flex", gap: 9, alignItems: "flex-start",
            background: n.tipo === "info" ? "var(--bg-info)" : "var(--bg-warn)",
            border: "1px solid var(--border)",
            borderLeft: `4px solid var(${n.tipo === "info" ? "--color-info" : "--color-warn"})`,
            borderRadius: 8, padding: "9px 12px",
          }}
        >
          <span className="u-fs-fs-14 u-lh-1_25">{n.tipo === "info" ? "📅" : "⚠️"}</span>
          <span>
            <b className="u-d-block u-fs-12_5px u-mb-2px">{n.titulo}</b>
            <span className="muted u-fs-11_5px">{n.texto}</span>
          </span>
        </div>
      ))}
    </div>
  );
};

export interface PjaPdfEntry {
  fed: string; name: string; rounds: number; pts: number; pos: number;
}

type RankView = "tabela" | "ranking";
const RANK_CTX: CircuitRankingContext = { entries: [], scope: "view" };

const EscPill = ({ esc }: { esc: string }) =>
  esc ? <span className={escPillCls(esc) + " fs-10"}>{esc}</span> : <span className="muted">–</span>;

/** Nº de torneios em que o jogador tem voltas. */
function nTorneios(row: RankRow): number {
  return new Set([...row.results.keys()].map(k => k.replace(/_r\d+$/, ""))).size;
}
/** Melhor ±par das voltas (as que a regra tirou não contam). */
function bestToPar(row: RankRow): number | null {
  let b: number | null = null;
  for (const r of row.results.values()) if (!r.excluded && (b == null || r.toPar < b)) b = r.toPar;
  return b;
}
function bestSd(row: RankRow): number | null {
  let b: number | null = null;
  for (const r of row.results.values()) if (!r.excluded && r.sd != null && (b == null || r.sd < b)) b = r.sd;
  return b;
}
/** Duas maneiras de uma volta não somar: a regra tirou-a (riscada) ou ficou
 *  fora das que contam (esbatida). */
const roundStyle = (res: RankRoundResult): React.CSSProperties =>
  res.excluded ? { opacity: 0.4, textDecoration: "line-through" } : !res.inTop14 ? { opacity: 0.35 } : {};

/** As colunas da lista: # · Jogador · Esc. · Clube · HCP · T · Voltas · Total · Melhor. */
function rankCols(metric: RankMetric, rank: Map<string, number>, playersDB: PlayersDB, totalLabel: string, medals = true): RankingCol<RankRow>[] {
  const isSd = metric === "sd";
  return [
    { key: "rank", label: "#", className: "num", sort: r => rank.get(r.key) ?? 9999, firstDir: "asc",
      cell: r => { const p = rank.get(r.key); return p == null ? <span className="c-muted">–</span> : ((medals && medal(p)) || <span className="mono fw-700">{p}</span>); } },
    { key: "name", label: "Jogador", sort: r => r.name.toLowerCase(), firstDir: "asc",
      cell: r => <PName name={r.name} fedCode={r.fedCode} playersDB={playersDB} sex={r.sex} /> },
    { key: "esc", label: "Esc.", sort: r => r.escalao, firstDir: "asc", cell: r => <EscPill esc={r.escalao} /> },
    { key: "club", label: "Clube", sort: r => r.club.toLowerCase(), firstDir: "asc", cell: r => r.club || "–", tdClassName: "c-muted fs-11" },
    { key: "hcp", label: "HCP", className: "num", sort: r => r.hcp ?? 99, firstDir: "asc", cell: r => <span className="mono">{fmtHcp(r.hcp)}</span> },
    { key: "t", label: "T", title: "Torneios jogados", className: "num", sort: nTorneios, firstDir: "desc", cell: r => <span className="mono">{nTorneios(r)}</span> },
    { key: "voltas", label: "Voltas", className: "num", sort: r => r.voltas, firstDir: "desc",
      cell: r => {
        const c = cutInfo(r, metric);
        return c.cortadas > 0
          ? <span className="mono" title={`${c.contadas} das ${r.voltas} voltas contam para o total`}>{c.contadas}<span className="muted fs-10">/{r.voltas}</span></span>
          : <span className="mono">{r.voltas}</span>;
      } },
    { key: "total", label: totalLabel, className: "num", sort: r => isNaN(r.total) ? (isSd ? 999 : -1) : r.total, firstDir: isSd ? "asc" : "desc",
      title: isSd ? `Média das ${BEST_SD_N} melhores voltas — MENOR é melhor` : undefined,
      cell: r => {
        if (isSd) return <span className="fw-800 c-warn-dark">{isNaN(r.total) ? "–" : r.total.toFixed(1)}</span>;
        const c = cutInfo(r, metric);
        return (
          <span className="fw-800 c-warn-dark" title={c.cortadas > 0 ? `${fmtPts(r.total)} pts das voltas que contam · ${fmtPts(c.totalTodas)} pts somando as ${r.voltas}` : undefined}>
            {fmtPts(r.total)}{c.cortadas > 0 && <span className="muted fs-10 u-fw-500">/{fmtPts(c.totalTodas)}</span>}
          </span>
        );
      } },
    isSd
      ? { key: "best", label: "Melhor SD", className: "num", sort: r => bestSd(r) ?? 999, firstDir: "asc",
          cell: r => { const v = bestSd(r); return <span className="mono fw-700 c-good-dark">{v != null ? v.toFixed(1) : "–"}</span>; } }
      : { key: "best", label: "Melhor", title: "Melhor volta (±par)", className: "num", sort: r => bestToPar(r) ?? 999, firstDir: "asc",
          cell: r => { const v = bestToPar(r); return v == null ? <span className="c-muted">–</span> : <span className="fw-700" style={{ color: tpColor(v) }}>{fmtTP(v)}</span>; } },
  ];
}

/** As voltas de um jogador (clique na linha). */
function PlayerDetail({ row, cols, metric, showMeters, playersDB, onClose }: {
  row: RankRow; cols: RankTournCol[]; metric: RankMetric; showMeters: boolean; playersDB: PlayersDB; onClose: () => void;
}) {
  const rounds = useMemo(() => playerRounds(row, cols), [row, cols]);
  const isSd = metric === "sd";
  const rcols: RankingCol<RankPlayerRound>[] = [
    { key: "date", label: "Data", sort: r => r.round.date, firstDir: "asc", cell: r => shortDateSlash(r.round.date), tdClassName: "mono fs-10" },
    { key: "tourn", label: "Torneio", sort: r => r.col.name, firstDir: "asc", cell: r => {
      // Coluna que junta provas («1º Drive Tour · 5 provas · …»): o circuito e a
      // prova que o jogador disputou chegam; a lista das provas fica no título.
      const { circuito, local } = r.col.agregado
        ? { circuito: r.col.name.split(" · ")[0], local: "" }
        : shortTournName(r.col.name, r.col.campo);
      return (
        <span title={r.col.name}>
          <span className="fw-600">{circuito}</span>{local && <span className="muted"> · {local}</span>}
          {r.round.label && <span className="muted fs-10"> · {r.round.label}</span>}
          {r.res.prova && <span className="muted fs-10"> · {r.res.prova}</span>}
        </span>
      );
    } },
    { key: "toPar", label: "±Par", className: "num", sort: r => r.res.toPar, firstDir: "asc",
      cell: r => <span className="fw-700" style={{ color: tpColor(r.res.toPar), ...roundStyle(r.res) }}>{fmtTP(r.res.toPar)}</span> },
    isSd
      ? { key: "sd", label: "SD", className: "num", sort: r => r.res.sd ?? 999, firstDir: "asc",
          cell: r => <span className="c-warn-dark" style={roundStyle(r.res)}>{r.res.sd != null ? r.res.sd.toFixed(1) : "–"}</span> }
      : { key: "pts", label: "Pts", className: "num", sort: r => r.res.pts, firstDir: "desc",
          cell: r => <span className="c-warn-dark" style={roundStyle(r.res)}>{fmtPts(r.res.pts)}</span> },
    ...(showMeters ? [{ key: "m", label: "m", title: "Metros jogados nesta volta", className: "num", sort: (r: RankPlayerRound) => r.res.meters ?? 0, firstDir: "desc" as const,
      cell: (r: RankPlayerRound) => <span className="mono muted">{r.res.meters ? r.res.meters.toLocaleString("pt-PT") : "–"}</span> }] : []),
    { key: "conta", label: "Conta", sort: r => r.res.excluded ? 2 : r.res.inTop14 ? 0 : 1, firstDir: "asc",
      cell: r => r.res.excluded ? <span className="muted fs-10" title={r.res.excludedReason}>não (regra)</span>
        : r.res.inTop14 ? <span className="c-good-dark fw-700">sim</span>
        : <span className="muted fs-10">{isSd ? `fora das ${BEST_SD_N} melhores` : "fora das que somam"}</span> },
  ];
  return (
    <div className="card drive-player-card mb-8">
      <button onClick={onClose} title="Fechar" aria-label="Fechar" className="drive-player-close">✕</button>
      <div className="mb-8 drive-player-head">
        <span className="fw-800 drive-player-name"><PName name={row.name} fedCode={row.fedCode} playersDB={playersDB} sex={row.sex} /></span>
        <span className="muted fs-11">{row.club || "–"}{row.escalao ? ` · ${row.escalao}` : ""} · HCP {fmtHcp(row.hcp)} · {row.voltas} voltas</span>
      </div>
      <RankingTable rows={rounds} cols={rcols} rowKey={r => r.key} defaultSort="date" defaultDir="asc" />
    </div>
  );
}

export function PJARankingView({
  pjaList, playersDB, loading, pjaMembersByYear, externalFilterName,
  specialRules = true, emptyLabel = "Sem torneios PJA.", metric = "pts", showMeters = false, hcpFilterMax,
}: {
  pjaList: Tournament[];
  playersDB: PlayersDB;
  loading: boolean;
  /** fedCodes inscritos no circuito PJA por ano. Jogadores que pontuaram mas
   *  não constam aqui para o ano corrente aparecem na tabela "Não inscritos". */
  pjaMembersByYear?: Record<string, string[]>;
  /** Snapshot do PDF oficial por ano (ainda sem uso no ecrã). */
  pjaPdfSnapshotByYear?: Record<string, PjaPdfEntry[]>;
  /** Filtro de nome/clube externo (normalmente da toolbar da FPGPage).
   *  Quando definido, sobrepõe o filterName interno (inline fallback). */
  externalFilterName?: string;
  /** Regras de elegibilidade específicas do circuito PJA (Aquapor só os 2
   *  primeiros e só para quem não fez Drive Tour, Greatgolf Main só R2+R3).
   *  `false` = ranking genérico: todas as rondas de todos os torneios contam.
   *  Usado pela vista CLASSIFICAÇÕES, que ranqueia um calendário arbitrário. */
  specialRules?: boolean;
  /** Texto quando não há torneios para o filtro actual. */
  emptyLabel?: string;
  /** Métrica das células e do total:
   *   "pts" (default) — pontos por ±par (25 − pancadas acima), total = soma do top-14.
   *   "sd"            — o SD oficial da FPG de cada volta (o do WHS de cada
   *                     jogador), total = média das 8 melhores (MENOR é melhor).
   * O modo "sd" existe para escalões que jogam sobretudo 9 buracos em campos
   * muito diferentes, onde os pontos por ±par não são comparáveis. Ver
   * scripts/build-sub12-ranking.js. */
  metric?: RankMetric;
  /** Acrescenta uma coluna "m" (metros jogados) a cada ronda. Útil quando a
   *  coluna agrega provas de campos diferentes — ex: "3º Drive Challenge"
   *  junta as 5 regiões e cada miúdo jogou a distância da sua. */
  showMeters?: boolean;
  /** Quando definido, mostra um chip que filtra por HCP abaixo deste valor
   *  (ex: 25 no Sub-12 — separa quem já joga a sério de quem está a começar). */
  hcpFilterMax?: number;
}) {
  const years = useMemo(() => rankingYears(pjaList), [pjaList]);

  const [activeYear, setActiveYear] = useState<string>("");
  const year = activeYear || years[0] || "";

  // Vista no URL (`rv`): a Tabela por defeito, como no Drive.
  const [searchParams, setSearchParams] = useSearchParams();
  const view: RankView = searchParams.get("rv") === "ranking" ? "ranking" : "tabela";
  const setView = (v: string) => setSearchParams(prev => {
    const n = new URLSearchParams(prev);
    if (v === "ranking") n.set("rv", "ranking"); else n.delete("rv");
    return n;
  }, { replace: true });

  // No modo SD o total é uma média onde MENOR é melhor → arranca ascendente.
  const { sortKey, sortDir, toggleSort: handleSort, resetSort: resetYearSort } =
    useSort<string>("total", metric === "sd" ? "asc" : "desc");
  const [filterEsc, setFilterEsc] = useState<string[]>([]);
  /** "" = todos · "F" = só raparigas · "M" = só rapazes. */
  const [filterSex, setFilterSex] = useState<"" | "F" | "M">("");
  const [filterRegiao, setFilterRegiao] = useState<string[]>([]);
  const [filterHcp, setFilterHcp] = useState(false);
  const [internalFilterName, setFilterName] = useState("");
  // Quando a FPGPage passa um search externo (via toolbar unificada), usa-o;
  // senão cai no state interno (uso standalone). Trim+lowercase feito nos consumers.
  const filterName = (externalFilterName ?? internalFilterName) || "";
  /** Jogador seleccionado via clique na linha (fedCode ou "name:..."): destaca
   *  a linha e abre as voltas dele. Clicar outra vez desmarca. */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  function toggleEsc(e: string) {
    setFilterEsc(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  }

  const yearTournaments = useMemo(() => buildYearTournaments(pjaList, year, specialRules), [pjaList, year, specialRules]);
  const tournCols = useMemo(() => buildTournCols(yearTournaments, year, specialRules, showMeters), [yearTournaments, year, specialRules, showMeters]);
  const allRows = useMemo(() => buildRankRows(yearTournaments, { playersDB, year, specialRules, metric, pjaMembersByYear }),
    [yearTournaments, playersDB, year, pjaMembersByYear, specialRules, metric]);

  // Conjunto de fedCodes INSCRITOS no ano corrente (lido de pja-members.json).
  // Se vazio/indefinido para este ano, tratamos todos os membros PJA como inscritos.
  const inscritosSet = useMemo(() => {
    const list = pjaMembersByYear?.[year];
    return list && list.length ? new Set(list) : null;
  }, [pjaMembersByYear, year]);

  const visibleTournCols = useMemo(() => visibleCols(tournCols, yearTournaments, pjaMembersByYear?.[year]),
    [tournCols, yearTournaments, pjaMembersByYear, year]);

  // Divide em 2 grupos: inscritos (ranking principal) e não-inscritos (lista
  // à parte, só para referência — estes não competem pelo troféu PJA).
  const { rowsInscritos, rowsNaoInscritos } = useMemo(() => {
    if (!inscritosSet) return { rowsInscritos: allRows, rowsNaoInscritos: [] };
    const ins: RankRow[] = [];
    const out: RankRow[] = [];
    for (const r of allRows) {
      if (r.fedCode && inscritosSet.has(r.fedCode)) ins.push(r);
      else out.push(r);
    }
    return { rowsInscritos: ins, rowsNaoInscritos: out };
  }, [allRows, inscritosSet]);

  /** Sexos presentes nas linhas — o chip só aparece quando há ambos. */
  const availSexes = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) if (r.sex === "M" || r.sex === "F") s.add(r.sex);
    return [...s].sort() as ("M" | "F")[];  // F antes de M
  }, [allRows]);

  const availRegioes = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) for (const g of r.regioes) s.add(g);
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [allRows]);

  const availEscs = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) if (r.escalao) s.add(r.escalao);
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [allRows]);

  const applyFilters = useMemo(() => (rows: RankRow[]) => {
    if (filterSex) rows = rows.filter(r => r.sex === filterSex);
    if (filterRegiao.length) rows = rows.filter(r => r.regioes.some(g => filterRegiao.includes(g)));
    if (filterHcp && hcpFilterMax != null) rows = rows.filter(r => r.hcp != null && r.hcp < hcpFilterMax);
    if (filterEsc.length) rows = rows.filter(r => filterEsc.includes(r.escalao));
    if (filterName.trim()) {
      const q = filterName.trim().toLowerCase();
      rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.club.toLowerCase().includes(q));
    }
    return rows;
  }, [filterSex, filterRegiao, filterHcp, hcpFilterMax, filterEsc, filterName]);

  // Ranking principal = só inscritos no ano corrente (se houver lista).
  const filteredRows = useMemo(() => applyFilters(rowsInscritos), [applyFilters, rowsInscritos]);

  /** A ordem da Tabela (a grelha ordena-se pelos cabeçalhos das voltas). */
  const sortedRows = useMemo(() => {
    const INF = 99999;
    const mult = sortDir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      if (sortKey === "name")    return mult * a.name.localeCompare(b.name, "pt");
      if (sortKey === "club")    return mult * a.club.localeCompare(b.club, "pt");
      if (sortKey === "escalao") return mult * a.escalao.localeCompare(b.escalao, "pt");
      if (sortKey === "voltas")  return mult * (a.voltas - b.voltas);
      // Ordenar por uma coluna de torneio: quem NÃO jogou essa prova fica
      // sempre no fim, nas duas direcções.
      if (sortKey.startsWith("toPar_") || sortKey.startsWith("pts_") || sortKey.startsWith("m_")) {
        const isPts = sortKey.startsWith("pts_");
        const isM = sortKey.startsWith("m_");
        const rk = sortKey.slice(isM ? 2 : isPts ? 4 : 6);
        const va = a.results.get(rk), vb = b.results.get(rk);
        if (!va && !vb) return 0;
        if (!va) return 1;
        if (!vb) return -1;
        // A 2ª coluna de cada ronda mostra Pts ou SD consoante a métrica —
        // ordenar pelo valor que está mesmo à vista.
        const val = (r: RankRoundResult) =>
          isM ? (r.meters ?? INF) : isPts ? (metric === "sd" ? (r.sd ?? INF) : r.pts) : r.toPar;
        return mult * (val(va) - val(vb));
      }
      const ta = isNaN(a.total) ? INF : a.total;
      const tb = isNaN(b.total) ? INF : b.total;
      return mult * (ta - tb);
    });
  }, [filteredRows, sortKey, sortDir, metric]);

  /** Posição no RANKING (pela métrica), não a ordem da tabela. */
  const rankByKey = useMemo(() => rankPositions(rowsInscritos, metric), [rowsInscritos, metric]);

  // Não inscritos: mesmos filtros; # = posição por total (fixa).
  const naoInscritos = useMemo(() => applyFilters(rowsNaoInscritos), [applyFilters, rowsNaoInscritos]);
  const naoInscritosRank = useMemo(() => rankPositions(rowsNaoInscritos, "pts"), [rowsNaoInscritos]);

  // Slot na toolbar principal da FPGPage. Se existir, renderizamos os filtros
  // via createPortal para lá (evita ter 2 toolbars empilhadas). Se não existir
  // (fallback), mostramos a toolbar dentro do próprio componente.
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  // ⚠ Sem deps de propósito: a FPGPage só monta o slot depois de `loading`
  // acabar, e esta vista pode montar ANTES disso (os dados dela carregam mais
  // depressa). Tenta a cada render até encontrar (getElementById é barato e pára aí).
  useEffect(() => {
    if (toolbarSlot) return;
    const el = document.getElementById("pja-toolbar-slot");
    if (el) setToolbarSlot(el);
  });

  if (loading && pjaList.length === 0) return <LoadingState size="sm" />;
  if (!year) return <div className="muted fs-11 u-p-24px">{emptyLabel}</div>;

  const totalLabel = metric === "sd" ? "SD méd" : "Total";
  const rowClassName = (row: RankRow) => [
    isManuel(row) ? "row-manuel" : "",
    selectedKey === row.key ? "row-selected" : "",
  ].filter(Boolean).join(" ") || undefined;
  // Nota: `allRows` só é usado para filtros/availEscs; o ranking usa rowsInscritos.

  const toolbarInner = <>
    <div className="u-d-flex u-gap-4px">
      {years.map(yr => (
        <button key={yr}
          className={"tourn-tab tourn-tab-sm" + (yr === year ? " active" : " tourn-tab-muted")}
          onClick={() => { setActiveYear(yr); setFilterEsc([]); setFilterSex(""); setFilterRegiao([]); setFilterHcp(false); setFilterName(""); resetYearSort(); }}
          style={{ flexShrink: 0 }}>
          {yr}
        </button>
      ))}
    </div>
    {/* Search removido — a FPGPage renderiza um search único na sua toolbar
        e passa o valor via `externalFilterName`. Fallback inline quando o
        componente é usado standalone (sem externalFilterName). */}
    {externalFilterName === undefined && (
      <div className="shrink-0 u-pos-relative">
        <span className="u-pos-absolute u-left-7px u-top-50pc u-transform-translatey-50pc u-fs-fs-11 u-c-text-muted u-pointer-events-none">🔍</span>
        <input type="text" placeholder="Nome ou clube…" value={internalFilterName}
          onChange={e => setFilterName(e.target.value)}
          className="input-search u-w-140px" />
      </div>
    )}
    {availSexes.length > 1 && <>
      <span className="u-c-border">|</span>
      {availSexes.map(sx => (
        <FilterChip key={sx} active={filterSex === sx}
                    onClick={() => setFilterSex(filterSex === sx ? "" : sx)}
                    color={sx === "F" ? "var(--badge-female)" : "var(--badge-male)"}>
          <SexBadge sex={sx} size="sm" />
          {sx === "F" ? " Raparigas" : " Rapazes"}
        </FilterChip>
      ))}
    </>}
    {availRegioes.length > 1 && <>
      <span className="u-c-border">|</span>
      {availRegioes.map(g => (
        <FilterChip key={g} active={filterRegiao.includes(g)}
          onClick={() => setFilterRegiao(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])}>
          {g}
        </FilterChip>
      ))}
    </>}
    {hcpFilterMax != null && <>
      <span className="u-c-border">|</span>
      <FilterChip active={filterHcp} onClick={() => setFilterHcp(v => !v)} color="var(--color-good)">
        HCP &lt; {hcpFilterMax}
      </FilterChip>
    </>}
    {availEscs.length > 1 && <span className="u-c-border">|</span>}
    {availEscs.map(e => {
      const k = e.toLowerCase().replace(/[\s-]/g, "");
      const s = ESC_STYLE[k];
      return <FilterChip key={e} active={filterEsc.includes(e)} onClick={() => toggleEsc(e)} color={s?.bg}>{e}</FilterChip>;
    })}
    {(filterEsc.length > 0 || filterSex || filterRegiao.length > 0 || filterHcp || filterName) && <>
      <span className="muted fs-10 u-ws-nowrap u-fsh-0">{sortedRows.length} de {allRows.length}</span>
      <FilterChip active={false} onClick={() => { setFilterEsc([]); setFilterSex(""); setFilterRegiao([]); setFilterHcp(false); if (externalFilterName === undefined) setFilterName(""); }}>✕ limpar</FilterChip>
    </>}
    <span className="muted fs-10 ml-auto u-ws-nowrap u-cur-help" title={metric === "sd" ? `SD oficial da FPG de cada volta (o do WHS de cada miúdo) · média das ${BEST_SD_N} melhores, mínimo ${MIN_SD_ROUNDS} voltas · MENOR é melhor` : !specialRules ? "Par=25pts · Top-14 voltas · todas as rondas contam · todos os torneios pesam o mesmo (sem multiplicadores)" : year === "2025" ? "Par=25pts · Top-7 torneios + GF · GF×1,5 · VP D1+D2 combinado" : year >= "2026" ? "Par=25pts · Top-14 voltas · GF×1,5 · GG Main R2+R3" : "Par=25pts · Top-14 voltas · GF×1,5"}>
      ℹ Regras
    </span>
    <span className="chip" title={`${allRows.length} ${specialRules ? "jogadores PJA" : "juniores"} · ${visibleTournCols.length} torneios`}>
      {allRows.length}j · {visibleTournCols.length}t
    </span>
  </>;

  const grid = (
          <CrossSeasonTable
            identityColSpan={3}
            identityHeaders={<>
              <CSortTh k="rank"    s={sortKey} d={sortDir} on={handleSort} className="cs-pos sticky-col-0">#</CSortTh>
              <CSortTh k="name"    s={sortKey} d={sortDir} on={handleSort} className="cs-name sticky-col-1">Jogador</CSortTh>
              <CSortTh k="escalao" s={sortKey} d={sortDir} on={handleSort} className="cs-esc">Esc.</CSortTh>
              <CSortTh k="club"    s={sortKey} d={sortDir} on={handleSort} className="cs-club cs-id-end">Clube</CSortTh>
            </>}
            groups={visibleTournCols.map(tc => ({
              key: tc.tournKey,
              headerTh: (() => {
                const { circuito, local } = shortTournName(tc.name, tc.campo);
                // Tipografia uniforme: mesma font-size e font-weight nas 3 linhas.
                // Só a cor distingue hierarquia (título mais escuro; local+data mais muted).
                const lineStyle: React.CSSProperties = {
                  fontSize: "var(--fs-10)",
                  fontWeight: 600,
                  lineHeight: 1.2,
                  whiteSpace: "normal",
                  textAlign: "center",
                };
                // Link para o torneio — base URL depende do tipo:
                //  - Drive Tour / Aquapor → /drive/torneio/... (estão na DrivePage)
                //  - Greatgolf, PJA exclusivos, torneios manuais → /FPG/torneio/...
                const firstTcode = (tc.tcode || "").split("+")[0];
                const isDriveOrAquapor = /Drive\s+Tour/i.test(tc.name) || /Circuito\s+Aquapor/i.test(tc.name);
                const base = isDriveOrAquapor ? "/drive/torneio" : "/FPG/torneio";
                const href = tc.ccode && firstTcode ? `${base}/${tc.ccode}-${firstTcode}` : null;
                const content = (
                  <>
                    <div style={{ ...lineStyle, color: "var(--text-1)" }}>
                      {circuito}
                      {tc.mult !== 1.0 && <span className="badge-gf u-ml-3px">★{tc.mult}</span>}
                    </div>
                    <div style={{ ...lineStyle, color: "var(--text-2)" }}>
                      {local || "\u00A0"}
                    </div>
                    <div style={{ ...lineStyle, color: "var(--text-muted)" }}>
                      {shortDateSlash(tc.date)}
                      {!tc.agregado && (tc.totalRondas ?? tc.rounds.length) > 1 && <>
                        {" · "}
                        <RoundPill nR={tc.totalRondas ?? tc.rounds.length} />
                        {tc.totalRondas && tc.totalRondas > tc.rounds.length && (
                          <span title={`Só ${tc.rounds.length} rondas contam para o ranking PJA (regulamento §2.5 — últimos 2 dias)`}
                                className="u-ml-3px u-fs-fs-9 u-fw-700 u-c-color-warn-dark">
                            {tc.rounds.length}/{tc.totalRondas} contam
                          </span>
                        )}
                      </>}
                    </div>
                  </>
                );
                return (
                  <th key={tc.tournKey} colSpan={tc.colSpan} className="cs-grp u-p-0 u-va-top" title={tc.name + (tc.campo ? " — " + tc.campo : "") + (href ? " · clicar para abrir" : "")}>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer"

                         className="tourn-header-link u-d-block u-p-4px-3px u-td-none u-c-inherit">
                        {content}
                      </a>
                    ) : (
                      <div className="u-p-4px-3px">{content}</div>
                    )}
                  </th>
                );
              })(),
              subHeaderThs: (
                <>
                  {tc.rounds.map(r => (
                    <React.Fragment key={r.roundKey}>
                      <CSortTh k={"toPar_" + r.roundKey} s={sortKey} d={sortDir} on={handleSort} className="cs-t-topar cs-grp">
                        {r.label
                          ? <span className="u-fs-fs-10 u-fw-800 u-c-color-good-dark"
                                  title={tc.agregado
                                    ? "Volta — nesta coluna as voltas podem vir de provas diferentes (passa o rato numa célula para ver qual)"
                                    : `Ronda ${r.label.slice(1)}`}>{r.label}</span>
                          : "±Par"}
                      </CSortTh>
                      <CSortTh k={"pts_" + r.roundKey} s={sortKey} d={sortDir} on={handleSort} className="cs-t-gross cs-col" style={{ color: "var(--color-warn-dark)", fontWeight: 700 }}>{metric === "sd" ? "SD" : "Pts"}</CSortTh>
                      {showMeters && (
                        <CSortTh k={"m_" + r.roundKey} s={sortKey} d={sortDir} on={handleSort} className="cs-t-topar cs-col"
                          title="Metros jogados nesta volta">m</CSortTh>
                      )}
                    </React.Fragment>
                  ))}
                </>
              ),
            }))}
            summaryGroupTh={<th className="cs-grp u-fw8-fs12" colSpan={2}>
              Ranking
            </th>}
            summarySubHeaders={<>
              <CSortTh k="voltas" s={sortKey} d={sortDir} on={handleSort} className="cs-s-games cs-grp">Voltas</CSortTh>
              <CSortTh k="total"  s={sortKey} d={sortDir} on={handleSort} className="cs-s-pts cs-col" style={{ color: "var(--color-warn-dark)", fontWeight: 800 }}
                title={metric === "sd" ? `Média das ${BEST_SD_N} melhores voltas — MENOR é melhor` : undefined}>
                {metric === "sd" ? "SD méd" : "Total"}
              </CSortTh>
            </>}
          >
            {sortedRows.map((row, idx) => {
              const isSel = selectedKey === row.key;
              // Voltas que ficaram fora do top-14 (só no modo de pontos — em
              // "sd" a métrica é uma média das melhores, não uma soma).
              const cortadas = metric === "pts"
                ? [...row.results.values()].filter(r => !r.excluded && !r.inTop14).length
                : 0;
              // Quando o tecto morde, mostram-se os dois números: o que CONTA
              // em grande, o que se JOGOU em pequeno. Sem isto a linha exibia
              // 18 voltas ao lado de um total de 14 e as contas não fechavam.
              const contadas = row.voltas - cortadas;
              const totalTodas = cortadas > 0
                ? row.allRounds.reduce((a, r) => a + r.pts, 0)
                : 0;
              const classes = [
                isManuel(row) ? "row-manuel" : "",
                isSel ? "row-selected" : "",
              ].filter(Boolean).join(" ") || undefined;
              return (
                <tr key={row.key} className={classes}
                    onClick={() => setSelectedKey(isSel ? null : row.key)}
                    style={{ cursor: "pointer" }}>
                  <td className="cs-pos sticky-col-0" title={`Posição no ranking (${sortKey === "total" ? "ordem actual" : "independente da ordenação da tabela"})`}>
                    {rankByKey.get(row.key) ?? idx + 1}
                  </td>
                  <td className="cs-name sticky-col-1">
                    <PName name={row.name} fedCode={row.fedCode} playersDB={playersDB} sex={row.sex} />
                  </td>
                  <td className="cs-esc">
                    {row.escalao ? <span className={escPillCls(row.escalao) + " fs-10"}>{row.escalao}</span> : <span className="muted">–</span>}
                  </td>
                  <td className="cs-club cs-id-end">{row.club || "–"}</td>

                  {visibleTournCols.map(tc => {
                    const hasAny = tc.rounds.some(r => row.results.has(r.roundKey));
                    if (!hasAny) return <td key={tc.tournKey} colSpan={tc.colSpan} className="cs-grp" />;
                    return (
                      <React.Fragment key={tc.tournKey}>
                        {tc.rounds.map(r => {
                          const res = row.results.get(r.roundKey);
                          if (!res) return (
                            <React.Fragment key={r.roundKey}>
                              <td className="cs-t-topar cs-grp" />
                              <td className="cs-t-gross cs-col" />
                              {showMeters && <td className="cs-t-topar cs-col" />}
                            </React.Fragment>
                          );
                          const tpStr = fmtTP(res.toPar);
                          const tpCol = tpColor(res.toPar);
                          // Tooltip nas TRÊS células da volta: numa coluna
                          // agregada ("3º Drive Challenge" = 5 regiões) saber
                          // QUE prova o miúdo jogou é essencial para ler o valor.
                          const cellTitle = [
                            res.prova,
                            res.meters ? `${res.meters.toLocaleString("pt-PT")} m` : null,
                            res.excludedReason,
                            !res.excluded && !res.inTop14 ? "Fora das 14 melhores voltas — não soma" : null,
                          ].filter(Boolean).join(" · ") || undefined;
                          // Duas maneiras de uma volta não somar, com aspecto
                          // diferente de propósito:
                          //  • `excluded` — a regra tirou-a (GG Main R1, Aquapor
                          //    de quem joga Drive Tour): riscada.
                          //  • fora do TOP-14 — jogou-se e vale, mas há 14
                          //    melhores: esbatida. Sem isto, a partir da 15ª
                          //    volta a linha deixava de somar para o total e
                          //    ninguém percebia porquê.
                          const excludedStyle = res.excluded
                            ? { opacity: 0.4, textDecoration: "line-through" as const }
                            : !res.inTop14
                              ? { opacity: 0.35 }
                              : {};
                          return (
                            <React.Fragment key={r.roundKey}>
                              <td className="cs-t-topar cs-grp" style={{ color: tpCol, ...excludedStyle }} title={cellTitle}>{tpStr}</td>
                              <td className="cs-t-gross cs-col" style={{ color: "var(--color-warn-dark)", ...excludedStyle }} title={cellTitle}>
                                {metric === "sd" ? (res.sd != null ? res.sd.toFixed(1) : "–") : fmtPts(res.pts)}
                              </td>
                              {showMeters && (
                                <td className="cs-t-topar cs-col muted" style={{ fontVariantNumeric: "tabular-nums", ...excludedStyle }}
                                    title={cellTitle}>
                                  {res.meters ? res.meters.toLocaleString("pt-PT") : "–"}
                                </td>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}

                  <td className="cs-s-games cs-grp"
                      title={cortadas > 0 ? `${contadas} das ${row.voltas} voltas contam para o total` : undefined}>
                    {cortadas > 0
                      ? <>{contadas}<span className="muted u-fs-fs-9">/{row.voltas}</span></>
                      : row.voltas}
                  </td>
                  <td className="cs-s-pts cs-col u-fw-800 u-c-color-warn-dark u-fvn-tabular-nums"
                      title={cortadas > 0 ? `${fmtPts(row.total)} pts das voltas que contam · ${fmtPts(totalTodas)} pts somando as ${row.voltas}` : undefined}>
                    {metric === "sd"
                      ? (isNaN(row.total) ? "–" : row.total.toFixed(1))
                      : cortadas > 0
                        // Na MESMA linha (não empilhado): empilhar punha esta
                        // linha da tabela a quase o dobro da altura das outras.
                        ? <>{fmtPts(row.total)}<span className="muted u-fs-fs-9 u-fw-500">/{fmtPts(totalTodas)}</span></>
                        : fmtPts(row.total)}
                  </td>
                </tr>
              );
            })}
          </CrossSeasonTable>
  );

  const ranking: CircuitRanking<RankRow> = {
    key: "ranking",
    label: totalLabel,
    rows: () => filteredRows,
    table: {
      cols: rankCols(metric, rankByKey, playersDB, totalLabel),
      rowKey: r => r.key,
      defaultSort: "rank",
      defaultDir: "asc",
      tieBreak: (a, b) => a.name.localeCompare(b.name, "pt"),
      rowClassName,
    },
    views: [
      { key: "tabela", label: "📊 Tabela", render: () => grid },
      { key: "ranking", label: "🏆 Ranking", table: true },
    ],
    view,
    onView: setView,
    // As notas são do regulamento PJA (provas que não contam, a próxima etapa):
    // no Sub-12 por SD e nas Classificações não fazem sentido.
    header: () => specialRules ? <RankingNotas year={year} /> : null,
    detail: {
      selected: selectedKey,
      onSelect: setSelectedKey,
      render: (row, close) => <PlayerDetail row={row} cols={visibleTournCols} metric={metric} showMeters={showMeters} playersDB={playersDB} onClose={close} />,
    },
    emptyMessage: `Sem dados para ${year}.`,
  };

  return (
    <div className="u-pt-12px">
      {/* Filtros: via portal para a toolbar da FPGPage se disponível, senão
          inline como toolbar própria (fallback para usos standalone). */}
      {toolbarSlot
        ? createPortal(toolbarInner, toolbarSlot)
        : <div className="toolbar u-fwr-wrap u-gap-6px">{toolbarInner}</div>
      }

      <CircuitRankingView ranking={ranking} ctx={RANK_CTX} />

      {/* «Não inscritos» — jogadores com tag PJA que NÃO se inscreveram no
          circuito no ano corrente. Pontuam em eventos PJA na mesma, mas não
          entram no ranking oficial. */}
      {naoInscritos.length > 0 && (
        <div className="print-hide u-mt-24px u-p-0-16px-24px u-op-0_85">
          <div className="u-d-flex u-ai-center u-gap-10px u-p-10px-0">
            <span className="fw-800 fs-12 u-c-text-2">
              Não inscritos no circuito {year}
            </span>
            <span className="muted fs-10">
              {naoInscritos.length} jogador{naoInscritos.length === 1 ? "" : "es"} · pontuou em eventos PJA mas não está inscrito, não conta para o ranking
            </span>
          </div>
          <RankingTable rows={naoInscritos} rowKey={r => r.key} defaultSort="rank" defaultDir="asc"
            tieBreak={(a, b) => a.name.localeCompare(b.name, "pt")}
            cols={rankCols("pts", naoInscritosRank, playersDB, "Total pts", false).filter(c => c.key !== "best" && c.key !== "hcp")}
            onRowClick={r => setSelectedKey(selectedKey === r.key ? null : r.key)}
            rowClassName={r => selectedKey === r.key ? "row-selected" : undefined} />
        </div>
      )}
    </div>
  );
}
