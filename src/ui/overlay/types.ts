/*
 * Types partilhados pelos overlays do simulador (V1-V48).
 * Extraído de OverlayExport.tsx para facilitar manutenção dos designs em ficheiros separados.
 */

export type OverlayData = {
  courseName: string; teeName: string; teeDist: number | null;
  cr: number; slope: number;
  par: number[]; scores: (number | null)[]; si: number[];
  meters?: (number | null)[];  // metros por buraco (do tee)
  hi: number | null; courseHcp: number | null; sd: number | null;
  is9h: boolean; hasHoles: boolean;
  player: string; event: string; round: number; date: string; position: string;
};

/** "Design data" — versão normalizada da OverlayData consumida pelos templates V*. */
export type DD = {
  player: string; event: string; round: number; date: string; position: string;
  course: string; tee: string; teeDist: number | null;
  cr: number; slope: number;
  par: number[]; scores: number[]; si: number[];
  meters?: (number | null)[];
  hi: number | null; courseHcp: number | null; sd: number | null;
  is9h: boolean; hasHoles: boolean;
};

/** Toggles ON/OFF por key (player, course, tee, stats, holeScores, ...). */
export type Vis = Record<string, boolean>;

/** Contagens por tipo de score. */
export type StT = {
  hio: number; eagles: number; birdies: number; pars: number;
  bogeys: number; doubles: number; triples: number;
};

/** Estatísticas calculadas: par/strokes totais, vs par por nine, SD, breakdown. */
export type Stats = {
  pF: number; pB: number; pT: number;
  sF: number; sB: number; sT: number;
  vpT: number; vpF: number; vpB: number;
  sd: number; st: StT;
};

/** Props comuns a todos os componentes de design V*. */
export type P = {
  d: DD; v: Vis; s: Stats;
  bg?: string | null;
  tc?: string; tc2?: string; tc3?: string; tc4?: string;
};
