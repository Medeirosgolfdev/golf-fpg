/**
 * src/pages/jogadores/shared.ts
 *
 * Tipos e constantes partilhados entre as vistas da JogadoresPage.
 */
import type { CSSProperties } from "react";

/** Vistas do detalhe de jogador (select/tabs do PlayerDetail). */
export type ViewKey = "by_course" | "by_course_analysis" | "by_date" | "by_tournament" | "analysis";

/** Ordenação do dropdown das vistas por campo. */
export type CourseSort = "last_desc" | "count_desc" | "name_asc";

/** Estilo do host de scorecard expandido dentro das tabelas de rondas. */
export const scHostStyle: CSSProperties = { margin: "6px 8px", width: "fit-content", maxWidth: "calc(100% - 16px)" };
