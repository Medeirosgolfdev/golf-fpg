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
import { getTournWeight } from "./tournWeight";

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
  strong: "Forte",
  solid: "Sólido",
  developing: "Em Dev.",
  beginner: "Iniciante",
};

// ⚠ REGRA: var(--color-good-dark) e var(--bg-success-subtle) são RESERVADOS
//   ao Manuel (badge "Tu", "REF", "Cruzou com Manuel", bg da row vs Manuel).
//   Para tier badges de outros juniors usar paleta diferenciada.
const TIER_COLORS: Record<TierKey, { bg: string; fg: string }> = {
  elite:      { bg: "var(--bg-warn-subtle, var(--bg-warn))", fg: "var(--color-warn-dark, var(--color-warn-dark))" },
  strong:     { bg: "var(--medal-bronze-bg)",         fg: "var(--medal-bronze-fg)" },
  solid:      { bg: "var(--bg-info-subtle, #eff6ff)", fg: "var(--color-info-dark, #1e3a8a)" },
  developing: { bg: "var(--bg-muted)",                fg: "var(--text-2)" },
  beginner:   { bg: "var(--bg)",                      fg: "var(--text-3)" },
};

/**
 * Multiplicador por distância do campo (metros totais 18 buracos).
 * Calibrado pela distribuição real de Boys 12 USKids (moda ≈ 5.000m).
 * Aplica-se a todos os escalões — o torneio já escolhe o tee adequado;
 * distâncias mais longas indicam maior exigência física e técnica.
 *
 * Degraus propositadamente crescentes: a partir de 5.000m cada bracket
 * pesa mais porque a diferença entre 5.400m e 5.300m é mais significativa
 * do que entre 4.600m e 4.500m.
 *
 * Distribuição real (6.407 entradas 18H, 3.500–7.000m):
 *   <4.400m  16%  | 4.400–4.600m  12%  | 4.600–4.800m   4%
 *   4.800–5.000m 20% (mediana ~4.981m) | 5.000–5.100m   8%
 *   5.100–5.200m  6% | 5.200–5.300m   2% | 5.300–5.400m   2%
 *   5.400–5.500m  9% | +5.500m       21% (grandes eventos internacionais)
 */
function distMult(meters: number): number {
  if (meters < 4400) return 1.00;
  if (meters < 4600) return 1.00;
  if (meters < 4800) return 1.03;
  if (meters < 5000) return 1.07;
  if (meters < 5100) return 1.13;
  if (meters < 5200) return 1.20;
  if (meters < 5300) return 1.28;
  if (meters < 5400) return 1.37;
  if (meters < 5500) return 1.47;
  return 1.60;
}

/**
 * Pontuação por posição (0.4–10).
 * Pódio claramente destacado; top-10 conta; fora de top-20 é mínimo.
 */
function positionScore(pos: number): number {
  if (pos === 1) return 10;
  if (pos === 2) return 8;
  if (pos === 3) return 6;
  if (pos === 4) return 5;
  if (pos === 5) return 4;
  if (pos <= 10) return 2.5;
  if (pos <= 20) return 1.2;
  return 0.4;
}

/**
 * Decaimento temporal por anos passados.
 * Índice = yearsAgo (0 = ano corrente). Valores a partir do índice 4 usam o último.
 *   2026: ×1.00 | 2025: ×0.70 | 2024: ×0.40 | 2023: ×0.25 | 2022+: ×0.15
 */
const RECENCY_TABLE = [1.00, 0.70, 0.40, 0.25, 0.15];
const CURRENT_YEAR = new Date().getFullYear();

