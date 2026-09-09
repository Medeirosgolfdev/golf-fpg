/**
 * WAGRPage.tsx — World Amateur Golf Ranking (wagr.com, The R&A + USGA).
 *
 * O ranking amador OFICIAL do mundo, assente no CircuitShell partilhado (como
 * EGR/RFEG/England/GJGL): os EVENTOS WAGR são as entries da sidebar (leaderboard
 * de totais via `customResults`, sem scorecards) e o ranking mundial vive como
 * vista "info" (specialItem "jogadores"), igual ao /egr/info/jogadores.
 * Filtra-se por tipo de evento (Junior, All Ages, Collegiate…), sexo, ano e INTL.
 *
 * Rotas:
 *   /wagr                 → CircuitShell (eventos; auto-selecciona o mais recente)
 *   /wagr/evt/:id         → leaderboard de um evento
 *   /wagr/info/jogadores  → ranking mundial (vista info)
 *   /wagr/jogador/:id     → detalhe de um jogador (stats WAGR + histórico)
 *
 * Dados:
 *   /data/wagr/wagr-events-list.json    (índice dos eventos p/ a sidebar — build-wagr-events-list.js)
 *   /data/wagr/events/wagr_{id}.json    (leaderboard de cada evento, lazy ao clicar)
 *   /data/wagr-ranking.json             (~8.400 jogadores M+F, lazy)
 *   /data/wagr/player-events/wagr-player-events-NN.json (rollup em 16 shards; só
 *                                       o shard do jogador aberto é descarregado)
 *
 * ⚠ NÃO há DOB nem escalão do JOGADOR — o escalão é do EVENTO (`eventType`).
 * ⚠ Os leaderboards são PARCIAIS (só quem pontuou no WAGR).
 * ⚠ O Manuel não está no WAGR (joga USKids/FPG, não provas com pontos WAGR).
 *   É base de rivais/contexto — mas inclui as provas da FPG e o Faldo Madeira.
 *   Ver memória `wagr-source`.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { cachedFetchJson } from "../data/fetchCache";
import { gf } from "../utils/flagUtils";
import { norm } from "../utils/format";
import { useSort } from "../hooks/useSort";
import { useKidsLinkMap } from "../hooks/useKidsLinkMap";
import { KidsLink, KidsLinkCtx } from "../ui/KidsLink";
import SortableHdr from "../ui/SortableHdr";
import SexBadge from "../ui/SexBadge";
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../ui/Toolbar";
import LoadingState from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitConfig, CircuitEntry } from "../ui/circuit/types";
import {
  buildWagrEntries, isPtCountry, wagrEventUrl, wagrPlayerUrl, WAGR_SITE,
  type WagrEventsList,
} from "./wagr/wagrCircuit";

const EVENTS_LIST_URL = "/data/wagr/wagr-events-list.json";
const RANKING_URL = "/data/wagr-ranking.json";
const PAGE_SIZE = 100;

/**
 * Nº de shards do rollup jogador→eventos.
 * ⚠ ESPELHO de `PLAYER_SHARDS` em `scripts/scrape-wagr.js` — se divergirem, o
 * detalhe do jogador procura no shard errado e mostra "sem eventos" em
 * silêncio. Coberto pelo teste `wagr-shard-mirror.test.js`.
 * ⚠ Sharded porque o rollup do mundo inteiro são ~17 MB; ninguém descarrega
 * isso para ver UM jogador.
 */
export const WAGR_PLAYER_SHARDS = 16;
export const wagrShardOf = (playerId: string): number =>
  Number(BigInt(String(playerId).replace(/\D/g, "") || "0") % BigInt(WAGR_PLAYER_SHARDS));
const playerEventsUrl = (playerId: string) =>
  `/data/wagr/player-events/wagr-player-events-${String(wagrShardOf(playerId)).padStart(2, "0")}.json`;

