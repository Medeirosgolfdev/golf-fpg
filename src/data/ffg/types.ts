/**
 * types.ts — Formatos das fontes de França: GolfGenius (1 torneio = 1 ficheiro +
 * catálogo), LGPIDF (PDFs Paris-Île-de-France), portal FFG Resultats e as
 * catégories d'âge (Vademecum).
 *
 * Tirado da FFGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import type { MatchplayFile } from "../../ui/circuit/matchplayTypes";
import type { CircuitEntry } from "../../ui/circuit/types";

/* ── Tipos do ficheiro novo (1 torneio = 1 ficheiro) ──────────── */
export interface CourseInfo {
  name: string;
  tee?: string;
  par: number[];
  meters: number[];
  si: number[];
  parTotal: number;
  metersTotal: number;
  /** CR/Slope para o SD quando a FFG não os publica (`ffgolf-course-overrides.json`). */
  courseRating?: number;
  slope?: number;
  /** PCC por dia (índice = volta − 1). */
  pcc?: (number | null)[];
  ratingEstimado?: boolean;
  ratingNota?: string;
}
export interface PlayerRound {
  round: number;
  gross: number;
  scores: number[];
  f9?: number;
  b9?: number;
}
export interface FFGPlayer {
  id: string;
  pos: number | null;
  name: string;
  country: string;
  club: string;
  hcp: number | null;
  total: number | null;
  toPar: number | null;
  roundScores?: number[];   // novo formato genérico [r1, r2, ..., rN]
  /** legacy: alguns ficheiros antigos têm r1/r2 directos */
  r1?: number | null;
  r2?: number | null;
  rounds: PlayerRound[];
}
export interface FFGTournament {
  tournament: string;
  slug: string;
  year: number;
  section: string;
  source: string;
  gg_page: string;
  gg_league?: string;
  course: CourseInfo;
  rounds: number;
  format: string;
  /** Nomes das divisões do torneio (o scraper emite-os; ficheiros antigos não têm). */
  divisions?: string[];
  /** Datas do evento, derivadas das rondas. Ficheiros antigos não as têm. */
  dateStart?: string | null;
  dateEnd?: string | null;
  /** Tee sheet do GolfGenius (scrape-ffgolf-gg-teesheet.js). */
  draws?: FFGDrawRound[];
  players: FFGPlayer[];
  /** Vista por evento do dropdown GG (scrape-ffgolf.js rota Playwright). Nos
   *  eventos match play, `players` são os VENCEDORES dessa eliminatória. */
  events?: Array<{ id?: string; name: string; format: string; players?: Array<{ name: string }> }>;
  /** Bracket knockout completo (scrape-ffgolf.js — fetchBracket), já no schema
   *  MatchplayFile: winners, resultados ("2 & 1") e estado buraco-a-buraco. */
  matchplay?: MatchplayFile;
  /** Resultados dos jogos de match play lidos à mão do GolfGenius quando o
   *  scraper não os apanhou (`ffgolf-matchplay-overrides.json`). */
  _mpResults?: { round: string; a: string; b: string; result: string; winner: string }[];
  scrapedAt?: string;
}

export interface FFGDrawPlayer {
  name: string;
  hcp: number | null;
  club: string | null;
  tee: string | null;
}
export interface FFGDrawGroup {
  teeTime: string;
  players: FFGDrawPlayer[];
}
export interface FFGDrawRound {
  round: number;
  label: string | null;
  dateIso: string | null;
  course: string | null;
  tee: string | null;
  groups: FFGDrawGroup[];
}

export interface CatalogEntry {
  year: number;
  section: string;
  slug: string;
  /** Pode faltar em entradas descobertas sem página de scores — ver entryTitle(). */
  title?: string;
  gg_page: string | null;
  gg_league: string | null;
  ffgolf_url?: string;
  ffgolf_scores_url?: string;
}
export interface Catalog {
  generated_at: string;
  source?: string;
  note?: string;
  tournaments: CatalogEntry[];
}

