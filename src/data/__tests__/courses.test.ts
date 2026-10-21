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
});

describe("splitCourses", () => {
  it("separa campos reais de torneios", () => {
    const { simCourses, tournamentCourses } = splitCourses([curso("aroeira", "Aroeira")]);
    expect(simCourses).toHaveLength(1);
    expect(tournamentCourses).toHaveLength(0);
  });
});
