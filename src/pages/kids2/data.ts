// Segundo .trim() necessario porque pontuacao a direita (ex: "Jr.") vira
  // espaco e .replace(/\s+/g," ") so colapsa - nao corta extremos.
  /**
 * kids2/data.ts
 *
 * Camada de dados canónica. Lê os ficheiros produzidos pelo agregador
 * (scripts/aggregator/index.js) e expõe um hook React com tipos directos.
 *
 * Ficheiros:
 *   /data/juniors.json                      — roster cross-federação
 *   /data/juniors-tournaments.json          — manifest (sharded) OU torneios inline
 *   /data/juniors-tournaments-NN.json       — shards individuais (se sharded)
 *   /data/tournament-catalog.json           — séries de torneios
 */

import { useEffect, useState } from "react";
import { cachedFetchJson } from "../../data/fetchCache";
import type { DataSource } from "../../ui/DataSources";

// ═════════════════════════════════════════════════════════════════════
// Types canónicos (espelham scripts/aggregator/types.js)
// ═════════════════════════════════════════════════════════════════════

export interface HcpPoint {
  date: string;          // "YYYY-MM-DD"
  hcpExact: number;
  source: string;        // "fpg" | "ffg" | "fcg" | ...
  tcode?: string;        // identificador do torneio na fonte
  ccode?: string;
  label?: string;        // nome do torneio (para tooltip)
}

export interface Junior {
  id: string;
  canonicalName: string;
  aliases?: string[];
  dob?: string;
  dobRange?: { lo: string; hi: string };
  sex?: "M" | "F";
  nationality?: string;
  country?: string;
  region?: string;
  club?: string;
  sources: JuniorSources;
  meta?: Record<string, unknown>;
  computed?: Record<string, unknown>;
  tournamentIds: string[];
  /** Série temporal de HCP — um snapshot por participação. Ordenada desc por date. */
  hcpHistory?: HcpPoint[];
  _match: {
    confidence: "strong" | "probable" | "manual";
    evidence: string[];
    mergedFromSources: string[];
  };
}

export interface JuniorSources {
  uskids?: {
    memberId: string;
    ageGroupCurrent?: string;
    historicalMemberIds?: Array<{ memberId: string; note?: string } | string>;
  };
  fpg?: {
    fed: string;
    club?: string;
    clubCode?: string;
    clubLong?: string;
    hcpExact?: number;
    hcpDate?: string;
    sex?: "M" | "F";
    tags?: string[];
    primary?: boolean;
    historicalFeds?: Array<{ fed: string; note?: string } | string>;
  };
  rfeg?: {
    lic: string;
    club?: string;
    hcp?: number;
    catEdad?: string;
    sex?: "M" | "F";
    historicalLicenses?: Array<{ lic: string; club?: string; catEdad?: string; note?: string } | string>;
  };
  ffgolf?: {
    lic: string;
    club?: string;
    hcp?: number;
    region?: string;
    sex?: "M" | "F";
    glfLic?: string;
    historicalLicenses?: Array<{ lic: string; note?: string } | string>;
  };
  _secondary?: Array<{ sourceId: string; key: string }>;
}

export interface Tournament {
  id: string;
  sourceId: string;
  sourceKey: string;
  name?: string;
  shortName?: string;
  seriesId?: string;
  seriesLabel?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  course?: string;
  parTotal?: number;
  holesPerRound?: number;
  rounds?: number;
  flights: Flight[];
  links?: Array<{ label: string; url: string }>;
  extra?: Record<string, unknown>;
}

export interface Flight {
  flightKey: string;
  label: string;
  ageMin?: number | null;
  ageMax?: number | null;
  sex?: "M" | "F" | "mixed" | null;
  par?: number[];
  yards?: number[];
  fieldSize?: number | null;
  results: Result[];
}

export interface Result {
  juniorId: string;
  playerNameInSource?: string;
  pos?: number | null;
  status?: "OK" | "WD" | "DNS" | "DQ" | "IE" | "CUT";
  totalGross?: number | null;
  toPar?: number | null;
  rounds?: Array<{ round: number; gross?: number | null; strokes?: number[] }>;
}

