/**
 * WAGRPage.tsx — World Amateur Golf Ranking (wagr.com, The R&A + USGA).
 *
 * O ranking amador OFICIAL do mundo, na RankingPage partilhada com o EGR
 * (ui/ranking): os EVENTOS WAGR são as entries do CircuitShell (leaderboard de
 * totais, sem scorecards) e o ranking mundial vive como vista "info". Aqui só
 * a configuração, as colunas e os shards do histórico.
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

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { flagOrEmpty, isPtCountry } from "../utils/flagUtils";
import { norm } from "../utils/format";
import SexBadge from "../ui/SexBadge";
import {
  RankingPage, RankingList, RankingMeta, RankingTable, RankingDetail, usePlayerEvents,
  nameCell, countryCell, num, type RankingCol, type RankingPageConfig,
} from "../ui/ranking/RankingPage";
import { buildWagrEntries, wagrEventUrl, wagrPlayerUrl, WAGR_SITE } from "./wagr/wagrCircuit";
import { tournamentFamilyKey } from "../ui/circuit/pastEditions";

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

/* ── Helpers ───────────────────────────────────────────────────── */
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
const CFG: RankingPageConfig<WagrRanking, Parameters<typeof buildWagrEntries>[0][number]> = {
  base: "/wagr",
  name: "WAGR",
  rankingUrl: "/data/wagr-ranking.json",
  eventsUrl: "/data/wagr/wagr-events-list.json",
  buildEntries: buildWagrEntries,
  shell: {
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
    // «Edições anteriores» (20/10/2026): a mesma prova noutros anos, pelo nome sem
    // ano — a regra da França/Espanha/Global Junior — e do MESMO sexo (rapazes e
    // raparigas são eventos separados com o mesmo nome).
    editionKey: (e) => { const k = tournamentFamilyKey(e.name); return k ? `${k}|${e.sex ?? ""}` : null; },
  },
  rankingLabel: "🏅 Ranking mundial",
  loadingRanking: "A carregar o ranking mundial…",
  List: (r) => <WAGRList ranking={r} />,
  Detail: (r, id) => <WAGRDetail ranking={r} id={id} />,
};

export default function WAGRPage() {
  return <RankingPage cfg={CFG} />;
}

/* ── Lista (ranking mundial) ───────────────────────────────────── */
const LIST_COLS: RankingCol<WagrPlayer>[] = [
  { key: "rank", label: "#", title: "Ranking WAGR (por sexo)", className: "num", sort: (p) => p.rank ?? 1e9, cell: (p) => p.rank ?? "—", tdStyle: { color: "var(--text-muted)" } },
  { key: "change", label: "Var.", title: "Variação face à semana anterior", className: "tight", sort: (p) => p.change ?? 0, firstDir: "desc", cell: (p) => <ChangeCell v={p.change} /> },
  { key: "name", label: "Nome", sort: (p) => norm(p.name), cell: (p) => nameCell(p.name), tdStyle: { fontWeight: 500 } },
  { key: "country", label: "País", sort: (p) => norm(p.country || ""), cell: (p) => countryCell(p.country) },
  { key: "sex", label: "Sexo", className: "tight", tdClassName: "", cell: (p) => <SexBadge sex={p.sex} /> },
  { key: "divisor", label: "Divisor", title: "Divisor aplicado (nº de eventos sobre o qual a média é calculada)", className: "num", sort: (p) => p.divisor ?? 1e9, cell: (p) => num(p.divisor), tdStyle: { color: "var(--text-muted)" } },
  { key: "points", label: "Pts méd.", title: "Pontos médios WAGR", className: "num", sort: (p) => p.pointsAverage ?? -1, firstDir: "desc", cell: (p) => num(p.pointsAverage), tdStyle: { fontWeight: 600 } },
];

function WAGRList({ ranking }: { ranking: WagrRanking }) {
  return (
    <RankingList players={ranking.players} title="🌍 World Amateur Golf Ranking" cols={LIST_COLS}
      meta={<RankingMeta totalMen={ranking.totalMen} totalWomen={ranking.totalWomen} site={WAGR_SITE} siteLabel="wagr.com"
        siteTitle="O ranking amador oficial (The R&A + USGA). Sem data de nascimento nem escalão do jogador."
        extra={ranking.week ? <span title="Semana oficial do ranking">Semana {ranking.week}</span> : undefined} />}
      rowKey={(p) => `${p.sex}-${p.id}`} playerHref={(p) => `/wagr/jogador/${p.id}`}
      defaultSort="rank" defaultDir="asc"
      // Desempate estável: com M+F há dois #1, dois #2… — os pontos médios
      // decidem a ordem dentro do mesmo lugar em vez de ficar ao acaso.
      tieBreak={(a, b) => (b.pointsAverage ?? -1) - (a.pointsAverage ?? -1)}
      // ⚠ Masculino e feminino são DOIS rankings separados (o wagr.com tem duas
      // páginas). Sem filtro, o #1 aparece duas vezes e a lista fica intercalada —
      // por isso abre em Homens, como o site.
      sexOptions={[["M", "♂ Homens"], ["F", "♀ Senhoras"], ["", "M + F (dois rankings juntos)"]]} initialSex="M"
      isPt={(p) => isPtCountry(p.country)} />
  );
}

