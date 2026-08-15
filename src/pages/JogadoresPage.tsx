/**
 * JogadoresPage — shell master-detail da página de jogadores.
 *
 * Refactor 2026-08-15 (Fase 1 da melhoria de raiz): o monólito de ~4700 linhas
 * foi partido em módulos em src/pages/jogadores/ — este ficheiro guarda apenas
 * o estado da página (selecção, viewMode, dados carregados), a sincronização
 * com o URL e a composição toolbar + sidebar + detalhe.
 *
 *   - Filtros:      useJogadoresFilters (estado) + filterPlayers.ts (lógica pura)
 *   - Toolbar:      jogadores/JogadoresToolbar.tsx
 *   - Sidebar item: jogadores/PlayerSidebarItem.tsx
 *   - Detalhe rico: jogadores/PlayerDetail.tsx (+ views/)
 *   - Cadastro/live: jogadores/FederadoOnlyDetail.tsx
 *   - Painéis stats: jogadores/FederadosStatsPanel.tsx + FilteredStatsCard.tsx
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { useMasterDetail } from "../hooks/useMasterDetail";
import { MOBILE_BREAKPOINT } from "../hooks/useIsMobile";
import { loadPlayerStats, daysSince, type PlayerStatsDb } from "../data/playerStatsTypes";
import { loadFederados, federadoToPlayer, mergePlayersWithFederados, normalizeAgeLevel, type FederadoRaw, type MergedPlayer } from "../data/federadosLoader";
import { loadFederadosPP, getPPByFed, hasRealPPHcp, type FederadoPP } from "../data/federadosPPLoader";
import { coerceEscalao, isSeniorEscalao, ESC_ORDER_FULL as ESC_ORDER, ESCALOES_JOVENS } from "../constants/escaloes";
import { clubShort } from "../utils/playerUtils";
import { buildCourseKeyMap, setCourseKeyMap } from "../ui/jogadoresHelpers";
import SexBadge from "../ui/SexBadge";
import EmptyState from "../ui/EmptyState";
import type { DataSource } from "../ui/DataSources";
import { useJogadoresFilters } from "./jogadores/useJogadoresFilters";
import {
  filterAndSortPlayers, countByEscalao, computeHcpStatsByEscalao, buildSearchIndex,
  NEW_DAYS, type ViewMode, type JogadoresFilterState,
} from "./jogadores/filterPlayers";
import { readFiltersFromParams, writeFiltersToParams, hasFilterParams, loadPrefs, savePrefs } from "./jogadores/filtersUrl";
import JogadoresToolbar, { type ToolbarCounts } from "./jogadores/JogadoresToolbar";
import PlayerSidebarItem, { type PlayerSidebarPlayer } from "./jogadores/PlayerSidebarItem";
import PlayerDetail from "./jogadores/PlayerDetail";
import FederadoOnlyDetail from "./jogadores/FederadoOnlyDetail";
import FederadosStatsPanel, { computeGlobalStats } from "./jogadores/FederadosStatsPanel";
import FilteredStatsCard, { type FilteredPlayer } from "./jogadores/FilteredStatsCard";
import { syntheticFederadoFromFedCode } from "./jogadores/syntheticFederado";
import type { PlayerPageData } from "../data/playerDataLoader";

export default function JogadoresPage() {
  const { players, simCourses: courses } = useAppContext();
  const { fed: urlFed } = useParams<{ fed?: string }>();
  const navigate = useNavigate();
  const [selectedFed, setSelectedFed] = useState<string | null>(urlFed ?? null);
  const isMobileInit = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT;
  const md = useMasterDetail(!(isMobileInit && urlFed));
  const [playerMeta, setPlayerMeta] = useState<PlayerPageData["META"] | null>(null);
  const [statsDb, setStatsDb] = useState<PlayerStatsDb>({});

  /* Ref para distinguir navegação interna (selectPlayer) de externa (URL directo) */
  const internalNav = React.useRef(false);

  /* Helper — limpa APENAS o estado de selecção (mostra FilteredStatsCard).
     A URL fica como está (ex: /jogadores/52884) — é tratada como "última
     posição" e não como "estado actual". Se o user fizer F5, volta ao
     Manuel; mas enquanto navega o estado interno pode estar dessincronizado
     da URL para permitir TODOS, filtros, etc.
     IMPORTANTE: marca `internalNav` para que o URL sync useEffect não
     re-aplique imediatamente o urlFed quando o componente re-renderizar. */
  const clearSelection = () => {
    if (selectedFed !== null) {
      internalNav.current = true;
      setSelectedFed(null);
    }
  };

  /* ── Estado inicial: URL partilhado > preferências (localStorage) > default.
     Mesmo padrão da SimuladorPage: lê-se UMA vez no arranque (initializers);
     depois um único efeito espelha estado → query params com replace.
     FILTROS são partilháveis (URL); viewMode/seniores/⭐ são PREFERÊNCIAS
     (localStorage), sobrepostas pelo URL quando um link partilhado as traz. */
  const [initialState] = useState(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const prefs = loadPrefs();
    const base: Partial<JogadoresFilterState> = {};
    if (prefs.includeSeniors != null) base.includeSeniors = prefs.includeSeniors;
    if (prefs.prioritizeJuniors != null) base.prioritizeJuniors = prefs.prioritizeJuniors;
    const fromUrl = hasFilterParams(params) ? readFiltersFromParams(params) : { patch: {}, viewMode: undefined };
    return {
      filters: { ...base, ...fromUrl.patch },
      viewMode: (fromUrl.viewMode ?? prefs.viewMode ?? "todos") as ViewMode,
      showStats: params.get("stats") === "1",
    };
  });

  /* ── Filtros (estado + lógica pura em jogadores/filterPlayers.ts) ── */
  const filtersApi = useJogadoresFilters(clearSelection, initialState.filters);
  const { filters, activeFiltersCount } = filtersApi;
  const rankingMode = filters.sortKey === "ranking";

  /* ── Modo TODOS (federados.json) ──────────────────────────────── */
  // Default "todos" — garante que qualquer link externo para um federado (ex. do
  // DrawTab/AdmissionsTab) é encontrado, mesmo que o jogador não esteja nos 261
  // curados de players.json. O user pode alternar para "Nossos" na toolbar.
  const [viewMode, setViewMode] = useState<ViewMode>(initialState.viewMode);
  const [federados, setFederados] = useState<FederadoRaw[] | null>(null);
  const [loadingFeds, setLoadingFeds] = useState(false);
  // Pitch & Putt: mapa fed → registo P&P (federados-pp.json) + filtro "só P&P".
  const [ppMap, setPpMap] = useState<Map<string, FederadoPP>>(new Map());
  const [showStats, setShowStats] = useState(initialState.showStats);
  const [drillDown, setDrillDown] = useState<{ type: "club" | "age"; key: string } | null>(null);
  const [hcpBinDrill, setHcpBinDrill] = useState<string | null>(null);
  const MAX_SIDEBAR_ITEMS = 2000;  // era 500 — subido 2026-04-15 para permitir encontrar jogadores com nomes comuns sem refinar filtros
  // Escalões jovens (Sub-*) — quando o filtro só tem jovens, levantamos o cap
  // porque são poucos e o user quer ver todos sem ter de refinar mais
  const isJuvenilFilter = filters.escalaoFilter.size > 0 && [...filters.escalaoFilter].every(e => /^Sub-?\s*\d+$/i.test(e));

  const [federadosError, setFederadosError] = useState<string | null>(null);

  /* ── Espelho estado → URL + preferências → localStorage ─────────
     Regra da casa (FPGPage): escrever só não-defaults sobre uma CÓPIA dos
     searchParams actuais (preserva ?view= do PlayerDetail), comparar antes
     de setSearchParams, replace SEMPRE (não polui o histórico). */
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const sp = new URLSearchParams(searchParams);
    writeFiltersToParams(filters, viewMode, sp);
    if (showStats && viewMode === "todos") sp.set("stats", "1");
    else sp.delete("stats");
    if (sp.toString() !== searchParams.toString()) setSearchParams(sp, { replace: true });
    savePrefs({ viewMode, includeSeniors: filters.includeSeniors, prioritizeJuniors: filters.prioritizeJuniors });
    // deps SEM searchParams: o guard de comparação evita loops e cada render
    // fecha sobre a versão fresca (padrão FPGPage/Simulador).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, viewMode, showStats]);

  useEffect(() => {
    // Carrega federados em ambos os modos (nossos + todos) para enriquecimento
    // (bandeira por país, HCP FPG, encryptedfedcode, etc.). Ficheiro é cacheado
    // após primeira carga via cachedFetchJson — sem custo em re-navegações.
    if (!federados && !loadingFeds && !federadosError) {
      setLoadingFeds(true);
      setFederadosError(null);
      if (import.meta.env.DEV) console.log("[federados] A carregar /data/federados.json...");
      loadFederados()
        .then(f => {
          if (import.meta.env.DEV) console.log("[federados] OK -", f.players?.length, "jogadores");
          setFederados(f.players);
        })
        .catch(err => {
          // NÃO reverter para "ours" — manter TODOS activo para o user ver o erro.
          console.error("[federados] Falha ao carregar federados.json:", err);
          setFederadosError(String(err?.message || err));
        })
        .finally(() => setLoadingFeds(false));
    }
  }, [viewMode, federados, loadingFeds, federadosError]);

  useEffect(() => { loadPlayerStats().then(setStatsDb); }, []);
  // Carregar o mundo Pitch & Putt (degrada a Map vazio se o ficheiro não existir).
  useEffect(() => { loadFederadosPP().then(() => setPpMap(getPPByFed())).catch(() => { /* sem P&P */ }); }, []);

  /* Sync URL param → selectedFed (só limpa q em navegação externa).
     IMPORTANTE: deps APENAS [urlFed]. Antes tinha [urlFed, players] mas
     `players` (do AppContext) é um objecto re-criado em cada render do App.tsx,
     fazendo este effect disparar em loop e re-aplicar o urlFed mesmo após
     o user clicar TODOS / outro filtro.

     Sincroniza SEMPRE quando urlFed muda — mesmo que o player não esteja em
     `players` (Nossos). Para fed codes externos (jogadores de federados.json
     ou stubs sintéticos vindos de /nacionais-jovens/históricos), o `selected`
     useMemo abaixo trata de construir um stub e renderizar FederadoOnlyDetail. */
  useEffect(() => {
    if (urlFed) {
      setSelectedFed(urlFed);
      if (!internalNav.current && players[urlFed]) {
        // Só limpar a pesquisa quando o fed pertence a Nossos — evita
        // resetar o filtro do user em navegações externas para feds desconhecidos.
        filtersApi.update({ q: "" });
      }
      internalNav.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFed]);

  /* Helper: select player and update URL. Preserva a query de filtros
     (partilhável desde a Fase 2) e apaga só o ?view= — a vista é por-jogador,
     como o ?tab= por-torneio da FPGPage. */
  const selectPlayer = useCallback((fed: string | null) => {
    setSelectedFed(fed);
    const sp = new URLSearchParams(window.location.search);
    sp.delete("view");
    const qs = sp.toString();
    const suffix = qs ? `?${qs}` : "";
    if (fed) {
      internalNav.current = true;
      navigate(`/jogadores/${fed}${suffix}`, { replace: true });
    } else {
      navigate(`/jogadores${suffix}`, { replace: true });
    }
  }, [navigate]);

  /* Callback ESTÁVEL para os itens da sidebar (React.memo depende disto). */
  const handleSidebarSelect = useCallback((fed: string) => {
    selectPlayer(fed);
    md.onSelect();
  }, [selectPlayer, md.onSelect]);

  // Populate course key map for course links
  useEffect(() => {
    if (courses?.length) {
      setCourseKeyMap(buildCourseKeyMap(courses));
    }
  }, [courses]);

  // Reset meta when player changes
  useEffect(() => { setPlayerMeta(null); }, [selectedFed]);

  const allPlayers = useMemo(() => {
    if (federados) {
      // Com federados carregados, fazemos sempre merge para obter country_prefix,
      // diffs FPG, encryptedfedcode, etc. Em NOSSOS filtramos para excluir os
      // "feds" (cadastro-only FPG) e manter apenas os nossos jogadores enriquecidos.
      const merged = mergePlayersWithFederados(players, federados)
        .map(p => ({ fed: p.nfed, ...p }));
      if (viewMode === "todos") return merged;
      return merged.filter(p => p._source !== "feds");
    }
    // Fallback (federados ainda a carregar) — usar players.json directo,
    // coagindo escalão inválido/vazio para "Absoluto" (consistente com o merge).
    return Object.entries(players).map(([fed, p]) => {
      return ({ fed, ...p, escalao: coerceEscalao(p.escalao) } as typeof p & { fed: string; _source?: MergedPlayer["_source"]; _federadoRaw?: FederadoRaw; _fpgDiffs?: MergedPlayer["_fpgDiffs"] });
    });
  }, [players, viewMode, federados]);

  const escaloes = useMemo(() => {
    const present = new Set<string>();
    allPlayers.forEach(p => p.escalao && present.add(p.escalao));
    return ESC_ORDER.filter(e => present.has(e));
  }, [allPlayers]);

  /** Estatísticas de HCP por escalão — para o HcpPill da sidebar (percentis
   *  dentro do escalão). Ver computeHcpStatsByEscalao em filterPlayers.ts. */
  const hcpStatsByEscalao = useMemo(() => computeHcpStatsByEscalao(allPlayers), [allPlayers]);

  const regions = useMemo(() => {
    const s = new Set<string>();
    allPlayers.forEach(p => p.region && s.add(p.region));
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [allPlayers]);

  /* ── Opções de clube (ambos os modos) ───────────────────────── */
  const clubOptions = useMemo(() => {
    const counts = new Map<string, { code: string; short: string; count: number }>();
    for (const p of allPlayers) {
      const c = typeof p.club === "object" ? p.club : null;
      if (!c?.code) continue;
      const existing = counts.get(c.code);
      if (existing) existing.count++;
      else counts.set(c.code, { code: c.code, short: c.short || c.code, count: 1 });
    }
    return [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .map(c => ({ code: c.code, label: `${c.short} (${c.count})` }));
  }, [allPlayers]);

  /* ── Estatísticas globais (modo TODOS) ──────────────────────── */
  const globalStats = useMemo(() => {
    if (viewMode !== "todos" || !federados) return null;
    return computeGlobalStats(federados);
  }, [federados, viewMode]);

  /* Índice de pesquisa (fed → haystack) — calculado 1× por lista; sem ele
     cada keystroke reconstruía o haystack de ~15k jogadores 2× (filtered +
     escalaoCountMap). */
  const searchIndex = useMemo(() => buildSearchIndex(allPlayers), [allPlayers]);

  /* Contagens por escalão para as pills da toolbar (reage a pesquisa/sexo/região). */
  const escalaoCountMap = useMemo(
    () => countByEscalao(allPlayers, { q: filters.q, sexFilter: filters.sexFilter, regionFilter: filters.regionFilter }, searchIndex),
    [allPlayers, filters.q, filters.sexFilter, filters.regionFilter, searchIndex],
  );

  /* Lista filtrada + ordenada da sidebar — lógica pura em filterPlayers.ts. */
  const filtered = useMemo(
    () => filterAndSortPlayers(allPlayers, filters, { viewMode, statsDb, ppMap, searchIndex }),
    [allPlayers, filters, viewMode, statsDb, ppMap, searchIndex],
  );

  /* Contagens da toolbar — memoizadas aqui para a toolbar não varrer 15k
     jogadores em cada render (era inline no JSX). */
  const toolbarCounts = useMemo<ToolbarCounts>(() => ({
    nossosTotal: Object.keys(players).length,
    nossosNonSenior: Object.values(players).filter(p => !isSeniorEscalao(coerceEscalao(p.escalao))).length,
    todosTotal: federados ? federados.length : null,
    // MESMA normalização que a sidebar (federadoToPlayer → normalizeAgeLevel):
    // Senior→Sénior, SuperSenior→Sénior, MidAmateur→Absoluto.
    todosNonSenior: federados ? federados.filter(f => !isSeniorEscalao(normalizeAgeLevel(f.age_level))).length : null,
    newCount: allPlayers.filter(p => { const d = daysSince(statsDb[p.fed]); return d != null && d <= NEW_DAYS; }).length,
    ppCount: ppMap.size > 0 ? allPlayers.filter(p => hasRealPPHcp(ppMap.get(p.fed))).length : 0,
  }), [players, federados, allPlayers, statsDb, ppMap]);

  /* Proveniência dos dados (DataSourcesChip — padrão FPG/Drive/KIDS2). */
  const dataSources = useMemo<DataSource[]>(() => [
    { path: "/data/federados.json", status: federadosError ? "error" : federados ? "loaded" : "loading", count: federados?.length, error: federadosError ?? undefined },
    { path: "/data/player-stats.json", status: Object.keys(statsDb).length > 0 ? "loaded" : "loading", count: Object.keys(statsDb).length || undefined },
    { path: "/data/federados-pp.json", status: ppMap.size > 0 ? "loaded" : "loading", count: ppMap.size || undefined },
  ], [federados, federadosError, statsDb, ppMap]);

  // Ranking positions based on HCP (global, not filtered)
  const rankings = useMemo(() => {
    const withHcp = allPlayers
      .filter(p => p.hcp != null)
      .sort((a, b) => (a.hcp ?? 999) - (b.hcp ?? 999));
    const map = new Map<string, number>();
    withHcp.forEach((p, i) => map.set(p.fed, i + 1));
    return map;
  }, [allPlayers]);

  const selected = useMemo(() => {
    if (!selectedFed) return null;
    const inAll = allPlayers.find(p => p.fed === selectedFed);
    if (inAll) return inAll;
    // Fallback 1: jogador não está em allPlayers (ex: cheguei de /nacionais-jovens
    // com fed externo que não foi carregado pelo modo Nossos). Procurar
    // directamente em federados.json e construir entry sintético — assim
    // a página renderiza sempre, mostrando vista federado mínima.
    if (federados && federados.length > 0) {
      const fp = federados.find(f => String(f.federation_code) === String(selectedFed));
      if (fp) {
        const baseP = federadoToPlayer(fp);
        const synth = {
          ...baseP,
          fed: String(selectedFed),
          _source: "feds" as const,
          _federadoRaw: fp,
        } as MergedPlayer & { fed: string };
        return synth;
      }
    }
    // Fallback 2: nem em allPlayers nem em federados (jogador inactivo
    // histórico, fed code antigo, ou ainda por carregar). Construir stub
    // mínimo a partir do fed code para que `FederadoOnlyDetail` renderize
    // e faça fetch live a `getPlayerHistory(fed)` — se o fed existir mesmo
    // na FPG, o user vê as rondas WHS reais; senão vê erro amigável.
    // Sem esta entry sintética, o user clicava num nome antigo e caía
    // numa página em branco / FilteredStatsCard genérico.
    const fedStr = String(selectedFed);
    const stub: MergedPlayer & { fed: string } = {
      fed:            fedStr,
      name:           `Federado ${fedStr}`,
      sex:            "",
      escalao:        "",
      club:           { short: "", long: "", code: "" },
      hcp:            null,
      hcpExact:       null,
      region:         "",
      dob:            null,
      _source:        "feds" as const,
      _federadoRaw:   syntheticFederadoFromFedCode(fedStr),
    } as unknown as MergedPlayer & { fed: string };
    return stub;
  }, [allPlayers, selectedFed, federados]);

  return (
    <div className="jogadores-page">
      <JogadoresToolbar
        api={filtersApi}
        viewMode={viewMode}
        onSetViewMode={m => {
          clearSelection();
          if (m === "todos") setFederadosError(null);
          setViewMode(m);
        }}
        showStats={showStats}
        onSetShowStats={v => {
          setShowStats(v);
          if (!v) { setDrillDown(null); setHcpBinDrill(null); }
        }}
        counts={toolbarCounts}
        dataSources={dataSources}
        loadingFeds={loadingFeds}
        federadosError={federadosError}
        escaloes={escaloes}
        escalaoCountMap={escalaoCountMap}
        regions={regions}
        clubOptions={clubOptions}
        isJuvenilFilter={isJuvenilFilter}
        filteredCount={filtered.length}
        sidebarOpen={md.open}
        onToggleSidebar={md.toggle}
      />

      <div className="master-detail">
        <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
          {viewMode === "todos" && !isJuvenilFilter && filtered.length > MAX_SIDEBAR_ITEMS && (
            <div className="muted fs-10 p-8 ta-c" style={{ borderBottom: "1px solid var(--border)" }}>
              A mostrar os primeiros {MAX_SIDEBAR_ITEMS} de {filtered.length.toLocaleString("pt-PT")} — refine os filtros para ver mais
            </div>
          )}
          {viewMode === "todos" && isJuvenilFilter && (() => {
            // KPI por escalão jovem — contagem total e por sexo
            const jovensOrdem = ESCALOES_JOVENS;
            const stats: Record<string, { total: number; m: number; f: number }> = {};
            for (const esc of jovensOrdem) stats[esc] = { total: 0, m: 0, f: 0 };
            for (const p of filtered) {
              const s = stats[p.escalao];
              if (s) {
                s.total++;
                if (p.sex === "M") s.m++;
                else if (p.sex === "F") s.f++;
              }
            }
            return (
              <div style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-subtle)", padding: "6px 8px" }}>
                <div className="muted fs-10" style={{ marginBottom: 4 }}>
                  🧒 {filtered.length.toLocaleString("pt-PT")} jogadores jovens — todos visíveis
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 4 }}>
                  {jovensOrdem.map(esc => {
                    const s = stats[esc];
                    if (!s || s.total === 0) return null;
                    return (
                      <div key={esc} style={{ padding: "4px 6px", background: "var(--bg-card)", borderRadius: 4, fontSize: "var(--fs-11)" }}>
                        <div className="fw-700">{esc}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <b>{s.total}</b>
                          <span className="muted fs-10" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                            ({s.m}<SexBadge sex="M" size="sm" /> {s.f}<SexBadge sex="F" size="sm" />)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {filtered.slice(0, viewMode === "todos" && !isJuvenilFilter ? MAX_SIDEBAR_ITEMS : filtered.length).map(p => {
            const isActive = selected?.fed === p.fed;
            const displayClub = (isActive && playerMeta?.club) ? playerMeta.club : clubShort(p);
            const displayEscalao = (isActive && playerMeta?.escalao) ? playerMeta.escalao : p.escalao;
            const displayHcp = (isActive) ? (playerMeta?.latestHcp ?? null) : p.hcp;
            const rank = rankings.get(p.fed);
            const ps = statsDb[p.fed];
            const d = daysSince(ps);
            const isNewRound = d != null && d <= NEW_DAYS;
            const escHcps = hcpStatsByEscalao[displayEscalao];
            // Rondas total: do data.json via player-stats.json.
            // Para o JOGADOR SELECCIONADO, usar directamente data.DATA (via
            // playerMeta) — garante consistência mesmo que player-stats.json
            // esteja desfasado / data.json esteja corrompido para outros feds.
            let roundsTotal: number | null = ps?.roundsTotal ?? null;
            let roundsCurrentYear: number | null = ps?.roundsCurrentYear ?? null;
            if (isActive && playerMeta) {
              if (typeof playerMeta.totalRounds === "number" && playerMeta.totalRounds > 0) {
                roundsTotal = playerMeta.totalRounds;
              }
              if (typeof playerMeta.roundsCurrentYear === "number") {
                roundsCurrentYear = playerMeta.roundsCurrentYear;
              }
            }
            if (roundsCurrentYear == null) {
              const rcy = (p as typeof p & { _federadoRaw?: FederadoRaw })._federadoRaw?.rounds_current_year;
              roundsCurrentYear = typeof rcy === "number" && rcy > 0 ? rcy : null;
            }
            return (
              <PlayerSidebarItem
                key={p.fed}
                p={p as PlayerSidebarPlayer}
                isActive={isActive}
                displayClub={typeof displayClub === "string" ? displayClub : displayClub != null ? String(displayClub) : null}
                displayEscalao={displayEscalao}
                displayHcp={displayHcp}
                rank={rank}
                rankingMode={rankingMode}
                isNewRound={isNewRound}
                escHcps={escHcps}
                roundsTotal={roundsTotal}
                roundsCurrentYear={roundsCurrentYear}
                ppHcp={(() => { const r = ppMap.get(p.fed); return hasRealPPHcp(r) ? r!.hcp : null; })()}
                onSelect={handleSidebarSelect}
              />
            );
          })}
          {filtered.length === 0 && <EmptyState size="sm" message="Nenhum jogador encontrado" />}
        </div>

        <div className="course-detail jog-detail" ref={md.detailRef}>
          {showStats && viewMode === "todos" && globalStats ? (
            <FederadosStatsPanel
              stats={globalStats}
              drillDown={drillDown}
              onDrillDown={setDrillDown}
              hcpBinDrill={hcpBinDrill}
              onHcpBinDrill={setHcpBinDrill}
              federados={federados}
              onClose={() => { setShowStats(false); setDrillDown(null); setHcpBinDrill(null); }}
              onPickPlayer={fed => { setShowStats(false); setDrillDown(null); setHcpBinDrill(null); selectPlayer(fed); }}
            />
          ) : selected ? (
            (selected as typeof selected & { _source?: MergedPlayer["_source"] })._source === "feds"
              ? <FederadoOnlyDetail player={selected as MergedPlayer & { fed: string }} />
              : <PlayerDetail key={selected.fed} fedId={selected.fed} selected={selected} onMetaLoaded={setPlayerMeta} />
          ) : (
            <FilteredStatsCard
              filtered={filtered as FilteredPlayer[]}
              viewMode={viewMode}
              onPickPlayer={fed => { selectPlayer(fed); md.onSelect(); }}
              activeFiltersCount={activeFiltersCount}
            />
          )}
        </div>
      </div>
    </div>
  );
}