/* ── Tipos LGPIDF (PDFs Paris-Île-de-France) ──────────────────── */
export interface LGPIDFInscrito {
  rank: number | null;
  scratch?: boolean;
  nationality?: string;
  name: string;
  club: string;
  category?: string;
  hcp: number | null;
  meriteSpiRaw?: string | null;
  wildCard?: boolean;
  registered?: boolean;
}
export interface LGPIDFInscritosPdf {
  pdfKind: string;
  pdfFilename: string;
  pdfUrl: string;
  category?: string;
  players: LGPIDFInscrito[];
}
export interface LGPIDFTeeTimePlayer {
  name: string;
  hcp?: number;
  playHcp?: number;
  category?: string | null;
  club?: string;
  teeTime?: string | null;
  startHole?: number | null;
}
export interface LGPIDFTeeTimeGroup {
  groupNumber: number;
  players: LGPIDFTeeTimePlayer[];
}
export interface LGPIDFTeeTimePdf {
  pdfKind: string;
  pdfFilename: string;
  pdfUrl: string;
  groups: LGPIDFTeeTimeGroup[];
}
export interface LGPIDFCourseHole {
  hole: number;
  distance: number;
  unit: string;
  entrySide: string;
  rawDigits?: string;
}
export interface LGPIDFCourseMapPdf {
  pdfFilename: string;
  pdfUrl: string;
  holes: LGPIDFCourseHole[];
}
export interface LGPIDFCourse {
  category?: string;
  pdfKind?: string;
  pdfFilename?: string;
  pdfUrl?: string;
  parser?: string;
  players: Array<{
    pos?: number | null;
    prix?: number | null;
    name: string;
    club?: string;
    hcp?: number | null;
    r1?: number | null;
    r2?: number | null;
    total?: number | null;
    dnf?: boolean;
    division?: string;
  }>;
}
export interface LGPIDFAllPdf {
  kind: string;
  filename: string;
  url: string;
  localPath?: string;
  category?: string;
}
export interface LGPIDFTournament {
  tournament: string;
  slug: string;
  year: number;
  section: string;
  source: string;
  scrapedAt?: string;
  courseLevel?: string;
  course?: CourseInfo;
  dateStart?: string | null;
  dateEnd?: string | null;
  rounds: number;
  format?: string;
  divisions?: string[];
  courses: LGPIDFCourse[];
  teeTimePdfs: LGPIDFTeeTimePdf[];
  courseMapPdfs: LGPIDFCourseMapPdf[];
  inscritosPdfs: LGPIDFInscritosPdf[];
  allPdfs?: LGPIDFAllPdf[];
  players: Array<{
    pos?: number | null;
    name: string;
    club?: string;
    division?: string;
    country?: string;
    hcp?: number | null;
    r1?: number | null;
    r2?: number | null;
    total?: number | null;
    dnf?: boolean;
  }>;
}
export interface LGPIDFIndexEntry {
  file: string;
  slug: string;
  year: number;
  tournament: string;
  section: string;
  source: string;
  divisions: string[];
  rounds: number;
  inscritosCount: number;
  playersCount: number;
  teeTimePdfsCount: number;
  courseMapPdfsCount: number;
  scrapedAt?: string;
}
export interface LGPIDFIndex {
  generatedAt: string;
  source: string;
  total: number;
  tournaments: LGPIDFIndexEntry[];
}

/* ── Tipos FFG Resultats (sistema central da FFG, todas as ligas) ── */
export interface FFGResPlayer {
  classement: string | null;
  pos: number | null;
  flag: string;
  name: string;
  nameNom?: string | null;
  namePrenom?: string | null;
  sex?: string | null;
  nationality?: string | null;
  license?: string | null;
  glfLic?: string | null;
  hcp: number | null;
  club: string;
  region?: string | null;
  teeTime?: string | null;
  statusR1?: string | null;
  statusR2?: string | null;
  statusR3?: string | null;
  statusR4?: string | null;
  t1: number | null;
  t2: number | null;
  t3: number | null;
  t4: number | null;
  total: number | null;
  scoresR1?: number[] | null;
  scoresR2?: number[] | null;
  scoresR3?: number[] | null;
  scoresR4?: number[] | null;
}
export interface FFGResSerie {
  serieId: string;
  label: string | null;
  courseTerrain?: string | null;
  parString?: string | null;
  parPerHole?: number[] | null;
  parTotal?: number | null;
  glfOrg?: string | null;
  players: FFGResPlayer[];
}
/** Cartão de uma série de um torneio do portal FFG (`ffgolf-course-overrides.json` →
 *  `resultats`). `tee` é o nome mostrado na linha de metros — nos GP Jeunes é muitas
 *  vezes uma MISTURA de tees («misto: Azuis + Vermelhas»), detalhada em `teePorBuraco`. */
export interface FFGSerieCourse {
  tee: string;
  misto?: boolean;
  par: number[];
  meters: number[];
  metersTotal?: number;
  teePorBuraco?: string[];
  nota?: string;
  /** S.I. dos buracos (quando a Liga não o publica: o cartão FFG de um jogador). */
  si?: number[];
  /** CR/Slope do tee desta série — publicados, ou ESTIMADOS (`ratingEstimado`,
   *  explicados em `ratingNota`: deduzidos de SD oficiais importados pela FPG). */
  courseRating?: number;
  slope?: number;
  ratingEstimado?: boolean;
  ratingNota?: string;
}

/** «U12G»/«U12 G»/«BG»/«MF» → chave única U12G/U14G/U16F… (BG/BF = Benjamins = U14,
 *  MG/MF = Minimes = U16 — os GP Jeunes usam as duas grafias). */

