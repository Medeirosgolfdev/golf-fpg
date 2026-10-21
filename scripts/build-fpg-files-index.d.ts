/** Tipos de scripts/build-fpg-files-index.js (o teste do loader da FPG usa o mesmo gerador). */
export function buildIndex(names: string[]): {
  _gerado: string;
  "pull-torneios": string[];
  "drive-data": string[];
  "aquapor-data": string[];
};
export const SERIES: Record<"pull-torneios" | "drive-data" | "aquapor-data", RegExp>;
