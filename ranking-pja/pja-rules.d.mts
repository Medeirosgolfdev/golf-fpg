/** Tipos de `pja-rules.mjs` — fonte única das regras do Ranking PJA. */

export interface PJATournLike {
  name?: string | null;
  tcode?: string | number | null;
  date?: string | null;
}

export type PJAEventType = "DT" | "AQUAPOR" | "GG_MAIN" | "GG_U14" | "GG_U12" | "PJA_EXCL";

export const PJA_TCODES: Set<string>;
export const GF_TCODES: Set<string>;
export const TOURN_MULTIPLIER: Record<string, number>;

export function pjaPts(toPar: number, mult: number): number;
export function isGFTournament(t: PJATournLike): boolean;
export function getTournMultiplier(t: PJATournLike): number;
export function classifyPJAEvent(t: PJATournLike): PJAEventType;
export function isPJACore(t: PJATournLike): boolean;

export interface PJANota {
  ano: string;
  tipo: "fora" | "info";
  titulo: string;
  texto: string;
  /** Data ISO a partir da qual a nota deixa de ser mostrada. */
  ate?: string;
}

export const PJA_NOTAS: PJANota[];
export function notasPJA(year: string | number, hoje?: string): PJANota[];
