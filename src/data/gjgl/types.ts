/**
 * types.ts — Formatos dos ficheiros GJGL (catálogo, índice slim, detalhe por
 * torneio) e dos overrides de campo/distâncias dos eventos em Portugal.
 *
 * Tirado da GlobalJuniorPage a 23/10/2026 (fase 5 do plano) — igual ao que estava lá.
 */
/* ── Types ────────────────────────────────────────────────────────── */
export interface CatalogEntry {
  year: number;
  slug: string;
  title: string;
  country: string;
  section: string;
  gjgl_tournamentid?: number;
}
export interface Catalog {
  generated_at?: string;
  tournaments: CatalogEntry[];
}
/** Índice slim (gjgl-index.json) — metadados leves p/ sidebar+header sem
 *  descarregar os ficheiros pesados. Gerado por scripts/build-gjgl-index.js. */
export interface GjglIndexTournament {
  tournament: string | null;
  year: number | null;
  country: string | null;
  section: string | null;
  start_date: string | null;
  end_date: string | null;
  course: string | null;
  rounds: number | null;
  parTotal: number | null;
  tour_url: string | null;
  livescoring_url: string | null;
  entrylist_url: string | null;
  divisions: { ak: number; ageGroup: string; players: number }[];
  playerCount: number;
  hasManuel?: boolean;
  hasPt?: boolean;
}
export interface GjglIndex {
  generated_at?: string;
  tournaments: Record<string, GjglIndexTournament>;
}
export interface GjglRound {
  day: number;
  scores: (number | null)[] | null;
  par: (number | null)[] | null;
  gross: number | null;
  parTotal?: number;
}
export interface GjglPlayer {
  pos: number | null;
  tiedFlag?: boolean;
  country: string | null;
  countryGif?: string | null;
  gender?: "m" | "f" | null;
  name: string;
  playerKey?: string;
  club?: string | null;
  hcp?: number | null;
  hcpRaw?: string | null;
  gradYear?: number | null;
  birthYearEst?: number | null;
  hole?: number | null;
  toPar?: number | string | null;
  total: number | null;
  ageGroup?: string | null;
  rounds?: GjglRound[];
}
export interface GjglDivision {
  ak: number;
  ageGroup: string;
  players: GjglPlayer[];
}
export interface GjglData {
  tournament: string;
  slug: string;
  year: number;
  country: string;
  section: string;
  tour_url: string;
  livescoring_url: string;
  gjgl_tournamentid: number;
  start_date: string | null;
  end_date: string | null;
  course?: string | null;
  rounds: number;
  par: number[] | null;
  parTotal: number | null;
  divisions: GjglDivision[];
}

/* ── Overrides de campo/distâncias (eventos jogados em Portugal) ───────
 * O GJGL não publica distâncias; para os eventos PT o
 * build-gjgl-course-overrides.js extrai campo + tee + metros/SI por buraco
 * das voltas WHS dos federados FPG que lá jogaram (por sexo). */
export interface GjglTeeOverride { tee: string; metersTotal: number; meters: number[]; si?: number[] }
export interface GjglCourseOverride { course: string; evidence: string; note?: string; tees: Partial<Record<"M" | "F", GjglTeeOverride>> }
export type GjglOverrides = Record<string, GjglCourseOverride>;
