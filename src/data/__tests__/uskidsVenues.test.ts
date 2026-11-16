import { describe, it, expect } from "vitest";
import { uskidsIntlYardage, USKIDS_SEDES, camposDoEscalao, teeDaSede } from "../uskidsVenues";
import { getExtraCourses } from "../extraCourses";
import type { Tee } from "../types";

// Grelha USKids das provas internacionais de vários dias (04/11/2026).
describe("uskidsIntlYardage", () => {
  it("Boys 12 = tee 5, 5400–5700 jardas, 18 buracos", () => {
    expect(uskidsIntlYardage("Boys 12")).toMatchObject({ sex: "M", min: 5400, max: 5700, holes: 18 });
  });
  it("Boys 10 e 11 partilham a faixa; Girls 13-14 pelo primeiro número", () => {
    expect(uskidsIntlYardage("Boys 11")?.min).toBe(4800);
    expect(uskidsIntlYardage("Boys 10")?.min).toBe(4800);
    expect(uskidsIntlYardage("Girls 13-14")).toMatchObject({ sex: "F", min: 4800, max: 5100 });
  });
  it("escalões de 9 buracos e nomes sem idade", () => {
    expect(uskidsIntlYardage("Boys 8")?.holes).toBe(9);
    expect(uskidsIntlYardage("Absoluto")).toBeNull();
  });
  it("Spanish Open 2026: Boys 12 no Old Course, os outros no New", () => {
    const sede = USKIDS_SEDES[23132];
    expect(sede.courseKeys).toEqual(["away-the-san-roque-club-old", "away-san-roque"]);
    expect(camposDoEscalao(sede, "Boys 12")).toEqual(["away-the-san-roque-club-old"]);
    expect(camposDoEscalao(sede, "Boys 11")).toEqual(["away-san-roque"]);
    expect(camposDoEscalao(sede, "Girls 13-14")).toEqual(["away-the-san-roque-club-old"]);
    expect(camposDoEscalao(sede, "Girls 15-18")).toEqual(["away-the-san-roque-club-old"]);
    expect(camposDoEscalao(sede, "Girls 11-12")).toEqual(["away-san-roque"]);
  });
});

// Tees oficiais do Spanish Open 2026 («SO26 - METERS» e «SO26 - CR and SLOPE», 16/11/2026).
describe("teeDaSede — Spanish Open 2026 com os tees oficiais", () => {
  const courses = getExtraCourses();
  const r18 = (esc: string) => {
    const r = teeDaSede(23132, esc, courses);
    return r && { campo: r.course.courseKey, total: r.tee.distances.total, cr: (r.tee as Tee).ratings.holes18?.courseRating, slope: (r.tee as Tee).ratings.holes18?.slopeRating, sex: r.tee.sex };
  };
  it("Boys 12: Old Course, tee 5, 4916 m, 66.4/120", () => {
    expect(r18("Boys 12")).toEqual({ campo: "away-the-san-roque-club-old", total: 4916, cr: 66.4, slope: 120, sex: "M" });
  });
  it("Girls 13-14 e 15-18: o mesmo tee, 71.3/121", () => {
    expect(r18("Girls 13-14")).toEqual({ campo: "away-the-san-roque-club-old", total: 4916, cr: 71.3, slope: 121, sex: "F" });
    expect(r18("Girls 15-18")?.cr).toBe(71.3);
  });
  it("Boys 10/11: New Course, tee 4, 4593 m, 66.7/121; Boys 13-14/15-18: tee 6, 5565 m, 69.5/132", () => {
    expect(r18("Boys 11")).toEqual({ campo: "away-san-roque", total: 4593, cr: 66.7, slope: 121, sex: "M" });
    expect(r18("Boys 10")?.total).toBe(4593);
    expect(r18("Boys 13-14")).toEqual({ campo: "away-san-roque", total: 5565, cr: 69.5, slope: 132, sex: "M" });
    expect(r18("Boys 15-18")?.total).toBe(5565);
  });
  it("a nota diz que é oficial", () => {
    expect(teeDaSede(23132, "Boys 12", courses)?.nota).toMatch(/SO26 - METERS/);
  });
  it("Old Course: só o buraco 17 tem a frente do green «morta», em todos os tees", () => {
    const old = courses.find(c => c.courseKey === "away-the-san-roque-club-old")!;
    for (const t of old.master.tees) {
      expect(t.holes.filter(h => h.frenteMorta).map(h => h.hole)).toEqual([17]);
    }
  });
});
