/**
 * tournamentTypes.ts — Tipos e normalização para torneios multi-dia
 *
 * Schema JSON (nested):
 *   results: { wagr: { d1: [], d2: [], d3: [] }, sub14: { d1: [], d2: [] }, ... }
 *   manualHoles: { wagr: { d1: {...} }, sub14: { d1: {...} }, ... }
 *   draws: { wagr: { d1: [], d2: [] }, sub14: { d1: [] }, ... }
 *
 * Backward-compatible: normaliza o formato antigo (results.d1, results.sub14, ...)
 * para o novo formato nested automaticamente.
 */

/* ── Core types ── */

export interface HoleInfo {
  h: number;
  par: number;
  si: number;
  m: number;
}

export interface CourseInfo {
  par: number;
  cr: number;
  slope: number;
  holes: HoleInfo[];
}

export interface DrawEntry {
  time: string;
  tee: number;
  teeColor: string;
  group: number;
  name: string;
  fed: string | null;
  club: string;
  hcpExact: number | null;
  hcpPlay: number | null;
  sex: string;
}

export interface ResultEntry {
  pos: number | null;
  name: string;
  fed: string | null;
  club: string;
  toPar: number | null;
  gross: number | null;
  total: number | null;
  status: string;
}

export interface PlayerHoles {
  fed: string | null;
  name: string;
  holes: (number | null)[];
  gross: number;
}

/* ── Category config ── */

export interface TournCategory {
  key: string;           // "wagr", "sub14", "sub12"
  label: string;         // "WAGR", "Sub-14", "Sub-12"
  days: number;          // quantos dias joga esta categoria
  tee: string;           // tee default: "Brancas", "Amarelas", "Vermelhas"
  courseData: CourseInfo; // CR/Slope/Holes para esta categoria
}

/* ── Tee ratings (por combinação tee+sex) ── */

export interface TeeRating {
  cr: number;
  slope: number;
  par: number;
}

/* ── Normalized tournament ── */

export interface NormalizedTournament {
  id: string;
  name: string;
  course: string;
  courseKey: string;
  dates: string[];       // ["2026-02-15", "2026-02-16", "2026-02-17"]
  totalDays: number;
  password: string;

  categories: TournCategory[];
  teeRatings: Record<string, TeeRating>;  // "Brancas_M" → { cr, slope, par }
  pjaFeds: Set<string>;
  birthYears: Record<string, number>;

  /** results[catKey][dayKey] → ResultEntry[] */
  results: Record<string, Record<string, ResultEntry[]>>;

  /** manualHoles[catKey][dayKey][playerKey] → PlayerHoles */
  manualHoles: Record<string, Record<string, Record<string, PlayerHoles>>>;

  /** draws[catKey][dayKey] → DrawEntry[] */
  draws: Record<string, Record<string, DrawEntry[]>>;

  /** Links externos agrupados */
  links: Record<string, string>;

  /** Todas as draw entries (flat, para lookups rápidos) */
  allDraw: DrawEntry[];

  /** catDates[catKey][dayKey] → "YYYY-MM-DD" */
  catDates: Record<string, Record<string, string>>;

  /** Palavras-chave para match do campo do torneio (lowercase) */
  courseMatch: string[];
}

/* ── Day helpers ── */

/** Lista de dayKeys para uma categoria: ["d1", "d2", ...] */
export function dayKeys(cat: TournCategory): string[] {
  return Array.from({ length: cat.days }, (_, i) => `d${i + 1}`);
}

/** Label legível: "d1" → "Dia 1", "d2" → "Dia 2" */
export function dayLabel(dayKey: string): string {
  const n = dayKey.replace("d", "");
  return `Dia ${n}`;
}

/** Dias que já têm resultados para uma categoria */
export function availableDays(
  norm: NormalizedTournament,
  catKey: string,
): string[] {
  const catResults = norm.results[catKey] || {};
  return Object.keys(catResults).filter(
    dk => catResults[dk]?.some(r => r.status === "OK"),
  );
}

