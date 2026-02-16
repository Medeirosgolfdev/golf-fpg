/**
 * melhoriasLoader.ts
 *
 * Extrai campos "away" (estrangeiros) do melhorias.json
 * e converte-os em objetos Course com bandeira de pais.
 *
 * Processa dois formatos:
 * 1) Entradas FPG com .scorecard (course_rating, slope, meters_1..18)
 * 2) extra_rounds com dias[] (par_holes, meters_holes)
 *
 * O pais propaga-se sequencialmente: _links_X.pais aplica-se aos scorecards seguintes.
 */

import type { Course, Tee, Hole, Ratings } from "./types";

type ScorecardEntry = Record<string, unknown>;
type MelhoriasJson = Record<string, Record<string, unknown>>;

/* ── Helpers ── */

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
    if (v !== null) { total += v; any = true; }
  }
  return any ? total : null;
}

/* ── Tipo intermedio ── */

type TeeKey = string;

type ParsedTee = {
  courseName: string;
  teeName: string;
  cr: number | null;
  slope: number | null;
  par18: number | null;
  parFront: number | null;
  parBack: number | null;
  holes: Hole[];
  totalDist: number | null;
  frontDist: number | null;
  backDist: number | null;
};

type CourseEntry = {
  courseName: string;
  country: string;
  tees: Map<TeeKey, ParsedTee>;
};

