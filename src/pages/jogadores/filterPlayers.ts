/**
 * src/pages/jogadores/filterPlayers.ts
 *
 * Lógica PURA de filtragem/ordenação da lista de jogadores (JogadoresPage).
 * Extraída do corpo do componente em 2026-08-15 para ser testável sem React
 * e para consolidar reimplementações que viviam espalhadas pela página:
 *   - o haystack de pesquisa (duplicado entre `filtered` e `escalaoCountMap`)
 *   - o teste "é senior" (3 cópias) → constants/escaloes.isSeniorEscalao
 *   - a contagem de rondas para ordenação (duplicada com a sidebar)
 */
import type { Player, SexFilter } from "../../data/types";
import type { FederadoRaw, MergedPlayer } from "../../data/federadosLoader";
import type { PlayerStats, PlayerStatsDb } from "../../data/playerStatsTypes";
import { daysSince } from "../../data/playerStatsTypes";
import type { FederadoPP } from "../../data/federadosPPLoader";
import { hasRealPPHcp } from "../../data/federadosPPLoader";
import { norm } from "../../utils/format";
import { clubShort } from "../../utils/playerUtils";
import { PIN_RANK } from "../../constants/pinnedPlayers";
import { ESC_ORDER_FULL as ESC_ORDER, isSeniorEscalao } from "../../constants/escaloes";

export type SortKey = "name" | "hcp" | "club" | "escalao" | "ranking" | "rounds" | "aces";
export type ViewMode = "ours" | "todos";

/** Threshold: "novo" = última ronda há ≤7 dias (bolinha verde + filtro 🟢). */
export const NEW_DAYS = 7;

/** WHS cap é 54.0 — valores ≥ 54 (incluindo 99) são placeholders usados
 *  para jogadores sem HI estabelecido ("a começar a jogar"). Não entram
 *  nas estatísticas de escalão e têm um pill próprio (neutro, em formação). */
export const HCP_UNESTABLISHED_THRESHOLD = 54;

/** Índice de ordenação semântica dos escalões (Sub-10 → Outros). */
export const ESC_IDX = new Map(ESC_ORDER.map((e, i) => [e, i]));

/** Forma mínima de um jogador da lista — o merge players×federados produz
 *  objectos mais ricos; as funções são genéricas para preservar o tipo. */
export type ListPlayer = {
  fed: string;
  name: string;
  sex?: string;
  escalao: string;
  hcp: number | null;
  region?: string;
  club?: Player["club"];
  tags?: string[];
  _source?: MergedPlayer["_source"];
  _federadoRaw?: FederadoRaw;
};

/** Estado completo dos filtros da toolbar. */
export interface JogadoresFilterState {
  q: string;
  sexFilter: SexFilter;
  escalaoFilter: Set<string>;
  regionFilter: string;
  natFilter: "ALL" | "PT" | "FOREIGN";
  clubFilter: string;
  hcpMin: string;
  hcpMax: string;
  activeOnlyFilter: boolean;
  sourceFilter: "ALL" | "WITH_ANALYSIS" | "CADASTRO";
  includeSeniors: boolean;
  newFilter: boolean;
  onlyPP: boolean;
  prioritizeJuniors: boolean;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
}

/** Contexto de dados auxiliares (fora do estado dos filtros). */
export interface FilterContext {
  viewMode: ViewMode;
  statsDb: PlayerStatsDb;
  ppMap: Map<string, FederadoPP>;
  /** Índice de pesquisa pré-calculado (buildSearchIndex) — opcional mas
   *  recomendado para listas grandes (modo TODOS). */
  searchIndex?: SearchIndex;
}

/** Haystack de pesquisa — nome, clube, escalão, fed, região e tags. */
export function searchHaystack(p: ListPlayer): string {
  return norm([p.name, clubShort(p as unknown as Player), p.escalao, p.fed, p.region, ...(p.tags || [])].join(" "));
}

/** Índice fed → haystack, pré-calculado UMA vez por lista (a página memoiza
 *  sobre allPlayers). Sem ele, cada keystroke reconstruía o haystack (norm/NFKD
 *  sobre 6 campos) 2× por jogador × ~15k jogadores (filtered + countByEscalao). */
export type SearchIndex = Map<string, string>;
export function buildSearchIndex(list: ListPlayer[]): SearchIndex {
  const m: SearchIndex = new Map();
  for (const p of list) m.set(p.fed, searchHaystack(p));
  return m;
}

/** Pesquisa multi-palavra: todas as palavras têm de aparecer no haystack. */
export function applySearch<T extends ListPlayer>(list: T[], q: string, index?: SearchIndex): T[] {
  const qq = norm(q);
  if (!qq) return list;
  const words = qq.split(/\s+/).filter(Boolean);
  return list.filter(p => {
    const haystack = index?.get(p.fed) ?? searchHaystack(p);
    return words.every(w => haystack.includes(w));
  });
}