/**
 * Score de carreira: soma dos TOP-5 resultados ponderados por:
 *   - estrelas do torneio com fieldSize DO FLIGHT DO JOGADOR (não soma de escalões)
 *   - multiplicador de tamanho do flight (0.35–1.6)
 *   - posição (positionScore)
 *   - bónus sub-par: toPar=-1→×1.1, -3→×1.3, -5+→×1.5
 *   - decaimento temporal: RECENCY_DECAY^yearsAgo (resultados mais recentes valem mais)
 *
 * O fieldSize por flight evita que local tours com muitos escalões
 * pareçam artificialmente mais prestidiosos do que realmente são.
 *
 * Ancoragem orientativa (fieldSize = flight específico do jogador):
 *   Vitória WC    (★★★★★, 4r, fs~80) → 5×1.6×10 = 80 × recency
 *   Vitória EC    (★★★★★, 4r, fs~60) → 5×1.6×10 = 80 × recency
 *   Vitória Venice(★★★★,  4r, fs~35) → 4×1.3×10 = 52 × recency
 *   Vitória local (★★,    1r, fs~20) → 2×1.0×10 = 20 × recency
 *   Vitória local (★1,    1r, fs~7)  → 1×0.35×10 = 3.5 × recency
 */
export function computeCareerScore(j: Junior, tournamentById: Map<string, Tournament>): number | null {
  if (j.tournamentIds.length === 0) return null;
  const pointValues: number[] = [];
  let posCount = 0;
  for (const tid of j.tournamentIds) {
    const t = tournamentById.get(tid);
    if (!t) continue;
    // Ano do torneio para decaimento temporal
    const dateStr = t.date || (t as any).startDate || (t as any).endDate || "";
    const tYear = dateStr ? parseInt(dateStr.slice(0, 4), 10) : CURRENT_YEAR;
    const yearsAgo = isNaN(tYear) ? 0 : Math.max(0, CURRENT_YEAR - tYear);
    const recency = RECENCY_TABLE[Math.min(yearsAgo, RECENCY_TABLE.length - 1)];

    for (const f of t.flights) {
      const r = f.results.find((x) => x.juniorId === j.id);
      if (!r || typeof r.pos !== "number") continue;
      posCount++;
      // Field size do FLIGHT ESPECÍFICO (não soma de escalões).
      // Sem fieldSize explícito usa 0 → fMult 0.50 (campo desconhecido).
      // Não usar f.results.length como proxy: pode ter 1-2 resultados apenas
      // por scraping parcial, não porque o campo era minúsculo.
      const flightFs = typeof f.fieldSize === "number" && f.fieldSize > 0 ? f.fieldSize : 0;
      // Estrelas baseadas no flight específico (usa results.length como proxy para fórmula)
      const { stars } = getTournWeight(t, flightFs || f.results.length);
      // Multiplicador de campo — 11 escalões calibrados para a distribuição real de flights
      const fMult =
        flightFs <= 0  ? 0.50 :
        flightFs <= 6  ? 0.25 :
        flightFs <= 11 ? 0.45 :
        flightFs <= 15 ? 0.60 :
        flightFs <= 21 ? 0.75 :
        flightFs <= 27 ? 0.90 :
        flightFs <= 35 ? 1.05 :
        flightFs <= 45 ? 1.20 :
        flightFs <= 60 ? 1.35 :
        flightFs <= 80 ? 1.50 :
                         1.60;
      // Distância do campo → bónus de dificuldade
      // yards[] por buraco (convertido para metros); só buracos com par>0 (filtra 9H parciais).
      const yardsArr = f.yards || [];
      const parArr = f.par || [];
      let totalMeters = 0;
      if (yardsArr.length > 0) {
        const playedYards = yardsArr.reduce((sum, y, i) => sum + ((parArr[i] ?? 0) > 0 ? y : 0), 0);
        totalMeters = Math.round(playedYards * 0.9144);
      }
      const dMult = totalMeters > 0 ? distMult(totalMeters) : 1.0;

      // Sem pontos para as 3 últimas posições em campos com ≥6 participantes.
      // Ficar 6.º/7.º/8.º num campo de 8 não merece pontuação.
      if (flightFs >= 6 && r.pos > flightFs - 3) continue;

      let pts = stars * fMult * positionScore(r.pos) * recency * dMult;
      // Bónus sub-par: jogar abaixo do par é excecional em juniores.
      if (typeof r.toPar === "number" && r.toPar < 0) {
        pts *= Math.min(1.0 + (-r.toPar) * 0.1, 1.5);
      }
      pointValues.push(pts);
    }
  }
  if (posCount < 1) return null;
  pointValues.sort((a, b) => b - a);
  return pointValues.slice(0, 5).reduce((s, v) => s + v, 0);
}

