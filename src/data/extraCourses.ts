/**
 * extraCourses.ts
 *
 * Campos "away" adicionados manualmente — para campos onde ainda não
 * há rondas no melhorias.json mas queremos ter no Simulador.
 *
 * Dados extraídos do Hole19 / BlueGolf / scorecards oficiais.
 */

import type { Course, Tee, Hole } from "./types";

/* Marco Simone Golf & Country Club — distâncias por tee (metros) */

// Par e SI são iguais para todos os tees
const msPar = [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5];
const msSI  = [11,1,3,17,13,15,5,9,7, 4,16,12,18,6,2,10,14,8];

// Distâncias por tee (Neri, Bianchi, Gialli/Blu, Verdi/Rossi, Arancio)
const msDistNeri    = [407,435,414,172,344,348,203,480,537, 414,301,499,137,465,438,322,188,570];
const msDistBianchi = [382,411,393,156,330,323,182,460,496, 386,281,467,131,442,402,302,173,517];
const msDistGialli  = [362,388,371,133,302,295,169,421,450, 359,265,421,123,402,375,277,166,478]; // = Blu
const msDistVerdi   = [336,365,342,113,266,258,152,375,420, 347,247,381,103,360,339,255,151,442]; // = Rossi
const msDistArancio = [274,349,302,103,227,231,132,338,382, 307,219,356,91,310,292,225,133,404];

// Distâncias USKids — fonte: "2026 Marco Simone Invitational - Meters" (PDF oficial)
const msDistUKBoys12 = [274,349,302,113,266,258,152,375,382, 307,247,381,103,310,292,255,151,442]; // 4959m
const msDistUKBoys11 = [274,299,272,103,227,231,132,338,352, 267,219,356,91,270,237,225,133,404]; // 4430m (= Boys 10)
const msDistUKBoys9  = [240,262,238,103,200,201,127,298,308, 234,219,291,91,236,225,190,133,354]; // 3949m

function msHoles(dist: number[]): Hole[] {
  return dist.map((d, i) => ({
    hole: i + 1,
    par: msPar[i],
    si: msSI[i],
    distance: d,
  }));
}

function msDist(dist: number[]): { total: number; front9: number; back9: number; holesCount: 18; complete18: true } {
  const front9 = dist.slice(0, 9).reduce((a, b) => a + b, 0);
  const back9 = dist.slice(9).reduce((a, b) => a + b, 0);
  return { total: front9 + back9, front9, back9, holesCount: 18, complete18: true };
}

const marcoSimoneTees: Tee[] = [
  {
    teeId: "ms-neri",
    sex: "M",
    teeName: "Neri",
    scorecardMeta: { teeColor: "#1a1a1a" },
    ratings: {
      holes18: { par: 72, courseRating: null, slopeRating: null }, // CR 76.2 / Sl 140 — dados de 2021, campo remodelado
    },
    holes: msHoles(msDistNeri),
    distances: msDist(msDistNeri),
  },
  {
    teeId: "ms-bianchi",
    sex: "M",
    teeName: "Bianchi",
    scorecardMeta: { teeColor: "#ffffff" },
    ratings: {
      holes18: { par: 72, courseRating: null, slopeRating: null }, // CR 74.1 / Sl 133 — dados de 2021, campo remodelado
    },
    holes: msHoles(msDistBianchi),
    distances: msDist(msDistBianchi),
  },
  {
    teeId: "ms-gialli",
    sex: "M",
    teeName: "Gialli",
    scorecardMeta: { teeColor: "#fbbf24" },
    ratings: {
      holes18: { par: 72, courseRating: 72.1, slopeRating: 129 },
    },
    holes: msHoles(msDistGialli),
    distances: msDist(msDistGialli),
  },
  {
    teeId: "ms-verdi",
    sex: "M",
    teeName: "Verdi",
    scorecardMeta: { teeColor: "#22c55e" },
    ratings: {
      holes18: { par: 72, courseRating: 69.6, slopeRating: 125 },
    },
    holes: msHoles(msDistVerdi),
    distances: msDist(msDistVerdi),
  },
  {
    teeId: "ms-blu",
    sex: "F",
    teeName: "Blu",
    scorecardMeta: { teeColor: "#3b82f6" },
    ratings: {
      holes18: { par: 72, courseRating: 78.0, slopeRating: 144 },
    },
    holes: msHoles(msDistGialli),  // Blu usa mesmas distâncias que Gialli
    distances: msDist(msDistGialli),
  },
  {
    teeId: "ms-rossi",
    sex: "F",
    teeName: "Rossi",
    scorecardMeta: { teeColor: "#ef4444" },
    ratings: {
      holes18: { par: 72, courseRating: 75.0, slopeRating: 137 },
    },
    holes: msHoles(msDistVerdi),  // Rossi usa mesmas distâncias que Verdi
    distances: msDist(msDistVerdi),
  },
  {
    teeId: "ms-arancio",
    sex: "F",
    teeName: "Arancio",
    scorecardMeta: { teeColor: "#f97316" },
    ratings: {
      holes18: { par: 72, courseRating: 71.3, slopeRating: 130 },
    },
    holes: msHoles(msDistArancio),
    distances: msDist(msDistArancio),
  },
];

