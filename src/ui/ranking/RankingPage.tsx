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
import React, { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import SexBadge from "../SexBadge";
import { useJson } from "../../hooks/useJson";
import { gf, flagOrEmpty } from "../../utils/flagUtils";
import { norm } from "../../utils/format";
import { useSort, compareValuesNullsLast } from "../../hooks/useSort";
import { useKidsLinkMap } from "../../hooks/useKidsLinkMap";
import { KidsLink, KidsLinkCtx } from "../KidsLink";
import SortableHdr from "../SortableHdr";
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../Toolbar";
import LoadingState from "../LoadingState";
import EmptyState from "../EmptyState";
import CircuitShell from "../circuit/CircuitShell";
import type { CircuitConfig, CircuitEntry } from "../circuit/types";
import { circuitRanking } from "../circuit/CircuitRanking";
import ExtLink from "../ExternalLink";
import Pager from "../Pager";
import { usePaged } from "../../hooks/usePaged";
import ErrorState from "../ErrorState";
import Select from "../Select";

import SectionTitle from "../SectionTitle";
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
  /** Configuração do CircuitShell (sem routeBase/ranking/loadingMessage). */
  shell: Omit<CircuitConfig, "routeBase" | "ranking" | "loadingMessage">;
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
  const { data: ranking, error: err } = useJson<R>(cfg.rankingUrl);
  if (err) return <ErrorState message={`Erro ao carregar o ranking ${cfg.name}`} detail={err} />;
  if (!ranking) return <LoadingState message={cfg.loadingRanking} />;
  return <>{playerId ? cfg.Detail(ranking, playerId) : cfg.List(ranking)}</>;
}

/** Os EVENTOS são as entries do CircuitShell; o ranking é a vista "info" "jogadores". */
function EventsCircuit<R, E>({ cfg, params }: { cfg: RankingPageConfig<R, E>; params: { source?: string; id?: string } }) {
  const navigate = useNavigate();
  const { data: evFile, loading, error: err } = useJson<{ events?: E[] }>(cfg.eventsUrl);
  const entries = useMemo<CircuitEntry[] | null>(
    () => (loading || err ? null : cfg.buildEntries(evFile?.events || [])),
    [evFile, loading, err, cfg],
  );

  // "info" não colide com "evt" (evento) nem "jogador" (detalhe).
  const onInfo = params.source === "info";
  const selectedInfo = onInfo ? (params.id ?? null) : null;
  const selectedId = !onInfo && params.source === "evt" && params.id ? `evt:${params.id}` : undefined;

  const config = useMemo<CircuitConfig>(() => ({
    ...cfg.shell,
    routeBase: cfg.base,
    // A lista do ranking é a capacidade `ranking` do shell (no menu Info, como
    // sempre); o conteúdo é o próprio, com os filtros dela.
    ranking: circuitRanking({ key: "jogadores", label: cfg.rankingLabel, inInfoMenu: true, render: () => <RankingRoot cfg={cfg} /> }),
    loadingMessage: `A carregar eventos ${cfg.name}…`,
  }), [cfg]);

  if (err) return <ErrorState message={`Erro ao carregar os eventos ${cfg.name}`} detail={err} />;
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
  /** Valor de ordenação; sem ele, o cabeçalho não ordena. Vazio (null/NaN/"")
   *  fica sempre no fim, nas duas direcções. */
  sort?: (r: T) => number | string | null | undefined;
  /** Sentido do 1º clique (default: o da tabela). */
  firstDir?: "asc" | "desc";
  cell: (r: T) => React.ReactNode;
  /** Classe do <td> (substitui a `className` da coluna nas células). */
  tdClassName?: string;
}

