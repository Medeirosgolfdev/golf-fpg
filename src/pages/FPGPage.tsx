// @refresh reset
/**
 * FPGPage.tsx — /FPG: torneios da federação portuguesa
 *
 * Vistas: Torneios (Todos / Jovens / Clubes / STO / PJA — todas pelo
 * CircuitShell), Ranking PJA, Ranking Sub-12 e Classificações (PJARankingView)
 * e o painel de inscrições. O torneio aberto sai só do URL (`tkey` →
 * resolveFpgTkey → shell); não há estado do torneio na página.
 *
 * Dados e contas fora da página (mapa em docs/claude/paginas.md):
 *   - src/data/fpgPageLoader.ts     — loaders (hooks) e listas derivadas
 *   - src/data/fpgFilesIndex.ts     — que pull-torneios/drive/aquapor existem
 *   - src/pages/fpg/fpgCircuitData.ts — torneios → entradas do CircuitShell
 *   - src/data/fpgRankingsLoader.ts — Ranking Sub-12 e Classificações
 *   - src/data/clubesFormats.ts     — formatos de equipa e match play dos Clubes
 *   - src/pages/fpg/fpgClubes.tsx   — abas «Grupos» e «Match Play» dos Clubes
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { SIDEBAR_ACCENT, EscPill, PillBadge } from "../ui/PillBadge";
import { TournSidebarItem, SSERRA_CCODE, type SidebarItemTournament } from "../ui/TournSidebarItem";
import { Toolbar, ToolbarTitle, ToolbarSep } from "../ui/Toolbar";
import { CircuitToolbarSlotCtx } from "../ui/circuit/toolbarSlot";
import ExtLink from "../ui/ExternalLink";
import { tournamentUrl, parseTournKey, fmtDateShort } from "../utils/format";
import { PJARankingView } from "../ui/PJARankingView";
// Tipos e utilitários FPG — fonte canónica em ../data/fpgTypes.ts e ../data/fpgUtils.ts
import type { Tournament } from "../data/fpgTypes";
import { buildDisplayList, tournamentHasManuel, isDriveOrAquapor } from "../data/fpgUtils";
import {
  useFpgPlayersDB, useFpgMainData, useFpgJovensData, useFpgPjaExtra,
  dedupDisplayTournaments, jovensCandidates, selectJovens, buildTcodePills,
} from "../data/fpgPageLoader";
import { useLazyRanking, SUB12_RANKING_URL, CLASSIFICACOES_URL } from "../data/fpgRankingsLoader";
import { isClubesMatchPlay } from "../data/clubesFormats";
import { isDNS } from "../ui/driveUtils";
import { InscricoesPanel, buildJovensGroups, buildEventGroups, type JovensGroup, type EventGroup } from "../ui/InscricoesComponents";
import { DataSourcesChip, DataSourcesProvider, type DataSource } from "../ui/DataSources";
// Re-exports para consumidores que ainda importam de FPGPage
export type { RoundScore, Player, Tournament, ScorecardOptions } from "../data/fpgTypes";
export { expandMultiRound } from "../data/fpgUtils";
export { ScorecardLB, AccumulatedLB, AllRoundsScorecardLB } from "../ui/LeaderboardComponents";
export { TournamentDetail } from "./fpg/TournamentDetail";

import { TOURN_PILLS } from "./fpg/constants";
import { isPJACore } from "../../ranking-pja/pja-rules.mjs";
import {
  type SeriesKey, URL_TO_FILTER, URL_TO_NAV, NAV_TO_URL, FILTER_TO_URL, INSCRITOS_SHORTCUTS,
  clubesCtRedirect,
} from "./fpg/routes";
import { TournamentDetail } from "./fpg/TournamentDetail";
import { buildFpgEditionsIndex, fpgPastEditionsTabs } from "./fpg/fpgPastEditions";
import { fpgOmRankingTabs } from "./fpg/fpgOmRanking";
import { fpgCourseTabs } from "./fpg/fpgCourseTab";
import { fpgMatchplayTabs, useFpgMatchplay, type FpgMatchplayData } from "./fpg/fpgMatchplay";
import { clubesLeadingTabs, CLUBES_DEFAULT_TAB } from "./fpg/fpgClubes";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitConfig, CircuitEntry } from "../ui/circuit/types";
import {
  buildFpgEntries, buildJovensEntries, buildClubesEntries, fpgRepDivision, resolveFpgTkey, fpgMemberKey,
  FPG_CONFIG, CLUBES_CONFIG,
} from "./fpg/fpgCircuitData";

/** Junta o tab do Match Play (Taça da Federação), o da Ordem de Mérito (CGSS)
 *  e o do campo («⛳ O campo», o «Como jogou» da /campos) aos tabs de "Edições
 *  anteriores". */