/** "Rondas" para a ordenação por voltas = rondas no ano civil corrente.
 *  statsDb.roundsCurrentYear é gerado por enrich-players.js a partir do
 *  data.json — MESMA fonte que o detalhe da ficha de jogador, garantindo que
 *  o número da sidebar bate com o do detalhe header ("N em {ano}"). Para
 *  federados-only (sem data.json) cai para rounds_current_year do cadastro,
 *  depois roundsLast12m e por fim roundsTotal. */
export function playerRoundCount(p: ListPlayer, ps: PlayerStats | undefined): number {
  if (ps?.roundsCurrentYear != null) return ps.roundsCurrentYear;
  const rcy = p._federadoRaw?.rounds_current_year;
  if (typeof rcy === "number" && rcy > 0) return rcy;
  if (ps?.roundsLast12m != null) return ps.roundsLast12m;
  return ps?.roundsTotal ?? 0;
}

/** Jogador com actividade recente? (união player-stats locais + cadastro FPG) */
export function isActivePlayer(p: ListPlayer, ps: PlayerStats | undefined): boolean {
  if (ps?.roundsLast12m != null && ps.roundsLast12m > 0) return true;
  if (ps?.lastRoundDate && ps.lastRoundDate.startsWith(String(new Date().getFullYear()))) return true;
  const rcy = p._federadoRaw?.rounds_current_year;
  if (typeof rcy === "number" && rcy > 0) return true;
  return false;
}

/** Contagem por escalão para as pills da toolbar — aplica APENAS pesquisa,
 *  sexo, região e hidden (os outros filtros não afectam as contagens). */
export function countByEscalao(list: ListPlayer[], f: Pick<JogadoresFilterState, "q" | "sexFilter" | "regionFilter">, index?: SearchIndex): Record<string, number> {
  const map: Record<string, number> = {};
  let l = applySearch(list, f.q, index);
  if (f.sexFilter !== "ALL") l = l.filter(p => p.sex === f.sexFilter);
  if (f.regionFilter !== "ALL") l = l.filter(p => p.region === f.regionFilter);
  l = l.filter(p => !p.tags?.includes("hidden"));
  for (const p of l) {
    if (p.escalao) map[p.escalao] = (map[p.escalao] || 0) + 1;
  }
  return map;
}

/** Estatísticas de HCP por escalão — usadas pelo HcpPill da sidebar para
 *  colorir o pill relativamente aos pares do mesmo escalão (em vez de uma
 *  escala absoluta que seria injusta: um Sub-10 com HCP 25 pode ser dos
 *  melhores do escalão, um Sub-18 com 15 pode ser dos piores do seu).
 *
 *  ⚠ Filtramos jogadores com HCP ≥ 54 (WHS cap / placeholder 99) — são
 *  jogadores em formação, sem HI real estabelecido, que puxariam os
 *  percentis artificialmente para cima. */
export type EscHcpStats = {
  p25: number;   // Topo (25% melhores têm HCP ≤ p25)
  p50: number;   // Mediana
  p75: number;   // 25% piores têm HCP > p75
  count: number;
};

export function computeHcpStatsByEscalao(list: ListPlayer[]): Record<string, EscHcpStats> {
  const byEsc: Record<string, number[]> = {};
  for (const p of list) {
    if (p.hcp == null || !isFinite(p.hcp)) continue;
    if (p.hcp >= HCP_UNESTABLISHED_THRESHOLD) continue; // excluir jogadores em formação
    const e = p.escalao;
    if (!e) continue;
    (byEsc[e] ||= []).push(p.hcp);
  }
  const out: Record<string, EscHcpStats> = {};
  for (const [esc, hcps] of Object.entries(byEsc)) {
    if (hcps.length === 0) continue;
    const sorted = [...hcps].sort((a, b) => a - b);
    const n = sorted.length;
    const q = (pct: number) => sorted[Math.min(n - 1, Math.floor(n * pct))];
    out[esc] = { p25: q(0.25), p50: q(0.50), p75: q(0.75), count: n };
  }
  return out;
}

/** Nº de filtros activos — badge "✕ Limpar N" + FilteredStatsCard. */
export function countActiveFilters(f: JogadoresFilterState): number {
  return [
    f.q !== "",
    f.sexFilter !== "ALL",
    f.escalaoFilter.size > 0,
    f.regionFilter !== "ALL",
    f.natFilter !== "ALL",
    f.clubFilter !== "ALL",
    f.hcpMin !== "",
    f.hcpMax !== "",
    f.activeOnlyFilter,
    f.sourceFilter !== "ALL",
    f.newFilter,
    f.onlyPP,
  ].filter(Boolean).length;
}