/** Infere o ano de nascimento do junior (dob > dobRange > ageMin do flight > label do flight). */
function inferBirthYear(j: Junior, tournamentById: Map<string, Tournament>): number | null {
  if (j.dob) {
    // Formato ISO "2013-05-..." — os 4 primeiros chars são o ano
    const y = parseInt(j.dob.slice(0, 4), 10);
    if (!isNaN(y) && y > 2000 && y < 2030) return y;
    // Formato humano "Mai 2013", "May 2013", "29/04/2014", etc. — procurar 4 dígitos
    const m = j.dob.match(/\b(20\d{2})\b/);
    if (m) {
      const yr = parseInt(m[1], 10);
      if (yr > 2000 && yr < 2030) return yr;
    }
  }
  if (j.dobRange) {
    const lo = parseInt(j.dobRange.lo.slice(0, 4), 10);
    const hi = parseInt(j.dobRange.hi.slice(0, 4), 10);
    if (!isNaN(lo) && !isNaN(hi)) return Math.round((lo + hi) / 2);
  }
  // Inferir de TODOS os flights onde o jogador tem resultado — usar a moda.
  // Não parar no primeiro: um único torneio com ageMin errado estragaria tudo.
  const byYearCount = new Map<number, number>();
  for (const tid of j.tournamentIds) {
    const t = tournamentById.get(tid);
    if (!t) continue;
    const dateStr = t.date || t.startDate || t.endDate;
    const tYear = dateStr ? parseInt(dateStr.slice(0, 4), 10) : null;
    if (!tYear || isNaN(tYear)) continue;
    for (const f of t.flights) {
      if (!f.results.find((r) => r.juniorId === j.id)) continue;
      let age: number | null = null;
      if (typeof f.ageMin === "number" && f.ageMin > 0) age = f.ageMin;
      else {
        const m = (f.label || "").match(/\b(\d{1,2})\b/);
        if (m) {
          const a = parseInt(m[1], 10);
          if (a >= 7 && a <= 18) age = a;
        }
      }
      if (age !== null) {
        const by = tYear - age;
        byYearCount.set(by, (byYearCount.get(by) ?? 0) + 1);
      }
    }
  }
  if (byYearCount.size === 0) return null;
  // Devolver o ano de nascimento mais votado pelos torneios
  let best = -1, bestCount = 0;
  for (const [yr, cnt] of byYearCount) {
    if (cnt > bestCount) { bestCount = cnt; best = yr; }
  }
  return best > 0 ? best : null;
}

/** Entrada de ranking: percentil dentro da coorte de mesmo ano de nascimento E sexo. */
export interface RankingEntry {
  /** Percentil 0–100 (100 = melhor da coorte). */
  percentile: number;
  /** Tier derivado do percentil. */
  tier: TierKey;
  /** Career score bruto (debug/tooltip). */
  score: number;
  /** Ano de nascimento inferido. */
  birthYear: number;
  /** Sexo da coorte ("M" | "F" | "unknown"). */
  sex: string;
  /** Posição dentro da coorte (1 = melhor). */
  rank: number;
  /** Número de juniors com score válido na mesma coorte. */
  cohortSize: number;
}