function fpgExtraTabs(editionsIndex: Parameters<typeof fpgPastEditionsTabs>[0], t: Parameters<typeof fpgOmRankingTabs>[0], playersDB?: Parameters<typeof fpgPastEditionsTabs>[2], matchplay?: FpgMatchplayData | null) {
  const tabs = [...(fpgMatchplayTabs(matchplay ?? null, t) ?? []), ...(fpgOmRankingTabs(t) ?? []), ...(fpgPastEditionsTabs(editionsIndex, t, playersDB) ?? []), ...(fpgCourseTabs(t) ?? [])];
  return tabs.length ? tabs : undefined;
}

/** Região/organização de um torneio de jovens pelo ccode (pill na sidebar de /FPG/jovens). */
const REGION_LABEL: Record<string, string> = {
  "000": "Nacional", "988": "Sul", "987": "Norte",
  "985": "Tejo", "983": "Açores", "982": "Madeira",
  "051": "Açores", "007": "Madeira", "910": "Norte",
  "059": "Palheiro", "005": "Açores",
};

function Content() {
  const location = useLocation();
  const navigate = useNavigate();
  const params   = useParams<{ filter?: string; sub?: string; tkey?: string }>();

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
  // Link antigo de Clubes (`/FPG/clubes?ct={ccode}-{tcode}`) → o URL canónico
  // do torneio (ver clubesCtRedirect). O <Navigate> vai no fim do render.
  const ctRedirect = clubesCtRedirect(urlSeg, location.search);
  // Pesquisa dos rankings sincronizada com o URL (`?q=pedro`). Declarado ANTES
  // dos useStates que dependem dele (Temporal Dead Zone).
  const [searchParams, setSearchParams] = useSearchParams();
  const [navMode, setNavMode]         = useState<"torneios" | "ranking-pja" | "ranking-sub12" | "classificacoes">(
    URL_TO_NAV[urlSeg] ?? "torneios"
  );
  const [seriesFilter, setSeriesFilter] = useState<SeriesKey>(showInscricoes ? "jovens" : startSeries);
  const [searchQuery, setSearchQuery]  = useState(() => searchParams.get("q") || "");  // filtro de texto dos rankings: jogador ou clube
  // ── Dados (src/data/fpgPageLoader.ts, fpgRankingsLoader.ts) ──────────────
  const { playersDB, escLookup } = useFpgPlayersDB();
  // pull-torneios + Clubes (os Clubes chegam primeiro, já com inscrições/draws)
  const {
    tournaments, fileMeta, loading, error,
    clubesTournaments, clubesLoaded, clubesMeta,
  } = useFpgMainData();
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
    if (ctRedirect) return;  // o <Navigate> do link antigo trata do URL
    const sp = new URLSearchParams(searchParams);
    // search
    if (searchQuery.trim()) sp.set("q", searchQuery.trim()); else sp.delete("q");
    // Normaliza links antigos: `shell` já não faz nada (o CircuitShell é o
    // default das vistas de torneios); `year` e `manuel` eram os filtros da
    // lista antiga de Clubes (hoje são os do CircuitShell).
    sp.delete("shell");
    sp.delete("year");
    sp.delete("manuel");
    if (sp.toString() !== searchParams.toString()) {
      setSearchParams(sp, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

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

  // Tab JOVENS: Nacionais Jovens + sintéticos + torneios juvenis de outras
  // fontes (pelo nome). Ano, ★Manuel e pesquisa são os do CircuitShell (como em
  // Todos/STO/PJA), por isso aqui só saem Drive/Aquapor e clubes em match play.
  const jovensGroups = useMemo(
    () => buildJovensGroups(selectJovens(jovensCandidates(jovensTournaments, tournaments), { filterManuel: false, yearFilter: null, searchTerm: "" })),
    [jovensTournaments, tournaments]
  );

  /** Lista que alimenta o tab "Todos": pull-torneios + clubes + jovens, UMA
   *  entrada por torneio (ver dedupDisplayTournaments). Drive Tour + Aquapor
   *  NÃO entram — vivem na /drive; pjaExtraTournaments só serve o Ranking PJA. */
  const displayList = useMemo(
    () => buildDisplayList(dedupDisplayTournaments(tournaments, jovensTournaments)),
    [tournaments, jovensTournaments]
  );

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

  // Event-groups globais — os mesmos torneios agrupados por (date+ccode) com
  // nome simplificado e split por Jaccard<0.5. Usado pelos tabs "Todos",
  // "Santo" e "PJA" para mostrar 1 linha por evento físico (não 1 por tcode).
  const allEventGroups = useMemo(
    // Drive/Aquapor NÃO aparecem na sidebar da /FPG (têm a página /drive). E os
    // torneios de clubes em MATCH PLAY vivem na vista /FPG/clubes (um deep-link
    // para eles passa para lá — ver tkeyToClubes) — não fazem sentido na lista
    // strokeplay "Todos".
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

  // ── Vista de Torneios via CircuitShell (Todos / Jovens / Clubes / Santo da Serra / PJA) ──
  // As vistas de torneios usam o shell partilhado (mesmo componente de /rfeg,
  // /drive, /major, …). Os rankings têm UI própria mais abaixo. O detalhe é
  // delegado ao TournamentDetail da FPG.
  const isJovensView = seriesFilter === "jovens";
  const isClubesView = seriesFilter === "clubes";
  const shellGroups: EventGroup[] = isJovensView ? jovensGroups
    : seriesFilter === "santo" ? santoEventGroups
    : seriesFilter === "" ? allEventGroups
    : pjaEventGroups;

  // Clubes: um torneio = uma entrada (ver buildClubesEntries). O detalhe é o
  // TournamentDetail com as abas «Grupos» e «Match Play» à frente das de
  // resultados, e abre em Grupos. `byId` dá o torneio original ao item da sidebar.
  const clubesShell = useMemo(() => {
    const ents = buildClubesEntries(clubesTournaments);
    const byId = new Map<string, Tournament>();
    ents.forEach((e, i) => {
      const orig = clubesTournaments[i];
      byId.set(e.id, orig);
      for (const d of e.divisions ?? []) {
        const t = d.results!;
        d.renderFull = () => (
          <TournamentDetail tournament={t} escLookup={escLookup} playersDB={playersDB}
            leadingTabs={clubesLeadingTabs(orig, playersDB)} defaultTab={CLUBES_DEFAULT_TAB}
            extraTabs={fpgExtraTabs(editionsIndex, t, playersDB, matchplayData)} />
        );
      }
    });
    return { entries: ents, byId };
  }, [clubesTournaments, escLookup, playersDB, editionsIndex, matchplayData]);

  const shellEntries = useMemo(() => {
    if (isClubesView) return clubesShell.entries;
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
  }, [isClubesView, clubesShell, isJovensView, jovensGroups, shellGroups, escLookup, playersDB, editionsIndex, matchplayData]);

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
  //
  // Torneio de clubes que não existe na vista aberta (os de match play não
  // entram em Todos/Jovens; ex.: link de fora para /FPG/torneio/059-10685) →
  // passa para a vista Clubes, onde ele vive. Os que existem na vista aberta
  // ficam nela: clicar num torneio de clubes a partir de Todos NÃO muda para
  // Clubes (a mesma regra «não arrastar» de Jovens).
  const tkeyClubesHit = !isClubesView && !!params.tkey && !shellSel.id
    && !!resolveFpgTkey(clubesShell.entries, params.tkey).id;
  // Match play: sabe-se logo que não está em Todos/Jovens; os outros esperam
  // que a vista aberta acabe de carregar.
  const tkeyToClubes = tkeyClubesHit && (
    isClubesMatchPlay(parseTournKey(params.tkey!) ?? {}) || (!loading && jovensLoaded && pjaExtraReady));
  const tkeyPending = !isClubesView && !!params.tkey && !shellSel.id
    && (loading || !jovensLoaded || !pjaExtraReady || !!tkeyDriveTarget || tkeyClubesHit);

  useEffect(() => {
    if (tkeyToClubes) setSeriesFilter("clubes");
  }, [tkeyToClubes]);

  useEffect(() => {
    if (tkeyDriveTarget) navigate(tkeyDriveTarget + location.search, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tkeyDriveTarget]);

  /** Deep-link canónico de um torneio (ccode-firstTcode), PRESERVANDO a query
   *  menos `tab` (a aba é de cada torneio). */
  const tournHref = useCallback((ccode: string | undefined, tcode: string | undefined): string | undefined => {
    const firstTcode = String(tcode ?? "").split("+")[0];
    const path = ccode && firstTcode ? tournamentUrl("FPG", ccode, firstTcode) : undefined;
    if (!path) return undefined;
    const sp = new URLSearchParams(location.search);
    sp.delete("tab");
    const s = sp.toString();
    return s ? `${path}?${s}` : path;
  }, [location.search]);

  // Navega o URL para o tcode canónico de uma divisão. Sem `tab`, o
  // TournamentDetail abre na sua aba por omissão (Grupos nos Clubes).
  const shellNavToDiv = useCallback((divKey: string, replace: boolean) => {
    const p = parseTournKey(divKey);
    if (!p) return;
    const target = tournHref(p.ccode, p.tcode);
    if (target && location.pathname + location.search !== target) navigate(target, { replace });
  }, [location.pathname, location.search, navigate, tournHref]);

  const shellConfig: CircuitConfig = isClubesView ? CLUBES_CONFIG : {
    ...FPG_CONFIG,
    grouping: seriesFilter === "" ? "month-year" : "year",
    escalaoSource: "fpg",
    title: seriesFilter === "santo" ? "⛳ Santo da Serra"
      : seriesFilter === "" ? "🇵🇹 FPG — Todos"
      : isJovensView ? "🏆 Jovens" : "🏆 PJA",
  };
  const shellView = (
    <CircuitShell
      // Clubes remonta o shell: os filtros começam com ★Manuel ligado
      // (CLUBES_CONFIG.defaultToggles), como na lista antiga.
      key={isClubesView ? "clubes" : "fpg"}
      entries={shellEntries}
      config={shellConfig}
      // Jovens: os ficheiros jovens_*.json chegam à parte — sem esta espera o
      // shell abria um juvenil dos pull-torneios e reescrevia o URL. Clubes só
      // espera pelos seus ficheiros (chegam antes dos pull-torneios).
      loading={isClubesView ? !clubesLoaded : (loading || tkeyPending || (isJovensView && !jovensLoaded))}
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
      // dd/mm, REGIONAL + escalões) e Clubes também (progresso «R2/3»).
      renderSidebarItem={(entry, { active, onSelect }) => {
        if (isClubesView) {
          const t = clubesShell.byId.get(entry.id);
          return t ? renderClubesSidebarItem(t, entry, { onClick: onSelect, href: tournHref(t.ccode, t.tcode), isActive: active }) : null;
        }
        const g = shellGroups.find(gr => gr.key === entry.id);
        if (!g) return null;
        const href = tournHref(g.entries[0]?.ccode, g.entries[0]?.tcode);
        const jg = isJovensView ? jovensGroups.find(gr => gr.key === entry.id) : undefined;
        return jg
          ? renderJovensSidebarItem(jg, { onClick: onSelect, href, isActive: active })
          : renderSidebarItem(g, { onClick: onSelect, href, isActive: active });
      }}
    />
  );

  // Vistas de torneios servidas pelo CircuitShell (Todos/Jovens/Clubes/Santo/
  // PJA). O shell traz a sua própria pesquisa + toggle de sidebar, por isso os
  // equivalentes da toolbar exterior são escondidos aqui (evita chrome
  // duplicado). O painel de inscrições e os modos Ranking/Classificações
  // mantêm a toolbar exterior.
  const shellTorneios = navMode === "torneios" && !showInscricoes;

  /** Item de sidebar da vista Clubes: o mesmo TournSidebarItem, com o campo
   *  seguido do progresso («· R2/3») quando o torneio vai a meio, «N jog»
   *  (num match play, os jogadores dos confrontos) e ★Manuel também pelos
   *  confrontos. Cor de Clubes na borda. */
  function renderClubesSidebarItem(t: Tournament, entry: CircuitEntry, opts: { onClick: () => void; href?: string; isActive: boolean }) {
    const playedR = Math.max(0, ...t.players.map(p => p.roundScores?.length ?? 0));
    const nR = t.rounds || 1;
    const progressSuffix = nR > 1 && playedR > 0 && playedR < nR ? ` · R${playedR}/${nR}` : "";
    const sidebarT: SidebarItemTournament = {
      ...t,
      playerCount: entry.playerCount,
      campo: (t.campo || "Oporto") + progressSuffix,
      _manuelInscrito: !!entry.hasManuel,
    };
    return (
      <TournSidebarItem
        key={entry.id}
        t={sidebarT}
        isActive={opts.isActive}
        onClick={opts.onClick}
        href={opts.href}
        accentColor={SIDEBAR_ACCENT.clubes}
      />
    );
  }

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
   *    pills agregados de todas as entradas. */
  function renderSidebarItem(g: EventGroup, opts: { onClick: () => void; href?: string; isActive: boolean }) {
    const isMulti = g.entries.length > 1;
    // Escalão aberto no URL dentro do grupo (ou o primeiro) — é dele que sai o
    // campo/tcode/players do `tData`.
    const activeEntry = g.entries.find(e => fpgMemberKey(e) === shellSel.divKey) ?? g.entries[0];

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
          <ToolbarTitle>🏌️ FPG</ToolbarTitle>
          <DataSourcesChip sources={allSources} />
          {/* Pesquisa exterior: só nos modos Ranking/Classificações (filtra
              jogadores). Nas vistas de torneios é o CircuitShell que pesquisa. */}
          {!loading && navMode !== "torneios" && (<>
            <ToolbarSep />
            <div className="toolbar-search">
              <span aria-hidden="true" className="toolbar-search-icon">🔎</span>
              <input
                type="search"
                className="toolbar-search-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={navMode === "ranking-sub12" ? "jogador..." : "jogador ou clube..."}
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
              { key: "ranking-sub12", label: "🏅 Ranking Sub-12 por SD" },
              { key: "classificacoes", label: "🏆 Classificações" },
            ] as const).map(({ key, label }) => (
              <button key={key} role="tab" aria-selected={navMode === key}
                className={"seg-btn" + (navMode === key ? " active" : "")}
                onClick={() => {
                  setNavMode(key);
                  setSeriesFilter("");
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
                        // Preserva a query (ex.: ?q=…); remove `tab` (é por-torneio).
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
            </>)}
  </>);
  const fpgTrail = (<>
            {!loading && (<>
            <ExtLink href="https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=XH256YF45T"
              className="ext-link-outline fs-11 fw-600">
              FPG Torneios ↗
            </ExtLink>
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

  // Link antigo `/FPG/clubes?ct=…` → `/FPG/torneio/…` (depois de todos os hooks).
  if (ctRedirect) return <Navigate to={ctRedirect} replace />;

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

      {/* Torneios (Todos / Jovens / Clubes / Santo da Serra / PJA) — vista via CircuitShell */}
      {shellTorneios && (
        <CircuitToolbarSlotCtx.Provider value={{ lead: fpgLead, trail: fpgTrail, hideTitle: true }}>
          {shellView}
        </CircuitToolbarSlotCtx.Provider>
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
