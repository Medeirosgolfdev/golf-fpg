/**
 * playedDistance.ts
 *
 * Liga uma ronda ao TEE do campo (master/away/extra) para enriquecer dados que
 * o registo da ronda não traz — típico de torneios internacionais (a FPG tem o
 * score mas não as jardas nem o stroke index reais, que vêm sequenciais).
 *
 * Estratégia de escolha do tee:
 *   1. Override curado do Manuel (MANUEL_AWAY_TEE) — torneios onde a cor
 *      registada não reflecte a marcação real (escalão USKids por idade).
 *   2. Match por nome de tee (normalizado).
 *   3. Match por COR (teeGroupHex) — ex: "AZUIS" ↔ "Blu".
 */
import type { Course, Tee } from "../data/types";
import { canonicalCourseName } from "./courseAliases";
import { norm } from "./format";
import { teeGroupHex } from "./teeColors";
import { MANUEL_FED } from "../constants/manuel";
import { MANUEL_AWAY_TEE } from "../constants/manuelAwayTees";

export function courseKeyName(name: string): string {
  // Normalização robusta: além do norm (lowercase + sem diacríticos), remover
  // TODA a pontuação para que "Villa Padierna - Flamingos" (campo) case com
  // "Villa Padierna Flamingos" (etiqueta da ronda), "Marco Simone Golf &
  // Country Club" com/sem "&", etc.
  return norm(canonicalCourseName(name) || name)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findCourse(simCourses: Course[], courseName: string): Course | null {
  const key = courseKeyName(courseName);
  return simCourses.find((c) => courseKeyName(c.master.name) === key) ?? null;
}

/**
 * Devolve o TEE do campo que o jogador jogou nesta ronda, ou null se não der
 * para resolver. Não inventa: só liga aos dados existentes do campo.
 */
export function resolvePlayedTee(
  courseName: string,
  teeName: string | null,
  simCourses: Course[],
  fedId: string,
): Tee | null {
  if (!courseName || !simCourses?.length) return null;
  const sc = findCourse(simCourses, courseName);
  if (!sc) return null;
  const tees = sc.master.tees;
  if (!tees?.length) return null;

  // 1. Override curado do Manuel
  if (fedId === MANUEL_FED) {
    const want = MANUEL_AWAY_TEE[courseKeyName(courseName)];
    if (want) {
      const t = tees.find((t) => norm(t.teeName) === norm(want));
      if (t) return t;
    }
  }
  // 2. Nome de tee exacto
  if (teeName) {
    const t = tees.find((t) => norm(t.teeName) === norm(teeName));
    if (t) return t;
  }
  // 2b. Marcação por escalão com prefixo de circuito.
  //     A FPG grava a marcação como o circuito a nomeia ("Boys 12"), mas o
  //     catálogo do campo guarda-a com prefixo ("USKids Boys 12"). Sem isto a
  //     ronda fica sem metros. O override curado por campo não resolve, porque
  //     é um valor só: o mesmo campo é jogado de Boys 11 num ano e Boys 12 no
  //     seguinte, à medida que o jogador cresce.
  //     Só para nomes com 2+ palavras, para não casar cores — "Vermelhas"
  //     nunca deve apanhar "Vermelhas Femininas".
  if (teeName) {
    const want = norm(teeName);
    if (want.split(" ").length >= 2) {
      const t = tees.find((t) => {
        const have = norm(t.teeName);
        return have !== want && have.endsWith(` ${want}`);
      });
      if (t) return t;
    }
  }
  // 3. Cor do tee
  if (teeName) {
    const hex = teeGroupHex(teeName, null);
    const t = tees.find((t) => teeGroupHex(t.teeName, t.scorecardMeta?.teeColor) === hex);
    if (t) return t;
  }
  return null;
}

/** Distância (metros) jogada, ligada ao tee do campo. */
export function resolvePlayedMeters(
  courseName: string,
  teeName: string | null,
  holeCount: number | null | undefined,
  simCourses: Course[],
  fedId: string,
): number | null {
  const t = resolvePlayedTee(courseName, teeName, simCourses, fedId);
  const d = t?.distances;
  if (!d) return null;
  if (holeCount === 9 && d.holesCount === 18 && d.front9) return d.front9;
  return typeof d.total === "number" ? d.total : null;
}

/** SI (stroke index) de REFERÊNCIA do campo (o mesmo que a CamposPage mostra).
 *  O SI é uma propriedade do LAYOUT, não do tee — por isso usa-se o primeiro tee
 *  com SI válido, garantindo consistência entre o scorecard do jogador e o campo. */
export function resolvePlayedSI(
  courseName: string,
  simCourses: Course[],
): (number | null)[] | null {
  const sc = findCourse(simCourses, courseName);
  if (!sc) return null;
  for (const t of sc.master.tees) {
    if (!t.holes?.length) continue;
    const si = t.holes.map((h) => h.si ?? null);
    if (si.some((v) => v != null && v > 0)) return si;
  }
  return null;
}

/** True se o SI da ronda é falso/sequencial (1..n) ou está vazio. */
export function isFakeSI(si: (number | null)[] | undefined | null): boolean {
  if (!si || si.length === 0) return true;
  if (si.every((v) => v == null || v === 0)) return true;
  if (si.every((v, i) => v === i + 1)) return true; // sequencial — nunca é um SI real
  return false;
}
