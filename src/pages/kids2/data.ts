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

// ═════════════════════════════════════════════════════════════════════
// Types canónicos (espelham scripts/aggregator/types.js)
// ═════════════════════════════════════════════════════════════════════

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
}

// ═════════════════════════════════════════════════════════════════════
// Loader
// ═════════════════════════════════════════════════════════════════════

const MANUEL_USKIDS_ID = "630106";

function normName(s: string): string {
  return (s || "").trim().toLowerCase()
    .replace(/[-'’.·\/]+/g, " ")
    .replace(/\s+/g, " ")
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}

async function loadCanonical(): Promise<CanonicalData> {
  const [juniorsResp, tournamentsResp, catalogResp] = await Promise.all([
    cachedFetchJson("/data/juniors.json"),
    cachedFetchJson("/data/juniors-tournaments.json"),
    cachedFetchJson("/data/tournament-catalog.json"),
  ]);

  const juniors: Junior[] = (juniorsResp as any)?.juniors || [];
  const series: TournamentSeries[] = (catalogResp as any)?.series || [];

  // Tournaments podem vir num ficheiro único OU em shards (manifest sharded:true)
  let tournaments: Tournament[] = [];
  const tResp = tournamentsResp as any;
  if (tResp?.sharded && Array.isArray(tResp.shards)) {
    const shardResponses = await Promise.all(
      tResp.shards.map((fn: string) => cachedFetchJson(`/data/${fn}`)),
    );
    for (const sr of shardResponses) {
      const arr = (sr as any)?.tournaments;
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

const TIER_COLORS: Record<TierKey, { bg: string; fg: string }> = {
  elite:      { bg: "var(--bg-warn-subtle, #fffbeb)", fg: "var(--color-warn-dark, #92400e)" },
  strong:     { bg: "var(--bg-success-subtle, #ecfdf5)", fg: "var(--color-good-dark)" },
  solid:      { bg: "var(--bg-info-subtle, #eff6ff)", fg: "var(--color-info-dark, #1e3a8a)" },
  developing: { bg: "var(--bg-muted)", fg: "var(--text-2)" },
  beginner:   { bg: "var(--bg)", fg: "var(--text-3)" },
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