/* ── Tipos ─────────────────────────────────────────────────────── */
interface WagrPlayer {
  id: string;
  sex: "M" | "F";
  name: string;
  firstName: string | null;
  lastName: string | null;
  country: string | null;
  rank: number | null;
  rankLastWeek: number | null;
  change: number | null;
  divisor: number | null;
  pointsAverage: number | null;
  profileLink: string | null;
}
interface WagrRanking {
  generated_at: string;
  /** Semana oficial do ranking, como o site a mostra ("9 SEP 26-36"). */
  week: string | null;
  totalMen: number;
  totalWomen: number;
  players: WagrPlayer[];
}
interface WagrPlayerEvent {
  eventId: string;
  name: string | null;
  date: string | null;
  country: string | null;
  eventType: string | null;
  sex: "M" | "F" | "Mixed" | null;
  power: number | null;
  pos: number | string | null;
  total: number | null;
  rounds: number[];
  points: number | null;
}
interface WagrPlayerEvents { players: Record<string, WagrPlayerEvent[]> }

/* ── Helpers ───────────────────────────────────────────────────── */
const num = (n: number | null | undefined, d = 2) =>
  n == null || Number.isNaN(n) ? "—" : n.toFixed(d);
const flagOf = (c: string | null) => (c ? gf(c) : "");
/** Variação de ranking na semana: positivo = subiu. */
function ChangeCell({ v }: { v: number | null }) {
  if (v == null || v === 0) return <span style={{ color: "var(--text-muted)" }}>–</span>;
  const up = v > 0;
  return (
    <span style={{ color: up ? "var(--score-birdie, #16a34a)" : "var(--score-bogey, #dc2626)" }}>
      {up ? "▲" : "▼"}{Math.abs(v)}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
export default function WAGRPage() {
  const params = useParams<{ source?: string; id?: string }>();
  // Detalhe do jogador (drill-down do ranking), página inteira: /wagr/jogador/:id
  if (params.source === "jogador" && params.id) return <WAGRRankingRoot playerId={params.id} />;
  // Circuito de EVENTOS no CircuitShell (ranking vive como vista "info").
  return <WAGREventsCircuit params={params} />;
}

/** Carrega o ranking (wagr-ranking.json, ~2 MB) e mostra a tabela de jogadores
 *  (vista "info") ou o detalhe de um jogador. Lazy — só ao abrir o Ranking. */
function WAGRRankingRoot({ playerId }: { playerId?: string }) {
  const [ranking, setRanking] = useState<WagrRanking | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    cachedFetchJson<WagrRanking>(RANKING_URL)
      .then((d) => { if (alive) setRanking(d); })
      .catch((e) => { if (alive) setErr(String(e?.message || e)); });
    return () => { alive = false; };
  }, []);
  if (err) return <EmptyState icon="⚠️" message={`Erro ao carregar o ranking WAGR: ${err}`} />;
  if (!ranking) return <LoadingState message="A carregar o ranking mundial…" />;
  return playerId ? <WAGRDetail ranking={ranking} id={playerId} /> : <WAGRList ranking={ranking} />;
}

/** WAGRPage assente no CircuitShell partilhado: os EVENTOS são as entries e o
 *  ranking é um specialItem (vista "info"), igual ao /egr/info/jogadores. */
function WAGREventsCircuit({ params }: { params: { source?: string; id?: string } }) {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<CircuitEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    cachedFetchJson<WagrEventsList>(EVENTS_LIST_URL)
      .then((d) => { if (alive) setEntries(buildWagrEntries(d?.events || [])); })
      .catch((e) => { if (alive) setErr(String(e?.message || e)); });
    return () => { alive = false; };
  }, []);

  // Vista informativa via URL: /wagr/info/{key} (deep-linkável). "info" não
  // colide com "evt" (evento) nem "jogador" (detalhe).
  const onInfo = params.source === "info";
  const selectedInfo = onInfo ? (params.id ?? null) : null;
  const selectedId = !onInfo && params.source === "evt" && params.id ? `evt:${params.id}` : undefined;

  const config = useMemo<CircuitConfig>(() => ({
    routeBase: "/wagr",
    title: "🌍 World Amateur Golf Ranking",
    color: "#0f3d2e",
    textColor: "#fff",
    grouping: "month-year",   // ~4.000 eventos por ano — o mês é a granularidade útil
    sourceColors: { wagr: "#0f3d2e" },
    sourceLabels: { wagr: "WAGR" },
    // ⚠ `defaultYear: "current"` não é gosto, é custo de render: são ~4.000
    // eventos POR ANO (o mundo inteiro) e a sidebar do shell desenha todas as
    // entradas. Sem isto, montar a página ou limpar um filtro custava segundos.
    // Os anos anteriores continuam a um clique nas pills, e os deep-links
    // /wagr/evt/{id} de qualquer ano continuam a abrir.
    filters: { search: true, year: true, escalao: true, sex: true, intl: true, defaultYear: "current", toggles: ["pt", "top10"] },
    specialItems: [
      { key: "jogadores", label: "🏅 Ranking mundial", render: () => <WAGRRankingRoot /> },
    ],
    loadingMessage: "A carregar eventos WAGR…",
  }), []);

  if (err) return <EmptyState icon="⚠️" message={`Erro ao carregar os eventos WAGR: ${err}`} />;

  return (
    <CircuitShell
      entries={entries || []}
      config={config}
      loading={!entries}
      selectedId={selectedId}
      onSelectEntry={(e) => navigate(`/wagr/evt/${e.id.split(":")[1]}`)}
      selectedInfo={selectedInfo}
      onSelectInfo={(key) => navigate(key ? `/wagr/info/${key}` : "/wagr")}
    />
  );
}

