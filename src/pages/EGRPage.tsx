/**
 * EGRPage.tsx — European Golf Rankings (europeangolfrankings.com).
 *
 * Meta-agregador de eventos juvenis europeus, assente no CircuitShell partilhado
 * (como RFEG/England/GJGL): os EVENTOS EGR são as entries da sidebar (leaderboard
 * de totais via `customResults` + ScorecardLeaderboard, sem scorecards) e o
 * ranking cross-circuito vive como vista "info" (specialItem "jogadores"), igual
 * ao /rfeg/info/jugadores. Filtra-se por escalão (U14…), sexo, ano e INTL.
 *
 * Rotas:
 *   /egr                 → CircuitShell (eventos; auto-selecciona o mais recente)
 *   /egr/evt/:id         → leaderboard de um evento
 *   /egr/info/jogadores  → ranking de jogadores (vista info)
 *   /egr/jogador/:id     → detalhe de um jogador (stats EGR + histórico)
 *
 * Dados:
 *   /data/egr/egr-events-list.json    (índice dos eventos p/ a sidebar — build-egr-events-list.js)
 *   /data/egr/events/egr_{id}.json    (leaderboard de cada evento, lazy ao clicar)
 *   /data/egr-ranking.json            (todos os ~17.900 jogadores M+F)
 *   /data/egr/egr-player-events.json  (rollup jogador→eventos, lazy no 1º detalhe)
 *
 * ⚠ NÃO há DOB — só "Age Group" (escalão actual). ⚠ O Manuel não está no EGR
 * (joga USKids/FPG, não os circuitos WAGR/nacionais que o EGR agrega). É uma
 * base de rivais/descoberta. Ver memória `egr-source`.
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
import { buildEgrEntries, type EgrEventsList } from "./egr/egrCircuit";

const EVENTS_LIST_URL = "/data/egr/egr-events-list.json";

const EGR_SITE = "https://www.europeangolfrankings.com";
const RANKING_URL = "/data/egr-ranking.json";
const PLAYER_EVENTS_URL = "/data/egr/egr-player-events.json";
const PAGE_SIZE = 100;

/* ── Tipos ─────────────────────────────────────────────────────── */
interface EgrPlayer {
  id: string;
  sex: "M" | "F" | null;
  name: string;
  lastName: string;
  firstName: string;
  country: string | null;
  ageGroup: string | null;
  ageNum: number | null;
  egrPoints: number | null;
  egrRankSex: number | null;
  avgScore: number | null;
  avgToCR: number | null;
  eventsCounting: number | null;
  /** Ano de nascimento — o EGR não o expõe; vem do GolfBox via scrape-egr-sources.js. */
  birthYear?: number | null;
  birthYearSource?: string | null;
}
interface EgrRanking {
  generated_at: string;
  totalMen: number;
  totalWomen: number;
  players: EgrPlayer[];
}
interface EgrEvent {
  eventId: string;
  name: string | null;
  date: string | null;
  ageGroup: string | null;
  sex: "M" | "F" | null;
  country: string | null;
  club: string | null;
  cr: number | null;
  par: number | null;
  pos: number | string | null;
  total: number | null;
  rounds: number[];
  egrPoints: number | null;
}
interface EgrPlayerEvents {
  players: Record<string, EgrEvent[]>;
}

/* ── Helpers ───────────────────────────────────────────────────── */
const num = (n: number | null | undefined, d = 2) =>
  n == null || Number.isNaN(n) ? "—" : n.toFixed(d);
const flagOf = (c: string | null) => (c && c !== "Portugal" ? gf(c) : c === "Portugal" ? gf("Portugal") : "");
const toPar = (total: number | null, par: number | null, rounds: number) =>
  total != null && par != null && rounds > 0 ? total - par * rounds : null;
const fmtToPar = (tp: number | null) => (tp == null ? "" : tp === 0 ? "E" : tp > 0 ? `+${tp}` : `${tp}`);

