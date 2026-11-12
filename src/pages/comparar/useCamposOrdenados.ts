/**
 * useCamposOrdenados — os campos por ordem alfabética e o campo com que a vista abre:
 * o seleccionado na lista dos Campos; senão o Santo da Serra; senão o primeiro.
 *
 * É o arranque comum das duas vistas de «Comparar» (campos A/B e vantagem de tee),
 * que o tinham copiado (12/11/2026).
 */
import { useMemo } from "react";
import type { Course } from "../../data/types";

export function useCamposOrdenados(simCourses: Course[], initialCourseKey?: string): {
  sortedCourses: Course[];
  defaultCourseKey: string;
} {
  const sortedCourses = useMemo(
    () => [...simCourses].sort((a, b) => a.master.name.localeCompare(b.master.name, "pt", { sensitivity: "base" })),
    [simCourses]
  );
  const defaultCourseKey = useMemo(() => {
    if (initialCourseKey && sortedCourses.some(c => c.courseKey === initialCourseKey)) return initialCourseKey;
    const sds = sortedCourses.find(c => /santo\s+d[ao]\s+serra/i.test(c.master.name));
    return sds?.courseKey ?? sortedCourses[0]?.courseKey ?? "";
  }, [sortedCourses, initialCourseKey]);
  return { sortedCourses, defaultCourseKey };
}
