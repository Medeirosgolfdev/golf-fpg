/**
 * src/utils/teeGroups.ts
 *
 * Agrupamento de tees por tee FÍSICO (cor + distância). O mesmo tee aparece
 * como entradas separadas para M e F (CR/Slope diferentes); aqui junta-se tudo
 * num só grupo, com os ratings de 18h, F9 e B9 por sexo + o objecto Tee de cada
 * sexo (para selecção). Partilhado entre CamposPage e SimuladorPage.
 */
import type { Tee } from "../data/types";
import { sortTees, teeHexFromTee } from "./teeUtils";
import { teeGroupHex } from "./teeColors";
import { titleCase } from "./format";

export type SexKey = "M" | "F" | "U";
export type TeeRating = { cr: number; sl: number };
export interface PhysTeeGroup {
  key: string;
  label: string;
  colorHex: string;
  teeHoles: Tee;
  h18: Partial<Record<SexKey, TeeRating>>;
  f9: Partial<Record<SexKey, TeeRating>>;
  b9: Partial<Record<SexKey, TeeRating>>;
  /** Objecto Tee de cada sexo — usado para selecção (Simulador). */
  teeBySex: Partial<Record<SexKey, Tee>>;
}

/** Chave do tee FÍSICO (cor + distância total). Estável entre componentes. */
export function physicalTeeKey(t: Tee): string {
  return `${teeGroupHex(t.teeName, t.scorecardMeta?.teeColor)}|${Math.round(t.distances?.total ?? 0)}`;
}

export function physicalTeeGroups(tees: Tee[]): PhysTeeGroup[] {
  const ordered = sortTees(tees);
  const map = new Map<string, PhysTeeGroup>();
  for (const t of ordered) {
    const key = physicalTeeKey(t);
    if (!map.has(key)) {
      map.set(key, { key, label: titleCase(t.teeName), colorHex: teeHexFromTee(t), teeHoles: t, h18: {}, f9: {}, b9: {}, teeBySex: {} });
    }
    const g = map.get(key)!;
    if ((t.holes?.length ?? 0) > (g.teeHoles.holes?.length ?? 0)) g.teeHoles = t;
    const sx: SexKey = t.sex === "M" || t.sex === "F" ? t.sex : "U";
    if (!g.teeBySex[sx]) g.teeBySex[sx] = t;
    const fill = (bucket: Partial<Record<SexKey, TeeRating>>, r: { courseRating?: number | null; slopeRating?: number | null } | null | undefined) => {
      const cr = r?.courseRating, sl = r?.slopeRating;
      if (cr != null && sl != null && !bucket[sx]) bucket[sx] = { cr, sl };
    };
    fill(g.h18, t.ratings?.holes18);
    fill(g.f9, t.ratings?.holes9Front);
    fill(g.b9, t.ratings?.holes9Back);
  }
  return [...map.values()];
}

/** Sexos presentes (M, F, U por esta ordem) num conjunto de buckets de rating. */
export function sexesIn(groups: PhysTeeGroup[], pick: (g: PhysTeeGroup) => Partial<Record<SexKey, TeeRating>>): SexKey[] {
  const present = new Set<SexKey>();
  groups.forEach((g) => (["M", "F", "U"] as const).forEach((s) => { if (pick(g)[s]) present.add(s); }));
  return (["M", "F", "U"] as const).filter((s) => present.has(s));
}
