/**
 * playerDataLoader.ts
 *
 * Extrai os dados embebidos no HTML standalone gerado por make-scorecards-ui.js.
 * O HTML contém um bloco <script> com variáveis JS (DATA, HOLES, etc.)
 * geradas via JSON.stringify — podemos extraí-las com regex e fazer JSON.parse.
 */

import { canonicalCourseName, rotateAroeira2HolesIfNeeded, resolveAroeiraIIByPar, resolveSantoDaSerraByPar } from "../utils/courseAliases";

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
  return String(s || "")
    .toLowerCase()
    // Remover diacríticos (combining chars U+0300..U+036F)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    // Remover apóstrofes curvas (U+2018, U+2019) e simples
    .replace(/[‘’']/g, "")
    // Colapsar whitespace múltiplo
    .replace(/\s+/g, " ")
    .trim();
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

    // Agrupar rondas por (teeKey, holeCount). Um mesmo tee pode ter
    // entradas separadas para 9 e 18 buracos.
    type Bucket = { teeName: string; teeKey: string; holeCount: number; rounds: RoundData[] };
    const buckets = new Map<string, Bucket>();
    for (const r of course.rounds) {
      if (r._isTreino || r._isExtra || r._isTeamEvent) continue;
      const h = holes[r.scoreId];
      if (!h || !h.g || !h.p) continue;
      const teeKey = r.teeKey || "";
      const teeName = r.tee || "";
      const holeCount = r.holeCount || (h.g.length === 9 ? 9 : 18);
      const k = `${teeKey}|${holeCount}`;
      if (!buckets.has(k)) {
        buckets.set(k, { teeName, teeKey, holeCount, rounds: [] });
      }
      buckets.get(k)!.rounds.push(r);
    }
    if (buckets.size === 0) continue;

    const newEntries: EclecticEntry[] = [];
    const newDet: Record<string, EclecticEntry> = {};

    for (const b of buckets.values()) {
      // O array `g` em HOLES tem sempre 18 posições (pos 0-17). Para 9-hole
      // rounds, podem usar pos 0-8 (front-9) ou 9-17 (back-9); o valor que
      // está fora é null/0.
      const ROW_SIZE = 18;
      const bestArr: (number | null)[] = new Array(ROW_SIZE).fill(null);
      const parArr: (number | null)[] = new Array(ROW_SIZE).fill(null);
      const siArr: (number | null)[] = new Array(ROW_SIZE).fill(null);
      const fromArr: (EclecticHole["from"])[] = new Array(ROW_SIZE).fill(null);

      // 1) par/si: usar o primeiro valor não-nulo (todos devem coincidir
      //    após rotação; se houver discrepância, fica o primeiro encontrado).
      for (const r of b.rounds) {
        const h = holes[r.scoreId]!;
        for (let i = 0; i < ROW_SIZE; i++) {
          if (parArr[i] == null && h.p?.[i] != null) parArr[i] = Number(h.p[i]);
          if (siArr[i] == null && h.si?.[i] != null) siArr[i] = Number(h.si[i]);
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
          const g = h.g?.[i];
          if (g == null || Number(g) <= 0) continue;
          const v = Number(g);
          if (best == null || v < best) {
            best = v;
            from = { scoreId: r.scoreId, date: r.date };
            parOfBest = h.p?.[i] != null ? Number(h.p[i]) : null;
          }
        }
        bestArr[i] = best;
        fromArr[i] = from;
        parBestArr[i] = parOfBest;
        if (from) wins[from.scoreId] = (wins[from.scoreId] || 0) + 1;
      }

      // 3) Construir EclecticEntry. Para 9-hole, slice ao range correcto.
      const startHole = b.holeCount === 9
        ? (parArr.slice(0, 9).every(p => p != null) ? 1 : 10)
        : 1;
      const sliceStart = startHole === 10 ? 9 : 0;
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
      const totalGross = holesArr.reduce((s, x) => s + (x.best ?? 0), 0);
      const totalPar = holesArr.reduce((s, x) => s + (x.par ?? 0), 0);
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
      newEntries.push(entry);
      // Se houver multiplos buckets no mesmo tee (9H + 18H), o ECDET deve
      // ficar com o de MAIOR holeCount (18H prefere 9H). A ordem de iteracao
      // do Map e a de insercao (nao ordenada), por isso nao se pode assumir
      // que o 18H e processado por ultimo: ha que comparar explicitamente.
      const existingDet = newDet[b.teeKey];
      if (!existingDet || b.holeCount > existingDet.holeCount) {
        newDet[b.teeKey] = entry;
      }
    }

    // Ordenar entries: 18H primeiro, depois 9H; dentro de cada, por holeCount desc + tee
    newEntries.sort((a, b) =>
      b.holeCount - a.holeCount ||
      a.teeName.localeCompare(b.teeName)
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
let _crossDataPromise: Promise<Record<string, CrossPlayerData>> | null = null;

export function loadCrossData(): Promise<Record<string, CrossPlayerData>> {
  if (!_crossDataPromise) {
    _crossDataPromise = fetch("/data/cross-data.json")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return _crossDataPromise;
}

async function _loadPlayerDataImpl(fedId: string): Promise<PlayerPageData> {
  // Try data.json first (lightweight, generated by make-scorecards-ui.js)
  const jsonUrl = `/${fedId}/analysis/data.json`;
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
