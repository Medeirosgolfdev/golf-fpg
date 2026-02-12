/* ───────────────────────────────────────────
   Tipos para master-courses.json (lean-2)
   ─────────────────────────────────────────── */

export type Sex = "M" | "F" | "U";

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
  teeIndex: number;
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

export type CourseLinks = {
  fpg: string | null;
  scorecards: string | null;
};

export type CourseMaster = {
  courseId: string;
  name: string;
  numbers?: Record<string, unknown>;
  links: CourseLinks;
  tees: Tee[];
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

/* ───────────────────────────────────────────
   Tipos para players.json
   ─────────────────────────────────────────── */

export type PlayerClub = {
  code: string;
  short: string;
  long: string;
};

export type Player = {
  name: string;
  nfed: string;
  dob: string;
  sex: string;
  hcp: number | null;
  escalao: string;
  club: PlayerClub | string;
  region: string;
  tags: string[];
  altNames: string[];
  extra: Record<string, unknown>;
};

export type PlayersDb = Record<string, Player>;
