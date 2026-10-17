/**
 * RankingPage — a página de um ranking de jogadores com circuito de eventos
 * (EGR, WAGR). Cada ranking só dá a configuração e as colunas; o resto é igual:
 *
 *   {base}                 → CircuitShell com os EVENTOS (leaderboards de totais)
 *   {base}/evt/:id         → leaderboard de um evento
 *   {base}/info/jogadores  → a lista do ranking (vista "info" do shell)
 *   {base}/jogador/:id     → detalhe de um jogador (stats + histórico de eventos)
 *
 * A lista tem pesquisa, país, escalão (se houver), sexo, «só Portugal» e
 * páginas de 100; todas as tabelas ordenam por clique no cabeçalho.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { cachedFetchJson } from "../../data/fetchCache";
import { gf, flagOrEmpty } from "../../utils/flagUtils";
import { norm } from "../../utils/format";
import { useSort } from "../../hooks/useSort";
import { useKidsLinkMap } from "../../hooks/useKidsLinkMap";
import { KidsLink, KidsLinkCtx } from "../KidsLink";
import SortableHdr from "../SortableHdr";
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../Toolbar";
import LoadingState from "../LoadingState";
import EmptyState from "../EmptyState";
import CircuitShell from "../circuit/CircuitShell";
import type { CircuitConfig, CircuitEntry } from "../circuit/types";

const PAGE_SIZE = 100;

/** Número com casas decimais, «—» sem valor. */
export const num = (n: number | null | undefined, d = 2) =>
  n == null || Number.isNaN(n) ? "—" : n.toFixed(d);

/* ── Página ─────────────────────────────────────────────────────── */

export interface RankingPageConfig<R, E> {
  /** "/egr", "/wagr". */
  base: string;
  /** Sigla para as mensagens ("EGR"). */
  name: string;
  rankingUrl: string;
  eventsUrl: string;
  buildEntries: (events: E[]) => CircuitEntry[];
  /** Configuração do CircuitShell (sem routeBase/specialItems/loadingMessage). */
  shell: Omit<CircuitConfig, "routeBase" | "specialItems" | "loadingMessage">;
  /** Etiqueta do item do menu Info ("🏅 Ranking mundial"). */
  rankingLabel: string;
  loadingRanking: string;
  List: (ranking: R) => React.ReactNode;
  Detail: (ranking: R, id: string) => React.ReactNode;
}

export function RankingPage<R, E>({ cfg }: { cfg: RankingPageConfig<R, E> }) {
  const params = useParams<{ source?: string; id?: string }>();
  // Detalhe do jogador (drill-down do ranking), página inteira.
  if (params.source === "jogador" && params.id) return <RankingRoot cfg={cfg} playerId={params.id} />;
  return <EventsCircuit cfg={cfg} params={params} />;
}

/** Carrega o ranking (lazy — só quando se abre a lista ou um jogador). */
function RankingRoot<R, E>({ cfg, playerId }: { cfg: RankingPageConfig<R, E>; playerId?: string }) {
  const [ranking, setRanking] = useState<R | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    cachedFetchJson<R>(cfg.rankingUrl)
      .then((d) => { if (alive) setRanking(d); })
      .catch((e) => { if (alive) setErr(String(e?.message || e)); });
    return () => { alive = false; };
  }, [cfg.rankingUrl]);
  if (err) return <EmptyState icon="⚠️" message={`Erro ao carregar o ranking ${cfg.name}: ${err}`} />;
  if (!ranking) return <LoadingState message={cfg.loadingRanking} />;
  return <>{playerId ? cfg.Detail(ranking, playerId) : cfg.List(ranking)}</>;
}

