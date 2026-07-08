/**
 * JogadoresPorAnoPage.tsx — Listagem evolutiva de jogadores por ANO DE NASCIMENTO
 *
 * Página de utilidade (NÃO está na NavBar — acede-se por URL directo
 * `/jogadores-por-ano`). Agrupa os jogadores por coorte de ano de nascimento
 * (2008, 2009, … 2018) e mostra, para cada um, métricas úteis para perceber
 * "como está aquele jogador": nº de rondas (3m/12m), forma nas rondas
 * (avgSD5/avgSD8, lastSD), handicap actual e a sua evolução (Δ3m + tendência),
 * melhor gross, e holes-in-one.
 *
 * Fonte alternável (toggle Nossos / TODOS) — igual à JogadoresPage:
 *   - Nossos  → players.json (jogadores curados, com análise detalhada + stats)
 *   - TODOS   → + federados.json (universo FPG completo; sem stats de rondas)
 *
 * Filtros incluem selecção de anos de nascimento + opção "Tabela única" para
 * juntar várias coortes (ex: 2013 + 2014) numa só tabela em vez de separadas.
 *
 * Reusa os componentes/utilitários partilhados do projecto
 * (useSort, SortableHdr, Toolbar, SexBadge, EscPill, player-stats).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import {
  loadFederados, mergePlayersWithFederados,
  type FederadoRaw, type MergedPlayer,
} from "../data/federadosLoader";
import { loadPlayerStats, type PlayerStatsDb, type PlayerStats } from "../data/playerStatsTypes";
import { loadHcpHistory, type HcpHistoryDb } from "../data/hcpHistoryLoader";
import { useSort } from "../hooks/useSort";
import SortableHdr from "../ui/SortableHdr";
import HcpEvolution from "../ui/HcpEvolution";
import { Toolbar } from "../ui/Toolbar";
import Counter from "../ui/Counter";
import SexBadge from "../ui/SexBadge";
import { EscPill } from "../ui/PillBadge";
import type { PlayerClub } from "../data/types";

/* ─────────────────────────────────────────────────────────────── */

const ESC_ORDER = ["Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18", "Sub-21", "Sub-24", "Absoluto", "MidAmateur", "Sénior", "SuperSenior", "Outros"];
const ESC_IDX = new Map(ESC_ORDER.map((e, i) => [e, i]));
const HCP_UNESTABLISHED = 54;
const CURRENT_YEAR = new Date().getFullYear();

type Source = "both" | "players" | "feds";
interface Row {
  fed: string;
  name: string;
  dob: string;
  sex: string;
  hcp: number | null;
  escalao: string;
  club: PlayerClub | string;
  region: string;
  tags?: string[];
  _source?: Source;
}

type SortKey =
  | "ano" | "nome" | "sexo" | "clube" | "escalao" | "hcp" | "delta"
  | "best" | "sd5" | "lastsd" | "rondas3" | "rondas" | "aces";

const clubName = (c: PlayerClub | string): string =>
  typeof c === "object" ? (c?.short || c?.long || "") : (c || "");

const num = (v: number | null | undefined): number | null =>
  (v == null || !isFinite(v)) ? null : v;

const birthYear = (dob: string): number => parseInt(dob.slice(0, 4), 10);

/* Métrica de "evolução" — Δ HCP a 3 meses. Negativo = melhorou (HCP desceu). */
function DeltaHcp({ d }: { d: number | null }) {
  if (d == null || d === 0) return <span className="muted">—</span>;
  const improved = d < 0;
  return (
    <span style={{ color: improved ? "var(--color-good)" : "var(--color-danger)", fontWeight: 700 }}>
      {improved ? "▼" : "▲"} {d > 0 ? "+" : ""}{d.toFixed(1)}
    </span>
  );
}

/* 🔥/🧊 só faz sentido se o jogador ANDA a jogar — exigimos rondas nos
 * últimos 3 meses. Sem isso, o formAlert é calculado sobre rondas antigas
 * e seria enganador (ex: alguém que não joga há meses a aparecer "em forma"). */
