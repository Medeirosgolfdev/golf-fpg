import { describe, it, expect } from "vitest";
import { buildAllCourses, splitCourses } from "../courses";
import type { Course } from "../types";

/** Fusão dos campos (antes no App.tsx; desde 21/10/2026 em src/data/courses.ts,
 *  carregada só nas páginas que usam campos). */
function curso(courseKey: string, name: string, teeName = "Amarelas", total = 5000): Course {
  return {
    courseKey,
    master: {
      courseId: courseKey,
      name,
      links: { fpg: null, scorecards: null },
      tees: [{
        teeId: `${courseKey}-${teeName}`, teeName, sex: "M",
        distances: { total, holesCount: 18 },
        ratings: { holes18: { courseRating: 70, slopeRating: 125 } },
      }],
    },
  } as unknown as Course;
}

describe("buildAllCourses", () => {
  it("funde pelo nome canónico e o campo FPG fica com os tees oficiais", () => {
    const fpg = curso("aroeira", "Aroeira");
    const away = curso("away-aroeira", "Aroeira", "Vermelhas", 4500);
    const out = buildAllCourses({ fpg: [fpg], pipelineAway: [away], melhoriasAway: [], extra: [] });
    expect(out).toHaveLength(1);
    expect(out[0].courseKey).toBe("aroeira");
    expect(out[0].master.tees.map((t) => t.teeName)).toEqual(["Amarelas"]);
  });

  it("junta o course-players.json ao campo PT (quem jogou)", () => {
    const fpg = curso("ss", "Santo da Serra");
    const ronda = { date: "2026-01-01", gross: 80, toPar: 8, tee: "Amarelas", event: null, sd: 10 };
    const out = buildAllCourses({
      fpg: [fpg], pipelineAway: [], melhoriasAway: [], extra: [],
      coursePlayers: { ss: { "52884": [ronda] } },
    });
    expect(out[0].master._players).toEqual({ "52884": [ronda] });
    const sem = buildAllCourses({ fpg: [fpg], pipelineAway: [], melhoriasAway: [], extra: [] });
    expect(sem[0].master._players).toBeUndefined();
  });

  it("campos away: SI 1..n seguido e par 4×18 contam como inventados e vêm de outro tee", () => {
    const parReal = [4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4];
    const siReal = [9, 17, 3, 1, 11, 7, 15, 5, 13, 10, 18, 4, 2, 12, 8, 16, 6, 14];
    const tee = (teeName: string, par: number[], si: number[], total: number) => ({
      teeId: teeName, teeName, sex: "U",
      distances: { total, holesCount: 18 },
      ratings: { holes18: { par: 72, courseRating: 70, slopeRating: 125 } },
      holes: par.map((p, i) => ({ hole: i + 1, par: p, si: si[i], distance: 300 })),
    });
    const seq = Array.from({ length: 18 }, (_, i) => i + 1);
    const away = {
      courseKey: "away-x", master: { courseId: "away-x", name: "X", links: { fpg: null, scorecards: null }, tees: [
        tee("Brancas", parReal, siReal, 5800),
        tee("Amarelas", Array(18).fill(4), seq, 5400), // par e SI inventados pelo clube
      ] },
    } as unknown as Course;
    const out = buildAllCourses({ fpg: [], pipelineAway: [away], melhoriasAway: [], extra: [] });
    const am = out[0].master.tees.find((t) => t.teeName === "Amarelas")!;
    expect(am.holes!.map((h) => h.par)).toEqual(parReal);
    expect(am.holes!.map((h) => h.si)).toEqual(siReal);
  });

  it("o mesmo tee com ratings de anos diferentes fica com o mais recente", () => {
    const t = (cr: number, lastPlayed: string) => ({
      teeId: `b-${cr}`, teeName: "Brancas", sex: "M", lastPlayed,
      distances: { total: 5800, holesCount: 18 },
      ratings: { holes18: { par: 72, courseRating: cr, slopeRating: 130 } },
      holes: Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, si: i + 1, distance: 322 })),
    });
    const away = { courseKey: "away-z", master: { courseId: "away-z", name: "Z", links: { fpg: null, scorecards: null },
      tees: [t(74, "2021-09-23"), t(72, "2025-09-18"), t(72.4, "2024-09-19")] } } as unknown as Course;
    const out = buildAllCourses({ fpg: [], pipelineAway: [away], melhoriasAway: [], extra: [] });
    expect(out[0].master.tees.map((x) => x.ratings.holes18?.courseRating)).toEqual([72]);
  });

  it("tee sem metros do outro sexo fica e herda os metros do mesmo tee físico", () => {
    const holes = (d: number) => Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, si: null, distance: d }));
    const away = { courseKey: "away-w", master: { courseId: "away-w", name: "W", links: { fpg: null, scorecards: null }, tees: [
      { teeId: "bm", teeName: "Brancas", sex: "M", distances: { total: 5760, holesCount: 18 }, ratings: { holes18: { par: 72, courseRating: 72, slopeRating: 140 } }, holes: holes(320) },
      { teeId: "bf", teeName: "Brancas", sex: "F", distances: { total: 0, holesCount: 18 }, ratings: { holes18: { par: 72, courseRating: 76, slopeRating: 145 } }, holes: holes(0) },
      { teeId: "bm2", teeName: "Brancas", sex: "M", distances: { total: 0, holesCount: 18 }, ratings: { holes18: { par: 72, courseRating: 70, slopeRating: 130 } }, holes: holes(0) },
    ] } } as unknown as Course;
    const out = buildAllCourses({ fpg: [], pipelineAway: [away], melhoriasAway: [], extra: [] });
    const tees = out[0].master.tees;
    expect(tees.map((x) => `${x.sex} ${x.ratings.holes18?.courseRating} ${x.distances.total}`).sort()).toEqual(["F 76 5760", "M 72 5760"]);
  });

  it("tee USKids sem metros fica como está (é por escalão, não por cor)", () => {
    const holes = (d: number | null, n = 18) => Array.from({ length: n }, (_, i) => ({ hole: i + 1, par: 4, si: null, distance: d }));
    const extra = { courseKey: "away-u", master: { courseId: "away-u", name: "U", links: { fpg: null, scorecards: null }, tees: [
      { teeId: "b", teeName: "USKids Boys 13-18", sex: "M", distances: { total: 5729, holesCount: 18 }, ratings: { holes18: { par: 72, courseRating: 70.9, slopeRating: 124 } }, holes: holes(318) },
      { teeId: "g", teeName: "USKids Girls 15-18", sex: "F", distances: { total: null, holesCount: 18 }, ratings: { holes18: { par: 72, courseRating: 72.2, slopeRating: 121 } }, holes: holes(null) },
      { teeId: "g9", teeName: "USKids Girls 9-10", sex: "F", distances: { total: null, holesCount: 9 }, ratings: { holes9Back: { par: 36, courseRating: 31.2, slopeRating: 96 } }, holes: holes(null, 9) },
    ] } } as unknown as Course;
    const tees = buildAllCourses({ fpg: [], pipelineAway: [], melhoriasAway: [], extra: [extra] })[0].master.tees;
    expect(tees.map((t) => `${t.teeName} ${t.distances.total ?? 0}`)).toEqual(["USKids Boys 13-18 5729", "USKids Girls 15-18 0", "USKids Girls 9-10 0"]);
  });

  it("campos away: SI seguido sem outro tee com SI verdadeiro fica sem SI", () => {
    const seq = Array.from({ length: 18 }, (_, i) => i + 1);
    const away = {
      courseKey: "away-y", master: { courseId: "away-y", name: "Y", links: { fpg: null, scorecards: null }, tees: [{
        teeId: "b", teeName: "Brancas", sex: "U", distances: { total: 5800, holesCount: 18 },
        ratings: { holes18: { par: 72, courseRating: 70, slopeRating: 125 } },
        holes: seq.map((n) => ({ hole: n, par: 4, si: n, distance: 300 })),
      }] },
    } as unknown as Course;
    const out = buildAllCourses({ fpg: [], pipelineAway: [away], melhoriasAway: [], extra: [] });
    expect(out[0].master.tees[0].holes!.every((h) => h.si == null && h.par == null)).toBe(true);
  });
});

describe("splitCourses", () => {
  it("separa campos reais de torneios", () => {
    const { simCourses, tournamentCourses } = splitCourses([curso("aroeira", "Aroeira")]);
    expect(simCourses).toHaveLength(1);
    expect(tournamentCourses).toHaveLength(0);
  });
});
