/**
 * dataRegistry.ts — Registo Central de Fontes de Dados
 *
 * Cobre TODOS os ficheiros JSON do projecto golf-fpg.
 * Para cada fonte documenta:
 *   • URL de origem / script que gera o ficheiro
 *   • Loader TypeScript que o lê
 *   • Estrutura completa: todos os campos disponíveis por jogador
 *   • Campos de data e respectivos formatos
 *   • Como usar para leaderboard (pos, name, gross, toPar, rondas)
 *   • Como usar para scorecard buraco-a-buraco (scores[], par[], SI[], metros[])
 *
 * As constantes FILE_* são a única fonte de verdade para paths —
 * importar daqui em vez de ter strings hard-coded nas páginas.
 *
 * ─────────────────────────────────────────────────────────────────
 * ÍNDICE
 *   1. Constantes de path (FILE_*)
 *   2. Interfaces de metadados
 *   3. Registo completo (DATA_REGISTRY)
 *      3.1  master-courses.json
 *      3.2  players.json
 *      3.3  away-courses.json
 *      3.4  course-aliases.json
 *      3.5  pull-torneios NNN.json
 *      3.6  drive-data.json
 *      3.7  aquapor-data.json
 *      3.8  drive-sd-lookup.json
 *      3.9  melhorias.json
 *      3.10 BJGT / WJGC (bluegolf-wjgc)
 *      3.11 EOWAGR contests (bluegolf-contest)
 *      3.12 ftm_doral_*.json
 *      3.13 uskids-results.json
 *      3.14 uskids_torneios_completos(N).json
 *      3.15 uskids-field.json
 *      3.16 rivals-intl.json
 *      3.17 torneio-greatgolf.json
 *      3.18 tournament-links.json
 *      3.19 /{nfed}/analysis/data.json
 *      3.20 extraCourses.ts (TypeScript hardcoded)
 *   4. Helpers de lookup
 * ─────────────────────────────────────────────────────────────────
 */

/* ══════════════════════════════════════════════════════════════════
   1. CONSTANTES DE PATH
   ══════════════════════════════════════════════════════════════════ */

const BASE = "/data/";

// Campos e jogadores (pipeline local)
export const FILE_MASTER_COURSES   = `${BASE}master-courses.json`;
export const FILE_PLAYERS          = `${BASE}players.json`;
export const FILE_AWAY_COURSES     = `${BASE}away-courses.json`;
export const FILE_COURSE_ALIASES   = `${BASE}course-aliases.json`;
export const FILE_TOURNAMENT_LINKS = `${BASE}tournament-links.json`;

// Melhorias / rondas extra
export const FILE_MELHORIAS = `${BASE}melhorias.json`;

// Torneios FPG (série sequencial 000, 001 …)
export const FILE_PULL_TORNEIOS = (idx: number) =>
  `${BASE}pull-torneios${String(idx).padStart(3, "0")}.json`;

// DRIVE e AQUAPOR
export const FILE_DRIVE_DATA      = `${BASE}drive-data.json`;
export const FILE_AQUAPOR_DATA    = `${BASE}aquapor-data.json`;
export const FILE_DRIVE_SD_LOOKUP = `${BASE}drive-sd-lookup.json`;

// BJGT / WJGC / EOWAGR (BluGolf scrapeados)
// (bjgt_vp_field_2025.json foi movido para data-archive/ — fora do deploy)
export const FILE_WJGC_2025_B89     = `${BASE}wjgc_2025_b89.json`;
export const FILE_WJGC_2025_B1011   = `${BASE}wjgc_2025_b1011.json`;
export const FILE_WJGC_2026_B1011   = `${BASE}wjgc_2026_b1011.json`;
export const FILE_WJGC_2026_B1213   = `${BASE}wjgc_2026_b1213.json`;
export const FILE_EOWAGR_2025_B78   = `${BASE}eowagr25_contest121.json`;
export const FILE_EOWAGR_2025_B910  = `${BASE}eowagr25_contest13.json`;
export const FILE_EOWAGR_2025_B1112 = `${BASE}eowagr25_scorecards.json`;  // tem scores[]
export const FILE_EOWAGR_2025_B1314 = `${BASE}eowagr25_contest77.json`;

// Doral (First Tee Media)
export const FILE_DORAL_2025 = `${BASE}ftm_doral_2025.json`;
export const FILE_DORAL_2024 = `${BASE}ftm_doral_2024.json`;
export const FILE_DORAL_2023 = `${BASE}ftm_doral_2023.json`;
export const FILE_DORAL_2022 = `${BASE}ftm_doral_2022.json`;
export const FILE_DORAL_2021 = `${BASE}ftm_doral_2021.json`;
export const FILE_DORAL_2020 = `${BASE}ftm_doral_2020.json`;
export const FILE_DORAL_2019 = `${BASE}ftm_doral_2019.json`;
export const FILE_DORAL_2018 = `${BASE}ftm_doral_2018.json`;

// USKids
export const FILE_USKIDS_RESULTS   = `${BASE}uskids-results.json`;
export const FILE_USKIDS_FIELD     = `${BASE}uskids-field.json`;
export const FILE_USKIDS_DISCOVERY = `${BASE}uskids-discovery-cache.json`;
export const FILE_USKIDS_RIVALS    = `${BASE}rivals-intl.json`;
export const FILE_USKIDS_COMPLETO  = (n: number) =>
  `${BASE}uskids_torneios_completos(${n}).json`;  // n = 1..15

// Outros internacionais
export const FILE_GREATGOLF = `${BASE}torneio-greatgolf.json`;

// Perfil por jogador
export const FILE_PLAYER_DATA = (nfed: string) => `/${nfed}/analysis/data.json`;
// Tabela global de jogadores (CROSS_DATA) — UMA cópia partilhada por todas as
// fichas desde 2026-09-06; antes vinha embutida em cada data.json.
export const FILE_CROSS_DATA = `${BASE}cross-data.json`;


/* ══════════════════════════════════════════════════════════════════
   2. INTERFACES DE METADADOS
   ══════════════════════════════════════════════════════════════════ */

export type DataOrigin =
  | "fpg-website"
  | "bluegolf-website"
  | "firstteemedia"
  | "uskids-website"
  | "pipeline-local"
  | "manual";

export type DataFormat =
  | "fpg-pull"
  | "bluegolf-wjgc"
  | "bluegolf-contest"
  | "ftm-doral"
  | "uskids-results"
  | "uskids-completo"
  | "uskids-field"
  | "fpg-master"
  | "fpg-players"
  | "fpg-player-json"
  | "melhorias"
  | "course-aliases"
  | "sd-lookup"
  | "generic-json";

export interface DateInfo {
  fields: string[];
  format: string;
  notes?: string;
}

export interface LeaderboardShape {
  posField:             string | null;
  nameField:            string | null;
  grossField:           string | null;
  toParField:           string | null;
  roundsField:          string | null;
  extraPlayerFields?:   string[];
  posCalcNote?:         string;
}

export interface ScorecardShape {
  available:    boolean;
  scoresPath?:  string;
  parPath?:     string;
  siPath?:      string;
  metersPath?:  string;
  crPath?:      string;
  slopePath?:   string;
  notes?:       string;
}

export interface DataSourceMeta {
  id:           string;
  label:        string;
  files:        string | string[] | ((id: any) => string);
  origin:       DataOrigin;
  sourceUrl?:   string;
  generatedBy?: string;
  loader:       string;
  format:       DataFormat;
  dates:        DateInfo;
  leaderboard:  LeaderboardShape | null;
  scorecard:    ScorecardShape;
  usedBy:       string[];
  structure:    string;
}


/* ══════════════════════════════════════════════════════════════════
   3. REGISTO COMPLETO
   ══════════════════════════════════════════════════════════════════ */