/* ── Detalhe (/wagr/jogador/:id) ───────────────────────────────── */
function WAGRDetail({ ranking, id }: { ranking: WagrRanking; id: string }) {
  const navigate = useNavigate();
  const player = useMemo(() => ranking.players.find((p) => p.id === id) || null, [ranking, id]);
  const events = usePlayerEvents<WagrPlayerEvent>(playerEventsUrl(id), id);
  const cols = useMemo((): RankingCol<WagrPlayerEvent>[] => [
    { key: "date", label: "Data", sort: (e) => e.date || "", cell: (e) => e.date || "—", tdStyle: { whiteSpace: "nowrap", color: "var(--text-muted)" } },
    { key: "event", label: "Evento", sort: (e) => norm(e.name || ""), firstDir: "asc", cell: (e) => <>
      <a href={wagrEventUrl(e.eventId)} target="_blank" rel="noopener noreferrer">{e.name || `Evento ${e.eventId}`}</a>
      {" "}
      <button className="btn-link" style={{ fontSize: "var(--fs-11)" }} onClick={() => navigate(`/wagr/evt/${e.eventId}`)}
        title="Abrir o leaderboard deste evento no site">↗ leaderboard</button>
    </> },
    { key: "country", label: "Local", className: "tight", sort: (e) => norm(e.country || ""), firstDir: "asc", cell: (e) => <span title={e.country || ""}>{flagOrEmpty(e.country)}</span> },
    { key: "type", label: "Tipo", className: "tight", sort: (e) => norm(e.eventType || ""), firstDir: "asc", cell: (e) => e.eventType || "—" },
    { key: "pos", label: "Pos", className: "num", sort: (e) => typeof e.pos === "number" ? e.pos : 9999, firstDir: "asc", cell: (e) => e.pos ?? "—", tdStyle: { fontWeight: 600 } },
    { key: "rounds", label: "Rondas", title: "Rondas", className: "tight", cell: (e) => e.rounds.join("·") || "—", tdStyle: { color: "var(--text-muted)" } },
    { key: "total", label: "Total", className: "num", sort: (e) => e.total ?? 1e9, firstDir: "asc", cell: (e) => e.total ?? "—" },
    { key: "power", label: "Power", title: "Power do evento (força do campo segundo o WAGR)", className: "num", sort: (e) => e.power ?? -1, cell: (e) => num(e.power, 1), tdStyle: { color: "var(--text-muted)" } },
    { key: "points", label: "Pts", title: "Pontos WAGR ganhos", className: "num", sort: (e) => e.points ?? -1, cell: (e) => num(e.points), tdStyle: { fontWeight: 600 } },
  ], [navigate]);
  if (!player) return <RankingDetail backTo="/wagr/info/jogadores" notFound={`Jogador não encontrado — sem entrada para o id ${id} no ranking WAGR.`} />;
  return (
    <RankingDetail backTo="/wagr/info/jogadores"
      header={<>
        <h2 style={{ margin: 0 }}>{flagOrEmpty(player.country)} {player.name}</h2>
        <SexBadge sex={player.sex} />
        {player.profileLink && (
          <a href={wagrPlayerUrl(player.profileLink)} target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--fs-12)" }}>perfil WAGR ↗</a>
        )}
      </>}
      stats={[
        { label: "País", value: player.country || "—" },
        { label: "Ranking WAGR", value: player.rank != null ? `#${player.rank} ${player.sex === "F" ? "♀" : "♂"}` : "—" },
        { label: "Semana anterior", value: player.rankLastWeek != null ? `#${player.rankLastWeek}` : "—" },
        { label: "Pontos médios", value: num(player.pointsAverage) },
        { label: "Divisor", value: num(player.divisor), title: "Nº de eventos sobre o qual a média é calculada" },
      ]}
      eventsTitle="Eventos" events={events}
      emptyMessage="Sem eventos registados — só aparecem provas dos anos já scrapados.">
      <RankingTable rows={events ?? []} cols={cols} rowKey={(e) => e.eventId} defaultSort="date" defaultDir="desc" />
    </RankingDetail>
  );
}
