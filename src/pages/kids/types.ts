/* Types partilhados entre KIDSPage e sub-componentes */

export interface TournResult { p: number | "WD"; t: number | null; tp: number | null; rd: (number | null)[]; nholes?: number }

export interface RivalPlayer {
  n: string;
  co: string;
  isM?: boolean;
  dob?: string;          // "DD/MM/YYYY" quando conhecida
  r: Record<string, TournResult>;
  up: string[];
}

export interface TournDef {
  id: string; name: string; short: string; date: string;
  rounds: number; par: number; field: number; nations: number;
  intendedRounds?: number; url: string;
  dateExact?: string;    // "YYYY-MM-DD" para cálculo de DOB
  ageMin?: number;       // escalão: idade mínima
  ageMax?: number;       // escalão: idade máxima
}

export interface ScRound { label: string; scores: number[] }

export type H2HConfronto = {
  tid: string; tornName: string; ageGroup: string | null;
  manPos: number; rivalPos: number;
  manTp: number | null; rivalTp: number | null; year: number;
  /** Nº de rondas do torneio — para mostrar pill 3R/2R/etc. */
  nRounds?: number;
};

export type H2HSortKey = "tourn" | "year" | "manPos" | "rivalPos" | "dif" | "result";
