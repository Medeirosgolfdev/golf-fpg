/* 
   Tipos para master-courses.json (lean-2)
    */

export type Sex = "M" | "F" | "U";

export type SexFilter = "ALL" | "M" | "F";

export type Ratings = {
  par: number | null;
  courseRating: number | null;
  slopeRating: number | null;
};

export type Hole = {
  hole: number;
  par: number | null;
  si: number | null;
  distance: number | null;
};

export type Distances = {
  total: number | null;
  front9: number | null;
  back9: number | null;
  holesCount: number;
  complete18: boolean;
};

export type ScorecardMeta = {
  teeColor: string | null;
  teeIndex?: number;
  teeOrder?: {
    oldIndex: number;
    name: string;
    color: string;
    avg: number;
  };
};

export type Tee = {
  teeId: string;
  sex: Sex;
  teeName: string;
  scorecardMeta?: ScorecardMeta;
  ratings: {
    holes18?: Ratings;
    holes9Front?: Ratings;
    holes9Back?: Ratings;
  };
  holes: Hole[];
  distances: Distances;
};

export type ExtraLink = {
  label: string;
  url: string;
};

export type CourseLinks = {
  fpg: string | null;
  scorecards: string | null;
  extra?: ExtraLink[];   // links adicionais (ex: página USKIDS, resultados, etc.)
};

export type CourseMaster = {
  courseId: string;
  name: string;
  country?: string;
  numbers?: Record<string, unknown>;
  links: CourseLinks;
  tees: Tee[];
  /** Quem jogou este campo — só nos away-courses gerados pelo pipeline.
   *  Valor por federado: lista de rondas com o resultado (formato novo) OU,
   *  retro-compatível, a string da data mais recente (formato antigo). */
  _players?: Record<string, CoursePlayerRound[] | string | null>;
};

/** Uma ronda de um jogador num campo away (para mostrar resultados na CamposPage). */
export type CoursePlayerRound = {
  date: string | null;
  gross: number | null;
  toPar: number | null;
  /** Nº de buracos jogados (9 ou 18) — separa meias-voltas das voltas completas
   *  na CamposPage. Pode faltar em dados antigos (derivado então do par). */
  holes?: number | null;
  tee: string | null;
  event: string | null;
  sd: number | null;
};

export type Course = {
  courseKey: string;
  master: CourseMaster;
};

export type MasterMeta = {
  version: string;
  generatedAt: string;
  stats: {
    courses: number;
    tees: number;
    teesComplete18: number;
  };
};

export type MasterData = {
  meta: MasterMeta;
  courses: Course[];
};

export type AwayCoursesData = {
  courses: Course[];
};

/* 
   Tipos para players.json
    */

export type PlayerClub = {
  code: string;
  short: string;
  long: string;
};

export type Player = {
  name: string;
  nfed: string;
  dob: string;
  sex: Sex;
  hcp: number | null;
  escalao: string;
  club: PlayerClub | string;
  region: string;
  tags: string[];
  altNames: string[];
  extra: Record<string, unknown>;
  lastRound?: string;
};

export type PlayersDb = Record<string, Player>;
