/**
 * melhoriasTypes.ts — Tipos para melhorias.json
 *
 * Correções manuais aos dados da FPG, rondas extra e treinos.
 * Estrutura: { [fedId]: PlayerMelhorias }
 */

/* ── Pill types ── */

export type PillValue = "REGIONAL" | "NACIONAL" | "INTL" | "AWAY" | "AWAY INTL";

/* ── Patches WHS (aplica-se ao whs-list.json) ── */

export interface WhsPatch {
  tourn_name?: string;
  course_description?: string;
  [key: string]: unknown;    // campos dinâmicos menos comuns
}

/* ── Patches Scorecard ── */

export interface ScorecardPatch {
  course_description?: string;
  course_rating?: number;
  slope?: number;
  tee_name?: string;
  tournament_description?: string;
  gross_total?: number;
  gross_out?: number;
  gross_in?: number;
  /** gross_1..gross_18 */
  [key: `gross_${number}`]: number | undefined;
  /** par_1..par_18 */
  [key: `par_${number}`]: number | undefined;
  /** meters_1..meters_18 */
  [key: `meters_${number}`]: number | undefined;
  /** stroke_index_1..stroke_index_18 */
  [key: `stroke_index_${number}`]: number | undefined;
}

/* ── Links ── */

export type MelhoriaLinks = Record<string, string>;

/* ── Score entry (por score_id) ── */

export interface ScoreMelhoria {
  notas?: string;
  whs?: WhsPatch;
  scorecard?: ScorecardPatch;
  links?: MelhoriaLinks;
  pill?: PillValue;
  _fpg_original?: Record<string, unknown>;
  _group?: string;
  torneio_view?: boolean;
}

/* ── Extra rounds (rondas não FPG) ── */

export interface ExtraRoundDia {
  data: string;
  dia: number;
  holes: number;
  hole_range?: string;
  par: number | null;
  gross: number | null;
  gross_out?: number | null;
  gross_in?: number | null;
  par_holes?: (number | null)[];
  gross_holes?: (number | null)[];
  meters_holes?: (number | null)[];
  meters_total?: number | null;
  stroke_index_holes?: (number | null)[];
  _yards_holes?: (number | null)[];
  _yards_total?: number | null;
  _yards_corrigido?: number | null;
}

export interface ExtraRound {
  _comment?: string;
  torneio: string;
  campo: string;
  categoria?: string;
  pais?: string;
  posicao?: string | number | null;
  posicao_total?: string | number | null;
  nao_comunicado_fpg?: boolean;
  pill?: PillValue;
  links?: MelhoriaLinks;
  dias: ExtraRoundDia[];
}

/* ── Treinos (Game Book) ── */

export interface Treino {
  data: string;
  campo: string;
  holes: number;
  hole_range?: string;
  par: number | null;
  gross: number | null;
  par_holes?: (number | null)[];
  gross_holes?: (number | null)[];
  si_holes?: (number | null)[];
  pm?: string;
  companhia?: string;
  fonte?: string;
}

/* ── Links section (meta-comentários) ── */

export interface MetaLinks extends MelhoriaLinks {
  pais?: string;
}

/* ── Player melhorias (tudo de um jogador) ── */

export interface PlayerMelhorias {
  /** Entradas por score_id: patches WHS + scorecard */
  [scoreId: string]: ScoreMelhoria | ExtraRound[] | Treino[] | MetaLinks | string | undefined;

  /** Rondas extra não registadas na FPG */
  extra_rounds?: ExtraRound[];

  /** Treinos do Game Book */
  treinos?: Treino[];
}

/* ── Root type ── */

export interface MelhoriasJson {
  _readme?: string;
  [fedId: string]: PlayerMelhorias | string | undefined;
}