export interface FFGResTournament {
  trnId: string;
  partKey: string;
  name: string;
  formule: string;
  date: string;
  /** Enriquecimento com metros/SI vindos do scrape GolfGenius (course statistics widget).
   *  Injectado pelo load effect quando há um ficheiro `public/data/ffgolf/{year}_{slug}.json`
   *  correspondente. Quando presente, o adapter `ffgResToFPGTournament` usa-o para
   *  popular RoundScore.meters e RoundScore.si na vista hole-by-hole.
   *  `courses` contém todas as variantes de tee (ex: Black/Garçons, Blue/Filles) — o
   *  adapter selecciona o tee certo pela maioria de sex da série. */
  _ggCourse?: { par: number[]; meters: number[]; si: number[]; parTotal?: number; metersTotal?: number; name?: string;
                courses?: Array<{ teeName?: string; par: number[]; meters: number[]; si: number[]; parTotal?: number; metersTotal?: number }> } | null;
  /** Distâncias POR SÉRIE vindas de `ffgolf-course-overrides.json` → `resultats[trnId].series`
   *  (marcas jovens publicadas pela Liga/clube, ex.: GP Jeunes de Rennes 2026). Chave
   *  normalizada por `serieCourseKey`. Ganha ao `_ggCourse` na série a que se aplica. */
  _serieCourses?: Record<string, FFGSerieCourse> | null;
  details: {
    trnId: string;
    series: FFGResSerie[];
    rawDates?: { start: string; end: string } | null;
    rawTitle?: string | null;
    rawCourse?: string | null;
  };
}
export interface FFGResIndexEntry {
  file: string;
  trnId: string;
  /** Chave do deep-link GET do portal: resultats-details/{partKey}/{trnId}. */
  partKey?: string | null;
  name: string;
  formule: string;
  date: string;
  dateIso: string | null;
  year: number | null;
  typeCompetition: string;
  ligue: string;
  /** Todas as ligas onde o torneio aparece no portal (dedup do build). */
  ligues?: string[];
  seriesCount: number;
  totalPlayers: number;
  /** Campo(s) do torneio — courseTerrain do detalhe, sem prefixo "(FFG)". */
  course?: string | string[] | null;
  /** Sexo agregado dos jogadores: "M", "F" ou "MF" (misto). Da fonte, não inferido. */
  sex?: "M" | "F" | "MF" | null;
  /** Nº de rondas efectivamente jogadas (maior índice com score/estado). */
  roundsPlayed?: number | null;
  divisions: { serieId: string; label: string | null; players: number }[];
  // Links cruzados pelo build-ffgolf-resultats-index.js (a partir do catálogo).
  pagesFfgolfUrl?: string | null;
  ffgolfOfficialUrl?: string | null;
  ggPage?: string | null;
  ffgolfSlug?: string | null;
  ffgolfSection?: string | null;
}
export interface FFGResIndex {
  generatedAt: string;
  source: string;
  total: number;
  tournaments: FFGResIndexEntry[];
}

/* ── Tipos FFG categorias de idade (Vademecum) ──────────────── */
export interface FFGAgeCategory {
  name: string;
  millesime: string;
  age: string;
  intl: string;
  subIntl: string;
}
export interface FFGCategoriesData {
  _source: string;
  _vademecumUrl: string;
  _vademecumNote?: string;
  categories: FFGAgeCategory[];
  distancesParCategorie?: {
    _source?: string;
    _extractedAt?: string;
    _note?: string;
    matches?: Record<string, { trous: number; Garcons: number; Filles: number }>;
    _status?: string;
  };
}

/* ── Índice da lista da /ffg (GolfGenius + LGPIDF), gerado no build ── */
/** Uma entrada da lista sem as divisões: o que a sidebar e os filtros leem
 *  (incluindo `hasPt`/`hasAce`/`escalao`, calculados das divisões no build). */
export type FfgListMeta = Omit<CircuitEntry, "divisions" | "loadDivisions">;
/** Um torneio GolfGenius (1 ou vários escalões fundidos) ou LGPIDF: os metadados
 *  e o que é preciso para carregar o detalhe quando se abre. */
export interface FfgListItem {
  entry: FfgListMeta;
  /** GolfGenius: os escalões (um ficheiro `ffgolf/{year}_{slug}.json` de public/data cada). */
  gg?: CatalogEntry[];
  /** LGPIDF: o torneio (ficheiro `ffgolf/{file}` de public/data). */
  lgpidf?: LGPIDFIndexEntry;
}
/** `/data/ffg-list-index.json` — gerado por `scripts/build-ffg-list-index.js`
 *  no predev/prebuild (fora do git). */
export interface FfgListIndex {
  _gerado: string;
  items: FfgListItem[];
}
