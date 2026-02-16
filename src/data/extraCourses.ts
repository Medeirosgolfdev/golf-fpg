/**
 * extraCourses.ts
 *
 * Campos "away" adicionados manualmente — para campos onde ainda não
 * há rondas no melhorias.json mas queremos ter no Simulador.
 *
 * Dados extraídos do Hole19 / BlueGolf / scorecards oficiais.
 */

import type { Course, Tee, Hole } from "./types";

/* Marco Simone Golf & Country Club */

const marcoSimoneHoles: Hole[] = [
  // Par: 4,5,3,4,4,5,4,3,4 | 4,5,3,4,4,5,3,4,4 = 72
  // SI:  11,1,3,17,13,15,5,9,7 | 4,16,12,18,6,2,10,14,8
  { hole: 1,  par: 4, si: 11, distance: null },
  { hole: 2,  par: 5, si: 1,  distance: null },
  { hole: 3,  par: 3, si: 3,  distance: null },
  { hole: 4,  par: 4, si: 17, distance: null },
  { hole: 5,  par: 4, si: 13, distance: null },
  { hole: 6,  par: 5, si: 15, distance: null },
  { hole: 7,  par: 4, si: 5,  distance: null },
  { hole: 8,  par: 3, si: 9,  distance: null },
  { hole: 9,  par: 4, si: 7,  distance: null },
  { hole: 10, par: 4, si: 4,  distance: null },
  { hole: 11, par: 5, si: 16, distance: null },
  { hole: 12, par: 3, si: 12, distance: null },
  { hole: 13, par: 4, si: 18, distance: null },
  { hole: 14, par: 4, si: 6,  distance: null },
  { hole: 15, par: 5, si: 2,  distance: null },
  { hole: 16, par: 3, si: 10, distance: null },
  { hole: 17, par: 4, si: 14, distance: null },
  { hole: 18, par: 4, si: 8,  distance: null },
];

function msTeeName(name: string): string { return name; }

const marcoSimoneTees: Tee[] = [
  {
    teeId: "ms-neri",
    sex: "M",
    teeName: msTeeName("Neri"),
    scorecardMeta: { teeColor: "#1a1a1a" },
    ratings: {
      holes18: { par: 72, courseRating: 76.2, slopeRating: 140 },
    },
    holes: marcoSimoneHoles,
    distances: { total: 6674, front9: 3340, back9: 3334, holesCount: 18, complete18: true },
  },
  {
    teeId: "ms-bianchi",
    sex: "M",
    teeName: msTeeName("Bianchi"),
    scorecardMeta: { teeColor: "#ffffff" },
    ratings: {
      holes18: { par: 72, courseRating: 74.1, slopeRating: 133 },
    },
    holes: marcoSimoneHoles,
    distances: { total: 6234, front9: 3133, back9: 3101, holesCount: 18, complete18: true },
  },
  {
    teeId: "ms-gialli",
    sex: "M",
    teeName: msTeeName("Gialli"),
    scorecardMeta: { teeColor: "#fbbf24" },
    ratings: {
      holes18: { par: 72, courseRating: 72.1, slopeRating: 129 },
    },
    holes: marcoSimoneHoles,
    distances: { total: 5757, front9: 2891, back9: 2866, holesCount: 18, complete18: true },
  },
  {
    teeId: "ms-verdi",
    sex: "M",
    teeName: msTeeName("Verdi"),
    scorecardMeta: { teeColor: "#22c55e" },
    ratings: {
      holes18: { par: 72, courseRating: 69.6, slopeRating: 125 },
    },
    holes: marcoSimoneHoles,
    distances: { total: 5252, front9: 2627, back9: 2625, holesCount: 18, complete18: true },
  },
  {
    teeId: "ms-blu",
    sex: "F",
    teeName: msTeeName("Blu"),
    scorecardMeta: { teeColor: "#3b82f6" },
    ratings: {
      holes18: { par: 72, courseRating: 78.0, slopeRating: 144 },
    },
    holes: marcoSimoneHoles,
    distances: { total: 5757, front9: 2891, back9: 2866, holesCount: 18, complete18: true },
  },
  {
    teeId: "ms-rossi",
    sex: "F",
    teeName: msTeeName("Rossi"),
    scorecardMeta: { teeColor: "#ef4444" },
    ratings: {
      holes18: { par: 72, courseRating: 75.0, slopeRating: 137 },
    },
    holes: marcoSimoneHoles,
    distances: { total: 5252, front9: 2627, back9: 2625, holesCount: 18, complete18: true },
  },
  {
    teeId: "ms-arancio",
    sex: "F",
    teeName: msTeeName("Arancio"),
    scorecardMeta: { teeColor: "#f97316" },
    ratings: {
      holes18: { par: 72, courseRating: 71.3, slopeRating: 130 },
    },
    holes: marcoSimoneHoles,
    distances: { total: 4675, front9: 2338, back9: 2337, holesCount: 18, complete18: true },
  },
];

const marcoSimone: Course = {
  courseKey: "away-marco-simone",
  master: {
    courseId: "away-marco-simone",
    name: "Marco Simone Golf & Country Club",
    country: "It\u00e1lia",
    links: {
      fpg: null,
      scorecards: "https://golfmarcosimone.com/the-holes/",
    },
    tees: marcoSimoneTees,
  },
};

/* Exportação */

/** Campos extra adicionados manualmente (ainda sem rondas no melhorias.json) */
export function getExtraCourses(): Course[] {
  return [marcoSimone];
}