/* ═══════════════════════════════════════════════════════════════ */
export default function EGRPage() {
  const params = useParams<{ source?: string; id?: string }>();
  // Detalhe do jogador (drill-down do ranking), página inteira: /egr/jogador/:id
  if (params.source === "jogador" && params.id) return <EGRRankingRoot playerId={params.id} />;
  // Circuito de EVENTOS no CircuitShell (ranking vive como vista "info").
  return <EGREventsCircuit params={params} />;
}

/** Carrega o ranking (egr-ranking.json) e mostra a tabela de jogadores (vista
 *  "info") ou o detalhe de um jogador. Lazy — só quando se abre o Ranking. */
function EGRRankingRoot({ playerId }: { playerId?: string }) {
  const [ranking, setRanking] = useState<EgrRanking | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    cachedFetchJson<EgrRanking>(RANKING_URL)
      .then((d) => { if (alive) setRanking(d); })
      .catch((e) => { if (alive) setErr(String(e?.message || e)); });
    return () => { alive = false; };
  }, []);
  if (err) return <EmptyState icon="⚠️" message={`Erro ao carregar o ranking EGR: ${err}`} />;
  if (!ranking) return <LoadingState message="A carregar o ranking EGR…" />;
  return playerId ? <EGRDetail ranking={ranking} id={playerId} /> : <EGRList ranking={ranking} />;
}

/** EGRPage assente no CircuitShell partilhado: os EVENTOS EGR são as entries
 *  (leaderboard de totais via customResults) e o ranking é um specialItem
 *  (vista "info"), igual ao /rfeg/info/jugadores. */
function EGREventsCircuit({ params }: { params: { source?: string; id?: string } }) {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<CircuitEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    cachedFetchJson<EgrEventsList>(EVENTS_LIST_URL)
      .then((d) => { if (alive) setEntries(buildEgrEntries(d?.events || [])); })
      .catch((e) => { if (alive) setErr(String(e?.message || e)); });
    return () => { alive = false; };
  }, []);

  // Vista informativa via URL: /egr/info/{key} (deep-linkável). "info" não colide
  // com "evt" (evento) nem "jogador" (detalhe).
  const onInfo = params.source === "info";
  const selectedInfo = onInfo ? (params.id ?? null) : null;
  const selectedId = !onInfo && params.source === "evt" && params.id ? `evt:${params.id}` : undefined;

  const config = useMemo<CircuitConfig>(() => ({
    routeBase: "/egr",
    title: "🇪🇺 European Golf Rankings",
    color: "#1e3a8a",
    textColor: "#fff",
    grouping: "year",
    sourceColors: { egr: "#1e40af" },
    sourceLabels: { egr: "EGR" },
    filters: { search: true, year: true, escalao: true, sex: true, intl: true, toggles: ["pt", "top10", "veteranos"] },
    specialItems: [
      { key: "jogadores", label: "🏅 Ranking de jogadores", render: () => <EGRRankingRoot /> },
    ],
    loadingMessage: "A carregar eventos EGR…",
  }), []);

  if (err) return <EmptyState icon="⚠️" message={`Erro ao carregar os eventos EGR: ${err}`} />;

  return (
    <CircuitShell
      entries={entries || []}
      config={config}
      loading={!entries}
      selectedId={selectedId}
      onSelectEntry={(e) => navigate(`/egr/evt/${e.id.split(":")[1]}`)}
      selectedInfo={selectedInfo}
      onSelectInfo={(key) => navigate(key ? `/egr/info/${key}` : "/egr")}
    />
  );
}

/* ── Vista LISTA (/egr) ────────────────────────────────────────── */
type ListKey = "rank" | "name" | "country" | "age" | "born" | "points" | "avgScore" | "avgToCR" | "events";