/** Os EVENTOS são as entries do CircuitShell; o ranking é a vista "info" "jogadores". */
function EventsCircuit<R, E>({ cfg, params }: { cfg: RankingPageConfig<R, E>; params: { source?: string; id?: string } }) {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<CircuitEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    cachedFetchJson<{ events?: E[] }>(cfg.eventsUrl)
      .then((d) => { if (alive) setEntries(cfg.buildEntries(d?.events || [])); })
      .catch((e) => { if (alive) setErr(String(e?.message || e)); });
    return () => { alive = false; };
  }, [cfg]);

  // "info" não colide com "evt" (evento) nem "jogador" (detalhe).
  const onInfo = params.source === "info";
  const selectedInfo = onInfo ? (params.id ?? null) : null;
  const selectedId = !onInfo && params.source === "evt" && params.id ? `evt:${params.id}` : undefined;

  const config = useMemo<CircuitConfig>(() => ({
    ...cfg.shell,
    routeBase: cfg.base,
    specialItems: [{ key: "jogadores", label: cfg.rankingLabel, render: () => <RankingRoot cfg={cfg} /> }],
    loadingMessage: `A carregar eventos ${cfg.name}…`,
  }), [cfg]);

  if (err) return <EmptyState icon="⚠️" message={`Erro ao carregar os eventos ${cfg.name}: ${err}`} />;
  return (
    <CircuitShell
      entries={entries || []}
      config={config}
      loading={!entries}
      selectedId={selectedId}
      onSelectEntry={(e) => navigate(`${cfg.base}/evt/${e.id.split(":")[1]}`)}
      selectedInfo={selectedInfo}
      onSelectInfo={(key) => navigate(key ? `${cfg.base}/info/${key}` : cfg.base)}
    />
  );
}

/* ── Tabela ordenável ───────────────────────────────────────────── */

export interface RankingCol<T> {
  key: string;
  label: React.ReactNode;
  title?: string;
  className?: string;
  /** Valor de ordenação; sem ele, o cabeçalho não ordena. */
  sort?: (r: T) => number | string;
  /** Sentido do 1º clique (default: o da tabela). */
  firstDir?: "asc" | "desc";
  cell: (r: T) => React.ReactNode;
  tdClassName?: string;
  tdStyle?: React.CSSProperties;
}

