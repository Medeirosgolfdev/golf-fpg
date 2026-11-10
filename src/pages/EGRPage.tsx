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
import { flagOrEmpty, isPtCountry } from "../utils/flagUtils";
import { norm, fmtToPar, MONTH_MAP } from "../utils/format";
import SexBadge from "../ui/SexBadge";
import {
  RankingPage, RankingList, RankingMeta, RankingTable, RankingDetail, usePlayerEvents,
  nameCell, countryCell, num, type RankingCol, type RankingPageConfig,
} from "../ui/ranking/RankingPage";
import { buildEgrEntries } from "./egr/egrCircuit";
import { tournamentFamilyKey } from "../ui/circuit/pastEditions";
import { C } from "../utils/colors";
import ExtLink from "../ui/ExternalLink";
import { toParByRounds } from "../data/intlCommon";
import { voltasComCartao } from "../utils/classificacao";

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
/** ±par pelas voltas JOGADAS — regra global (`toParByRounds`): uma volta a 0 não conta («87·0» dava «−57»). */
const toPar = (total: number | null, par: number | null, rounds: number) => toParByRounds(total, par, rounds);
const jogadas = (rounds: (number | null)[]) => voltasComCartao(rounds);
const ageNum = (a: string | null) => { const d = (a || "").replace(/\D/g, ""); return d ? parseInt(d) : null; };
/** Data do EGR («Saturday, 23. May 26») → AAAAMMDD para ordenar; sem data → null.
 *  10/11/2026: ordenava-se com `new Date(texto)`, que só o Chrome entende (no
 *  Safari/Firefox dava «Invalid Date» e a coluna não ordenava). */
function egrDateKey(s: string | null | undefined): number | null {
  const m = /(\d{1,2})\.?\s+([A-Za-zÀ-ÿ]{3})[A-Za-zÀ-ÿ]*\.?\s+(\d{2,4})\b/.exec(s || "");
  if (!m) return null;
  const mes = MONTH_MAP[m[2].toLowerCase()];
  if (mes == null) return null;
  const ano = m[3].length <= 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
  return ano * 10000 + (mes + 1) * 100 + parseInt(m[1], 10);
}

