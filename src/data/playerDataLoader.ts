/**
 * playerDataLoader.ts
 *
 * Extrai os dados embebidos no HTML standalone gerado por make-scorecards-ui.js.
 * O HTML contém um bloco <script> com variáveis JS (DATA, HOLES, etc.)
 * geradas via JSON.stringify — podemos extraí-las com regex e fazer JSON.parse.
 */

import { canonicalCourseName, rotateAroeira2HolesIfNeeded, resolveAroeiraIIByPar, resolveSantoDaSerraByPar } from "../utils/courseAliases";
import { stripAccents } from "../utils/normName";
import { numSafe, somaDe } from "../utils/mathUtils";
import { cachedFetchJson, memoAsync } from "./fetchCache";

/* ─── Tipos (espelham a estrutura gerada pelo pipeline Node) ─── */

export interface RoundData {
  scoreId: string;
  date: string;
  dateSort: number;
  holeCount: number;
  tee: string;
  teeKey: string;
  gross: number | null;
  par: number | null;
  stb: number | null;
  sd: number | null;
  hi: number | null;
  meters: number | null;
  hasCard: boolean;
  eventName: string;
  scoreOrigin: string;
  /** Tournament code FPG (do feed WHS). Vazio para rondas não-FPG. */
  tcode?: string;
  /** Club code do organizador do torneio (do scorecard). Crítico para
   *  construir URL Classifications.aspx?ccode=X&tcode=Y — cada torneio
   *  é organizado por um clube diferente, ccode=000 só funciona para FPG. */
  ccode?: string;
  /** Tournament ID interno FPG (do feed WHS). */
  tournamentId?: number | null;
  _isTreino?: boolean;
  _isTeamEvent?: boolean;
  _isExtra?: boolean;
  _group?: string;
  _pill?: string;
  _links?: Record<string, string>;
  _showInTournament?: boolean | null;
}

export interface CourseData {
  course: string;
  count: number;
  lastDateSort: number;
  rounds: RoundData[];
}

export interface HoleScores {
  g: (number | null)[];
  p: (number | null)[];
  si: (number | null)[];
  m?: (number | null)[];
  hc: number;
  /** Só voltas de 9 buracos: a metade do campo — "F" (1–9) ou "B" (10–18).
   *  Posta pelo loader (`nineOf9HoleRound`); ausente = não se sabe. */
  nine?: "F" | "B";
}

interface EclecticHole {
  h: number;
  best: number | null;
  par: number | null;
  from: { scoreId: string; date: string } | null;
}

export interface EclecticEntry {
  teeName: string;
  teeKey: string;
  holeCount: number;
  totalGross: number;
  totalPar: number;
  toPar: number | null;
  holes: EclecticHole[];
  si: (number | null)[];
  wins: Record<string, number>;
  /** Só entradas de 9 buracos com a metade conhecida: "F" (buracos 1–9) ou
   *  "B" (10–18; os `holes[].h` vão de 10 a 18). 10/11/2026. */
  nine?: "F" | "B";
}

/**
 * O eclético certo para comparar com UMA volta: nas de 18 buracos o do tee
 * (ECDET); nas de 9, o da MESMA metade (`HOLES[scoreId].nine`) — nunca o dos 18
 * nem o da outra metade, que comparavam o buraco 10 com o buraco 1. null quando
 * não há (ou quando a metade da volta não se sabe e o tee tem mais de um
 * eclético de 9). 10/11/2026 (I4).
 */
export function eclecticForRound(
  data: Pick<PlayerPageData, "EC" | "ECDET" | "HOLES">,
  courseKey: string,
  round: Pick<RoundData, "scoreId" | "teeKey" | "holeCount">,
): EclecticEntry | null {
  const h = data.HOLES?.[round.scoreId];
  const is9 = (round.holeCount || h?.hc) === 9;
  if (!is9) {
    const det = data.ECDET?.[courseKey]?.[round.teeKey];
    return det && det.holeCount !== 9 ? det : null;
  }
  const nove = (data.EC?.[courseKey] || []).filter((e) => e.teeKey === round.teeKey && e.holeCount === 9);
  if (h?.nine) return nove.find((e) => e.nine === h.nine) ?? null;
  return nove.length === 1 && !nove[0].nine ? nove[0] : null;
}

export interface HoleStatEntry {
  h: number;
  par: number | null;
  si: number | null;
  n: number;
  avg?: number;
  best?: number;
  worst?: number;
  strokesLost?: number;
  dist?: {
    eagle: number;
    birdie: number;
    par: number;
    bogey: number;
    double: number;
    triple: number;
  };
}