export function RankingTable<T>({ rows, cols, rowKey, defaultSort, defaultDir, tieBreak, onRowClick, rowStyle, rowTitle, paged }: {
  rows: T[];
  cols: RankingCol<T>[];
  rowKey: (r: T) => string;
  defaultSort: string;
  defaultDir: "asc" | "desc";
  /** Desempate quando o valor da coluna é igual. */
  tieBreak?: (a: T, b: T) => number;
  onRowClick?: (r: T) => void;
  rowStyle?: (r: T) => React.CSSProperties | undefined;
  rowTitle?: string;
  /** Páginas de 100 (listas grandes). */
  paged?: boolean;
}) {
  const firstDirs = useMemo(() => Object.fromEntries(cols.filter((c) => c.firstDir).map((c) => [c.key, c.firstDir!])), [cols]);
  const { sortKey, sortDir, toggleSort } = useSort<string>(defaultSort, defaultDir, firstDirs);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sortKey);
    if (!col?.sort) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    const val = col.sort;
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      const cmp = (typeof va === "string" || typeof vb === "string")
        ? String(va).localeCompare(String(vb)) * dir
        : (va - vb) * dir;
      return cmp || (tieBreak ? tieBreak(a, b) : 0);
    });
  }, [rows, cols, sortKey, sortDir, tieBreak]);

  // Volta à 1ª página quando a lista ou a ordem mudam.
  useEffect(() => { setPage(0); }, [rows, sortKey, sortDir]);
  const totalPages = paged ? Math.max(1, Math.ceil(sorted.length / PAGE_SIZE)) : 1;
  const shown = paged ? sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE) : sorted;

  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <table className="player-list-table" style={{ width: "100%", fontSize: "var(--fs-12)" }}>
          <thead>
            <tr>
              {cols.map((c) => c.sort
                ? <SortableHdr key={c.key} k={c.key} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={c.className} title={c.title}>{c.label}</SortableHdr>
                : <th key={c.key} className={c.className} title={c.title}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={rowKey(r)} className="player-list-row" title={rowTitle}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                style={{ cursor: onRowClick ? "pointer" : undefined, ...rowStyle?.(r) }}>
                {cols.map((c) => <td key={c.key} className={c.tdClassName ?? c.className} style={c.tdStyle}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPage={setPage} />}
    </>
  );
}

/* ── Lista do ranking ───────────────────────────────────────────── */

interface RankedPlayer { id: string; name: string; country: string | null; sex?: "M" | "F" | null }

export function RankingList<P extends RankedPlayer>({ players, title, meta, cols, rowKey, playerHref, defaultSort, defaultDir, tieBreak, sexOptions, initialSex = "", ageGroupOf, isPt }: {
  players: P[];
  title: string;
  /** Na toolbar a seguir ao título (totais, semana, link do site). */
  meta: React.ReactNode;
  cols: RankingCol<P>[];
  rowKey: (p: P) => string;
  playerHref: (p: P) => string;
  defaultSort: string;
  defaultDir: "asc" | "desc";
  tieBreak?: (a: P, b: P) => number;
  /** Opções do filtro de sexo, pela ordem do select. */
  sexOptions: [value: "" | "M" | "F", label: string][];
  initialSex?: "" | "M" | "F";
  /** Escalão do jogador — com ele aparece o filtro de escalão. */
  ageGroupOf?: (p: P) => string | null | undefined;
  isPt: (p: P) => boolean;
}) {
  const navigate = useNavigate();
  const { kidsMap } = useKidsLinkMap();
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [sex, setSex] = useState<"" | "M" | "F">(initialSex);
  const [ptOnly, setPtOnly] = useState(false);

  const countries = useMemo(() => [...new Set(players.map((p) => p.country).filter(Boolean) as string[])].sort(), [players]);
  const ageGroups = useMemo(() => !ageGroupOf ? [] : [...new Set(players.map(ageGroupOf).filter(Boolean) as string[])]
    .sort((a, b) => parseInt(a.replace(/\D/g, "") || "999") - parseInt(b.replace(/\D/g, "") || "999")), [players, ageGroupOf]);

  const filtered = useMemo(() => {
    const nq = norm(q);
    return players.filter((p) =>
      (!ptOnly || isPt(p)) && (!country || p.country === country)
      && (!ageGroup || ageGroupOf?.(p) === ageGroup) && (!sex || p.sex === sex)
      && (!nq || norm(p.name).includes(nq)));
  }, [players, q, country, ageGroup, sex, ptOnly, ageGroupOf, isPt]);

  const sel = { padding: "5px", fontSize: "var(--fs-13)" } as const;
  return (
    <KidsLinkCtx.Provider value={kidsMap}>
      <div style={{ padding: "8px 12px 24px" }}>
        <Toolbar>
          <ToolbarTitle>{title}</ToolbarTitle>
          {meta}
        </Toolbar>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "8px 0 12px" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar nome…"
            style={{ padding: "5px 9px", minWidth: 180, fontSize: "var(--fs-13)" }} />
          <select value={country} onChange={(e) => setCountry(e.target.value)} style={sel}>
            <option value="">Todos os países</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {ageGroupOf && (
            <select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} style={sel}>
              <option value="">Todos os escalões</option>
              {ageGroups.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          <select value={sex} onChange={(e) => setSex(e.target.value as "" | "M" | "F")} style={sel}>
            {sexOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--fs-13)", cursor: "pointer" }}>
            <input type="checkbox" checked={ptOnly} onChange={(e) => setPtOnly(e.target.checked)} />
            {gf("Portugal")} só Portugal
          </label>
          <span style={{ marginLeft: "auto", fontSize: "var(--fs-12)", color: "var(--text-muted)" }}>
            {filtered.length.toLocaleString("pt")} jogadores
          </span>
        </div>

        {filtered.length === 0
          ? <EmptyState icon="🔍" message="Nenhum jogador corresponde aos filtros." />
          : <RankingTable rows={filtered} cols={cols} rowKey={rowKey} defaultSort={defaultSort} defaultDir={defaultDir}
              tieBreak={tieBreak} paged rowTitle="Ver histórico e stats deste jogador"
              onRowClick={(p) => navigate(playerHref(p))}
              rowStyle={(p) => isPt(p) ? { background: "var(--accent-light, rgba(0,120,0,.06))" } : undefined} />}
      </div>
    </KidsLinkCtx.Provider>
  );
}

/** Meta da toolbar: totais ♂/♀, extras e o link do site oficial. */
export function RankingMeta({ totalMen, totalWomen, extra, site, siteLabel, siteTitle }: {
  totalMen: number; totalWomen: number; extra?: React.ReactNode; site: string; siteLabel: string; siteTitle?: string;
}) {
  return (
    <>
      <ToolbarSep />
      <ToolbarMeta>{totalMen.toLocaleString("pt")} ♂ · {totalWomen.toLocaleString("pt")} ♀</ToolbarMeta>
      {extra && <><ToolbarSep /><ToolbarMeta>{extra}</ToolbarMeta></>}
      <ToolbarSep />
      <ToolbarMeta><a href={site} target="_blank" rel="noopener noreferrer" title={siteTitle}>{siteLabel} ↗</a></ToolbarMeta>
    </>
  );
}

/** Coluna Nome: o nome e a seta para a ficha /kids2 (sem disparar o clique da linha). */
export function nameCell(name: string) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {name}
      <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}><KidsLink nome={name} /></span>
    </span>
  );
}