function EGRList({ ranking }: { ranking: EgrRanking }) {
  const navigate = useNavigate();
  const { kidsMap } = useKidsLinkMap();
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [sex, setSex] = useState<"" | "M" | "F">("");
  const [ptOnly, setPtOnly] = useState(false);
  const [page, setPage] = useState(0);
  const { sortKey, sortDir, toggleSort } = useSort<ListKey>("points", "desc", {
    name: "asc", country: "asc", age: "asc",
  });

  const countries = useMemo(
    () => Array.from(new Set(ranking.players.map((p) => p.country).filter(Boolean) as string[])).sort(),
    [ranking]
  );
  const ageGroups = useMemo(
    () => Array.from(new Set(ranking.players.map((p) => p.ageGroup).filter(Boolean) as string[]))
      .sort((a, b) => (parseInt(a.replace(/\D/g, "") || "999") - parseInt(b.replace(/\D/g, "") || "999"))),
    [ranking]
  );

  const filtered = useMemo(() => {
    const nq = norm(q);
    let rows = ranking.players.filter((p) => {
      if (ptOnly && p.country !== "Portugal") return false;
      if (country && p.country !== country) return false;
      if (ageGroup && p.ageGroup !== ageGroup) return false;
      if (sex && p.sex !== sex) return false;
      if (nq && !norm(p.name).includes(nq)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (p: EgrPlayer): number | string => {
      switch (sortKey) {
        case "rank": return p.egrRankSex ?? 1e9;
        case "name": return norm(p.name);
        case "country": return norm(p.country || "");
        case "age": return p.ageNum ?? 999;
        case "born": return p.birthYear ?? (sortDir === "asc" ? 9999 : -1);
        case "points": return p.egrPoints ?? -1;
        case "avgScore": return p.avgScore ?? 1e9;
        case "avgToCR": return p.avgToCR ?? 1e9;
        case "events": return p.eventsCounting ?? -1;
      }
    };
    rows = [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "string" || typeof vb === "string")
        return String(va).localeCompare(String(vb)) * dir;
      return (va - vb) * dir;
    });
    return rows;
  }, [ranking, q, country, ageGroup, sex, ptOnly, sortKey, sortDir]);

  // reset página quando os filtros mudam
  useEffect(() => { setPage(0); }, [q, country, ageGroup, sex, ptOnly, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
   <KidsLinkCtx.Provider value={kidsMap}>
    <div style={{ padding: "8px 12px 24px" }}>
      <Toolbar>
        <ToolbarTitle>🇪🇺 European Golf Rankings</ToolbarTitle>
        <ToolbarSep />
        <ToolbarMeta>{ranking.totalMen.toLocaleString("pt")} ♂ · {ranking.totalWomen.toLocaleString("pt")} ♀</ToolbarMeta>
        <ToolbarSep />
        <ToolbarMeta>
          <a href={EGR_SITE} target="_blank" rel="noopener noreferrer" title="Ranking cross-circuito europeu. Sem data de nascimento (só escalão actual).">europeangolfrankings.com ↗</a>
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
        <select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} style={{ padding: "5px", fontSize: "var(--fs-13)" }}>
          <option value="">Todos os escalões</option>
          {ageGroups.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={sex} onChange={(e) => setSex(e.target.value as "" | "M" | "F")} style={{ padding: "5px", fontSize: "var(--fs-13)" }}>
          <option value="">M + F</option>
          <option value="M">♂ Rapazes</option>
          <option value="F">♀ Raparigas</option>
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
                  <SortableHdr k="rank" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Ranking EGR (por sexo)">#</SortableHdr>
                  <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Nome</SortableHdr>
                  <SortableHdr k="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>País</SortableHdr>
                  <th className="tight">Sexo</th>
                  <SortableHdr k="age" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight" title="Escalão actual (não é DOB)">Escalão</SortableHdr>
                  <SortableHdr k="born" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Ano de nascimento (via GolfBox — o EGR não expõe DOB)">Nasc.</SortableHdr>
                  <SortableHdr k="points" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Pontos EGR">Pontos</SortableHdr>
                  <SortableHdr k="avgScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Média de score">Méd.</SortableHdr>
                  <SortableHdr k="avgToCR" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Média do score menos o CR do campo (nível normalizado — menor é melhor)">vs CR</SortableHdr>
                  <SortableHdr k="events" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Eventos a contar">Ev.</SortableHdr>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => {
                  const isPt = p.country === "Portugal";
                  return (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/egr/jogador/${p.id}`)}
                      style={{ cursor: "pointer", background: isPt ? "var(--accent-light, rgba(0,120,0,.06))" : undefined }}
                      className="player-list-row"
                      title="Ver histórico e stats deste jogador"
                    >
                      <td className="num" style={{ color: "var(--text-muted)" }}>{p.egrRankSex ?? "—"}</td>
                      <td style={{ fontWeight: 500 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {p.name}
                          {/* ↗ para a ficha /kids2 (só aparece se o jogador tiver ficha no roster canónico).
                              stopPropagation: não disparar a navegação da linha (→ detalhe EGR). */}
                          <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>
                            <KidsLink nome={p.name} />
                          </span>
                        </span>
                      </td>
                      <td title={p.country || ""}>{flagOf(p.country)} <span style={{ color: "var(--text-muted)", fontSize: "var(--fs-11)" }}>{p.country}</span></td>
                      <td>{p.sex ? <SexBadge sex={p.sex} /> : ""}</td>
                      <td className="tight">{p.ageGroup || "—"}</td>
                      <td className="num" title={p.birthYear ? "Ano de nascimento via GolfBox" : ""}>{p.birthYear ?? ""}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{num(p.egrPoints, 0)}</td>
                      <td className="num">{num(p.avgScore)}</td>
                      <td className="num">{num(p.avgToCR)}</td>
                      <td className="num" style={{ color: "var(--text-muted)" }}>{p.eventsCounting ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPage={setPage} />
          )}
        </>
      )}
    </div>
   </KidsLinkCtx.Provider>
  );
}

/* ── Vista DETALHE (/egr/:id) ──────────────────────────────────── */
type DetKey = "date" | "event" | "age" | "country" | "pos" | "total" | "toPar" | "points";

function EGRDetail({ ranking, id }: { ranking: EgrRanking; id: string }) {
  const navigate = useNavigate();
  const player = useMemo(() => ranking.players.find((p) => p.id === id) || null, [ranking, id]);
  const [events, setEvents] = useState<EgrEvent[] | null>(null);
  const [loadingEv, setLoadingEv] = useState(true);
  const { sortKey, sortDir, toggleSort } = useSort<DetKey>("date", "desc", {
    event: "asc", country: "asc", age: "asc", pos: "asc", total: "asc", toPar: "asc",
  });

  useEffect(() => {
    let alive = true;
    setLoadingEv(true);
    cachedFetchJson<EgrPlayerEvents>(PLAYER_EVENTS_URL)
      .then((d) => { if (alive) setEvents(d?.players?.[id] || []); })
      .catch(() => { if (alive) setEvents([]); })
      .finally(() => { if (alive) setLoadingEv(false); });
    return () => { alive = false; };
  }, [id]);

  const club = useMemo(() => events?.find((e) => e.club)?.club || null, [events]);

  const sortedEvents = useMemo(() => {
    if (!events) return [];
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (e: EgrEvent): number | string => {
      switch (sortKey) {
        case "date": return e.date ? new Date(e.date).getTime() || 0 : 0;
        case "event": return norm(e.name || "");
        case "age": return parseInt((e.ageGroup || "").replace(/\D/g, "") || "999");
        case "country": return norm(e.country || "");
        case "pos": return typeof e.pos === "number" ? e.pos : 9999;
        case "total": return e.total ?? 1e9;
        case "toPar": return toPar(e.total, e.par, e.rounds.length) ?? 1e9;
        case "points": return e.egrPoints ?? -1;
      }
    };
    return [...events].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "string" || typeof vb === "string")
        return String(va).localeCompare(String(vb)) * dir;
      return (va - vb) * dir;
    });
  }, [events, sortKey, sortDir]);

  if (!player) {
    return (
      <div style={{ padding: "8px 12px 24px" }}>
        <button className="btn-link" onClick={() => navigate("/egr/info/jogadores")}>← Voltar ao ranking</button>
        <EmptyState icon="🔍" message={`Jogador não encontrado — sem entrada para o id ${id} no ranking EGR.`} />
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 12px 24px" }}>
      <button className="btn-link" onClick={() => navigate("/egr/info/jogadores")} style={{ marginBottom: 8 }}>← Voltar ao ranking</button>

      {/* Cabeçalho do jogador */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>{flagOf(player.country)} {player.name}</h2>
        {player.sex && <SexBadge sex={player.sex} />}
        {player.ageGroup && <span className="p p-sm">{player.ageGroup}</span>}
        <a href={`${EGR_SITE}/players/${id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--fs-12)" }}>
          perfil EGR ↗
        </a>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, margin: "8px 0 16px", fontSize: "var(--fs-13)" }}>
        <Stat label="País" value={player.country || "—"} />
        {player.birthYear && <Stat label="Nascimento" value={String(player.birthYear)} title="Ano de nascimento via GolfBox (o EGR não expõe DOB)" />}
        {club && <Stat label="Clube" value={club} />}
        <Stat label="Ranking EGR" value={player.egrRankSex != null ? `#${player.egrRankSex} ${player.sex === "F" ? "♀" : "♂"}` : "—"} />
        <Stat label="Pontos" value={num(player.egrPoints, 0)} />
        <Stat label="Média" value={num(player.avgScore)} />
        <Stat label="Média vs CR" value={num(player.avgToCR)} title="Média do score menos o CR do campo (nível normalizado)" />
        <Stat label="Eventos a contar" value={player.eventsCounting != null ? String(player.eventsCounting) : "—"} />
      </div>

      {/* Histórico de eventos */}
      <h3 style={{ margin: "0 0 6px" }}>Eventos juvenis {loadingEv ? "" : `(${sortedEvents.length})`}</h3>
      {loadingEv ? (
        <LoadingState message="A carregar histórico…" />
      ) : sortedEvents.length === 0 ? (
        <EmptyState icon="📭" message="Sem eventos juvenis registados — este jogador pode só ter jogado eventos Adult/U21, fora do âmbito scraped." />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="player-list-table" style={{ width: "100%", fontSize: "var(--fs-12)" }}>
            <thead>
              <tr>
                <SortableHdr k="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Data</SortableHdr>
                <SortableHdr k="event" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Evento</SortableHdr>
                <SortableHdr k="country" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Local</SortableHdr>
                <SortableHdr k="age" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="tight">Escalão</SortableHdr>
                <SortableHdr k="pos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">Pos</SortableHdr>
                <th className="tight" title="Rondas">Rondas</th>
                <SortableHdr k="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num">Total</SortableHdr>
                <SortableHdr k="toPar" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="To par (total − par×rondas)">±Par</SortableHdr>
                <SortableHdr k="points" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="num" title="Pontos EGR">Pts</SortableHdr>
              </tr>
            </thead>
            <tbody>
              {sortedEvents.map((e) => {
                const tp = toPar(e.total, e.par, e.rounds.length);
                return (
                  <tr key={e.eventId} className="player-list-row">
                    <td style={{ whiteSpace: "nowrap", color: "var(--text-muted)" }}>{e.date || "—"}</td>
                    <td>
                      <a href={`${EGR_SITE}/events/${e.eventId}`} target="_blank" rel="noopener noreferrer">{e.name || `Evento ${e.eventId}`}</a>
                    </td>
                    <td className="tight" title={e.country || ""}>{flagOf(e.country)}</td>
                    <td className="tight">{e.ageGroup || "—"}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{e.pos ?? "—"}</td>
                    <td className="tight" style={{ color: "var(--text-muted)" }}>{e.rounds.join("·") || "—"}</td>
                    <td className="num">{e.total ?? "—"}</td>
                    <td className="num" style={{ color: tp != null && tp < 0 ? "var(--score-birdie, #dc2626)" : undefined }}>{fmtToPar(tp)}</td>
                    <td className="num" style={{ color: "var(--text-muted)" }}>{num(e.egrPoints, 0)}</td>
                  </tr>
                );
              })}
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
