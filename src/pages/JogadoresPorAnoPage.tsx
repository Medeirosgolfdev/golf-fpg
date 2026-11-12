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
import { useSort, compareNullsLast, compareTextNullsLast } from "../hooks/useSort";
import SortableHdr from "../ui/SortableHdr";
import HcpEvolution from "../ui/HcpEvolution";
import { Toolbar } from "../ui/Toolbar";
import Counter from "../ui/Counter";
import SexBadge from "../ui/SexBadge";
import KpiCard from "../ui/KpiCard";
import { EscPill } from "../ui/PillBadge";
import type { PlayerClub } from "../data/types";

/* ─────────────────────────────────────────────────────────────── */

import { ESC_ORDER_FULL as ESC_ORDER } from "../constants/escaloes";
import { HCP_UNESTABLISHED_THRESHOLD as HCP_UNESTABLISHED } from "./jogadores/filterPlayers";
import { HcpDelta, MUTED } from "../ui/tableCells";
import ClearButton from "../ui/ClearButton";
import TabRow from "../ui/TabRow";
import FilterPillRow from "../ui/FilterPillRow";
import EmptyState from "../ui/EmptyState";
import { fmtHcp } from "../utils/format";
import SearchInput from "../ui/SearchInput";
import ErrorState from "../ui/ErrorState";
import SexSelect from "../ui/SexSelect";
import { ToggleChip } from "../ui/FilterField";
import NumberInput from "../ui/NumberInput";
import Select from "../ui/Select";
import { meanArr } from "../utils/mathUtils";
const ESC_IDX = new Map(ESC_ORDER.map((e, i) => [e, i]));
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


/* 🔥/🧊 só faz sentido se o jogador ANDA a jogar — exigimos rondas nos
 * últimos 3 meses. Sem isso, o formAlert é calculado sobre rondas antigas
 * e seria enganador (ex: alguém que não joga há meses a aparecer "em forma"). */