/**
 * Ranking percentil por coorte de (ano de nascimento, sexo).
 *
 * Rapazes e raparigas têm rankings separados. Agrupa todos os juniors com
 * ≥ 2 posições e ano inferível, ordena por careerScore e atribui percentil.
 *   top 10% → Elite
 *   top 30% → Forte
 *   top 55% → Sólido
 *   top 80% → Em Dev.
 *   resto   → Iniciante
 *
 * O campo `sex` nos juniors pode estar ausente; esses ficam na coorte "unknown".
 * Deve ser memoizado pelo caller — é O(n) sobre todos os juniors.
 */
export function computeRanking(
  juniors: Junior[],
  tournamentById: Map<string, Tournament>,
): Map<string, RankingEntry> {
  // Mapa de id → sexo (para enriquecer a RankingEntry)
  const sexById = new Map<string, string>();
  for (const j of juniors) sexById.set(j.id, j.sex || "unknown");

  // 1. Score de cada junior com ≥ 2 posições e ano de nascimento inferível
  // "unknown" → tratado como "M" (quase todos os jogadores USKids sem campo sex são rapazes)
  const scored: Array<{ id: string; score: number; birthYear: number; sex: string }> = [];
  for (const j of juniors) {
    const score = computeCareerScore(j, tournamentById);
    if (score === null) continue;
    const birthYear = inferBirthYear(j, tournamentById);
    if (birthYear === null) continue;
    const effectiveSex = j.sex === "F" ? "F" : "M";
    scored.push({ id: j.id, score, birthYear, sex: effectiveSex });
  }

  // 2. Agrupar por (ano, sexo) — rapazes e raparigas em rankings separados
  const byCohort = new Map<string, Array<{ id: string; score: number; sex: string }>>();
  for (const s of scored) {
    const key = `${s.birthYear}_${s.sex}`;
    let arr = byCohort.get(key);
    if (!arr) { arr = []; byCohort.set(key, arr); }
    arr.push({ id: s.id, score: s.score, sex: s.sex });
  }

  // 3. Para cada coorte, ordenar (desc) e calcular percentil
  const result = new Map<string, RankingEntry>();
  for (const [cohortKey, cohort] of byCohort) {
    const birthYear = parseInt(cohortKey.split("_")[0], 10);
    const sex = cohortKey.split("_").slice(1).join("_");
    cohort.sort((a, b) => b.score - a.score);
    const n = cohort.length;
    for (let i = 0; i < n; i++) {
      const { id, score } = cohort[i];
      const rank = i + 1;
      // percentil 100 = melhor; n=1 → único na coorte → 100
      const percentile = n === 1 ? 100 : Math.round(((n - rank) / (n - 1)) * 100);
      let tier: TierKey;
      if (percentile >= 90) tier = "elite";
      else if (percentile >= 70) tier = "strong";
      else if (percentile >= 45) tier = "solid";
      else if (percentile >= 20) tier = "developing";
      else tier = "beginner";
      result.set(id, { percentile, tier, score, birthYear, sex, rank, cohortSize: n });
    }
  }
  return result;
}

/**
 * Tier de um junior.
 *
 * Com `ranking` (de `computeRanking`): tier percentil relativo à coorte de mesmo
 * ano de nascimento — "Elite" = top 5% mundial naquele ano.
 *
 * Sem `ranking` (ou se o ano não for inferível): limiares absolutos de careerScore.
 */
export function computeTier(
  j: Junior,
  tournamentById: Map<string, Tournament>,
  ranking?: Map<string, RankingEntry>,
): TierKey | null {
  if (ranking) {
    const entry = ranking.get(j.id);
    if (entry) return entry.tier;
    // Sem entrada (ano não inferível) → fallback a limiares absolutos
  }
  const score = computeCareerScore(j, tournamentById);
  if (score === null) return null;
  if (score >= 50) return "elite";
  if (score >= 20) return "strong";
  if (score >= 10) return "solid";
  if (score >= 2)  return "developing";
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