/* ═══════════════════════════════════════════════════════════════ */
const CFG: RankingPageConfig<EgrRanking, Parameters<typeof buildEgrEntries>[0][number]> = {
  base: "/egr",
  name: "EGR",
  rankingUrl: "/data/egr-ranking.json",
  eventsUrl: "/data/egr/egr-events-list.json",
  buildEntries: buildEgrEntries,
  shell: {
    title: "🇪🇺 European Golf Rankings",
    color: C.circuit.egr,
    textColor: "var(--text-on-color)",
    grouping: "year",
    sourceColors: { egr: C.circuit.egrSrc },
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
  { key: "rank", label: "#", title: "Ranking EGR (por sexo)", className: "num", sort: (p) => p.egrRankSex,
    cell: (p) => p.egrRankSex ?? "—", tdClassName: "num u-c-text-muted" },
  { key: "name", label: "Nome", sort: (p) => norm(p.name), firstDir: "asc", cell: (p) => nameCell(p.name), tdClassName: "u-fw-500" },
  { key: "country", label: "País", sort: (p) => norm(p.country || ""), firstDir: "asc", cell: (p) => countryCell(p.country) },
  { key: "sex", label: "Sexo", className: "tight", tdClassName: "", cell: (p) => p.sex ? <SexBadge sex={p.sex} /> : "" },
  { key: "age", label: "Escalão", title: "Escalão actual (não é DOB)", className: "tight", sort: (p) => p.ageNum, firstDir: "asc", cell: (p) => p.ageGroup || "—" },
  { key: "born", label: "Nasc.", title: "Ano de nascimento (via GolfBox — o EGR não expõe DOB)", className: "num", sort: (p) => p.birthYear,
    cell: (p) => <span title={p.birthYear ? "Ano de nascimento via GolfBox" : ""}>{p.birthYear ?? ""}</span> },
  { key: "points", label: "Pontos", title: "Pontos EGR", className: "num", sort: (p) => p.egrPoints, cell: (p) => num(p.egrPoints, 0), tdClassName: "num u-fw-600" },
  { key: "avgScore", label: "Méd.", title: "Média de score", className: "num", sort: (p) => p.avgScore, cell: (p) => num(p.avgScore) },
  { key: "avgToCR", label: "vs CR", title: "Média do score menos o CR do campo (nível normalizado — menor é melhor)", className: "num", sort: (p) => p.avgToCR, cell: (p) => num(p.avgToCR) },
  { key: "events", label: "Ev.", title: "Eventos a contar", className: "num", sort: (p) => p.eventsCounting, cell: (p) => p.eventsCounting ?? "—", tdClassName: "num u-c-text-muted" },
];

function EGRList({ ranking }: { ranking: EgrRanking }) {
  return (
    <RankingList players={ranking.players} title="🇪🇺 European Golf Rankings" cols={LIST_COLS}
      meta={<RankingMeta totalMen={ranking.totalMen} totalWomen={ranking.totalWomen} site={EGR_SITE}
        siteLabel="europeangolfrankings.com" siteTitle="Ranking cross-circuito europeu. Sem data de nascimento (só escalão actual)." />}
      rowKey={(p) => p.id} playerHref={(p) => `/egr/jogador/${p.id}`}
      defaultSort="points" defaultDir="desc"
      sexOptions={[["", "M + F"], ["M", "Rapazes"], ["F", "Raparigas"]]}
      ageGroupOf={(p) => p.ageGroup} isPt={(p) => isPtCountry(p.country)} />
  );
}

/* ── Detalhe (/egr/jogador/:id) ────────────────────────────────── */
const EVENT_COLS: RankingCol<EgrEvent>[] = [
  { key: "date", label: "Data", sort: (e) => egrDateKey(e.date), cell: (e) => e.date || "—", tdClassName: "u-ws-nowrap u-c-text-muted" },
  { key: "event", label: "Evento", sort: (e) => norm(e.name || ""), firstDir: "asc",
    cell: (e) => <ExtLink href={`${EGR_SITE}/events/${e.eventId}`}>{e.name || `Evento ${e.eventId}`}</ExtLink> },
  { key: "country", label: "Local", className: "tight", sort: (e) => norm(e.country || ""), firstDir: "asc", cell: (e) => <span title={e.country || ""}>{flagOrEmpty(e.country)}</span> },
  { key: "age", label: "Escalão", className: "tight", sort: (e) => ageNum(e.ageGroup), firstDir: "asc", cell: (e) => e.ageGroup || "—" },
  { key: "pos", label: "Pos", className: "num", sort: (e) => typeof e.pos === "number" ? e.pos : null, firstDir: "asc", cell: (e) => e.pos ?? "—", tdClassName: "num u-fw-600" },
  { key: "rounds", label: "Rondas", title: "Rondas", className: "tight", cell: (e) => e.rounds.join("·") || "—", tdClassName: "tight u-c-text-muted" },
  { key: "total", label: "Total", className: "num", sort: (e) => e.total, firstDir: "asc", cell: (e) => e.total ?? "—" },
  { key: "toPar", label: "±Par", title: "To par (total − par×rondas)", className: "num", sort: (e) => toPar(e.total, e.par, jogadas(e.rounds)), firstDir: "asc",
    cell: (e) => { const tp = toPar(e.total, e.par, jogadas(e.rounds)); return <span className={tp != null && tp < 0 ? "u-c-score-birdie" : undefined}>{fmtToPar(tp, "")}</span>; } },
  { key: "points", label: "Pts", title: "Pontos EGR", className: "num", sort: (e) => e.egrPoints, cell: (e) => num(e.egrPoints, 0), tdClassName: "num u-c-text-muted" },
];

function EGRDetail({ ranking, id }: { ranking: EgrRanking; id: string }) {
  const player = useMemo(() => ranking.players.find((p) => p.id === id) || null, [ranking, id]);
  const events = usePlayerEvents<EgrEvent>(PLAYER_EVENTS_URL, id);
  const club = useMemo(() => events?.find((e) => e.club)?.club || null, [events]);
  if (!player) return <RankingDetail backTo="/egr/info/jogadores" notFound={`Jogador não encontrado — sem entrada para o id ${id} no ranking EGR.`} />;
  return (
    <RankingDetail backTo="/egr/info/jogadores"
      header={<>
        <h2 className="u-m-0">{flagOrEmpty(player.country)} {player.name}</h2>
        {player.sex && <SexBadge sex={player.sex} />}
        {player.ageGroup && <span className="p p-sm">{player.ageGroup}</span>}
        <ExtLink href={`${EGR_SITE}/players/${id}`} className="u-fs-fs-12">perfil EGR ↗</ExtLink>
      </>}
      stats={[
        { label: "País", value: player.country || "—" },
        ...(player.birthYear ? [{ label: "Nascimento", value: String(player.birthYear), title: "Ano de nascimento via GolfBox (o EGR não expõe DOB)" }] : []),
        ...(club ? [{ label: "Clube", value: club }] : []),
        { label: "Ranking EGR", value: player.egrRankSex != null ? <>#{player.egrRankSex} <SexBadge sex={player.sex === "F" ? "F" : "M"} /></> : "—" },
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