/** Todos os ResultEntry de todos os dias de uma categoria (com dayKey anotado) */
export function allDayResults(
  norm: NormalizedTournament,
  catKey: string,
): (ResultEntry & { dayKey: string })[] {
  const catResults = norm.results[catKey] || {};
  const all: (ResultEntry & { dayKey: string })[] = [];
  for (const [dk, entries] of Object.entries(catResults)) {
    for (const e of entries) {
      all.push({ ...e, dayKey: dk });
    }
  }
  return all;
}

/* ── Tee rating lookup ── */

export function getTeeRating(
  norm: NormalizedTournament,
  teeColor: string,
  sex: string,
): TeeRating {
  const key = `${teeColor}_${sex}`;
  return (
    norm.teeRatings[key] ||
    norm.teeRatings[`${teeColor}_M`] ||
    norm.teeRatings["Brancas_M"] ||
    { cr: 72, slope: 113, par: 72 }
  );
}

/** SD calculado a partir do gross + tee rating */
export function calcDaySD(
  gross: number,
  norm: NormalizedTournament,
  teeColor: string,
  sex: string,
): number {
  const r = getTeeRating(norm, teeColor, sex);
  return Math.round((113 / r.slope) * (gross - r.cr) * 10) / 10;
}

/* ── Date helpers ── */