export interface HoleStatsData {
  teeName: string;
  teeKey: string;
  holeCount: number;
  nRounds: number;
  holes: HoleStatEntry[];
  totalDist: { eagle: number; birdie: number; par: number; bogey: number; double: number; triple: number; total: number };
  totalPar: number;
  totalStrokesLost: number;
  byParType: Record<string, {
    par: number; holes: HoleStatEntry[]; totalN: number; avg: number | null;
    avgVsPar: number | null; strokesLostPerRound: number; nHoles: number;
    parOrBetterPct: number; doubleOrWorsePct: number;
    dist: { eagle: number; birdie: number; par: number; bogey: number; double: number; triple: number };
  }>;
  f9b9: { f9: { strokesLost: number; par: number; dblPct: number }; b9: { strokesLost: number; par: number; dblPct: number } } | null;
  bestRound: { gross: number; date: string } | null;
  worstRound: { gross: number; date: string } | null;
  avgGross: number | null;
  trend: number | null;
}

export interface CrossPlayerData {
  fed: string;
  name: string;
  sex: string;
  escalao: string;
  birthYear: number | string | null;
  club: string;
  currentHcp: number | null;
  lastSD: number | null;
  avgSD20: number | null;
  avgGross20: number | null;
  numRounds: number;
  numTournaments: number;
  numEDS: number;
  roundsCurrentYear: number;
  roundsLastYear: number;
  rounds2YearsAgo: number;
  rounds3YearsAgo: number;
  firstDate: string | null;
  hcpHistory: { d: number; h: number }[];
  courseTee: Record<string, {
    course: string; tee: string; courseKey: string; teeKey: string;
    best: number | null; avg: number; worst: number | null; count: number;
    rounds: { gross: number; par: number; sd: number | null; hi: number | null; date: string; event: string }[];
  }>;
}

export interface HcpInfo {
  current: number | null;
  lowHcp: number | null;
  softCap: number | null;
  hardCap: number | null;
  scoreAvg: number | null;
  qtyScores: number | null;
  qtyCalc: number | null;
  adjustTotal: number | null;
}

export interface PlayerPageData {
  DATA: CourseData[];
  HOLES: Record<string, HoleScores>;
  EC: Record<string, EclecticEntry[]>;
  ECDET: Record<string, Record<string, EclecticEntry>>;
  HOLE_STATS: Record<string, Record<string, HoleStatsData>>;
  TEE: unknown[];
  CROSS_DATA: Record<string, CrossPlayerData>;
  CURRENT_FED: string;
  HCP_INFO: HcpInfo;
  META: {
    lastUpdate: string;
    lastRoundDate: string;
    generatedDate: string;
    latestHcp: number | null;
    escalao: string;
    club: string;
    /** Total de voltas calculado a partir de DATA — fonte canónica. */
    totalRounds: number;
    /** Voltas neste ano civil, calculado de DATA. */
    roundsCurrentYear: number;
  };
}

/* ─── Extracção de dados do HTML ─── */

function extractVar(scriptText: string, varName: string): string | null {
  // Find the line: var NAME = <JSON>;
  // Use greedy .+ so we match to the LAST semicolon on the line (avoids backtracking issues with large JSON)
  const regex = new RegExp(`var\\s+${varName}\\s*=\\s*(.+);\\s*$`, "m");
  const match = scriptText.match(regex);
  return match ? match[1].trimEnd() : null;
}

function parseVar<T>(scriptText: string, varName: string, fallback: T): T {
  const raw = extractVar(scriptText, varName);
  if (!raw) {
    console.warn(`[playerDataLoader] extractVar returned null for ${varName}`);
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`[playerDataLoader] Failed to parse ${varName} (${raw.length} chars, starts: ${raw.substring(0, 80)}...):`, e);
    return fallback;
  }
}

/* ── In-memory cache (avoids re-fetching on navigation) ── */
const _playerCache = new Map<string, Promise<PlayerPageData>>();

/**
 * Canoniza nomes de campo (ex: "PGA Aroeira No.2 - CNJ FPG" → "PGA Aroeira No.2")
 * e funde entradas que ficam com o mesmo nome canónico após a normalização.
 *
 * O pipeline FPG ocasionalmente atribui sufixos específicos do torneio ao
 * nome do campo. Sem este merge, a sidebar "Por campo" mostraria o mesmo
 * percurso duas vezes (uma com cada nome).
 */