function parseScorecardTee(sc: ScorecardEntry): ParsedTee | null {
  const cr = getNum(sc, "course_rating");
  const slope = getNum(sc, "slope");
  const courseName = getStr(sc, "course_description");
  if (!cr || !slope || !courseName) return null;

  const teeName = getStr(sc, "tee_name") || "Default";
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

function addToCourseMap(
  map: Map<string, CourseEntry>,
  courseKey: string, courseName: string, country: string,
  teeKey: string, parsed: ParsedTee,
) {
  if (!map.has(courseKey)) {
    map.set(courseKey, { courseName, country, tees: new Map() });
  }
  const entry = map.get(courseKey)!;
  if (!entry.country && country) entry.country = country;
  if (!entry.tees.has(teeKey) || (parsed.holes.length > (entry.tees.get(teeKey)?.holes.length ?? 0))) {
    entry.tees.set(teeKey, parsed);
  }
}

/* ── Exportacao principal ── */

export function extractAwayCourses(melhorias: MelhoriasJson): Course[] {
  const courseMap = new Map<string, CourseEntry>();

  for (const [_fedId, playerData] of Object.entries(melhorias)) {
    if (typeof playerData !== "object" || playerData === null) continue;

    let currentCountry = "";

    for (const [key, entry] of Object.entries(playerData)) {
      // Capturar pais de _links_*
      if (key.startsWith("_")) {
        if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
          const pais = (entry as Record<string, unknown>).pais;
          currentCountry = (typeof pais === "string" && pais) ? pais : "";
        }
        continue;
      }

      if (typeof entry !== "object" || entry === null) continue;

      // 1) Formato scorecard FPG
      if (!Array.isArray(entry)) {
        const sc = (entry as Record<string, unknown>).scorecard;
        if (!sc || typeof sc !== "object") continue;
        const parsed = parseScorecardTee(sc as ScorecardEntry);
        if (!parsed) continue;

        const courseKey = `away-${parsed.courseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")}`;
        const teeKey = `${parsed.teeName}|${parsed.cr}|${parsed.slope}`;
        addToCourseMap(courseMap, courseKey, parsed.courseName, currentCountry, teeKey, parsed);
        continue;
      }

      // 2) Formato extra_rounds
      if (key === "extra_rounds") {
        for (const round of entry as unknown[]) {
          const r = round as Record<string, unknown>;
          const campo = typeof r.campo === "string" ? r.campo.trim() : "";
          const categoria = typeof r.categoria === "string" ? r.categoria : "Default";
          const pais = typeof r.pais === "string" ? r.pais : "";
          const dias = Array.isArray(r.dias) ? r.dias as Record<string, unknown>[] : [];
          if (!campo || dias.length === 0) continue;

          const best = dias.reduce<Record<string, unknown> | null>((prev, d) => {
            const ph = Array.isArray(d.par_holes) ? d.par_holes.length : 0;
            const prevH = prev && Array.isArray(prev.par_holes) ? (prev.par_holes as unknown[]).length : 0;
            return ph > prevH ? d : prev;
          }, null);
          if (!best) continue;

          const parHoles = Array.isArray(best.par_holes) ? best.par_holes as number[] : [];
          const metersHoles = Array.isArray(best.meters_holes) ? best.meters_holes as number[] : [];
          const siHoles = Array.isArray(best.stroke_index_holes) ? best.stroke_index_holes as (number | null)[] : [];
          if (parHoles.length === 0) continue;

          let holeStart = 1;
          if (typeof best.hole_range === "string") {
            const m = (best.hole_range as string).match(/^(\d+)/);
            if (m) holeStart = parseInt(m[1], 10);
          }

          const holes: Hole[] = [];
          for (let i = 0; i < parHoles.length; i++) {
            holes.push({
              hole: holeStart + i,
              par: parHoles[i] ?? null,
              si: siHoles[i] ?? null,
              distance: metersHoles[i] ?? null,
            });
          }

          const nHoles = holes.length;
          const parTotal = parHoles.reduce((s, v) => s + (v ?? 0), 0) || null;
          const distTotal = metersHoles.reduce((s, v) => s + (v ?? 0), 0) || null;
          const is9 = nHoles <= 9;
          const isFront = is9 && holeStart <= 1;
          const isBack = is9 && holeStart >= 10;

          const parsed: ParsedTee = {
            courseName: campo,
            teeName: categoria,
            cr: null,
            slope: null,
            par18: is9 ? null : parTotal,
            parFront: isFront ? parTotal : (is9 ? null : parHoles.slice(0, 9).reduce((s, v) => s + (v ?? 0), 0)),
            parBack: isBack ? parTotal : (is9 ? null : parHoles.slice(9).reduce((s, v) => s + (v ?? 0), 0)),
            holes,
            totalDist: is9 ? null : distTotal,
            frontDist: isFront ? distTotal : (is9 ? null : metersHoles.slice(0, 9).reduce((s, v) => s + (v ?? 0), 0)),
            backDist: isBack ? distTotal : (is9 ? null : metersHoles.slice(9).reduce((s, v) => s + (v ?? 0), 0)),
          };

          const courseKey = `away-${campo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")}`;
          const teeKey = `${categoria}|${parsed.cr}|${parsed.slope}`;
          addToCourseMap(courseMap, courseKey, campo, pais || currentCountry, teeKey, parsed);
        }
      }
    }
  }

  // Converter para Course[]
  const courses: Course[] = [];

  for (const [courseKey, { courseName, country, tees }] of courseMap) {
    const teeArr: Tee[] = [];
    let teeIdx = 0;

    for (const [, parsed] of tees) {
      const r18: Ratings = {
        par: parsed.par18,
        courseRating: parsed.cr,
        slopeRating: parsed.slope,
      };

      const rFront: Ratings | undefined =
        parsed.parFront !== null
          ? { par: parsed.parFront, courseRating: parsed.cr ? +(parsed.cr / 2).toFixed(1) : null, slopeRating: parsed.slope }
          : undefined;

      const rBack: Ratings | undefined =
        parsed.parBack !== null
          ? { par: parsed.parBack, courseRating: parsed.cr ? +(parsed.cr / 2).toFixed(1) : null, slopeRating: parsed.slope }
          : undefined;

      teeArr.push({
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
      });
    }

    if (teeArr.length === 0) continue;

    courses.push({
      courseKey,
      master: {
        courseId: courseKey,
        name: courseName,
        country: country || undefined,
        links: { fpg: null, scorecards: null },
        tees: teeArr,
      },
    });
  }

  courses.sort((a, b) => a.master.name.localeCompare(b.master.name, "pt"));
  return courses;
}