export function RankingTable<T>({ rows, cols, rowKey, defaultSort, defaultDir, tieBreak, onRowClick, rowClassName, rowTitle, paged }: {
  rows: T[];
  cols: RankingCol<T>[];
  rowKey: (r: T) => string;
  defaultSort: string;
  defaultDir: "asc" | "desc";
  /** Desempate quando o valor da coluna é igual. */
  tieBreak?: (a: T, b: T) => number;
  onRowClick?: (r: T) => void;
  /** Classes extra da linha (ex.: `row-manuel`, `row-selected`). */
  rowClassName?: (r: T) => string | undefined;
  rowTitle?: string;
  /** Páginas de 100 (listas grandes). */
  paged?: boolean;
}) {
  const firstDirs = useMemo(() => Object.fromEntries(cols.filter((c) => c.firstDir).map((c) => [c.key, c.firstDir!])), [cols]);
  const { sortKey, sortDir, toggleSort } = useSort<string>(defaultSort, defaultDir, firstDirs);
  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sortKey);
    if (!col?.sort) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    const val = col.sort;
    return [...rows].sort((a, b) => {
      const cmp = compareValuesNullsLast(val(a), val(b), dir);
      return cmp || (tieBreak ? tieBreak(a, b) : 0);
    });
  }, [rows, cols, sortKey, sortDir, tieBreak]);

  // Volta à 1.ª página quando a lista ou a ordem mudam (sorted muda nos dois casos).
  const { page, setPage, totalPages, pageRows: shown } = usePaged(sorted, sorted, paged ? PAGE_SIZE : Math.max(1, sorted.length));

  return (
    <>
      <div className="u-ox-auto">
        <table className="dtable player-list-table u-w-100pc u-fs-fs-12">
          <thead>
            <tr>
              {cols.map((c) => c.sort
                ? <SortableHdr key={c.key} k={c.key} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={c.className} title={c.title}>{c.label}</SortableHdr>
                : <th key={c.key} className={c.className} title={c.title}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={rowKey(r)} className={"player-list-row" + (onRowClick ? " u-cur-pointer" : "") + (rowClassName?.(r) ? " " + rowClassName(r) : "")} title={rowTitle}
                onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {cols.map((c) => <td key={c.key} className={c.tdClassName ?? c.className}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} totalPages={totalPages} onPage={setPage} />
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

  return (
    <KidsLinkCtx.Provider value={kidsMap}>
      <div className="u-p-8px-12px-24px">
        <Toolbar>
          <ToolbarTitle>{title}</ToolbarTitle>
          {meta}
        </Toolbar>

        <div className="u-d-flex u-fwr-wrap u-gap-8px u-ai-center u-m-8px-0-12px">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar nome…"
            className="u-p-4px-8px u-minw-180px u-fs-fs-13" />
          <Select value={country} onChange={setCountry}>
            <option value="">Todos os países</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          {ageGroupOf && (
            <Select value={ageGroup} onChange={setAgeGroup}>
              <option value="">Todos os escalões</option>
              {ageGroups.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          )}
          <Select value={sex} onChange={(v) => setSex(v as "" | "M" | "F")}>
            {sexOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <label className="u-d-flex u-ai-center u-gap-4px u-fs-fs-13 u-cur-pointer">
            <input type="checkbox" checked={ptOnly} onChange={(e) => setPtOnly(e.target.checked)} />
            {gf("Portugal")} só Portugal
          </label>
          <span className="u-ml-auto u-fs-fs-12 u-c-text-muted">
            {filtered.length.toLocaleString("pt")} jogadores
          </span>
        </div>

        {filtered.length === 0
          ? <EmptyState icon="🔍" message="Nenhum jogador corresponde aos filtros." />
          : <RankingTable rows={filtered} cols={cols} rowKey={rowKey} defaultSort={defaultSort} defaultDir={defaultDir}
              tieBreak={tieBreak} paged rowTitle="Ver histórico e stats deste jogador"
              onRowClick={(p) => navigate(playerHref(p))}
              rowClassName={(p) => isPt(p) ? "u-bg-accent-light" : undefined} />}
      </div>
    </KidsLinkCtx.Provider>
  );
}

/** Meta da toolbar: totais por sexo, extras e o link do site oficial. */
export function RankingMeta({ totalMen, totalWomen, extra, site, siteLabel, siteTitle }: {
  totalMen: number; totalWomen: number; extra?: React.ReactNode; site: string; siteLabel: string; siteTitle?: string;
}) {
  return (
    <>
      <ToolbarSep />
      <ToolbarMeta>{totalMen.toLocaleString("pt")} <SexBadge sex="M" /> · {totalWomen.toLocaleString("pt")} <SexBadge sex="F" /></ToolbarMeta>
      {extra && <><ToolbarSep /><ToolbarMeta>{extra}</ToolbarMeta></>}
      <ToolbarSep />
      <ToolbarMeta><ExtLink href={site} title={siteTitle}>{siteLabel} ↗</ExtLink></ToolbarMeta>
    </>
  );
}

/** Coluna Nome: o nome e a seta para a ficha /kids2 (sem disparar o clique da linha). */
export function nameCell(name: string) {
  return (
    <span className="u-d-inline-flex u-ai-center u-gap-4px">
      {name}
      <span onClick={(e) => e.stopPropagation()} className="u-d-inline-flex"><KidsLink nome={name} /></span>
    </span>
  );
}

/** Coluna País: bandeira + nome do país. */
export function countryCell(country: string | null) {
  return <span title={country || ""}>{flagOrEmpty(country)} <span className="u-c-text-muted u-fs-fs-11">{country}</span></span>;
}

/* ── Detalhe de um jogador ──────────────────────────────────────── */

/** Histórico de eventos de um jogador (ficheiro por URL, entrada por id). */
export function usePlayerEvents<E>(url: string, id: string): E[] | null {
  const { data, loading } = useJson<{ players?: Record<string, E[]> }>(url);
  return useMemo(() => (loading ? null : data?.players?.[id] || []), [data, loading, id]);
}

export function RankingDetail({ backTo, notFound, header, stats, eventsTitle, events, emptyMessage, children }: {
  backTo: string;
  /** Mensagem quando o jogador não está no ranking (e nada mais se mostra). */
  notFound?: string;
  header?: React.ReactNode;
  stats?: { label: string; value: React.ReactNode; title?: string }[];
  eventsTitle?: string;
  /** null enquanto carrega. */
  events?: unknown[] | null;
  emptyMessage?: string;
  children?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const back = <button className="btn-link u-mb-8px" onClick={() => navigate(backTo)}>← Voltar ao ranking</button>;
  if (notFound) return <div className="u-p-8px-12px-24px">{back}<EmptyState icon="🔍" message={notFound} /></div>;
  return (
    <div className="u-p-8px-12px-24px">
      {back}
      <div className="u-d-flex u-fwr-wrap u-ai-baseline u-gap-10px u-mb-4px">{header}</div>
      <div className="u-d-flex u-fwr-wrap u-gap-16px u-m-8px-0-16px u-fs-fs-13">
        {stats?.map((s) => <Stat key={s.label} {...s} />)}
      </div>
      <SectionTitle size="md">{eventsTitle} {events ? `(${events.length})` : ""}</SectionTitle>
      {events == null ? <LoadingState message="A carregar histórico…" />
        : events.length === 0 ? <EmptyState icon="📭" message={emptyMessage || "Sem eventos registados."} />
        : children}
    </div>
  );
}

function Stat({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div title={title} className="u-d-flex u-fd-column">
      <span className="u-fs-fs-11 u-c-text-muted">{label}</span>
      <span className="u-fw-600">{value}</span>
    </div>
  );
}