export const DATA_REGISTRY: DataSourceMeta[] = [

  // ─────────────────────────────────────────────────────────────
  // 3.1  master-courses.json
  // ─────────────────────────────────────────────────────────────
  {
    id: "master-courses",
    label: "Campos FPG — Master Courses",
    files: FILE_MASTER_COURSES,
    origin: "pipeline-local",
    generatedBy: "pipeline.js → process-data.js",
    loader: "src/data/loader.ts → loadMasterData()",
    format: "fpg-master",
    dates: {
      fields: ["meta.generatedAt"],
      format: "ISO 8601",
      notes: "Data de geração do ficheiro, não de jogo",
    },
    leaderboard: null,
    scorecard: {
      available: true,
      parPath:    "courses[].master.tees[].holes[].par",
      siPath:     "courses[].master.tees[].holes[].si",
      metersPath: "courses[].master.tees[].holes[].distance",
      crPath:     "courses[].master.tees[].ratings.holes18.courseRating",
      slopePath:  "courses[].master.tees[].ratings.holes18.slopeRating",
    },
    usedBy: ["CamposPage", "JogadoresPage", "FPGPage", "CalendarioPage"],
    structure: `
{ meta: { version, generatedAt, stats: { courses, tees, teesComplete18 } },
  courses: Course[] }

Course = { courseKey: string, master: CourseMaster }

CourseMaster = {
  courseId, name, country?,
  numbers?: { fpg: string, scorecards: string },  // ← IDs internos (ex: "077-1")
  links:    { fpg: string|null, scorecards: string|null },
  tees: Tee[]
}

Tee = {
  teeId, sex: "M"|"F"|"U", teeName,
  scorecardMeta?: { teeColor, teeIndex?, teeOrder? },
  ratings: {
    holes18?:     { par, courseRating, slopeRating },
    holes9Front?: { par, courseRating, slopeRating },
    holes9Back?:  { par, courseRating, slopeRating }
  },
  holes: Hole[],
  distances: { total, front9, back9, holesCount, complete18 }
}

Hole = { hole: 1..18, par: number|null, si: number|null, distance: number|null }

→ distance são METROS por buraco
→ ratings.holes18 dá CR/Slope para cálculo WHS/SD`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.2  players.json
  // ─────────────────────────────────────────────────────────────
  {
    id: "players",
    label: "Jogadores FPG",
    files: FILE_PLAYERS,
    origin: "fpg-website",
    sourceUrl: "https://federacao-portuguesa-golfe.pt",
    generatedBy: "update-jogadores.js",
    loader: "src/data/loader.ts → loadPlayers()",
    format: "fpg-players",
    dates: {
      fields: ["[nfed].dob", "[nfed].lastRound"],
      format: "YYYY-MM-DD (dob) | DD-MM-YYYY (lastRound)",
    },
    leaderboard: null,
    scorecard: { available: false },
    usedBy: ["JogadoresPage", "FPGPage", "CalendarioPage", "SimuladorPage"],
    structure: `
Record<nfed: string, Player>

Player = {
  name, nfed, dob,
  sex:     "M"|"F"|"U",
  hcp:     number|null,
  escalao: string,           // "Sub-12", "Sub-14", "Absoluto", …
  club:    { code, short, long } | string,
  region:  string,
  tags:    string[],         // "no-priority", "hidden", …
  altNames: string[],
  extra:   Record<string, unknown>,
  lastRound?: string         // "DD-MM-YYYY"
}`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.3  away-courses.json
  // ─────────────────────────────────────────────────────────────
  {
    id: "away-courses",
    label: "Campos Internacionais (Away)",
    files: FILE_AWAY_COURSES,
    origin: "pipeline-local",
    generatedBy: "pipeline.js → extract-courses.js",
    loader: "src/data/loader.ts → loadAwayCourses()  [retorna [] se ausente]",
    format: "fpg-master",
    dates: {
      fields: ["courses[].master._players (valor = data última ronda por nfed)"],
      format: "YYYY-MM-DD",
    },
    leaderboard: null,
    scorecard: {
      available: true,
      parPath:    "courses[].master.tees[].holes[].par",
      siPath:     "courses[].master.tees[].holes[].si",
      metersPath: "courses[].master.tees[].holes[].distance",
      crPath:     "courses[].master.tees[].ratings.holes18.courseRating",
      slopePath:  "courses[].master.tees[].ratings.holes18.slopeRating",
    },
    usedBy: ["CamposPage"],
    structure: `
Idêntico a master-courses mas sem \`numbers\` nem \`country\` em master, e com:
  Course.master._players?: Record<nfed, string|null>
    → valor = "YYYY-MM-DD" da última ronda desse jogador no campo`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.4  course-aliases.json
  // ─────────────────────────────────────────────────────────────
  {
    id: "course-aliases",
    label: "Aliases e Normalização de Nomes de Campo",
    files: FILE_COURSE_ALIASES,
    origin: "pipeline-local",
    generatedBy: "merge-courses.js",
    loader: "Pipeline interno — não lido pela app React",
    format: "course-aliases",
    dates: { fields: [], format: "N/A" },
    leaderboard: null,
    scorecard: { available: false },
    usedBy: ["pipeline (extract-courses.js, process-data.js)"],
    structure: `
{
  _note:         string,
  aliases:       Record<string, string>,   // nome normalizado → nome canónico
  nameOverrides: Record<string, string>,   // courseKey → nome display
  skipped:       string[],
  ptVariants:    Record<string, string>
}`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.5  pull-torneios NNN.json  (torneios FPG federados)
  // ─────────────────────────────────────────────────────────────
  {
    id: "pull-torneios",
    label: "Torneios FPG Federados (série pull-torneios)",
    files: FILE_PULL_TORNEIOS,
    origin: "fpg-website",
    sourceUrl: "https://federacao-portuguesa-golfe.pt/competicoes",
    generatedBy: "pull-torneios.js / update-torneios.js",
    loader: "src/pages/FPGPage.tsx (fetch sequencial 000, 001…)\n" +
            "src/data/KIDSdataLoader.ts → processPullTorneios()",
    format: "fpg-pull",
    dates: {
      fields: ["tournaments[].date"],
      format: "YYYY-MM-DD",
      notes: "Data de início do torneio.",
    },
    leaderboard: {
      posField:    "tournaments[].players[].pos",
      nameField:   "tournaments[].players[].name",
      grossField:  "tournaments[].players[].grossTotal",
      toParField:  "tournaments[].players[].toPar",
      roundsField: "tournaments[].players[].roundScores[].gross",
      extraPlayerFields: [
        "scoreId       — ID único da ronda",
        "fedCode       — nfed do jogador",
        "hcpExact      — handicap exacto no dia",
        "hcpPlay       — handicap de jogo (arredondado)",
        "course        — nome do campo",
        "courseRating  — CR da tee jogada",
        "slope         — slope da tee",
        "teeName       — nome da tee",
        "nholes        — 9 ou 18",
        "parTotal      — par total do percurso",
      ],
      posCalcNote:
        "pos pré-calculado (vem já resolvido no JSON).",
    },
    scorecard: {
      available: true,
      scoresPath:  "tournaments[].players[].roundScores[].scores",
      parPath:     "tournaments[].players[].roundScores[].pars",
      siPath:      "tournaments[].players[].roundScores[].si",
      metersPath:  "tournaments[].players[].roundScores[].meters",
      crPath:      "tournaments[].players[].roundScores[].courseRating",
      slopePath:   "tournaments[].players[].roundScores[].slope",
      notes:
        "scores/pars/si/meters são arrays[18]. " +
        "roundScores[].round é 1-based. " +
        "Formato antigo (single-round): player.scores[], player.par[], etc. (flat).",
    },
    usedBy: ["FPGPage", "KIDSdataLoader", "KIDSPage", "CalendarioPage"],
    structure: `
{ tournaments: TournamentEntry[] }

TournamentEntry = {
  name, ccode, tcode, date,   // "YYYY-MM-DD"
  campo, clube?, circuit?, series?,
  players: PlayerEntry[]
}

PlayerEntry = {
  scoreId, pos, name, club,
  grossTotal: number|string|null,
  toPar:      number|string|null,
  fedCode?,          // nfed
  hcpExact?,         // hcp exacto
  hcpPlay?,          // hcp de jogo
  course?,           // nome do campo
  courseRating?,     // CR
  slope?,
  teeName?,
  nholes?,           // 9 ou 18
  parTotal?,         // par do percurso
  // Formato antigo flat (single-round):
  scores?:  number[18],
  par?:     number[18],
  si?:      number[18],
  meters?:  number[18],
  // Formato novo multi-round:
  roundScores?: RoundScore[]
}

RoundScore = {
  round:         number,      // 1-based
  gross:         number,
  scores:        number[18],  // resultado por buraco
  pars:          number[18],  // par por buraco
  si:            number[18],  // stroke index
  meters:        number[18],  // distância em metros
  courseRating?: number,
  slope?:        number,
  teeName?:      string,
  teeColorId?:   number
}

Para torneio local com categorias (WAGR/Sub14/Sub12):
  normalizeTournament(raw) → NormalizedTournament
  .results[catKey][dayKey]: ResultEntry[]
  .draws[catKey][dayKey]:   DrawEntry[]
  .manualHoles[catKey][dayKey][playerKey]: PlayerHoles`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.6  drive-data.json
  // ─────────────────────────────────────────────────────────────
  {
    id: "drive-data",
    label: "DRIVE Tour & Challenge 2026",
    files: FILE_DRIVE_DATA,
    origin: "fpg-website",
    sourceUrl: "https://federacao-portuguesa-golfe.pt/competicoes",
    generatedBy: "scrape-drive-aquapor-v7.js",
    loader: "src/pages/DrivePage.tsx",
    format: "fpg-pull",
    dates: {
      fields: ["lastUpdated", "tournaments[].date"],
      format: "tournaments[].date: YYYY-MM-DD",
    },
    leaderboard: {
      posField:    "tournaments[].players[].pos",
      nameField:   "tournaments[].players[].name",
      grossField:  "tournaments[].players[].grossTotal",
      toParField:  "tournaments[].players[].toPar",
      roundsField: "tournaments[].players[].roundScores[].gross",
      extraPlayerFields: [
        "scoreId", "fedCode (nfed)", "hcpExact", "hcpPlay",
        "courseRating", "slope", "teeName", "nholes", "parTotal",
        "_incomplete (bool — não completou todas as rondas)",
        "_roundsPlayed (int)",
      ],
    },
    scorecard: {
      available: true,
      scoresPath:  "tournaments[].players[].roundScores[].scores",
      parPath:     "tournaments[].players[].roundScores[].pars",
      siPath:      "tournaments[].players[].roundScores[].si",
      metersPath:  "tournaments[].players[].roundScores[].meters",
      crPath:      "tournaments[].players[].roundScores[].courseRating",
      slopePath:   "tournaments[].players[].roundScores[].slope",
    },
    usedBy: ["DrivePage"],
    structure: `
DriveData = {
  lastUpdated, source,
  circuit: "drive",          // ← campo na raíz do ficheiro
  totalTournaments, totalPlayers, totalScorecards,
  tournaments: Tournament[]
}

Tournament (= pull-torneios + series/region/escalao/num):
  series:  "tour" | "challenge",   // ← campo por torneio
  region:  string,
  escalao: string|null,
  num:     number,
  rounds?: number
  // NÃO tem _multiGroup/_roundLabel/_isIncomplete nem circuit por torneio

Player (= pull-torneios PlayerEntry; sem _incomplete/_roundsPlayed)
  fed?: string   // raro

RoundScore = idêntico a pull-torneios`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.7  aquapor-data.json
  // ─────────────────────────────────────────────────────────────
  {
    id: "aquapor-data",
    label: "Circuito Nacional AQUAPOR 2026",
    files: FILE_AQUAPOR_DATA,
    origin: "fpg-website",
    sourceUrl: "https://federacao-portuguesa-golfe.pt/competicoes",
    generatedBy: "scrape-drive-aquapor-v7.js",
    loader: "src/pages/DrivePage.tsx (merged com series='aquapor')",
    format: "fpg-pull",
    dates: {
      fields: ["tournaments[].date"],
      format: "YYYY-MM-DD",
    },
    leaderboard: {
      posField:    "tournaments[].players[].pos",
      nameField:   "tournaments[].players[].name",
      grossField:  "tournaments[].players[].grossTotal",
      toParField:  "tournaments[].players[].toPar",
      roundsField: "tournaments[].players[].roundScores[].gross",
    },
    scorecard: {
      available: true,
      scoresPath:  "tournaments[].players[].roundScores[].scores",
      parPath:     "tournaments[].players[].roundScores[].pars",
      siPath:      "tournaments[].players[].roundScores[].si",
      metersPath:  "tournaments[].players[].roundScores[].meters",
      crPath:      "tournaments[].players[].roundScores[].courseRating",
      slopePath:   "tournaments[].players[].roundScores[].slope",
    },
    usedBy: ["DrivePage"],
    structure: `Mesmo schema de DriveData. DrivePage injeta series="aquapor" no merge.`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.8  drive-sd-lookup.json
  // ─────────────────────────────────────────────────────────────
  {
    id: "drive-sd-lookup",
    label: "Tabela SD — DRIVE",
    files: FILE_DRIVE_SD_LOOKUP,
    origin: "pipeline-local",
    generatedBy: "scrape-drive-aquapor-v7.js (gerado junto com drive-data)",
    loader: "src/pages/DrivePage.tsx (retorna {} se ausente)",
    format: "sd-lookup",
    dates: { fields: [], format: "N/A" },
    leaderboard: null,
    scorecard: { available: false },
    usedBy: ["DrivePage"],
    structure: `
Record<nfed: string, sd: number>
Exemplo: { "52884": 2.1, "12345": 5.4 }
→ SD pré-calculado para coluna SD na tabela DRIVE.`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.9  melhorias.json
  // ─────────────────────────────────────────────────────────────
  {
    id: "melhorias",
    label: "Melhorias, Rondas Extra e Treinos",
    files: FILE_MELHORIAS,
    origin: "manual",
    generatedBy: "melhorias.js (semi-automático + edição manual)",
    loader: "src/data/melhoriasLoader.ts → loadMelhorias()",
    format: "melhorias",
    dates: {
      fields: [
        "[nfed].extra_rounds[].dias[].data  (YYYY-MM-DD)",
        "[nfed].treinos[].data              (YYYY-MM-DD)",
      ],
      format: "YYYY-MM-DD",
      notes:
        "Patches a scoreIds FPG não têm campo date — " +
        "data é herdada da ronda FPG original.",
    },
    leaderboard: null,
    scorecard: {
      available: true,
      scoresPath:
        "PATCHES:    [nfed][scoreId].scorecard.gross_1..gross_18   (campos flat individuais)\n" +
        "EXTRA:      [nfed].extra_rounds[].dias[].gross_holes[]    (array)\n" +
        "TREINOS:    [nfed].treinos[].gross_holes[]                (array)",
      parPath:
        "PATCHES:    [nfed][scoreId].scorecard.par_1..par_18      (campos flat)\n" +
        "EXTRA:      [nfed].extra_rounds[].dias[].par_holes[]     (array)\n" +
        "TREINOS:    [nfed].treinos[].par_holes[]                 (array)",
      siPath:
        "PATCHES:    [nfed][scoreId].scorecard.stroke_index_1..stroke_index_18  (campos flat)\n" +
        "EXTRA:      [nfed].extra_rounds[].dias[].stroke_index_holes[]           (array, opcional)\n" +
        "TREINOS:    [nfed].treinos[].si_holes[]                                 (array, opcional)",
      metersPath:
        "PATCHES:    [nfed][scoreId].scorecard.meters_1..meters_18  (campos flat)\n" +
        "EXTRA:      [nfed].extra_rounds[].dias[].meters_holes[]    (array)",
      crPath:    "[nfed][scoreId].scorecard.course_rating",
      slopePath: "[nfed][scoreId].scorecard.slope",
      notes:
        "ATENÇÃO: nos patches de scorecard (por scoreId), os 18 valores são " +
        "campos separados gross_1..18 / par_1..18 / meters_1..18 / stroke_index_1..18 " +
        "— NÃO arrays. Nas extra_rounds e treinos vêm em arrays normais.",
    },
    usedBy: ["JogadoresPage (via playerDataLoader)", "CamposPage (via melhoriasLoader)"],
    structure: `
MelhoriasJson = { _readme?: string, [fedId]: PlayerMelhorias }

PlayerMelhorias — mistura de chaves:
  [scoreId]:       ScoreMelhoria       patch a ronda FPG existente
  _comment_X:      string              comentário humano (ignorar)
  _links_X:        MetaLinks           links + pais + pill para o bloco
  extra_rounds:    ExtraRound[]        rondas NÃO na FPG
  treinos:         Treino[]            treinos do Game Book
  [chave_custom]:  ScoreMelhoria       ronda ad-hoc (ex: "wjgc26_r1")

──────────────────────────────────────────
ScoreMelhoria (patch a scoreId FPG):
  notas?, pill?, links?, _group?, torneio_view?,
  _fpg_original?,   ← valores originais antes do patch
  _yards?,          ← dados em jardas (referência)
  whs?: { tourn_name?, course_description? }
  scorecard?: {
    tournament_description?, course_description?,
    tee_name?,
    course_rating?,           ← CR
    slope?,
    gross_total?, gross_out?, gross_in?,
    gross_1..gross_18,        ← resultado por buraco (18 campos flat)
    par_1..par_18,            ← par por buraco
    meters_1..meters_18,      ← metros por buraco
    stroke_index_1..stroke_index_18
  }

──────────────────────────────────────────
MetaLinks (_links_X):
  pais?:  string    ← propaga-se aos scorecards seguintes no ficheiro
  pill?:  string
  [key]:  string    ← URLs externos

──────────────────────────────────────────
ExtraRound (ronda não FPG):
  _comment?, torneio, campo, categoria?, pais?,
  posicao?, posicao_total?, nao_comunicado_fpg?,
  pill?, links?,
  dias: ExtraRoundDia[]

ExtraRoundDia:
  data:                 string        "YYYY-MM-DD"
  dia:                  number|string "D1", 1, …
  holes:                9|18
  hole_range?:          string        "1-9"
  par:                  number|null
  gross:                number|null
  gross_out?, gross_in?,
  par_holes?:           number[]      par por buraco
  gross_holes?:         number[]      resultado por buraco
  meters_holes?:        number[]      metros por buraco
  meters_total?:        number
  stroke_index_holes?:  number[]      SI por buraco (quando disponível)
  _yards_holes?:        number[]      jardas (fonte externa)
  _yards_total?:        number

──────────────────────────────────────────
Treino (Game Book):
  data, campo, holes, hole_range?,
  par, gross,
  par_holes?:    number[]
  gross_holes?:  number[]
  si_holes?:     number[]   ← SI disponível nos treinos!
  pm?:           string     "+2", …
  companhia?:    string
  fonte?:        string     "Game Book"`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.10  BJGT / WJGC / EOWAGR  (BluGolf — todos têm scores[] completos)
  // ─────────────────────────────────────────────────────────────
  {
    id: "bjgt-wjgc",
    label: "BJGT / WJGC / EOWAGR — Leaderboards BluGolf (todos com scorecard completo)",
    files: [
      FILE_WJGC_2025_B89,
      FILE_WJGC_2025_B1011,
      FILE_WJGC_2026_B1011,
      FILE_WJGC_2026_B1213,
      FILE_EOWAGR_2025_B78,
      FILE_EOWAGR_2025_B910,
      FILE_EOWAGR_2025_B1112,
      FILE_EOWAGR_2025_B1314,
    ],
    origin: "bluegolf-website",
    sourceUrl: "https://brjgt.bluegolf.com",
    generatedBy: "scrape-drive-aquapor-v7.js / scraper-headless.js",
    loader: "src/data/KIDSdataLoader.ts → processWjgc()\n" +
            "src/pages/BJGTPage.tsx (fetch directo)",
    format: "bluegolf-wjgc",
    dates: {
      fields: ["year (int, raíz)", "BJGTPage BJGT_TOURNAMENTS[].roundDates[]"],
      format: "'DD Mês' nos roundDates. JSON não tem campo date.",
    },
    leaderboard: {
      posField:    "players[].pos",
      nameField:   "players[].name",
      grossField:  "players[].total   (gross acumulado)",
      toParField:  "players[].result  (to-par acumulado)",
      roundsField: "players[].rounds[].gross",
      extraPlayerFields: [
        "country",
        "rounds[].day    (número ronda 1-based)",
        "rounds[].f9     (gross front 9)",
        "rounds[].b9     (gross back 9; ausente em torneios de 9 buracos)",
      ],
      posCalcNote:
        "players com rounds:[] vazio têm pos/result/total = null (não participaram).",
    },
    scorecard: {
      available: true,
      scoresPath: "players[].rounds[].scores",
      parPath:    "par[]   (array na RAÍZ — len=9 para 9 buracos, len=18 para 18 buracos)",
      siPath:     "si[]    (array[18] na raíz — AUSENTE em alguns ficheiros, ex: wjgc_2025_b89)",
      notes:
        "TODOS os ficheiros BluGolf têm scores[] por ronda (incluindo os EOWAGR de 9 buracos). " +
        "par[] e si[] estão na RAÍZ (partilhados por todos os jogadores). " +
        "category pode ser string vazia. " +
        "NÃO tem metros — usar melhorias.json ou master-courses pelo courseKey.",
    },
    usedBy: ["BJGTPage", "BJGTAnalysisPage", "KIDSdataLoader", "KIDSPage", "USKIDSPage"],
    structure: `
{
  tournament: string,
  category:   string,   ← pode ser "" (vazio)
  course:     string,
  year:       number,
  par:        number[9 ou 18],  ← RAÍZ — 9 buracos para EOWAGR B7-8/B9-10/B13-14
  parF9:      number,
  parB9:      number | null,    ← null em torneios de 9 buracos
  parTotal:   number,
  si?:        number[18],       ← RAÍZ — AUSENTE em wjgc_2025_b89 e alguns outros
  players: [{
    name, country,
    pos:    number | null,    ← null se não participou (rounds=[])
    result: number | null,    ← to-par total
    total:  number | null,    ← gross total
    rounds: [{
      day:    number,         1-based
      scores: number[9|18],   ← resultado por buraco
      f9:     number,
      b9?:    number,         ← ausente em torneios de 9 buracos
      gross:  number
    }]
  }]
}

Ficheiros e respectivos escalões:
  wjgc_2025_b89.json          — WJGC 2025 Boys 8-9 (18H, SEM si)
  wjgc_2025_b1011.json        — WJGC 2025 Boys 10-11 (18H, COM si)
  wjgc_2026_b1011.json        — WJGC 2026 Boys 10-11 (3R final, COM si)
  wjgc_2026_b1213.json        — WJGC 2026 Boys 12-13 (18H, COM si)
  eowagr25_contest121.json    — EOWAGR 2025 Boys 7-8 (9H, COM si)
  eowagr25_contest13.json     — EOWAGR 2025 Boys 9-10 (9H)
  eowagr25_scorecards.json    — EOWAGR 2025 Boys 11-12 (18H, COM si)
  eowagr25_contest77.json     — EOWAGR 2025 Boys 13-14 (18H)`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.11  (removido — todos os ficheiros BluGolf têm scores[])
  //        EOWAGR está incluído em 3.10 bjgt-wjgc
  // ─────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────
  // 3.12  ftm_doral_*.json
  // ─────────────────────────────────────────────────────────────
  {
    id: "doral",
    label: "Doral Junior Golf Classic (First Tee Media)",
    files: [
      FILE_DORAL_2025, FILE_DORAL_2024, FILE_DORAL_2023, FILE_DORAL_2022,
      FILE_DORAL_2021, FILE_DORAL_2020, FILE_DORAL_2019, FILE_DORAL_2018,
    ],
    origin: "firstteemedia",
    sourceUrl: "https://firstteemediaonline.com",
    generatedBy: "scripts/scrape-golfgenius-v3.js (config: scripts/doral-editions.json)",
    loader: "src/pages/DORALPage.tsx\nsrc/data/KIDSdataLoader.ts → processDoral()",
    format: "ftm-doral",
    dates: {
      fields: ["rounds[].date  ('Fri, December 19' — sem ano)"],
      format: "'DayName, Month DD'  (texto, sem ano — usar year do root)",
      notes: "year está na raíz. Combinado com date do round dá data completa.",
    },
    leaderboard: {
      posField:    "divisions[].players[].pos  (calculado pelo loader)",
      nameField:   "divisions[].players[].name",
      grossField:  "r1Gross + r2Gross",
      toParField:  "divisions[].players[].toPar",
      roundsField: "r1Gross, r2Gross",
      extraPlayerFields: [
        "id          — ID único do jogador (string numérica)",
        "country",
        "birthYear   — ano de nascimento (int; pode ser null)",
      ],
      posCalcNote:
        "name pode ser 'Apelido, Nome' → inverter. " +
        "processDoral() ordena por total e atribui pos.",
    },
    scorecard: {
      available: true,
      scoresPath: "divisions[].players[].rounds[].scores",
      parPath:    "divisions[].par  (array[9] — são 9 buracos por ronda!)",
      notes:
        "ATENÇÃO: são 9 buracos (par array len=9). rounds[] pode faltar em alguns players. " +
        "Cada round tem startingHole (ex: 10) — pode começar no buraco 10. " +
        "NÃO tem SI nem metros.",
    },
    usedBy: ["DORALPage", "KIDSdataLoader", "KIDSPage", "USKIDSPage"],
    structure: `
{
  tournament: string,      "2025 First Tee Miami Doral Jr. Classic"
  year:       number,
  source:     string,
  divisions: [{
    division:     string,  "Boys 8-9" (short)
    name:         string,  "Boys 8 & 9 Division" (full)
    par:          number[9],  ← par por buraco — APENAS 9 BURACOS
    parTotal:     number,
    startingHole: number,  ← buraco de início (ex: 10)
    players: [{
      id:        string,   ← ID único do jogador
      name:      string,   ← pode ser "Apelido, Nome" → inverter
      country:   string,
      birthYear: number|null,
      pos:       number|null,
      toPar:     number|null,
      total:     number,   ← gross total (r1+r2)
      r1Gross:   number,
      r2Gross:   number,
      rounds?: [{
        day:          number,
        date:         string,  "Fri, December 19"
        course:       string,  nome do campo/tee
        startingHole: number,
        scores:       number[9],  ← resultado por buraco (9 buracos)
        gross:        number
      }]
    }]
  }]
}

tid internos: "doral25_b89", "doral25_b1011", "doral25_b1213"`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.13  uskids-results.json
  // ─────────────────────────────────────────────────────────────
  {
    id: "uskids-results",
    label: "USKids Golf — Resultados Agregados por Escalão",
    files: FILE_USKIDS_RESULTS,
    origin: "uskids-website",
    sourceUrl: "https://www.uskidsgolf.com/results",
    generatedBy: "scrape-drive-aquapor-v7.js (variante USKids)",
    loader: "src/data/KIDSdataLoader.ts → processUskids()",
    format: "uskids-results",
    dates: {
      fields: [
        "gerado_em  (raíz, ISO datetime)",
        "resultados[].date_inicio  ('M/D/YYYY')",
        "resultados[].date_fim     ('M/D/YYYY')",
        "resultados[].ultima_atualizacao  (ISO datetime)",
      ],
      format: "M/D/YYYY (datas de torneio) | ISO datetime (gerado_em, ultima_atualizacao)",
    },
    leaderboard: {
      posField:    "(calculado — ordenar gross acumulado por jogador)",
      nameField:   "resultados[].escaloes[].rondas[].leaderboard[].nome",
      grossField:  "resultados[].escaloes[].rondas[].leaderboard[].score",
      toParField:  "resultados[].escaloes[].rondas[].leaderboard[].to_par",
      roundsField: "resultados[].escaloes[].rondas[N].leaderboard[].score",
      extraPlayerFields: [
        "pais",
        "cidade",
        "tee         — nome da tee (ex: 'Tee 5')",
        "buracos     — nº de buracos completados",
        "start_hole  — buraco de início",
        "start_time  — hora de saída ('10:09')",
        "grupo       — número do grupo",
        "pontos      — pontos (stableford quando aplicável)",
      ],
    },
    scorecard: {
      available: true,
      scoresPath: "resultados[].escaloes[].rondas[].leaderboard[].strokes",
      parPath:    "rondas[].par[]  (array, pode estar vazio [])",
      siPath:     "rondas[].si[]   (array, pode estar vazio [])",
      notes:
        "strokes[] array[18] de inteiros — presente na maioria dos jogadores. " +
        "par[] e si[] estão na ronda mas podem ser [] vazios. " +
        "NÃO tem metros.",
    },
    usedBy: ["KIDSdataLoader", "KIDSPage", "USKIDSPage"],
    structure: `
{
  gerado_em:  string,          // ISO datetime
  resultados: Torneio[]
}

Torneio = {
  t:                  number,  // tcode USKids
  name:               string,
  date_inicio:        string,  // "M/D/YYYY"
  date_fim:           string,  // "M/D/YYYY"
  campo:              string,  // nome(s) do campo (pode ter vírgulas)
  rondas_total:       number,
  escalao_manuel:     string|null,  // escalão do Manuel se participa
  url_resultados:     string,
  ultima_atualizacao: string,  // ISO datetime
  escaloes: Escalao[]
}

Escalao = {
  age_group: number,
  nome:      string,    // "Boys 12", "Boys 11", …
  holes:     number,    // 9 ou 18
  is_manuel: boolean,   // true se Manuel participa neste escalão
  rondas: Ronda[]
}

Ronda = {
  ronda:      number,   // 1-based
  par:        number[], // par por buraco (pode ser [])
  si:         number[], // SI por buraco (pode ser [])
  buracos:    number,   // 9 ou 18
  total_par:  number|null,
  leaderboard: JogadorRonda[]
}

JogadorRonda = {
  nome:       string,
  pais:       string,
  cidade:     string,
  tee:        string,   // "Tee 5"
  pontos:     number,   // 0 em stroke play
  score:      number,   // gross nesta ronda
  buracos:    number,
  start_hole: number,
  start_time: string,   // "10:09"
  grupo:      number,
  strokes:    number[], // resultado por buraco (array[buracos])
  to_par:     number|null
}

Torneios cobertos (exemplos):
  21239 — Mississippi State 2026 | 21004 — Desert Shootout 2026
  20895 — Sandestin 2026        | 20175 — Rome Classic 2025
  19418 — Venice Open 2025      | 18438 — Marco Simone 2025
  15573 — El Prat 2023`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.14  uskids_torneios_completos(N).json
  // ─────────────────────────────────────────────────────────────
  {
    id: "uskids-completo",
    label: "USKids — Torneios Completos (WC / EC / Venice / RWB)",
    files: FILE_USKIDS_COMPLETO,
    origin: "uskids-website",
    sourceUrl: "https://www.uskidsgolf.com",
    generatedBy: "scrape-drive-aquapor-v7.js (variante USKids completo)",
    loader: "src/data/KIDSdataLoader.ts → processUskidsCompleto()",
    format: "uskids-completo",
    dates: {
      fields: ["[].meta.tournament.start_date"],
      format: "MM/DD/YYYY  (americano)",
    },
    leaderboard: {
      posField:    "(calculado após agregar strokes por ronda)",
      nameField:   "flights[].rounds_data[rnum].flight_players[pid].first + last",
      grossField:  "(soma strokes por ronda)",
      toParField:  "(calculado: grossTotal - par×rounds)",
      roundsField: "rounds[rnum].strokes.reduce()",
      extraPlayerFields: ["country"],
    },
    scorecard: {
      available: true,
      scoresPath:  "flights[].rounds_data[key].flight_players[pid].rounds[rnum].strokes",
      parPath:     "meta.flight_courses[flight_round_id].pars",
      notes:
        "strokes[] é array[18] com zeros nos buracos não jogados (9-buraco: primeiros 9 = 0). " +
        "pars[] idem — zeros nos buracos não jogados. " +
        "meta.flight_courses[id].lengths[] = JARDAS (não metros). " +
        "flight_player.scores[] = strings resumo tipo '37|9' (gross|buracos) — NÃO são strokes por buraco. " +
        "NÃO tem SI.",
    },
    usedBy: ["KIDSdataLoader", "KIDSPage", "USKIDSPage"],
    structure: `
Tournament[] — array (1 ficheiro pode ter vários torneios)

Tournament = {
  t: number,   // tcode

  meta: {
    tournament: {
      name, status, start_date, end_date, rounds,  // start_date: "M/D/YYYY"
      courses, tour, has_season_points, …
    },
    age_groups: Record<agId, {
      name, gender, min_age,
      tee_marker, holes_per_round,
      pace_of_play_3, pace_of_play_4, pace_of_play_5
    }>,
    flights:        Record<flightId, { age_group, teeMarker, … }>,
    flight_courses: Record<flightRoundId, {
      course:   number,
      pars:     number[18],     ← par por buraco (zeros nos não jogados)
      lengths:  number[18],     ← JARDAS (zeros nos não jogados)
      turn_9:   number,
      turn_18:  number,
      paces:    number[]
    }>,
    courses, teeMarkers, flight_rounds, tee_times, scores
  },

  flights: [{
    flight_id:   string,
    flight_name: { age_group, teeMarker, max_entry, registered, active, name, is_scorecard_hidden },
    rounds_data: Record<"r1_t0"|"r2_t0"|"r3_t0"|"r4_t0", {
      flight_players: Record<pid, FlightPlayer>,
      flight_teams:   Record
    }>
  }]
}

FlightPlayer = {
  first, last,            // nome
  country:   string,      // "us", "pt", …
  place:     string,      // cidade e estado
  handicap:  string,
  teeMarkerName:  string, // "Tee RS"
  teeMarkerColor: string,
  score:     number,      // gross total (soma das rondas)
  scores:    string[],    // resumo por ronda: "37|9" (gross|buracos) — NÃO são strokes
  rounds:    Record<rnum_str, {
    strokes:        number[18],  ← resultado por buraco (zeros = não jogado)
    flight_round:   string,      ← key para meta.flight_courses
    start_hole:     number,
    start_time:     string,
    num_strokes:    number,
    num_holes:      number
  }>
}

ATENÇÃO: strokes[] tem sempre 18 posições.
  Para 9 buracos F9: posições 0-8 têm valores, 9-17 = 0
  Para 9 buracos B9: posições 0-8 = 0, 9-17 têm valores
  Para 18 buracos: todos os 18 têm valores

t-codes conhecidos:
  WC:     11604/14029/15807/18124
  EC:     8300/13568/15704/18242
  Venice: 12229/14302/16428
  RWB:    12093/14218/16705/18719`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.15  uskids-field.json
  // ─────────────────────────────────────────────────────────────
  {
    id: "uskids-field",
    label: "USKids — Field Completo (inscrições por torneio)",
    files: FILE_USKIDS_FIELD,
    origin: "uskids-website",
    generatedBy: "scrape-drive-aquapor-v7.js",
    loader: "src/pages/USKIDSPage.tsx",
    format: "uskids-field",
    dates: {
      fields: ["gerado_em  (raíz, ISO datetime)", "torneios[].date_inicio/date_fim  ('M/D/YYYY')"],
      format: "M/D/YYYY (torneios) | ISO datetime (gerado_em)",
    },
    leaderboard: { posField: null, nameField: "torneios[].escaloes[].jogadores[].nome",
      grossField: null, toParField: null, roundsField: null,
      extraPlayerFields: ["pais (ISO 2)", "cidade"],
    },
    scorecard: { available: false },
    usedBy: ["USKIDSPage"],
    structure: `
{
  gerado_em: string,         // ISO datetime
  torneios:  TorneiField[]   // 34 torneios no snapshot
}

TorneiField = {
  t:                  number,   // tcode USKids
  name:               string,
  date_inicio:        string,   // "M/D/YYYY"
  date_fim:           string,
  rondas:             number,
  campo:              string,
  fee_18:             string,   // "$375.00"
  total_inscritos:    number,
  total_maximo:       number,
  ultima_atualizacao: string,   // ISO datetime
  escaloes: EscalaoField[]
}

EscalaoField = {
  age_group:   number,
  nome:        string,   // "Boys 12"
  genero:      string,   // "Boys"
  holes:       number,   // 9 ou 18
  flight_id:   number,
  inscritos:   number,
  maximo:      number,
  vagas:       number,
  pct_cheio:   number,   // % lotação (0–100)
  jogadores:   Jogador[] | null,   // null se escalão não incluído
  paises:      { pais: string; n: number }[] | null
}

Jogador = { nome: string, pais: string, cidade: string }`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.15b  uskids-discovery-cache.json  (NOVO)
  // ─────────────────────────────────────────────────────────────
  {
    id: "uskids-discovery",
    label: "USKids — Cache de Descoberta de Torneios",
    files: FILE_USKIDS_DISCOVERY,
    origin: "uskids-website",
    generatedBy: "scrape-drive-aquapor-v7.js (discovery mode)",
    loader: "pipeline (não carregado em runtime pela app)",
    format: "generic-json",
    dates: {
      fields: ["gerado_em  (raíz)", "torneios[].date_inicio/date_fim  ('M/D/YYYY')"],
      format: "M/D/YYYY (torneios) | ISO datetime (gerado_em)",
    },
    leaderboard: { posField: null, nameField: null, grossField: null, toParField: null, roundsField: null },
    scorecard: { available: false },
    usedBy: ["pipeline — para detectar torneios novos automaticamente"],
    structure: `
{
  ultimo_t:  number,    // último tcode visto pelo scraper
  gerado_em: string,    // ISO datetime
  torneios:  TorneiDisc[]
}

TorneiDisc = {
  t:          number,   // tcode USKids
  name:       string,
  date_inicio: string,  // "M/D/YYYY"
  date_fim:   string,
  rondas:     number,
  campo:      string,
  fee_18:     string    // "375.00"
}

Usado pelo pipeline para:
  1. Detectar torneios novos (t > ultimo_t ou datas recentes)
  2. Filtrar torneios candidatos a ter rondas do Manuel
  3. Actualizando o uskids-results.json com novos torneios

Não confundir com uskids-field.json (este não tem inscrições/jogadores)`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.16  rivals-intl.json
  // ─────────────────────────────────────────────────────────────
  {
    id: "rivals-intl",
    label: "Rivais Internacionais — Registo Centralizado",
    files: FILE_USKIDS_RIVALS,
    origin: "pipeline-local",
    generatedBy: "cross-stats.js",
    loader: "src/pages/USKIDSPage.tsx (principal)\nsrc/data/KIDSdataLoader.ts (lê para buildAutoRivals)",
    format: "generic-json",
    dates: {
      fields: ["torneios[].date  (texto como 'Fev 2025')"],
      format: "'Mês AAAA' (texto legível, não parseável directamente)",
    },
    leaderboard: {
      posField:    "jogadores[].r[tid].p",
      nameField:   "jogadores[].n",
      grossField:  "jogadores[].r[tid].t",
      toParField:  "jogadores[].r[tid].tp",
      roundsField: "jogadores[].r[tid].rd",
      extraPlayerFields: [
        "co     — país",
        "isM    — bool (true = masculino)",
        "up[]   — tids de torneios futuros onde está inscrito",
      ],
    },
    scorecard: { available: false, notes: "Scorecards nos JSONs originais de cada torneio." },
    usedBy: ["USKIDSPage", "KIDSdataLoader"],
    structure: `
{
  torneios:      TorneioDef[],
  proximos:      ProximoTorneio[],
  jogadores:     Jogador[],
  aliases:       Alias[],
  nao_confundir: NaoConfundir[]
}

──────────────────────────────────────────
TorneioDef = {
  id:       string,     // ← tid usado como chave em jogadores[].r
  name:     string,     // nome completo
  short:    string,     // abreviatura
  date:     string,     // "Fev 2025" (texto)
  rounds:   number,
  par:      number,     // par do campo (total)
  field:    number,     // nº de jogadores no field
  nations:  number,
  url:      string,
  circuito: "bjgt" | "uskids" | "outro"
}

Exemplos de tid:
  brjgt25, eowagr25, venice25, rome25,
  doral25, qdl25, gg26, wjgc26, wjgc26_1213

──────────────────────────────────────────
ProximoTorneio = { id, name, short, url }

──────────────────────────────────────────
Jogador = {
  n:    string,                  // nome canónico
  co:   string,                  // país (ISO ou nome)
  isM:  boolean,                 // masculino
  r:    Record<tid, ResultadoTid>,
  up?:  string[]                 // tids futuros (inscrito)
}

ResultadoTid = {
  p:  number|null,   // posição
  t:  number|null,   // gross total
  tp: number|null,   // to-par total
  rd: number[]       // gross por ronda [R1, R2, R3?]
}

──────────────────────────────────────────
Alias = { canonical: string, also: string[] }
  → Para resolver nomes alternativos do mesmo jogador

NaoConfundir = { nomes: string[] }
  → Lista de nomes semelhantes que NÃO são o mesmo jogador`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.17  torneio-greatgolf.json
  // ─────────────────────────────────────────────────────────────
  {
    id: "greatgolf",
    label: "Greatgolf Junior Open",
    files: FILE_GREATGOLF,
    origin: "uskids-website",
    generatedBy: "scrape-drive-aquapor-v7.js",
    loader: "src/pages/USKIDSPage.tsx\nsrc/data/KIDSdataLoader.ts → processPullTorneios()",
    format: "fpg-pull",
    dates: { fields: ["tournaments[].date"], format: "YYYY-MM-DD" },
    leaderboard: {
      posField: "tournaments[].players[].pos", nameField: "tournaments[].players[].name",
      grossField: "tournaments[].players[].grossTotal", toParField: "tournaments[].players[].toPar",
      roundsField: "tournaments[].players[].roundScores[].gross",
    },
    scorecard: {
      available: true,
      scoresPath: "tournaments[].players[].roundScores[].scores",
      parPath:    "tournaments[].players[].roundScores[].pars",
      siPath:     "tournaments[].players[].roundScores[].si",
      metersPath: "tournaments[].players[].roundScores[].meters",
    },
    usedBy: ["USKIDSPage", "KIDSdataLoader"],
    structure: `
Mesmo schema de pull-torneios.
tcode → tid: "10080"→"qdl25", "10296"→"gg26", "10295"→"gg26_u14", "10294"→"gg26_open"`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.18  tournament-links.json
  // ─────────────────────────────────────────────────────────────
  {
    id: "tournament-links",
    label: "Links Externos de Torneios",
    files: FILE_TOURNAMENT_LINKS,
    origin: "manual",
    loader: "src/pages/FPGPage.tsx",
    format: "generic-json",
    dates: { fields: [], format: "N/A" },
    leaderboard: null,
    scorecard: { available: false },
    usedBy: ["FPGPage"],
    structure: `Record<tcode, Record<string, string>>
Tem também \`_comment\` na raíz (chave especial, ignorar no processamento).
Exemplo: { "_comment": "...", "10254": { "fpg": "https://…", "leaderboard": "https://…" } }`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.19  /{nfed}/analysis/data.json  (perfil completo por jogador)
  // ─────────────────────────────────────────────────────────────
  {
    id: "fpg-player-data",
    label: "Perfil Completo do Jogador FPG (data.json por nfed)",
    files: FILE_PLAYER_DATA,
    origin: "pipeline-local",
    generatedBy: "golf-all.js → make-scorecards-ui.js",
    loader: "src/data/playerDataLoader.ts → loadPlayerData(nfed)\n" +
            "src/data/usePlayerData.ts → usePlayerData(nfed)\n" +
            "(fallback: HTML standalone com vars JS embebidas)",
    format: "fpg-player-json",
    dates: {
      fields: [
        "DATA[].rounds[].date       — DD-MM-YYYY",
        "DATA[].rounds[].dateSort   — YYYYMMDD (int, para ordenação)",
        "META.lastUpdate, META.lastRoundDate, META.generatedDate",
      ],
      format: "DD-MM-YYYY (date) | YYYYMMDD int (dateSort)",
    },
    leaderboard: null,
    scorecard: {
      available: true,
      scoresPath:  "HOLES[scoreId].g     array[18] gross por buraco",
      parPath:     "HOLES[scoreId].p     array[18] par por buraco",
      siPath:      "HOLES[scoreId].si    array[18] stroke index",
      metersPath:  "HOLES[scoreId].m     array[18] metros (pode ser null[])",
      crPath:      "(no RoundData: não está em HOLES — vem de master-courses pelo teeKey)",
      slopePath:   "(idem)",
      notes:
        "scoreId vem de DATA[].rounds[].scoreId. " +
        "HOLES[scoreId].hc = hcp no dia. " +
        "HOLE_STATS = estatísticas pré-calculadas por buraco (avg, dist, strokesLost…). " +
        "EC = eclético por teeKey.",
    },
    usedBy: ["JogadoresPage", "BJGTAnalysisPage", "DrivePage"],
    structure: `
PlayerPageData = {
  DATA:        CourseData[],
  HOLES:       Record<scoreId, HoleScores>,
  EC:          Record<teeKey, EclecticEntry[]>,
  ECDET:       Record<teeKey, Record<scoreId, EclecticEntry>>,
  HOLE_STATS:  Record<teeKey, Record<"18"|"9f"|"9b", HoleStatsData>>,
  TEE:         unknown[],
  CROSS_DATA:  Record<nfed, CrossPlayerData>,   // ⚠ NÃO está no ficheiro desde
  //   2026-09-06: vem de /data/cross-data.json (FILE_CROSS_DATA), pedido uma
  //   vez e fundido pelo loader. Ficheiros antigos que ainda o tragam embutido
  //   continuam a funcionar (ganham prioridade).
  CURRENT_FED: string,
  HCP_INFO:    HcpInfo,
  META:        { lastUpdate, lastRoundDate, generatedDate, latestHcp, escalao, club }
}

──────────────────────────────────────────
CourseData = { course, count, lastDateSort, rounds: RoundData[] }

RoundData = {
  scoreId, date, dateSort, holeCount,
  tee, teeKey,
  gross, par, stb, sd, hi,
  meters,           distância total (não por buraco)
  hasCard,          true se scorecard buraco-a-buraco existe
  eventName, scoreOrigin,
  _isTreino?, _isTeamEvent?, _isExtra?,
  _group?, _pill?, _links?, _showInTournament?
}

──────────────────────────────────────────
HoleScores = {
  g:   (number|null)[18],   resultado por buraco
  p:   (number|null)[18],   par por buraco
  si:  (number|null)[18],   stroke index
  m?:  (number|null)[18],   metros por buraco
  hc:  number               hcp no dia
}

──────────────────────────────────────────
HoleStatsData (por tee, por "18"|"9f"|"9b") = {
  teeName, teeKey, holeCount, nRounds,
  holes: HoleStatEntry[],
  totalDist: { eagle, birdie, par, bogey, double, triple, total },
  totalPar, totalStrokesLost,
  byParType: Record<"3"|"4"|"5", {
    par, holes, avg, avgVsPar,
    strokesLostPerRound, parOrBetterPct, doubleOrWorsePct, dist }>,
  f9b9: { f9: { strokesLost, par, dblPct }, b9: {…} } | null,
  bestRound: { gross, date } | null,
  worstRound: { gross, date } | null,
  avgGross, trend
}

HoleStatEntry = {
  h, par, si, n,
  avg?, best?, worst?, strokesLost?,
  dist?: { eagle, birdie, par, bogey, double, triple }
}

──────────────────────────────────────────
EclecticEntry = {
  teeName, teeKey, holeCount,
  totalGross, totalPar, toPar,
  holes: [{ h, best, par, from: { scoreId, date }|null }],
  si:   (number|null)[],
  wins: Record<string, number>
}

──────────────────────────────────────────
CrossPlayerData = {
  fed, name, sex, escalao, birthYear, club,
  currentHcp, lastSD, avgSD20, avgGross20,
  numRounds, numTournaments, numEDS,
  roundsCurrentYear, roundsLastYear, rounds2YearsAgo, rounds3YearsAgo,
  firstDate,
  hcpHistory: [{ d: dateSort, h: hcp }],
  courseTee: Record<courseKey, {
    course, tee, courseKey, teeKey, best, avg, worst, count,
    rounds: [{ gross, par, sd, hi, date, event }]
  }>
}

──────────────────────────────────────────
HcpInfo = {
  current, lowHcp, softCap, hardCap,
  scoreAvg, qtyScores, qtyCalc, adjustTotal
}`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3.20  extraCourses.ts  (TypeScript hardcoded — não é JSON)
  // ─────────────────────────────────────────────────────────────
  {
    id: "extra-courses-ts",
    label: "Campos Manuais — extraCourses.ts (TypeScript hardcoded)",
    files: "src/data/extraCourses.ts",
    origin: "manual",
    generatedBy: "editado manualmente (Hole19 / BluGolf / PDFs oficiais)",
    loader: "src/data/extraCourses.ts → getExtraCourses(): Course[]",
    format: "fpg-master",
    dates: { fields: [], format: "N/A" },
    leaderboard: null,
    scorecard: {
      available: true,
      parPath:    "tees[].holes[].par",
      siPath:     "tees[].holes[].si",
      metersPath: "tees[].holes[].distance",
      notes: "Mesma estrutura Course/Tee/Hole que master-courses.",
    },
    usedBy: ["SimuladorPage", "CamposPage"],
    structure: `
Exporta: getExtraCourses(): Course[]

Marco Simone Golf & Country Club
  courseKey: "away-marco-simone"
  Par:  [4,4,4,3,4,4,3,5,5,4,4,5,3,4,4,4,3,5]  (par 72)
  SI:   [11,1,3,17,13,15,5,9,7,4,16,12,18,6,2,10,14,8]
  Tees: Neri, Bianchi, Gialli (=Blu), Verdi (=Rossi), Arancio

  courseKey: "away-marco-simone-uskids"
  Tees: USKids Boys 12, USKids Boys 11/10, USKids Boys 9
  Fonte das distâncias: "2026 Marco Simone Invitational - Meters" (PDF oficial)

──────────────────────────────────────────
Trump Doral — First Tee Miami Doral Jr. Classic
⚠ SI = 0 para todos os campos (não disponível no documento oficial)
Todas as distâncias convertidas de JARDAS para METROS (×0.9144)
Fonte: "Divisions and Approximate Yardages" (documento do torneio)

  courseKey: "away-doral-red-tiger"     (9 buracos: holes 10-18, startHole=10)
  Par: [5,3,5,4,3,4,3,4,5]  (par 36)
  Tees: Boys 8-9 (1625m) | Boys 7&Under (1356m)

  courseKey: "away-doral-golden-palm"   (18 buracos, par 71)
  Par: [4,5,4,5,4,4,3,4,3, 4,5,3,4,4,3,5,3,4]
  Tees: Boys 10-11 (69.0/130, 4888m) | Boys 14-15 (72.0/136, 5791m)

  courseKey: "away-doral-silver-fox"    (18 buracos, par 71)
  Par: [4,4,5,3,4,4,3,4,4, 4,5,4,4,4,3,5,3,4]
  Tees: Boys 12-13 (74.0/140, 5144m)

  courseKey: "away-doral-blue-monster"  (18 buracos, par 72)
  Par: [5,4,4,3,4,4,4,5,3, 5,4,5,3,4,3,4,4,4]
  Tees: Boys 16-18 (74.0/140, 6252m)

──────────────────────────────────────────
Le Touquet Golf Club - La Forêt  (EOWAGR 2025 Boys 11-12)
  courseKey: "away-letouquet-foret"
  Par: [5,4,4,4,5,3,4,3,4, 4,5,3,4,4,3,5,4,4]  (par 72)
  SI:  [9,11,13,5,7,17,3,15,1, 12,6,8,2,16,14,10,4,18]
  Tee: Vermelho (CR 71.5 / Sl 120) — convertido de JARDAS para METROS (5254yd → 4805m)
  Original (jds): [418,274,274,367,410,127,323,132,339, 307,404,141,312,288,125,413,328,272]

Golf Du Touquet - La Mer  (EOWAGR 2025 Boys 13-14)
  courseKey: "away-letouquet-mer"
  Par: [5,3,4,5,4,4,3,4,4, 3,5,4,4,4,5,3,4,4]  (par 72)
  SI:  [8,4,18,14,10,16,12,6,2, 17,1,7,3,5,11,9,15,13]
  Tee: White BJGT (CR 73.3 / Sl 136) — convertido de JARDAS para METROS
  Original (jds): [469,198,336,455,409,319,146,349,406, 139,422,367,382,377,465,180,456,384]
  Fonte: scorecard BluGolf exportada, 11/08/2025

Cada Tee tem holes: [{ hole, par, si, distance }] — idêntico a master-courses.`,
  },

];


/* ══════════════════════════════════════════════════════════════════
   4. HELPERS DE LOOKUP
   ══════════════════════════════════════════════════════════════════ */

export function getSource(id: string): DataSourceMeta | undefined {
  return DATA_REGISTRY.find(s => s.id === id);
}

export function sourcesWithScorecard(): DataSourceMeta[] {
  return DATA_REGISTRY.filter(s => s.scorecard.available);
}

export function sourcesWithLeaderboard(): DataSourceMeta[] {
  return DATA_REGISTRY.filter(s => s.leaderboard !== null);
}

export function sourcesForPage(pageName: string): DataSourceMeta[] {
  return DATA_REGISTRY.filter(s => s.usedBy.some(p => p.includes(pageName)));
}

export function sourcesWithMeters(): DataSourceMeta[] {
  return DATA_REGISTRY.filter(s => !!s.scorecard.metersPath);
}

export function sourcesWithSI(): DataSourceMeta[] {
  return DATA_REGISTRY.filter(s => !!s.scorecard.siPath);
}

export function describeSource(id: string): string {
  const s = getSource(id);
  if (!s) return `[fonte desconhecida: ${id}]`;
  const sc = s.scorecard;
  return [
    `[${s.id}] ${s.label}`,
    `  Origem:      ${s.origin}${s.sourceUrl ? ` (${s.sourceUrl})` : ""}`,
    `  Gerado por:  ${s.generatedBy ?? "—"}`,
    `  Loader:      ${s.loader}`,
    `  Formato:     ${s.format}`,
    `  Datas:       ${s.dates.fields.join(" | ") || "—"} [${s.dates.format}]`,
    `  Leaderboard: ${s.leaderboard ? `${s.leaderboard.grossField} / toPar: ${s.leaderboard.toParField}` : "n/a"}`,
    `  Scorecard:   ${sc.available ? "✓" : "✗"}`,
    sc.available && sc.scoresPath  ? `    scores:  ${sc.scoresPath}`  : "",
    sc.available && sc.parPath     ? `    par:     ${sc.parPath}`     : "",
    sc.available && sc.siPath      ? `    SI:      ${sc.siPath}`      : "",
    sc.available && sc.metersPath  ? `    metros:  ${sc.metersPath}`  : "",
    sc.available && sc.crPath      ? `    CR:      ${sc.crPath}`      : "",
    `  Usado em:    ${s.usedBy.join(", ")}`,
  ].filter(Boolean).join("\n");
}