/** "YYYY-MM-DD" → "DD-MM-YYYY" (pipeline format) */
export function isoToDD(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/** "DD-MM-YYYY" → "YYYY-MM-DD" */
export function ddToISO(dd: string): string {
  const [d, m, y] = dd.split("-");
  return `${y}-${m}-${d}`;
}

/** Build catDates mapping from tournament config */
function buildCatDates(
  categories: TournCategory[],
  dates: string[],
  totalDays: number,
): Record<string, Record<string, string>> {
  const catDates: Record<string, Record<string, string>> = {};
  for (const cat of categories) {
    catDates[cat.key] = {};
    // Sub-categories start later: e.g. 2-day cat in 3-day tournament starts on date[1]
    const startIdx = cat.key === "wagr" ? 0 : Math.max(0, totalDays - cat.days);
    for (let d = 0; d < cat.days; d++) {
      const dateIdx = startIdx + d;
      if (dateIdx < dates.length) {
        catDates[cat.key][`d${d + 1}`] = dates[dateIdx];
      }
    }
  }
  return catDates;
}

/* ── Live result derivation ── */

/**
 * Dados extraídos de um round do jogador para o torneio.
 * Produzido pelo loading loop no TorneioPage.
 */
export interface LiveRound {
  fed: string;
  name: string;
  club: string;
  dateDD: string;        // "DD-MM-YYYY"
  gross: number;
  par: number;
  holes: (number | null)[] | null;  // 18 holes, null se não disponível
  scoreId: string;
}

/**
 * Dado o conjunto de rounds ao vivo dos jogadores, deriva:
 * - results por categoria por dia (com posições calculadas)
 * - holeData por "catKey_dayKey" → Map<playerKey, PlayerHoles>
 *
 * Merge com resultados estáticos (JSON) e manualHoles (internacionais).
 */
export function deriveResults(
  norm: NormalizedTournament,
  liveRounds: LiveRound[],
): {
  results: Record<string, Record<string, ResultEntry[]>>;
  holeDataByDay: Record<string, Map<string, PlayerHoles>>;
} {
  // Build reverse date lookup: ISO date → { catKey, dayKey }[]
  const dateToDay = new Map<string, { catKey: string; dayKey: string }[]>();
  for (const [catKey, days] of Object.entries(norm.catDates)) {
    for (const [dayKey, isoDate] of Object.entries(days)) {
      const ddDate = isoToDD(isoDate);
      if (!dateToDay.has(ddDate)) dateToDay.set(ddDate, []);
      dateToDay.get(ddDate)!.push({ catKey, dayKey });
    }
  }

  // Collect derived results and holes
  const derivedResults: Record<string, Record<string, Map<string, ResultEntry>>> = {};
  const holeDataByDay: Record<string, Map<string, PlayerHoles>> = {};

  for (const cat of norm.categories) {
    derivedResults[cat.key] = {};
    for (const dk of dayKeys(cat)) {
      derivedResults[cat.key][dk] = new Map();
      holeDataByDay[`${cat.key}_${dk}`] = new Map();
    }
  }

  // Process each live round
  for (const round of liveRounds) {
    const mappings = dateToDay.get(round.dateDD);
    if (!mappings) continue;

    // Determine player's category
    const pCat = playerCategory(norm, round.fed, round.name);

    for (const { catKey, dayKey } of mappings) {
      if (catKey !== pCat) continue;

      const draw = findDrawEntry(norm, round.fed, round.name);
      const teeColor = draw?.teeColor || norm.categories.find(c => c.key === catKey)?.tee || "Brancas";
      const sex = draw?.sex || "M";
      const catCourse = norm.categories.find(c => c.key === catKey)?.courseData;
      const toPar = catCourse ? round.gross - catCourse.par : round.gross - 72;

      // Store result
      derivedResults[catKey][dayKey].set(round.fed, {
        pos: null, // calculated later
        name: round.name,
        fed: round.fed,
        club: round.club,
        toPar,
        gross: round.gross,
        total: round.gross,
        status: "OK",
      });

      // Store holes
      if (round.holes && round.holes.length >= 18) {
        holeDataByDay[`${catKey}_${dayKey}`].set(round.fed, {
          fed: round.fed,
          name: round.name,
          holes: round.holes.slice(0, 18),
          gross: round.gross,
        });
      }
    }
  }

  // Merge with static results (JSON) — keep non-federated players
  const finalResults: Record<string, Record<string, ResultEntry[]>> = {};

  for (const cat of norm.categories) {
    finalResults[cat.key] = {};
    for (const dk of dayKeys(cat)) {
      const derived = derivedResults[cat.key][dk];
      const staticList = norm.results[cat.key]?.[dk] || [];

      // Start with derived (live) results
      const merged = new Map<string, ResultEntry>(derived);

      // Add static results for players NOT in derived (e.g. internationals)
      for (const r of staticList) {
        const key = r.fed || r.name;
        if (!merged.has(key)) {
          merged.set(key, r);
        }
      }

      // Also merge manual holes for non-fed players
      const manualDay = norm.manualHoles[cat.key]?.[dk] || {};
      const hdKey = `${cat.key}_${dk}`;
      for (const [pKey, ph] of Object.entries(manualDay)) {
        if (!holeDataByDay[hdKey].has(pKey) && !holeDataByDay[hdKey].has(ph.name)) {
          holeDataByDay[hdKey].set(pKey, ph);
        }
      }

      // Sort by gross, assign positions
      const list = Array.from(merged.values());
      const ok = list.filter(r => r.status === "OK" && r.gross != null);
      const rest = list.filter(r => r.status !== "OK" || r.gross == null);
      ok.sort((a, b) => (a.gross ?? 999) - (b.gross ?? 999));

      let pos = 1;
      for (let i = 0; i < ok.length; i++) {
        if (i > 0 && (ok[i].gross ?? 999) > (ok[i - 1].gross ?? 999)) {
          pos = i + 1;
        }
        ok[i] = { ...ok[i], pos };
      }

      finalResults[cat.key][dk] = [...ok, ...rest];
    }
  }

  return { results: finalResults, holeDataByDay };
}

/* ══════════════════════════════════════════
   Normalizer — old format → new format
   ══════════════════════════════════════════ */

/**
 * Normaliza o JSON do torneio para o formato nested.
 * Suporta tanto o formato antigo (results.d1, results.sub14)
 * como o novo (results.wagr.d1, results.sub14.d1).
 */
export function normalizeTournament(raw: Record<string, unknown>): NormalizedTournament {
  const r = raw as any;

  /* ── Detect format ── */
  const rawResults = r.results || {};
  const isNewFormat = rawResults.wagr && typeof rawResults.wagr === "object" && !Array.isArray(rawResults.wagr);

  /* ── Course data per category ── */
  const courseMain: CourseInfo = r.courseData || { par: 72, cr: 72, slope: 113, holes: [] };
  const courseAmarelas: CourseInfo | null = r.courseDataAmarelas || null;
  const courseVermelhas: CourseInfo | null = r.courseDataVermelhas || null;
  const courseAzuis = r.courseDataAzuis || null;

  /* ── Categories ── */
  const totalDays = r.totalDays || 3;
  const categories: TournCategory[] = [
    { key: "wagr", label: "WAGR", days: totalDays, tee: "Brancas", courseData: courseMain },
  ];
  if (courseAmarelas || r.draw_sub14 || rawResults.sub14) {
    const sub14Days = r.sub14Days ?? Math.max(1, totalDays - 1);
    categories.push({
      key: "sub14", label: "Sub-14", days: sub14Days,
      tee: "Amarelas", courseData: courseAmarelas || courseMain,
    });
  }
  if (courseVermelhas || r.draw_sub12 || rawResults.sub12) {
    const sub12Days = r.sub12Days ?? Math.max(1, totalDays - 1);
    categories.push({
      key: "sub12", label: "Sub-12", days: sub12Days,
      tee: "Vermelhas", courseData: courseVermelhas || courseMain,
    });
  }

  /* ── Tee ratings ── */
  const teeRatings: Record<string, TeeRating> = {
    Brancas_M: { cr: courseMain.cr, slope: courseMain.slope, par: courseMain.par },
  };
  if (courseAzuis) {
    teeRatings.Azuis_F = { cr: courseAzuis.cr, slope: courseAzuis.slope, par: courseAzuis.par || 72 };
    teeRatings.Azuis_M = { cr: courseAzuis.cr - 6.5, slope: courseAzuis.slope - 9, par: 72 }; // fallback
  }
  if (courseAmarelas) {
    teeRatings.Amarelas_M = { cr: courseAmarelas.cr, slope: courseAmarelas.slope, par: courseAmarelas.par || 72 };
  }
  if (courseVermelhas) {
    teeRatings.Vermelhas_M = { cr: courseVermelhas.cr, slope: courseVermelhas.slope, par: courseVermelhas.par || 72 };
    teeRatings.Vermelhas_F = { cr: (courseVermelhas.cr + 5.7), slope: (courseVermelhas.slope + 6), par: 72 };
  }
  // Override with explicit ratings if provided
  if (r.teeRatings) Object.assign(teeRatings, r.teeRatings);

  /* ── Results ── */
  const results: Record<string, Record<string, ResultEntry[]>> = {};
  if (isNewFormat) {
    for (const cat of categories) {
      results[cat.key] = {};
      const catBlock = rawResults[cat.key] || {};
      for (const dk of dayKeys(cat)) {
        if (catBlock[dk]) results[cat.key][dk] = catBlock[dk] as ResultEntry[];
      }
    }
  } else {
    // Old format: results.d1 = WAGR d1, results.d2 = WAGR d2, results.sub14 = sub14 d1, etc.
    results.wagr = {};
    for (let d = 1; d <= totalDays; d++) {
      const key = `d${d}`;
      if (rawResults[key]) results.wagr[key] = rawResults[key] as ResultEntry[];
    }
    for (const cat of categories.filter(c => c.key !== "wagr")) {
      results[cat.key] = {};
      // Old format: results.sub14 = d1, results.sub14_d2 = d2
      if (rawResults[cat.key]) {
        results[cat.key].d1 = rawResults[cat.key] as ResultEntry[];
      }
      for (let d = 2; d <= cat.days; d++) {
        const key = `${cat.key}_d${d}`;
        if (rawResults[key]) results[cat.key][`d${d}`] = rawResults[key] as ResultEntry[];
      }
    }
  }

  /* ── Manual holes ── */
  const manualHoles: Record<string, Record<string, Record<string, PlayerHoles>>> = {};
  const allDrawFlat: DrawEntry[] = [];

  // Collect draws first (needed for manual holes name resolution)
  const draws: Record<string, Record<string, DrawEntry[]>> = {};
  if (r.draws && typeof r.draws === "object" && !Array.isArray(r.draws)) {
    // New format
    for (const cat of categories) {
      draws[cat.key] = r.draws[cat.key] || {};
    }
  } else {
    // Old format
    draws.wagr = {};
    if (r.draw_r1) draws.wagr.d1 = r.draw_r1 as DrawEntry[];
    if (r.draw_r2) draws.wagr.d2 = r.draw_r2 as DrawEntry[];
    if (r.draw_r3) draws.wagr.d3 = r.draw_r3 as DrawEntry[];
    for (const cat of categories.filter(c => c.key !== "wagr")) {
      draws[cat.key] = {};
      if (r[`draw_${cat.key}`]) draws[cat.key].d1 = r[`draw_${cat.key}`] as DrawEntry[];
      if (r[`draw_${cat.key}_r2`]) draws[cat.key].d2 = r[`draw_${cat.key}_r2`] as DrawEntry[];
    }
  }

  // Flatten all draws
  for (const catDraws of Object.values(draws)) {
    for (const dayDraw of Object.values(catDraws)) {
      allDrawFlat.push(...dayDraw);
    }
  }

  // Parse manual holes
  const parseMH = (raw: Record<string, any> | undefined, catKey: string, dayKey: string) => {
    if (!raw) return;
    if (!manualHoles[catKey]) manualHoles[catKey] = {};
    if (!manualHoles[catKey][dayKey]) manualHoles[catKey][dayKey] = {};
    for (const [key, md] of Object.entries(raw)) {
      const holesArr = md.holes || md.d1 || md[dayKey];
      const gross = md.gross || (Array.isArray(holesArr) ? holesArr.reduce((s: number, v: number) => s + (v ?? 0), 0) : 0);
      if (Array.isArray(holesArr) && holesArr.length >= 18) {
        const entry = allDrawFlat.find(d => d.fed === key || d.name === key);
        manualHoles[catKey][dayKey][key] = {
          fed: entry?.fed ?? null,
          name: entry?.name ?? key,
          holes: holesArr.slice(0, 18),
          gross,
        };
      }
    }
  };

  if (r.manualHoles && typeof r.manualHoles === "object") {
    // Check if new format (nested by cat/day) or old (flat)
    const firstVal = Object.values(r.manualHoles)[0] as any;
    if (firstVal && firstVal.d1 && typeof firstVal.d1 === "object" && !Array.isArray(firstVal.d1)) {
      // New nested format
      for (const cat of categories) {
        const catMH = (r.manualHoles as any)[cat.key];
        if (catMH) {
          for (const dk of Object.keys(catMH)) {
            parseMH(catMH[dk], cat.key, dk);
          }
        }
      }
    } else {
      // Old flat format
      parseMH(r.manualHoles, "wagr", "d1");
      parseMH(r.manualHolesSub14, "sub14", "d1");
      parseMH(r.manualHolesSub12, "sub12", "d1");
    }
  }

  const dates = (r.dates as string[]) || [];
  const catDates = r.catDates
    ? (r.catDates as Record<string, Record<string, string>>)
    : buildCatDates(categories, dates, totalDays);

  // Course match keywords: used to identify rounds at this tournament's course
  const courseKey = String(r.courseKey || "").toLowerCase();
  const courseMatch: string[] = r.courseMatch
    ? (r.courseMatch as string[])
    : courseKey.split(/\s+/).filter((w: string) => w.length > 2);

  return {
    id: String(r.id || ""),
    name: String(r.name || ""),
    course: String(r.course || ""),
    courseKey,
    dates,
    totalDays,
    password: String(r.password || ""),
    categories,
    teeRatings,
    pjaFeds: new Set((r._pja_feds || []) as string[]),
    birthYears: (r.birthYears || {}) as Record<string, number>,
    results,
    manualHoles,
    draws,
    links: (r.links || {}) as Record<string, string>,
    allDraw: allDrawFlat,
    catDates,
    courseMatch,
  };
}

/* ── Player lookup helpers ── */

export function findDrawEntry(
  norm: NormalizedTournament,
  fed: string | null,
  name: string,
): DrawEntry | undefined {
  return norm.allDraw.find(d => (fed && d.fed === fed) || d.name === name);
}

export function isFemale(norm: NormalizedTournament, fed: string | null, name: string): boolean {
  return findDrawEntry(norm, fed, name)?.sex === "F";
}

export function isPja(norm: NormalizedTournament, fed: string | null): boolean {
  return !!fed && norm.pjaFeds.has(fed);
}

export function birthYear(norm: NormalizedTournament, fed: string | null): number | null {
  return fed ? norm.birthYears[fed] ?? null : null;
}

export function escalaoFromYear(year: number | null): string {
  if (!year) return "";
  const age = new Date().getFullYear() - year;
  if (age <= 10) return "Sub-10";
  if (age <= 12) return "Sub-12";
  if (age <= 14) return "Sub-14";
  if (age <= 16) return "Sub-16";
  if (age <= 18) return "Sub-18";
  if (age <= 21) return "Sub-21";
  return "Absoluto";
}

/** playerCategory: determina se um jogador é wagr, sub14 ou sub12 */
export function playerCategory(
  norm: NormalizedTournament,
  fed: string | null,
  name: string,
): string {
  for (const cat of [...norm.categories].reverse()) {
    // Check if player is in any draw of this category
    const catDraws = norm.draws[cat.key] || {};
    for (const dayDraw of Object.values(catDraws)) {
      if (dayDraw.find(d => (fed && d.fed === fed) || d.name === name)) {
        return cat.key;
      }
    }
  }
  return "wagr";
}

/* ── Accumulated results ── */

export interface AccumulatedRow {
  name: string;
  fed: string | null;
  club: string;
  teeColor: string;
  sex: string;
  /** Per-day data: { d1: { gross, toPar, sd, pos }, d2: ... } */
  days: Record<string, {
    gross: number | null;
    toPar: number | null;
    sd: number | null;
    pos: number | null;
  }>;
  totalGross: number;
  totalToPar: number;
  avgSD: number | null;
  daysPlayed: number;
  /** Overall position (computed after sorting) */
  pos: number;
}

/**
 * Computa a tabela acumulada para uma categoria.
 * Junta resultados de todos os dias, calcula totais e SD médio.
 */
export function computeAccumulated(
  norm: NormalizedTournament,
  catKey: string,
): AccumulatedRow[] {
  const cat = norm.categories.find(c => c.key === catKey);
  if (!cat) return [];

  const catResults = norm.results[catKey] || {};
  const daysWithResults = Object.keys(catResults).filter(
    dk => catResults[dk]?.some(r => r.status === "OK"),
  );

  if (daysWithResults.length === 0) return [];

  // Build a map: playerKey → AccumulatedRow
  const playerMap = new Map<string, AccumulatedRow>();

  for (const dk of daysWithResults) {
    for (const r of catResults[dk]) {
      if (r.status !== "OK" || r.gross == null) continue;

      const pKey = r.fed || r.name;
      let row = playerMap.get(pKey);
      if (!row) {
        const drawEntry = findDrawEntry(norm, r.fed, r.name);
        row = {
          name: r.name,
          fed: r.fed,
          club: r.club,
          teeColor: drawEntry?.teeColor || cat.tee,
          sex: drawEntry?.sex || "M",
          days: {},
          totalGross: 0,
          totalToPar: 0,
          avgSD: null,
          daysPlayed: 0,
          pos: 0,
        };
        playerMap.set(pKey, row);
      }

      const sd = calcDaySD(r.gross, norm, row.teeColor, row.sex);
      row.days[dk] = {
        gross: r.gross,
        toPar: r.toPar,
        sd,
        pos: r.pos,
      };
      row.totalGross += r.gross;
      row.totalToPar += r.toPar ?? 0;
      row.daysPlayed++;
    }
  }

  // Compute avg SD
  const rows = Array.from(playerMap.values());
  for (const row of rows) {
    const sds = Object.values(row.days).map(d => d.sd).filter((s): s is number => s != null);
    row.avgSD = sds.length > 0 ? Math.round(sds.reduce((a, b) => a + b, 0) / sds.length * 10) / 10 : null;
  }

  // Sort by total gross
  rows.sort((a, b) => a.totalGross - b.totalGross);

  // Assign positions (handle ties)
  let pos = 1;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && rows[i].totalGross > rows[i - 1].totalGross) {
      pos = i + 1;
    }
    rows[i].pos = pos;
  }

  return rows;
}