/** Coluna País: bandeira + nome do país. */
export function countryCell(country: string | null) {
  return <span title={country || ""}>{flagOrEmpty(country)} <span style={{ color: "var(--text-muted)", fontSize: "var(--fs-11)" }}>{country}</span></span>;
}

/* ── Detalhe de um jogador ──────────────────────────────────────── */

/** Histórico de eventos de um jogador (ficheiro por URL, entrada por id). */
export function usePlayerEvents<E>(url: string, id: string): E[] | null {
  const [events, setEvents] = useState<E[] | null>(null);
  useEffect(() => {
    let alive = true;
    setEvents(null);
    cachedFetchJson<{ players?: Record<string, E[]> }>(url)
      .then((d) => { if (alive) setEvents(d?.players?.[id] || []); })
      .catch(() => { if (alive) setEvents([]); });
    return () => { alive = false; };
  }, [url, id]);
  return events;
}

export function RankingDetail({ backTo, notFound, header, stats, eventsTitle, events, emptyMessage, children }: {
  backTo: string;
  /** Mensagem quando o jogador não está no ranking (e nada mais se mostra). */
  notFound?: string;
  header?: React.ReactNode;
  stats?: { label: string; value: string; title?: string }[];
  eventsTitle?: string;
  /** null enquanto carrega. */
  events?: unknown[] | null;
  emptyMessage?: string;
  children?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const back = <button className="btn-link" onClick={() => navigate(backTo)} style={{ marginBottom: 8 }}>← Voltar ao ranking</button>;
  if (notFound) return <div style={{ padding: "8px 12px 24px" }}>{back}<EmptyState icon="🔍" message={notFound} /></div>;
  return (
    <div style={{ padding: "8px 12px 24px" }}>
      {back}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 10, marginBottom: 4 }}>{header}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, margin: "8px 0 16px", fontSize: "var(--fs-13)" }}>
        {stats?.map((s) => <Stat key={s.label} {...s} />)}
      </div>
      <h3 style={{ margin: "0 0 6px" }}>{eventsTitle} {events ? `(${events.length})` : ""}</h3>
      {events == null ? <LoadingState message="A carregar histórico…" />
        : events.length === 0 ? <EmptyState icon="📭" message={emptyMessage || "Sem eventos registados."} />
        : children}
    </div>
  );
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div title={title} style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: "var(--fs-11)", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "12px 0", fontSize: "var(--fs-12)" }}>
      <button className="btn-link" disabled={page === 0} onClick={() => onPage(0)}>«</button>
      <button className="btn-link" disabled={page === 0} onClick={() => onPage(page - 1)}>‹</button>
      <span>Página {page + 1} de {totalPages}</span>
      <button className="btn-link" disabled={page >= totalPages - 1} onClick={() => onPage(page + 1)}>›</button>
      <button className="btn-link" disabled={page >= totalPages - 1} onClick={() => onPage(totalPages - 1)}>»</button>
    </div>
  );
}
