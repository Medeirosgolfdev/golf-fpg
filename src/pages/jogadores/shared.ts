/**
 * src/pages/jogadores/shared.ts
 *
 * Tipos e constantes partilhados entre as vistas da JogadoresPage.
 */

/** Vistas do detalhe de jogador (select/tabs do PlayerDetail). */
export type ViewKey = "by_course" | "by_course_analysis" | "by_date" | "by_tournament" | "analysis" | "eclectic_sds" | "draws";

/** Ordenação do dropdown das vistas por campo. */
export type CourseSort = "last_desc" | "count_desc" | "name_asc";
