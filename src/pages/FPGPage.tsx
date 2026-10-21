// @refresh reset
/**
 * FPGPage.tsx — /FPG: torneios da federação portuguesa
 *
 * Vistas: Torneios (Todos / Jovens / Clubes / STO / PJA), Ranking PJA,
 * Ranking Sub-12 e Classificações. O torneio seleccionado sai do URL (`tkey`).
 *
 * Dados e contas fora da página:
 *   - src/data/fpgPageLoader.ts     — loaders (hooks) e listas derivadas
 *   - src/data/fpgRankingsLoader.ts — Ranking Sub-12 e Classificações
 *   - src/data/clubesFormats.ts     — formatos de equipa, match play, lista de Clubes
 */
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { SIDEBAR_ACCENT, EscPill, PillBadge } from "../ui/PillBadge";
import { TournSidebarItem, SSERRA_CCODE, type SidebarItemTournament } from "../ui/TournSidebarItem";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar, ToolbarTitle, ToolbarSep } from "../ui/Toolbar";
import { CircuitToolbarSlotCtx } from "../ui/circuit/toolbarSlot";
import ExtLink from "../ui/ExternalLink";
import LoadingState from "../ui/LoadingState";
import { useMasterDetail } from "../hooks/useMasterDetail";
import { tournamentUrl, parseTournKey, fmtDateShort } from "../utils/format";
import { PJARankingView } from "../ui/PJARankingView";
import ClubesGruposView from "../ui/ClubesGruposView";
import ClubesCategoriasView from "../ui/ClubesCategoriasView";
import TournExtLinks from "../ui/TournExtLinks";
// Tipos e utilitários FPG — fonte canónica em ../data/fpgTypes.ts e ../data/fpgUtils.ts
import type { Tournament } from "../data/fpgTypes";
import { buildDisplayList, tournamentHasManuel, isDriveOrAquapor, normSearchTerm } from "../data/fpgUtils";
import {
  useFpgPlayersDB, useFpgMainData, useFpgJovensData, useFpgPjaExtra,
  dedupDisplayTournaments, jovensCandidates, selectJovens, buildTcodePills,
} from "../data/fpgPageLoader";
import { useLazyRanking, SUB12_RANKING_URL, CLASSIFICACOES_URL } from "../data/fpgRankingsLoader";
import {
  autoGruposByClub, clubesFormatOf, clubesIndividualTournament,
  isClubesMatchPlay, selectClubesList,
} from "../data/clubesFormats";
import { clubesMatchplayToFile, clubesTeamPoints } from "../data/clubesMatchplayAdapter";
import MatchplayView from "../ui/circuit/MatchplayView";
import TeamPointsStandings from "../ui/circuit/TeamPointsStandings";
import { isDNS } from "../ui/driveUtils";
import { InscricoesPanel, buildJovensGroups, buildEventGroups, type JovensGroup, type EventGroup } from "../ui/InscricoesComponents";
import { DataSourcesChip, DataSourcesProvider, type DataSource } from "../ui/DataSources";
// Re-exports para consumidores que ainda importam de FPGPage
export type { RoundScore, Player, Tournament, ScorecardOptions } from "../data/fpgTypes";
export { expandMultiRound } from "../data/fpgUtils";
export { ScorecardLB, AccumulatedLB, AllRoundsScorecardLB } from "../ui/LeaderboardComponents";
export { TournamentDetail } from "./fpg/TournamentDetail";

import { PRE_2020_KEY, TOURN_PILLS } from "./fpg/constants";
import { isPJACore } from "../../ranking-pja/pja-rules.mjs";
import {
  type SeriesKey, URL_TO_FILTER, URL_TO_NAV, NAV_TO_URL, FILTER_TO_URL, INSCRITOS_SHORTCUTS,
} from "./fpg/routes";
import { CLUBES_GRUPOS_BY_YEAR } from "../data/clubesGruposData";
import { TournamentDetail } from "./fpg/TournamentDetail";
import { buildFpgEditionsIndex, fpgPastEditionsTabs } from "./fpg/fpgPastEditions";
import { fpgOmRankingTabs } from "./fpg/fpgOmRanking";
import { fpgMatchplayTabs, useFpgMatchplay, type FpgMatchplayData } from "./fpg/fpgMatchplay";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitConfig } from "../ui/circuit/types";
import { buildFpgEntries, fpgRepDivision, FPG_CONFIG } from "./fpg/fpgCircuitData";
import MasterDetail from "../ui/MasterDetail";

/** Junta o tab do Match Play (Taça da Federação) e o da Ordem de Mérito (CGSS)
 *  aos tabs de "Edições anteriores". */
function fpgExtraTabs(editionsIndex: Parameters<typeof fpgPastEditionsTabs>[0], t: Parameters<typeof fpgOmRankingTabs>[0], playersDB?: Parameters<typeof fpgPastEditionsTabs>[2], matchplay?: FpgMatchplayData | null) {
  const tabs = [...(fpgMatchplayTabs(matchplay ?? null, t) ?? []), ...(fpgOmRankingTabs(t) ?? []), ...(fpgPastEditionsTabs(editionsIndex, t, playersDB) ?? [])];
  return tabs.length ? tabs : undefined;
}

/** Região/organização de um torneio de jovens pelo ccode (pill na sidebar de /FPG/jovens). */
const REGION_LABEL: Record<string, string> = {
  "000": "Nacional", "988": "Sul", "987": "Norte",
  "985": "Tejo", "983": "Açores", "982": "Madeira",
  "051": "Açores", "007": "Madeira", "910": "Norte",
  "059": "Palheiro", "005": "Açores",
};

/** Faixa 🆚 no topo das vistas de match play de clubes (tabs Grupos e Match Play). */
function MatchPlayBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mp-banner">
      <span className="mp-banner-icon">🆚</span>
      <span>{children}</span>
    </div>
  );
}

