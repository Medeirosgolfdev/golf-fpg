/* Types partilhados entre KIDSPage e sub-componentes */

export interface ScRound { label: string; scores: number[] }

export type H2HConfronto = {
  tid: string; tornName: string; ageGroup: string | null;
  manPos: number; rivalPos: number;
  manTp: number | null; rivalTp: number | null; year: number;
  /** Nº de rondas do torneio — para mostrar pill 3R/2R/etc. */
  nRounds?: number;
};

export type H2HSortKey = "tourn" | "year" | "manPos" | "rivalPos" | "dif" | "result";