/* ── Vista LISTA (ranking mundial) ─────────────────────────────── */
type ListKey = "rank" | "change" | "name" | "country" | "divisor" | "points";

function WAGRList({ ranking }: { ranking: WagrRanking }) {
  const navigate = useNavigate();
  const { kidsMap } = useKidsLinkMap();
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  // ⚠ Masculino e feminino são DOIS rankings separados (o wagr.com tem duas
  // páginas). Sem filtro, o #1 aparece duas vezes e a lista fica intercalada —
  // por isso abre em Homens, como o site.
  const [sex, setSex] = useState<"" | "M" | "F">("M");
  const [ptOnly, setPtOnly] = useState(false);
  const [page, setPage] = useState(0);
  const { sortKey, sortDir, toggleSort } = useSort<ListKey>("rank", "asc", {
    points: "desc", change: "desc",
  });

  const countries = useMemo(
    () => Array.from(new Set(ranking.players.map((p) => p.country).filter(Boolean) as string[])).sort(),
    [ranking]
  );

  const filtered = useMemo(() => {
    const nq = norm(q);
    const rows = ranking.players.filter((p) => {
      if (ptOnly && !isPtCountry(p.country)) return false;
      if (country && p.country !== country) return false;
      if (sex && p.sex !== sex) return false;
      if (nq && !norm(p.name).includes(nq)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (p: WagrPlayer): number | string => {
      switch (sortKey) {
        case "rank": return p.rank ?? 1e9;
        case "change": return p.change ?? 0;
        case "name": return norm(p.name);
        case "country": return norm(p.country || "");
        case "divisor": return p.divisor ?? 1e9;
        case "points": return p.pointsAverage ?? -1;
      }
    };
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      const cmp = (typeof va === "string" || typeof vb === "string")
        ? String(va).localeCompare(String(vb)) * dir
        : (va - vb) * dir;
      // Desempate estável: com M+F há dois #1, dois #2… — os pontos médios
      // decidem a ordem dentro do mesmo lugar em vez de ficar ao acaso.
      return cmp || (b.pointsAverage ?? -1) - (a.pointsAverage ?? -1);
    });
  }, [ranking, q, country, sex, ptOnly, sortKey, sortDir]);

  // reset página quando os filtros mudam
  useEffect(() => { setPage(0); }, [q, country, sex, ptOnly, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
   <KidsLinkCtx.Provider value={kidsMap}>
    <div style={{ padding: "8px 12px 24px" }}>
      <Toolbar>
        <ToolbarTitle>🌍 World Amateur Golf Ranking</ToolbarTitle>
        <ToolbarSep />
        <ToolbarMeta>{ranking.totalMen.toLocaleString("pt")} ♂ · {ranking.totalWomen.toLocaleString("pt")} ♀</ToolbarMeta>
        {ranking.week && <><ToolbarSep /><ToolbarMeta><span title="Semana oficial do ranking">Semana {ranking.week}</span></ToolbarMeta></>}
        <ToolbarSep />
        <ToolbarMeta>
          <a href={WAGR_SITE} target="_blank" rel="noopener noreferrer" title="O ranking amador oficial (The R&A + USGA). Sem data de nascimento nem escalão do jogador.">wagr.com ↗</a>
        </ToolbarMeta>
      </Toolbar>

      {/* Filtros */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "8px 0 12px" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pesquisar nome…"
          style={{ padding: "5px 9px", minWidth: 180, fontSize: "var(--fs-13)" }}
        />
        <select value={country} onChange={(e) => setCountry(e.target.value)} style={{ padding: "5px", fontSize: "var(--fs-13)" }}>
          <option value="">Todos os países</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sex} onChange={(e) => setSex(e.target.value as "" | "M" | "F")} style={{ padding: "5px", fontSize: "var(--fs-13)" }}>
          <option value="M">♂ Homens</option>
          <option value="F">♀ Senhoras</option>
          <option value="">M + F (dois rankings juntos)</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--fs-13)", cursor: "pointer" }}>
          <input type="checkbox" checked={ptOnly} onChange={(e) => setPtOnly(e.target.checked)} />
          {gf("Portugal")} só Portugal
        </label>
        <span style={{ marginLeft: "auto", fontSize: "var(--fs-12)", color: "var(--text-muted)" }}>
          {filtered.length.toLocaleString("pt")} jogadores
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="🔍" message="Nenhum jogador corresponde aos filtros." />
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="player-list-table" style={{ width: "100%", fontSize: "var(--fs-12)" }}>
              <thead>
                <tr>
                  <SortableHdr k="rank" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Ranking WAGR (por sexo)">#</SortableHdr>
                  <SortableHdr k="change" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight" title="Variação face à semana anterior">Var.</SortableHdr>
                  <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Nome</SortableHdr>
                  <SortableHdr k="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>País</SortableHdr>
                  <th className="tight">Sexo</th>
                  <SortableHdr k="divisor" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Divisor aplicado (nº de eventos sobre o qual a média é calculada)">Divisor</SortableHdr>
                  <SortableHdr k="points" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Pontos médios WAGR">Pts méd.</SortableHdr>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => {
                  const isPt = isPtCountry(p.country);
                  return (
                    <tr
                      key={`${p.sex}-${p.id}`}
                      onClick={() => navigate(`/wagr/jogador/${p.id}`)}
                      style={{ cursor: "pointer", background: isPt ? "var(--accent-light, rgba(0,120,0,.06))" : undefined }}
                      className="player-list-row"
                      title="Ver histórico e stats deste jogador"
                    >
                      <td className="num" style={{ color: "var(--text-muted)" }}>{p.rank ?? "—"}</td>
                      <td className="tight"><ChangeCell v={p.change} /></td>
                      <td style={{ fontWeight: 500 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {p.name}
                          {/* ↗ para a ficha /kids2 (só se houver ficha no roster canónico).
                              stopPropagation: não disparar a navegação da linha. */}
                          <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>
                            <KidsLink nome={p.name} />
                          </span>
                        </span>
                      </td>
                      <td title={p.country || ""}>{flagOf(p.country)} <span style={{ color: "var(--text-muted)", fontSize: "var(--fs-11)" }}>{p.country}</span></td>
                      <td><SexBadge sex={p.sex} /></td>
                      <td className="num" style={{ color: "var(--text-muted)" }}>{num(p.divisor)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{num(p.pointsAverage)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPage={setPage} />}
        </>
      )}
    </div>
   </KidsLinkCtx.Provider>
  );
}

/* ── Vista DETALHE (/wagr/jogador/:id) ─────────────────────────── */
type DetKey = "date" | "event" | "country" | "type" | "pos" | "total" | "points" | "power";

function WAGRDetail({ ranking, id }: { ranking: WagrRanking; id: string }) {
  const navigate = useNavigate();
  const player = useMemo(() => ranking.players.find((p) => p.id === id) || null, [ranking, id]);
  const [events, setEvents] = useState<WagrPlayerEvent[] | null>(null);
  const [loadingEv, setLoadingEv] = useState(true);
  const { sortKey, sortDir, toggleSort } = useSort<DetKey>("date", "desc", {
    event: "asc", country: "asc", type: "asc", pos: "asc", total: "asc",
  });

  useEffect(() => {
    let alive = true;
    setLoadingEv(true);
    cachedFetchJson<WagrPlayerEvents>(playerEventsUrl(id))
      .then((d) => { if (alive) setEvents(d?.players?.[id] || []); })
      .catch(() => { if (alive) setEvents([]); })
      .finally(() => { if (alive) setLoadingEv(false); });
    return () => { alive = false; };
  }, [id]);

  const sortedEvents = useMemo(() => {
    if (!events) return [];
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (e: WagrPlayerEvent): number | string => {
      switch (sortKey) {
        case "date": return e.date || "";
        case "event": return norm(e.name || "");
        case "country": return norm(e.country || "");
        case "type": return norm(e.eventType || "");
        case "pos": return typeof e.pos === "number" ? e.pos : 9999;
        case "total": return e.total ?? 1e9;
        case "points": return e.points ?? -1;
        case "power": return e.power ?? -1;
      }
    };
    return [...events].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb)) * dir;
      return (va - vb) * dir;
    });
  }, [events, sortKey, sortDir]);

  if (!player) {
    return (
      <div style={{ padding: "8px 12px 24px" }}>
        <button className="btn-link" onClick={() => navigate("/wagr/info/jogadores")}>← Voltar ao ranking</button>
        <EmptyState icon="🔍" message={`Jogador não encontrado — sem entrada para o id ${id} no ranking WAGR.`} />
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 12px 24px" }}>
      <button className="btn-link" onClick={() => navigate("/wagr/info/jogadores")} style={{ marginBottom: 8 }}>← Voltar ao ranking</button>

      {/* Cabeçalho do jogador */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>{flagOf(player.country)} {player.name}</h2>
        <SexBadge sex={player.sex} />
        {player.profileLink && (
          <a href={wagrPlayerUrl(player.profileLink)} target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--fs-12)" }}>
            perfil WAGR ↗
          </a>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, margin: "8px 0 16px", fontSize: "var(--fs-13)" }}>
        <Stat label="País" value={player.country || "—"} />
        <Stat label="Ranking WAGR" value={player.rank != null ? `#${player.rank} ${player.sex === "F" ? "♀" : "♂"}` : "—"} />
        <Stat label="Semana anterior" value={player.rankLastWeek != null ? `#${player.rankLastWeek}` : "—"} />
        <Stat label="Pontos médios" value={num(player.pointsAverage)} />
        <Stat label="Divisor" value={num(player.divisor)} title="Nº de eventos sobre o qual a média é calculada" />
      </div>

      {/* Histórico de eventos */}
      <h3 style={{ margin: "0 0 6px" }}>Eventos {loadingEv ? "" : `(${sortedEvents.length})`}</h3>
      {loadingEv ? (
        <LoadingState message="A carregar histórico…" />
      ) : sortedEvents.length === 0 ? (
        <EmptyState icon="📭" message="Sem eventos registados — só aparecem provas dos anos já scrapados." />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="player-list-table" style={{ width: "100%", fontSize: "var(--fs-12)" }}>
            <thead>
              <tr>
                <SortableHdr k="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Data</SortableHdr>
                <SortableHdr k="event" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Evento</SortableHdr>
                <SortableHdr k="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Local</SortableHdr>
                <SortableHdr k="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Tipo</SortableHdr>
                <SortableHdr k="pos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">Pos</SortableHdr>
                <th className="tight" title="Rondas">Rondas</th>
                <SortableHdr k="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">Total</SortableHdr>
                <SortableHdr k="power" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Power do evento (força do campo segundo o WAGR)">Power</SortableHdr>
                <SortableHdr k="points" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Pontos WAGR ganhos">Pts</SortableHdr>
              </tr>
            </thead>
            <tbody>
              {sortedEvents.map((e) => (
                <tr key={e.eventId} className="player-list-row">
                  <td style={{ whiteSpace: "nowrap", color: "var(--text-muted)" }}>{e.date || "—"}</td>
                  <td>
                    <a href={wagrEventUrl(e.eventId)} target="_blank" rel="noopener noreferrer">{e.name || `Evento ${e.eventId}`}</a>
                    {" "}
                    <button
                      className="btn-link"
                      style={{ fontSize: "var(--fs-11)" }}
                      onClick={() => navigate(`/wagr/evt/${e.eventId}`)}
                      title="Abrir o leaderboard deste evento no site"
                    >↗ leaderboard</button>
                  </td>
                  <td className="tight" title={e.country || ""}>{flagOf(e.country)}</td>
                  <td className="tight">{e.eventType || "—"}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{e.pos ?? "—"}</td>
                  <td className="tight" style={{ color: "var(--text-muted)" }}>{e.rounds.join("·") || "—"}</td>
                  <td className="num">{e.total ?? "—"}</td>
                  <td className="num" style={{ color: "var(--text-muted)" }}>{num(e.power, 1)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{num(e.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Componentes auxiliares ────────────────────────────────────── */
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
