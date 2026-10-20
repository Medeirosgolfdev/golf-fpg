/**
 * EGRPage.tsx — European Golf Rankings (europeangolfrankings.com).
 *
 * Meta-agregador de eventos juvenis europeus, na RankingPage partilhada com o
 * WAGR (ui/ranking): os EVENTOS EGR são as entries do CircuitShell (leaderboard
 * de totais, sem scorecards) e o ranking cross-circuito vive como vista "info".
 * Aqui só a configuração e as colunas. Filtra-se por escalão (U14…), sexo, ano e INTL.
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

import { useMemo } from "react";
import { flagOrEmpty } from "../utils/flagUtils";
import { norm, fmtToPar } from "../utils/format";
import SexBadge from "../ui/SexBadge";
import {
  RankingPage, RankingList, RankingMeta, RankingTable, RankingDetail, usePlayerEvents,
  nameCell, countryCell, num, type RankingCol, type RankingPageConfig,
} from "../ui/ranking/RankingPage";
import { buildEgrEntries } from "./egr/egrCircuit";
import { tournamentFamilyKey } from "../ui/circuit/pastEditions";

const EGR_SITE = "https://www.europeangolfrankings.com";
const PLAYER_EVENTS_URL = "/data/egr/egr-player-events.json";

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

/* ── Helpers ───────────────────────────────────────────────────── */
const toPar = (total: number | null, par: number | null, rounds: number) =>
  total != null && par != null && rounds > 0 ? total - par * rounds : null;
const ageNum = (a: string | null) => parseInt((a || "").replace(/\D/g, "") || "999");

/* ═══════════════════════════════════════════════════════════════ */
const CFG: RankingPageConfig<EgrRanking, Parameters<typeof buildEgrEntries>[0][number]> = {
  base: "/egr",
  name: "EGR",
  rankingUrl: "/data/egr-ranking.json",
  eventsUrl: "/data/egr/egr-events-list.json",
  buildEntries: buildEgrEntries,
  shell: {
    title: "🇪🇺 European Golf Rankings",
    color: "#1e3a8a",
    textColor: "#fff",
    grouping: "year",
    sourceColors: { egr: "#1e40af" },
    sourceLabels: { egr: "EGR" },
    filters: { search: true, year: true, escalao: true, sex: true, intl: true, toggles: ["pt", "top10", "veteranos"] },
    // «Edições anteriores» (20/10/2026): a mesma prova noutros anos, pelo nome sem
    // ano — a regra da França/Espanha/Global Junior — e do MESMO sexo (rapazes e
    // raparigas são eventos separados com o mesmo nome).
    editionKey: (e) => { const k = tournamentFamilyKey(e.name); return k ? `${k}|${e.sex ?? ""}` : null; },
  },
  rankingLabel: "🏅 Ranking de jogadores",
  loadingRanking: "A carregar o ranking EGR…",
  List: (r) => <EGRList ranking={r} />,
  Detail: (r, id) => <EGRDetail ranking={r} id={id} />,
};

export default function EGRPage() {
  return <RankingPage cfg={CFG} />;
}

/* ── Lista (/egr/info/jogadores) ───────────────────────────────── */
const LIST_COLS: RankingCol<EgrPlayer>[] = [
  { key: "rank", label: "#", title: "Ranking EGR (por sexo)", className: "num", sort: (p) => p.egrRankSex ?? 1e9,
    cell: (p) => p.egrRankSex ?? "—", tdStyle: { color: "var(--text-muted)" } },
  { key: "name", label: "Nome", sort: (p) => norm(p.name), firstDir: "asc", cell: (p) => nameCell(p.name), tdStyle: { fontWeight: 500 } },
  { key: "country", label: "País", sort: (p) => norm(p.country || ""), firstDir: "asc", cell: (p) => countryCell(p.country) },
  { key: "sex", label: "Sexo", className: "tight", tdClassName: "", cell: (p) => p.sex ? <SexBadge sex={p.sex} /> : "" },
  { key: "age", label: "Escalão", title: "Escalão actual (não é DOB)", className: "tight", sort: (p) => p.ageNum ?? 999, firstDir: "asc", cell: (p) => p.ageGroup || "—" },
  { key: "born", label: "Nasc.", title: "Ano de nascimento (via GolfBox — o EGR não expõe DOB)", className: "num", sort: (p) => p.birthYear ?? -1,
    cell: (p) => <span title={p.birthYear ? "Ano de nascimento via GolfBox" : ""}>{p.birthYear ?? ""}</span> },
  { key: "points", label: "Pontos", title: "Pontos EGR", className: "num", sort: (p) => p.egrPoints ?? -1, cell: (p) => num(p.egrPoints, 0), tdStyle: { fontWeight: 600 } },
  { key: "avgScore", label: "Méd.", title: "Média de score", className: "num", sort: (p) => p.avgScore ?? 1e9, cell: (p) => num(p.avgScore) },
  { key: "avgToCR", label: "vs CR", title: "Média do score menos o CR do campo (nível normalizado — menor é melhor)", className: "num", sort: (p) => p.avgToCR ?? 1e9, cell: (p) => num(p.avgToCR) },
  { key: "events", label: "Ev.", title: "Eventos a contar", className: "num", sort: (p) => p.eventsCounting ?? -1, cell: (p) => p.eventsCounting ?? "—", tdStyle: { color: "var(--text-muted)" } },
];

