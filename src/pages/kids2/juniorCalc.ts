/**
 * kids2/juniorCalc.ts
 *
 * Tipos canónicos e contas dos juniores (nível/tier, vitórias, confrontos com o
 * Manuel, peso dos torneios) SEM imports — para o site E os scripts Node usarem
 * o MESMO código (o agregador escreve o juniors-scout.json com isto; o Node ≥ 22
 * corre TypeScript directamente, como o whsCalc.ts). Separado do data.ts a
 * 20/10/2026. Só sintaxe que o Node sabe apagar: tipos e interfaces, nada de
 * enum/namespace, e NENHUM import (o data.ts e o tournWeight.ts re-exportam daqui).
 */


// ═════════════════════════════════════════════════════════════════════
// Types canónicos (espelham scripts/aggregator/types.js)
// ═════════════════════════════════════════════════════════════════════

export interface RfegOficial {
  lic?: string;
  hcp?: number;
  /** Data da última actualização do hándicap na RFEG. */
  hcpData?: string | null;
  hcpClube?: string;
  hcpVia?: "licenca" | "sufixo";
}

export interface HcpPoint {
  date: string;          // "YYYY-MM-DD"
  hcpExact: number;
  source: string;        // "fpg" | "ffg" | "fcg" | ...
  tcode?: string;        // identificador do torneio na fonte
  ccode?: string;
  label?: string;        // nome do torneio (para tooltip)
  fonte?: string;        // nome curto da lista na pill (entry-list; ex. «intelligentgolf»)
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
  /** Hándicap oficial actual e ranking juvenil da RFEG (agregador, util/rfeg-oficial.js). */
  rfegOficial?: RfegOficial;
  _match: {
    confidence: "strong" | "probable" | "manual";
    evidence: string[];
    mergedFromSources: string[];
  };
}

