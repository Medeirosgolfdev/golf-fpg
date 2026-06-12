// @refresh reset
/**
 * TorneiosAnalisePage.tsx — Análise Genérica de Torneios
 *
 * Lê automaticamente todos os ficheiros:
 *   /data/pull-torneios000.json
 *   /data/pull-torneios001.json
 *   /data/pull-torneios002.json
 *   ... (para quando aparecer um 404)
 *
 * Apresenta:
 *   • Sidebar com todos os torneios de todos os ficheiros, agrupados por mês/ano
 *   • Leaderboard com scorecard buraco-a-buraco
 *   • Tabs por ronda (R1, R2, ... + Acumulado para multi-ronda)
 *   • Suporte a 9H e 18H, 1 a N rondas
 */
import React, { useEffect, useState, useMemo, useRef } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { loadPlayers } from "../data/loader";
import { buildEscLookup, type EscLookup, normalizePlayer } from "../utils/playerUtils";
import { PILL_SSERRA, SIDEBAR_ACCENT, EscPill, PillBadge } from "../ui/PillBadge";
import { TournSidebarItem, SSERRA_CCODE, type SidebarItemTournament } from "../ui/TournSidebarItem";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar, ToolbarTitle, ToolbarSep } from "../ui/Toolbar";
import ExtLink from "../ui/ExternalLink";
import LoadingState from "../ui/LoadingState";
import { useMasterDetail } from "../hooks/useMasterDetail";
import { monthLabel, tournamentUrl, parseTournKey } from "../utils/format";
import {
  isManuel,
  type PlayersDB,
} from "../ui/tournamentPrimitives";
import { PJARankingView } from "../ui/PJARankingView";
import ClubesGruposView from "../ui/ClubesGruposView";
// Tipos e utilitários FPG — fonte canónica em ../data/fpgTypes.ts e ../data/fpgUtils.ts
import type { Tournament } from "../data/fpgTypes";
import { buildDisplayList, tournamentHasManuel } from "../data/fpgUtils";
import { isDNS } from "../ui/driveUtils";
// Leaderboard components — extraídos para fpg/LeaderboardComponents.tsx
// Inscrições e Jovens — extraídos para fpg/InscricoesComponents.tsx
import { InscricoesPanel, buildJovensGroups, buildEventGroups, type JovensGroup, type EventGroup } from "../ui/InscricoesComponents";
// Admissions + draws (browser scrape + merge) — ver CLAUDE.md
import { loadFpgAdmissionsDraws, indexFpgAdmissionsDraws, NACIONAL_2026_META, NACIONAL_2026_TCODES, type FpgTournamentData } from "../data/nacional2026Loader";
import { DataSourcesChip, DataSourcesProvider, type DataSource } from "../ui/DataSources";
// Re-exports para consumidores que ainda importam de FPGPage
export type { RoundScore, Player, Tournament, ScorecardOptions } from "../data/fpgTypes";
export { expandMultiRound } from "../data/fpgUtils";
export { ScorecardLB, AccumulatedLB, AllRoundsScorecardLB } from "../ui/LeaderboardComponents";
export { TournamentDetail } from "./fpg/TournamentDetail";

// ── Módulos extraídos (refactor 2026-05-09) ──────────────────────────────
import {
  DATA_MAX, PRE_2020_KEY, yearMatchesFilter, dataUrl,
  TOURN_PILLS, type TournPill, type FileMeta, type DriveData,
} from "./fpg/constants";
import {
  type SeriesKey, URL_TO_FILTER, URL_TO_NAV, NAV_TO_URL, FILTER_TO_URL, INSCRITOS_SHORTCUTS,
} from "./fpg/routes";
import { CLUBES_GRUPOS_BY_YEAR } from "../data/clubesGruposData";
import { TournamentDetail } from "./fpg/TournamentDetail";

/* ─────────────────────────────────────────────
   MAIN CONTENT
   ───────────────────────────────────────────── */