function FormBadge({ ps }: { ps: PlayerStats | undefined }) {
  if (!ps || !ps.formAlert || !(ps.roundsLast3m > 0)) return null;
  return (
    <span title={ps.formAlert === "hot" ? "Em boa forma (rondas recentes)" : "Em má forma (rondas recentes)"} style={{ marginLeft: 4 }}>
      {ps.formAlert === "hot" ? "🔥" : "🧊"}
    </span>
  );
}

function Kpi({ label, value, sub, title }: { label: string; value: React.ReactNode; sub?: string; title?: string }) {
  return (
    <div className="card" title={title} style={{ margin: 0, padding: "8px 10px", textAlign: "center", minWidth: 86 }}>
      <div className="muted fs-10">{label}</div>
      <div className="fw-900" style={{ fontSize: "var(--fs-18)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div className="muted fs-10">{sub}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */

export default function JogadoresPorAnoPage() {
  const { players } = useAppContext();

  const [statsDb, setStatsDb] = useState<PlayerStatsDb>({});
  const [hcpHistory, setHcpHistory] = useState<HcpHistoryDb>({});
  const [federados, setFederados] = useState<FederadoRaw[] | null>(null);
  const [loadingFeds, setLoadingFeds] = useState(false);
  const [fedsError, setFedsError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"ours" | "todos">("ours");
  const [q, setQ] = useState("");
  const [sexFilter, setSexFilter] = useState<"ALL" | "M" | "F">("ALL");
  const [escSet, setEscSet] = useState<Set<string>>(new Set());
  const [yearSet, setYearSet] = useState<Set<number>>(new Set());
  const [regionFilter, setRegionFilter] = useState("ALL");
  const [hcpMax, setHcpMax] = useState<string>("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [withStatsOnly, setWithStatsOnly] = useState(false);
  const [order, setOrder] = useState<"asc" | "desc">("asc"); // ordem das coortes (ano)
  const [combine, setCombine] = useState(false);             // juntar anos numa tabela única

  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("hcp", "asc", {
    rondas3: "desc", rondas: "desc", aces: "desc", best: "asc", sd5: "asc", lastsd: "asc",
    delta: "asc", hcp: "asc", ano: "asc", nome: "asc", sexo: "asc", clube: "asc", escalao: "asc",
  });

  useEffect(() => { loadPlayerStats().then(setStatsDb); }, []);
  useEffect(() => { loadHcpHistory().then(setHcpHistory); }, []);

  // Lazy-load federados.json só quando o utilizador escolhe TODOS
  useEffect(() => {
    if (viewMode !== "todos" || federados || loadingFeds) return;
    setLoadingFeds(true);
    setFedsError(null);
    loadFederados()
      .then(f => setFederados(f.players))
      .catch(err => setFedsError(String(err?.message || err)))
      .finally(() => setLoadingFeds(false));
  }, [viewMode, federados, loadingFeds]);

  /* ── Universo de jogadores (consoante a fonte) ─────────────── */
  const allRows = useMemo<Row[]>(() => {
    if (federados) {
      const merged = mergePlayersWithFederados(players, federados)
        .map(p => ({ ...p, fed: p.nfed })) as (MergedPlayer & { fed: string })[];
      const list = viewMode === "todos" ? merged : merged.filter(p => p._source !== "feds");
      return list as unknown as Row[];
    }
    // Fallback (federados ainda a carregar, ou modo Nossos)
    return Object.entries(players).map(([fed, p]) => {
      const esc = (!p.escalao || p.escalao === "?" || p.escalao === "Outros") ? "Absoluto" : p.escalao;
      return { ...p, fed, escalao: esc } as Row;
    });
  }, [players, viewMode, federados]);

  const regions = useMemo(() => {
    const s = new Set<string>();
    allRows.forEach(p => p.region && s.add(p.region));
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [allRows]);

  const escaloesPresent = useMemo(() => {
    const present = new Set<string>();
    allRows.forEach(p => p.escalao && present.add(p.escalao));
    return ESC_ORDER.filter(e => present.has(e));
  }, [allRows]);

  const yearsPresent = useMemo(() => {
    const s = new Set<number>();
    allRows.forEach(p => { if (p.dob && p.dob.length >= 4) { const y = birthYear(p.dob); if (!isNaN(y)) s.add(y); } });
    return [...s].sort((a, b) => b - a); // mais novo primeiro nos chips
  }, [allRows]);

  // Anos recentes (≥2006) ficam individuais; ≤2005 agrupam-se em escalões de
  // 5 anos para o filtro não ficar gigantesco (há nascidos até aos anos 20).
  const YEAR_INDIVIDUAL_FROM = 2006;
  const recentYears = useMemo(() => yearsPresent.filter(y => y >= YEAR_INDIVIDUAL_FROM), [yearsPresent]);
  const yearBuckets = useMemo(() => {
    const olds = yearsPresent.filter(y => y < YEAR_INDIVIDUAL_FROM);
    const map = new Map<number, number[]>(); // high → anos presentes nesse escalão
    for (const y of olds) {
      const high = 2005 - Math.floor((2005 - y) / 5) * 5;
      (map.get(high) || map.set(high, []).get(high)!).push(y);
    }
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([high, years]) => ({ high, low: high - 4, years }));
  }, [yearsPresent]);

  /* ── Aplicar filtros ───────────────────────────────────────── */
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const maxH = hcpMax.trim() === "" ? null : parseFloat(hcpMax);
    return allRows.filter(p => {
      if (!p.dob || p.dob.length < 4) return false;            // precisa de ano de nascimento
      const y = birthYear(p.dob);
      if (isNaN(y)) return false;
      if (yearSet.size > 0 && !yearSet.has(y)) return false;
      if (sexFilter !== "ALL" && p.sex !== sexFilter) return false;
      if (escSet.size > 0 && !escSet.has(p.escalao)) return false;
      if (regionFilter !== "ALL" && p.region !== regionFilter) return false;
      if (maxH != null && !isNaN(maxH) && (p.hcp == null || p.hcp > maxH)) return false;
      const ps = statsDb[p.fed];
      if (activeOnly && !(ps && ps.roundsLast12m > 0)) return false;
      if (withStatsOnly && !ps) return false;
      if (ql) {
        const hay = `${p.name} ${clubName(p.club)} ${p.fed}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [allRows, q, sexFilter, escSet, yearSet, regionFilter, hcpMax, activeOnly, withStatsOnly, statsDb]);

  /* ── Agrupar por ano de nascimento ─────────────────────────── */
  const cohorts = useMemo(() => {
    const by = new Map<number, Row[]>();
    for (const p of filtered) {
      const y = birthYear(p.dob);
      (by.get(y) || by.set(y, []).get(y)!).push(p);
    }
    const years = [...by.keys()].sort((a, b) => order === "asc" ? a - b : b - a);
    return years.map(year => ({ year, rows: by.get(year)! }));
  }, [filtered, order]);

  /* ── Comparador de ordenação ───────────────────────────────── */
  const cmp = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const nv = (v: number | null, dirHigh: boolean) =>
      v == null ? (dirHigh ? -Infinity : Infinity) : v; // nulos sempre ao fundo
    return (a: Row, b: Row): number => {
      const sa = statsDb[a.fed], sb = statsDb[b.fed];
      switch (sortKey) {
        case "ano":    return dir * (birthYear(a.dob) - birthYear(b.dob));
        case "nome":   return dir * a.name.localeCompare(b.name, "pt");
        case "sexo":   return dir * (a.sex || "").localeCompare(b.sex || "");
        case "clube":  return dir * clubName(a.club).localeCompare(clubName(b.club), "pt");
        case "escalao":return dir * ((ESC_IDX.get(a.escalao) ?? 99) - (ESC_IDX.get(b.escalao) ?? 99));
        case "hcp":    return dir * (nv(num(a.hcp), dir < 0) - nv(num(b.hcp), dir < 0));
        case "delta":  return dir * (nv(num(sa?.hcpDelta3m ?? null), dir < 0) - nv(num(sb?.hcpDelta3m ?? null), dir < 0));
        case "best":   return dir * (nv(num(sa?.bestGross ?? null), dir < 0) - nv(num(sb?.bestGross ?? null), dir < 0));
        case "sd5":    return dir * (nv(num(sa?.avgSD5 ?? null), dir < 0) - nv(num(sb?.avgSD5 ?? null), dir < 0));
        case "lastsd": return dir * (nv(num(sa?.lastSD ?? null), dir < 0) - nv(num(sb?.lastSD ?? null), dir < 0));
        case "rondas3": return dir * ((sa?.roundsLast3m ?? -1) - (sb?.roundsLast3m ?? -1));
        case "rondas": return dir * ((sa?.roundsLast12m ?? -1) - (sb?.roundsLast12m ?? -1));
        case "aces":   return dir * ((sa?.aces ?? -1) - (sb?.aces ?? -1));
        default:       return 0;
      }
    };
  }, [sortKey, sortDir, statsDb]);

  // Jogadores (filtrados) para a tabela de evolução de HCP. O componente
  // ignora internamente os que não têm histórico em hcp-history.json.
  const evoPlayers = useMemo(
    () => filtered.map(p => ({ fed: p.fed, name: p.name, sex: p.sex, club: clubName(p.club), escalao: p.escalao })),
    [filtered]
  );

  const activeFiltersCount =
    (q.trim() ? 1 : 0) + (sexFilter !== "ALL" ? 1 : 0) + (escSet.size > 0 ? 1 : 0) +
    (yearSet.size > 0 ? 1 : 0) + (regionFilter !== "ALL" ? 1 : 0) + (hcpMax.trim() ? 1 : 0) +
    (activeOnly ? 1 : 0) + (withStatsOnly ? 1 : 0);

  // Juntar várias coortes numa só tabela: automático quando 2+ anos estão
  // seleccionados, ou forçado pela checkbox "Tabela única".
  const effectiveCombine = combine || yearSet.size > 1;

  const toggleEsc = (e: string) =>
    setEscSet(prev => { const n = new Set(prev); n.has(e) ? n.delete(e) : n.add(e); return n; });
  const toggleYear = (y: number) =>
    setYearSet(prev => { const n = new Set(prev); n.has(y) ? n.delete(y) : n.add(y); return n; });
  const toggleBucket = (years: number[]) =>
    setYearSet(prev => {
      const n = new Set(prev);
      const allIn = years.length > 0 && years.every(y => n.has(y));
      years.forEach(y => allIn ? n.delete(y) : n.add(y));
      return n;
    });
  const bucketActive = (years: number[]) => years.length > 0 && years.every(y => yearSet.has(y));

  const clearFilters = () => {
    setQ(""); setSexFilter("ALL"); setEscSet(new Set()); setYearSet(new Set());
    setRegionFilter("ALL"); setHcpMax(""); setActiveOnly(false); setWithStatsOnly(false);
  };

  /* ── Métricas agregadas de um conjunto de rows ─────────────── */
  const metricsOf = (rows: Row[]) => {
    const hcps = rows.map(r => num(r.hcp)).filter((h): h is number => h != null && h < HCP_UNESTABLISHED);
    const avgHcp = hcps.length ? hcps.reduce((s, h) => s + h, 0) / hcps.length : null;
    const bestHcp = hcps.length ? Math.min(...hcps) : null;
    const nM = rows.filter(r => r.sex === "M").length;
    const nF = rows.filter(r => r.sex === "F").length;
    const r12 = rows.map(r => statsDb[r.fed]?.roundsLast12m).filter((v): v is number => v != null);
    const avgR12 = r12.length ? r12.reduce((s, v) => s + v, 0) / r12.length : null;
    const nActive = rows.filter(r => (statsDb[r.fed]?.roundsLast12m ?? 0) > 0).length;
    return { avgHcp, bestHcp, nM, nF, avgR12, nActive };
  };

  /* ── Cabeçalho de KPIs (reutilizável) ──────────────────────── */
  const KpiRow = ({ rows }: { rows: Row[] }) => {
    const m = metricsOf(rows);
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
        <Kpi label="Sexo" value={<span style={{ display: "inline-flex", gap: 4, fontSize: "var(--fs-14)", alignItems: "center" }}><SexBadge sex="M" />{m.nM} <SexBadge sex="F" />{m.nF}</span>} />
        <Kpi label="HCP médio" value={m.avgHcp == null ? "—" : m.avgHcp.toFixed(1)} />
        <Kpi label="Melhor HCP" value={m.bestHcp == null ? "—" : m.bestHcp.toFixed(1)} />
        <Kpi label="Rondas 12m" value={m.avgR12 == null ? "—" : m.avgR12.toFixed(1)} sub="média" />
        <Kpi label="Activos 12m" value={m.nActive} sub={`de ${rows.length}`}
          title="Jogadores que fizeram pelo menos 1 ronda nos últimos 12 meses" />
      </span>
    );
  };

  /* ── Tabela de jogadores (reutilizável) ────────────────────── */
  const PlayerTable = ({ rows, showYear }: { rows: Row[]; showYear?: boolean }) => {
    const sorted = [...rows].sort(cmp);
    return (
      <div style={{ overflowX: "auto", padding: "0 4px 12px" }}>
        <table className="sc-table-ec sc-grid" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "right" }}>#</th>
              {showYear && <SortableHdr k="ano" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Ano de nascimento">Ano</SortableHdr>}
              <SortableHdr k="nome" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="row-label">Jogador</SortableHdr>
              <SortableHdr k="sexo" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Sx</SortableHdr>
              <SortableHdr k="clube" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Clube</SortableHdr>
              <SortableHdr k="escalao" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Escalão</SortableHdr>
              <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Handicap actual">HCP</SortableHdr>
              <SortableHdr k="delta" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Variação de HCP nos últimos 3 meses (negativo = melhorou)">Δ3m</SortableHdr>
              <SortableHdr k="best" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Melhor gross registado">Melhor</SortableHdr>
              <SortableHdr k="sd5" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Média dos 5 score differentials mais recentes">SD5</SortableHdr>
              <SortableHdr k="lastsd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Score differential da última ronda">Últ.SD</SortableHdr>
              <SortableHdr k="rondas3" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Rondas nos últimos 3 meses">R3m</SortableHdr>
              <SortableHdr k="rondas" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Rondas nos últimos 12 meses">R12m</SortableHdr>
              <SortableHdr k="aces" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Holes-in-one">🕳️</SortableHdr>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              const ps = statsDb[p.fed];
              const hasAnalysis = p._source === "both" || p._source === "players" || (!p._source);
              return (
                <tr key={p.fed}>
                  <td style={{ textAlign: "right", color: "var(--text-3)" }}>{i + 1}</td>
                  {showYear && <td style={{ fontWeight: 700 }}>{birthYear(p.dob)}</td>}
                  <td className="row-label" style={{ whiteSpace: "nowrap" }}>
                    {hasAnalysis
                      ? <Link to={`/jogadores/${p.fed}`} style={{ color: "var(--accent)", fontWeight: 700 }}>{p.name}</Link>
                      : <span style={{ fontWeight: 600 }}>{p.name}</span>}
                    <FormBadge ps={ps} />
                  </td>
                  <td><SexBadge sex={p.sex} /></td>
                  <td style={{ textAlign: "left", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clubName(p.club) || <span className="muted">—</span>}</td>
                  <td><EscPill esc={p.escalao} /></td>
                  <td style={{ fontWeight: 700 }}>{p.hcp == null ? <span className="muted">—</span> : p.hcp.toFixed(1)}</td>
                  <td><DeltaHcp d={ps?.hcpDelta3m ?? null} /></td>
                  <td>{ps?.bestGross ?? <span className="muted">—</span>}</td>
                  <td>{ps?.avgSD5 == null ? <span className="muted">—</span> : ps.avgSD5.toFixed(1)}</td>
                  <td>{ps?.lastSD == null ? <span className="muted">—</span> : ps.lastSD.toFixed(1)}</td>
                  <td style={{ fontWeight: 600 }}>{ps?.roundsLast3m ?? <span className="muted">—</span>}</td>
                  <td style={{ fontWeight: 600 }}>{ps?.roundsLast12m ?? <span className="muted">—</span>}</td>
                  <td>{ps?.aces ? `🕳️${ps.aces > 1 ? "×" + ps.aces : ""}` : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  /* ─────────────────────────────────────────────────────────── */
  return (
    <div className="jogadores-page" style={{ padding: "8px 12px 40px" }}>
      <Toolbar>
        <span className="toolbar-title">📅 Jogadores por ano de nascimento</span>

        {/* Fonte: Nossos / TODOS */}
        <div className="segmented-toggle" role="tablist" aria-label="Fonte de jogadores">
          <button
            role="tab" aria-selected={viewMode === "ours"}
            className={`seg-btn ${viewMode === "ours" ? "active" : ""}`}
            onClick={() => setViewMode("ours")}
            title="Jogadores curados com análise detalhada"
          >
            <span className="seg-label">Nossos</span>
            <span className="seg-count">{Object.keys(players).length}</span>
          </button>
          <button
            role="tab" aria-selected={viewMode === "todos"}
            className={`seg-btn ${viewMode === "todos" ? "active" : ""}`}
            onClick={() => { setFedsError(null); setViewMode("todos"); }}
            title={fedsError ? `Erro: ${fedsError}` : "Universo FPG completo (cadastro)"}
            style={fedsError ? { background: "var(--color-warn-vivid)", color: "#fff" } : undefined}
          >
            <span className="seg-label">TODOS</span>
            <span className="seg-count">
              {federados ? federados.length.toLocaleString("pt-PT") : loadingFeds ? "⏳" : fedsError ? "⚠" : "15k+"}
            </span>
          </button>
        </div>

        <input
          className="select" placeholder="Procurar nome / clube / nº…"
          value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 180 }}
        />

        <select className="select" value={sexFilter} onChange={e => setSexFilter(e.target.value as "ALL" | "M" | "F")}>
          <option value="ALL">Sexo (todos)</option>
          <option value="M">Masculino</option>
          <option value="F">Feminino</option>
        </select>

        <select className="select" value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
          <option value="ALL">Região (todas)</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <input
          className="select" type="number" inputMode="decimal" placeholder="HCP máx"
          value={hcpMax} onChange={e => setHcpMax(e.target.value)} style={{ width: 92 }}
          title="Mostrar só jogadores com HCP igual ou inferior a este valor"
        />

        <label className="muted fs-10" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} />
          Só activos (12m)
        </label>
        <label className="muted fs-10" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={withStatsOnly} onChange={e => setWithStatsOnly(e.target.checked)} />
          Só com estatísticas
        </label>

        <label className="muted fs-10" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          title="Junta todos os anos seleccionados numa só tabela, em vez de uma tabela por ano">
          <input type="checkbox" checked={combine} onChange={e => setCombine(e.target.checked)} />
          Tabela única
        </label>

        <button className="p" onClick={() => setOrder(o => o === "asc" ? "desc" : "asc")}
          title="Inverter ordem das coortes (ano)">
          Ano {order === "asc" ? "▲ mais antigo" : "▼ mais novo"}
        </button>

        {activeFiltersCount > 0 && (
          <button className="p" onClick={clearFilters}
            style={{ background: "var(--color-warn-vivid)", color: "#fff", gap: 4 }}>
            ✕ Limpar <span className="p-filter-count">{activeFiltersCount}</span>
          </button>
        )}

        <Counter ml="auto">{filtered.length.toLocaleString("pt-PT")} jogadores · {cohorts.length} anos</Counter>
      </Toolbar>

      {viewMode === "todos" && fedsError && (
        <div className="muted fs-10 fw-600" style={{ color: "var(--color-warn-vivid)" }}>
          ⚠ Erro a carregar federados.json: {fedsError}
        </div>
      )}

      {/* Filtro por ANO de nascimento — anos recentes individuais, antigos em escalões de 5 anos */}
      {yearsPresent.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0", alignItems: "center" }}>
          <span className="muted fs-10" style={{ fontWeight: 700 }}>Ano:</span>
          {recentYears.map(y => (
            <button
              key={y}
              className={`p p-sm ${yearSet.has(y) ? "" : "p-muted"}`}
              onClick={() => toggleYear(y)}
              style={yearSet.has(y) ? { background: "var(--accent)", color: "#fff" } : undefined}
              title={`Nascidos em ${y} (≈ ${CURRENT_YEAR - y} anos)`}
            >
              {y}
            </button>
          ))}
          {yearBuckets.map(b => (
            <button
              key={b.high}
              className={`p p-sm ${bucketActive(b.years) ? "" : "p-muted"}`}
              onClick={() => toggleBucket(b.years)}
              style={bucketActive(b.years) ? { background: "var(--accent)", color: "#fff" } : undefined}
              title={`Nascidos entre ${b.low} e ${b.high} (${b.years.length} ${b.years.length === 1 ? "ano" : "anos"} com jogadores)`}
            >
              {b.low}–{String(b.high).slice(2)}
            </button>
          ))}
          {yearSet.size > 0 && (
            <button className="p p-sm p-muted" onClick={() => setYearSet(new Set())} title="Limpar selecção de anos">✕ anos</button>
          )}
        </div>
      )}

      {/* Filtro rápido por escalão */}
      {escaloesPresent.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0", alignItems: "center" }}>
          <span className="muted fs-10" style={{ fontWeight: 700 }}>Escalão:</span>
          {escaloesPresent.map(e => (
            <button
              key={e}
              className={`p p-sm ${escSet.has(e) ? "" : "p-muted"}`}
              onClick={() => toggleEsc(e)}
              style={escSet.has(e) ? { background: "var(--accent)", color: "#fff" } : undefined}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Métricas de evolução de HCP da selecção filtrada (tabela, sem gráfico) */}
      {evoPlayers.length > 0 && (
        <div style={{ margin: "12px 0" }}>
          <HcpEvolution players={evoPlayers} history={hcpHistory} showChart={false} />
        </div>
      )}

      {/* Sem resultados */}
      {cohorts.length === 0 && (
        <div className="muted" style={{ padding: 24, textAlign: "center" }}>
          Nenhum jogador corresponde aos filtros (ou sem data de nascimento registada).
        </div>
      )}

      {/* MODO TABELA ÚNICA — todos os anos filtrados juntos */}
      {effectiveCombine && cohorts.length > 0 && (
        <div className="card" style={{ margin: "12px 0", padding: 0 }}>
          <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <span className="fw-900" style={{ fontSize: "var(--fs-16)" }}>
              {(() => {
                const ys = cohorts.map(c => c.year).sort((a, b) => a - b);
                return ys.length === 1 ? `${ys[0]}` : `${ys[0]}–${ys[ys.length - 1]} (${ys.length} anos)`;
              })()}
            </span>
            <Counter>{filtered.length} jog.</Counter>
            <KpiRow rows={filtered} />
          </div>
          <PlayerTable rows={filtered} showYear />
        </div>
      )}

      {/* MODO COORTES — uma tabela por ano */}
      {!effectiveCombine && cohorts.map(({ year, rows }) => (
        <details key={year} open className="card" style={{ margin: "12px 0", padding: 0 }}>
          <summary style={{ cursor: "pointer", listStyle: "none", padding: "10px 12px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <span className="fw-900" style={{ fontSize: "var(--fs-18)" }}>{year}</span>
            <span className="muted fs-10">≈ {CURRENT_YEAR - year} anos</span>
            <Counter>{rows.length} jog.</Counter>
            <KpiRow rows={rows} />
          </summary>
          <PlayerTable rows={rows} />
        </details>
      ))}
    </div>
  );
}
