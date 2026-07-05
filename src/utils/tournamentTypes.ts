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

interface HoleInfo {
  h: number;
  par: number;
  si: number;
  m: number;
}

interface CourseInfo {
  par: number;
  cr: number;
  slope: number;
  holes: HoleInfo[];
}

interface DrawEntry {
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

interface ResultEntry {
  pos: number | null;
  name: string;
  fed: string | null;
  club: string;
  toPar: number | null;
  gross: number | null;
  total: number | null;
  status: string;
}

interface PlayerHoles {
  fed: string | null;
  name: string;
  holes: (number | null)[];
  gross: number;
}

/* ── Category config ── */

interface TournCategory {
  key: string;           // "wagr", "sub14", "sub12"
  label: string;         // "WAGR", "Sub-14", "Sub-12"
  days: number;          // quantos dias joga esta categoria
  tee: string;           // tee default: "Brancas", "Amarelas", "Vermelhas"
  courseData: CourseInfo; // CR/Slope/Holes para esta categoria
}

/* ── Tee ratings (por combinação tee+sex) ── */

interface TeeRating {
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