function EGRList({ ranking }: { ranking: EgrRanking }) {
  return (
    <RankingList players={ranking.players} title="🇪🇺 European Golf Rankings" cols={LIST_COLS}
      meta={<RankingMeta totalMen={ranking.totalMen} totalWomen={ranking.totalWomen} site={EGR_SITE}
        siteLabel="europeangolfrankings.com" siteTitle="Ranking cross-circuito europeu. Sem data de nascimento (só escalão actual)." />}
      rowKey={(p) => p.id} playerHref={(p) => `/egr/jogador/${p.id}`}
      defaultSort="points" defaultDir="desc"
      sexOptions={[["", "M + F"], ["M", "♂ Rapazes"], ["F", "♀ Raparigas"]]}
      ageGroupOf={(p) => p.ageGroup} isPt={(p) => p.country === "Portugal"} />
  );
}

/* ── Detalhe (/egr/jogador/:id) ────────────────────────────────── */
const EVENT_COLS: RankingCol<EgrEvent>[] = [
  { key: "date", label: "Data", sort: (e) => e.date ? new Date(e.date).getTime() || 0 : 0, cell: (e) => e.date || "—", tdStyle: { whiteSpace: "nowrap", color: "var(--text-muted)" } },
  { key: "event", label: "Evento", sort: (e) => norm(e.name || ""), firstDir: "asc",
    cell: (e) => <a href={`${EGR_SITE}/events/${e.eventId}`} target="_blank" rel="noopener noreferrer">{e.name || `Evento ${e.eventId}`}</a> },
  { key: "country", label: "Local", className: "tight", sort: (e) => norm(e.country || ""), firstDir: "asc", cell: (e) => <span title={e.country || ""}>{flagOrEmpty(e.country)}</span> },
  { key: "age", label: "Escalão", className: "tight", sort: (e) => ageNum(e.ageGroup), firstDir: "asc", cell: (e) => e.ageGroup || "—" },
  { key: "pos", label: "Pos", className: "num", sort: (e) => typeof e.pos === "number" ? e.pos : 9999, firstDir: "asc", cell: (e) => e.pos ?? "—", tdStyle: { fontWeight: 600 } },
  { key: "rounds", label: "Rondas", title: "Rondas", className: "tight", cell: (e) => e.rounds.join("·") || "—", tdStyle: { color: "var(--text-muted)" } },
  { key: "total", label: "Total", className: "num", sort: (e) => e.total ?? 1e9, firstDir: "asc", cell: (e) => e.total ?? "—" },
  { key: "toPar", label: "±Par", title: "To par (total − par×rondas)", className: "num", sort: (e) => toPar(e.total, e.par, e.rounds.length) ?? 1e9, firstDir: "asc",
    cell: (e) => { const tp = toPar(e.total, e.par, e.rounds.length); return <span style={{ color: tp != null && tp < 0 ? "var(--score-birdie, #dc2626)" : undefined }}>{fmtToPar(tp, "")}</span>; } },
  { key: "points", label: "Pts", title: "Pontos EGR", className: "num", sort: (e) => e.egrPoints ?? -1, cell: (e) => num(e.egrPoints, 0), tdStyle: { color: "var(--text-muted)" } },
];

function EGRDetail({ ranking, id }: { ranking: EgrRanking; id: string }) {
  const player = useMemo(() => ranking.players.find((p) => p.id === id) || null, [ranking, id]);
  const events = usePlayerEvents<EgrEvent>(PLAYER_EVENTS_URL, id);
  const club = useMemo(() => events?.find((e) => e.club)?.club || null, [events]);
  if (!player) return <RankingDetail backTo="/egr/info/jogadores" notFound={`Jogador não encontrado — sem entrada para o id ${id} no ranking EGR.`} />;
  return (
    <RankingDetail backTo="/egr/info/jogadores"
      header={<>
        <h2 style={{ margin: 0 }}>{flagOrEmpty(player.country)} {player.name}</h2>
        {player.sex && <SexBadge sex={player.sex} />}
        {player.ageGroup && <span className="p p-sm">{player.ageGroup}</span>}
        <a href={`${EGR_SITE}/players/${id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--fs-12)" }}>perfil EGR ↗</a>
      </>}
      stats={[
        { label: "País", value: player.country || "—" },
        ...(player.birthYear ? [{ label: "Nascimento", value: String(player.birthYear), title: "Ano de nascimento via GolfBox (o EGR não expõe DOB)" }] : []),
        ...(club ? [{ label: "Clube", value: club }] : []),
        { label: "Ranking EGR", value: player.egrRankSex != null ? `#${player.egrRankSex} ${player.sex === "F" ? "♀" : "♂"}` : "—" },
        { label: "Pontos", value: num(player.egrPoints, 0) },
        { label: "Média", value: num(player.avgScore) },
        { label: "Média vs CR", value: num(player.avgToCR), title: "Média do score menos o CR do campo (nível normalizado)" },
        { label: "Eventos a contar", value: player.eventsCounting != null ? String(player.eventsCounting) : "—" },
      ]}
      eventsTitle="Eventos juvenis" events={events}
      emptyMessage="Sem eventos juvenis registados — este jogador pode só ter jogado eventos Adult/U21, fora do âmbito scraped.">
      <RankingTable rows={events ?? []} cols={EVENT_COLS} rowKey={(e) => e.eventId} defaultSort="date" defaultDir="desc" />
    </RankingDetail>
  );
}