export interface TournamentSeries {
  id: string;
  label: string;
  sourceId: string;
  circuit?: string;
  editionsCount: number;
  tournamentIds: string[];
  firstDate?: string;
  lastDate?: string;
}

export interface CanonicalData {
  juniors: Junior[];
  tournaments: Tournament[];
  series: TournamentSeries[];
  juniorById: Map<string, Junior>;
  juniorByUskidsMember: Map<string, Junior>;
  juniorByFpgFed: Map<string, Junior>;
  juniorByRfegLic: Map<string, Junior>;
  juniorByFfgolfLic: Map<string, Junior>;
  juniorByNormName: Map<string, Junior[]>;
  tournamentById: Map<string, Tournament>;
  seriesById: Map<string, TournamentSeries>;
  manuel: Junior | null;
  /** Ficheiros canónicos lidos pelo loader — alimenta DataSourcesChip na toolbar. */
  sources: DataSource[];
}

// ═════════════════════════════════════════════════════════════════════
// Loader
// ═════════════════════════════════════════════════════════════════════

const MANUEL_USKIDS_ID = "630106";

function normName(s: string): string {
  return (s || "").trim().toLowerCase()
    .replace(/[-'’.·\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}

async function fetchWithSource(path: string, group?: string): Promise<{ data: unknown; source: DataSource }> {
  try {
    const data = await cachedFetchJson(path);
    const d = data as any;
    // Conta heurística: tournaments | juniors | series | shards
    let count: number | undefined;
    if (Array.isArray(d?.tournaments)) count = d.tournaments.length;
    else if (Array.isArray(d?.juniors)) count = d.juniors.length;
    else if (Array.isArray(d?.series)) count = d.series.length;
    else if (Array.isArray(d?.shards)) count = d.shards.length;
    return {
      data,
      source: {
        path,
        status: "loaded",
        count,
        source: d?.generatedBy || d?.source,
        lastUpdated: d?.generatedAt || d?.lastUpdated,
        group,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      data: null,
      source: { path, status: "error", error: message, group },
    };
  }
}

async function loadCanonical(): Promise<CanonicalData> {
  const sources: DataSource[] = [];

  const [juniorsLoad, tournamentsLoad, catalogLoad] = await Promise.all([
    fetchWithSource("/data/juniors.json", "main"),
    fetchWithSource("/data/juniors-tournaments.json", "main"),
    fetchWithSource("/data/tournament-catalog.json", "main"),
  ]);
  sources.push(juniorsLoad.source, tournamentsLoad.source, catalogLoad.source);

  const juniors: Junior[] = (juniorsLoad.data as any)?.juniors || [];
  const series: TournamentSeries[] = (catalogLoad.data as any)?.series || [];

  // Tournaments podem vir num ficheiro único OU em shards (manifest sharded:true)
  let tournaments: Tournament[] = [];
  const tResp = tournamentsLoad.data as any;
  if (tResp?.sharded && Array.isArray(tResp.shards)) {
    const shardLoads = await Promise.all(
      tResp.shards.map((fn: string) => fetchWithSource(`/data/${fn}`, "shards")),
    );
    for (const sl of shardLoads) {
      sources.push(sl.source);
      const arr = (sl.data as any)?.tournaments;
      if (Array.isArray(arr)) tournaments.push(...arr);
    }
  } else if (Array.isArray(tResp?.tournaments)) {
    tournaments = tResp.tournaments;
  }

  const juniorById = new Map<string, Junior>();
  const juniorByUskidsMember = new Map<string, Junior>();
  const juniorByFpgFed = new Map<string, Junior>();
  const juniorByRfegLic = new Map<string, Junior>();
  const juniorByFfgolfLic = new Map<string, Junior>();
  const juniorByNormName = new Map<string, Junior[]>();

  for (const j of juniors) {
    juniorById.set(j.id, j);
    if (j.sources.uskids?.memberId) juniorByUskidsMember.set(j.sources.uskids.memberId, j);
    if (j.sources.fpg?.fed) juniorByFpgFed.set(j.sources.fpg.fed, j);
    if (j.sources.rfeg?.lic) juniorByRfegLic.set(j.sources.rfeg.lic, j);
    if (j.sources.ffgolf?.lic) juniorByFfgolfLic.set(j.sources.ffgolf.lic, j);
    const nk = normName(j.canonicalName);
    let arr = juniorByNormName.get(nk);
    if (!arr) { arr = []; juniorByNormName.set(nk, arr); }
    arr.push(j);
    for (const alias of j.aliases || []) {
      const ak = normName(alias);
      if (ak === nk) continue;
      let arr2 = juniorByNormName.get(ak);
      if (!arr2) { arr2 = []; juniorByNormName.set(ak, arr2); }
      if (!arr2.includes(j)) arr2.push(j);
    }
  }

  const tournamentById = new Map<string, Tournament>();
  for (const t of tournaments) tournamentById.set(t.id, t);

  const seriesById = new Map<string, TournamentSeries>();
  for (const s of series) seriesById.set(s.id, s);

  const manuel = juniorByUskidsMember.get(MANUEL_USKIDS_ID) || null;

  return {
    juniors,
    tournaments,
    series,
    juniorById,
    juniorByUskidsMember,
    juniorByFpgFed,
    juniorByRfegLic,
    juniorByFfgolfLic,
    juniorByNormName,
    tournamentById,
    seriesById,
    manuel,
    sources,
  };
}

// ═════════════════════════════════════════════════════════════════════
// Cache + Hook
// ═════════════════════════════════════════════════════════════════════

let _cache: Promise<CanonicalData> | null = null;

function getCache(): Promise<CanonicalData> {
  if (!_cache) _cache = loadCanonical();
  return _cache;
}

export function invalidateCanonicalCache(): void {
  _cache = null;
}

export type CanonicalStatus =
  | { kind: "loading" }
  | { kind: "ready"; data: CanonicalData }
  | { kind: "error"; error: string };

export function useJuniorsCanonical(): CanonicalStatus {
  const [status, setStatus] = useState<CanonicalStatus>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    getCache()
      .then((data) => { if (alive) setStatus({ kind: "ready", data }); })
      .catch((err) => { if (alive) setStatus({ kind: "error", error: String(err?.message || err) }); });
    return () => { alive = false; };
  }, []);
  return status;
}

// ═════════════════════════════════════════════════════════════════════
// Helpers de domain
// ═════════════════════════════════════════════════════════════════════

export function getSharedTournamentIds(junior: Junior, manuel: Junior | null): string[] {
  if (!manuel) return [];
  const manuelTids = new Set(manuel.tournamentIds);
  return junior.tournamentIds.filter((tid) => manuelTids.has(tid));
}

/** Devolve tids onde junior e Manuel jogaram no MESMO FLIGHT (mesmo escalão).
 *  Confronto real — distinto de getSharedTournamentIds que pode incluir
 *  cross-flight (Boys 11 vs Boys 12 no mesmo Venice Open). */
export function getSharedFlightTids(junior: Junior, manuel: Junior | null, tournamentById: Map<string, Tournament>): string[] {
  if (!manuel) return [];
  const manuelTids = new Set(manuel.tournamentIds);
  const out: string[] = [];
  for (const tid of junior.tournamentIds) {
    if (!manuelTids.has(tid)) continue;
    const t = tournamentById.get(tid);
    if (!t) continue;
    // Procurar flight onde AMBOS estão presentes
    const ok = t.flights.some((f) =>
      f.results.some((r) => r.juniorId === junior.id) &&
      f.results.some((r) => r.juniorId === manuel.id)
    );
    if (ok) out.push(tid);
  }
  return out;
}

/** True se junior teve pelo menos 1 confronto real (mesmo flight) com Manuel. */
export function hasRealConfrontWithManuel(junior: Junior, manuel: Junior | null, tournamentById: Map<string, Tournament>): boolean {
  return getSharedFlightTids(junior, manuel, tournamentById).length > 0;
}

export function getResultInTournament(junior: Junior, tournament: Tournament): { flight: Flight; result: Result } | null {
  for (const f of tournament.flights) {
    const r = f.results.find((x) => x.juniorId === junior.id);
    if (r) return { flight: f, result: r };
  }
  return null;
}

export function countWins(junior: Junior, tournamentById: Map<string, Tournament>): number {
  let wins = 0;
  for (const tid of junior.tournamentIds) {
    const t = tournamentById.get(tid);
    if (!t) continue;
    for (const f of t.flights) {
      const r = f.results.find((x) => x.juniorId === junior.id);
      if (r?.pos === 1) wins++;
    }
  }
  return wins;
}

export function countTop3(junior: Junior, tournamentById: Map<string, Tournament>): number {
  let n = 0;
  for (const tid of junior.tournamentIds) {
    const t = tournamentById.get(tid);
    if (!t) continue;
    for (const f of t.flights) {
      const r = f.results.find((x) => x.juniorId === junior.id);
      if (typeof r?.pos === "number" && r.pos <= 3) n++;
    }
  }
  return n;
}

export type TierKey = "elite" | "strong" | "solid" | "developing" | "beginner";

const TIER_LABELS: Record<TierKey, string> = {
  elite: "Elite",
  strong: "Forte Competidor",
  solid: "Sólido",
  developing: "Em Desenvolvimento",
  beginner: "Iniciante",
};

// ⚠ REGRA: var(--color-good-dark) e var(--bg-success-subtle) são RESERVADOS
//   ao Manuel (badge "Tu", "REF", "Cruzou com Manuel", bg da row vs Manuel).
//   Para tier badges de outros juniors usar paleta diferenciada.
const TIER_COLORS: Record<TierKey, { bg: string; fg: string }> = {
  elite:      { bg: "var(--bg-warn-subtle, #fffbeb)", fg: "var(--color-warn-dark, #92400e)" },
  strong:     { bg: "var(--medal-bronze-bg)",         fg: "var(--medal-bronze-fg)" },
  solid:      { bg: "var(--bg-info-subtle, #eff6ff)", fg: "var(--color-info-dark, #1e3a8a)" },
  developing: { bg: "var(--bg-muted)",                fg: "var(--text-2)" },
  beginner:   { bg: "var(--bg)",                      fg: "var(--text-3)" },
};

export function computeTier(j: Junior, tournamentById: Map<string, Tournament>): TierKey | null {
  const total = j.tournamentIds.length;
  if (total === 0) return null;
  let wins = 0, top3 = 0, top10 = 0, posCount = 0, posSum = 0;
  for (const tid of j.tournamentIds) {
    const t = tournamentById.get(tid);
    if (!t) continue;
    for (const f of t.flights) {
      const r = f.results.find((x) => x.juniorId === j.id);
      if (!r) continue;
      if (typeof r.pos === "number") {
        posSum += r.pos; posCount++;
        if (r.pos === 1) wins++;
        if (r.pos <= 3) top3++;
        if (r.pos <= 10) top10++;
      }
    }
  }
  if (posCount < 2) return null;
  const winRate = wins / posCount;
  const top3Rate = top3 / posCount;
  const top10Rate = top10 / posCount;
  const avgPos = posSum / posCount;

  if (wins >= 5 && winRate >= 0.3) return "elite";
  if (wins >= 3 || (top3 >= 5 && top3Rate >= 0.4) || (wins >= 2 && avgPos <= 5)) return "strong";
  if (wins >= 1 || top3 >= 3 || (top10Rate >= 0.5 && posCount >= 4)) return "solid";
  if (top3 >= 1 || top10 >= 2) return "developing";
  return "beginner";
}

export function getTierLabel(tier: TierKey): string {
  return TIER_LABELS[tier];
}

export function getTierColors(tier: TierKey): { bg: string; fg: string } {
  return TIER_COLORS[tier];
}

/** Estatísticas agregadas das rondas de um junior. Útil para KPI cards.
 *  - mean, sd: média e desvio padrão dos `gross` por ronda.
 *  - bestToPar / worstToPar: melhor e pior diferencial ±par por ronda.
 *  - subParPct: percentagem de rondas com gross < par (apenas rondas com par conhecido).
 *  - total: nº de rondas usadas no cálculo (com gross numérico).
 */
export interface RoundStats {
  total: number;
  mean: number | null;
  sd: number | null;
  bestToPar: { value: number; tournamentId: string; round: number } | null;
  worstToPar: { value: number; tournamentId: string; round: number } | null;
  subParPct: number | null;
}

export function computeRoundStats(junior: Junior, tournamentById: Map<string, Tournament>, filterTids?: Set<string> | null): RoundStats {
  const grosses: number[] = [];
  const toPars: Array<{ value: number; tournamentId: string; round: number }> = [];
  let subParCount = 0;
  let withParCount = 0;
  for (const tid of junior.tournamentIds) {
    if (filterTids && !filterTids.has(tid)) continue;
    const t = tournamentById.get(tid);
    if (!t) continue;
    for (const f of t.flights) {
      const r = f.results.find((x) => x.juniorId === junior.id);
      if (!r?.rounds) continue;
      // ⚠ Filtra 9H — comparar +3 num 9H (par 36) com +0 num 18H (par 72) é
      // enganador. Para "Melhor ±par" agregado da carreira só consideramos
      // rondas 18H. Se quisermos um KPI separado para 9H, criar à parte.
      const parArr = f.par || [];
      const par18 = parArr.length === 18 && parArr.filter((p) => p > 0).length === 18;
      if (!par18) continue;
      const parTotal = parArr.reduce((a, b) => a + (b || 0), 0);
      if (parTotal < 60) continue; // sanity — par 18H deve ser ≥ 60
      for (const rd of r.rounds) {
        if (typeof rd.gross !== "number") continue;
        // Sanity: gross de 18H deve ser ≥ 50 (alguém com nível profissional)
        // ou ≤ 200. Valores fora disto são bugs de scrape.
        if (rd.gross < 50 || rd.gross > 200) continue;
        grosses.push(rd.gross);
        withParCount++;
        const diff = rd.gross - parTotal;
        toPars.push({ value: diff, tournamentId: tid, round: rd.round });
        if (diff < 0) subParCount++;
      }
    }
  }
  if (grosses.length === 0) {
    return { total: 0, mean: null, sd: null, bestToPar: null, worstToPar: null, subParPct: null };
  }
  const mean = grosses.reduce((a, b) => a + b, 0) / grosses.length;
  const variance = grosses.reduce((a, b) => a + (b - mean) ** 2, 0) / grosses.length;
  const sd = Math.sqrt(variance);
  // Melhor = menor diff (pode ser negativo); pior = maior diff
  let best: typeof toPars[0] | null = null;
  let worst: typeof toPars[0] | null = null;
  for (const tp of toPars) {
    if (!best || tp.value < best.value) best = tp;
    if (!worst || tp.value > worst.value) worst = tp;
  }
  return {
    total: grosses.length,
    mean: Math.round(mean * 10) / 10,
    sd: Math.round(sd * 10) / 10,
    bestToPar: best,
    worstToPar: worst,
    subParPct: withParCount > 0 ? Math.round((subParCount / withParCount) * 100) : null,
  };
}

export function bestRoundGross(junior: Junior, tournamentById: Map<string, Tournament>): { gross: number; tournamentId: string; round: number } | null {
  let best: { gross: number; tournamentId: string; round: number } | null = null;
  for (const tid of junior.tournamentIds) {
    const t = tournamentById.get(tid);
    if (!t) continue;
    for (const f of t.flights) {
      const r = f.results.find((x) => x.juniorId === junior.id);
      if (!r?.rounds) continue;
      for (const rd of r.rounds) {
        if (typeof rd.gross !== "number") continue;
        if (!best || rd.gross < best.gross) best = { gross: rd.gross, tournamentId: tid, round: rd.round };
      }
    }
  }
  return best;
}

export { normName };