interface JuniorSources {
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
    hcpDate?: string;
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
  hcpJogo?: number;      // handicap de jogo do dia (Gross − Net; circuitos dos condados ingleses)
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


// ═════════════════════════════════════════════════════════════════════
// Peso de prestígio dos torneios (era kids2/tournWeight.ts)
// ═════════════════════════════════════════════════════════════════════

/**
 * kids2/tournWeight.ts
 *
 * Peso de prestígio de torneio (★ a ★★★★★½) calculado a partir dos canónicos.
 *
 * Fórmula (com nationsCount):  0.35 · roundsNorm + 0.25 · fieldNorm + 0.40 · nationsNorm
 * Fórmula (sem nationsCount):  0.60 · roundsNorm + 0.40 · fieldNorm
 *
 * roundsNorm é NÃO-LINEAR: 1r→0.20, 2r→0.50, 3r→0.85, 4r→1.00
 * (torneios de 3 e 4 rondas são claramente superiores a 1-2 rondas)
 *
 * Referência com fieldSize do flight específico do jogador:
 *   WC  Boys 11 (4r, ~150, 30+ nações) → ★★★★★½ (5.5)  score≈0.825
 *   EC  Boys 11 (4r, ~60,  15  nações) → ★★★★★  (5.0)  score≈0.645
 *   WJGC       (4r, ~40,  20  nações) → ★★★★★  (5.0)  score≈0.647
 *   Venice     (4r, ~40,  10  nações) → ★★★★½  (4.5)  score≈0.597
 *   Marco Simone(1r,~15,   5  nações) → ★½      (1.5)  score≈0.127
 *   Local tour  (1r, ~20,  0  nações) → ★½      (1.5)  score≈0.147
 *
 * PRESTIGE OVERRIDES: alguns torneios recebem uma estrela mínima garantida
 * baseada na reputação do evento (independentemente de rounds/field/nations).
 *   doral → mínimo 4.5★  (First Tee Miami Junior Classic — evento PGA Tour)
 *
 * IMPORTANTE: para um jogador, passar sempre o fieldSize
 * do flight específico do jogador (não a soma de todos os escalões do torneio).
 * A soma inflaciona artificialmente local tours com muitos escalões.
 */


// Normalizadores
const MAX_FIELD = 300;
const MAX_NATIONS = 30;   // WC tem 30+ nações; WJGC ~20; EC ~15

// Pesos (com nações)
// Rounds + field determinam qualidade real da competição.
// Nations indica notoriedade/visibilidade do evento, não qualidade dos jogadores.
const W_R = 0.50;
const W_F = 0.35;
const W_N = 0.15;

// Pesos (sem nações)
const W_R2 = 0.60;
const W_F2 = 0.40;

/** Mapeamento não-linear de rondas: valoriza muito mais 3-4 rondas vs 1-2. */
function roundsNorm(r: number): number {
  if (r <= 1) return 0.20;
  if (r === 2) return 0.50;
  if (r === 3) return 0.85;
  return 1.00; // 4+
}

/**
 * Prestige mínimo garantido por sourceId do torneio.
 * A estrela calculada pela fórmula fica sempre >= este valor.
 */
const SOURCE_MIN_PRESTIGE: Record<string, number> = {
  // First Tee Miami Junior Classic — evento PGA Tour, maior torneio júnior dos EUA
  doral: 4.5,
};

export interface TournWeight {
  /** Score 0–1+ (componente contínua antes do mapeamento para estrelas). */
  score: number;
  /** Nº de estrelas em incrementos de 0.5 (1.0–5.5). */
  stars: number;
  /** Componentes individuais para debug/tooltip. */
  parts: { rounds: number; field: number; nations: number | null };
}

/**
 * @param t - torneio
 * @param fieldSizeOverride - fieldSize do flight ESPECÍFICO do jogador.
 *   Passar sempre para um jogador, para evitar inflação por soma de escalões.
 *   Se null/undefined, usa a soma de todos os flights (comportamento legado — display).
 */
export function getTournWeight(t: Tournament, fieldSizeOverride?: number | null): TournWeight {
  // 1) Rondas — prefere campo explícito, senão infere do 1º resultado com rounds[]
  let rounds = typeof t.rounds === "number" ? t.rounds : null;
  if (rounds == null) {
    for (const f of t.flights || []) {
      const r = f.results?.[0];
      if (r?.rounds?.length) { rounds = r.rounds.length; break; }
    }
  }
  if (rounds == null) rounds = 1;

  // 2) Field size — usa o flight específico quando disponível; fallback: soma de todos
  let totalField = 0;
  let hasFieldData = false;
  if (fieldSizeOverride != null && fieldSizeOverride > 0) {
    totalField = fieldSizeOverride;
    hasFieldData = true;
  } else {
    for (const f of t.flights || []) {
      if (typeof f.fieldSize === "number" && f.fieldSize > 0) {
        totalField += f.fieldSize;
        hasFieldData = true;
      }
    }
  }
  if (!hasFieldData) {
    for (const f of t.flights || []) totalField += (f.results || []).length;
  }

  // 3) Nationalities — só disponível se aggregator pré-calculou
  const nationsCount = typeof (t.extra as any)?.nationsCount === "number"
    ? (t.extra as any).nationsCount as number
    : null;

  const rNorm = Math.min(roundsNorm(rounds), 1.0);
  const fNorm = Math.min(totalField / MAX_FIELD, 1.0);
  const nNorm = nationsCount != null ? Math.min(nationsCount / MAX_NATIONS, 1.0) : null;

  let score: number;
  if (nNorm != null) {
    score = W_R * rNorm + W_F * fNorm + W_N * nNorm;
  } else {
    score = W_R2 * rNorm + W_F2 * fNorm;
  }

  // Meias-estrelas: 10 níveis (1.0 a 5.5 em incrementos de 0.5)
  let stars: number;
  if      (score >= 0.70) stars = 5.5;
  else if (score >= 0.56) stars = 5.0;
  else if (score >= 0.48) stars = 4.5;
  else if (score >= 0.38) stars = 4.0;
  else if (score >= 0.30) stars = 3.5;
  else if (score >= 0.24) stars = 3.0;
  else if (score >= 0.18) stars = 2.5;
  else if (score >= 0.14) stars = 2.0;
  else if (score >= 0.10) stars = 1.5;
  else                    stars = 1.0;

  // Prestige override: alguns torneios têm estrela mínima garantida
  const minPrestige = SOURCE_MIN_PRESTIGE[t.sourceId] ?? 0;
  if (minPrestige > stars) stars = minPrestige;

  return {
    score,
    stars,
    parts: { rounds: rNorm, field: fNorm, nations: nNorm },
  };
}

/**
 * Formata estrelas para display.
 * Exemplos: 5.5→"★★★★★½", 4.5→"★★★★½☆", 3→"★★★☆☆"
 * O display usa sempre 5 "posições" + ½ extra quando > 5.
 */
export function formatStars(stars: number): string {
  const capped = Math.min(stars, 5.5);
  const full = Math.floor(capped);
  const half = (capped - full) >= 0.5;
  const empty = Math.max(0, 5 - full - (half ? 1 : 0));
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(empty);
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

/** `desde` (AAAA-MM-DD): só os torneios a partir dessa data (o «último ano» do Scout). */
export function countWins(junior: Junior, tournamentById: Map<string, Tournament>, desde?: string): number {
  let wins = 0;
  for (const tid of junior.tournamentIds) {
    const t = tournamentById.get(tid);
    if (!t || (desde && (t.date || t.startDate || "") < desde)) continue;
    for (const f of t.flights) {
      const r = f.results.find((x) => x.juniorId === junior.id);
      if (r?.pos === 1) wins++;
    }
  }
  return wins;
}

export function countTop3(junior: Junior, tournamentById: Map<string, Tournament>, desde?: string): number {
  let n = 0;
  for (const tid of junior.tournamentIds) {
    const t = tournamentById.get(tid);
    if (!t || (desde && (t.date || t.startDate || "") < desde)) continue;
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
  elite:      { bg: "var(--bg-warn-subtle)", fg: "var(--color-warn-dark)" },
  strong:     { bg: "var(--medal-bronze-bg)",         fg: "var(--medal-bronze-fg)" },
  solid:      { bg: "var(--bg-info-subtle)", fg: "var(--color-info-dark)" },
  developing: { bg: "var(--bg-muted)",                fg: "var(--text-2)" },
  beginner:   { bg: "var(--bg)",                      fg: "var(--text-3)" },
};

/** Infere o ano de nascimento do junior (dob > dobRange > ageMin do flight > label do flight). */
export function inferBirthYear(j: Junior, tournamentById: Map<string, Tournament>): number | null {
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
  /** Ano de nascimento inferido. */
  birthYear: number;
  /** Sexo da coorte ("M" | "F"). */
  sex: string;
  /** Posição dentro da coorte (1 = melhor). */
  rank: number;
  /** Número de juniors com nível na mesma coorte. */
  cohortSize: number;
  /** Nível em pancadas (nivelPancadas.ts): acima do par numa volta média do escalão. */
  nivel?: number;
  /** Peso das voltas do último ano (voltas-equivalentes; as recentes pesam mais). */
  peso?: number;
}

/** Nível e peso de um jogador (o que o nivelPancadas.ts calcula). */
export interface NivelDoJogador { nivel: number; peso: number; voltas: number }

/** Mínimo de voltas no último ano para entrar no ranking da geração. */
export const MIN_VOLTAS_RANKING = 3;
/** Abaixo deste peso o nível é pouco seguro (erro de ~2 pancadas): mostra-se «poucas voltas». */
export const PESO_POUCAS_VOLTAS = 6;

/** O nível assenta em poucas voltas? */
export function nivelIncerto(e: { peso?: number } | null | undefined): boolean {
  return e?.peso != null && e.peso < PESO_POUCAS_VOLTAS;
}

/** Chave da geração (ano de nascimento + sexo) de um junior; null sem ano. */
export function geracaoDoJunior(j: Junior, tournamentById: Map<string, Tournament>): string | null {
  const by = inferBirthYear(j, tournamentById);
  return by == null ? null : `${by}_${j.sex === "F" ? "F" : "M"}`;
}

/**
 * Ranking percentil por geração (ano de nascimento, sexo), pelo NÍVEL EM PANCADAS
 * (`calcularNiveis`, nivelPancadas.ts — só o último ano; mais baixo = melhor).
 * Rapazes e raparigas em rankings separados; sem sexo conta como rapaz.
 * Só entra quem tem ≥ MIN_VOLTAS_RANKING voltas no último ano.
 *   top 10% → Elite · top 30% → Forte · top 55% → Sólido · top 80% → Em Dev. · resto → Iniciante
 */
export function computeRanking(
  juniors: Junior[],
  tournamentById: Map<string, Tournament>,
  niveis: Map<string, NivelDoJogador>,
): Map<string, RankingEntry> {
  const byCohort = new Map<string, Array<{ id: string; n: NivelDoJogador }>>();
  for (const j of juniors) {
    const n = niveis.get(j.id);
    if (!n || n.voltas < MIN_VOLTAS_RANKING) continue;
    const key = geracaoDoJunior(j, tournamentById);
    if (!key) continue;
    let arr = byCohort.get(key);
    if (!arr) { arr = []; byCohort.set(key, arr); }
    arr.push({ id: j.id, n });
  }
  const result = new Map<string, RankingEntry>();
  for (const [cohortKey, cohort] of byCohort) {
    const [ano, sex] = cohortKey.split("_");
    cohort.sort((a, b) => a.n.nivel - b.n.nivel || b.n.peso - a.n.peso);
    for (let i = 0; i < cohort.length; i++) {
      const { id, n } = cohort[i];
      result.set(id, { ...rankingAt(i + 1, cohort.length, parseInt(ano, 10), sex), nivel: n.nivel, peso: n.peso });
    }
  }
  return result;
}

/** Percentil e tier de quem está na posição `rank` de uma coorte de `n`. */
function rankingAt(rank: number, n: number, birthYear: number, sex: string): RankingEntry {
  // percentil 100 = melhor; n=1 → único na coorte → 100
  const percentile = n === 1 ? 100 : Math.round(((n - rank) / (n - 1)) * 100);
  let tier: TierKey;
  if (percentile >= 90) tier = "elite";
  else if (percentile >= 70) tier = "strong";
  else if (percentile >= 45) tier = "solid";
  else if (percentile >= 20) tier = "developing";
  else tier = "beginner";
  return { percentile, tier, birthYear, sex, rank, cohortSize: n };
}

/** Entrada de ranking compacta, gravada no juniors-scout.json (campo `r`):
 *  [ano de nascimento, sexo, posição na coorte, nível em pancadas, peso das voltas].
 *  Percentil, tier e tamanho da coorte reconstroem-se no `decodeRanking`. */
export type RankingRow = [number, string, number, number?, number?];

export function encodeRankingEntry(e: RankingEntry): RankingRow {
  return e.nivel != null ? [e.birthYear, e.sex, e.rank, e.nivel, e.peso ?? 0] : [e.birthYear, e.sex, e.rank];
}

export function decodeRanking(rows: Iterable<[string, RankingRow]>): Map<string, RankingEntry> {
  const list = [...rows];
  const sizes = new Map<string, number>();
  for (const [, [y, sx]] of list) sizes.set(`${y}_${sx}`, (sizes.get(`${y}_${sx}`) ?? 0) + 1);
  const out = new Map<string, RankingEntry>();
  for (const [id, [y, sx, rank, nivel, peso]] of list) {
    const e = rankingAt(rank, sizes.get(`${y}_${sx}`)!, y, sx);
    out.set(id, nivel != null ? { ...e, nivel, peso } : e);
  }
  return out;
}

/** Tier de um junior = o da geração no ranking pelo nível em pancadas; null sem ranking. */
export function computeTier(j: Junior, ranking?: Map<string, RankingEntry> | null): TierKey | null {
  return ranking?.get(j.id)?.tier ?? null;
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

/**
 * Volta de 18 buracos a sério? As provas USKids de 9H partilham um par[18]
 * completo, por isso um gross de 9 buracos contra o par dos 18 dá um ±par
 * impossível (Ricardo Castro-Ferreira, Fioranello 2022, Boys 7: 52 em 9
 * buracos → «−18»; e o 37 contra par 72 que punha o nível em «elite»).
 * Conta os buracos jogados pelos strokes (o USKids traz sempre 18 posições,
 * com zeros nos não jogados); sem strokes, um ±par abaixo de −8 é de 9H.
 */
function isVolta18(rd: { gross?: number | null; strokes?: number[] }, parTotal: number): boolean {
  if (typeof rd.gross !== "number") return false;
  // `strokes: []` (ou só zeros) = volta só com o total, sem buraco a buraco
  // (Áustria): decide-se pelo ±par, não se deita fora.
  const jogados = Array.isArray(rd.strokes) ? rd.strokes.filter((x) => x > 0).length : 0;
  if (jogados > 0) return jogados >= 15;
  return rd.gross - parTotal >= -8;
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
        if (!isVolta18(rd, parTotal)) continue;
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