/**
 * Split de buckets de campo cujo nome é ambíguo ou genérico — re-distribui
 * cada ronda para o bucket-destino correcto baseado no par[] da ronda.
 *
 * Casos cobertos:
 *   - "Aroeira II" → "PGA  Aroeira No.1" ou "PGA  Aroeira No.2" (par[] decide)
 *   - "Santo da Serra - {qualquer}" → re-etiquetagem pelo nine real e, em 18H,
 *     colapso de permutações F9/B9 ("Serras-Machico" ≡ "Machico-Serras" →
 *     "Santo da Serra - Machico+Serras")
 *
 * Devolve novo array de CourseData com os buckets reescritos. Não muta input.
 */
function splitAmbiguousAroeiraCourses(
  input: CourseData[],
  holes: Record<string, HoleScores>,
): CourseData[] {
  const out: CourseData[] = [];
  for (const c of input) {
    const canon = canonicalCourseName(c.course) || c.course;
    const isAroeiraII = /^aroeira\s+ii$/i.test(canon);
    const isSantoDaSerra = /santo\s+da\s+serra|sto\.?\s+da\s+serra|s\.\s*da\s+serra/i.test(canon);
    if (!isAroeiraII && !isSantoDaSerra) {
      out.push({ ...c, course: canon });
      continue;
    }
    // Split por par[] de cada ronda
    const byTarget = new Map<string, RoundData[]>();
    for (const r of c.rounds || []) {
      const h = holes[r.scoreId];
      const parsAll = h?.p?.map(v => Number(v)).filter(v => Number.isFinite(v)) as number[] | undefined;
      const pars = parsAll && (parsAll.length === 9 || parsAll.length === 18) ? parsAll : null;
      let target = canon;
      if (isAroeiraII && pars && pars.length === 18) {
        target = resolveAroeiraIIByPar(canon, pars);
      }
      if (isSantoDaSerra) {
        // Sempre resolve, mesmo sem par[] — fallback name-only colapsa
        // permutações F9/B9 em 18H pelo nome.
        target = resolveSantoDaSerraByPar(canon, pars);
      }
      if (!byTarget.has(target)) byTarget.set(target, []);
      byTarget.get(target)!.push(r);
    }
    for (const [target, rounds] of byTarget) {
      const lastDateSort = rounds.reduce((m, r) => Math.max(m, r.dateSort || 0), 0);
      out.push({ course: target, count: rounds.length, lastDateSort, rounds });
    }
  }
  return out;
}

function mergeCanonicalCourses(input: CourseData[]): CourseData[] {
  const byName = new Map<string, CourseData>();
  for (const c of input) {
    const canon = canonicalCourseName(c.course) || c.course;
    const prev = byName.get(canon);
    if (prev) {
      prev.rounds = [...prev.rounds, ...(c.rounds || [])];
      prev.count = prev.rounds.length;
      prev.lastDateSort = Math.max(prev.lastDateSort, c.lastDateSort);
    } else {
      byName.set(canon, { ...c, course: canon });
    }
  }
  // Re-ordenar rondas dentro de cada bucket (mais recentes primeiro)
  const out = [...byName.values()];
  for (const c of out) {
    c.rounds.sort((a, b) => b.dateSort - a.dateSort);
  }
  // Reordenar campos por última ronda (mais recente primeiro)
  out.sort((a, b) => b.lastDateSort - a.lastDateSort);
  return out;
}

/**
 * Recalcula EC (eclético resumido) e ECDET (eclético detalhado por tee) a
 * partir dos HOLES já rotacionados e do `data` já fundido por canonicalCourseName.
 *
 * Razão de existir: o pipeline Node (`make-scorecards-ui.js`) calcula o EC
 * posição-a-posição no array `g[]` sem se aperceber de que, em campos com
 * renumeração (ex: PGA Aroeira No.2 reconfigurado em 2025), rondas pré- e
 * pós-renumeração no mesmo bucket de campo têm os arrays deslocados +12.
 * Isto produz "eagles fictícios" — best=2 num par 4 quando o 2 vem de uma
 * ronda em config antiga onde a posição 4 era um par 3.
 *
 * A `rotateAroeira2HolesIfNeeded` (já aplicada antes desta função) alinha
 * todos os HOLES na config nova. Aqui refazemos o EC sobre os dados alinhados,
 * garantindo consistência par/best e from-pointers válidos.
 *
 * Mutates `ec` e `ecdet` in-place.
 */
