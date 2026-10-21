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
import { buildFpgEntries, buildJovensEntries, fpgRepDivision, resolveFpgTkey, FPG_CONFIG } from "./fpg/fpgCircuitData";
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
  // Painel de inscrições (InscricoesPanel) — sai só do URL: /FPG/jovens/inscritosCN
  // ou os atalhos /FPG/inscritosCN e /FPG/inscritos. Fica fora do CircuitShell.
  const showInscricoes = !params.tkey && (isInscritosShortcut
    || (startSeries === "jovens" && INSCRITOS_SHORTCUTS.has(urlSub)));
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
    (showInscricoes || urlSeg === "jovens") ? "jovens" : ""
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
  // fontes (pelo nome). Ano, ★Manuel e pesquisa são os do CircuitShell (como em
  // Todos/STO/PJA), por isso aqui só saem Drive/Aquapor e clubes em match play.
  const jovensGroups = useMemo(
    () => buildJovensGroups(selectJovens(jovensCandidates(jovensTournaments, tournaments), { filterManuel: false, yearFilter: null, searchTerm: "" })),
    [jovensTournaments, tournaments]
  );

  // Anti-loop: quando o URL→state aplica actualizações de estado, levanta este
  // flag para que o state→URL a seguir SALTE uma navegação. Sem isto o
  // state→URL pode disparar com estado "stale" enquanto o URL→state ainda está
  // a sincronizar, e navegar para URL errada (ping-pong entre dois torneios).
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
  // desse formato), procurar o torneio em displayList e alinhar `selected`
  // (alimenta `cur`, usado no state→URL). A vista em si (Todos/Jovens/STO/PJA)
  // resolve o grupo e o escalão pelo URL no CircuitShell (`shellSel`).
  //
  // ⚠ Regra «não arrastar para Jovens»: NÃO forçar setSeriesFilter("jovens")
  // aqui — antes fazia-se e clicar num torneio Nacional Jovens a partir do tab
  // "Todos" arrastava o utilizador para o tab "Jovens". O "Todos" já mostra os
  // mesmos torneios com escalão-tabs no detalhe. Um deep-link externo
  // (`/FPG/torneio/...`) abre em Todos; vindo de Jovens, fica em Jovens (o
  // effect do urlSeg não mexe na série quando há :tkey).
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
    if (import.meta.env.DEV) console.log("[URL→state]", { urlTkey, idx, selected, seriesFilter });
    if (idx >= 0 && idx !== selected) {
      setSelected(idx);
      // URL é a fonte de verdade; o state→URL não deve reagir a este alinhamento.
      skipNextStateUrlRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTkey, displayList]);

  // ── Deep-link: sync estado (torneio seleccionado) → URL ────────────────
  // Quando o utilizador clica num torneio na sidebar, actualizar a URL para
  // reflectir a selecção (`/FPG/torneio/{ccode}-{tcode}` com `replace: true`
  // para não poluir o histórico do browser).
  //
  // IMPORTANTE: deps=[cur, navMode] APENAS. Não incluir `seriesFilter` nem
  // `showInscricoes` — se incluídos, clicar num tab (ex: "SSerra" →
  // navega para `/FPG/sto`) dispara este effect e sobrepõe a URL com
  // `/FPG/torneio/...` (o `cur` do displayList não muda com troca de tab).
  // O effect apenas deve disparar quando o TORNEIO muda de facto.
  //
  // Skip explícito (lido via closure, não por deps):
  //   - Painel de inscrições (`showInscricoes`) — URL dedicada
  //   - Vista Clubes — a URL `/FPG/clubes` não conflita e a selecção é local
  //
  // Não há loop: o useEffect URL→estado acima só muda `selected` se
  // `idx !== selected`, por isso navegar para a URL actual é no-op.
  useEffect(() => {
    if (showInscricoes) return;
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
    // Guarda anti-loop: se o URL→state acabou de actualizar o estado, saltar
    // esta execução — o próximo render terá estado consistente e a URL coincidirá.
    if (skipNextStateUrlRef.current) {
      skipNextStateUrlRef.current = false;
      if (import.meta.env.DEV) console.log("[state→URL] SKIPPED (URL→state in flight)");
      return;
    }
    const t: Tournament | undefined = cur;
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
    if (import.meta.env.DEV) console.log("[state→URL]", { from: location.pathname, target, seriesFilter, tcode: t.tcode });
    if (target && location.pathname !== target) {
      navigate(target, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, navMode]);

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

  // ── Vista de Torneios via CircuitShell (Todos / Jovens / Santo da Serra / PJA) ──
  // As vistas de torneios usam o shell partilhado (mesmo componente de /rfeg,
  // /drive, /major, …). Não afecta Clubes / rankings (que têm UI própria mais
  // abaixo). O detalhe é delegado ao TournamentDetail da FPG.
  const isJovensView = seriesFilter === "jovens";
  const shellGroups: EventGroup[] = isJovensView ? jovensGroups
    : seriesFilter === "santo" ? santoEventGroups
    : seriesFilter === "" ? allEventGroups
    : pjaEventGroups;
  const shellEntries = useMemo(() => {
    // Jovens: ano da edição e contagem de inscritos nos torneios por disputar.
    const ents = isJovensView ? buildJovensEntries(jovensGroups) : buildFpgEntries(shellGroups);
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
  }, [isJovensView, jovensGroups, shellGroups, escLookup, playersDB, editionsIndex, matchplayData]);

  // Deep-link /FPG/torneio/{ccode}-{tcode} → (grupo, escalão) — ver resolveFpgTkey.
  const shellSel = useMemo(() => resolveFpgTkey(shellEntries, params.tkey), [params.tkey, shellEntries]);

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
      : seriesFilter === "" ? "🇵🇹 FPG — Todos"
      : isJovensView ? "🏆 Jovens" : "🏆 PJA",
  };
  const shellView = (
    <CircuitShell
      entries={shellEntries}
      config={shellConfig}
      // Jovens: os ficheiros jovens_*.json chegam à parte — sem esta espera o
      // shell abria um juvenil dos pull-torneios e reescrevia o URL.
      loading={loading || tkeyPending || (isJovensView && !jovensLoaded)}
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
      // O grupo vem por id (= EventGroup.key). Jovens tem item próprio (região,
      // dd/mm, REGIONAL + escalões).
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
        const jg = isJovensView ? jovensGroups.find(gr => gr.key === entry.id) : undefined;
        return jg
          ? renderJovensSidebarItem(jg, { onClick: onSelect, href, isActive: active })
          : renderSidebarItem(g, { onClick: onSelect, href, isActive: active });
      }}
    />
  );

  // Vistas de torneios servidas pelo CircuitShell (Todos/Jovens/Santo/PJA). O
  // shell traz a sua própria pesquisa + toggle de sidebar, por isso os
  // equivalentes da toolbar exterior são escondidos aqui (evita chrome
  // duplicado). Clubes (master-detail próprio), o painel de inscrições e os
  // modos Ranking/Classificações mantêm-nos.
  const shellTorneios = navMode === "torneios" && seriesFilter !== "clubes" && !showInscricoes;

  /** Item de sidebar da vista Jovens: nome do evento, ★Manuel (também pré-jogo),
   *  «N jog» somado dos escalões, pill REGIONAL + um EscPill por escalão e, no
   *  rodapé, a região/organização (pelo ccode) e a data dd/mm (o ano está no
   *  cabeçalho de secção). Sem ClubePill nem data automática do item. */
  function renderJovensSidebarItem(g: JovensGroup, opts: { onClick: () => void; href?: string; isActive: boolean }) {
    const t0 = g.entries[0];
    const totalJog = g.entries.reduce((s, e) => s + (e.playerCount || e.players.length), 0);
    const regionLabel = REGION_LABEL[t0.ccode ?? ""] ?? t0.ccode ?? "";
    const ddmm = g.date ? fmtDateShort(g.date) : "";
    const sidebarT: SidebarItemTournament = {
      ...t0,
      name: g.name,
      playerCount: totalJog,
      escalao: null,
      ccode: "",        // sem ClubePill automático
      date: undefined,  // sem data automática
      _manuelInscrito: g.entries.some(tournamentHasManuel),
    };
    return (
      <TournSidebarItem
        key={g.key}
        t={sidebarT}
        isActive={opts.isActive}
        onClick={opts.onClick}
        href={opts.href}
        accentColor={SIDEBAR_ACCENT.tour}
        extraPills={
          <span className="inline-flex flex-wrap gap-3 mt-2">
            {g.isRegional && !g.isNacional && <PillBadge pill="REGIONAL" />}
            {g.entries.map(e => <EscPill key={e.tcode} esc={e.escalao ?? ""} />)}
          </span>
        }
        footer={
          <div className="flex-center gap-6 mt-3">
            {regionLabel && <span className="region-pill">{regionLabel}</span>}
            <span className="fs-11 c-muted">{ddmm}</span>
          </div>
        }
      />
    );
  }

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
          {/* Toggle exterior escondido nas vistas do shell (o shell tem o seu) e
              no painel de inscrições (não tem sidebar). */}
          {!shellTorneios && !showInscricoes && <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Torneios" />}
          <ToolbarTitle>🏌️ FPG</ToolbarTitle>
          <DataSourcesChip sources={allSources} />
          {/* Pesquisa exterior: nos modos Ranking/Classificações filtra jogadores;
              em Clubes filtra a lista. Nas vistas do shell (Torneios) é o
              shell que pesquisa, por isso esconde-se aqui. */}
          {!loading && !shellTorneios && (<>
            <ToolbarSep />
            {/* Search unificado — mesmo local e tamanho em todos os modos.
                Filtra jogadores em Ranking PJA, a lista em Clubes, etc.
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
                cabeçalho limpo (estilo /ffg). Clubes mantém-nos (filtram
                a lista master-detail própria). */}
            {navMode === "torneios" && seriesFilter === "clubes" && availYears.length > 1 && (<>
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
                  {/* Contador exterior só em Clubes (sem shell) — nas vistas do
                      shell o próprio CircuitShell mostra a contagem. */}
                  {navMode === "torneios" && seriesFilter === "clubes" && (() => {
                    const count = clubesList.length;
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

      {/* Painel de inscrições dos Nacionais de Jovens — /FPG/jovens/inscritosCN,
          /FPG/inscritosCN, /FPG/inscritos. Fora do CircuitShell. A entrada na
          sidebar foi desligada a 2026-04-27 (inscrições do Nacional Sub-12
          fechadas); as rotas e o InscricoesPanel ficam para próximas edições. */}
      {navMode === "torneios" && showInscricoes && (
        <div className="fpg-pane-scroll">
          <InscricoesPanel />
        </div>
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
