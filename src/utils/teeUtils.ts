/**
 * src/utils/teeUtils.ts
 *
 * Funções partilhadas para ordenar e filtrar tees.
 * Usadas por CamposPage e SimuladorPage (anteriormente duplicadas).
 */

import type { Tee, SexFilter } from "../data/types";
import { getTeeHex } from "./teeColors";

/** Rank por sexo para ordenação: M primeiro, F segundo, outros último */
export function sexRank(s: string): number {
  if (s === "M") return 0;
  if (s === "F") return 1;
  return 2;
}

/** Ordena tees: maior distância primeiro, depois por sexo, depois alfabético */
export function sortTees(tees: Tee[]): Tee[] {
  return [...tees].sort((a, b) => {
    const da = a.distances?.total ?? -1;
    const db = b.distances?.total ?? -1;
    if (db !== da) return db - da;
    const sr = sexRank(a.sex) - sexRank(b.sex);
    if (sr !== 0) return sr;
    return a.teeName.localeCompare(b.teeName, "pt-PT", { sensitivity: "base" });
  });
}

/** Filtra tees por sexo */
export function filterTees(tees: Tee[], sex: SexFilter): Tee[] {
  if (sex === "ALL") return tees;
  return tees.filter((t) => t.sex === sex);
}

/** Resolve a cor hex de um objecto Tee (usa scorecardMeta se disponível) */
export function teeHexFromTee(t: Tee): string {
  return getTeeHex(t.teeName, t.scorecardMeta?.teeColor);
}