/**
 * Normalização equivalente ao `norm()` do pipeline Node (`lib/helpers.js`):
 *   lowercase + remover diacríticos + remover apóstrofes + colapsar whitespace.
 *
 * CRÍTICO: o pipeline indexa EC/ECDET com esta normalização. Se usarmos só
 * `toLowerCase()` aqui, o nome canónico "PGA  Aroeira No.2" (com 2 espaços
 * no master-courses.json) gera key "pga  aroeira no.2", diferente da key do
 * pipeline "pga aroeira no.2" — `ec[ck] = ...` cria nova chave em vez de
 * substituir a bugada, e a UI continua a ler o EC original (errado).
 */
function normCourseKey(s: string): string {
  return stripAccents(String(s || ""))
    .toLowerCase()
    // Remover apóstrofes curvas (U+2018, U+2019) e simples
    .replace(/[‘’']/g, "")
    // Colapsar whitespace múltiplo
    .replace(/\s+/g, " ")
    .trim();
}

/** Em quantos buracos dois pares de 9 diferem (Infinity se não forem 9 + 9). */
function parDiff9(a: readonly number[], b: readonly number[]): number {
  if (a.length !== 9 || b.length !== 9) return Infinity;
  let d = 0;
  for (let i = 0; i < 9; i++) if (a[i] !== b[i]) d++;
  return d;
}

/**
 * Que metade do campo é uma volta de 9 buracos: "F" (1–9) ou "B" (10–18).
 * O pipeline grava as voltas de 9 com 9 posições, SEM dizer a metade — a única
 * pista é o par: compara-se com o par dos 18 buracos do mesmo campo (`ref18`).
 * Tolera um buraco de diferença (a organização às vezes muda o par de um
 * buraco entre épocas). null quando não se consegue dizer (sem referência, as
 * duas metades com o mesmo par, ou par que não bate com nenhuma) — nunca se
 * adivinha. 10/11/2026 (I4).
 */
export function nineOf9HoleRound(
  par9: readonly (number | null)[] | null | undefined,
  ref18: readonly (number | null)[] | null | undefined,
): "F" | "B" | null {
  const p = (par9 ?? []).slice(0, 9).map(Number);
  const ref = (ref18 ?? []).slice(0, 18).map(Number);
  if (p.length !== 9 || ref.length !== 18 || [...p, ...ref].some((v) => !(v > 0))) return null;
  const dF = parDiff9(p, ref.slice(0, 9));
  const dB = parDiff9(p, ref.slice(9, 18));
  if (dF <= 1 && dB > dF + 1) return "F";
  if (dB <= 1 && dF > dB + 1) return "B";
  return null;
}

/** Onde estão os 9 buracos jogados dentro dos arrays da volta: 0, ou 9 quando
 *  o cartão traz 18 posições com a primeira metade vazia. */
function offsetOf9(h: HoleScores): number {
  const jogado = (v: number | null | undefined) => v != null && Number(v) > 0;
  if ((h.g?.length ?? 0) < 18) return 0;
  return !h.g.slice(0, 9).some(jogado) && h.g.slice(9, 18).some(jogado) ? 9 : 0;
}

function recomputeECForAllCourses(
  data: CourseData[],
  holes: Record<string, HoleScores>,
  ec: Record<string, EclecticEntry[]>,
  ecdet: Record<string, Record<string, EclecticEntry>>,
): void {
  for (const course of data) {
    if (!course.rounds || course.rounds.length === 0) continue;
    const courseKey = normCourseKey(course.course || "");
    if (!courseKey) continue;

    // Par dos 18 buracos do campo (referência para saber a metade das voltas de
    // 9): o da volta de 18 mais recente do mesmo tee; senão, de qualquer tee.
    const ref18ByTee = new Map<string, (number | null)[]>();
    for (const r of course.rounds) {
      const h = holes[r.scoreId];
      if (!h?.p || h.p.length < 18 || h.p.slice(0, 18).some((v) => !(Number(v) > 0))) continue;
      const tk = r.teeKey || "";
      if (!ref18ByTee.has(tk)) ref18ByTee.set(tk, h.p);
      if (!ref18ByTee.has("*")) ref18ByTee.set("*", h.p);
    }

    // Agrupar rondas por (teeKey, holeCount). Um mesmo tee pode ter
    // entradas separadas para 9 e 18 buracos — e, nos 9, uma por METADE
    // (10/11/2026: as voltas 1–9 e 10–18 caíam no mesmo balde `tee|9` e o
    // eclético misturava buracos diferentes; fed 38233, Quinta do Lago Laranjal).
    type Bucket = {
      teeName: string; teeKey: string; holeCount: number; rounds: RoundData[];
      /** Só nos 9 buracos: metade ("F"/"B") ou null = não se sabe. */
      nine: "F" | "B" | null;
      /** Par dos 9 (só baldes de metade desconhecida — junta-se par com par). */
      sig: number[] | null;
    };
    const buckets = new Map<string, Bucket>();
    const offOf = new Map<string, number>();
    for (const r of course.rounds) {
      if (r._isTreino || r._isExtra || r._isTeamEvent) continue;
      const h = holes[r.scoreId];
      if (!h || !h.g || !h.p) continue;
      const teeKey = r.teeKey || "";
      const teeName = r.tee || "";
      const holeCount = r.holeCount || (h.g.length === 9 ? 9 : 18);
      let k = `${teeKey}|${holeCount}`;
      let nine: Bucket["nine"] = null;
      let sig: number[] | null = null;
      if (holeCount === 9) {
        const off = offsetOf9(h);
        offOf.set(r.scoreId, off);
        const p9 = h.p.slice(off, off + 9);
        nine = off === 9 ? "B" : nineOf9HoleRound(p9, ref18ByTee.get(teeKey) ?? ref18ByTee.get("*"));
        h.nine = nine ?? undefined;
        if (nine) k += `|${nine}`;
        else {
          // Metade desconhecida: junta-se só a voltas com o mesmo par (±1 buraco).
          sig = p9.map(Number);
          const igual = [...buckets.entries()].find(([, b]) =>
            b.teeKey === teeKey && b.holeCount === 9 && b.sig && parDiff9(b.sig, sig!) <= 1);
          k = igual ? igual[0] : `${k}|?${sig.join("")}`;
        }
      }
      if (!buckets.has(k)) {
        buckets.set(k, { teeName, teeKey, holeCount, rounds: [], nine, sig });
      }
      buckets.get(k)!.rounds.push(r);
    }
    if (buckets.size === 0) continue;

    const newEntries: EclecticEntry[] = [];
    const newDet: Record<string, EclecticEntry> = {};
    const nRoundsOf = new Map<EclecticEntry, number>();

    for (const b of buckets.values()) {
      // Linha de 18 posições. As voltas de 9 buracos entram na metade do balde
      // (pos 0-8 = front, 9-17 = back), venham os 9 buracos em que posição
      // vierem no cartão (`offOf`).
      const ROW_SIZE = 18;
      const base = b.holeCount === 9 && b.nine === "B" ? 9 : 0;
      const at = (arr: (number | null)[] | undefined, r: RoundData, i: number): number | null | undefined => {
        if (b.holeCount !== 9) return arr?.[i];
        const j = i - base;
        return j >= 0 && j < 9 ? arr?.[(offOf.get(r.scoreId) ?? 0) + j] : null;
      };
      const bestArr: (number | null)[] = new Array(ROW_SIZE).fill(null);
      const parArr: (number | null)[] = new Array(ROW_SIZE).fill(null);
      const siArr: (number | null)[] = new Array(ROW_SIZE).fill(null);
      const fromArr: (EclecticHole["from"])[] = new Array(ROW_SIZE).fill(null);

      // 1) par/si: usar o primeiro valor não-nulo (todos devem coincidir
      //    após rotação; se houver discrepância, fica o primeiro encontrado).
      for (const r of b.rounds) {
        const h = holes[r.scoreId]!;
        for (let i = 0; i < ROW_SIZE; i++) {
          const pv = at(h.p, r, i), sv = at(h.si, r, i);
          if (parArr[i] == null && pv != null) parArr[i] = Number(pv);
          if (siArr[i] == null && sv != null) siArr[i] = Number(sv);
        }
      }

      // 2) best: min de g[i] entre as rondas com valor > 0.
      //    O par de cada buraco do eclético é o da PRÓPRIA volta do best: o
      //    mesmo tee pode ser jogado com pares diferentes entre edições (a
      //    organização pode alterar o par de um buraco — ex. Padierna hole 10
      //    par 4 em 2025, par 5 em 2026). Com o "primeiro par encontrado", um
      //    birdie feito no ano do par 4 aparecia como eagle no eclético.
      const parBestArr: (number | null)[] = new Array(ROW_SIZE).fill(null);
      const wins: Record<string, number> = {};
      for (let i = 0; i < ROW_SIZE; i++) {
        if (parArr[i] == null) continue;
        let best: number | null = null;
        let from: EclecticHole["from"] = null;
        let parOfBest: number | null = null;
        for (const r of b.rounds) {
          const h = holes[r.scoreId]!;
          const g = at(h.g, r, i);
          if (g == null || Number(g) <= 0) continue;
          const v = Number(g);
          if (best == null || v < best) {
            best = v;
            from = { scoreId: r.scoreId, date: r.date };
            const pv = at(h.p, r, i);
            parOfBest = pv != null ? Number(pv) : null;
          }
        }
        bestArr[i] = best;
        fromArr[i] = from;
        parBestArr[i] = parOfBest;
        if (from) wins[from.scoreId] = (wins[from.scoreId] || 0) + 1;
      }

      // 3) Construir EclecticEntry. Para 9-hole, slice à metade do balde.
      //    (os `h` de uma metade "B" vão de 10 a 18).
      const sliceStart = base;
      const sliceEnd = sliceStart + b.holeCount;

      const holesArr: EclecticHole[] = [];
      for (let pos = sliceStart; pos < sliceEnd; pos++) {
        holesArr.push({
          h: pos + 1,
          best: bestArr[pos],
          par: parBestArr[pos] ?? parArr[pos],
          from: fromArr[pos],
        });
      }
      const totalGross = somaDe(holesArr, x => (x.best ?? 0));
      const totalPar = somaDe(holesArr, x => (x.par ?? 0));
      const allBest = holesArr.every(x => x.best != null);

      const entry: EclecticEntry = {
        teeName: b.teeName,
        teeKey: b.teeKey,
        holeCount: b.holeCount,
        totalGross: allBest ? totalGross : 0,
        totalPar,
        toPar: allBest ? (totalGross - totalPar) : null,
        holes: holesArr,
        si: siArr.slice(sliceStart, sliceEnd),
        wins,
      };
      if (b.holeCount === 9 && b.nine) entry.nine = b.nine;
      newEntries.push(entry);
      nRoundsOf.set(entry, b.rounds.length);
      // Se houver multiplos buckets no mesmo tee (9H + 18H), o ECDET deve
      // ficar com o de MAIOR holeCount (18H prefere 9H). A ordem de iteracao
      // do Map e a de insercao (nao ordenada), por isso nao se pode assumir
      // que o 18H e processado por ultimo: ha que comparar explicitamente.
      // Entre dois baldes de 9 (metades diferentes) fica o que tem mais voltas.
      const existingDet = newDet[b.teeKey];
      if (!existingDet || b.holeCount > existingDet.holeCount
        || (b.holeCount === existingDet.holeCount && b.rounds.length > (nRoundsOf.get(existingDet) ?? 0))) {
        newDet[b.teeKey] = entry;
      }
    }

    // Ordenar entries: 18H primeiro, depois 9H; dentro de cada, por holeCount desc + tee
    // (nos 9 buracos, a metade com mais voltas primeiro).
    newEntries.sort((a, b) =>
      b.holeCount - a.holeCount ||
      a.teeName.localeCompare(b.teeName) ||
      (nRoundsOf.get(b) ?? 0) - (nRoundsOf.get(a) ?? 0)
    );

    // Apagar TODAS as variantes antigas de keys (com sufixos como "- cnj fpg",
    // ou whitespace duplicado) que canonicalizem para o mesmo courseKey. Sem
    // isto, a UI poderia ler a versão bugada do EC original em vez do nosso
    // recálculo. Match: normCourseKey + canonicalCourseName → courseKey.
    for (const k of [...Object.keys(ec)]) {
      if (k === courseKey) continue;
      const norm = normCourseKey(canonicalCourseName(k) || k);
      if (norm === courseKey) delete ec[k];
    }
    for (const k of [...Object.keys(ecdet)]) {
      if (k === courseKey) continue;
      const norm = normCourseKey(canonicalCourseName(k) || k);
      if (norm === courseKey) delete ecdet[k];
    }

    ec[courseKey] = newEntries;
    ecdet[courseKey] = newDet;
  }
}

export async function loadPlayerData(fedId: string): Promise<PlayerPageData> {
  const cached = _playerCache.get(fedId);
  if (cached) return cached;

  const promise = _loadPlayerDataImpl(fedId);
  _playerCache.set(fedId, promise);

  // Remove from cache on error so it can be retried
  promise.catch(() => _playerCache.delete(fedId));

  return promise;
}

/* ── Tabela global de jogadores (CROSS_DATA) ───────────────────────────
 * Até 2026-09 esta tabela vinha DENTRO de cada `{fed}/analysis/data.json` —
 * 9,4 MB repetidos em cada ficha (6,4 GB no deployment, 10 MB por página).
 * Agora é `/data/cross-data.json`, pedido uma vez e partilhado por todas as
 * fichas. Fichas antigas que ainda tragam `CROSS_DATA` embutido continuam a
 * funcionar (ganham prioridade sobre o ficheiro partilhado).
 */
/* 10/11/2026: `memoAsync` — um 502 passageiro devolve `{}` a quem pediu mas não
 * fica guardado (antes as fichas ficavam sem a tabela global até recarregar). */
const _loadCrossData = memoAsync<Record<string, CrossPlayerData>>(
  async () => (await cachedFetchJson<Record<string, CrossPlayerData>>("/data/cross-data.json")) ?? {},
  { fallback: () => ({}) },
);

export function loadCrossData(): Promise<Record<string, CrossPlayerData>> {
  return _loadCrossData();
}

/** Ficha de um federado gerada pelo pipeline (`output/{fed}/analysis/data.json`). */
export const playerDataUrl = (fed: string): string => `/${fed}/analysis/data.json`;

async function _loadPlayerDataImpl(fedId: string): Promise<PlayerPageData> {
  // Try data.json first (lightweight, generated by make-scorecards-ui.js)
  const jsonUrl = playerDataUrl(fedId);
  try {
    // Os dois pedidos em paralelo: o cross-data.json é partilhado e fica em
    // cache, por isso só a primeira ficha aberta é que o paga.
    const [resp, sharedCross] = await Promise.all([fetch(jsonUrl), loadCrossData()]);
    if (resp.ok) {
      const raw = await resp.json();
      // Current HCP = post-round value from HCP_INFO (not pre-round r.hi)
      const latestHcp: number | null = raw.HCP_INFO?.current != null ? Number(raw.HCP_INFO.current) : null;

      const crossData: Record<string, CrossPlayerData> =
        (raw.CROSS_DATA && Object.keys(raw.CROSS_DATA).length ? raw.CROSS_DATA : sharedCross) || {};
      const currentCross = crossData[raw.CURRENT_FED || fedId];
      // Club may be string or object {short, long}
      // O `club` do CROSS_DATA vem como string nuns registos e como
      // {short, long} noutros — daí o cast (mesmo padrão do fallback HTML).
      const clubRaw = currentCross?.club as unknown;
      const club = typeof clubRaw === "string" ? clubRaw
        : ((clubRaw as { short?: string; long?: string } | undefined)?.short
          || (clubRaw as { short?: string; long?: string } | undefined)?.long
          || "");

      const holes: Record<string, HoleScores> = raw.HOLES || {};
      // 1) Split de buckets ambíguos ("Aroeira II" → No.1 ou No.2 por par[]).
      //    Tem de correr ANTES da rotação porque usa o par[] original.
      const splitData = splitAmbiguousAroeiraCourses(raw.DATA || [], holes);
      // 2) Merge por nome canónico (Challenge, Pines Classic, "- CNJ FPG", etc.)
      const data: CourseData[] = mergeCanonicalCourses(splitData);
      // 3) Rotacionar +12 os scorecards do Aroeira No.2 que vieram na sequência
      //    antiga (ex: Campeonato Nacional Jovens 2026). Detectado pelo `p` de
      //    cada bucket de HOLES — não depende de data nem de mapeamento de tcode.
      for (const sid of Object.keys(holes)) {
        rotateAroeira2HolesIfNeeded(holes[sid]);
      }
      // Recalcular EC/ECDET a partir dos HOLES rotacionados — corrige bug
      // do pipeline que misturava configs antigas/novas no mesmo bucket de
      // campo (gerando "eagles fictícios" em par 4/5).
      const ec: Record<string, EclecticEntry[]> = raw.EC || {};
      const ecdet: Record<string, Record<string, EclecticEntry>> = raw.ECDET || {};
      recomputeECForAllCourses(data, holes, ec, ecdet);
      // Calcular totalRounds e roundsCurrentYear directamente de DATA
      // (fonte canónica). Se data.json estiver vazio/truncado, ficam a 0
      // e o sidebar usa o player-stats.json como fallback.
      let totalRounds = 0;
      let roundsCurrentYear = 0;
      const curYear = String(new Date().getFullYear());
      for (const c of data) {
        for (const r of (c.rounds || [])) {
          // O data.json traz sd/stb/hi vazios como "" (e o hi às vezes em texto).
          // Sem isto o "" contava como 0: médias erradas, «17*» em voltas de 9 sem
          // Stableford e os vazios no topo ao ordenar (10/11/2026).
          r.sd = numSafe(r.sd); r.stb = numSafe(r.stb); r.hi = numSafe(r.hi);
          totalRounds++;
          if ((r.date || "").endsWith(curYear)) roundsCurrentYear++;
        }
      }
      const result: PlayerPageData = {
        DATA: data,
        HOLES: holes,
        EC: ec,
        ECDET: ecdet,
        HOLE_STATS: raw.HOLE_STATS || {},
        TEE: raw.TEE || [],
        CROSS_DATA: crossData,
        CURRENT_FED: raw.CURRENT_FED || fedId,
        HCP_INFO: raw.HCP_INFO || { current: null, lowHcp: null, softCap: null, hardCap: null, scoreAvg: null, qtyScores: null, qtyCalc: null, adjustTotal: null },
        META: {
          lastUpdate: raw.META?.lastUpdate || "",
          lastRoundDate: raw.META?.lastRoundDate || "",
          generatedDate: raw.META?.generatedDate || "",
          latestHcp,
          escalao: currentCross?.escalao || "",
          club,
          totalRounds,
          roundsCurrentYear,
        },
      };
      return result;
    }
  } catch { /* fallback to HTML */ }

  // Fallback: parse HTML (backward compatibility)
  console.warn(`[playerDataLoader] data.json not found, falling back to HTML parsing`);
  const htmlUrl = `/${fedId}/analysis/by-course-ui.html`;
  const resp = await fetch(htmlUrl);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${htmlUrl}`);
  const html = await resp.text();

  const scriptMatch = html.match(/<script>([\s\S]+)<\/script>/);
  if (!scriptMatch) throw new Error("No script block found in HTML");
  const script = scriptMatch[1];

  const result = {
    DATA: mergeCanonicalCourses(parseVar<CourseData[]>(script, "DATA", [])),
    HOLES: parseVar<Record<string, HoleScores>>(script, "HOLES", {}),
    EC: parseVar<Record<string, EclecticEntry[]>>(script, "EC", {}),
    ECDET: parseVar<Record<string, Record<string, EclecticEntry>>>(script, "ECDET", {}),
    HOLE_STATS: parseVar<Record<string, Record<string, HoleStatsData>>>(script, "HOLE_STATS", {}),
    TEE: parseVar<unknown[]>(script, "TEE", []),
    CROSS_DATA: parseVar<Record<string, CrossPlayerData>>(script, "CROSS_DATA", await loadCrossData()),
    CURRENT_FED: parseVar<string>(script, "CURRENT_FED", fedId),
    HCP_INFO: parseVar<HcpInfo>(script, "HCP_INFO", {
      current: null, lowHcp: null, softCap: null, hardCap: null,
      scoreAvg: null, qtyScores: null, qtyCalc: null, adjustTotal: null,
    }),
  };

  // Extract META from HTML
  const lastUpdateMatch = html.match(/ltima actualiza[çc][ãa]o:\s*([^<]+)/i);
  const lastUpdate = lastUpdateMatch ? lastUpdateMatch[1].trim() : "";
  const lastRoundMatch = html.match(/Actualizado:\s*<b>([^<]+)<\/b>/i);
  const lastRoundDate = lastRoundMatch ? lastRoundMatch[1].trim() : "";
  const generatedMatch = html.match(/Gerado:\s*([^<\n]+)/i);
  const generatedDate = generatedMatch ? generatedMatch[1].trim() : "";

  // Current HCP = post-round value from HCP_INFO (not pre-round r.hi)
  const latestHcp: number | null = result.HCP_INFO?.current != null ? Number(result.HCP_INFO.current) : null;

  const currentCross = result.CROSS_DATA[result.CURRENT_FED || fedId];
  // Club may be string or object {short, long}
  const clubRaw = currentCross?.club;
  const club = typeof clubRaw === "string" ? clubRaw
    : ((clubRaw as any)?.short || (clubRaw as any)?.long || "");


  let totalRounds = 0, roundsCurrentYear = 0;
  const curYear = String(new Date().getFullYear());
  for (const c of result.DATA) {
    for (const r of (c.rounds || [])) {
      totalRounds++;
      if ((r.date || "").endsWith(curYear)) roundsCurrentYear++;
    }
  }
  return {
    ...result,
    META: { lastUpdate, lastRoundDate, generatedDate, latestHcp, escalao: currentCross?.escalao || "", club, totalRounds, roundsCurrentYear },
  };
}