function FormBadge({ ps }: { ps: PlayerStats | undefined }) {
  if (!ps || !ps.formAlert || !(ps.roundsLast3m > 0)) return null;
  return (
    <span title={ps.formAlert === "hot" ? "Em boa forma (rondas recentes)" : "Em má forma (rondas recentes)"} className="u-ml-4px">
      {ps.formAlert === "hot" ? "🔥" : "🧊"}
    </span>
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
        case "sexo":   return compareTextNullsLast(a.sex, b.sex, dir);
        case "clube":  return compareTextNullsLast(clubName(a.club), clubName(b.club), dir);
        case "escalao":return compareNullsLast(ESC_IDX.get(a.escalao), ESC_IDX.get(b.escalao), dir);
        case "hcp":    return dir * (nv(num(a.hcp), dir < 0) - nv(num(b.hcp), dir < 0));
        case "delta":  return dir * (nv(num(sa?.hcpDelta3m ?? null), dir < 0) - nv(num(sb?.hcpDelta3m ?? null), dir < 0));
        case "best":   return dir * (nv(num(sa?.bestGross ?? null), dir < 0) - nv(num(sb?.bestGross ?? null), dir < 0));
        case "sd5":    return dir * (nv(num(sa?.avgSD5 ?? null), dir < 0) - nv(num(sb?.avgSD5 ?? null), dir < 0));
        case "lastsd": return dir * (nv(num(sa?.lastSD ?? null), dir < 0) - nv(num(sb?.lastSD ?? null), dir < 0));
        case "rondas3": return compareNullsLast(sa?.roundsLast3m, sb?.roundsLast3m, dir);
        case "rondas": return compareNullsLast(sa?.roundsLast12m, sb?.roundsLast12m, dir);
        case "aces":   return compareNullsLast(sa?.aces, sb?.aces, dir);
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

  // Filtro de anos: cada pill (ano ou bloco de anos) é uma chave; os blocos acendem
  // quando todos os seus anos estão escolhidos.
  const bucketKey = (b: { low: number; high: number }) => `${b.low}-${b.high}`;
  const yearsOfKey = useMemo(() => new Map<string, number[]>([
    ...recentYears.map(y => [String(y), [y]] as [string, number[]]),
    ...yearBuckets.map(b => [bucketKey(b), b.years] as [string, number[]]),
  ]), [recentYears, yearBuckets]);
  const yearKeys = [...yearsOfKey].filter(([, ys]) => ys.length > 0 && ys.every(y => yearSet.has(y))).map(([k]) => k);

  const clearFilters = () => {
    setQ(""); setSexFilter("ALL"); setEscSet(new Set()); setYearSet(new Set());
    setRegionFilter("ALL"); setHcpMax(""); setActiveOnly(false); setWithStatsOnly(false);
  };

  /* ── Métricas agregadas de um conjunto de rows ─────────────── */
  const metricsOf = (rows: Row[]) => {
    const hcps = rows.map(r => num(r.hcp)).filter((h): h is number => h != null && h < HCP_UNESTABLISHED);
    const avgHcp = meanArr(hcps);
    const bestHcp = hcps.length ? Math.min(...hcps) : null;
    const nM = rows.filter(r => r.sex === "M").length;
    const nF = rows.filter(r => r.sex === "F").length;
    const r12 = rows.map(r => statsDb[r.fed]?.roundsLast12m).filter((v): v is number => v != null);
    const avgR12 = meanArr(r12);
    const nActive = rows.filter(r => (statsDb[r.fed]?.roundsLast12m ?? 0) > 0).length;
    return { avgHcp, bestHcp, nM, nF, avgR12, nActive };
  };

  /* ── Cabeçalho de KPIs (reutilizável) ──────────────────────── */
  const KpiRow = ({ rows }: { rows: Row[] }) => {
    const m = metricsOf(rows);
    return (
      <span className="u-d-inline-flex u-ai-center u-gap-6px u-ml-auto u-fwr-wrap">
        <KpiCard size="xs" label="Sexo" value={<span className="u-d-inline-flex u-gap-4px u-fs-fs-14 u-ai-center"><SexBadge sex="M" />{m.nM} <SexBadge sex="F" />{m.nF}</span>} />
        <KpiCard size="xs" label="HCP médio" value={fmtHcp(m.avgHcp)} />
        <KpiCard size="xs" label="Melhor HCP" value={fmtHcp(m.bestHcp)} />
        <KpiCard size="xs" label="Rondas 12m" value={m.avgR12 == null ? "—" : m.avgR12.toFixed(1)} sub="média" />
        <KpiCard size="xs" label="Activos 12m" value={m.nActive} sub={`de ${rows.length}`}
          title="Jogadores que fizeram pelo menos 1 ronda nos últimos 12 meses" />
      </span>
    );
  };

  /* ── Tabela de jogadores (reutilizável) ────────────────────── */
  const PlayerTable = ({ rows, showYear }: { rows: Row[]; showYear?: boolean }) => {
    const sorted = [...rows].sort(cmp);
    return (
      <div className="u-ox-auto u-p-0-4px-12px">
        <table className="sc-table-ec sc-grid u-w-100pc">
          <thead>
            <tr>
              <th className="u-ta-right">#</th>
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
                  <td className="u-ta-right u-c-text-3">{i + 1}</td>
                  {showYear && <td className="u-fw-700">{birthYear(p.dob)}</td>}
                  <td className="row-label u-ws-nowrap">
                    {hasAnalysis
                      ? <Link to={`/jogadores/${p.fed}`} className="u-c-accent u-fw-700">{p.name}</Link>
                      : <span className="u-fw-600">{p.name}</span>}
                    <FormBadge ps={ps} />
                  </td>
                  <td><SexBadge sex={p.sex} /></td>
                  <td className="u-ta-left u-maxw-150px u-ov-hidden u-tov-ellipsis u-ws-nowrap">{clubName(p.club) || MUTED}</td>
                  <td><EscPill esc={p.escalao} /></td>
                  <td className="u-fw-700">{p.hcp == null ? MUTED : fmtHcp(p.hcp)}</td>
                  <td><HcpDelta d={ps?.hcpDelta3m ?? null} /></td>
                  <td>{ps?.bestGross ?? MUTED}</td>
                  <td>{ps?.avgSD5 == null ? MUTED : ps.avgSD5.toFixed(1)}</td>
                  <td>{ps?.lastSD == null ? MUTED : ps.lastSD.toFixed(1)}</td>
                  <td className="u-fw-600">{ps?.roundsLast3m ?? MUTED}</td>
                  <td className="u-fw-600">{ps?.roundsLast12m ?? MUTED}</td>
                  <td>{ps?.aces ? `🕳️${ps.aces > 1 ? "×" + ps.aces : ""}` : MUTED}</td>
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
    <div className="jogadores-page u-p-8px-12px-40px">
      <Toolbar>
        <span className="toolbar-title">📅 Jogadores por ano de nascimento</span>

        {/* Fonte: Nossos / TODOS */}
        <TabRow ariaLabel="Fonte de jogadores" active={viewMode}
          onChange={(k) => { if (k === "todos") setFedsError(null); setViewMode(k); }}
          tabs={[
            { key: "ours" as const, label: "Nossos", count: Object.keys(players).length, title: "Jogadores curados com análise detalhada" },
            { key: "todos" as const, label: "TODOS", className: fedsError ? "is-warn" : undefined,
              count: federados ? federados.length.toLocaleString("pt-PT") : loadingFeds ? "⏳" : fedsError ? "⚠" : "15k+",
              title: fedsError ? `Erro: ${fedsError}` : "Universo FPG completo (cadastro)" },
          ]} />

        <SearchInput value={q} onChange={setQ} placeholder="Procurar nome / clube / nº…" />

        <SexSelect value={sexFilter} onChange={setSexFilter} allValue="ALL" />

        <Select value={regionFilter} onChange={setRegionFilter}>
          <option value="ALL">Região (todas)</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </Select>

        <NumberInput variant="select" className="u-w-92px" placeholder="HCP máx"
          value={hcpMax} onChange={setHcpMax}
          title="Mostrar só jogadores com HCP igual ou inferior a este valor" />

        <ToggleChip checked={activeOnly} onChange={setActiveOnly} label="Só activos (12m)" />
        <ToggleChip checked={withStatsOnly} onChange={setWithStatsOnly} label="Só com estatísticas" />
        <ToggleChip checked={combine} onChange={setCombine} label="Tabela única"
          title="Junta todos os anos seleccionados numa só tabela, em vez de uma tabela por ano" />

        <button type="button" className="btn" onClick={() => setOrder(o => o === "asc" ? "desc" : "asc")}
          title="Inverter ordem das coortes (ano)">
          Ano {order === "asc" ? "▲ mais antigo" : "▼ mais novo"}
        </button>

        {activeFiltersCount > 0 && (
          <ClearButton onClick={clearFilters} count={activeFiltersCount} />
        )}

        <Counter ml="auto">{filtered.length.toLocaleString("pt-PT")} jogadores · {cohorts.length} anos</Counter>
      </Toolbar>

      {viewMode === "todos" && fedsError && (
        <ErrorState message="Erro ao carregar a lista de federados (federados.json)" detail={fedsError} />
      )}

      {/* Filtro por ANO de nascimento — anos recentes individuais, antigos em escalões de 5 anos */}
      {yearsPresent.length > 0 && (
        <FilterPillRow label="Ano:" active={yearKeys}
          onChange={keys => setYearSet(new Set(keys.flatMap(k => yearsOfKey.get(k) ?? [])))}
          items={[
            ...recentYears.map(y => ({ key: String(y), label: y, title: `Nascidos em ${y} (≈ ${CURRENT_YEAR - y} anos)` })),
            ...yearBuckets.map(b => ({ key: bucketKey(b), label: `${b.low}–${String(b.high).slice(2)}`,
              title: `Nascidos entre ${b.low} e ${b.high} (${b.years.length} ${b.years.length === 1 ? "ano" : "anos"} com jogadores)` })),
          ]} />
      )}

      {/* Filtro rápido por escalão */}
      {escaloesPresent.length > 0 && (
        <FilterPillRow label="Escalão:" active={escSet} onChange={keys => setEscSet(new Set(keys))}
          items={escaloesPresent.map(e => ({ key: e, label: e }))} />
      )}

      {/* Métricas de evolução de HCP da selecção filtrada (tabela, sem gráfico) */}
      {evoPlayers.length > 0 && (
        <div className="u-m-12px-0">
          <HcpEvolution players={evoPlayers} history={hcpHistory} showChart={false} />
        </div>
      )}

      {/* Sem resultados */}
      {cohorts.length === 0 && (
        <EmptyState>Nenhum jogador corresponde aos filtros (ou sem data de nascimento registada).</EmptyState>
      )}

      {/* MODO TABELA ÚNICA — todos os anos filtrados juntos */}
      {effectiveCombine && cohorts.length > 0 && (
        <div className="card u-m-12px-0 u-p-0">
          <div className="u-p-10px-12px u-d-flex u-ai-center u-fwr-wrap u-gap-12px">
            <span className="fw-900 u-fs-fs-16">
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
        <details key={year} open className="card u-m-12px-0 u-p-0">
          <summary className="u-cur-pointer u-list-style-none u-p-10px-12px u-d-flex u-ai-center u-fwr-wrap u-gap-12px">
            <span className="fw-900 u-fs-fs-18">{year}</span>
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