function Content() {
  const location = useLocation();
  const navigate = useNavigate();
  const params   = useParams<{ filter?: string; sub?: string; tkey?: string }>();

  // Deep-link de torneio (`/FPG/torneio/{ccode}-{tcode}`) — prioritário sobre
  // os filtros de série. Quando presente, fazemos auto-select do torneio no
  // useEffect mais abaixo, assim que o displayList/jovensTournaments carregar.
  const urlTkey = params.tkey || null;

  // Resolver filtro inicial pela URL. Dois formatos válidos para inscrições:
  //   /FPG/jovens/inscritosCN  (canónico, nested)
  //   /FPG/inscritosCN         (atalho top-level — também funciona)
  const urlSeg = (params.filter || "").toLowerCase();
  const urlSub = (params.sub    || "").toLowerCase();
  const isInscritosShortcut = INSCRITOS_SHORTCUTS.has(urlSeg);
  const startSeries: SeriesKey = isInscritosShortcut
    ? "jovens"
    : (URL_TO_FILTER[urlSeg] ?? "");
  const startInscritos = isInscritosShortcut
    || (startSeries === "jovens" && INSCRITOS_SHORTCUTS.has(urlSub));
  // selected=-1 inicial (independente de haver ou não params.tkey):
  // - Com deep-link: URL→state encontra o match e chama setSelected(idx).
  // - Sem deep-link (utilizador entra em /FPG): `cur = displayList[-1] = undefined`
  //   → o render mostra "Selecciona um torneio" em vez de auto-seleccionar
  //   o primeiro torneio (que ficaria em branco se não tiver scorecards).
  // Sem esta guarda, selected=0 fazia o render mostrar displayList[0] (torneio
  // aleatório, dependendo de qual ficheiro pull-torneios carregou primeiro)
  // enquanto pjaExtra ou jovens ainda carregam — dando a ilusão de "várias
  // páginas a piscar".
  const [selected, setSelected] = useState<number>(-1);
  const md = useMasterDetail();
  // Filtros sincronizados com URL query params para partilha directa.
  // Ex: `/FPG?year=2026&manuel=0&q=pedro`. Declarado ANTES dos useStates que
  // dependem dele (Temporal Dead Zone).
  const [searchParams, setSearchParams] = useSearchParams();
  const [navMode, setNavMode]         = useState<"torneios" | "ranking-pja" | "ranking-sub12" | "classificacoes">(
    URL_TO_NAV[urlSeg] ?? "torneios"
  );
  const [seriesFilter, setSeriesFilter] = useState<"" | "circuit" | "santo" | "clubes" | "jovens">(
    (startInscritos || urlSeg === "jovens") ? "jovens" : ""
  );
  const [yearFilter, setYearFilter]    = useState<string | null>(() => searchParams.get("year"));
  const [filterManuel, setFilterManuel] = useState(() => searchParams.get("manuel") !== "0");
  const [searchQuery, setSearchQuery]  = useState(() => searchParams.get("q") || "");  // filtro de texto: nome ou campo/clube
  // ── Dados (src/data/fpgPageLoader.ts, fpgRankingsLoader.ts) ──────────────
  const { playersDB, escLookup } = useFpgPlayersDB();
  // pull-torneios + Clubes (os Clubes chegam primeiro, já com inscrições/draws)
  const {
    tournaments, fileMeta, loading, loadingMsg, error,
    clubesTournaments, clubesLoaded, clubesMeta,
  } = useFpgMainData();
  const clubesLoading = !clubesLoaded;
  const [clubesSelected, setClubesSelected]       = useState<number>(0);
  const [clubesView, setClubesView]               = useState<"individual" | "grupos" | "matchplay">("grupos");
  // Drive/Aquapor mensais (Ranking PJA 2026+) — fora do displayList principal.
  const { pjaExtraTournaments, pjaExtraReady, pjaMembers, pjaPdfSnapshot } = useFpgPjaExtra();
  // Jovens: arrancam no mount, para aparecerem também em "Todos".
  const { jovensTournaments, jovensLoaded, jovensMeta, admissionsMeta } = useFpgJovensData();
  const jovensLoading = !jovensLoaded;
  // Ranking Sub-12 e Classificações: ficheiros pré-construídos, lidos ao abrir o tab.
  const { tournaments: sub12Tournaments, loading: sub12Loading } = useLazyRanking(SUB12_RANKING_URL, navMode === "ranking-sub12");
  const { tournaments: classifTournaments, loading: classifLoading } = useLazyRanking(CLASSIFICACOES_URL, navMode === "classificacoes");

  // Sincronização state → URL (query string). Só parâmetros com valor
  // não-default vão para o URL. replace:true evita poluir o histórico.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams);
    // year
    if (yearFilter) sp.set("year", yearFilter); else sp.delete("year");
    // manuel (default: true — só guardar "0" se desligado)
    if (!filterManuel) sp.set("manuel", "0"); else sp.delete("manuel");
    // search
    if (searchQuery.trim()) sp.set("q", searchQuery.trim()); else sp.delete("q");
    // Normaliza links antigos: `shell` já não faz nada (o CircuitShell é o
    // default das vistas de torneios), por isso remove-se do URL.
    sp.delete("shell");
    if (sp.toString() !== searchParams.toString()) {
      setSearchParams(sp, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearFilter, filterManuel, searchQuery]);

  // ── Estado Jovens ─────────────────────────────────────────────────────────
  const [jovensGroupKey, setJovensGroupKey]        = useState<string | null>(null);
  const [jovensEscIdx, setJovensEscIdx]            = useState<number>(0);
  const [jovensShowInscricoes, setJovensShowInscricoes] = useState(startInscritos);
  // /FPG/jovens sem sub-segmento → abre na lista de torneios (a Análise foi
  // migrada para /titulos em 2026-05-04).

  // ── Sync URL→seriesFilter quando o utilizador navega entre /FPG, /FPG/jovens,
  //     /FPG/sto, /FPG/clubes, /FPG/pja sem remontar a página.
  // useState só inicializa UMA vez → se o user entrou em /FPG/jovens e depois
  // clica no topo em "FPG" (→ /FPG), o seriesFilter ficaria preso em "jovens".
  // Este effect alinha o estado com a URL sempre que urlSeg muda.
  //
  // ⚠ Early-return em `/FPG/torneio/:tkey`: essa rota não tem `:filter`, logo
  // urlSeg="" — o effect interpretaria como "volta a Todos" e arrancaria o
  // utilizador da tab em que está (Jovens/Santo/PJA). Nesse caso, a selecção
  // de torneio deve ser local à tab; não é uma mudança de tab.
  useEffect(() => {
    if (params.tkey) return;  // rota /FPG/torneio/:tkey → preservar tab actual

    // Navegação por tabs (Ranking PJA / Ranking Sub-12 / Torneios)
    const targetNav = URL_TO_NAV[urlSeg] ?? "torneios";
    if (targetNav !== navMode) setNavMode(targetNav);

    // Series-filter (apenas relevante em navMode=torneios)
    const targetSeries: SeriesKey = isInscritosShortcut
      ? "jovens"
      : (URL_TO_FILTER[urlSeg] ?? "");
    if (targetSeries !== seriesFilter) {
      setSeriesFilter(targetSeries);
    }
    // Se voltou para /FPG puro (sem segmento) a partir de /FPG/jovens, limpar
    // também as views jovens-específicas que podem ter ficado activas.
    if (urlSeg === "") {
      if (jovensShowInscricoes) setJovensShowInscricoes(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSeg, urlSub, isInscritosShortcut, params.tkey]);

  const { melhorias } = useAppContext();

  const tcodePills = useMemo(() => buildTcodePills(melhorias), [melhorias]);

  // Termo de pesquisa normalizado (nome/campo/clube, sem acentos nem maiúsculas).
  const searchTerm = normSearchTerm(searchQuery);

  // Lista de Clubes (★Manuel, ano, pesquisa), agrupada por ano na sidebar.
  const clubesList = useMemo(
    () => selectClubesList(clubesTournaments, { filterManuel, yearFilter, searchTerm }),
    [clubesTournaments, filterManuel, yearFilter, searchTerm]
  );
  const clubesByYear = useMemo(() => {
    const m: Record<string, Tournament[]> = {};
    for (const t of clubesList) {
      const yr = t._clubesYear ?? t.date?.substring(0, 4) ?? "?";
      if (!m[yr]) m[yr] = [];
      m[yr].push(t);
    }
    return m;
  }, [clubesList]);
  const clubesYears = useMemo(() => Object.keys(clubesByYear).sort().reverse(), [clubesByYear]);
  const curClubes = clubesList[clubesSelected] ?? null;
  const curClubesYear: string = curClubes?._clubesYear ?? curClubes?.date?.substring(0, 4) ?? "";
  // Match play 3-way (Regional de Clubes 2026) nas peças partilhadas: confrontos
  // → MatchplayView (tab Match Play); pontos por clube → TeamPointsStandings (Grupos).
  const clubesMp = useMemo(() => {
    const fmt = clubesFormatOf(curClubes);
    const mp = fmt?.matchPlay ? curClubes?.matchPlayResults : undefined;
    if (!curClubes || !mp) return null;
    const opts = {
      tournament: curClubes.name,
      slug: `clubes-${curClubes.ccode}-${curClubes.tcode}`,
      year: Number(curClubesYear) || null,
      categories: fmt?.categories,
    };
    return { file: clubesMatchplayToFile(mp, opts), points: clubesTeamPoints(mp, opts) };
  }, [curClubes, curClubesYear]);

  // Deep-link de Clubes: URL `?ct=ccode-tcode` → selecciona o torneio. Corre no
  // arranque (quando a lista carrega) e em navegação back/forward. `clubesSelected`
  // de propósito FORA das deps para não competir com os cliques na sidebar.
  useEffect(() => {
    if (seriesFilter !== "clubes" || !clubesLoaded) return;
    const ct = searchParams.get("ct");
    if (!ct) return;
    const idx = clubesList.findIndex(t => `${t.ccode}-${t.tcode}` === ct);
    if (idx >= 0) setClubesSelected(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesFilter, clubesLoaded, clubesList, searchParams]);

  // Tab JOVENS: Nacionais Jovens + sintéticos + torneios juvenis de outras
  // fontes (pelo nome), com os filtros da página. Para torneios pré-jogo o Manuel
  // só aparece nas inscrições/draws — `tournamentHasManuel` cobre-os.
  const jovensGroups = useMemo(
    () => buildJovensGroups(selectJovens(jovensCandidates(jovensTournaments, tournaments), { filterManuel, yearFilter, searchTerm })),
    [jovensTournaments, tournaments, filterManuel, yearFilter, searchTerm]
  );

  const jovensByYear = useMemo(() => {
    const m: Record<string, JovensGroup[]> = {};
    for (const g of jovensGroups) {
      if (!m[g.year]) m[g.year] = [];
      m[g.year].push(g);
    }
    return m;
  }, [jovensGroups]);
  const jovensYears = useMemo(() => Object.keys(jovensByYear).sort().reverse(), [jovensByYear]);
  // Quando jovensGroupKey é null (estado inicial em /FPG/jovens, sem deep-link)
  // NÃO fazer fallback para jovensGroups[0]. Senão o auto-select escolhe sempre
  // o grupo mais futuro (Nacional 2026-05-01 > Regional 2026-04-17), faz
  // state→URL navegar para essa URL, e o utilizador é "atirado" para o Nacional
  // ao abrir Jovens. Com null, render mostra "Selecciona um torneio" e a URL
  // fica /FPG/jovens limpa até o utilizador escolher.
  const curJovensGroup = jovensGroupKey
    ? (jovensGroups.find(g => g.key === jovensGroupKey) ?? null)
    : null;
  const curJovens = curJovensGroup?.entries[jovensEscIdx] ?? curJovensGroup?.entries[0] ?? null;

  // Anti-loop: quando URL→state ou escIdx-sync aplicam actualizações de estado,
  // levantam este flag para que o state→URL a seguir SALTE uma navegação. Sem
  // isto o state→URL pode disparar com estado "stale" (old groupKey/escIdx)
  // enquanto URL→state ainda está a sincronizar, e navegar para URL errada,
  // criando ping-pong entre dois torneios. Ver logs do 2026-04-19.
  const skipNextStateUrlRef = useRef(false);

  /** Lista que alimenta o tab "Todos": pull-torneios + clubes + jovens, UMA
   *  entrada por torneio (ver dedupDisplayTournaments). Drive Tour + Aquapor
   *  NÃO entram — vivem na /drive; pjaExtraTournaments só serve o Ranking PJA. */
  const displayList = useMemo(
    () => buildDisplayList(dedupDisplayTournaments(tournaments, jovensTournaments)),
    [tournaments, jovensTournaments]
  );
  const cur = displayList[selected];

  // ── Deep-link: sync URL (:tkey) → estado ────────────────────────────────
  // Ao carregar com `/FPG/torneio/{ccode}-{tcode}` (ou ao navegar para uma URL
  // desse formato), procurar o torneio em displayList E em jovensTournaments
  // e fazer DUAS actualizações em paralelo:
  //   - se estiver em displayList → setSelected (alimenta `cur` para vistas
  //     "Todos"/"Circuito"/"Santo")
  //   - se estiver em jovensTournaments → setSeriesFilter("jovens") +
  //     setJovensGroupKey (alimenta `curJovens` para a vista "Jovens")
  //
  // ⚠ Bug anterior: fazia early-return depois do setSelected, deixando
  // jovensGroupKey por sincronizar. Como displayList contém os torneios de
  // jovens (fundidos no `displayList` useMemo), o early-return triggava SEMPRE
  // para deep-links de jovens, e o jovensGroupKey ficava preso ao default
  // (null → fallback para jovensGroups[0] → Nacional 2026-05-01) mesmo com a
  // URL a apontar para outro torneio (ex: Regional 007-11010). O state→URL
  // depois reverteia a URL para o do default, criando o "loop" Nacional↔Regional.
  useEffect(() => {
    if (!urlTkey || displayList.length === 0) return;
    const parsed = parseTournKey(urlTkey);
    if (!parsed) return;
    const { ccode, tcode } = parsed;
    const matchesT = (t: Tournament) =>
      t.ccode === ccode && (
        t.tcode === tcode ||
        // Torneios sintéticos (multi-dia) guardam tcode como "10935+10936" — match contém
        (t.tcode || "").split("+").includes(tcode)
      );
    const idx = displayList.findIndex(matchesT);
    if (import.meta.env.DEV) console.log("[URL→state]", { urlTkey, idx, selected, seriesFilter, jovensGroupKey, jovensEscIdx });

    let anyUpdate = false;
    if (idx >= 0 && idx !== selected) { setSelected(idx); anyUpdate = true; }

    // Se também é um torneio de Jovens E o utilizador JÁ ESTÁ na vista Jovens,
    // sincronizar o grupo seleccionado para refrescar os tabs de escalão.
    //
    // ⚠ NÃO forçar setSeriesFilter("jovens") aqui — antes fazia-se e causava
    // um bug: clicar num torneio Nacional Jovens a partir do tab "Todos"
    // arrastava o utilizador de volta para o tab "Jovens". O "Todos" já
    // mostra os mesmos torneios com escalão-tabs no detalhe, por isso não
    // há razão para mudar de tab. Para deep-links externos (`/FPG/torneio/...`)
    // o utilizador fica em Todos por default, o que é aceitável.
    //
    // ⚠ NÃO pôr jovensGroups em deps — quando jovensGroups muda referência
    // (ex: toggle filterManuel), URL→state re-fire-ava e competia com
    // state→URL, causando loops entre torneios. O sync de jovensEscIdx é
    // deixado ao useEffect dedicado abaixo.
    const jovT = jovensTournaments.find(matchesT);
    if (jovT && seriesFilter === "jovens") {
      // Usar `entries.some(...)` em vez de construir a key: as keys agora
      // incluem um discriminator (tcode) para suportar Phase 3 Jaccard split.
      const grp = jovensGroups.find(g => g.entries.some(e => e.ccode === jovT.ccode && e.tcode === jovT.tcode));
      if (grp && jovensGroupKey !== grp.key) { setJovensGroupKey(grp.key); anyUpdate = true; }
      if (jovensShowInscricoes) { setJovensShowInscricoes(false); anyUpdate = true; }
      // Se o torneio pedido pela URL é histórico/sem Manuel, o filtro
      // filterManuel (default=true) escondê-lo-ia da sidebar e da view.
      // Auto-desactiva para que o deep-link funcione sempre.
      const tHasManuel = tournamentHasManuel(jovT);
      if (filterManuel && !tHasManuel) { setFilterManuel(false); anyUpdate = true; }
    }

    // Se actualizámos alguma coisa, sinalizar ao state→URL para não navegar
    // no próximo ciclo (URL é a fonte de verdade; estado está-se a alinhar).
    if (anyUpdate) skipNextStateUrlRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTkey, displayList, jovensTournaments]);

  // ── Sync jovensEscIdx com o tcode exacto pedido na URL ──
  // Quando urlTkey aponta para um torneio de Jovens numa posição do grupo
  // diferente de entries[0] (ex: /FPG/torneio/007-11011 = Sub 14/24, posição 1),
  // sincroniza jovensEscIdx. Separado do effect principal para evitar que deps
  // de jovensGroups causem loops (ver comentário acima).
  useEffect(() => {
    if (!urlTkey || !jovensGroupKey) return;
    const parsed = parseTournKey(urlTkey);
    if (!parsed) return;
    const curGroup = jovensGroups.find(g => g.key === jovensGroupKey);
    if (!curGroup) return;
    const escIdx = curGroup.entries.findIndex(
      e => e.ccode === parsed.ccode && e.tcode === parsed.tcode
    );
    if (escIdx >= 0 && escIdx !== jovensEscIdx) {
      setJovensEscIdx(escIdx);
      // Guarda anti-loop: a alteração de escIdx é consequência da URL, não
      // uma decisão nova do utilizador — o state→URL não deve reagir.
      skipNextStateUrlRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTkey, jovensGroupKey, jovensGroups]);

  // ── Deep-link: sync estado (torneio seleccionado) → URL ────────────────
  // Quando o utilizador clica num torneio na sidebar, actualizar a URL para
  // reflectir a selecção (`/FPG/torneio/{ccode}-{tcode}` com `replace: true`
  // para não poluir o histórico do browser).
  //
  // IMPORTANTE: deps=[cur, curJovens] APENAS. Não incluir `seriesFilter` nem
  // `jovensShowInscricoes` — se incluídos, clicar num tab (ex: "SSerra" →
  // navega para `/FPG/sto`) dispara este effect e sobrepõe a URL com
  // `/FPG/torneio/...` (o `cur` do displayList não muda com troca de tab).
  // O effect apenas deve disparar quando o TORNEIO muda de facto.
  //
  // Skip explícito (lido via closure, não por deps):
  //   - Painel de inscrições (`jovensShowInscricoes`) — URL dedicada
  //   - Vista Clubes — a URL `/FPG/clubes` não conflita e a selecção é local
  //
  // Não há loop: o useEffect URL→estado acima só muda `selected` se
  // `idx !== selected`, por isso navegar para a URL actual é no-op.
  useEffect(() => {
    if (jovensShowInscricoes) return;
    if (seriesFilter === "clubes") return;
    // Nas tabs Ranking PJA / Ranking Sub-12 a selecção de torneio não é visível
    // e a URL deve manter-se em /FPG/rankingPJA ou /FPG/rankingSub12. Guarda
    // dupla:
    //  (a) navMode actual (o tab pickado no state)
    //  (b) urlSeg actual (a URL pode já estar numa rota de ranking mesmo antes
    //      do URL→state effect ter sincronizado o navMode — ex: load inicial
    //      em /FPG/rankingPJA)
    // Sem esta guarda, cada mudança em `cur` (que acontece quando o displayList
    // carrega) sobrescreve a URL para /FPG/torneio/... e empurra o utilizador
    // para fora do ranking.
    if (navMode !== "torneios") return;
    // urlSeg é sempre lowercase (.toLowerCase() em params.filter) — comparar em lowercase.
    if (urlSeg === "rankingpja" || urlSeg === "rankingsub12" || urlSeg === "classificacoes") return;
    // Guarda anti-loop: se URL→state ou escIdx-sync acabaram de actualizar
    // estado, esse estado pode ainda não reflectir TUDO (ex: escIdx actualizado
    // mas groupKey acabou de mudar e entries[escIdx] aponta noutro lado). Saltar
    // esta execução — próximo render terá estado consistente e a URL coincidirá.
    if (skipNextStateUrlRef.current) {
      skipNextStateUrlRef.current = false;
      if (import.meta.env.DEV) console.log("[state→URL] SKIPPED (URL→state in flight)");
      return;
    }
    const t: Tournament | null =
      seriesFilter === "jovens" ? curJovens : cur;
    if (!t || !t.ccode || !t.tcode) return;
    const target = tournamentUrl("FPG", t.ccode, t.tcode);
    // Guarda anti-race: se o URL actual já é `/FPG/torneio/{tkey}` E esse
    // tkey NÃO corresponde ao `cur`, significa que URL→state ainda não
    // encontrou o torneio no displayList (provavelmente pjaExtraTournaments
    // ou jovensTournaments ainda não carregou). NÃO navegar — ficaria preso
    // a redireccionar para o displayList[0] e o deep-link perder-se-ia.
    // Aceitar também tcode sintético "A+B" quando o params.tkey é "A".
    if (params.tkey) {
      const parsed = parseTournKey(params.tkey);
      if (parsed) {
        const curCcode = t.ccode || "";
        const curTcodes = String(t.tcode || "").split("+");
        const matches = curCcode === parsed.ccode && (curTcodes.includes(parsed.tcode) || String(t.tcode) === parsed.tcode);
        if (!matches) {
          if (import.meta.env.DEV) console.log("[state→URL] SKIPPED — urlTkey", params.tkey, "não bate com cur", `${curCcode}-${t.tcode}`, "(aguardar URL→state)");
          return;
        }
      }
    }
    if (import.meta.env.DEV) console.log("[state→URL]", { from: location.pathname, target, seriesFilter, source: seriesFilter === "jovens" ? "curJovens" : "cur", tcode: t.tcode });
    if (target && location.pathname !== target) {
      navigate(target, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, curJovens, navMode]);

  /** Índice de "edições anteriores" (clube + família do nome → edições noutros
   *  anos). Construído uma vez sobre TODOS os torneios carregados; a tab só
   *  aparece nos torneios com ≥2 edições. Ver fpgPastEditions.tsx. */
  const editionsIndex = useMemo(
    () => buildFpgEditionsIndex([...tournaments, ...jovensTournaments]),
    [tournaments, jovensTournaments],
  );
  /** Quadros de match play (Taça da Federação) — tab "Match Play" na qualificação. */
  const matchplayData = useFpgMatchplay();

  /** Lista de torneios indexados pelo seu ficheiro de origem — alimenta o
   *  popover do clique-direito no FileBadge. Inclui clubes e jovens (que têm
   *  _sourceFile próprio) além dos pull-torneios. */
  const providerTournaments = useMemo(() => {
    const base = [...tournaments, ...jovensTournaments];
    return base.map(t => ({
      _sourceFile: t._sourceFile,
      name: t.name,
      date: t.date,
      tcode: t.tcode,
      ccode: t.ccode,
    }));
  }, [tournaments, jovensTournaments]);

  /** Lista de todos os ficheiros lidos pela página — alimenta o DataSourcesChip. */
  const allSources = useMemo<DataSource[]>(() => {
    const main: DataSource[] = fileMeta.map(m => ({
      path: m.file,
      status: "loaded",
      count: m.count,
      source: m.source,
      lastUpdated: m.lastUpdated,
      group: "main",
    }));
    return [...main, ...clubesMeta, ...jovensMeta, ...admissionsMeta];
  }, [fileMeta, clubesMeta, jovensMeta, admissionsMeta]);

  // Anos disponíveis no modo Torneios.
  // Anos 2020+ aparecem como botões individuais; tudo o que é <2020 (1 entrada
  // por ano dos Nacionais Jovens históricos) fica agrupado num único bucket
  // "<2020" — evita 15+ botões para uma entrada cada.
  const availYears = useMemo(() => {
    const s = new Set<string>();
    let hasPre2020 = false;
    for (const t of displayList) {
      if (!t.date) continue;
      const y = t.date.substring(0, 4);
      if (y < "2020") hasPre2020 = true;
      else s.add(y);
    }
    const out = [...s].sort().reverse();
    if (hasPre2020) out.push(PRE_2020_KEY);
    return out;
  }, [displayList]);
  const activeYear = yearFilter ?? null;

  // Event-groups globais — os mesmos torneios agrupados por (date+ccode) com
  // nome simplificado e split por Jaccard<0.5. Usado pelos tabs "Todos",
  // "Santo" e "PJA" para mostrar 1 linha por evento físico (não 1 por tcode).
  const allEventGroups = useMemo(
    // Drive/Aquapor NÃO aparecem na sidebar da /FPG (têm a página /drive). E os
    // torneios de clubes em MATCH PLAY vivem na vista /FPG/clubes (o deep-link
    // redirige para lá) — não fazem sentido na lista strokeplay "Todos" (têm 0
    // jogadores e só um draw). Filtra-se na VISTA (não em `displayList`) para os
    // deep-links continuarem a resolver.
    () => buildEventGroups(
      displayList.filter(t =>
        !isDriveOrAquapor(t) && !isClubesMatchPlay(t)),
      { mergeEditions: true },
    ),
    [displayList]
  );

  // Lista PJA (modo circuito) — apenas torneios com "PJA" no nome ou
  // registados em TOURN_PILLS como PJA. Exclui SSerra (tab próprio).
  //
  // Excepção: "Greatgolf Junior Open" não tem "PJA" no nome mas é considerado
  // parte do circuito PJA pela Mariana — incluído explicitamente.
  const pjaList = useMemo(
    () => displayList.filter(t => {
      if (t.ccode === SSERRA_CCODE) return false;  // SSerra tem tab próprio
      if (/PJA/i.test(t.name)) return true;
      if (/greatgolf.*junior/i.test(t.name)) return true;
      const tcodes = t.tcode?.split("+") || [];
      return tcodes.some(tc => TOURN_PILLS[tc] === "PJA");
    }),
    [displayList]
  );

  // Lista EXPANDIDA para o Ranking PJA — a partir de 2026 o ranking inclui,
  // além dos torneios exclusivos PJA, os torneios Drive Tour (FPG), Aquapor
  // (2 primeiros do ano) e Greatgolf Junior Open. Para anos anteriores,
  // mantém o comportamento antigo (só torneios PJA exclusivos).
  // A classificação do tipo e aplicação das regras (GG só R2+R3, Aquapor só
  // para quem não jogou DT, etc.) é feita dentro de PJARankingView.
  const pjaRankingList = useMemo(
    () => {
      const isPJA = (t: Tournament) => {
        // Torneios manuais marcados explicitamente como PJA
        if (t._manual && t._origin === "PJA") return true;
        if (t.ccode === SSERRA_CCODE) return false;
        // Regras partilhadas com a página standalone ranking-pja.vercel.app —
        // fonte única em ranking-pja/pja-rules.mjs (alterar as regras LÁ).
        return isPJACore(t);
      };
      // Combinar displayList (pull-torneios) + drive/aquapor mensais,
      // deduplicando por tcode+ccode+date.
      const out: Tournament[] = displayList.filter(isPJA);
      const seen = new Set(out.map(t => `${t.ccode || "?"}/${t.tcode ?? "?"}/${t.date || "?"}`));
      for (const t of pjaExtraTournaments) {
        if (!isPJA(t)) continue;
        const k = `${t.ccode || "?"}/${t.tcode ?? "?"}/${t.date || "?"}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
      }
      return out;
    },
    [displayList, pjaExtraTournaments]
  );

  const pjaEventGroups = useMemo(() => buildEventGroups(pjaList), [pjaList]);

  // ── Santo da Serra ──
  const santoList = useMemo(
    () => displayList.filter(t => t.ccode === SSERRA_CCODE),
    [displayList]
  );
  const santoEventGroups = useMemo(() => buildEventGroups(santoList), [santoList]);

  // ── Vista de Torneios via CircuitShell (Todos / Santo da Serra / PJA) ──
  // As três vistas de torneios usam o shell partilhado (mesmo componente de
  // /rfeg, /drive, /major, …). Não afecta Clubes / Jovens / rankings (que têm
  // UI própria mais abaixo). O detalhe é delegado ao TournamentDetail da FPG.
  const shellGroups = seriesFilter === "santo" ? santoEventGroups
    : seriesFilter === "" ? allEventGroups
    : pjaEventGroups;
  const shellEntries = useMemo(() => {
    const ents = buildFpgEntries(shellGroups);
    // Anexa o render do detalhe (delegado ao TournamentDetail da FPG, que tem
    // escLookup/playersDB em runtime) — mesmo padrão do DrivePage. As tabs
    // "Edições anteriores" vêm do índice próprio da FPG (fpgPastEditionsTabs),
    // não do mecanismo do shell — por isso a config não define editionKey.
    for (const e of ents) for (const d of e.divisions ?? []) {
      const t = d.results!;
      d.renderFull = () => (
        <TournamentDetail tournament={t} escLookup={escLookup} playersDB={playersDB}
          extraTabs={fpgExtraTabs(editionsIndex, t, playersDB, matchplayData)} />
      );
    }
    return ents;
  }, [shellGroups, escLookup, playersDB, editionsIndex, matchplayData]);

  // Deep-link /FPG/torneio/{ccode}-{tcode} → (grupo, escalão). Um membro pode ter
  // tcode sintético "A+B" (multi-dia); o URL canónico usa só o 1º tcode, por isso
  // o match parte o "+".
  const shellSel = useMemo(() => {
    const empty = { id: undefined as string | undefined, divKey: undefined as string | undefined };
    if (!params.tkey) return empty;
    const parsed = parseTournKey(params.tkey);
    if (!parsed) return empty;
    const matches = (memberKey: string) => {
      const mp = parseTournKey(memberKey);
      if (!mp || String(mp.ccode) !== String(parsed.ccode)) return false;
      const mt = String(mp.tcode ?? "");
      return mt === String(parsed.tcode) || mt.split("+").includes(String(parsed.tcode));
    };
    for (const e of shellEntries) {
      const d = e.divisions?.find(dv => matches(dv.key));
      if (d) return { id: e.id, divKey: d.key };
    }
    return empty;
  }, [params.tkey, shellEntries]);

  // Um drive/Aquapor pedido em /FPG/torneio/ (vem nos drive-data mensais, não
  // entra no shell) → reencaminhar para a DrivePage, onde ele vive.
  const tkeyDriveTarget = useMemo(() => {
    if (!params.tkey || shellSel.id) return null;
    const p = parseTournKey(params.tkey);
    if (!p) return null;
    const hit = pjaExtraTournaments.some(t =>
      t.ccode === p.ccode && String(t.tcode ?? "").split("+").includes(p.tcode));
    return hit ? tournamentUrl("drive", p.ccode, p.tcode) : null;
  }, [params.tkey, shellSel.id, pjaExtraTournaments]);

  // ⚠ Deep-link por resolver: os torneios chegam em lotes (jovens e drives
  // mensais, pequenos, costumam chegar ANTES dos pull-torneios). Com
  // `selectedId` indefinido o shell aplica o seu default — o mais recente do
  // que já chegou (ex.: um jovens) — e reescreve o URL: o deep-link perdia-se e
  // os links da /draws abriam todos o mesmo torneio. Enquanto QUALQUER lote
  // faltar, o shell fica em "a carregar" com um id sentinela.
  const tkeyPending = !!params.tkey && !shellSel.id
    && (loading || !jovensLoaded || !pjaExtraReady || !!tkeyDriveTarget);

  useEffect(() => {
    if (tkeyDriveTarget) navigate(tkeyDriveTarget + location.search, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tkeyDriveTarget]);

  // Navega o URL para o tcode canónico (ccode-firstTcode) de uma divisão,
  // PRESERVANDO a query (ex.: ?manuel=0). Remove `tab` para o shell reescrever a
  // aba do novo torneio.
  const shellNavToDiv = useCallback((divKey: string, replace: boolean) => {
    const p = parseTournKey(divKey);
    if (!p) return;
    const firstTcode = String(p.tcode ?? "").split("+")[0];
    const path = tournamentUrl("FPG", p.ccode, firstTcode);
    if (!path) return;
    const sp = new URLSearchParams(location.search);
    sp.delete("tab");
    const search = sp.toString();
    const target = search ? `${path}?${search}` : path;
    if (location.pathname + location.search !== target) navigate(target, { replace });
  }, [location.pathname, location.search, navigate]);

  const shellConfig: CircuitConfig = {
    ...FPG_CONFIG,
    grouping: seriesFilter === "" ? "month-year" : "year",
    title: seriesFilter === "santo" ? "⛳ Santo da Serra"
      : seriesFilter === "" ? "🇵🇹 FPG — Todos" : "🏆 PJA",
  };
  const shellView = (
    <CircuitShell
      entries={shellEntries}
      config={shellConfig}
      loading={loading || tkeyPending}
      selectedId={shellSel.id ?? (tkeyPending ? "__tkey-pending__" : undefined)}
      selectedDivKey={shellSel.divKey}
      onSelectEntry={(e) => {
        const rep = fpgRepDivision(e.divisions ?? []);
        if (rep) shellNavToDiv(rep.key, true);
      }}
      onSelectDivision={(_e, d) => shellNavToDiv(d.key, true)}
      // Paridade total da sidebar: reusa o MESMO TournSidebarItem do render
      // clássico (pills NACIONAL/JUNIOR/9H/SSerra/Clube, 🔗 por-tcode, FileBadge
      // da fonte, contagem de inscritos), mas com click/href do shell.
      // O grupo vem por id (= EventGroup.key).
      renderSidebarItem={(entry, { active, onSelect }) => {
        const g = shellGroups.find(gr => gr.key === entry.id);
        if (!g) return null;
        const first = g.entries[0];
        const firstTcode = (first?.tcode || "").split("+")[0];
        const path = first?.ccode && firstTcode ? tournamentUrl("FPG", first.ccode, firstTcode) : undefined;
        let href = path;
        if (path) {
          const sp = new URLSearchParams(location.search);
          sp.delete("tab");
          const s = sp.toString();
          href = s ? `${path}?${s}` : path;
        }
        return renderSidebarItem(g, { onClick: onSelect, href, isActive: active });
      }}
    />
  );

  // Vistas de torneios servidas pelo CircuitShell (Todos/Santo/PJA). O shell traz
  // a sua própria pesquisa + toggle de sidebar, por isso os equivalentes da
  // toolbar exterior são escondidos aqui (evita chrome duplicado). Clubes/Jovens
  // (master-detail próprio) e os modos Ranking/Classificações mantêm-nos.
  const shellTorneios = navMode === "torneios" && seriesFilter !== "clubes" && seriesFilter !== "jovens";

  /** Renderiza item de sidebar para uma EventGroup.
   *  - Singleton (entries.length === 1): comportamento idêntico ao anterior.
   *  - Grupo (entries.length > 1): nome simplificado + pill "N escalões" +
   *    pills agregados de todas as entradas; clique vai à entrada activa
   *    se `cur` já pertence ao grupo, senão vai à primeira entrada. */
  function renderSidebarItem(g: EventGroup, opts: { onClick: () => void; href?: string; isActive: boolean }) {
    const isMulti = g.entries.length > 1;
    // Entrada activa dentro do grupo (ou a primeira, se nenhuma está activa) —
    // é dela que sai o campo/tcode/players do `tData`.
    const activeEntryIdx = cur
      ? g.entries.findIndex(e => e.ccode === cur.ccode && e.tcode === cur.tcode)
      : -1;
    const activeEntry = activeEntryIdx >= 0 ? g.entries[activeEntryIdx] : g.entries[0];

    // Pill dinâmico (REGIONAL, NACIONAL, etc.) agregando todos os tcodes do grupo.
    const allTcodes = g.entries.flatMap(e => (e.tcode || "").split("+"));
    const pillVal = allTcodes.map(tc => TOURN_PILLS[tc] || tcodePills?.[tc]).find(Boolean);

    // Contagem de escalões (só se houver mais que 1 entrada).
    const counterPill = isMulti ? (
      <span className="p p-sm p-muted" title={g.entries.map(e => e.escalao || "?").join(" · ")}>
        {g.entries.length} esc.
      </span>
    ) : null;
    const tournPill = pillVal && pillVal !== "PJA" && pillVal !== "SSERRA"
      ? <span className={`p p-sm p-tourn p-${pillVal.toLowerCase()}`}>{pillVal}</span>
      : null;
    const extraPills = (counterPill || tournPill) ? <>{counterPill}{tournPill}</> : null;

    // Número de jogadores: quando grupo, soma distinct por jogador (um player
    // pode aparecer em múltiplos escalões se o organizador o listou assim —
    // raro). Simples e suficiente: somar playerCount de cada entrada.
    const nJog = isMulti
      ? g.entries.reduce((s, e) => s + (e.playerCount || e.players.filter(p => !isDNS(p)).length), 0)
      : (activeEntry.playerCount || activeEntry.players.filter(p => !isDNS(p)).length);

    // Nome a mostrar: simplificado se grupo; original se singleton (preserva
    // aspectos como "R1/R2/Total" em torneios multi-ronda sintéticos).
    const displayName = isMulti ? g.name : (activeEntry.name || g.name);

    // tcode "combinado" para a chave React — apenas para diferenciar elementos.
    const keyTcodes = g.entries.map(e => e.tcode).join("+");

    const tData: SidebarItemTournament = {
      ...activeEntry,
      name: displayName,
      // Escalão: só mostrar no pill quando é singleton; em grupo o escalão
      // varia por entrada → não cabe num pill único.
      escalao: isMulti ? null : activeEntry.escalao,
      playerCount: nJog,
      pill: pillVal,
      _manuelInscrito: g.entries.some(tournamentHasManuel),
    };
    // `opts` (click/href/isActive) vem do CircuitSidebar: o click navega
    // preservando a query e o href é o deep-link canónico (ccode-firstTcode).
    return (
      <TournSidebarItem
        key={(activeEntry._isSynthetic ? "synth_" : "") + keyTcodes + "_" + g.date}
        t={tData}
        isActive={opts.isActive}
        onClick={opts.onClick}
        extraPills={extraPills}
        href={opts.href}
      />
    );
  }

  // Controlos da barra — na barra do CircuitShell (Torneios) ou na própria (outros modos).
  const fpgLead = (<>
          {/* Toggle exterior escondido nas vistas do shell (o shell tem o seu). */}
          {!shellTorneios && <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Torneios" />}
          <ToolbarTitle>🏌️ FPG</ToolbarTitle>
          <DataSourcesChip sources={allSources} />
          {/* Pesquisa exterior: nos modos Ranking/Classificações filtra jogadores;
              em Clubes/Jovens filtra a lista. Nas vistas do shell (Torneios) é o
              shell que pesquisa, por isso esconde-se aqui. */}
          {!loading && !shellTorneios && (<>
            <ToolbarSep />
            {/* Search unificado — mesmo local e tamanho em todos os modos.
                Filtra jogadores em Ranking PJA, a lista em Clubes/Jovens, etc.
                O valor é partilhado (searchQuery). */}
            <div className="toolbar-search">
              <span aria-hidden="true" className="toolbar-search-icon">🔎</span>
              <input
                type="search"
                className="toolbar-search-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={
                  navMode === "ranking-pja" || navMode === "classificacoes" ? "jogador ou clube..."
                    : navMode === "ranking-sub12" ? "jogador..."
                    : "nome, campo, clube..."
                }
                aria-label="Pesquisar"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Limpar pesquisa"
                  onClick={() => setSearchQuery("")}
                  className="toolbar-search-clear"
                >×</button>
              )}
            </div>
          </>)}
          {!loading && (<>
            <ToolbarSep />
            {/* Vistas: interruptor segmentado (o mesmo de Campos/Jogadores/Drive). */}
            <div className="segmented-toggle" role="tablist" aria-label="Vista">
            {([
              { key: "torneios",      label: "Torneios" },
              { key: "ranking-pja",   label: "📊 Ranking PJA" },
              { key: "ranking-sub12", label: "🏅 Ranking Sub-12" },
              { key: "classificacoes", label: "🏆 Classificações" },
            ] as const).map(({ key, label }) => (
              <button key={key} role="tab" aria-selected={navMode === key}
                className={"seg-btn" + (navMode === key ? " active" : "")}
                onClick={() => {
                  setNavMode(key);
                  setSeriesFilter("");
                  setYearFilter(null);
                  const seg = NAV_TO_URL[key];
                  const target = seg ? `/FPG/${seg}` : "/FPG";
                  if (location.pathname !== target) navigate(target);
                }}>
                <span className="seg-label">{label}</span>
              </button>
            ))}
            </div>
            {/* Tabs de série (Todos/JOVENS/CLUBES/STO/PJA) — na MESMA barra, a
                seguir ao mode-switcher (antes ficavam numa 2ª linha). Só em modo
                Torneios. */}
            {navMode === "torneios" && (<>
              <ToolbarSep />
              {/* Séries: o mesmo interruptor segmentado (activo = estilo-padrão). */}
              <div className="segmented-toggle" role="tablist" aria-label="Série">
              {([
                { key: "",        label: "Todos" },
                { key: "jovens",  label: "🏆 Jovens" },
                { key: "clubes",  label: "🏅 Clubes" },
                { key: "santo",   label: "⛳ STO" },
                { key: "circuit", label: "🏆 PJA" },
              ] as const).map(({ key, label }) => {
                const active = seriesFilter === key;
                const urlSeg = FILTER_TO_URL[key];
                const href = urlSeg ? `/FPG/${urlSeg}` : "/FPG";
                return (
                  <a key={key} href={href} role="tab" aria-selected={active}
                    className={"seg-btn" + (active ? " active" : "")}
                    onClick={e => {
                      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                        e.preventDefault();
                        setSeriesFilter(key);
                        setJovensShowInscricoes(false);
                        // Preserva a query (ex.: ?manuel=0); remove `tab` (é por-torneio).
                        const _sp = new URLSearchParams(location.search);
                        _sp.delete("tab");
                        const _s = _sp.toString();
                        navigate((urlSeg ? `/FPG/${urlSeg}` : "/FPG") + (_s ? `?${_s}` : ""));
                      }
                    }}
                    style={{ textDecoration: "none" }}>
                    <span className="seg-label">{label}</span>
                  </a>
                );
              })}
              </div>
            </>)}
            {/* Pills de ano + ★Manuel exteriores: nas vistas do shell (Torneios)
                o CircuitShell já os tem, por isso escondem-se aqui para um
                cabeçalho limpo (estilo /ffg). Clubes/Jovens mantêm-nos (filtram
                a lista master-detail própria). */}
            {!shellTorneios && navMode === "torneios" && availYears.length > 1 && (<>
              <ToolbarSep />
              {availYears.map(y => (
                <button key={y}
                  className={"tourn-tab tourn-tab-sm" + (activeYear === y ? " active" : " tourn-tab-muted")}
                  onClick={() => setYearFilter(activeYear === y ? null : y)}
                  style={{ flexShrink: 0 }}>
                  {y}
                </button>
              ))}
              <ToolbarSep />
              <button
                className={"tourn-tab tourn-tab-sm shrink-0 nowrap" + (filterManuel ? " active manuel-on" : " tourn-tab-muted")}
                onClick={() => setFilterManuel(v => !v)}>
                ★ Manuel
              </button>
            </>)}
            </>)}
  </>);
  const fpgTrail = (<>
            {!loading && (<>
            {/* Contadores à direita */}
            <ExtLink href="https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=XH256YF45T"
              className="ext-link-outline fs-11 fw-600">
              FPG Torneios ↗
            </ExtLink>
            {loading
              ? <span className="muted fs-11 shrink-0"  style={{ fontStyle: "italic" }}>{loadingMsg}</span>
              : <>
                  {/* Contadores exteriores só nos modos SEM shell (Clubes/Jovens)
                      — nas vistas do shell o próprio CircuitShell mostra a
                      contagem, e estes dependiam dos filtros de ano/Manuel que
                      foram escondidos. */}
                  {!shellTorneios && navMode === "torneios" && (() => {
                    const count = seriesFilter === "clubes"  ? clubesList.length
                                : seriesFilter === "jovens"  ? jovensGroups.length
                                : 0;
                    return <span className="chip shrink-0" title={searchTerm ? `Com filtro "${searchQuery}"` : undefined}>
                      {count} torneio{count !== 1 ? "s" : ""}{searchTerm ? " ✓" : ""}
                    </span>;
                  })()}
                </>
            }
          </>)}
          {/* Slot de portal: o PJARankingView renderiza os seus filtros (anos,
              sexo, escalões) aqui via createPortal em vez de ter toolbar própria.
              ⚠ FORA do guard `!loading`: a vista de ranking monta antes de a
              FPGPage acabar de carregar e procura o slot no primeiro render —
              se ele ainda não existisse, os filtros caíam na toolbar de
              fallback e apareciam numa segunda linha. */}
          {(navMode === "ranking-pja" || navMode === "classificacoes" || navMode === "ranking-sub12") && <>
            {!loading && <ToolbarSep />}
            <div id="pja-toolbar-slot" style={{ display: "contents" }} />
          </>}
  </>);

  return (
    <DataSourcesProvider tournaments={providerTournaments}>
    <div className="tourn-layout">

      {/* ── Toolbar mobile-first: scroll horizontal em vez de grid ── */}
      {/* Uma só barra (13/10/2026): nas vistas do shell (Torneios) os controlos
          da página entram na barra do CircuitShell (CircuitToolbarSlotCtx). */}
      {!shellTorneios && (
      <div style={{ borderBottom: "1px solid var(--border-light)" }}>
        <Toolbar>
          {fpgLead}
          <div className="flex-1" style={{ minWidth: 8 }} />
          {fpgTrail}
        </Toolbar>
      </div>
      )}

      {error && (
        <div className="fw-600 fs-13 c-danger" style={{ padding: "16px 20px" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Torneios (Todos / Santo da Serra / PJA) — vista via CircuitShell */}
      {shellTorneios && (
        <CircuitToolbarSlotCtx.Provider value={{ lead: fpgLead, trail: fpgTrail, hideTitle: true }}>
          {shellView}
        </CircuitToolbarSlotCtx.Provider>
      )}

      {/* ── Clubes ─────────────────────────────────────────────────────── */}
      {navMode === "torneios" && seriesFilter === "clubes" && (
        <MasterDetail md={md} sidebar={<>
            {clubesLoading && <LoadingState size="sm" message="A carregar…" />}
            {clubesLoaded && clubesList.length === 0 && !clubesLoading && (
              <div className="muted fs-11 u-pad-italic">
                Ficheiro não encontrado (ainda)
              </div>
            )}
            {clubesYears.map(yr => (
              <React.Fragment key={yr}>
                <div className="sidebar-section-title-dark">🏅 {yr}</div>
                {clubesByYear[yr].map(t => {
                  const idx = clubesList.indexOf(t);
                  const playedR = Math.max(0, ...t.players.map(p => p.roundScores?.length ?? 0));
                  const nR = t.rounds || 1;
                  // Sufixo de progresso: "R2/3" no campo quando torneio incompleto
                  const progressSuffix = nR > 1 && playedR > 0 && playedR < nR
                    ? ` · R${playedR}/${nR}` : "";
                  const tWithProgress = {
                    ...t,
                    playerCount: t.playerCount || t.players.length,
                    campo: (t.campo || "Oporto") + progressSuffix,
                  } as SidebarItemTournament;
                  return (
                    <TournSidebarItem
                      key={t.tcode + "_" + t.date}
                      t={tWithProgress}
                      isActive={clubesSelected === idx}
                      onClick={() => {
                        setClubesSelected(idx);
                        // URL partilhável por torneio: /FPG/clubes?ct=ccode-tcode
                        const sp = new URLSearchParams(searchParams);
                        sp.set("ct", `${t.ccode}-${t.tcode}`);
                        setSearchParams(sp, { replace: true });
                        md.onSelect();
                      }}
                      accentColor={SIDEBAR_ACCENT.clubes}
                    />
                  );
                })}
              </React.Fragment>
            ))}
        </>}>
            {/* Tabs Individual / Grupos */}
            <div className="tabbar-under" style={{
              background: "var(--bg-card)", position: "sticky", top: 0, zIndex: "var(--z-panel-hdr)",
            }}>
              {(() => {
                // O tab Match Play só existe em provas de match play com dados
                // (Regional de Clubes 2026) — nos strokeplay não faria sentido.
                const _fmtTabs = clubesFormatOf(curClubes);
                const hasMp = !!_fmtTabs?.matchPlay && !!curClubes?.matchPlayResults;
                const views = hasMp
                  ? (["grupos", "matchplay", "individual"] as const)
                  : (["grupos", "individual"] as const);
                const LABELS = { grupos: "🏅 Grupos", matchplay: "🆚 Match Play", individual: "📋 Individual" } as const;
                return views.map(v => (
                  <button key={v} onClick={() => setClubesView(v)}
                    className={"tab-under" + (clubesView === v ? " active" : "")}>{LABELS[v]}</button>
                ));
              })()}
            </div>

            {/* Links directos FPG (Inscritos · Draw · Resultados) — visíveis em
                ambos os tabs (Grupos e Individual) para TODOS os torneios de
                clubes. O TournamentDetail já mostra estes links no cabeçalho,
                mas o tab Grupos não os tinha. */}
            {curClubes?.ccode && curClubes?.tcode && (
              <div className="flex-wrap" style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 16px", borderBottom: "1px solid var(--border)",
                background: "var(--bg-muted)", fontSize: "var(--fs-12)",
              }}>
                <span className="fw-600" style={{ color: "var(--text-muted)" }}>FPG:</span>
                <TournExtLinks
                  ccode={curClubes.ccode}
                  tcode={curClubes.tcode}
                  round={1}
                />
              </div>
            )}

            {clubesView === "matchplay" && curClubes ? (() => {
              if (!clubesMp) {
                return <div className="fs-13 c-muted" style={{ padding: "32px 24px", textAlign: "center" }}>Sem confrontos publicados.</div>;
              }
              return (
                <>
                  <MatchPlayBanner>Confrontos 3-way: uma coluna por clube, com o jogador e os pontos. Clica num confronto para ver os duelos e o buraco a buraco.</MatchPlayBanner>
                  <div className="p-16"><MatchplayView data={clubesMp.file} roundPicker /></div>
                </>
              );
            })() : clubesView === "individual"
              ? curClubes
                  ? (() => {
                      const _t = clubesIndividualTournament(curClubes);
                      return <TournamentDetail tournament={_t} escLookup={escLookup} playersDB={playersDB} extraTabs={fpgExtraTabs(editionsIndex, _t, playersDB, matchplayData)} />;
                    })()
                  : !clubesLoading && (
                      clubesLoaded
                        ? <div className="center-msg muted">Selecciona um torneio</div>
                        : <LoadingState size="sm" message="A carregar…" />
                    )
              : (() => {
                  if (!curClubes) {
                    return !clubesLoading
                      ? <div className="center-msg muted">Selecciona um torneio</div>
                      : null;
                  }
                  // Composição curada (juvenis sub14/sub18) tem prioridade; para
                  // clubes não-juvenis (ex: Mid-Amateur, esc "midam") ou edições
                  // sem composição carregada, auto-constrói as equipas por clube.
                  const esc = curClubes._clubesEsc;
                  const gruposData = curClubesYear ? CLUBES_GRUPOS_BY_YEAR[curClubesYear] : null;
                  const curated = (esc === "sub14" || esc === "sub18")
                    ? (gruposData?.[esc] ?? null)
                    : null;
                  const grupos = (curated && curated.length) ? curated : autoGruposByClub(curClubes);
                  // Clubes não-juvenis (midam): formato de pontuação por torneio
                  // (CLUBES_TEAM_FORMAT). Default = 5 melhores em todas as rondas
                  // (Absoluto), sem cap de pancadas por buraco.
                  const isMidam = esc === "midam";
                  const fmt = clubesFormatOf(curClubes);
                  // Match Play (ex: Regional 2026) — a classificação é por pontos,
                  // não por pancadas. As vistas de Grupos por strokeplay não se
                  // aplicam; mostra-se nota e remete para Individual / Draw.
                  if (fmt?.matchPlay) {
                    const mpResults = curClubes.matchPlayResults;
                    const banner = (
                      <MatchPlayBanner>
                        <strong>Match Play — classificação por pontos.</strong>{" "}{fmt.note}.
                        {mpResults
                          ? <> Dia 1 match play · Dia 2 stroke play (Palheiro Golf) — usa o selector de <strong>Dia</strong> e clica num clube para ver os jogadores. Confrontos buraco-a-buraco no tab <strong>Match Play</strong>.</>
                          : <> A classificação por equipa surge quando houver resultados; vê o <strong>Draw</strong> para os emparelhamentos 3-way.</>}
                      </MatchPlayBanner>
                    );
                    // Com resultados: mostra tabela de match play
                    if (clubesMp) {
                      return (
                        <>
                          {banner}
                          <div className="p-16"><TeamPointsStandings data={clubesMp.points} /></div>
                        </>
                      );
                    }
                    // Pré-jogo: mostra composição das equipas por clube e categoria
                    if (fmt.categories && grupos.length) {
                      return (
                        <>
                          {banner}
                          <ClubesCategoriasView
                            tournament={curClubes}
                            grupos={grupos}
                            playersDB={playersDB}
                            categories={fmt.categories}
                            rosterMode
                            bestNLabel={(n) => `máx. ${n} + 1 supl.`}
                            initialSort="hcp"
                            intro={<>Composição das equipas por clube — cada clube alinha em 3 campeonatos: <strong>Homens</strong>, <strong>Senhoras</strong> e <strong>Juniores</strong> (≤Sub-18). O número ao lado de cada categoria é o nº de inscritos; "máx." é o limite do regulamento (titulares + 1 suplente).</>}
                          />
                        </>
                      );
                    }
                    return (
                      <div className="fs-13 c-muted" style={{ padding: "32px 24px", textAlign: "center" }}>
                        <div className="mb-12" style={{ fontSize: "var(--fs-32)" }}>🆚</div>
                        <div className="fw-600 mb-6">Match Play — classificação por pontos</div>
                        <div className="fs-12">{fmt.note}<br/>A classificação por equipa (pontos) será apresentada quando os resultados forem publicados.<br/>Vê o tab <strong>Individual</strong> e o <strong>Draw</strong> para os emparelhamentos 3-way.</div>
                      </div>
                    );
                  }
                  // Torneios com categorias (ex: Regional Absoluto — Homens/
                  // Senhoras/Juniores) → sub-grupos por categoria dentro do clube.
                  if (fmt?.categories && grupos.length) {
                    return <ClubesCategoriasView
                      tournament={curClubes}
                      grupos={grupos}
                      playersDB={playersDB}
                      categories={fmt.categories}
                    />;
                  }
                  if (grupos.length) {
                    return <ClubesGruposView
                      grupos={grupos}
                      tournament={curClubes}
                      escKey={(esc === "sub18" ? "sub18" : "sub14")}
                      bestNByRound={isMidam ? fmt?.bestNByRound : undefined}
                      defaultBestN={isMidam ? (fmt?.defaultBestN ?? 5) : undefined}
                      maxHoleScore={isMidam ? Infinity : undefined}
                      formatNote={isMidam ? (fmt?.note ?? "Cada dia: 5 melhores resultados por equipa") : undefined}
                    />;
                  }
                  return (
                    <div className="fs-13 c-muted" style={{ padding: "32px 24px", textAlign: "center" }}>
                      <div className="mb-12" style={{ fontSize: "var(--fs-32)" }}>📋</div>
                      <div className="fw-600 mb-6">Vista de grupos não disponível para {curClubesYear}</div>
                      <div className="fs-12">Os dados de composição de grupos desta edição não estão carregados.<br/>Use o tab <strong>Individual</strong> para ver os resultados.</div>
                    </div>
                  );
                })()
            }
        </MasterDetail>
      )}

      {/* Master-detail Jovens */}
      {navMode === "torneios" && seriesFilter === "jovens" && (
        <MasterDetail md={md} sidebar={<>
            {jovensLoading && <LoadingState size="sm" message="A carregar…" />}
            {jovensLoaded && jovensGroups.length === 0 && !jovensLoading && (
              <div className="muted fs-11 u-pad-italic">Ficheiro não encontrado (ainda)</div>
            )}
            {/* A entrada "📊 Análise" foi REMOVIDA de /FPG/jovens em 2026-05-04
                — a análise agora vive exclusivamente na página dedicada /titulos
                (acessível via tab "🏆 Títulos" da NavBar de topo). */}
            {/* Entrada "📋 Inscrições 2026" DESACTIVADA 2026-04-27 — inscrições do
                Nacional Sub-12 fecharam, todos 19 inscritos confirmados (sem reservas).
                A rota /FPG/jovens/inscritosCN, o InscricoesPanel e o jovensShowInscricoes
                state mantêm-se intactos no código para reactivação rápida em próximas
                edições — basta voltar a `true` o flag abaixo. */}
            {false && (
            <a
              href="/FPG/jovens/inscritosCN"
              onClick={e => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  setJovensShowInscricoes(true);
                  setJovensGroupKey(null);
                  md.onSelect();
                  navigate("/FPG/jovens/inscritosCN");
                }
              }}
              className={`course-item${jovensShowInscricoes ? " active" : ""}`}
              style={{
                borderLeft: `4px solid ${SIDEBAR_ACCENT.tour}`, borderRadius: "0 6px 6px 0",
              }}
            >
              <div className="fw-700 fs-12">
                📋 Inscrições 2026
              </div>
              <div className="muted fs-11" >Campeonatos Nacionais de Jovens</div>
            </a>
            )}
            {jovensYears.map(yr => (
              <React.Fragment key={yr}>
                <div className="sidebar-section-title-dark">🏆 {yr}</div>
                {jovensByYear[yr].map(g => {
                  const totalJog = g.entries.reduce((s, e) => s + (e.playerCount || e.players.length), 0);
                  const t0 = g.entries[0];
                  // Mapa ccode → nome de região/organização
                  const regionLabel = REGION_LABEL[t0.ccode ?? ""] ?? t0.ccode ?? "";
                  // Data só dd/mm (ano já está no cabeçalho de secção)
                  const ddmm = g.date ? fmtDateShort(g.date) : "";
                  // Manuel detection: procurar em TODAS as entries do grupo (o grupo
                  // pode ter Sub 10 e Sub 14 do mesmo Regional — Manuel está só numa).
                  const groupHasManuel = g.entries.some(e => tournamentHasManuel(e));
                  const sidebarT: SidebarItemTournament = {
                    ...t0,
                    name: g.name,
                    playerCount: totalJog,
                    escalao: null,
                    ccode: "",     // sem ClubePill automático
                    date: undefined,  // sem data automática
                    _manuelInscrito: groupHasManuel,
                  };
                  return (
                    <TournSidebarItem
                      key={g.key}
                      t={sidebarT}
                      isActive={jovensGroupKey === g.key}
                      onClick={() => {
                        setJovensGroupKey(g.key); setJovensEscIdx(0); setJovensShowInscricoes(false); md.onSelect();
                        // Navegar imediatamente para a URL do torneio escolhido.
                        // Sem isto, o state→URL effect skipa pelo guard anti-race
                        // (params.tkey != curJovens novo) e o user fica preso na URL
                        // antiga (ex: 007-10551?tab=draw:2). Mesmo padrão usado em
                        // renderSidebarItem da sidebar principal. Para tcodes sintéticos
                        // "A+B", parseTournKey aceita o primeiro tcode no URL.
                        const t0 = g.entries[0];
                        const firstTcode = (t0?.tcode || "").split("+")[0];
                        if (t0?.ccode && firstTcode) {
                          const target = tournamentUrl("FPG", t0.ccode, firstTcode);
                          if (target && location.pathname !== target) {
                            navigate(target, { replace: true });
                          }
                        } else if (/\/inscritos/i.test(location.pathname)) {
                          // Fallback: torneio sem ccode/tcode válido → sair de /inscritos
                          navigate("/FPG/jovens");
                        }
                      }}
                      accentColor={SIDEBAR_ACCENT.tour}
                      extraPills={
                        <span className="flex-wrap" style={{ display: "inline-flex", gap: 3, marginTop: 2 }}>
                          {g.isRegional && !g.isNacional && <PillBadge pill="REGIONAL" />}
                          {g.entries.map(e => (
                            <EscPill key={e.tcode} esc={e.escalao ?? ""} />
                          ))}
                        </span>
                      }
                      footer={
                        <div className="mt-3" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {regionLabel && (
                            <span className="region-pill">{regionLabel}</span>
                          )}
                          <span className="fs-11 c-muted">{ddmm}</span>
                        </div>
                      }
                    />
                  );
                })}
              </React.Fragment>
            ))}
        </>}>
            {jovensShowInscricoes ? (
              <InscricoesPanel />
            ) : curJovensGroup ? (
              <>
                {/* Tabs por escalão — fundo com a cor do escalão (tokens --esc-subN-*).
                    Quando o grupo tem tanto M como F, border da cor do sexo (azul/rosa).
                    Se o grupo tem só um sexo, sem border (não é preciso distinguir). */}
                {curJovensGroup.entries.length > 1 && (
                  <div style={{ display: "flex", gap: 4, padding: "8px 12px 0", flexWrap: "wrap",
                    borderBottom: "1px solid var(--border-light)", background: "var(--bg-card)" }}>
                    {curJovensGroup.entries.map((e, ri) => {
                      const active = jovensEscIdx === ri;
                      // Estilo default (.tourn-tab / .active) — SEM cores do escalão
                      // (ver memória "Sem cores nos botões de escalão"). Os pills
                      // na sidebar continuam coloridos; só aqui nos botões é default.
                      // Label: _tabLabel (override p/ torneios combinados "Sub 10 e 12"
                      // ou "Sub 14 a 24") → escalao → fallback "Esc N".
                      const label = e._tabLabel ?? e.escalao ?? "Esc " + (ri + 1);
                      return (
                        <button key={e.tcode + "_" + ri}
                          className={`tourn-tab tourn-tab-sm${active ? " active" : ""}`}
                          onClick={() => setJovensEscIdx(ri)}
                          style={{ marginBottom: 6 }}>
                          {label}
                          <span className="fs-10" style={{ marginLeft: 3, opacity: 0.8 }}>
                            ({(e.playerCount || e.players.length)} jog)
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {curJovens
                  ? <TournamentDetail tournament={curJovens} escLookup={escLookup} playersDB={playersDB} extraTabs={fpgExtraTabs(editionsIndex, curJovens, playersDB, matchplayData)} />
                  : <div className="center-msg muted">Selecciona um torneio</div>
                }
              </>
            ) : (
              !jovensLoading && (
                jovensLoaded
                  ? <div className="center-msg muted">Selecciona um torneio</div>
                  : <LoadingState size="sm" message="A carregar…" />
              )
            )}
        </MasterDetail>
      )}

      {/* Ranking Sub-12 (e abaixo) — média dos 8 melhores SD oficiais de cada
          miúdo. Ver scripts/build-sub12-ranking.js. */}
      {navMode === "ranking-sub12" && (
        <div className="flex-1" style={{ overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
          <PJARankingView
            pjaList={sub12Tournaments}
            playersDB={playersDB}
            loading={sub12Loading}
            externalFilterName={searchQuery}
            specialRules={false}
            metric="sd"
            showMeters
            hcpFilterMax={25}
            emptyLabel="Sem torneios Sub-12."
          />
        </div>
      )}

      {/* CLASSIFICAÇÕES — ranking do calendário dos jogadores de referência
          (ver scripts/build-classificacoes.js). Reusa a vista do ranking PJA
          com as regras específicas do circuito PJA desligadas. */}
      {navMode === "classificacoes" && (
        <div className="flex-1" style={{ overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
          <PJARankingView
            pjaList={classifTournaments}
            playersDB={playersDB}
            loading={classifLoading}
            externalFilterName={searchQuery}
            specialRules={false}
            emptyLabel="Sem torneios para classificar."
          />
        </div>
      )}

      {/* Ranking PJA */}
      {navMode === "ranking-pja" && (
        <div className="flex-1" style={{ overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
          <PJARankingView pjaList={pjaRankingList} playersDB={playersDB} loading={loading} pjaMembersByYear={pjaMembers} pjaPdfSnapshotByYear={pjaPdfSnapshot} externalFilterName={searchQuery} />
        </div>
      )}
    </div>
    </DataSourcesProvider>
  );
}

export default function TorneiosAnalisePage() {
  return <Content />;
}