/* InscricoesPanel, buildJovensGroups, TERMOS_COMPETICAO, JovensGroup — importados de fpg/InscricoesComponents */

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
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [fileMeta, setFileMeta] = useState<FileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("A carregar ficheiros...");
  const [error, setError] = useState<string | null>(null);
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
  const [navMode, setNavMode]         = useState<"torneios" | "ranking-pja" | "ranking-sub12">(
    URL_TO_NAV[urlSeg] ?? "torneios"
  );
  const [seriesFilter, setSeriesFilter] = useState<"" | "circuit" | "santo" | "clubes" | "jovens">(
    (startInscritos || urlSeg === "jovens") ? "jovens" : ""
  );
  const [yearFilter, setYearFilter]    = useState<string | null>(() => searchParams.get("year"));
  const [filterManuel, setFilterManuel] = useState(() => searchParams.get("manuel") !== "0");
  const [searchQuery, setSearchQuery]  = useState(() => searchParams.get("q") || "");  // filtro de texto: nome ou campo/clube
  const [escLookup, setEscLookup] = useState<EscLookup>(new Map());
  const [playersDB, setPlayersDB] = useState<PlayersDB>({});
  // Lista de fedCodes inscritos no circuito PJA por ano.
  // Carregado de /data/pja-members.json — ver PJARankingView para uso.
  const [pjaMembers, setPjaMembers] = useState<Record<string, string[]>>({});
  // Snapshot do PDF oficial PJA para comparação — se definido, a tabela mostra
  // Δ pts e Δ rondas vs PDF e destaca células com disparidade.
  const [pjaPdfSnapshot, setPjaPdfSnapshot] = useState<Record<string, Array<{fed:string;name:string;rounds:number;pts:number;pos:number}>>>({});

  // ── Estado Clubes ─────────────────────────────────────────────────────────
  const [clubesTournaments, setClubesTournaments] = useState<Tournament[]>([]);
  const [clubesLoading, setClubesLoading]         = useState(false);
  const [clubesLoaded, setClubesLoaded]           = useState(false);
  const [clubesSelected, setClubesSelected]       = useState<number>(0);
  const [clubesEsc] = useState<string>("sub14"); // "sub14" | "sub18"
  const [clubesView, setClubesView]               = useState<"individual" | "grupos">("grupos");

  // ── Estado PJA (drive/aquapor mensais, para o Ranking PJA 2026+) ─────────
  // Carregamos separadamente para não afectar o displayList principal (tabs
  // Todos/Circuito/Santo continuam a ver apenas pull-torneios).
  const [pjaExtraTournaments, setPjaExtraTournaments] = useState<Tournament[]>([]);

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
    if (sp.toString() !== searchParams.toString()) {
      setSearchParams(sp, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearFilter, filterManuel, searchQuery]);

  // ── Estado Jovens ─────────────────────────────────────────────────────────
  const [jovensTournaments, setJovensTournaments] = useState<Tournament[]>([]);
  const [jovensLoading, setJovensLoading]         = useState(false);
  const [jovensLoaded, setJovensLoaded]           = useState(false);
  const [jovensGroupKey, setJovensGroupKey]        = useState<string | null>(null);
  const [jovensEscIdx, setJovensEscIdx]            = useState<number>(0);
  const [jovensShowInscricoes, setJovensShowInscricoes] = useState(startInscritos);
  // /FPG/jovens sem sub-segmento → abre na lista de torneios (a Análise foi
  // migrada para /titulos em 2026-05-04). jovensShowAnalise mantém-se no
  // código apenas para desactivar manualmente caso futuras edições queiram
  // reactivar — sempre `false` por default agora.
  const [jovensShowAnalise, setJovensShowAnalise] = useState(false);

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
      if (jovensShowAnalise) setJovensShowAnalise(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSeg, urlSub, isInscritosShortcut, params.tkey]);

  // ── Sources secundárias (para o painel DataSourcesChip) ─────────────────
  //   Cada secção (clubes, jovens, admissions) regista ficheiros tentados/lidos.
  //   fileMeta cobre apenas os pull-torneios; estes cobrem o resto.
  const [clubesMeta, setClubesMeta] = useState<DataSource[]>([]);
  const [jovensMeta, setJovensMeta] = useState<DataSource[]>([]);
  const [admissionsMeta, setAdmissionsMeta] = useState<DataSource[]>([]);

  const { melhorias } = useAppContext();

  const tcodePills = useMemo<Record<string, TournPill>>(() => {
    const pills: Record<string, TournPill> = {};
    for (const playerData of Object.values(melhorias)) {
      if (typeof playerData !== "object" || !playerData) continue;
      for (const entry of Object.values(playerData as Record<string, any>)) {
        if (typeof entry !== "object" || !entry || Array.isArray(entry) || !entry.pill) continue;
        // Extrair TODOS os tcodes dos links desta entrada (ex: classificacao_d1 + classificacao_d2)
        for (const v of Object.values((entry as any).links || {})) {
          const match = String(v).match(/tcode=(\d+)/);
          if (match) pills[match[1]] = (entry as any).pill as TournPill;
        }
      }
    }
    return pills;
  }, [melhorias]);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        // loadPlayers() usa fetchCache — 1 único fetch por sessão mesmo que FPGPage,
        // DrivePage e App.tsx o peçam em simultâneo.
        const [pdb, linksResp, kidsLinksResp, natResp, kidsTrackedResp] = await Promise.all([
          loadPlayers().catch(() => ({} as PlayersDB)),
          fetch("/data/tournament-links.json").catch(() => null),
          fetch("/data/kids-links.json").catch(() => null),
          fetch("/data/players-nationality.json").catch(() => null),
          fetch("/data/kids-tracked-names.json").catch(() => null),
        ]);
        // Merge players-nationality.json no playersDB — para cada federado FPG
        // estrangeiro (Joe Short→GB, Peter Yao→CN, etc.) injecta `country` no
        // entry existente, para o TournPName renderizar 🇬🇧 antes do nome.
        if (natResp?.ok) {
          try {
            const nat = await natResp.json();
            const byFed: Record<string, string> = nat?.byFed || {};
            // info: { fed: {country, dob, sex, name} } — fonte de DOB para
            // os ~58K federados (activos+inactivos).
            const info: Record<string, { country?: string; dob?: string; sex?: string; name?: string }> = nat?.info || {};
            for (const fed in byFed) {
              const cc = byFed[fed];
              if (!cc) continue;
              const inf = info[fed] || {};
              const entry = (pdb as any)[fed];
              if (entry) {
                if (!entry.country) entry.country = cc;
                if (!entry.dob && inf.dob) entry.dob = inf.dob;
                if (!entry.sex && inf.sex) entry.sex = inf.sex;
              } else {
                (pdb as any)[fed] = {
                  country: cc,
                  ...(inf.dob ? { dob: inf.dob } : {}),
                  ...(inf.sex ? { sex: inf.sex } : {}),
                  ...(inf.name ? { name: inf.name } : {}),
                };
              }
            }
          } catch { /* ignore */ }
        }
        // Merge kids-links.json no playersDB — entries CURADOS para
        // jogadores internacionais sem fedCode português (Emile Cuanalo,
        // George Campbell, etc.). Mantém precedência sobre auto-derived.
        if (kidsLinksResp?.ok) {
          try {
            const kl = await kidsLinksResp.json();
            for (const entry of (kl.players || [])) {
              if (!entry.name || !entry.kidsHash) continue;
              const key = "intl:" + entry.name.toLowerCase().replace(/\s+/g, "_");
              (pdb as any)[key] = {
                name: entry.name,
                kidsHash: entry.kidsHash,
                ...(entry.country ? { country: entry.country } : {}),
                ...(entry.escalao ? { escalao: entry.escalao } : {}),
                ...(entry.sex ? { sex: entry.sex } : {}),
              };
            }
          } catch { /* ignore */ }
        }
        // Merge kids-tracked-names.json — índice fino (~150KB) com todos os
        // nomes que aparecem nalguma fonte /kids (USKids, WJGC, Doral, etc.).
        // Para cada nome aqui, cria entry virtual com kidsHash = memberId
        // (preferido — link directo via ID) ou nome encodificado (fallback).
        // Isto resolve o problema de ↗ aparecer em jogadores que NÃO estão
        // em /kids: agora só aparece quando há match REAL com a fonte.
        if (kidsTrackedResp?.ok) {
          try {
            const kt = await kidsTrackedResp.json();
            const namesMap: Record<string, string | null> = kt?.names || {};
            // Meta extra: { sex?, country? } por normName (de FFG resultats etc.)
            const metaMap: Record<string, { sex?: "M" | "F"; country?: string }> = kt?.meta || {};
            for (const normName in namesMap) {
              if (!normName) continue;
              const memberId = namesMap[normName];
              const m = metaMap[normName] || {};
              const key = "kids:" + normName.replace(/\s+/g, "_");
              if ((pdb as any)[key]) continue; // já populado por kids-links.json
              const displayName = normName.replace(/\b\w/g, c => c.toUpperCase());
              (pdb as any)[key] = {
                name: displayName,
                kidsHash: memberId || encodeURIComponent(displayName),
                ...(m.sex ? { sex: m.sex } : {}),
                ...(m.country ? { country: m.country } : {}),
              };
            }
          } catch { /* ignore */ }
        }
        if (alive) { setEscLookup(buildEscLookup(pdb)); setPlayersDB(pdb as PlayersDB); }
        let externalLinks: Record<string, Record<string, string>> = {};
        if (linksResp?.ok) {
          externalLinks = await linksResp.json().catch(() => ({}));
        }

        const allT: Tournament[] = [];
        const meta: FileMeta[] = [];

        // Paraleliza os fetches dos pull-torneios*.json em lotes de PARALLEL_BATCH.
        // Antes: loop sequencial com await (6 ficheiros → 6× latência da rede).
        // Agora: 1 único batch de até DATA_MAX fetches concorrentes, pára no
        // primeiro null consecutivo que vier (via findIndex).
        const PARALLEL_BATCH = 10;
        let stopAt = DATA_MAX;
        for (let start = 0; start < stopAt; start += PARALLEL_BATCH) {
          if (!alive) return;
          const batchEnd = Math.min(start + PARALLEL_BATCH, stopAt);
          const batch = await Promise.all(
            Array.from({ length: batchEnd - start }, (_, k) => start + k).map(async (i) => {
              const url = dataUrl(i);
              try {
                const resp = await fetch(url);
                if (!resp.ok) return { i, url, d: null as DriveData | null, parseErr: null as string | null };
                const d = await resp.json() as DriveData;
                return { i, url, d, parseErr: null };
              } catch (e) {
                return { i, url, d: null, parseErr: String(e).slice(0, 120) };
              }
            })
          );
          let consecutiveMisses = 0;
          let hitStop = false;
          for (const { i, url, d, parseErr } of batch) {
            if (!d) {
              if (parseErr) console.warn(`[FPGPage] Falhou a parsear ${url}: ${parseErr} — a continuar`);
              consecutiveMisses++;
              if (consecutiveMisses >= 2) { stopAt = i; hitStop = true; break; }
              continue;
            }
            consecutiveMisses = 0;
            const normalised = (d.tournaments || []).map(t => {
              const extLinks = externalLinks[String(t.tcode)];
              return { ...t, _sourceFile: url, _sourceIndex: i,
                players: t.players.map(normalizePlayer),
                ...(extLinks ? { links: { ...(t.links || {}), ...extLinks } } : {}) };
            });
            allT.push(...normalised);
            meta.push({ file: url, index: i, lastUpdated: d.lastUpdated, source: d.source, count: normalised.length });
          }
          if (alive) {
            setTournaments([...allT]);
            setFileMeta([...meta]);
            setLoadingMsg(`A carregar... ${meta.length} ficheiro(s) · ${allT.length} torneios`);
          }
          if (hitStop) break;
        }

        // ── Ficheiros de torneio standalone (fora da numeração pull-torneios) ──
        // Cada ficheiro traz o seu próprio ccode/tcode, por isso o deep-link
        // /FPG/torneio/{ccode}-{tcode} resolve naturalmente (sem reescrita).
        const EXTRA_TOURN_FILES: string[] = [
          // Camp. Nacional de Profissionais 2026 (ccode 912 / tcode 10225) —
          // scraped à parte porque não veio na numeração pull-torneios.
          "/data/torneio-912-10225.json",
        ];
        await Promise.all(EXTRA_TOURN_FILES.map(async (url) => {
          try {
            const resp = await fetch(url);
            if (!resp.ok) return;
            const d = await resp.json() as DriveData;
            const normalised = (d.tournaments || []).map(t => {
              const extLinks = externalLinks[String(t.tcode)];
              return { ...t,
                _sourceFile: url, _sourceIndex: -1,
                players: t.players.map(normalizePlayer),
                ...(extLinks ? { links: { ...(t.links || {}), ...extLinks } } : {}) };
            });
            allT.push(...normalised);
            meta.push({ file: url, index: -1, lastUpdated: d.lastUpdated, source: d.source, count: normalised.length });
          } catch (e) {
            console.warn(`[FPGPage] Falhou a carregar ${url}: ${String(e).slice(0, 120)}`);
          }
        }));
        if (alive) { setTournaments([...allT]); setFileMeta([...meta]); }

        if (alive) {
          if (allT.length === 0) {
            setError(`Ficheiro não encontrado: ${dataUrl(0)}`);
          }

          // Carregar os 3 ficheiros de Clubes em paralelo com o loader principal
          const CLUBES_FILES_MAIN = [
            { url: "/data/clubes_sub_14&18_2026.json", year: "2026" },
            { url: "/data/clubes_sub_14&18_2025.json", year: "2025" },
            { url: "/data/clubes_sub_14&18_2024.json", year: "2024" },
          ];
          const resolveEscKeyMain = (escalao: string | null | undefined): string => {
            if (escalao && /14/i.test(escalao)) return "sub14";
            if (escalao && /18/i.test(escalao)) return "sub18";
            return "sub14";
          };
          const clubesMetaLocal: DataSource[] = [];
          const clubesResults = await Promise.all(CLUBES_FILES_MAIN.map(async ({ url, year }) => {
            try {
              const r = await fetch(url);
              if (!r.ok) {
                clubesMetaLocal.push({ path: url, status: "error", error: `HTTP ${r.status}`, group: "clubes" });
                return [];
              }
              const d: DriveData = await r.json();
              const rows = (d.tournaments || []).map(t => ({
                ...t,
                series: "clubes" as const,
                _clubesEsc: resolveEscKeyMain((t as any).escalao),
                _clubesYear: year,
                _sourceFile: url,
                players: t.players.map(normalizePlayer),
              }));
              clubesMetaLocal.push({ path: url, status: "loaded", count: rows.length, source: d.source, lastUpdated: d.lastUpdated, group: "clubes" });
              return rows;
            } catch (e) {
              clubesMetaLocal.push({ path: url, status: "error", error: String(e), group: "clubes" });
              return [];
            }
          }));
          if (alive) setClubesMeta(clubesMetaLocal);
          const clubesFlat = clubesResults.flat();
          // Deduplicar por tcode
          const seen = new Map<string, Tournament>();
          for (const t of clubesFlat) seen.set(String(t.tcode), t as Tournament);
          if (alive) {
            const uniqueClubes = [...seen.values()];
            setClubesTournaments(uniqueClubes);
            setClubesLoaded(true);
            // Carregar admissions+draws UMA vez e enriquecer TODOS os torneios
            // (pull-torneios + clubes) para aparecerem com draws/pairings nos
            // tabs STO, PJA, Clubes e Todos. Os tabs Jovens e Clubes detalhe
            // fazem o mesmo enrichment nos seus loaders próprios.
            const admFile = await loadFpgAdmissionsDraws().catch(() => null);
            const admIdx = admFile ? indexFpgAdmissionsDraws(admFile) : new Map<string, FpgTournamentData>();
            const enrich = (t: Tournament): Tournament => {
              const ad = admIdx.get(`${t.ccode}-${t.tcode}`);
              if (ad) {
                (t as any)._admissions = ad.admissions;
                (t as any)._draws = ad.draws;
              }
              return t;
            };
            const enrichedAllT = allT.map(enrich);
            const enrichedClubes = uniqueClubes.map(enrich);
            setTournaments([...enrichedAllT, ...enrichedClubes]);
          }

          setLoading(false);
        }
      } catch {
        // erro inesperado — não mostrar stack trace técnico
        if (alive) setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, []);

  // ── Loader PJA (Drive Tour + Aquapor mensais, para Ranking PJA 2026+) ────
  // Estes torneios NÃO entram em tournaments/displayList (para não poluir as
  // outras tabs). São carregados num state separado e combinados só quando
  // construímos `pjaRankingList`. Activado apenas quando a tab Ranking PJA
  // está activa.
  useEffect(() => {
    // Carregar drive-data/aquapor SEMPRE (não só no tab Ranking PJA) — assim
    // deep-links em nova aba para `/FPG/torneio/{ccode}-{tcode}` de um Drive
    // Tour ou Aquapor conseguem encontrar o torneio no displayList em vez de
    // cair no default (primeiro torneio).
    if (pjaExtraTournaments.length > 0) return;  // já carregado
    let alive = true;
    // Monta lista de URLs a tentar (todos os meses desde startYear até agora),
    // faz fetch em PARALELO com Promise.all. Cada fetch individual falha
    // silenciosamente (muitos meses podem não existir). Isto é 10-30× mais
    // rápido que o loop sequencial com await.
    const loadMonthly = async (prefix: string, startYear: number): Promise<Tournament[]> => {
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth() + 1;
      const urls: string[] = [];
      for (let y = startYear; y <= curYear; y++) {
        const endMonth = (y === curYear) ? curMonth : 12;
        for (let m = 1; m <= endMonth; m++) {
          urls.push(`/data/${prefix}-${y}-${String(m).padStart(2, "0")}.json`);
        }
      }
      const results = await Promise.all(urls.map(async (url) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return [];
          const ct = r.headers.get("content-type") || "";
          if (!ct.includes("json")) return [];
          const d = await r.json();
          return (d.tournaments || []).map((t: any) => ({
            ...t, _sourceFile: url,
            players: (t.players || []).map(normalizePlayer),
          })) as Tournament[];
        } catch { return []; }
      }));
      if (!alive) return [];
      return results.flat();
    };
    const loadPjaMembers = async (): Promise<Record<string, string[]>> => {
      try {
        const r = await fetch("/data/pja-members.json");
        if (!r.ok) return {};
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("json")) return {};
        const d = await r.json();
        const out: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(d)) {
          if (k.startsWith("_")) continue;
          if (Array.isArray(v)) out[k] = v.map(String);
        }
        return out;
      } catch { return {}; }
    };
    const loadPdfSnapshot = async (): Promise<Record<string, any[]>> => {
      try {
        const r = await fetch("/data/pja-pdf-snapshot.json");
        if (!r.ok) return {};
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("json")) return {};
        const d = await r.json();
        const out: Record<string, any[]> = {};
        for (const [k, v] of Object.entries(d)) {
          if (k.startsWith("_")) continue;
          if (Array.isArray(v)) out[k] = v as any[];
        }
        return out;
      } catch { return {}; }
    };
    Promise.all([
      loadMonthly("drive-data", 2026),
      loadMonthly("aquapor-data", 2026),
      loadPjaMembers(),
      loadPdfSnapshot(),
    ]).then(([drive, aq, members, pdfSnap]) => {
      if (!alive) return;
      // NÃO chamar buildDisplayList aqui — drive-data é single-round por design,
      // aquapor já vem como entrada única multi-round. buildDisplayList só
      // agruparia se houvesse padrões "Dia 1/Dia 2" no nome (não é o caso).
      // Torneios manuais (PJA exclusivos, Santo da Serra juniores) são agora
      // lidos no loader principal via pull-torneios003.json — incluídos em
      // `tournaments` e `displayList` naturalmente, aparecendo em todas as tabs
      // (Torneios, Ranking PJA, Draw) tal como o Nacional sintético.
      setPjaExtraTournaments([...drive, ...aq]);
      setPjaMembers(members);
      setPjaPdfSnapshot(pdfSnap);
    });
    return () => { alive = false; };
  }, [navMode, pjaExtraTournaments.length]);

  // ── Loader Clubes (D1 — só quando activado, para dados parciais de 2026) ────
  useEffect(() => {
    if (!(navMode === "torneios" && (seriesFilter === "clubes" || seriesFilter === "")) || clubesLoaded) return;
    let alive = true;
    setClubesLoading(true);

    // Ficheiros combinados (sub14 + sub18 no mesmo JSON) — escalão lido de t.escalao
    // Ficheiros D1 têm só um escalão (determinado pelo nome)
    const CLUBES_FILES: { url: string; escFallback: string | null; year: string }[] = [
      { url: "/data/clubes_sub_14_D1.json",    escFallback: "sub14", year: "2026" },
      { url: "/data/clubes_sub_18_D1.json",    escFallback: "sub18", year: "2026" },
      { url: "/data/clubes_sub_14&18_2026.json", escFallback: null,  year: "2026" },
      { url: "/data/clubes_sub_14&18_2025.json", escFallback: null,  year: "2025" },
      { url: "/data/clubes_sub_14&18_2024.json", escFallback: null,  year: "2024" },
    ];

    function resolveEscKey(escalao: string | undefined | null, fallback: string | null): string {
      if (escalao && /14/i.test(escalao)) return "sub14";
      if (escalao && /18/i.test(escalao)) return "sub18";
      return fallback ?? "sub14";
    }

    // Carregar também admissions+draws em paralelo para enriquecer torneios
    // Clubes (permite mostrar pairings/tee times na UI). Alinhado com loader
    // Jovens que já faz isto.
    Promise.all([
      ...CLUBES_FILES.map(async ({ url, escFallback, year }) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return [];
          const d: DriveData = await r.json();
          return (d.tournaments || []).map(t => ({
            ...t,
            _clubesEsc: resolveEscKey((t as any).escalao, escFallback),
            _clubesYear: year,
            _sourceFile: url,
            players: t.players.map(normalizePlayer),
          }));
        } catch { return []; }
      }),
      loadFpgAdmissionsDraws().catch(() => null),
    ]).then(all => {
      if (!alive) return;
      const admDrawsFile = all[all.length - 1] as Awaited<ReturnType<typeof loadFpgAdmissionsDraws>> | null;
      const admDrawsIdx = admDrawsFile ? indexFpgAdmissionsDraws(admDrawsFile) : new Map<string, FpgTournamentData>();
      const results = all.slice(0, -1) as any[];
      // Deduplicar por tcode — se o ficheiro D1 e o combined 2026 tiverem o mesmo torneio, fica o combined
      const seen = new Map<string, Tournament>();
      for (const t of results.flat()) {
        const key = (t as any).tcode;
        const existing = seen.get(key);
        // Preferir o combined (escFallback null) sobre D1 (escFallback não null)
        if (!existing || (existing as any)._sourceFile?.includes("D1")) {
          // Enriquecer com admissions/draws do fpg-admissions-draws.json se houver match
          const idxKey = `${t.ccode}-${(t as any).tcode}`;
          const ad = admDrawsIdx.get(idxKey);
          if (ad) {
            (t as any)._admissions = ad.admissions;
            (t as any)._draws = ad.draws;
          }
          seen.set(key, t as Tournament);
        }
      }
      setClubesTournaments([...seen.values()] as Tournament[]);
      setClubesLoaded(true);
      setClubesLoading(false);
    });
    return () => { alive = false; };
  }, [navMode, seriesFilter, clubesLoaded]);

  // ── Loader Jovens (arranca automaticamente no mount, para aparecerem em "Todos") ──
  useEffect(() => {
    if (jovensLoaded) return;
    let alive = true;
    setJovensLoading(true);
    const JOVENS_FILES = [
      { url: "/data/jovens_2026.json", year: "2026" },
      { url: "/data/jovens_2025.json", year: "2025" },
      { url: "/data/jovens_2024.json", year: "2024" },
      { url: "/data/jovens_2023.json", year: "2023" },
      { url: "/data/jovens_2022.json", year: "2022" },
      { url: "/data/jovens_2020.json", year: "2020" },
      { url: "/data/jovens_2019.json", year: "2019" },
    ];
    // Histórico dos Campeonatos Nacionais Jovens (2005-2026, 206 torneios) —
    // o mesmo ficheiro que alimenta a TitulosPage e a NacionaisJovensPage.
    // Carregado aqui para que os Nacionais históricos apareçam na sidebar
    // de /FPG/jovens (anos pré-2019 não estão em jovens_YYYY.json).
    // Tcodes que coincidam com jovens_YYYY perdem para a entrada existente
    // (dedup por ccode/tcode no loop "seen" abaixo).
    const HISTORICO_URL = "/data/fpg-nacionais-historico.json";
    const jovensMetaLocal: DataSource[] = [];
    Promise.all([
      ...JOVENS_FILES.map(async ({ url, year }) => {
        try {
          const r = await fetch(url);
          if (!r.ok) {
            jovensMetaLocal.push({ path: url, status: "error", error: `HTTP ${r.status}`, group: "jovens" });
            return [];
          }
          const d: DriveData = await r.json();
          const rows = (d.tournaments || []).map(t => ({
            ...t, _jovensYear: year, _sourceFile: url,
            players: t.players.map(normalizePlayer),
          }));
          jovensMetaLocal.push({ path: url, status: "loaded", count: rows.length, source: d.source, lastUpdated: d.lastUpdated, group: "jovens" });
          return rows;
        } catch (e) {
          jovensMetaLocal.push({ path: url, status: "error", error: String(e), group: "jovens" });
          return [];
        }
      }),
      // Carrega o ficheiro histórico dos Nacionais Jovens — mesma forma que os
      // jovens_YYYY mas cobre 2005-2026 (incluindo Drive Tour Finals e Sub-10/12
      // 2025 Santo Estevão ccode=988). Filtra "de Clubes" (têm tab própria).
      (async () => {
        try {
          const r = await fetch(HISTORICO_URL);
          if (!r.ok) {
            jovensMetaLocal.push({ path: HISTORICO_URL, status: "error", error: `HTTP ${r.status}`, group: "jovens" });
            return [];
          }
          const d: any = await r.json();
          const rows = ((d.tournaments || []) as any[])
            .filter((t: any) => !/de\s+clubes/i.test(t.name || ""))
            .map((t: any) => ({
              ...t,
              _jovensYear: (t.date || "").substring(0, 4),
              _sourceFile: HISTORICO_URL,
              players: (t.players || []).map(normalizePlayer),
              // Quando o historico contém admissions/draws (consolidação 2026-05-05
              // do Nacional Jovens 2026), promove-os para _admissions/_draws para
              // o detalhe do torneio mostrar tabs de Inscrições/Pairings.
              ...(t.admissions ? { _admissions: t.admissions } : {}),
              ...(t.draws ? { _draws: t.draws } : {}),
            }));
          jovensMetaLocal.push({ path: HISTORICO_URL, status: "loaded", count: rows.length, source: d.source, lastUpdated: d.lastUpdated, group: "jovens" });
          return rows;
        } catch (e) {
          jovensMetaLocal.push({ path: HISTORICO_URL, status: "error", error: String(e), group: "jovens" });
          return [];
        }
      })(),
      // Carrega também admissions + draws (107 torneios) para enriquecer existentes
      // e injectar sinteticamente os 10 Nacional 2026 (que ainda não estão em jovens_2026).
      loadFpgAdmissionsDraws().catch(() => null),
    ]).then(all => {
      if (!alive) return;
      const admLoaded = all[all.length - 1];
      setAdmissionsMeta([{
        path: "/data/fpg-admissions-draws.json",
        status: admLoaded ? "loaded" : "error",
        count: admLoaded ? ((admLoaded as any).tournaments?.length || 0) : undefined,
        source: (admLoaded as any)?.source,
        lastUpdated: (admLoaded as any)?.scrapedAt,
        group: "admissions",
      }]);
      setJovensMeta(jovensMetaLocal);
      const admDrawsFile = all[all.length - 1] as Awaited<ReturnType<typeof loadFpgAdmissionsDraws>> | null;
      const admDrawsIdx = admDrawsFile ? indexFpgAdmissionsDraws(admDrawsFile) : new Map<string, FpgTournamentData>();
      const tournaments = (all.slice(0, -1) as any[]).flat() as Tournament[];

      const seen = new Map<string, Tournament>();
      // 1) Torneios existentes — dedup + enriquecer com admissions/draws quando houver match
      for (const t of tournaments) {
        const key = t.ccode + "/" + String((t as any).tcode);
        if (seen.has(key)) continue;
        const idxKey = `${t.ccode}-${(t as any).tcode}`;
        const ad = admDrawsIdx.get(idxKey);
        if (ad) {
          (t as any)._admissions = ad.admissions;
          (t as any)._draws = ad.draws;
        }
        seen.set(key, t);
      }
      // 2) Injectar Nacional 2026 (tcodes 10935-10944) como torneios sintéticos
      //    se não existirem já em jovens_2026.json.
      for (const tcode of NACIONAL_2026_TCODES) {
        const key = "000/" + tcode;
        if (seen.has(key)) continue;
        const meta = NACIONAL_2026_META[tcode];
        const ad = admDrawsIdx.get(`000-${tcode}`);
        if (!ad) continue;  // sem dados scraped, não injecta
        const playerCount = ad.admissions?.totalInscritos ?? (ad.admissions?.players?.length ?? 0);
        const synthetic = {
          name: meta.name,
          ccode: "000",
          tcode,
          date: "2026-05-01",
          campo: "PGA Aroeira II",
          clube: "000",
          circuit: "tour",
          series: "jovens",
          region: "nacional",
          escalao: meta.escalao,
          num: 1,
          rounds: 3,
          playerCount,
          players: [],
          _jovensYear: "2026",
          _sourceFile: "fpg-admissions-draws.json",
          _admissions: ad.admissions,
          _draws: ad.draws,
          // Links arquivados do antigo painel "📋 Inscrições 2026" (desactivado
          // 2026-04-27 por encerramento das inscrições). Mantidos disponíveis
          // no detalhe do torneio para consulta — página oficial do evento e
          // PDF dos termos de competição.
          extraLinks: [
            {
              label: "página oficial FPG",
              url: "https://competicoes.fpg.pt/evento/campeonato-nacional-de-jovens-sub10-12-14-16-18-pga-aroeira/",
              icon: "🏆",
            },
            {
              label: "Termos PDF",
              url: "https://competicoes.fpg.pt/wp-content/uploads/2025/09/Campeonato_Nacional_de_Jovens_Sub18-a-Sub-10.pdf",
              icon: "📋",
            },
          ],
        } as unknown as Tournament;
        seen.set(key, synthetic);
      }
      setJovensTournaments([...seen.values()] as Tournament[]);
      setJovensLoaded(true);
      setJovensLoading(false);
    });
    return () => { alive = false; };
  }, [jovensLoaded]);

  // Match do filtro de pesquisa por nome/campo/clube (normalizado, case+accent insensitive)
  // Declarado ANTES dos useMemo que o consomem (ordem importante no JS — temporal dead zone).
  const searchTerm = searchQuery.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const matchesSearch = (t: Tournament): boolean => {
    if (!searchTerm) return true;
    const fields = [t.name, t.campo, (t as any).clube, t.tcode, t.ccode]
      .map(v => String(v ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, ""));
    return fields.some(f => f.includes(searchTerm));
  };

  // Lista filtrada por escalão dentro de Clubes, agrupada por ano
  const clubesList = useMemo(
    () => clubesTournaments
      .filter(t => !filterManuel || t.players.some(p => isManuel(p)))
      .filter(t => yearMatchesFilter((t as any)._clubesYear ?? t.date?.substring(0, 4), yearFilter))
      .filter(t => matchesSearch(t))
      .sort((a, b) => {
        const yCmp = ((b as any)._clubesYear ?? "").localeCompare((a as any)._clubesYear ?? "");
        if (yCmp !== 0) return yCmp;
        return ((a as any)._clubesEsc ?? "").localeCompare((b as any)._clubesEsc ?? "");
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clubesTournaments, filterManuel, yearFilter, searchTerm]
  );
  const clubesByYear = useMemo(() => {
    const m: Record<string, Tournament[]> = {};
    for (const t of clubesList) {
      const yr = (t as any)._clubesYear ?? t.date?.substring(0, 4) ?? "?";
      if (!m[yr]) m[yr] = [];
      m[yr].push(t);
    }
    return m;
  }, [clubesList]);
  const clubesYears = useMemo(() => Object.keys(clubesByYear).sort().reverse(), [clubesByYear]);
  const curClubes = clubesList[clubesSelected] ?? null;
  const curClubesYear: string = (curClubes as any)?._clubesYear ?? curClubes?.date?.substring(0, 4) ?? "";

  const jovensGroups = useMemo(() => {
    // Input do tab JOVENS:
    //   1. jovensTournaments — Nacionais Jovens + sintéticos 2026 Aroeira
    //   2. Torneios com "Junior" no nome de outras fontes (Vila Sol Junior,
    //      GJG Junior Classics, ESTORIL Junior Open, Academia Junior, etc.) —
    //      têm pill JUNIOR na sidebar e faz sentido também aparecerem aqui
    //      já que são competições juvenis, mesmo que de clubes não-FPG.
    //      PJA e Greatgolf já têm os seus tabs próprios — excluídos por
    //      terem pill PJA em vez de pill JUNIOR genérica.
    //
    //   Dedup robusto via Map (primeira ocorrência ganha) — garante que mesmo
    //   se `tournaments` ou `jovensTournaments` contiverem entradas duplicadas,
    //   só aparece uma por (ccode/tcode) na sidebar e nos tabs de escalão.
    const dedupMap = new Map<string, Tournament>();
    const keyOf = (t: Tournament) => (t.ccode || "") + "/" + String(t.tcode || "");
    for (const j of jovensTournaments) {
      const k = keyOf(j);
      if (!dedupMap.has(k)) dedupMap.set(k, j);
    }
    // Regex de detecção de torneios juvenis pelo nome:
    //  - "junior" / "juniors"  (Junior Open, GJG Portuguese Juniors)
    //  - "júnior" (Taça Yeatman Júnior — strip de diacríticos antes do test)
    //  - "subN"   (sub10, sub-14, sub 14, ...)
    //  - "UN"     (U10, U12, U14, U16, U18, U21 — categorias internacionais)
    const JOVEM_NAME_RE = /\b(juniors?|sub[\s-]?\d{1,2}|u\d{1,2})\b/i;
    const stripAcc = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const t of tournaments) {
      const cleanName = stripAcc(t.name || "");
      if (!JOVEM_NAME_RE.test(cleanName)) continue;
      if (/PJA/i.test(t.name || "")) continue;                // já em tab PJA
      if (/greatgolf.*junior/i.test(t.name || "")) continue;  // já em tab PJA (excepção)
      const k = keyOf(t);
      if (!dedupMap.has(k)) dedupMap.set(k, t);
    }
    const combined = [...dedupMap.values()];

    // Para torneios pré-jogo o Manuel só aparece em _admissions.players ou
    // _draws.*.groups.*.players. `tournamentHasManuel` cobre todos os sítios.
    const filtered = combined
      .filter(t => !filterManuel || tournamentHasManuel(t))
      .filter(t => yearMatchesFilter((t as any)._jovensYear ?? t.date?.substring(0, 4), yearFilter))
      .filter(t => matchesSearch(t));
    return buildJovensGroups(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jovensTournaments, tournaments, filterManuel, yearFilter, searchTerm]);

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

  /** Lista unificada que alimenta o tab "Todos":
   *  - tournaments (pull-torneios + clubes merged no loader principal)
   *  - jovensTournaments (jovens_YYYY.json + Nacional 2026 sintético) — dedup por ccode/tcode
   *  Clubes (seriesFilter === "clubes") mantém sidebar própria, mas também fazem parte de `tournaments`.
   *
   *  ⚠ Dedup robusto: usa Map para garantir UMA entrada por (ccode/tcode), eliminando
   *  duplicações que possam existir DENTRO de `tournaments` (ex: o mesmo torneio em
   *  dois pull-torneios*.json) ou entre `tournaments` e `jovensTournaments`.
   *  Sem isto, o Campeonato Nacional aparecia com cada escalão duplicado quando o
   *  mesmo torneio existia em pull-torneios006.json E em jovens_2026.json (via
   *  algum re-merge defeituoso, ou se o mesmo ficheiro fosse carregado duas vezes).
   *  Política: primeira ocorrência ganha; jovens só entra se ccode/tcode novo. */
  const displayList = useMemo(() => {
    const dedupMap = new Map<string, Tournament>();
    const keyOf = (t: Tournament) => (t.ccode || "?") + "/" + String(t.tcode ?? "?");
    for (const t of tournaments) {
      const k = keyOf(t);
      if (!dedupMap.has(k)) dedupMap.set(k, t);
    }
    for (const j of jovensTournaments) {
      const k = keyOf(j);
      if (!dedupMap.has(k)) dedupMap.set(k, j);
    }
    // Drive Tour + Aquapor NÃO entram aqui — esses torneios estão na DrivePage
    // e os deep-links usam /drive/torneio/{ccode}-{tcode} (não /FPG/torneio/...).
    // pjaExtraTournaments só é usado internamente pelo Ranking PJA.
    return buildDisplayList([...dedupMap.values()]);
  }, [tournaments, jovensTournaments]);
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
    if (jovensShowAnalise) return;
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
    if (urlSeg === "rankingpja" || urlSeg === "rankingsub12") return;
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

  /** Lista de torneios indexados pelo seu ficheiro de origem — alimenta o
   *  popover do clique-direito no FileBadge. Inclui clubes e jovens (que têm
   *  _sourceFile próprio) além dos pull-torneios. */
  const providerTournaments = useMemo(() => {
    const base = [...tournaments, ...jovensTournaments];
    return base.map(t => ({
      _sourceFile: (t as any)._sourceFile,
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
  const inYear = (t: Tournament) => yearMatchesFilter((t.date || "").substring(0, 4), activeYear);

  // Event-groups globais — os mesmos torneios agrupados por (date+ccode) com
  // nome simplificado e split por Jaccard<0.5. Usado pelos tabs "Todos",
  // "Santo" e "PJA" para mostrar 1 linha por evento físico (não 1 por tcode).
  const allEventGroups = useMemo(
    () => buildEventGroups(displayList),
    [displayList]
  );

  /** Map rápido (ccode/tcode) → EventGroup que o contém. Permite descobrir o
   *  grupo do `cur` activo em O(1) para renderizar os tabs de escalão. */
  const eventGroupByKey = useMemo(() => {
    const m = new Map<string, EventGroup>();
    for (const g of allEventGroups) {
      for (const e of g.entries) {
        m.set((e.ccode || "?") + "/" + String(e.tcode ?? "?"), g);
      }
    }
    return m;
  }, [allEventGroups]);

  // Agrupamento por mês — todos os torneios (pull + clubes + jovens) — alimenta o tab "Todos"
  const { groups: monthGroups, groupKeys: monthKeys } = useMemo(() => {
    const g: Record<string, EventGroup[]> = {};
    for (const eg of allEventGroups) {
      if (!eg.entries.some(inYear)) continue;
      // Usa tournamentHasManuel para também cobrir _admissions.players e _draws
      // (torneios pré-jogo onde a inscrição existe mas players[] ainda é vazio).
      if (filterManuel && !eg.entries.some(e => tournamentHasManuel(e))) continue;
      if (!eg.entries.some(matchesSearch)) continue;
      const key = eg.date ? eg.date.substring(0, 7) : "?";
      if (!g[key]) g[key] = [];
      g[key].push(eg);
    }
    return { groups: g, groupKeys: Object.keys(g).sort().reverse() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEventGroups, filterManuel, activeYear, searchTerm]);

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
        if ((t as any)._manual && (t as any)._origin === "PJA") return true;
        if (t.ccode === SSERRA_CCODE) return false;
        const year = (t.date || "").slice(0, 4);
        const name = t.name || "";
        if (/PJA/i.test(name)) return true;
        const tcodes = t.tcode?.split("+") || [];
        if (tcodes.some(tc => TOURN_PILLS[tc] === "PJA")) return true;
        if (year >= "2026") {
          if (/greatgolf.*junior/i.test(name)) return true;
          if (/Drive\s+Tour/i.test(name) && !/Challenge/i.test(name)) return true;
          if (/Circuito\s+Aquapor/i.test(name)) return true;
        }
        return false;
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

  const pjaByYear = useMemo(() => {
    const byYear: Record<string, EventGroup[]> = {};
    for (const eg of pjaEventGroups) {
      if (!eg.entries.some(inYear)) continue;
      // Usa tournamentHasManuel para também cobrir _admissions.players e _draws
      // (torneios pré-jogo onde a inscrição existe mas players[] ainda é vazio).
      if (filterManuel && !eg.entries.some(e => tournamentHasManuel(e))) continue;
      if (!eg.entries.some(matchesSearch)) continue;
      const yr = eg.date ? eg.date.substring(0, 4) : "?";
      if (!byYear[yr]) byYear[yr] = [];
      byYear[yr].push(eg);
    }
    const years = Object.keys(byYear).sort().reverse();
    return { byYear, years };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pjaEventGroups, activeYear, filterManuel, searchTerm]);

  // ── Santo da Serra ──
  const santoList = useMemo(
    () => displayList.filter(t => t.ccode === SSERRA_CCODE),
    [displayList]
  );
  const santoEventGroups = useMemo(() => buildEventGroups(santoList), [santoList]);

  const santoByYear = useMemo(() => {
    const byYear: Record<string, EventGroup[]> = {};
    for (const eg of santoEventGroups) {
      if (!eg.entries.some(inYear)) continue;
      // Usa tournamentHasManuel para também cobrir _admissions.players e _draws
      // (torneios pré-jogo onde a inscrição existe mas players[] ainda é vazio).
      if (filterManuel && !eg.entries.some(e => tournamentHasManuel(e))) continue;
      if (!eg.entries.some(matchesSearch)) continue;
      const yr = eg.date ? eg.date.substring(0, 4) : "?";
      if (!byYear[yr]) byYear[yr] = [];
      byYear[yr].push(eg);
    }
    const years = Object.keys(byYear).sort().reverse();
    return { byYear, years };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [santoEventGroups, activeYear, filterManuel, searchTerm]);

  /** Encontra o índice de um torneio em displayList por (ccode, tcode) — NÃO
   *  por referência, porque buildEventGroups pode embrulhar entradas em novos
   *  objectos para injectar o escalão inferido (quebra a igualdade `===`). */
  const findInDisplayList = (t: Tournament): number =>
    displayList.findIndex(d => d.ccode === t.ccode && d.tcode === t.tcode);

  /** Renderiza item de sidebar para uma EventGroup.
   *  - Singleton (entries.length === 1): comportamento idêntico ao anterior.
   *  - Grupo (entries.length > 1): nome simplificado + pill "N escalões" +
   *    pills agregados de todas as entradas; clique vai à entrada activa
   *    se `cur` já pertence ao grupo, senão vai à primeira entrada. */
  function renderSidebarItem(g: EventGroup) {
    const isMulti = g.entries.length > 1;
    // Entrada activa dentro do grupo (ou a primeira, se nenhuma está activa).
    const activeEntryIdx = cur
      ? g.entries.findIndex(e => e.ccode === cur.ccode && e.tcode === cur.tcode)
      : -1;
    const activeEntry = activeEntryIdx >= 0 ? g.entries[activeEntryIdx] : g.entries[0];
    const idx = findInDisplayList(activeEntry);
    const isActive = activeEntryIdx >= 0 && selected === idx;

    const handleClick = () => {
      if (idx >= 0) setSelected(idx);
      md.onSelect();
      // Navegar imediatamente para a URL do torneio escolhido. Sem isto, o
      // state→URL effect pode ficar bloqueado pelo guard anti-loop (params.tkey
      // diferente do novo cur → SKIPPED) e o user fica preso na URL antiga.
      if (activeEntry && activeEntry.ccode && activeEntry.tcode) {
        const target = tournamentUrl("FPG", activeEntry.ccode, activeEntry.tcode);
        if (target && location.pathname !== target) {
          navigate(target, { replace: true });
        }
      }
    };

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
      ...(activeEntry as any),
      name: displayName,
      // Escalão: só mostrar no pill quando é singleton; em grupo o escalão
      // varia por entrada → não cabe num pill único.
      escalao: isMulti ? null : activeEntry.escalao,
      playerCount: nJog,
      pill: pillVal,
      _manuelInscrito: g.entries.some(tournamentHasManuel),
    };
    // Deep-link canónico — o TournSidebarItem vira <a href>. Para sintéticos
    // com tcode "A+B" usa o primeiro tcode no URL (parseTournKey match ambos).
    const firstTcode = (activeEntry.tcode || "").split("+")[0];
    const href = (activeEntry.ccode && firstTcode) ? tournamentUrl("FPG", activeEntry.ccode, firstTcode) : undefined;
    return (
      <TournSidebarItem
        key={(activeEntry._isSynthetic ? "synth_" : "") + keyTcodes + "_" + g.date}
        t={tData}
        isActive={isActive}
        onClick={handleClick}
        extraPills={extraPills}
        href={href}
      />
    );
  }

  return (
    <DataSourcesProvider tournaments={providerTournaments}>
    <div className="tourn-layout">

      {/* ── Toolbar mobile-first: scroll horizontal em vez de grid ── */}
      <div style={{ borderBottom: "1px solid var(--border-light)" }}>

        {/* Linha 1: toda numa linha scrollável */}
        <Toolbar>
          <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Torneios" />
          <ToolbarTitle>🏌️ FPG</ToolbarTitle>
          <DataSourcesChip sources={allSources} />
          {!loading && (<>
            <ToolbarSep />
            {/* Search unificado — mesmo local e tamanho em todos os modos.
                Filtra torneios em modo Torneios, jogadores em modo Ranking PJA,
                etc. O valor é partilhado (searchQuery). */}
            <div style={{ flexShrink: 0, position: "relative", display: "inline-flex", alignItems: "center" }}>
              <span aria-hidden="true" style={{
                position: "absolute", left: 8, fontSize: 11, color: "var(--text-muted)", pointerEvents: "none",
              }}>🔎</span>
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={
                  navMode === "ranking-pja" ? "jogador ou clube..."
                    : navMode === "ranking-sub12" ? "jogador..."
                    : "nome, campo, clube..."
                }
                aria-label="Pesquisar"
                style={{
                  fontSize: 12,
                  padding: "4px 22px 4px 24px",
                  width: 200,
                  border: "1px solid var(--border)",
                  borderRadius: 5,
                  background: "var(--bg-card)",
                  color: "var(--text)",
                  outline: "none",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Limpar pesquisa"
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute", right: 2,
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--text-muted)", fontSize: 14, padding: "0 4px",
                    lineHeight: 1,
                  }}
                >×</button>
              )}
            </div>
          </>)}
          {!loading && (<>
            <ToolbarSep />
            {([
              { key: "torneios",      label: "Torneios" },
              { key: "ranking-pja",   label: "📊 Ranking PJA" },
              { key: "ranking-sub12", label: "🏅 Ranking Sub-12" },
            ] as const).map(({ key, label }) => (
              <button key={key}
                className={"tourn-tab tourn-tab-sm" + (navMode === key ? " active" : " tourn-tab-muted")}
                onClick={() => {
                  setNavMode(key);
                  setSeriesFilter("");
                  setYearFilter(null);
                  const seg = NAV_TO_URL[key];
                  const target = seg ? `/FPG/${seg}` : "/FPG";
                  if (location.pathname !== target) navigate(target);
                }}
                style={{ flexShrink: 0 }}>
                {label}
              </button>
            ))}
            {/* Slot de portal: o PJARankingView renderiza os seus filtros
                (years, search, escalões) aqui via createPortal em vez de ter
                uma toolbar separada. */}
            {navMode === "ranking-pja" && <>
              <ToolbarSep />
              <div id="pja-toolbar-slot" style={{ display: "contents" }} />
            </>}
            {navMode === "torneios" && availYears.length > 1 && (<>
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
                className={"tourn-tab tourn-tab-sm" + (filterManuel ? " active" : " tourn-tab-muted")}
                onClick={() => setFilterManuel(v => !v)}
                style={filterManuel
                  ? { flexShrink: 0, background: "var(--bg-success-subtle)", borderColor: "var(--color-good)", color: "var(--color-good-dark)", whiteSpace: "nowrap" }
                  : { flexShrink: 0, whiteSpace: "nowrap" }}>
                ★ Manuel
              </button>
            </>)}
            <div className="flex-1" style={{ minWidth: 8 }} />
            {/* Contadores à direita */}
            <ExtLink href="https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=XH256YF45T"
              className="fs-11 fw-600"
              style={{ flexShrink: 0, cursor: "pointer", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 5, padding: "3px 8px", lineHeight: 1.6, textDecoration: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 3 }}>
              FPG Torneios ↗
            </ExtLink>
            {loading
              ? <span className="muted fs-11 shrink-0"  style={{ fontStyle: "italic" }}>{loadingMsg}</span>
              : <>
                  {navMode === "torneios" && (() => {
                    const count = seriesFilter === "santo"   ? santoByYear.years.reduce((s, y) => s + (santoByYear.byYear[y]?.length ?? 0), 0)
                                : seriesFilter === "circuit" ? pjaByYear.years.reduce((s, y) => s + (pjaByYear.byYear[y]?.length ?? 0), 0)
                                : seriesFilter === "clubes"  ? clubesList.length
                                : seriesFilter === "jovens"  ? jovensGroups.length
                                : monthKeys.reduce((s, k) => s + (monthGroups[k]?.length ?? 0), 0);  // "Todos" respeita search + year + manuel
                    return <span className="chip shrink-0" title={searchTerm ? `Com filtro "${searchQuery}"` : undefined}>
                      {count} torneio{count !== 1 ? "s" : ""}{searchTerm ? " ✓" : ""}
                    </span>;
                  })()}
                  {seriesFilter !== "santo" && seriesFilter !== "clubes" && seriesFilter !== "jovens" && navMode === "torneios" && (
                    <span className="chip" style={{ flexShrink: 0, marginLeft: 4, background: "var(--bg-hover)" }}>
                      {fileMeta.length} ficheiro{fileMeta.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </>
            }
          </>)}
        </Toolbar>

        {/* Linha 2: filtros de série — wrap em mobile */}
        {!loading && navMode === "torneios" && (
          <div style={{
            display: "flex", alignItems: "center", gap: md.isMobile ? 4 : 6,
            padding: "4px 12px 6px",
            overflowX: md.isMobile ? "visible" : "auto",
            flexWrap: md.isMobile ? "wrap" : "nowrap",
            rowGap: md.isMobile ? 4 : undefined,
            scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
            borderTop: "1px solid var(--border-light)",
          }}>
            {([
              { key: "",        label: "Todos" },
              { key: "jovens",  label: "🏆 JOVENS" },
              { key: "clubes",  label: "🏅 CLUBES" },
              { key: "santo",   label: "⛳ STO" },
              { key: "circuit", label: "🏆 PJA" },
            ] as const).map(({ key, label }) => {
              const active = seriesFilter === key;
              const st = active
                ? key === "santo"  ? { flexShrink: 0, ...PILL_SSERRA, borderColor: PILL_SSERRA.background as string }
                : key === "clubes" ? { flexShrink: 0, background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }
                : key === "jovens"    ? { flexShrink: 0, background: SIDEBAR_ACCENT.tour, borderColor: SIDEBAR_ACCENT.tour, color: "#fff" }
                : { flexShrink: 0 }
                : { flexShrink: 0 };
              const urlSeg = FILTER_TO_URL[key];
              const href = urlSeg ? `/FPG/${urlSeg}` : "/FPG";
              return (
                <a key={key}
                  href={href}
                  className={"tourn-tab tourn-tab-sm" + (active ? " active" : " tourn-tab-muted")}
                  onClick={e => {
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                      e.preventDefault();
                      setSeriesFilter(key);
                      setJovensShowInscricoes(false);
                      navigate(urlSeg ? `/FPG/${urlSeg}` : "/FPG");
                    }
                  }}
                  style={st}>
                  {label}
                </a>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <div className="fw-600 fs-13" style={{ padding: "16px 20px", color: "var(--danger)" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Master-detail (modos "month" e "circuit") */}
      {navMode === "torneios" && seriesFilter !== "clubes" && seriesFilter !== "jovens" && (
      <div className="master-detail">
        {/* Sidebar */}
        <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
          {loading && displayList.length === 0 && (
            <LoadingState size="sm" message="A carregar…" />
          )}

          {seriesFilter === ""
            ? monthKeys.map(gk => (
                <React.Fragment key={gk}>
                  <div className="sidebar-section-title-dark">{monthLabel(gk)}</div>
                  {monthGroups[gk].map(eg => renderSidebarItem(eg))}
                </React.Fragment>
              ))
            : seriesFilter === "santo"
              ? santoByYear.years.length === 0
                ? <div className="muted fs-11 u-pad-italic">Sem torneios Santo da Serra</div>
                : santoByYear.years.map(yr => {
                    const items = santoByYear.byYear[yr];  // já filtrado no useMemo
                    if (items.length === 0) return null;
                    return (
                      <React.Fragment key={yr}>
                        <div className="sidebar-section-title-dark">⛳ Santo da Serra {yr}</div>
                        {items.map(eg => renderSidebarItem(eg))}
                      </React.Fragment>
                    );
                  })
              : pjaByYear.years.length === 0
                ? <div className="muted fs-11 u-pad-italic">Sem torneios PJA</div>
                : pjaByYear.years.map(yr => (
                    <React.Fragment key={yr}>
                      <div className="sidebar-section-title-dark">🏆 {yr}</div>
                      {pjaByYear.byYear[yr].map(eg => renderSidebarItem(eg))}
                    </React.Fragment>
                  ))
          }
        </div>

        {/* Detail */}
        <div className="course-detail" ref={md.detailRef}>
          {/* Deep-link em curso: URL tem /FPG/torneio/{tkey} mas `cur` ainda
              não corresponde (displayList incompleto — pull-torneios,
              pjaExtra, jovens estão a carregar). Mostra "A carregar..." em
              vez do torneio errado, evitando que o utilizador veja várias
              páginas diferentes a piscar até o match ser encontrado.
              Aceita tcode sintético "A+B" quando o URL pede apenas "A". */}
          {(() => {
            // Resolver torneio DIRECTAMENTE pela URL (find por ccode/tcode).
            // Evita problemas com displayList[selected] stale durante async.
            const tShow = (() => {
              if (!params.tkey) return cur;
              const parsed = parseTournKey(params.tkey);
              if (!parsed) return cur;
              return displayList.find(t => {
                if (String(t.ccode) !== String(parsed.ccode)) return false;
                const tt = String(t.tcode ?? "");
                if (tt === String(parsed.tcode)) return true;
                if (tt.split("+").includes(String(parsed.tcode))) return true;
                return false;
              });
            })();
            if (params.tkey && !tShow) {
              return <div className="center-msg muted" style={{ padding: 40 }}>A carregar torneio {params.tkey}…</div>;
            }
            if (!tShow) {
              return !loading && <div className="center-msg muted">Selecciona um torneio</div>;
            }
            const curGroup = eventGroupByKey.get((tShow.ccode || "?") + "/" + String(tShow.tcode ?? "?"));
            const showTabs = curGroup && curGroup.entries.length > 1;
            return (
              <>
                {showTabs && (
                  <div style={{ display: "flex", gap: 4, padding: "8px 12px 0", flexWrap: "wrap",
                    borderBottom: "1px solid var(--border-light)", background: "var(--bg-card)" }}>
                    {curGroup!.entries.map((e) => {
                      const active = e.ccode === tShow.ccode && e.tcode === tShow.tcode;
                      // Quando as entradas do grupo não têm escalão (ex: "3º Torneio
                      // Academia Junior - 18 buracos" / "- 9 buracos"), derivar o
                      // label da tab a partir do sufixo que distingue cada entrada do
                      // nome comum do grupo (curGroup.name já vem sem o sufixo).
                      const _gNm = curGroup!.name || "";
                      const _suffix = _gNm && e.name && e.name.toLowerCase().startsWith(_gNm.toLowerCase())
                        ? e.name.slice(_gNm.length).replace(/^[\s\-–:·]+/, "").trim()
                        : "";
                      const label = (e as any)._tabLabel
                        ?? e.escalao
                        ?? (_suffix || (e.name && e.name.length <= 20 ? e.name : "Esc"));
                      const nJog = e.playerCount || e.players.length;
                      const entryIdx = findInDisplayList(e);
                      return (
                        <button key={e.tcode + "_" + e.date}
                          className={`tourn-tab tourn-tab-sm${active ? " active" : ""}`}
                          onClick={() => {
                            if (entryIdx >= 0) setSelected(entryIdx);
                            // Navegar imediatamente — state→URL pode estar bloqueado por guard anti-loop
                            if (e.ccode && e.tcode) {
                              const target = tournamentUrl("FPG", e.ccode, e.tcode);
                              if (target && location.pathname !== target) navigate(target, { replace: true });
                            }
                          }}
                          style={{ marginBottom: 6 }}>
                          {label}
                          {nJog > 0 && (
                            <span className="fs-10" style={{ marginLeft: 3, opacity: 0.8 }}>
                              ({nJog} jog)
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                <TournamentDetail tournament={tShow} escLookup={escLookup} playersDB={playersDB} />
              </>
            );
          })()}
        </div>
      </div>
      )}

      {/* ── Clubes ─────────────────────────────────────────────────────── */}
      {navMode === "torneios" && seriesFilter === "clubes" && (
        <div className="master-detail">
          {/* Sidebar Clubes */}
          <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
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
                    ...(t as any),
                    playerCount: t.playerCount || t.players.length,
                    campo: (t.campo || "Oporto") + progressSuffix,
                  } as SidebarItemTournament;
                  return (
                    <TournSidebarItem
                      key={t.tcode + "_" + t.date}
                      t={tWithProgress}
                      isActive={clubesSelected === idx}
                      onClick={() => { setClubesSelected(idx); md.onSelect(); }}
                      accentColor={SIDEBAR_ACCENT.clubes}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {/* Detail Clubes */}
          <div className="course-detail" ref={md.detailRef}>
            {/* Tabs Individual / Grupos */}
            <div style={{
              display: "flex", borderBottom: "1px solid var(--border)",
              background: "var(--bg-card,#fff)", position: "sticky", top: 0, zIndex: 10,
            }}>
              {(["grupos", "individual"] as const).map(v => {
                const label = v === "grupos" ? "🏅 Grupos" : "📋 Individual";
                const active = clubesView === v;
                return (
                  <button key={v} onClick={() => setClubesView(v)} className="fs-12" style={{
                    padding: "8px 16px", fontWeight: active ? 700 : 500,
                    color: active ? "var(--text)" : "var(--text-muted)",
                    background: "transparent", border: "none",
                    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                    cursor: "pointer", transition: "all .15s",
                  }}>{label}</button>
                );
              })}
            </div>

            {clubesView === "individual"
              ? curClubes
                  ? <TournamentDetail tournament={curClubes} escLookup={escLookup} playersDB={playersDB} />
                  : !clubesLoading && (
                      <div className="center-msg muted">
                        {clubesLoaded ? "Selecciona um torneio" : "A carregar…"}
                      </div>
                    )
              : (() => {
                  const gruposData = curClubesYear ? CLUBES_GRUPOS_BY_YEAR[curClubesYear] : null;
                  if (gruposData) {
                    return <ClubesGruposView
                      grupos={gruposData[(curClubes as any)?._clubesEsc as "sub14" | "sub18"] ?? gruposData[clubesEsc as "sub14" | "sub18"] ?? []}
                      tournament={curClubes}
                      escKey={((curClubes as any)?._clubesEsc ?? clubesEsc) as "sub14" | "sub18"}
                    />;
                  }
                  if (!curClubes && !clubesLoading) {
                    return <div className="center-msg muted">Selecciona um torneio</div>;
                  }
                  return (
                    <div className="fs-13 c-muted" style={{ padding: "32px 24px", textAlign: "center" }}>
                      <div className="mb-12" style={{ fontSize: 32 }}>📋</div>
                      <div className="fw-600 mb-6">Vista de grupos não disponível para {curClubesYear}</div>
                      <div className="fs-12">Os dados de composição de grupos desta edição não estão carregados.<br/>Use o tab <strong>Individual</strong> para ver os resultados.</div>
                    </div>
                  );
                })()
            }
          </div>
        </div>
      )}

      {/* Master-detail Jovens */}
      {navMode === "torneios" && seriesFilter === "jovens" && (
        <div className="master-detail">
          <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
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
                  setJovensShowAnalise(false);
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
                  const REGION_LABEL: Record<string, string> = {
                    "000": "Nacional", "988": "Sul", "987": "Norte",
                    "985": "Tejo", "983": "Açores", "982": "Madeira",
                    "051": "Açores", "007": "Madeira", "910": "Norte",
                    "059": "Palheiro", "005": "Açores",
                  };
                  const regionLabel = REGION_LABEL[t0.ccode ?? ""] ?? t0.ccode ?? "";
                  // Data só dd/mm (ano já está no cabeçalho de secção)
                  const ddmm = g.date ? g.date.substring(8, 10) + "/" + g.date.substring(5, 7) : "";
                  // Manuel detection: procurar em TODAS as entries do grupo (o grupo
                  // pode ter Sub 10 e Sub 14 do mesmo Regional — Manuel está só numa).
                  const groupHasManuel = g.entries.some(e => tournamentHasManuel(e));
                  const sidebarT: SidebarItemTournament = {
                    ...(t0 as any),
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
                        setJovensGroupKey(g.key); setJovensEscIdx(0); setJovensShowInscricoes(false); setJovensShowAnalise(false); md.onSelect();
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
                            <span className="fs-10 fw-600" style={{ padding: "1px 6px",
                              borderRadius: 10, background: "var(--bg-hover)", color: "var(--text-2)",
                              border: "1px solid var(--border)" }}>
                              {regionLabel}
                            </span>
                          )}
                          <span className="fs-11 c-muted">{ddmm}</span>
                        </div>
                      }
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="course-detail" ref={md.detailRef}>
            {jovensShowAnalise ? (
              // Análise foi migrada para /titulos em 2026-05-04 — qualquer
              // entrada residual nesta vista redirecciona automaticamente.
              <Navigate to="/titulos/nacional" replace />
            ) : jovensShowInscricoes ? (
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
                      const label = (e as any)._tabLabel ?? e.escalao ?? "Esc " + (ri + 1);
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
                  ? <TournamentDetail tournament={curJovens} escLookup={escLookup} playersDB={playersDB} />
                  : <div className="center-msg muted">Selecciona um torneio</div>
                }
              </>
            ) : (
              !jovensLoading && <div className="center-msg muted">{jovensLoaded ? "Selecciona um torneio" : "A carregar…"}</div>
            )}
          </div>
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