const marcoSimone: Course = {
  courseKey: "away-marco-simone",
  master: {
    courseId: "away-marco-simone",
    name: "Marco Simone Golf & Country Club",
    country: "Itália",
    links: {
      fpg: null,
      scorecards: "https://golfmarcosimone.com/the-holes/",
    },
    tees: marcoSimoneTees,
  },
};

/* Marco Simone — tees USKids (distâncias oficiais do torneio) */
// CR/Slope: "US Kids 2025 Boys 9-11 & Girls 10-14" — ReportTabellaEgaWHS_us_kids.pdf
// Gialli (CR 65.5 / SR 114) ≈ Boys 11/10; Verdi (CR 63.1 / SR 108) ≈ Boys 9
const marcoSimoneUSKidsTees: Tee[] = [
  {
    teeId: "ms-uk-boys12",
    sex: "M",
    teeName: "USKids Boys 12",
    scorecardMeta: { teeColor: "#f97316" }, // laranja (arancio)
    ratings: {
      holes18: { par: 72, courseRating: null, slopeRating: null }, // sem rating oficial para este tee
    },
    holes: msHoles(msDistUKBoys12),
    distances: msDist(msDistUKBoys12),
  },
  {
    teeId: "ms-uk-boys11",
    sex: "M",
    teeName: "USKids Boys 11/10",
    scorecardMeta: { teeColor: "#fbbf24" }, // amarelo (gialli)
    ratings: {
      holes18: { par: 72, courseRating: 65.5, slopeRating: 114 },
    },
    holes: msHoles(msDistUKBoys11),
    distances: msDist(msDistUKBoys11),
  },
  {
    teeId: "ms-uk-boys9",
    sex: "M",
    teeName: "USKids Boys 9",
    scorecardMeta: { teeColor: "#22c55e" }, // verde (verdi)
    ratings: {
      holes18: { par: 72, courseRating: 63.1, slopeRating: 108 },
    },
    holes: msHoles(msDistUKBoys9),
    distances: msDist(msDistUKBoys9),
  },
];

const marcoSimoneUSKids: Course = {
  courseKey: "away-marco-simone-uskids",
  master: {
    courseId: "away-marco-simone-uskids",
    name: "Marco Simone Golf & Country Club (USKids)",
    country: "Itália",
    links: {
      fpg: null,
      scorecards: "https://tournaments.uskidsgolf.com/node/514018",
    },
    tees: marcoSimoneUSKidsTees,
  },
};

/* Exportação */

/** Campos extra adicionados manualmente (ainda sem rondas no melhorias.json) */
export function getExtraCourses(): Course[] {
  return [marcoSimone, marcoSimoneUSKids];
}
