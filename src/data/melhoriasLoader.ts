/**
 * melhoriasLoader.ts
 *
 * Extrai campos "away" (estrangeiros / não-FPG) do melhorias.json
 * e converte-os em objetos Course compatíveis com o SimuladorPage.
 *
 * Campos com course_rating + slope no scorecard são agrupados por
 * (course_description, tee_name) para evitar duplicados.
 */

import type { Course, Tee, Hole, Ratings } from "./types";

type ScorecardEntry = Record<string, unknown>;
type MelhoriasJson = Record<string, Record<string, unknown>>;

/* ─── Helpers ─── */

function getNum(obj: ScorecardEntry, key: string): number | null {
  const v = obj[key];
  return typeof v === "number" ? v : null;
}

function getStr(obj: ScorecardEntry, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

function sumRange(start: number, end: number, getter: (i: number) => number | null): number | null {
  let total = 0;
  let any = false;
  for (let i = start; i <= end; i++) {
    const v = getter(i);
    if (v !== null) {
      total += v;
      any = true;
    }
  }
  return any ? total : null;
}

/* ─── Tipo intermédio para agrupar ─── */

type TeeKey = string; // "course_description|tee_name|cr|slope"

type ParsedTee = {
  courseName: string;
  teeName: string;
  cr: number;
  slope: number;
  par18: number | null;
  parFront: number | null;
  parBack: number | null;
  holes: Hole[];
  totalDist: number | null;
  frontDist: number | null;
  backDist: number | null;
};

function parseScorecardTee(sc: ScorecardEntry): ParsedTee | null {
  const cr = getNum(sc, "course_rating");
  const slope = getNum(sc, "slope");
  const courseName = getStr(sc, "course_description");

  if (!cr || !slope || !courseName) return null;

  const teeName = getStr(sc, "tee_name") || "Default";

  // Extrair holes
  const holes: Hole[] = [];
  for (let i = 1; i <= 18; i++) {
    const par = getNum(sc, `par_${i}`);
    const si = getNum(sc, `stroke_index_${i}`);
    const distance = getNum(sc, `meters_${i}`);
    if (par !== null || distance !== null) {
      holes.push({ hole: i, par, si, distance });
    }
  }

  const parFront = sumRange(1, 9, (i) => getNum(sc, `par_${i}`));
  const parBack = sumRange(10, 18, (i) => getNum(sc, `par_${i}`));
  const par18 = parFront !== null && parBack !== null ? parFront + parBack : null;

  const frontDist = sumRange(1, 9, (i) => getNum(sc, `meters_${i}`));
  const backDist = sumRange(10, 18, (i) => getNum(sc, `meters_${i}`));
  const totalDist = frontDist !== null && backDist !== null ? frontDist + backDist : null;

  return { courseName, teeName, cr, slope, par18, parFront, parBack, holes, totalDist, frontDist, backDist };
}

/* ─── Exportação principal ─── */

export function extractAwayCourses(melhorias: MelhoriasJson): Course[] {
  // Mapa: courseKey → { courseName, tees: Map<teeKey, ParsedTee> }
  const courseMap = new Map<string, { courseName: string; tees: Map<TeeKey, ParsedTee> }>();

  for (const [_fedId, playerData] of Object.entries(melhorias)) {
    if (typeof playerData !== "object" || playerData === null) continue;

    for (const [key, entry] of Object.entries(playerData)) {
      // Ignorar chaves de metadados
      if (key.startsWith("_") || typeof entry !== "object" || entry === null) continue;

      const sc = (entry as Record<string, unknown>).scorecard;
      if (!sc || typeof sc !== "object") continue;

      const parsed = parseScorecardTee(sc as ScorecardEntry);
      if (!parsed) continue;

      // courseKey baseado no nome do campo (normalizado)
      const courseKey = `away-${parsed.courseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")}`;
      const teeKey = `${parsed.teeName}|${parsed.cr}|${parsed.slope}`;

      if (!courseMap.has(courseKey)) {
        courseMap.set(courseKey, { courseName: parsed.courseName, tees: new Map() });
      }

      const existing = courseMap.get(courseKey)!;

      // Só adicionar se não existir (ou se tiver mais holes)
      if (!existing.tees.has(teeKey) || (parsed.holes.length > (existing.tees.get(teeKey)?.holes.length ?? 0))) {
        existing.tees.set(teeKey, parsed);
      }
    }
  }

  // Converter para Course[]
  const courses: Course[] = [];

  for (const [courseKey, { courseName, tees }] of courseMap) {
    const teeArr: Tee[] = [];
    let teeIdx = 0;

    for (const [, parsed] of tees) {
      // Ratings 18h
      const r18: Ratings = {
        par: parsed.par18,
        courseRating: parsed.cr,
        slopeRating: parsed.slope,
      };

      // Estimar ratings de 9 buracos (metade do CR, slope mantém-se — aproximação)
      const rFront: Ratings | undefined =
        parsed.parFront !== null
          ? {
              par: parsed.parFront,
              courseRating: parsed.cr ? +(parsed.cr / 2).toFixed(1) : null,
              slopeRating: parsed.slope,
            }
          : undefined;

      const rBack: Ratings | undefined =
        parsed.parBack !== null
          ? {
              par: parsed.parBack,
              courseRating: parsed.cr ? +(parsed.cr / 2).toFixed(1) : null,
              slopeRating: parsed.slope,
            }
          : undefined;

      const tee: Tee = {
        teeId: `${courseKey}-${teeIdx++}`,
        sex: "U" as const,
        teeName: parsed.teeName,
        ratings: {
          holes18: r18,
          ...(rFront ? { holes9Front: rFront } : {}),
          ...(rBack ? { holes9Back: rBack } : {}),
        },
        holes: parsed.holes,
        distances: {
          total: parsed.totalDist,
          front9: parsed.frontDist,
          back9: parsed.backDist,
          holesCount: parsed.holes.length,
          complete18: parsed.holes.length === 18,
        },
      };

      teeArr.push(tee);
    }

    if (teeArr.length === 0) continue;

    courses.push({
      courseKey,
      master: {
        courseId: courseKey,
        name: `${courseName} ⚑`,
        links: { fpg: null, scorecards: null },
        tees: teeArr,
      },
    });
  }

  // Ordenar por nome
  courses.sort((a, b) => a.master.name.localeCompare(b.master.name, "pt"));

  return courses;
}