/** Filtragem + ordenação completa da lista da sidebar. Pura e determinística. */
export function filterAndSortPlayers<T extends ListPlayer>(
  allPlayers: T[], f: JogadoresFilterState, ctx: FilterContext,
): T[] {
  const { viewMode, statsDb, ppMap, searchIndex } = ctx;
  let list = applySearch(allPlayers, f.q, searchIndex);
  if (f.sexFilter !== "ALL") list = list.filter(p => p.sex === f.sexFilter);
  // Ocultar seniores por defeito (Absoluto/MidAmateur/Sénior/SuperSenior)
  // — só aplica quando não há filtro de escalão activo (senão respeitamos a escolha explícita)
  if (!f.includeSeniors && f.escalaoFilter.size === 0) {
    list = list.filter(p => !isSeniorEscalao(p.escalao));
  }
  if (f.escalaoFilter.size > 0) list = list.filter(p => f.escalaoFilter.has(p.escalao));
  if (f.regionFilter !== "ALL") list = list.filter(p => p.region === f.regionFilter);
  if (viewMode === "todos" && f.natFilter !== "ALL") {
    list = list.filter(p => {
      const cp = p._federadoRaw?.country_prefix;
      if (f.natFilter === "PT") return cp === "PT" || !cp;
      return cp && cp !== "PT";
    });
  }
  if (f.clubFilter !== "ALL") {
    list = list.filter(p => {
      const code = typeof p.club === "object" ? p.club?.code : undefined;
      return code === f.clubFilter;
    });
  }
  // Filtro HCP range
  const hMin = f.hcpMin.trim() === "" ? null : parseFloat(f.hcpMin.replace(",", "."));
  const hMax = f.hcpMax.trim() === "" ? null : parseFloat(f.hcpMax.replace(",", "."));
  if (hMin != null && !isNaN(hMin)) list = list.filter(p => p.hcp != null && p.hcp >= hMin);
  if (hMax != null && !isNaN(hMax)) list = list.filter(p => p.hcp != null && p.hcp <= hMax);
  // Filtro "Activos" — jogadores com actividade recente (nº rondas > 0).
  // Usa a MESMA base de cálculo que a ordenação "voltas" e o KPI do detalhe.
  if (f.activeOnlyFilter) {
    list = list.filter(p => isActivePlayer(p, statsDb[p.fed]));
  }
  // Filtro fonte (só em TODOS)
  if (viewMode === "todos" && f.sourceFilter !== "ALL") {
    list = list.filter(p => {
      const src = p._source;
      if (f.sourceFilter === "WITH_ANALYSIS") return src === "both" || src === "players";
      if (f.sourceFilter === "CADASTRO") return src === "feds";
      return true;
    });
  }
  list = list.filter(p => !p.tags?.includes("hidden"));
  if (f.newFilter) list = list.filter(p => { const d = daysSince(statsDb[p.fed]); return d != null && d <= NEW_DAYS; });
  // Filtro "só P&P" — jogadores com handicap Pitch & Putt estabelecido.
  if (f.onlyPP) list = list.filter(p => hasRealPPHcp(ppMap.get(p.fed)));

  // Ordenação com direcção (asc/desc) e ordem semântica para escalão
  const dir = f.sortDir === "asc" ? 1 : -1;
  // Pin: Manuel, Gastão e o top 5 de cada escalão do Campeonato Nacional de
  // Jovens (ver constants/pinnedPlayers.ts) flutuam para o topo, na ordem de
  // PIN_RANK, quando ordenamos por Nome. Os restantes seguem a ordem normal.
  const pinActive = f.prioritizeJuniors && f.sortKey === "name";
  return [...list].sort((a, b) => {
    if (pinActive) {
      const ra = PIN_RANK.get(a.fed);
      const rb = PIN_RANK.get(b.fed);
      if (ra != null || rb != null) {
        if (ra == null) return 1;
        if (rb == null) return -1;
        if (ra !== rb) return ra - rb;
      }
    }
    switch (f.sortKey) {
      case "name": return dir * a.name.localeCompare(b.name, "pt");
      case "hcp": return dir * ((a.hcp ?? 999) - (b.hcp ?? 999));
      case "club": return dir * clubShort(a as unknown as Player).localeCompare(clubShort(b as unknown as Player), "pt");
      case "escalao": {
        const ai = ESC_IDX.get(a.escalao) ?? 999;
        const bi = ESC_IDX.get(b.escalao) ?? 999;
        return dir * (ai - bi);
      }
      case "ranking": return dir * ((a.hcp ?? 999) - (b.hcp ?? 999));
      case "rounds":
        return dir * (playerRoundCount(a, statsDb[a.fed]) - playerRoundCount(b, statsDb[b.fed]))
          || (dir * ((statsDb[a.fed]?.roundsTotal ?? 0) - (statsDb[b.fed]?.roundsTotal ?? 0)));
      case "aces": {
        // Nº de holes-in-one (statsDb.aces, gerado por enrich-players.js).
        // Desempate por nome para estabilidade entre jogadores com 0.
        const av = statsDb[a.fed]?.aces ?? 0;
        const bv = statsDb[b.fed]?.aces ?? 0;
        return (dir * (av - bv)) || a.name.localeCompare(b.name, "pt");
      }
      default: return 0;
    }
  });
}
