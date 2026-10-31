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
// Mesmo PDF (2025 e 2026 iguais): Boys 15-18 (Tee 7) e 13-14 (Tee 6); Girls 10 com tee próprio.
const msDistUKBoys1518 = [362,388,371,156,330,323,169,460,496, 359,281,467,131,402,375,302,166,517]; // 6055m
const msDistUKBoys1314 = [336,365,342,156,302,295,152,421,450, 347,265,421,123,360,339,277,151,478]; // 5580m
const msDistUKGirls10  = [206,224,204,98,171,172,76,255,264, 200,190,249,91,203,193,163,80,303];       // 3343m

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

/* Marco Simone — tees USKids (distâncias oficiais do torneio) */
// CR/Slope: PDFs USKids «Marco Simone 2025/2026 – Course Rating and Slope»
// (marco_simone_2025/2026_-_course_rating_and_slope.pdf, iguais nos dois anos):
// Boys 9 63,1/108 · Boys 10 e 11 65,5/114 · Boys 12 68,1/120 · Boys 13-14 71,2/127 ·
// Boys 15-18 73,6/132 · Girls 11-12 67,1/120 · Girls 13-14 70/127 · Girls 15-18 73,2/133;
// Girls 10 63,4/113 só no de 2025. Os de Boys 9-11 já vinham do
// ReportTabellaEgaWHS_us_kids.pdf (Gialli/Verdi). As raparigas jogam os tees dos rapazes
// (PDF de metros): Girls 15-18 = Boys 12, 13-14 = Boys 11/10, 11-12 = Boys 9 — o mesmo
// nome nos dois tees (um tee físico); as raparigas vêm depois para o nome dar o dos rapazes.
const marcoSimoneUSKidsTees: Tee[] = [
  {
    teeId: "ms-uk-boys1518",
    sex: "M",
    teeName: "USKids Boys 15-18",
    ratings: {
      holes18: { par: 72, courseRating: 73.6, slopeRating: 132 },
    },
    holes: msHoles(msDistUKBoys1518),
    distances: msDist(msDistUKBoys1518),
  },
  {
    teeId: "ms-uk-boys1314",
    sex: "M",
    teeName: "USKids Boys 13-14",
    scorecardMeta: { teeColor: "#111827" }, // Longleaf Tee 6
    ratings: {
      holes18: { par: 72, courseRating: 71.2, slopeRating: 127 },
    },
    holes: msHoles(msDistUKBoys1314),
    distances: msDist(msDistUKBoys1314),
  },
  {
    teeId: "ms-uk-boys12",
    sex: "M",
    teeName: "USKids Girls 15-18 / Boys 12",
    scorecardMeta: { teeColor: "#f97316" }, // laranja (arancio)
    ratings: {
      holes18: { par: 72, courseRating: 68.1, slopeRating: 120 },
    },
    holes: msHoles(msDistUKBoys12),
    distances: msDist(msDistUKBoys12),
  },
  {
    teeId: "ms-uk-boys11",
    sex: "M",
    teeName: "USKids Girls 13-14 / Boys 11/10",
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
    teeName: "USKids Girls 11-12 / Boys 9",
    scorecardMeta: { teeColor: "#22c55e" }, // verde (verdi)
    ratings: {
      holes18: { par: 72, courseRating: 63.1, slopeRating: 108 },
    },
    holes: msHoles(msDistUKBoys9),
    distances: msDist(msDistUKBoys9),
  },
  {
    teeId: "ms-uk-girls1518",
    sex: "F",
    teeName: "USKids Girls 15-18 / Boys 12",
    scorecardMeta: { teeColor: "#f97316" }, // = Boys 12
    ratings: {
      holes18: { par: 72, courseRating: 73.2, slopeRating: 133 },
    },
    holes: msHoles(msDistUKBoys12),
    distances: msDist(msDistUKBoys12),
  },
  {
    teeId: "ms-uk-girls1314",
    sex: "F",
    teeName: "USKids Girls 13-14 / Boys 11/10",
    scorecardMeta: { teeColor: "#fbbf24" }, // = Boys 11/10
    ratings: {
      holes18: { par: 72, courseRating: 70.0, slopeRating: 127 },
    },
    holes: msHoles(msDistUKBoys11),
    distances: msDist(msDistUKBoys11),
  },
  {
    teeId: "ms-uk-girls1112",
    sex: "F",
    teeName: "USKids Girls 11-12 / Boys 9",
    scorecardMeta: { teeColor: "#22c55e" }, // = Boys 9
    ratings: {
      holes18: { par: 72, courseRating: 67.1, slopeRating: 120 },
    },
    holes: msHoles(msDistUKBoys9),
    distances: msDist(msDistUKBoys9),
  },
  {
    teeId: "ms-uk-girls10",
    sex: "F",
    teeName: "USKids Girls 10",
    ratings: {
      holes18: { par: 72, courseRating: 63.4, slopeRating: 113 },
    },
    holes: msHoles(msDistUKGirls10),
    distances: msDist(msDistUKGirls10),
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
      extra: [
        {
          label: "US Kids Golf – Resultados",
          url: "https://tournaments.uskidsgolf.com/node/514018",
        },
        {
          label: "US Kids Marco Simone 2026 - Course Rating & Slope",
          url: "https://tournaments.uskidsgolf.com/sites/default/files/marco_simone_2026_-_course_rating_and_slope.pdf",
        },
      ],
    },
    tees: [...marcoSimoneTees, ...marcoSimoneUSKidsTees],
  },
};



/* ─────────────────────────────────────────────────────────────────────────
   Doral Junior Golf Classic — First Tee Miami (ftm_doral_*.json)
   Fonte: "Divisions and Approximate Yardages" (documento oficial do torneio)
   Todos os valores convertidos de JARDAS para METROS (×0.9144).
   ⚠ SI não está disponível para nenhum campo do Doral — todos os si = 0.
   ────────────────────────────────────────────────────────────────────── */

//
// COURSE: RED TIGER — Boys 7-9 (9 buracos, começam no buraco 10)
// Mesma layout para os dois escalões, distâncias diferentes
//
const doralRTParB9 = [5,3,5,4,3,4,3,4,5]; // par 36, buracos 10-18

// Boys 8-9 — original (jds): [270,86,285,210,92,200,117,217,300]
const doralRTDistB89 = [247,79,261,192,84,183,107,198,274]; // 1625m

// Boys 7 & Under — original (jds): [235,86,230,175,92,170,85,180,230]
const doralRTDistB7  = [215,79,210,160,84,155,78,165,210];  // 1356m

//
// COURSE: GOLDEN PALM — Boys 10-11 (18 buracos, 69.0/130) e Boys 14-15 (72.0/136)
// Par 71 — layout igual para os dois escalões
//
const doralGPPar = [4,5,4,5,4,4,3,4,3, 4,5,3,4,4,3,5,3,4]; // par 71

// Boys 10-11 (69.0/130) — original (jds): [301,456,354,442,324,357,144,295,139, 289,465,114,275,331,124,485,152,299]
const doralGPDistB1011 = [275,417,324,404,296,326,132,270,127, 264,425,104,251,303,113,443,139,273]; // 4888m

// Boys 14-15 (72.0/136) — original (jds): [387,520,387,539,389,386,145,395,179, 330,540,150,343,401,146,533,174,389]
const doralGPDistB1415 = [354,475,354,493,356,353,133,361,164, 302,494,137,314,367,134,487,159,356]; // 5791m

//
// COURSE: SILVER FOX — Boys 12-13 (18 buracos, 74.0/140)
// Par 71
//
const doralSFPar      = [4,4,5,3,4,4,3,4,4, 4,5,4,4,4,3,5,3,4]; // par 71
// original (jds): [351,340,498,142,320,347,135,340,335, 343,465,328,307,305,137,468,132,333]
const doralSFDistB1213 = [321,311,455,130,293,317,123,311,306, 314,425,300,281,279,125,428,121,304]; // 5144m

//
// COURSE: BLUE MONSTER — Boys 16-18 (18 buracos, 74.0/140)
// Par 72
//
const doralBMPar       = [5,4,4,3,4,4,4,5,3, 5,4,5,3,4,3,4,4,4]; // par 72
// original (jds): [559,381,393,176,378,402,435,528,185, 560,326,589,197,439,133,313,410,433]
const doralBMDistB1618 = [511,348,359,161,346,368,398,483,169, 512,298,539,180,401,122,286,375,396]; // 6252m

// Helper: 9 buracos (sem si disponível → si=0)
function doralHoles9(par: number[], dist: number[], startHole: number): Hole[] {
  return dist.map((d, i) => ({ hole: startHole + i, par: par[i], si: 0, distance: d }));
}

// Helper: 18 buracos (sem si disponível → si=0)
function doralHoles18(par: number[], dist: number[]): Hole[] {
  return dist.map((d, i) => ({ hole: i + 1, par: par[i], si: 0, distance: d }));
}

function doralDist18(dist: number[]): { total: number; front9: number; back9: number; holesCount: 18; complete18: true } {
  const front9 = dist.slice(0, 9).reduce((a, b) => a + b, 0);
  const back9  = dist.slice(9).reduce((a, b) => a + b, 0);
  return { total: front9 + back9, front9, back9, holesCount: 18, complete18: true };
}

// Red Tiger — agrupado num único Course com 2 tees (por escalão)
/* Tees do resort — USGA National Course Rating Database (ncrdb.usga.org, lida a
   30/10/2026 pelo browser; sem data de rating): CR/Slope por tee e sexo e o comprimento
   total (jardas × 0,9144). Sem metros por buraco nem SI oficiais — par por buraco do
   cartão já usado nos tees USKids quando é o mesmo desenho; sem ele, par só no total. */
function ncrdbTee(teeId: string, sex: "M" | "F", teeName: string, par: number[] | null, parTotal: number, cr: number, slope: number, yards: number, teeColor?: string): Tee {
  return {
    teeId, sex, teeName,
    ...(teeColor ? { scorecardMeta: { teeColor } } : {}),
    ratings: { holes18: { par: parTotal, courseRating: cr, slopeRating: slope } },
    holes: par ? par.map((p, i) => ({ hole: i + 1, par: p, si: null, distance: null })) : [],
    distances: { total: Math.round(yards * 0.9144), front9: null, back9: null, holesCount: 18, complete18: false },
  };
}

const doralGPUsgaTees: Tee[] = [
  ncrdbTee("doralGP-black-m", "M", "Black", doralGPPar, 71, 74.2, 139, 6807, "#000000"),
  ncrdbTee("doralGP-gold-m", "M", "Gold", doralGPPar, 71, 72, 134, 6332, "#daa520"),
  ncrdbTee("doralGP-blue-m", "M", "Blue", doralGPPar, 71, 69.9, 133, 5958, "#3b82f6"),
  ncrdbTee("doralGP-white-m", "M", "White", doralGPPar, 71, 68.6, 128, 5656, "#ffffff"),
  ncrdbTee("doralGP-red-m", "M", "Red", doralGPPar, 71, 65.1, 121, 4858, "#ef4444"),
  ncrdbTee("doralGP-white-f", "F", "White", doralGPPar, 71, 74.8, 142, 5656, "#ffffff"),
  ncrdbTee("doralGP-red-f", "F", "Red", doralGPPar, 71, 70.2, 132, 4858, "#ef4444"),
];
const doralRTUsgaTees: Tee[] = [
  ncrdbTee("doralRT-black-m", "M", "Black", null, 72, 71.8, 136, 6395, "#000000"),
  ncrdbTee("doralRT-gold-m", "M", "Gold", null, 72, 69.6, 132, 5918, "#daa520"),
  ncrdbTee("doralRT-blue-m", "M", "Blue", null, 72, 68.6, 127, 5660, "#3b82f6"),
  ncrdbTee("doralRT-white-m", "M", "White", null, 72, 66.2, 120, 5229, "#ffffff"),
  ncrdbTee("doralRT-red-m", "M", "Red", null, 72, 63.4, 115, 4525, "#ef4444"),
  ncrdbTee("doralRT-gold-f", "F", "Gold", null, 72, 75.6, 140, 5918, "#daa520"),
  ncrdbTee("doralRT-blue-f", "F", "Blue", null, 72, 74.2, 137, 5660, "#3b82f6"),
  ncrdbTee("doralRT-white-f", "F", "White", null, 72, 71.9, 132, 5229, "#ffffff"),
  ncrdbTee("doralRT-red-f", "F", "Red", null, 72, 67.9, 123, 4525, "#ef4444"),
];
const doralSFUsgaTees: Tee[] = [
  ncrdbTee("doralSF-black-m", "M", "Black", doralSFPar, 71, 74.9, 148, 6906, "#000000"),
  ncrdbTee("doralSF-gold-m", "M", "Gold", doralSFPar, 71, 72.6, 143, 6398, "#daa520"),
  ncrdbTee("doralSF-blue-m", "M", "Blue", doralSFPar, 71, 69.8, 135, 5861, "#3b82f6"),
  ncrdbTee("doralSF-white-m", "M", "White", doralSFPar, 71, 67.6, 128, 5462, "#ffffff"),
  ncrdbTee("doralSF-red-m", "M", "Red", doralSFPar, 71, 63.6, 120, 4478, "#ef4444"),
  ncrdbTee("doralSF-white-f", "F", "White", doralSFPar, 71, 73.5, 141, 5462, "#ffffff"),
  ncrdbTee("doralSF-red-f", "F", "Red", doralSFPar, 71, 67.8, 121, 4478, "#ef4444"),
];
const doralBMUsgaTees: Tee[] = [
  ncrdbTee("doralBM-black-m", "M", "Black", doralBMPar, 72, 77.4, 146, 7545, "#000000"),
  ncrdbTee("doralBM-gold-m", "M", "Gold", doralBMPar, 72, 75, 140, 7023, "#daa520"),
  ncrdbTee("doralBM-blue-m", "M", "Blue", doralBMPar, 72, 73.5, 139, 6721, "#3b82f6"),
  ncrdbTee("doralBM-white-m", "M", "White", doralBMPar, 72, 71.7, 139, 6360, "#ffffff"),
  ncrdbTee("doralBM-red-m", "M", "Red", doralBMPar, 72, 67.6, 132, 5480, "#ef4444"),
  ncrdbTee("doralBM-white-f", "F", "White", doralBMPar, 72, 78.8, 144, 6360, "#ffffff"),
  ncrdbTee("doralBM-red-f", "F", "Red", doralBMPar, 72, 72.9, 138, 5480, "#ef4444"),
];

const doralRedTiger: Course = {
  courseKey: "away-doral-red-tiger",
  master: {
    courseId: "away-doral-red-tiger",
    name: "Trump Doral - Red Tiger",
    country: "EUA",
    links: { fpg: null, scorecards: "https://firstteemediaonline.com" },
    tees: [
      {
        teeId: "doral-rt-b89",
        sex: "M",
        teeName: "Boys 8-9",
        scorecardMeta: { teeColor: "#ef4444" },
        ratings: { holes18: { par: 36, courseRating: null, slopeRating: null } },
        // 9 buracos (holes 10-18): usar holes[9..17] do scorecard
        holes: doralHoles9(doralRTParB9, doralRTDistB89, 10),
        distances: { total: doralRTDistB89.reduce((a,b)=>a+b,0), front9: 0, back9: doralRTDistB89.reduce((a,b)=>a+b,0), holesCount: 9, complete18: false },
      },
      {
        teeId: "doral-rt-b7u",
        sex: "M",
        teeName: "Boys 7 & Under",
        scorecardMeta: { teeColor: "#fbbf24" },
        ratings: { holes18: { par: 36, courseRating: null, slopeRating: null } },
        holes: doralHoles9(doralRTParB9, doralRTDistB7, 10),
        distances: { total: doralRTDistB7.reduce((a,b)=>a+b,0), front9: 0, back9: doralRTDistB7.reduce((a,b)=>a+b,0), holesCount: 9, complete18: false },
      },
      ...doralRTUsgaTees,
    ],
  },
};

const doralGoldenPalm: Course = {
  courseKey: "away-doral-golden-palm",
  master: {
    courseId: "away-doral-golden-palm",
    name: "Trump Doral - Golden Palm",
    country: "EUA",
    links: { fpg: null, scorecards: "https://firstteemediaonline.com" },
    tees: [
      {
        teeId: "doral-gp-b1011",
        sex: "M",
        teeName: "Boys 10-11",
        scorecardMeta: { teeColor: "#22c55e" },
        ratings: { holes18: { par: 71, courseRating: 69.0, slopeRating: 130 } },
        holes: doralHoles18(doralGPPar, doralGPDistB1011),
        distances: doralDist18(doralGPDistB1011),
      },
      {
        teeId: "doral-gp-b1415",
        sex: "M",
        teeName: "Boys 14-15",
        scorecardMeta: { teeColor: "#3b82f6" },
        ratings: { holes18: { par: 71, courseRating: 72.0, slopeRating: 136 } },
        holes: doralHoles18(doralGPPar, doralGPDistB1415),
        distances: doralDist18(doralGPDistB1415),
      },
      ...doralGPUsgaTees,
    ],
  },
};

const doralSilverFox: Course = {
  courseKey: "away-doral-silver-fox",
  master: {
    courseId: "away-doral-silver-fox",
    name: "Trump Doral - Silver Fox",
    country: "EUA",
    links: { fpg: null, scorecards: "https://firstteemediaonline.com" },
    tees: [
      {
        teeId: "doral-sf-b1213",
        sex: "M",
        teeName: "Boys 12-13",
        scorecardMeta: { teeColor: "#a855f7" },
        ratings: { holes18: { par: 71, courseRating: 74.0, slopeRating: 140 } },
        holes: doralHoles18(doralSFPar, doralSFDistB1213),
        distances: doralDist18(doralSFDistB1213),
      },
      ...doralSFUsgaTees,
    ],
  },
};

const doralBlueMonster: Course = {
  courseKey: "away-doral-blue-monster",
  master: {
    courseId: "away-doral-blue-monster",
    name: "Trump Doral - Blue Monster",
    country: "EUA",
    links: { fpg: null, scorecards: "https://firstteemediaonline.com" },
    tees: [
      {
        teeId: "doral-bm-b1618",
        sex: "M",
        teeName: "Boys 16-18",
        scorecardMeta: { teeColor: "#1d4ed8" },
        ratings: { holes18: { par: 72, courseRating: 74.0, slopeRating: 140 } },
        holes: doralHoles18(doralBMPar, doralBMDistB1618),
        distances: doralDist18(doralBMDistB1618),
      },
      ...doralBMUsgaTees,
    ],
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   Le Touquet Golf Club — European Open WAGR 2025 (11/08/2025)
   Fonte: scorecards BluGolf (exportadas em PDF/HTML)
   Dois campos distintos usados em escalões diferentes:
     La Forêt — Boys 11-12  (Manuel)
     La Mer   — Boys 13-14  (tee White BJGT)
   ────────────────────────────────────────────────────────────────────── */

// Par e SI — La Forêt (partilhados, apenas 1 tee usado no torneio)
const ltForetPar = [5,4,4,4,5,3,4,3,4, 4,5,3,4,4,3,5,4,4]; // par 72
const ltForetSI  = [9,11,13,5,7,17,3,15,1, 12,6,8,2,16,14,10,4,18];

// Distâncias La Forêt — Vermelho (71.5/120) — convertidas de JARDAS para METROS (×0.9144)
// Original (jardas): [418,274,274,367,410,127,323,132,339, 307,404,141,312,288,125,413,328,272]
// Total: 5254yd → 4805m
const ltForetDistVermelho = [382,251,251,336,375,116,295,121,310, 281,369,129,285,263,114,378,300,249];

// Par e SI — La Mer (partilhados)
const ltMerPar = [5,3,4,5,4,4,3,4,4, 3,5,4,4,4,5,3,4,4]; // par 72
const ltMerSI  = [8,4,18,14,10,16,12,6,2, 17,1,7,3,5,11,9,15,13];

// Distâncias La Mer — White BJGT (73.3/136) — convertidas de JARDAS para METROS (×0.9144)
// Original jardas: [469,198,336,455,409,319,146,349,406, 139,422,367,382,377,465,180,456,384]
const ltMerDistWhiteBJGT = [429,181,307,416,374,292,134,319,371, 127,386,336,349,345,425,165,417,351];

function ltHoles(par: number[], si: number[], dist: number[]): Hole[] {
  return dist.map((d, i) => ({ hole: i + 1, par: par[i], si: si[i], distance: d }));
}

function ltDist(dist: number[]): { total: number; front9: number; back9: number; holesCount: 18; complete18: true } {
  const front9 = dist.slice(0, 9).reduce((a, b) => a + b, 0);
  const back9  = dist.slice(9).reduce((a, b) => a + b, 0);
  return { total: front9 + back9, front9, back9, holesCount: 18, complete18: true };
}

/* Tees do clube — FFGolf (SSS e slope oficiais, «officiellement étalonné», lidos a
   30/10/2026; golf 0065, terrain 12 = La Forêt, 02 = La Mer) + cartões do clube (Resonance
   Golf, Abril 2023: par, SI e metros). La Forêt: o «Vermelho» do torneio são os metros do
   Rouge, mas com o rating do European Open (71,5/120 ≠ Rouge 66,1/117 H · 71,0/125 F) — fica.
   La Mer: o clube tem par 71 (buraco 11 par 4); o tee BJGT tem par 72. As «jardas» do BJGT
   coincidem com os METROS do Blanc em 16 dos 18 buracos — a confirmar antes de mexer.
   Sem rating de senhoras nos tees de trás. */
const ltForetFfgPar = [5,4,4,4,5,3,4,3,4,4,5,3,4,4,3,5,4,4];
const ltForetFfgSI = [9,11,13,3,7,15,5,17,1,4,10,16,2,14,18,12,6,8];
const ltForetFfgBlanc = [440,294,330,415,472,152,354,153,382,335,482,161,349,310,145,454,373,314]; // 5915 m
const ltForetFfgJaune = [422,286,312,400,446,135,337,135,366,320,466,148,334,295,134,436,354,295]; // 5621 m
const ltForetFfgBleu = [390,262,278,360,405,130,314,133,326,281,401,133,294,273,119,417,335,269]; // 5120 m
const ltForetFfgRouge = [382,251,251,336,375,116,295,121,310,281,369,129,285,263,114,378,300,249]; // 4805 m
const ltForetFfgViolet = [315,210,251,282,350,105,267,121,215,239,369,105,250,205,95,315,260,249]; // 4203 m
const ltForetFfgTees: Tee[] = [
  { teeId: "ltForetFfg-blanc-m", sex: "M", teeName: "Blanc", scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 72, courseRating: 71.7, slopeRating: 131 } },
    holes: vHoles(ltForetFfgPar, ltForetFfgBlanc, ltForetFfgSI), distances: vDist(ltForetFfgBlanc) },
  { teeId: "ltForetFfg-jaune-m", sex: "M", teeName: "Jaune", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 72, courseRating: 70.2, slopeRating: 126 } },
    holes: vHoles(ltForetFfgPar, ltForetFfgJaune, ltForetFfgSI), distances: vDist(ltForetFfgJaune) },
  { teeId: "ltForetFfg-bleu-m", sex: "M", teeName: "Bleu", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 72, courseRating: 67.7, slopeRating: 121 } },
    holes: vHoles(ltForetFfgPar, ltForetFfgBleu, ltForetFfgSI), distances: vDist(ltForetFfgBleu) },
  { teeId: "ltForetFfg-rouge-m", sex: "M", teeName: "Rouge", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 72, courseRating: 66.1, slopeRating: 117 } },
    holes: vHoles(ltForetFfgPar, ltForetFfgRouge, ltForetFfgSI), distances: vDist(ltForetFfgRouge) },
  { teeId: "ltForetFfg-violet-m", sex: "M", teeName: "Violet", scorecardMeta: { teeColor: "#8b5cf6" },
    ratings: { holes18: { par: 72, courseRating: 62.8, slopeRating: 114 } },
    holes: vHoles(ltForetFfgPar, ltForetFfgViolet, ltForetFfgSI), distances: vDist(ltForetFfgViolet) },
  { teeId: "ltForetFfg-jaune-f", sex: "F", teeName: "Jaune", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 72, courseRating: 75.9, slopeRating: 132 } },
    holes: vHoles(ltForetFfgPar, ltForetFfgJaune, ltForetFfgSI), distances: vDist(ltForetFfgJaune) },
  { teeId: "ltForetFfg-bleu-f", sex: "F", teeName: "Bleu", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 72, courseRating: 72.8, slopeRating: 125 } },
    holes: vHoles(ltForetFfgPar, ltForetFfgBleu, ltForetFfgSI), distances: vDist(ltForetFfgBleu) },
  { teeId: "ltForetFfg-rouge-f", sex: "F", teeName: "Rouge", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 72, courseRating: 71, slopeRating: 125 } },
    holes: vHoles(ltForetFfgPar, ltForetFfgRouge, ltForetFfgSI), distances: vDist(ltForetFfgRouge) },
  { teeId: "ltForetFfg-violet-f", sex: "F", teeName: "Violet", scorecardMeta: { teeColor: "#8b5cf6" },
    ratings: { holes18: { par: 72, courseRating: 67.2, slopeRating: 122 } },
    holes: vHoles(ltForetFfgPar, ltForetFfgViolet, ltForetFfgSI), distances: vDist(ltForetFfgViolet) },
];
const ltMerFfgPar = [5,3,4,5,4,4,3,4,4,3,4,4,4,4,5,3,4,4];
const ltMerFfgSI = [12,8,18,16,6,14,10,4,2,15,1,7,11,5,17,13,3,9];
const ltMerFfgNoir = [482,208,350,455,420,319,146,349,413,139,437,367,416,416,487,170,410,384]; // 6368 m
const ltMerFfgBlanc = [469,198,336,455,409,319,146,349,406,139,422,367,382,377,465,170,373,384]; // 6166 m
const ltMerFfgJaune = [445,175,321,428,371,296,134,329,370,128,405,351,334,322,433,155,347,373]; // 5717 m
const ltMerFfgBleu = [429,151,294,398,354,279,109,297,315,113,378,324,312,303,405,139,327,340]; // 5267 m
const ltMerFfgRouge = [409,134,277,369,310,269,101,272,278,104,330,280,261,279,374,122,307,334]; // 4810 m
const ltMerFfgTees: Tee[] = [
  { teeId: "ltMerFfg-noir-m", sex: "M", teeName: "Noir", scorecardMeta: { teeColor: "#000000" },
    ratings: { holes18: { par: 71, courseRating: 73.7, slopeRating: 138 } },
    holes: vHoles(ltMerFfgPar, ltMerFfgNoir, ltMerFfgSI), distances: vDist(ltMerFfgNoir) },
  { teeId: "ltMerFfg-blanc-m", sex: "M", teeName: "Blanc", scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 71, courseRating: 72.8, slopeRating: 134 } },
    holes: vHoles(ltMerFfgPar, ltMerFfgBlanc, ltMerFfgSI), distances: vDist(ltMerFfgBlanc) },
  { teeId: "ltMerFfg-jaune-m", sex: "M", teeName: "Jaune", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 71, courseRating: 70.6, slopeRating: 127 } },
    holes: vHoles(ltMerFfgPar, ltMerFfgJaune, ltMerFfgSI), distances: vDist(ltMerFfgJaune) },
  { teeId: "ltMerFfg-bleu-m", sex: "M", teeName: "Bleu", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 71, courseRating: 68.3, slopeRating: 123 } },
    holes: vHoles(ltMerFfgPar, ltMerFfgBleu, ltMerFfgSI), distances: vDist(ltMerFfgBleu) },
  { teeId: "ltMerFfg-rouge-m", sex: "M", teeName: "Rouge", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 71, courseRating: 66, slopeRating: 119 } },
    holes: vHoles(ltMerFfgPar, ltMerFfgRouge, ltMerFfgSI), distances: vDist(ltMerFfgRouge) },
  { teeId: "ltMerFfg-bleu-f", sex: "F", teeName: "Bleu", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 71, courseRating: 73.7, slopeRating: 128 } },
    holes: vHoles(ltMerFfgPar, ltMerFfgBleu, ltMerFfgSI), distances: vDist(ltMerFfgBleu) },
  { teeId: "ltMerFfg-rouge-f", sex: "F", teeName: "Rouge", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 71, courseRating: 70.9, slopeRating: 121 } },
    holes: vHoles(ltMerFfgPar, ltMerFfgRouge, ltMerFfgSI), distances: vDist(ltMerFfgRouge) },
];

const leToquet_LaForet: Course = {
  courseKey: "away-letouquet-foret",
  master: {
    courseId: "away-letouquet-foret",
    name: "Le Touquet Golf Club - La Forêt",
    country: "França",
    links: {
      fpg: null,
      scorecards: "https://www.letouquetgolf.com",
    },
    tees: [
      {
        teeId: "ltforet-vermelho",
        sex: "M",
        teeName: "Vermelho",
        scorecardMeta: { teeColor: "#ef4444" },
        ratings: {
          holes18: { par: 72, courseRating: 71.5, slopeRating: 120 },
        },
        holes: ltHoles(ltForetPar, ltForetSI, ltForetDistVermelho),
        distances: ltDist(ltForetDistVermelho),
      },
    ...ltForetFfgTees,
    ],
  },
};

const leToquet_LaMer: Course = {
  courseKey: "away-letouquet-mer",
  master: {
    courseId: "away-letouquet-mer",
    name: "Golf Du Touquet - La Mer",
    country: "França",
    links: {
      fpg: null,
      scorecards: "https://www.letouquetgolf.com",
    },
    tees: [
      {
        teeId: "ltmer-white-bjgt",
        sex: "M",
        teeName: "White (BJGT)",
        scorecardMeta: { teeColor: "#ffffff" },
        ratings: {
          holes18: { par: 72, courseRating: 73.3, slopeRating: 136 },
        },
        holes: ltHoles(ltMerPar, ltMerSI, ltMerDistWhiteBJGT),
        distances: ltDist(ltMerDistWhiteBJGT),
      },
    ...ltMerFfgTees,
    ],
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   Glen Golf Club — East Links, North Berwick, Escócia (Reino Unido)
   Fonte (campo): scorecard oficial — 6 conjuntos de marcações.
   Fonte (USKids): "2025 U.S. Kids Golf European Championship Yardages" PDF
                   + "Course Rating and Slope" PDF (EUC 2025).
   Distâncias originais em JARDAS, convertidas para METROS (×0.9144) por buraco.

   Tees do campo (CR/Slope oficiais atribuídos em 2017 — ver PDF Course Handicap Table):
     White (M, par 70, 6275y)         — CR 70.6 / Sl 124
     Yellow (M, par 70, 6048y)        — CR 69.5 / Sl 122
     Red (M, par 69, 5773y)           — CR 68.3 / Sl 119
     Blue (M, par 69, 4801y)          — CR 63.9 / Sl 110
     Yellow (F, par 73, 6048y)        — CR 75.5 / Sl 130
     Red (F, par 73, 5773y)           — CR 74.0 / Sl 127
     Blue (F, par 70, 4801y)          — CR 68.2 / Sl 113

   Tees USKids (EUC 2025 — Glen Golf Club hospeda 3 escalões):
     Boys 14 (Tee 6, 6048y, par 72, CR 70.6 / Sl 124) — mesmas marcas que Yellow
     Boys 12 (Tee 5, 5773y, par 72, CR 68.3 / Sl 119) — mesmas marcas que Red
     Girls 12 (Tee 3, 4508y, par 72, CR 66.6 / Sl 110) — yardas próprias
   ────────────────────────────────────────────────────────────────────── */

// SI iguais para White, Yellow, Blue M, Red F
const glenSImain = [9,13,7,17,3,1,15,5,11, 10,14,2,16,6,18,8,4,12];
// SI específicos das marcações Red Men (par 73)
const glenSIredM = [7,9,11,15,3,1,13,5,18, 2,14,12,17,4,8,10,16,6];
// SI das Blue Women (par 69)
const glenSIblueF = [3,9,13,17,5,11,1,7,15, 4,14,16,18,8,2,12,6,10];

// Pares dos tees normais
const glenParWhite  = [4,4,4,3,4,5,4,4,3, 4,4,4,3,4,5,3,4,4]; // 70
const glenParYellow = glenParWhite;                            // 70
const glenParRedM   = [4,4,4,3,4,5,4,4,4, 4,4,5,3,4,5,3,5,4]; // 73
const glenParBlueF  = [4,4,4,3,4,5,4,4,3, 4,4,4,3,4,4,3,4,4]; // 69

// Par USKids (Boys 14, Boys 12, Girls 12) — todos par 72
// Diferem do par do campo nos buracos destacados a laranja no PDF EUC 2025
const glenParUSKids = [4,4,4,3,4,5,4,5,3, 4,4,5,3,4,5,3,4,4]; // 36+36 = 72

// Distâncias por buraco em METROS (yards × 0.9144, arredondado por buraco).
// Yards originais (do scorecard oficial do campo):
//   White : [332,372,366,180,386,536,375,425,204, 346,341,458,148,365,473,190,415,363] = 6275y
//   Yellow: [330,361,343,178,368,488,364,409,200, 344,336,448,136,333,467,186,394,363] = 6048y
//   Red   : [327,343,334,162,354,467,360,379,197, 340,319,432,128,321,399,179,374,358] = 5773y
//   Blue  : [308,299,242,112,337,431,290,337,142, 253,255,315, 92,281,383,163,279,282] = 4801y
const glenDistWhite  = [304,340,335,165,353,490,343,389,187, 316,312,419,135,334,433,174,379,332]; // 5740m
const glenDistYellow = [302,330,314,163,336,446,333,374,183, 315,307,410,124,304,427,170,360,332]; // 5530m
const glenDistRed    = [299,314,305,148,324,427,329,347,180, 311,292,395,117,294,365,164,342,327]; // 5280m
const glenDistBlue   = [282,273,221,102,308,394,265,308,130, 231,233,288, 84,257,350,149,255,258]; // 4388m

// USKids Girls 12 (Tee 3) — yardas próprias do PDF EUC 2025
// Yards: [255,288,290,110,230,370,260,370,110, 253,255,335,102,280,380, 93,245,282] = 4508y
const glenDistUKGirls12 = [233,263,265,101,210,338,238,338,101, 231,233,306, 93,256,348, 85,224,258]; // 4121m

function glenHoles(par: number[], si: number[], dist: number[]): Hole[] {
  return dist.map((d, i) => ({ hole: i + 1, par: par[i], si: si[i], distance: d }));
}

function glenDist(dist: number[]): { total: number; front9: number; back9: number; holesCount: 18; complete18: true } {
  const front9 = dist.slice(0, 9).reduce((a, b) => a + b, 0);
  const back9  = dist.slice(9).reduce((a, b) => a + b, 0);
  return { total: front9 + back9, front9, back9, holesCount: 18, complete18: true };
}

// 7 tees do scorecard oficial do campo (config 2017)
// CR / Slope: PDF oficial "Course Handicap Table" do clube (atribuídos em 2017).
// Pars seguem a configuração oficial de 2017 (não a config alternativa do scorecard impresso
// que tinha Red M par 73 e Blue M par 67 — esse era um setup de competição diferente).
const glenTees: Tee[] = [
  {
    teeId: "glen-white",
    sex: "M",
    teeName: "White",
    scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 70, courseRating: 70.6, slopeRating: 124 } },
    holes: glenHoles(glenParWhite, glenSImain, glenDistWhite),
    distances: glenDist(glenDistWhite),
  },
  {
    teeId: "glen-yellow",
    sex: "M",
    teeName: "Yellow",
    scorecardMeta: { teeColor: "#fbbf24" },
    ratings: { holes18: { par: 70, courseRating: 69.5, slopeRating: 122 } },
    holes: glenHoles(glenParYellow, glenSImain, glenDistYellow),
    distances: glenDist(glenDistYellow),
  },
  {
    teeId: "glen-red-m",
    sex: "M",
    teeName: "Red",
    scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 69, courseRating: 68.3, slopeRating: 119 } },
    holes: glenHoles(glenParBlueF, glenSImain, glenDistRed),
    distances: glenDist(glenDistRed),
  },
  {
    teeId: "glen-blue-m",
    sex: "M",
    teeName: "Blue",
    scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 69, courseRating: 63.9, slopeRating: 110 } },
    holes: glenHoles(glenParBlueF, glenSIblueF, glenDistBlue),
    distances: glenDist(glenDistBlue),
  },
  {
    teeId: "glen-yellow-f",
    sex: "F",
    teeName: "Yellow (F)",
    scorecardMeta: { teeColor: "#fbbf24" },
    ratings: { holes18: { par: 73, courseRating: 75.5, slopeRating: 130 } },
    holes: glenHoles(glenParRedM, glenSImain, glenDistYellow),
    distances: glenDist(glenDistYellow),
  },
  {
    teeId: "glen-blue-f",
    sex: "F",
    teeName: "Blue (F)",
    scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 70, courseRating: 68.2, slopeRating: 113 } },
    holes: glenHoles(glenParWhite, glenSImain, glenDistBlue),
    distances: glenDist(glenDistBlue),
  },
  {
    teeId: "glen-red-f",
    sex: "F",
    teeName: "Red (F)",
    scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 73, courseRating: 74.0, slopeRating: 127 } },
    holes: glenHoles(glenParRedM, glenSIredM, glenDistRed),
    distances: glenDist(glenDistRed),
  },
];

// USKids European Championship 2025 — Glen hospeda 3 escalões
// CR/Slope oficiais do PDF "Course Rating and Slope"
const glenUSKidsTees: Tee[] = [
  {
    teeId: "glen-uk-boys14",
    sex: "M",
    teeName: "USKids Boys 14",
    scorecardMeta: { teeColor: "#fbbf24" }, // Tee 6 = Yellow
    ratings: { holes18: { par: 72, courseRating: 70.6, slopeRating: 124 } },
    holes: glenHoles(glenParUSKids, glenSImain, glenDistYellow),
    distances: glenDist(glenDistYellow),
  },
  {
    teeId: "glen-uk-boys12",
    sex: "M",
    teeName: "USKids Boys 12",
    scorecardMeta: { teeColor: "#ef4444" }, // Tee 5 = Red
    ratings: { holes18: { par: 72, courseRating: 68.3, slopeRating: 119 } },
    holes: glenHoles(glenParUSKids, glenSIredM, glenDistRed),
    distances: glenDist(glenDistRed),
  },
  {
    teeId: "glen-uk-girls12",
    sex: "F",
    teeName: "USKids Girls 12",
    scorecardMeta: { teeColor: "#f97316" }, // Tee 3 = yardas próprias
    ratings: { holes18: { par: 72, courseRating: 66.6, slopeRating: 110 } },
    holes: glenHoles(glenParUSKids, glenSImain, glenDistUKGirls12),
    distances: glenDist(glenDistUKGirls12),
  },
];

const glenGolfClub: Course = {
  courseKey: "away-glen-golf-course",
  master: {
    courseId: "away-glen-golf-course",
    name: "Glen Golf Club",
    country: "Escócia",
    links: {
      fpg: null,
      scorecards: "http://www.glengolfclub.co.uk/",
      extra: [
        {
          label: "Course Handicap Table 2017 (CR/Slope oficiais)",
          url: "https://www.glengolfclub.co.uk/uploads/glen/File/Course/Course%20Handicap%20Table.pdf",
        },
        {
          label: "US Kids EUC 2025 - Yardages",
          url: "/data/yardages_-_euc2025.pdf",
        },
        {
          label: "US Kids EUC 2025 - Course Rating & Slope",
          url: "/data/course_rating_and_slope_-_euc_2025.pdf",
        },
      ],
    },
    tees: [...glenTees, ...glenUSKidsTees],
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   USKids Venice Open 2025 — 3 campos (Itália)
   Fonte: PDFs oficiais do torneio (em public/data/):
     - "Venice Open 2025 Tournament Distances - Meters"
     - "Venice Open 2025 - Course Slope and Rating"

   Campos por escalão (cada escalão joga um percurso diferente):
     Frassanelle Golf      — Boys/Girls 13-18
     Golf Della Montecchia — Boys/Girls 9-12. A Montecchia tem 3 campos de
                             9 buracos (White, Red, Green) que se combinam
                             em percursos de 18 DIFERENTES: White+Red,
                             Red+Green e Green+White → 3 entradas Course
                             separadas (não são tees do mesmo campo).
     Galzignano Golf       — Boys/Girls ≤9 (9 buracos)

   Cores = Longleaf Tee System do PDF (6 preto, 5 branco, 4 vermelho,
   3 laranja, 2 amarelo, 1 azul-escuro).

   O courseKey do White/Red mantém "away-golf-della-montecchia-white-red"
   para preservar o URL existente (vinha do melhorias.json, que esta
   entrada substitui — o melhorias só tinha o tee Boys 11).
   SI: só conhecido para o tee Amarelas do Frassanelle (scorecard WHS);
   os PDFs USKids não publicam stroke index.
   ────────────────────────────────────────────────────────────────────── */

const VENICE_PDF_LINKS = [
  {
    label: "US Kids Venice Open 2025 - Distances (Meters)",
    url: "/data/venice_open_2025_distances_meters.pdf",
  },
  {
    label: "US Kids Venice Open 2025 - Course Rating & Slope",
    url: "/data/venice_open_2025_course_rating_slope.pdf",
  },
  {
    label: "US Kids Venice Open 2026 - Course Rating & Slope",
    url: "https://tournaments.uskidsgolf.com/sites/default/files/course_rating_and_slope_-_venice_open_2026.pdf",
  },
];

function vHoles(par: number[], dist: number[], si?: number[]): Hole[] {
  return dist.map((d, i) => ({ hole: i + 1, par: par[i], si: si?.[i] ?? null, distance: d }));
}

function vDist(dist: number[]): { total: number; front9: number; back9: number | null; holesCount: number; complete18: boolean } {
  const front9 = dist.slice(0, 9).reduce((a, b) => a + b, 0);
  const back9 = dist.length > 9 ? dist.slice(9).reduce((a, b) => a + b, 0) : null;
  return { total: front9 + (back9 ?? 0), front9, back9, holesCount: dist.length, complete18: dist.length === 18 };
}

// ── Golf Della Montecchia — pares por combinação de nines ──
const montWRPar = [5,3,4,4,4,4,3,4,5, 4,3,5,4,4,4,4,3,5]; // White+Red, 72
// SI (stroke index) do layout White/Red — da ronda WHS do Manuel (Venice Open
// 2025). Igual para todos os tees deste combo. 2026-06-13.
const montWRSI = [7,5,3,9,15,1,13,17,11, 12,10,16,8,18,4,2,6,14];
const montRGPar = [4,3,5,4,4,4,4,3,5, 4,5,4,3,4,3,4,5,4]; // Red+Green, 72
const montGWPar = [4,5,4,3,4,3,4,5,4, 5,3,4,4,4,4,3,4,5]; // Green+White, 72

// Distâncias em metros (PDF oficial)
const montWRBoys12 = [401,145,300,310,280,330,128,290,390, 305,150,410,280,283,310,310,145,410]; // 5177m
const montWRBoys11 = [389,145,262,266,280,289,128,290,350, 255,122,330,230,265,284,290,115,325]; // 4615m
const montRG       = [255,122,330,230,265,284,290,115,325, 263,350,287,120,250,103,244,340,250]; // 4423m (Boys 10, Girls 11/12)
const montGW       = [220,300,240,100,210,90,210,300,230, 300,110,225,230,210,230,95,215,290];   // 3805m (Boys 9, Girls 10)
// Venice Open 2026 (resultados USKids, jardas × 0,9144): os Boys 10 jogaram o tee dos Boys 11 e
// os Boys 9 também o White/Red — CR/Slope do PDF 2026 (B10 64,8/111, B9 61,0/103). O Red/Green
// e o Green/White acima são do Venice Open 2024 (ratings do PDF de 2024). Raparigas 2026: os
// resultados USKids põem-nas também no White/Red — G11/G12 no Tee 4 (= Boys 11, 5044 jd) e G10
// no Tee 3 (= Boys 9, 4206 jd); CR/Slope do PDF 2026 (G12/G11 69,8/115, G10 65,1/105).
const montWRBoys9_2026 = [300,110,225,230,210,230,95,215,290, 210,115,294,204,235,252,258,85,289]; // 3847m

// 3 percursos de 18 = 3 campos distintos (combinações dos nines White/Red/Green)

const montecchiaWhiteRed: Course = {
  courseKey: "away-golf-della-montecchia-white-red",
  master: {
    courseId: "away-golf-della-montecchia-white-red",
    name: "Golf Della Montecchia - White/Red",
    country: "Itália",
    links: {
      fpg: null,
      scorecards: null,
      extra: VENICE_PDF_LINKS,
    },
    tees: [
      {
        teeId: "mont-wr-uk-boys12",
        sex: "M",
        teeName: "USKids Boys 12",
        scorecardMeta: { teeColor: "#ffffff" }, // Longleaf Tee 5
        ratings: { holes18: { par: 72, courseRating: 67.6, slopeRating: 118 } },
        holes: vHoles(montWRPar, montWRBoys12, montWRSI),
        distances: vDist(montWRBoys12),
      },
      {
        teeId: "mont-wr-uk-boys11",
        sex: "M",
        teeName: "USKids Boys 11",
        scorecardMeta: { teeColor: "#ef4444" }, // Longleaf Tee 4
        ratings: { holes18: { par: 72, courseRating: 64.8, slopeRating: 111 } },
        holes: vHoles(montWRPar, montWRBoys11, montWRSI),
        distances: vDist(montWRBoys11),
      },
      {
        teeId: "mont-wr-uk-boys10-2026",
        sex: "M",
        teeName: "USKids Boys 10",
        scorecardMeta: { teeColor: "#ef4444" }, // = Boys 11
        ratings: { holes18: { par: 72, courseRating: 64.8, slopeRating: 111 } },
        holes: vHoles(montWRPar, montWRBoys11, montWRSI),
        distances: vDist(montWRBoys11),
      },
      {
        teeId: "mont-wr-uk-boys9-2026",
        sex: "M",
        teeName: "USKids Boys 9",
        ratings: { holes18: { par: 72, courseRating: 61.0, slopeRating: 103 } },
        holes: vHoles(montWRPar, montWRBoys9_2026, montWRSI),
        distances: vDist(montWRBoys9_2026),
      },
      {
        teeId: "mont-wr-uk-girls1112-2026",
        sex: "F",
        teeName: "USKids Girls 12 / 11",
        scorecardMeta: { teeColor: "#ef4444" }, // Tee 4 = Boys 11
        ratings: { holes18: { par: 72, courseRating: 69.8, slopeRating: 115 } },
        holes: vHoles(montWRPar, montWRBoys11, montWRSI),
        distances: vDist(montWRBoys11),
      },
      {
        teeId: "mont-wr-uk-girls10-2026",
        sex: "F",
        teeName: "USKids Girls 10",
        scorecardMeta: { teeColor: "#f97316" }, // Tee 3 = Boys 9
        ratings: { holes18: { par: 72, courseRating: 65.1, slopeRating: 105 } },
        holes: vHoles(montWRPar, montWRBoys9_2026, montWRSI),
        distances: vDist(montWRBoys9_2026),
      },
    ],
  },
};

const montecchiaRedGreen: Course = {
  courseKey: "away-golf-della-montecchia-red-green",
  master: {
    courseId: "away-golf-della-montecchia-red-green",
    name: "Golf Della Montecchia - Red/Green",
    country: "Itália",
    links: {
      fpg: null,
      scorecards: null,
      extra: VENICE_PDF_LINKS,
    },
    tees: [
      {
        teeId: "mont-rg-uk-boys10",
        sex: "M",
        teeName: "USKids Boys 10",
        scorecardMeta: { teeColor: "#ef4444" }, // Longleaf Tee 4
        ratings: { holes18: { par: 72, courseRating: 63.3, slopeRating: 106 } },
        holes: vHoles(montRGPar, montRG),
        distances: vDist(montRG),
      },
      {
        teeId: "mont-rg-uk-girls12",
        sex: "F",
        teeName: "USKids Girls 12",
        scorecardMeta: { teeColor: "#ef4444" }, // Longleaf Tee 4
        ratings: { holes18: { par: 72, courseRating: 68.0, slopeRating: 111 } },
        holes: vHoles(montRGPar, montRG),
        distances: vDist(montRG),
      },
      {
        teeId: "mont-rg-uk-girls11",
        sex: "F",
        teeName: "USKids Girls 11",
        scorecardMeta: { teeColor: "#ef4444" }, // Longleaf Tee 4
        ratings: { holes18: { par: 72, courseRating: 68.0, slopeRating: 112 } },
        holes: vHoles(montRGPar, montRG),
        distances: vDist(montRG),
      },
    ],
  },
};

const montecchiaGreenWhite: Course = {
  courseKey: "away-golf-della-montecchia-green-white",
  master: {
    courseId: "away-golf-della-montecchia-green-white",
    name: "Golf Della Montecchia - Green/White",
    country: "Itália",
    links: {
      fpg: null,
      scorecards: null,
      extra: VENICE_PDF_LINKS,
    },
    tees: [
      {
        teeId: "mont-gw-uk-boys9",
        sex: "M",
        teeName: "USKids Boys 9",
        scorecardMeta: { teeColor: "#f97316" }, // Longleaf Tee 3
        ratings: { holes18: { par: 72, courseRating: 60.5, slopeRating: 100 } },
        holes: vHoles(montGWPar, montGW),
        distances: vDist(montGW),
      },
      {
        teeId: "mont-gw-uk-girls10",
        sex: "F",
        teeName: "USKids Girls 10",
        scorecardMeta: { teeColor: "#f97316" }, // Longleaf Tee 3
        ratings: { holes18: { par: 72, courseRating: 64.5, slopeRating: 104 } },
        holes: vHoles(montGWPar, montGW),
        distances: vDist(montGW),
      },
    ],
  },
};

// ── Frassanelle Golf — Boys/Girls 13-18 + tee Amarelas oficial ──
// Amarelas: recuperado do away-courses.backup-20260521.json (scorecard WHS
// do Venice Open 2025, com SI real). O tee "Vermelhas" do backup era na
// verdade a Montecchia Red+Green (CR 63.3/106) — não pertence aqui.
const frasPar = [4,5,4,4,3,5,4,3,4, 5,3,4,4,4,3,4,4,5]; // 72
const frasSI  = [16,4,10,2,6,8,12,14,18, 5,15,17,7,9,13,11,3,1];
const frasBoys1318  = [320,490,298,350,160,470,325,169,283, 479,150,255,385,357,146,310,327,479]; // 5753m
const frasGirls1318 = [287,399,269,302,146,410,300,133,250, 427,126,234,333,315,105,257,277,395]; // 4965m
const frasAmarelas  = [323,501,311,380,174,493,331,161,286, 477,145,258,380,356,125,301,355,522]; // 5879m

const frassanelle: Course = {
  courseKey: "away-frassanelle-golf",
  master: {
    courseId: "away-frassanelle-golf",
    name: "Frassanelle Golf",
    country: "Itália",
    links: {
      fpg: null,
      scorecards: null,
      extra: VENICE_PDF_LINKS,
    },
    tees: [
      {
        teeId: "fras-amarelas",
        sex: "U",
        teeName: "Amarelas",
        scorecardMeta: { teeColor: "#fbbf24" },
        ratings: { holes18: { par: 72, courseRating: 71.5, slopeRating: 131 } },
        holes: vHoles(frasPar, frasAmarelas, frasSI),
        distances: vDist(frasAmarelas),
      },
      {
        teeId: "fras-uk-boys1318",
        sex: "M",
        teeName: "USKids Boys 13-18",
        scorecardMeta: { teeColor: "#111827" }, // Longleaf Tee 6
        ratings: { holes18: { par: 72, courseRating: 70.7, slopeRating: 129 } },
        holes: vHoles(frasPar, frasBoys1318),
        distances: vDist(frasBoys1318),
      },
      {
        teeId: "fras-uk-girls1318",
        sex: "F",
        teeName: "USKids Girls 13-18",
        scorecardMeta: { teeColor: "#ffffff" }, // Longleaf Tee 5
        ratings: { holes18: { par: 72, courseRating: 71.7, slopeRating: 126 } },
        holes: vHoles(frasPar, frasGirls1318),
        distances: vDist(frasGirls1318),
      },
    ],
  },
};

// ── Galzignano Golf — 9 buracos (escalões ≤9 anos) ──
const galzPar = [4,4,5,3,5,4,5,3,3]; // 36
const galzTee2 = [167,164,242,91,304,156,292,100,98]; // 1614m — Boys 8 / Girls 9
const galzTee1 = [140,145,212,91,253,136,219,89,92];  // 1377m — Boys 7&U / Girls 8&U

const galzignano: Course = {
  courseKey: "away-galzignano-golf",
  master: {
    courseId: "away-galzignano-golf",
    name: "Galzignano Golf",
    country: "Itália",
    links: {
      fpg: null,
      scorecards: null,
      extra: VENICE_PDF_LINKS,
    },
    tees: [
      {
        teeId: "galz-uk-tee2",
        sex: "U",
        teeName: "USKids Boys 8 / Girls 9",
        scorecardMeta: { teeColor: "#fbbf24" }, // Longleaf Tee 2
        ratings: { holes9Front: { par: 36, courseRating: null, slopeRating: null } },
        holes: vHoles(galzPar, galzTee2),
        distances: vDist(galzTee2),
      },
      {
        teeId: "galz-uk-tee1",
        sex: "U",
        teeName: "USKids Boys 7&U / Girls 8&U",
        scorecardMeta: { teeColor: "#1e3a8a" }, // Longleaf Tee 1
        ratings: { holes9Front: { par: 36, courseRating: null, slopeRating: null } },
        holes: vHoles(galzPar, galzTee1),
        distances: vDist(galzTee1),
      },
    ],
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   Villa Padierna — Flamingos (Espanha)
   Manuel jogou aqui em 2025 e no WJGC 2026 (Boys, 25-27 Fev 2026). Esta entrada
   RECUPERA o enriquecimento e ELIMINA os duplicados que apareciam (3 tees
   redundantes: "Vermelhas", "Vermelho" e um "WJGC 2026" com distâncias erradas).

   Tee VERMELHAS — mesmas marcações nos dois anos (5295 m, CR 66.4 / Sl 132).
   A ÚNICA diferença em 2026 foi o PAR: o buraco 10 passou de par 4 a par 5,
   logo par total 72 (vs 71 em 2025). Distâncias e CR/Slope idênticos — por isso
   os dois tees partilham metros e rating, mudando só o par (confirmado pelo
   jogador; o valor 4842 m da rivalData estava errado — era jardas).

   Para deixar UM único campo, esta definição cobre as DUAS chaves de origem:
     - away-villa-padierna-flamingos-espanha  (entrada do pipeline, nome "…, Espanha")
     - away-villa-padierna-flamingos          (entrada derivada do melhorias)
   Ambas passam a ter o nome limpo "Villa Padierna - Flamingos" e tees idênticos,
   sendo fundidas (dedup por nome) numa só na CamposPage. _players preservados.
   ────────────────────────────────────────────────────────────────────── */

const vpFlamSI   = [4,10,6,18,16,8,14,12,2, 1,7,9,15,11,5,13,17,3];
const vpFlamDist = [468,157,342,128,293,459,317,137,287, 352,456,130,278,340,420,102,259,370]; // 5295m
const vpPar2025  = [5,3,4,3,4,5,4,3,4, 4,5,3,4,4,5,3,4,4]; // par 71
const vpPar2026  = [5,3,4,3,4,5,4,3,4, 5,5,3,4,4,5,3,4,4]; // par 72 (buraco 10: par 5)

function vpHoles(par: number[], si: number[], dist: number[]): Hole[] {
  return dist.map((d, i) => ({ hole: i + 1, par: par[i], si: si[i], distance: d }));
}
function vpDist(dist: number[]): { total: number; front9: number; back9: number; holesCount: 18; complete18: true } {
  const front9 = dist.slice(0, 9).reduce((a, b) => a + b, 0);
  const back9 = dist.slice(9).reduce((a, b) => a + b, 0);
  return { total: front9 + back9, front9, back9, holesCount: 18, complete18: true };
}

const vpFlamingosTees: Tee[] = [
  {
    teeId: "vp-flam-vermelhas",
    sex: "U",
    teeName: "Vermelhas",
    scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 71, courseRating: 66.4, slopeRating: 132 } },
    holes: vpHoles(vpPar2025, vpFlamSI, vpFlamDist),
    distances: vpDist(vpFlamDist),
  },
  {
    teeId: "vp-flam-wjgc26",
    sex: "U",
    teeName: "Vermelhas (WJGC 2026)",
    scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 72, courseRating: 66.4, slopeRating: 132 } },
    holes: vpHoles(vpPar2026, vpFlamSI, vpFlamDist),
    distances: vpDist(vpFlamDist),
  },
];

/* Tees do clube — página da RFEG (rfegolf.es/club/villa-padierna-golf-club, «Recorrido y
   Hoyos», lida a 30/10/2026; = tabela slope do clube de 18/06/2019): par, SI e metros por
   buraco. Nenhum é o tee do WJGC (5295 m, entre as Amarillas 5456 e as Rojas 4828); o
   66,4/132 desse tee vem do cartão FPG e junta o CR de homens das Rojas (66,4) ao slope
   de senhoras (132) — fica como foi lançado. Sem rating de senhoras nas Blancas/Amarillas. */
const vpFlamRfegPar = [5,3,4,3,4,5,4,3,4,4,5,3,4,4,5,3,4,4];
const vpFlamRfegSI = [4,10,6,18,16,8,14,12,2,1,7,9,15,11,5,13,17,3];
const vpFlamRfegBlancas = [440,190,367,150,319,467,322,160,336,360,488,164,311,369,450,137,294,390]; // 5714 m
const vpFlamRfegAmarillas = [429,174,346,136,301,457,316,152,316,351,471,149,295,348,435,123,276,381]; // 5456 m
const vpFlamRfegRojas = [414,144,313,117,268,420,290,125,262,322,417,119,254,311,384,93,237,338]; // 4828 m
const vpFlamRfegTees: Tee[] = [
  { teeId: "vpFlamRfeg-blancas-m", sex: "M", teeName: "Blancas", scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 71, courseRating: 70.7, slopeRating: 141 } },
    holes: vHoles(vpFlamRfegPar, vpFlamRfegBlancas, vpFlamRfegSI), distances: vDist(vpFlamRfegBlancas) },
  { teeId: "vpFlamRfeg-amarillas-m", sex: "M", teeName: "Amarillas", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 71, courseRating: 69.5, slopeRating: 139 } },
    holes: vHoles(vpFlamRfegPar, vpFlamRfegAmarillas, vpFlamRfegSI), distances: vDist(vpFlamRfegAmarillas) },
  { teeId: "vpFlamRfeg-rojas-f", sex: "F", teeName: "Rojas", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 71, courseRating: 70.9, slopeRating: 132 } },
    holes: vHoles(vpFlamRfegPar, vpFlamRfegRojas, vpFlamRfegSI), distances: vDist(vpFlamRfegRojas) },
  { teeId: "vpFlamRfeg-rojas-m", sex: "M", teeName: "Rojas", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 71, courseRating: 66.4, slopeRating: 126 } },
    holes: vHoles(vpFlamRfegPar, vpFlamRfegRojas, vpFlamRfegSI), distances: vDist(vpFlamRfegRojas) },
];

function vpFlamingosCourse(courseKey: string): Course {
  return {
    courseKey,
    master: {
      courseId: courseKey,
      name: "Villa Padierna - Flamingos",
      country: "Espanha",
      links: {
        fpg: null, scorecards: "https://www.villapadiernagolfclub.es",
        extra: [{ label: "RFEG — Villa Padierna (Recorrido y Hoyos)", url: "https://rfegolf.es/club/villa-padierna-golf-club" }],
      },
      tees: [...vpFlamingosTees, ...vpFlamRfegTees],
    },
  };
}

const villaPadiernaFlamingos  = vpFlamingosCourse("away-villa-padierna-flamingos-espanha");
const villaPadiernaFlamingos2 = vpFlamingosCourse("away-villa-padierna-flamingos");

/* ─────────────────────────────────────────────────────────────────────────
   San Roque (Cádis) — Old Course (The San Roque Club) e New Course (San Roque
   Golf & Resort). Spanish Open USKids 2026 (20–22/11) joga-se nos dois.
   Tudo da página de cada clube na RFEG («Recorrido y Hoyos», lida a 30/10/2026):
   CR/Slope por barra e sexo, par, SI e metros por buraco. O Old já com o 17 par 5 e
   o 18 par 4 (Members Book, Maio 2026); SI diferente em Blancas/Amarillas e
   Azules/Rojas, como a RFEG publica. O New substitui os tees dos cartões dos clubes
   (ratings trocados: «VERMELHAS F 75,6/134» era o das Amarillas, «BRANCAS 72/113»
   tinha os metros das Negras, «AMARELAS 72,6/132» o rating das Blancas). Sem rating
   oficial: Old Blancas/Amarillas F, New Negras/Blancas F e Rojas M.
   O «San Roque Golf Resort» de 2024 (outro desenho de par) fica como está.
   ───────────────────────────────────────────────────────────────────────── */

const srOldPar = [5,4,4,4,3,4,3,5,4,4,4,3,4,5,4,3,5,4];
const srOldSI = [13,1,5,11,7,15,17,9,3,6,8,18,14,16,2,12,10,4];
const srOldSI1 = [3,9,13,11,15,7,17,1,5,6,12,18,10,2,14,16,8,4];
const srOldBlancas = [479,403,363,405,161,327,156,447,390,376,418,152,343,466,399,177,446,403]; // 6311 m
const srOldAmarillas = [452,379,341,388,155,313,148,446,367,357,397,130,317,448,390,172,441,385]; // 6026 m
const srOldAzules = [442,372,334,382,144,303,125,389,366,343,391,116,274,408,284,155,430,304]; // 5562 m
const srOldRojas = [403,326,271,287,110,262,107,389,309,287,306,92,272,407,284,102,356,304]; // 4874 m
const srOldTees: Tee[] = [
  { teeId: "srOld-blancas-m", sex: "M", teeName: "Blancas", scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 72, courseRating: 74.1, slopeRating: 133 } },
    holes: vHoles(srOldPar, srOldBlancas, srOldSI), distances: vDist(srOldBlancas) },
  { teeId: "srOld-amarillas-m", sex: "M", teeName: "Amarillas", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 72, courseRating: 72.6, slopeRating: 131 } },
    holes: vHoles(srOldPar, srOldAmarillas, srOldSI), distances: vDist(srOldAmarillas) },
  { teeId: "srOld-azules-f", sex: "F", teeName: "Azules", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 72, courseRating: 75.6, slopeRating: 131 } },
    holes: vHoles(srOldPar, srOldAzules, srOldSI1), distances: vDist(srOldAzules) },
  { teeId: "srOld-azules-m", sex: "M", teeName: "Azules", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 72, courseRating: 70.1, slopeRating: 126 } },
    holes: vHoles(srOldPar, srOldAzules, srOldSI1), distances: vDist(srOldAzules) },
  { teeId: "srOld-rojas-f", sex: "F", teeName: "Rojas", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 72, courseRating: 71.3, slopeRating: 121 } },
    holes: vHoles(srOldPar, srOldRojas, srOldSI1), distances: vDist(srOldRojas) },
  { teeId: "srOld-rojas-m", sex: "M", teeName: "Rojas", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 72, courseRating: 66.4, slopeRating: 120 } },
    holes: vHoles(srOldPar, srOldRojas, srOldSI1), distances: vDist(srOldRojas) },
];
const srNewPar = [4,5,4,3,4,4,5,3,4,4,5,4,3,4,4,5,3,4];
const srNewSI = [13,15,9,7,17,5,1,11,3,16,2,18,14,4,8,10,12,6];
const srNewNegras = [408,483,339,177,347,331,524,206,395,341,565,312,167,416,418,457,197,414]; // 6497 m
const srNewBlancas = [365,473,316,164,334,316,513,188,372,318,515,279,160,403,377,433,166,387]; // 6079 m
const srNewAmarillas = [332,454,289,144,307,284,479,161,359,297,481,252,137,367,358,405,137,332]; // 5575 m
const srNewAzules = [302,418,271,112,283,257,432,132,326,267,439,215,113,335,334,367,111,296]; // 5010 m
const srNewRojas = [259,367,253,108,257,238,404,110,304,232,410,193,93,325,324,367,86,263]; // 4593 m
const srNewTees: Tee[] = [
  { teeId: "srNew-negras-m", sex: "M", teeName: "Negras", scorecardMeta: { teeColor: "#000000" },
    ratings: { holes18: { par: 72, courseRating: 74.7, slopeRating: 137 } },
    holes: vHoles(srNewPar, srNewNegras, srNewSI), distances: vDist(srNewNegras) },
  { teeId: "srNew-blancas-m", sex: "M", teeName: "Blancas", scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 72, courseRating: 72.6, slopeRating: 132 } },
    holes: vHoles(srNewPar, srNewBlancas, srNewSI), distances: vDist(srNewBlancas) },
  { teeId: "srNew-amarillas-f", sex: "F", teeName: "Amarillas", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 72, courseRating: 75.6, slopeRating: 134 } },
    holes: vHoles(srNewPar, srNewAmarillas, srNewSI), distances: vDist(srNewAmarillas) },
  { teeId: "srNew-amarillas-m", sex: "M", teeName: "Amarillas", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 72, courseRating: 69.5, slopeRating: 132 } },
    holes: vHoles(srNewPar, srNewAmarillas, srNewSI), distances: vDist(srNewAmarillas) },
  { teeId: "srNew-azules-f", sex: "F", teeName: "Azules", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 72, courseRating: 71.8, slopeRating: 132 } },
    holes: vHoles(srNewPar, srNewAzules, srNewSI), distances: vDist(srNewAzules) },
  { teeId: "srNew-azules-m", sex: "M", teeName: "Azules", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 72, courseRating: 66.7, slopeRating: 121 } },
    holes: vHoles(srNewPar, srNewAzules, srNewSI), distances: vDist(srNewAzules) },
  { teeId: "srNew-rojas-f", sex: "F", teeName: "Rojas", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 72, courseRating: 69, slopeRating: 127 } },
    holes: vHoles(srNewPar, srNewRojas, srNewSI), distances: vDist(srNewRojas) },
];

const sanRoqueOld: Course = {
  courseKey: "away-the-san-roque-club-old",
  master: {
    courseId: "away-the-san-roque-club-old",
    name: "The San Roque Club - Old Course",
    country: "Espanha",
    links: { fpg: null, scorecards: "https://rfegolf.es/club/san-roque-club" },
    tees: srOldTees,
  },
};

const sanRoqueNew: Course = {
  courseKey: "away-san-roque",
  master: {
    courseId: "away-san-roque",
    name: "San Roque - New Course",
    country: "Espanha",
    links: { fpg: null, scorecards: "https://rfegolf.es/club/san-roque-golf-resort" },
    tees: srNewTees,
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   Real Club de Golf El Prat (Terrassa) — 45 buracos, um campo por percurso.
   Página do clube na RFEG («Recorrido y Hoyos», lida a 30/10/2026): CR/Slope por
   barra e sexo, par, SI e metros por buraco. Composição dos nines só publicada para
   Rosa, Amarillo e Verde. Os ratings do site do clube (um só valor por barra, sem
   data) são diferentes — mais antigos; ficam os da RFEG. A entrada «Real Club de Golf
   El Prat» do pipeline (Copa La Reina, par do Rosa; o Manuel em 2023, 9 buracos com o
   par do Amarillo) fica como está. Sem a montagem «Cto Barcelona» (é de competição).
   ───────────────────────────────────────────────────────────────────────── */

const pratRosaPar = [5,4,3,4,4,3,4,4,5,5,3,4,3,4,4,4,4,5];
const pratRosaSI = [9,3,17,11,13,5,7,1,15,4,16,8,12,10,18,6,2,14];
const pratRosaNegras = [542,346,138,342,358,213,379,411,510,530,168,324,203,348,325,425,397,494]; // 6453 m
const pratRosaBlancas = [523,333,130,330,353,185,367,392,498,521,159,323,186,328,296,404,373,485]; // 6186 m
const pratRosaAmarillas = [503,317,121,322,339,162,352,375,485,502,149,298,171,300,272,380,364,472]; // 5884 m
const pratRosaAzules = [463,294,106,283,299,146,303,351,441,405,133,270,146,275,240,349,324,429]; // 5257 m
const pratRosaRojas = [443,283,97,270,290,135,271,341,436,383,126,247,136,258,227,321,316,420]; // 5000 m
const pratRosaTees: Tee[] = [
  { teeId: "pratRosa-negras-f", sex: "F", teeName: "Negras", scorecardMeta: { teeColor: "#000000" },
    ratings: { holes18: { par: 72, courseRating: 81.9, slopeRating: 152 } },
    holes: vHoles(pratRosaPar, pratRosaNegras, pratRosaSI), distances: vDist(pratRosaNegras) },
  { teeId: "pratRosa-negras-m", sex: "M", teeName: "Negras", scorecardMeta: { teeColor: "#000000" },
    ratings: { holes18: { par: 72, courseRating: 76, slopeRating: 147 } },
    holes: vHoles(pratRosaPar, pratRosaNegras, pratRosaSI), distances: vDist(pratRosaNegras) },
  { teeId: "pratRosa-blancas-f", sex: "F", teeName: "Blancas", scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 72, courseRating: 80.3, slopeRating: 148 } },
    holes: vHoles(pratRosaPar, pratRosaBlancas, pratRosaSI), distances: vDist(pratRosaBlancas) },
  { teeId: "pratRosa-blancas-m", sex: "M", teeName: "Blancas", scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 72, courseRating: 74.4, slopeRating: 146 } },
    holes: vHoles(pratRosaPar, pratRosaBlancas, pratRosaSI), distances: vDist(pratRosaBlancas) },
  { teeId: "pratRosa-amarillas-f", sex: "F", teeName: "Amarillas", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 72, courseRating: 78.5, slopeRating: 144 } },
    holes: vHoles(pratRosaPar, pratRosaAmarillas, pratRosaSI), distances: vDist(pratRosaAmarillas) },
  { teeId: "pratRosa-amarillas-m", sex: "M", teeName: "Amarillas", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 72, courseRating: 72.6, slopeRating: 143 } },
    holes: vHoles(pratRosaPar, pratRosaAmarillas, pratRosaSI), distances: vDist(pratRosaAmarillas) },
  { teeId: "pratRosa-azules-f", sex: "F", teeName: "Azules", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 72, courseRating: 74.7, slopeRating: 136 } },
    holes: vHoles(pratRosaPar, pratRosaAzules, pratRosaSI), distances: vDist(pratRosaAzules) },
  { teeId: "pratRosa-azules-m", sex: "M", teeName: "Azules", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 72, courseRating: 69.5, slopeRating: 133 } },
    holes: vHoles(pratRosaPar, pratRosaAzules, pratRosaSI), distances: vDist(pratRosaAzules) },
  { teeId: "pratRosa-rojas-f", sex: "F", teeName: "Rojas", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 72, courseRating: 73.1, slopeRating: 133 } },
    holes: vHoles(pratRosaPar, pratRosaRojas, pratRosaSI), distances: vDist(pratRosaRojas) },
  { teeId: "pratRosa-rojas-m", sex: "M", teeName: "Rojas", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 72, courseRating: 68.1, slopeRating: 129 } },
    holes: vHoles(pratRosaPar, pratRosaRojas, pratRosaSI), distances: vDist(pratRosaRojas) },
];

const pratAmarilloPar = [4,3,4,5,4,3,4,4,5,4,5,3,4,4,4,5,3,4];
const pratAmarilloSI = [3,17,15,13,9,5,7,1,11,4,16,14,8,12,10,6,18,2];
const pratAmarilloNegras = [390,169,340,492,350,187,390,406,499,416,520,187,399,424,428,493,147,424]; // 6661 m
const pratAmarilloBlancas = [371,156,321,480,340,178,384,385,480,395,498,163,377,389,413,478,137,407]; // 6352 m
const pratAmarilloAmarillas = [344,142,298,449,312,166,371,360,474,369,473,147,357,369,381,456,126,364]; // 5958 m
const pratAmarilloAzules = [320,118,272,404,283,139,344,345,432,343,458,115,340,343,367,435,116,337]; // 5511 m
const pratAmarilloRojas = [294,109,249,383,263,118,332,329,404,319,426,104,325,319,339,387,97,315]; // 5112 m
const pratAmarilloTees: Tee[] = [
  { teeId: "pratAmarillo-negras-f", sex: "F", teeName: "Negras", scorecardMeta: { teeColor: "#000000" },
    ratings: { holes18: { par: 72, courseRating: 82.3, slopeRating: 141 } },
    holes: vHoles(pratAmarilloPar, pratAmarilloNegras, pratAmarilloSI), distances: vDist(pratAmarilloNegras) },
  { teeId: "pratAmarillo-negras-m", sex: "M", teeName: "Negras", scorecardMeta: { teeColor: "#000000" },
    ratings: { holes18: { par: 72, courseRating: 75.3, slopeRating: 138 } },
    holes: vHoles(pratAmarilloPar, pratAmarilloNegras, pratAmarilloSI), distances: vDist(pratAmarilloNegras) },
  { teeId: "pratAmarillo-blancas-f", sex: "F", teeName: "Blancas", scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 72, courseRating: 80.3, slopeRating: 137 } },
    holes: vHoles(pratAmarilloPar, pratAmarilloBlancas, pratAmarilloSI), distances: vDist(pratAmarilloBlancas) },
  { teeId: "pratAmarillo-blancas-m", sex: "M", teeName: "Blancas", scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 72, courseRating: 73.7, slopeRating: 135 } },
    holes: vHoles(pratAmarilloPar, pratAmarilloBlancas, pratAmarilloSI), distances: vDist(pratAmarilloBlancas) },
  { teeId: "pratAmarillo-amarillas-f", sex: "F", teeName: "Amarillas", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 72, courseRating: 78, slopeRating: 133 } },
    holes: vHoles(pratAmarilloPar, pratAmarilloAmarillas, pratAmarilloSI), distances: vDist(pratAmarilloAmarillas) },
  { teeId: "pratAmarillo-amarillas-m", sex: "M", teeName: "Amarillas", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 72, courseRating: 71.5, slopeRating: 131 } },
    holes: vHoles(pratAmarilloPar, pratAmarilloAmarillas, pratAmarilloSI), distances: vDist(pratAmarilloAmarillas) },
  { teeId: "pratAmarillo-azules-f", sex: "F", teeName: "Azules", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 72, courseRating: 74.9, slopeRating: 131 } },
    holes: vHoles(pratAmarilloPar, pratAmarilloAzules, pratAmarilloSI), distances: vDist(pratAmarilloAzules) },
  { teeId: "pratAmarillo-azules-m", sex: "M", teeName: "Azules", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 72, courseRating: 69.1, slopeRating: 124 } },
    holes: vHoles(pratAmarilloPar, pratAmarilloAzules, pratAmarilloSI), distances: vDist(pratAmarilloAzules) },
  { teeId: "pratAmarillo-rojas-f", sex: "F", teeName: "Rojas", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 72, courseRating: 72.4, slopeRating: 127 } },
    holes: vHoles(pratAmarilloPar, pratAmarilloRojas, pratAmarilloSI), distances: vDist(pratAmarilloRojas) },
  { teeId: "pratAmarillo-rojas-m", sex: "M", teeName: "Rojas", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 72, courseRating: 67.1, slopeRating: 120 } },
    holes: vHoles(pratAmarilloPar, pratAmarilloRojas, pratAmarilloSI), distances: vDist(pratAmarilloRojas) },
];

const pratVerdePar = [4,5,3,4,4,5,3,4,3,4,4,4,3,5,4,5,3,4];
const pratVerdeSI = [1,13,9,3,5,17,11,7,15,14,16,10,12,6,8,4,18,2];
const pratVerdeNegras = [416,520,187,399,424,451,161,357,173,300,345,338,151,474,428,493,147,424]; // 6188 m
const pratVerdeBlancas = [395,498,163,377,389,446,156,352,152,288,332,323,145,468,413,478,137,407]; // 5919 m
const pratVerdeAmarillas = [369,473,147,357,369,432,140,334,146,264,324,317,128,461,381,456,126,364]; // 5588 m
const pratVerdeAzules = [343,458,115,340,343,376,114,303,117,237,280,271,111,416,367,435,116,337]; // 5079 m
const pratVerdeRojas = [319,426,104,325,319,347,95,280,96,231,258,250,101,397,339,387,97,315]; // 4686 m
const pratVerdeTees: Tee[] = [
  { teeId: "pratVerde-negras-f", sex: "F", teeName: "Negras", scorecardMeta: { teeColor: "#000000" },
    ratings: { holes18: { par: 71, courseRating: 79, slopeRating: 138 } },
    holes: vHoles(pratVerdePar, pratVerdeNegras, pratVerdeSI), distances: vDist(pratVerdeNegras) },
  { teeId: "pratVerde-negras-m", sex: "M", teeName: "Negras", scorecardMeta: { teeColor: "#000000" },
    ratings: { holes18: { par: 71, courseRating: 72.7, slopeRating: 132 } },
    holes: vHoles(pratVerdePar, pratVerdeNegras, pratVerdeSI), distances: vDist(pratVerdeNegras) },
  { teeId: "pratVerde-blancas-f", sex: "F", teeName: "Blancas", scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 71, courseRating: 77.2, slopeRating: 135 } },
    holes: vHoles(pratVerdePar, pratVerdeBlancas, pratVerdeSI), distances: vDist(pratVerdeBlancas) },
  { teeId: "pratVerde-blancas-m", sex: "M", teeName: "Blancas", scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 71, courseRating: 71.2, slopeRating: 127 } },
    holes: vHoles(pratVerdePar, pratVerdeBlancas, pratVerdeSI), distances: vDist(pratVerdeBlancas) },
  { teeId: "pratVerde-amarillas-f", sex: "F", teeName: "Amarillas", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 71, courseRating: 75.3, slopeRating: 132 } },
    holes: vHoles(pratVerdePar, pratVerdeAmarillas, pratVerdeSI), distances: vDist(pratVerdeAmarillas) },
  { teeId: "pratVerde-amarillas-m", sex: "M", teeName: "Amarillas", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 71, courseRating: 69.4, slopeRating: 124 } },
    holes: vHoles(pratVerdePar, pratVerdeAmarillas, pratVerdeSI), distances: vDist(pratVerdeAmarillas) },
  { teeId: "pratVerde-azules-f", sex: "F", teeName: "Azules", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 71, courseRating: 72.2, slopeRating: 126 } },
    holes: vHoles(pratVerdePar, pratVerdeAzules, pratVerdeSI), distances: vDist(pratVerdeAzules) },
  { teeId: "pratVerde-azules-m", sex: "M", teeName: "Azules", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 71, courseRating: 66.9, slopeRating: 116 } },
    holes: vHoles(pratVerdePar, pratVerdeAzules, pratVerdeSI), distances: vDist(pratVerdeAzules) },
  { teeId: "pratVerde-rojas-f", sex: "F", teeName: "Rojas", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 71, courseRating: 69.8, slopeRating: 122 } },
    holes: vHoles(pratVerdePar, pratVerdeRojas, pratVerdeSI), distances: vDist(pratVerdeRojas) },
  { teeId: "pratVerde-rojas-m", sex: "M", teeName: "Rojas", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 71, courseRating: 64.9, slopeRating: 112 } },
    holes: vHoles(pratVerdePar, pratVerdeRojas, pratVerdeSI), distances: vDist(pratVerdeRojas) },
];

const pratAzulPar = [4,3,4,5,4,3,4,4,5,5,4,3,4,4,3,4,4,5];
const pratAzulSI = [3,17,15,13,9,5,7,1,11,8,4,18,12,14,10,6,2,16];
const pratAzulNegras = [390,169,340,492,350,187,390,406,499,542,346,138,342,358,213,379,411,510]; // 6462 m
const pratAzulBlancas = [371,156,321,480,340,178,384,385,480,523,333,130,330,353,185,367,392,498]; // 6206 m
const pratAzulAmarillas = [344,142,298,449,312,166,371,360,474,503,317,121,322,339,162,352,375,485]; // 5892 m
const pratAzulAzules = [320,118,272,404,283,139,344,345,432,463,294,106,283,299,146,303,351,441]; // 5343 m
const pratAzulRojas = [294,109,249,383,263,118,332,329,404,443,283,97,270,290,135,271,341,436]; // 5047 m
const pratAzulTees: Tee[] = [
  { teeId: "pratAzul-negras-f", sex: "F", teeName: "Negras", scorecardMeta: { teeColor: "#000000" },
    ratings: { holes18: { par: 72, courseRating: 81.4, slopeRating: 144 } },
    holes: vHoles(pratAzulPar, pratAzulNegras, pratAzulSI), distances: vDist(pratAzulNegras) },
  { teeId: "pratAzul-negras-m", sex: "M", teeName: "Negras", scorecardMeta: { teeColor: "#000000" },
    ratings: { holes18: { par: 72, courseRating: 74.9, slopeRating: 139 } },
    holes: vHoles(pratAzulPar, pratAzulNegras, pratAzulSI), distances: vDist(pratAzulNegras) },
  { teeId: "pratAzul-blancas-f", sex: "F", teeName: "Blancas", scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 72, courseRating: 79.8, slopeRating: 141 } },
    holes: vHoles(pratAzulPar, pratAzulBlancas, pratAzulSI), distances: vDist(pratAzulBlancas) },
  { teeId: "pratAzul-blancas-m", sex: "M", teeName: "Blancas", scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 72, courseRating: 73.6, slopeRating: 138 } },
    holes: vHoles(pratAzulPar, pratAzulBlancas, pratAzulSI), distances: vDist(pratAzulBlancas) },
  { teeId: "pratAzul-amarillas-f", sex: "F", teeName: "Amarillas", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 72, courseRating: 77.9, slopeRating: 136 } },
    holes: vHoles(pratAzulPar, pratAzulAmarillas, pratAzulSI), distances: vDist(pratAzulAmarillas) },
  { teeId: "pratAzul-amarillas-m", sex: "M", teeName: "Amarillas", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 72, courseRating: 71.8, slopeRating: 136 } },
    holes: vHoles(pratAzulPar, pratAzulAmarillas, pratAzulSI), distances: vDist(pratAzulAmarillas) },
  { teeId: "pratAzul-azules-f", sex: "F", teeName: "Azules", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 72, courseRating: 74.3, slopeRating: 133 } },
    holes: vHoles(pratAzulPar, pratAzulAzules, pratAzulSI), distances: vDist(pratAzulAzules) },
  { teeId: "pratAzul-azules-m", sex: "M", teeName: "Azules", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 72, courseRating: 68.8, slopeRating: 124 } },
    holes: vHoles(pratAzulPar, pratAzulAzules, pratAzulSI), distances: vDist(pratAzulAzules) },
  { teeId: "pratAzul-rojas-f", sex: "F", teeName: "Rojas", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 72, courseRating: 72.4, slopeRating: 130 } },
    holes: vHoles(pratAzulPar, pratAzulRojas, pratAzulSI), distances: vDist(pratAzulRojas) },
  { teeId: "pratAzul-rojas-m", sex: "M", teeName: "Rojas", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 72, courseRating: 67.2, slopeRating: 123 } },
    holes: vHoles(pratAzulPar, pratAzulRojas, pratAzulSI), distances: vDist(pratAzulRojas) },
];

const pratVioletaPar = [4,5,3,4,4,4,5,3,4,5,3,4,3,4,4,4,4,5];
const pratVioletaSI = [3,15,13,7,11,9,5,17,1,4,16,8,12,10,18,6,2,14];
const pratVioletaNegras = [416,520,187,399,424,428,493,147,424,530,168,324,203,348,325,425,397,494]; // 6652 m
const pratVioletaBlancas = [395,498,163,377,389,413,478,137,407,521,159,323,186,328,296,404,373,485]; // 6332 m
const pratVioletaAmarillas = [369,473,147,357,369,381,456,126,364,502,149,298,171,300,272,380,364,472]; // 5950 m
const pratVioletaAzules = [343,458,115,340,343,367,435,116,337,405,133,270,146,275,240,349,324,429]; // 5425 m
const pratVioletaRojas = [319,426,104,325,319,339,387,97,315,383,126,247,136,258,227,321,316,420]; // 5065 m
const pratVioletaTees: Tee[] = [
  { teeId: "pratVioleta-negras-f", sex: "F", teeName: "Negras", scorecardMeta: { teeColor: "#000000" },
    ratings: { holes18: { par: 72, courseRating: 82.8, slopeRating: 148 } },
    holes: vHoles(pratVioletaPar, pratVioletaNegras, pratVioletaSI), distances: vDist(pratVioletaNegras) },
  { teeId: "pratVioleta-negras-m", sex: "M", teeName: "Negras", scorecardMeta: { teeColor: "#000000" },
    ratings: { holes18: { par: 72, courseRating: 76.4, slopeRating: 147 } },
    holes: vHoles(pratVioletaPar, pratVioletaNegras, pratVioletaSI), distances: vDist(pratVioletaNegras) },
  { teeId: "pratVioleta-blancas-f", sex: "F", teeName: "Blancas", scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 72, courseRating: 80.8, slopeRating: 145 } },
    holes: vHoles(pratVioletaPar, pratVioletaBlancas, pratVioletaSI), distances: vDist(pratVioletaBlancas) },
  { teeId: "pratVioleta-blancas-m", sex: "M", teeName: "Blancas", scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 72, courseRating: 74.5, slopeRating: 143 } },
    holes: vHoles(pratVioletaPar, pratVioletaBlancas, pratVioletaSI), distances: vDist(pratVioletaBlancas) },
  { teeId: "pratVioleta-amarillas-f", sex: "F", teeName: "Amarillas", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 72, courseRating: 78.6, slopeRating: 141 } },
    holes: vHoles(pratVioletaPar, pratVioletaAmarillas, pratVioletaSI), distances: vDist(pratVioletaAmarillas) },
  { teeId: "pratVioleta-amarillas-m", sex: "M", teeName: "Amarillas", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 72, courseRating: 72.3, slopeRating: 139 } },
    holes: vHoles(pratVioletaPar, pratVioletaAmarillas, pratVioletaSI), distances: vDist(pratVioletaAmarillas) },
  { teeId: "pratVioleta-azules-f", sex: "F", teeName: "Azules", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 72, courseRating: 75.3, slopeRating: 135 } },
    holes: vHoles(pratVioletaPar, pratVioletaAzules, pratVioletaSI), distances: vDist(pratVioletaAzules) },
  { teeId: "pratVioleta-azules-m", sex: "M", teeName: "Azules", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 72, courseRating: 69.8, slopeRating: 133 } },
    holes: vHoles(pratVioletaPar, pratVioletaAzules, pratVioletaSI), distances: vDist(pratVioletaAzules) },
  { teeId: "pratVioleta-rojas-f", sex: "F", teeName: "Rojas", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 72, courseRating: 73.1, slopeRating: 131 } },
    holes: vHoles(pratVioletaPar, pratVioletaRojas, pratVioletaSI), distances: vDist(pratVioletaRojas) },
  { teeId: "pratVioleta-rojas-m", sex: "M", teeName: "Rojas", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 72, courseRating: 70.3, slopeRating: 127 } },
    holes: vHoles(pratVioletaPar, pratVioletaRojas, pratVioletaSI), distances: vDist(pratVioletaRojas) },
];

const pratVallesPar = [4,3,5,5,3,4,3,4,4,4,3,5,5,3,4,3,4,4];
const pratVallesSI = [7,9,1,15,5,3,11,13,17,8,10,2,16,6,4,12,14,18];
const pratVallesNegras = [338,151,474,451,161,357,173,300,345,338,151,474,451,161,357,173,300,345]; // 5500 m
const pratVallesBlancas = [323,145,468,446,156,352,152,288,332,323,145,468,446,156,352,152,288,332]; // 5324 m
const pratVallesAmarillas = [317,128,461,432,140,334,146,264,324,317,128,461,432,140,334,146,264,324]; // 5092 m
const pratVallesAzules = [271,111,416,376,114,303,117,237,280,271,111,416,376,114,303,117,237,280]; // 4450 m
const pratVallesRojas = [250,101,397,347,95,280,96,231,258,250,101,397,347,95,280,96,231,258]; // 4110 m
const pratVallesTees: Tee[] = [
  { teeId: "pratValles-negras-f", sex: "F", teeName: "Negras", scorecardMeta: { teeColor: "#000000" },
    ratings: { holes18: { par: 70, courseRating: 74.4, slopeRating: 132 } },
    holes: vHoles(pratVallesPar, pratVallesNegras, pratVallesSI), distances: vDist(pratVallesNegras) },
  { teeId: "pratValles-negras-m", sex: "M", teeName: "Negras", scorecardMeta: { teeColor: "#000000" },
    ratings: { holes18: { par: 70, courseRating: 68.8, slopeRating: 123 } },
    holes: vHoles(pratVallesPar, pratVallesNegras, pratVallesSI), distances: vDist(pratVallesNegras) },
  { teeId: "pratValles-blancas-f", sex: "F", teeName: "Blancas", scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 70, courseRating: 73.2, slopeRating: 130 } },
    holes: vHoles(pratVallesPar, pratVallesBlancas, pratVallesSI), distances: vDist(pratVallesBlancas) },
  { teeId: "pratValles-blancas-m", sex: "M", teeName: "Blancas", scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 70, courseRating: 67.8, slopeRating: 120 } },
    holes: vHoles(pratVallesPar, pratVallesBlancas, pratVallesSI), distances: vDist(pratVallesBlancas) },
  { teeId: "pratValles-amarillas-f", sex: "F", teeName: "Amarillas", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 70, courseRating: 71.8, slopeRating: 128 } },
    holes: vHoles(pratVallesPar, pratVallesAmarillas, pratVallesSI), distances: vDist(pratVallesAmarillas) },
  { teeId: "pratValles-amarillas-m", sex: "M", teeName: "Amarillas", scorecardMeta: { teeColor: "#facc15" },
    ratings: { holes18: { par: 70, courseRating: 66.6, slopeRating: 116 } },
    holes: vHoles(pratVallesPar, pratVallesAmarillas, pratVallesSI), distances: vDist(pratVallesAmarillas) },
  { teeId: "pratValles-azules-f", sex: "F", teeName: "Azules", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 70, courseRating: 68, slopeRating: 120 } },
    holes: vHoles(pratVallesPar, pratVallesAzules, pratVallesSI), distances: vDist(pratVallesAzules) },
  { teeId: "pratValles-azules-m", sex: "M", teeName: "Azules", scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 70, courseRating: 63.8, slopeRating: 103 } },
    holes: vHoles(pratVallesPar, pratVallesAzules, pratVallesSI), distances: vDist(pratVallesAzules) },
  { teeId: "pratValles-rojas-f", sex: "F", teeName: "Rojas", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 70, courseRating: 66, slopeRating: 114 } },
    holes: vHoles(pratVallesPar, pratVallesRojas, pratVallesSI), distances: vDist(pratVallesRojas) },
  { teeId: "pratValles-rojas-m", sex: "M", teeName: "Rojas", scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 70, courseRating: 61.8, slopeRating: 103 } },
    holes: vHoles(pratVallesPar, pratVallesRojas, pratVallesSI), distances: vDist(pratVallesRojas) },
];

function elPratRoute(key: string, nome: string, tees: Tee[]): Course {
  return {
    courseKey: `away-el-prat-${key}`,
    master: {
      courseId: `away-el-prat-${key}`,
      name: `Real Club de Golf El Prat - ${nome}`,
      country: "Espanha",
      links: { fpg: null, scorecards: "https://rfegolf.es/club/real-club-de-golf-el-prat" },
      tees,
    },
  };
}
const elPratRosa = elPratRoute("rosa", "Rosa (Bosque + Arriba)", pratRosaTees);
const elPratAmarillo = elPratRoute("amarillo", "Amarillo (Piscina + Abajo)", pratAmarilloTees);
const elPratVerde = elPratRoute("verde", "Verde (Abajo + Vallès)", pratVerdeTees);
const elPratAzul = elPratRoute("azul", "Azul", pratAzulTees);
const elPratVioleta = elPratRoute("violeta", "Violeta", pratVioletaTees);
const elPratValles = elPratRoute("valles", "El Vallès (9 buracos ×2)", pratVallesTees);

/* ─────────────────────────────────────────────────────────────────────────
   The Vale Resort (Hensol, Gales) — US Kids British Kids Championship 2026
   (27–28/10/2026). Escalões por percurso da página de inscrições: Boys 10–18 no
   Wales National; Boys 9 e raparigas no Lake; os de 9 buracos na volta da frente
   do Lake. Metros e par dos resultados USKids e dos cartões no Signupanytime
   (jardas × 0,9144); Girls 11-12 = tee dos Boys 9, Girls 9-10 = tee dos Boys 8.
   Sem CR/Slope: a USKids não publicou (procurado a 30/10/2026; há as regras
   locais local_rules_bkc_2026_-_wales_national.pdf e _-_lake.pdf).
   ───────────────────────────────────────────────────────────────────────── */

const valeWNPar = [4,5,3,5,4,4,4,3,4, 5,4,3,4,3,5,4,4,4]; // par USKids 72
const valeWNB1314 = [293,437,125,409,306,294,315,140,280, 438,260,114,357,115,385,305,336,296]; // 5205 m
const valeWNB12   = [283,411,125,377,306,225,242,105,280, 395,260,114,328,96,327,296,336,267];  // 4773 m
const valeWNB1011 = [251,356,116,344,256,225,242,105,239, 358,260,105,221,96,327,250,259,231];  // 4241 m
const valeLakePar = [3,5,3,4,4,5,5,3,4, 3,4,4,3,5,4,5,4,4]; // par USKids 72
const valeLakeB9  = [116,307,114,232,229,315,304,115,224, 83,223,197,92,299,197,238,208,205];   // 3698 m
const valeLakeB8  = [77,254,73,196,194,264,242,82,201]; // 1583 m, buracos 1–9
const valeLakeB7  = [77,216,69,150,145,212,203,73,161]; // 1306 m, buracos 1–9
// Escalões que não vinham nos nossos resultados — cartões do Signupanytime (30/10/2026).
const valeWNB1518 = [306,516,155,479,332,294,315,150,374,484,260,146,390,115,385,358,336,315]; // 5710 m (6243 jd)
const valeLakeG1518 = [132,307,130,283,317,398,422,128,261,99,293,234,110,406,197,321,262,291]; // 4591 m (5019 jd)
const valeLakeG1314 = [116,307,114,251,229,340,325,121,239,83,251,234,110,352,197,321,252,248]; // 4090 m (4471 jd)
const valeLakeG8 = [59,174,55,130,145,187,181,73,105]; // 1109 m (1214 jd)

function valeTee(teeId: string, teeName: string, par: number[], dist: number[], sex: "M" | "F" | "U" = "M"): Tee {
  return {
    teeId, sex, teeName,
    ratings: { holes18: { par: par.slice(0, dist.length).reduce((a, b) => a + b, 0), courseRating: null, slopeRating: null } },
    holes: vHoles(par, dist),
    distances: vDist(dist),
  };
}

const BKC26_LINKS = [
  { label: "US Kids British Kids Championship 2026", url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/518958/british-kids-championship-2026" },
];

const valeWalesNational: Course = {
  courseKey: "away-the-vale-resort-wales-national",
  master: {
    courseId: "away-the-vale-resort-wales-national",
    name: "The Vale Resort - Wales National Course",
    country: "Gales",
    links: { fpg: null, scorecards: "https://www.valeresort.com/the-wales-national-course/", extra: BKC26_LINKS },
    tees: [
      valeTee("vale-wn-uk-b1518", "USKids Boys 15-18", valeWNPar, valeWNB1518),
      valeTee("vale-wn-uk-b1314", "USKids Boys 13-14", valeWNPar, valeWNB1314),
      valeTee("vale-wn-uk-b12", "USKids Boys 12", valeWNPar, valeWNB12),
      valeTee("vale-wn-uk-b1011", "USKids Boys 11 / 10", valeWNPar, valeWNB1011),
    ],
  },
};

const valeLake: Course = {
  courseKey: "away-the-vale-resort-lake",
  master: {
    courseId: "away-the-vale-resort-lake",
    name: "The Vale Resort - Lake Course",
    country: "Gales",
    links: { fpg: null, scorecards: "https://www.valeresort.com/the-lake-course/", extra: BKC26_LINKS },
    tees: [
      valeTee("vale-lake-uk-g1518", "USKids Girls 15-18", valeLakePar, valeLakeG1518, "F"),
      valeTee("vale-lake-uk-g1314", "USKids Girls 13-14", valeLakePar, valeLakeG1314, "F"),
      valeTee("vale-lake-uk-b9", "USKids Boys 9 / Girls 11-12", valeLakePar, valeLakeB9, "U"),
      valeTee("vale-lake-uk-b8", "USKids Boys 8 / Girls 9-10", valeLakePar, valeLakeB8, "U"),
      valeTee("vale-lake-uk-b7", "USKids Boys 7 & Under", valeLakePar, valeLakeB7),
      valeTee("vale-lake-uk-g8", "USKids Girls 8 & Under", valeLakePar, valeLakeG8, "F"),
    ],
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   US Kids German Masters 2026 (Golf Valley München, 3–4/10/2026) e
   US Kids World Championship 2026 (Pinehurst, EUA, 30/07–1/08/2026).
   Golf Valley: METROS do PDF oficial german_masters_2026_-_meters.pdf (Course
   B+C; o Signupanytime mostra-os como «YARDS» — não converter), com as
   raparigas nos tees dos rapazes como o PDF indica. Mundial: par e jardas por
   buraco dos resultados USKids (jardas × 0,9144).
   CR/Slope oficiais: german_masters_2026_-_course_rating_and_slope.pdf (só
   Boys 12, 13-14, 15-18 e Girls 15-18) e a imagem new_worlds_sr.png do Player Info Hub
   do Mundial (um escalão por campo; 9 buracos = rating de 9).
   Cores = Longleaf Tee System (o Tee 7 e o RS ficam sem cor).
   ───────────────────────────────────────────────────────────────────────── */

const gvmPar = [5,4,4,3,4,5,3,4,4,4,5,3,4,5,4,3,4,4]; // par USKids 72
const gvmB1518 = [480,380,334,162,360,485,152,362,345,317,489,142,352,505,371,128,335,372]; // 6071 m
const gvmB1314 = [425,367,311,155,360,423,152,362,335,265,461,130,314,472,346,110,324,362]; // 5674 m
const gvmB12 = [382,316,288,140,315,412,132,320,295,254,439,119,284,410,320,102,282,319]; // 5129 m
const gvmB1011 = [340,270,245,129,265,366,116,270,252,218,385,116,237,341,255,84,261,309]; // 4459 m
const gvmB9 = [297,236,215,120,232,320,110,236,221,191,337,108,208,299,223,84,228,270]; // 3935 m
const gvmB8 = [255,203,184,103,199,275,94,203,189]; // 1705 m, buracos 1–9
const gvmB7 = [212,169,153,86,166,229,79,169,158]; // 1421 m, buracos 1–9
const gvmB6 = [170,135,123,69,133,183,63,135,126]; // 1137 m, buracos 1–9

const wc26B12 = { par: [4,5,4,4,3,5,4,3,4,4,5,4,3,4,3,4,5,4], yd: [321,490,301,342,117,450,346,152,336,356,510,353,134,348,127,330,489,303] }; // Pinehurst No. 8, 5805 jd = 5308 m, buracos 1–18
const wc26B11 = { par: [5,3,4,5,3,4,4,4,4,4,5,4,3,4,3,5,4,4], yd: [437,121,334,470,110,304,372,319,257,285,448,348,119,295,143,428,292,345] }; // Talamore Golf Club, 5427 jd = 4964 m, buracos 1–18
const wc26B10 = { par: [4,5,4,4,3,5,4,4,3,4,3,4,5,4,4,4,3,5], yd: [251,440,289,278,90,419,302,238,121,255,107,306,415,233,312,280,102,408] }; // Legacy Golf Links, 4846 jd = 4430 m, buracos 1–18
const wc26B9 = { par: [4,5,4,5,3,4,3,4,3,4,4,3,5,4,4,4,4,5], yd: [237,391,251,343,94,279,103,247,109,244,255,97,366,224,235,215,285,389] }; // Pinehurst No. 1, 4364 jd = 3994 m, buracos 1–18
const wc26B8 = { par: [4,3,4,3,4,5,4,5,4], yd: [220,112,204,105,219,368,234,350,217] }; // Mid Pines (Back), 2029 jd = 1854 m, buracos 10–18
const wc26B7 = { par: [4,3,4,4,5,5,4,3,4], yd: [190,64,189,176,290,285,187,86,195] }; // Mid Pines (Front), 1662 jd = 1521 m, buracos 1–9
const wc26B6 = { par: [4,3,4,4,5,4,5,3,4], yd: [158,79,162,148,218,154,205,74,161] }; // Longleaf (Back), 1359 jd = 1241 m, buracos 10–18
const wc26G12 = { par: [4,5,4,4,3,4,4,4,4,4,4,3,5,3,4,5,4,4], yd: [310,414,289,323,118,319,288,290,285,288,287,94,439,106,276,470,303,305] }; // Pinehurst No. 5, 5204 jd = 4757 m, buracos 1–18
const wc26G11 = { par: [4,5,3,4,4,5,3,4,4,4,4,4,3,4,5,3,5,4], yd: [240,420,114,310,322,400,131,296,254,225,280,272,104,278,415,130,377,293] }; // Pinehurst No. 6, 4861 jd = 4444 m, buracos 1–18
const wc26G10 = { par: [4,4,3,5,4,4,3,5,4,4,3,4,3,4,5,5,4,4], yd: [247,255,118,341,232,240,89,335,236,249,97,257,114,255,358,330,257,226] }; // Quail Ridge, 4236 jd = 3873 m, buracos 1–18
const wc26G9 = { par: [4,4,4,3,5,3,4,5,4], yd: [218,190,182,98,316,92,220,301,225] }; // Longleaf (Front), 1842 jd = 1684 m, buracos 1–9
const wc26G8 = { par: [4,3,4,4,5,4,5,3,4], yd: [158,99,207,177,222,191,282,95,177] }; // Longleaf (Back), 1608 jd = 1471 m, buracos 10–18
const wc26G7 = { par: [4,4,4,3,5,3,4,5,4], yd: [165,146,142,84,210,92,149,195,165] }; // Longleaf (Front), 1348 jd = 1233 m, buracos 1–9
function ukYdTee(
  teeId: string, sex: "M" | "F", teeName: string, par: number[], yd: number[] | null,
  start: 1 | 10, cr: number | null, slope: number | null, teeColor?: string | null,
): Tee {
  return ukMTee(teeId, sex, teeName, par, yd ? yd.map((y) => Math.round(y * 0.9144)) : null, start, cr, slope, teeColor);
}

function ukMTee(
  teeId: string, sex: "M" | "F", teeName: string, par: number[], dist: number[] | null,
  start: 1 | 10, cr: number | null, slope: number | null, teeColor?: string | null,
): Tee {
  const n = dist?.length ?? par.length;
  const total = dist ? dist.reduce((a, b) => a + b, 0) : null;
  const r = { par: par.slice(0, n).reduce((a, b) => a + b, 0), courseRating: cr, slopeRating: slope };
  return {
    teeId, sex, teeName,
    ...(teeColor !== undefined ? { scorecardMeta: { teeColor } } : {}),
    ratings: n === 18 ? { holes18: r } : start === 10 ? { holes9Back: r } : { holes9Front: r },
    holes: par.slice(0, n).map((p, i) => ({ hole: start + i, par: p, si: null, distance: dist?.[i] ?? null })),
    distances: !dist
      ? { total: null, front9: null, back9: null, holesCount: n, complete18: false }
      : n === 18 ? vDist(dist)
        : { total, front9: start === 1 ? total : null, back9: start === 10 ? total : null, holesCount: 9, complete18: false },
  };
}

const GM26_LINKS = [
  { label: "US Kids German Masters 2026 - Course Rating & Slope", url: "https://tournaments.uskidsgolf.com/sites/default/files/german_masters_2026_-_course_rating_and_slope.pdf" },
];
const WC26_LINKS = [
  { label: "US Kids World Championship 2026 - Course Rating & Slope", url: "https://tournaments.uskidsgolf.com/sites/default/files/new_worlds_sr.png" },
];

const golfValleyMunchen: Course = {
  courseKey: "away-golf-valley-munchen",
  master: {
    courseId: "away-golf-valley-munchen",
    name: "Golf Valley München",
    country: "Alemanha",
    links: { fpg: null, scorecards: null, extra: GM26_LINKS },
    tees: [
      ukMTee("gvm-uk-b1518", "M", "USKids Boys 15-18", gvmPar, gvmB1518, 1, 73.5, 131), // Tee 7
      ukMTee("gvm-uk-g1518", "F", "USKids Girls 15-18", gvmPar, gvmB12, 1, 74.6, 129, "#ffffff"), // Tee 5
      ukMTee("gvm-uk-b1314", "M", "USKids Boys 13-14", gvmPar, gvmB1314, 1, 71.7, 129, "#111827"), // Tee 6
      ukMTee("gvm-uk-b12", "M", "USKids Boys 12", gvmPar, gvmB12, 1, 68.8, 122, "#ffffff"), // Tee 5
      ukMTee("gvm-uk-b1011", "M", "USKids Boys 11 / 10 / Girls 13-14", gvmPar, gvmB1011, 1, null, null, "#ef4444"), // Tee 4
      ukMTee("gvm-uk-b9", "M", "USKids Boys 9 / Girls 11-12", gvmPar, gvmB9, 1, null, null, "#f97316"), // Tee 3
      ukMTee("gvm-uk-b8", "M", "USKids Boys 8 / Girls 9-10", gvmPar, gvmB8, 1, null, null, "#fbbf24"), // Tee 2
      ukMTee("gvm-uk-b7", "M", "USKids Boys 7", gvmPar, gvmB7, 1, null, null, "#1e3a8a"), // Tee 1
      ukMTee("gvm-uk-b6", "M", "USKids Boys 6 & Under / Girls 8 & Under", gvmPar, gvmB6, 1, null, null, null), // Tee RS
    ],
  },
};

function wc26Course(key: string, name: string, tees: Tee[]): Course {
  return { courseKey: `away-${key}`, master: { courseId: `away-${key}`, name, country: "EUA", links: { fpg: null, scorecards: null, extra: WC26_LINKS }, tees } };
}

const pinehurstNo8 = wc26Course("pinehurst-no-8", "Pinehurst No. 8", [
  ukYdTee("ph8-uk-b12", "M", "USKids Boys 12", wc26B12.par, wc26B12.yd, 1, 68, 119, "#ffffff"), // Tee 5
]);
const pinehurstNo5 = wc26Course("pinehurst-no-5", "Pinehurst No. 5", [
  ukYdTee("ph5-uk-g12", "F", "USKids Girls 12", wc26G12.par, wc26G12.yd, 1, 70.6, 121, "#ef4444"), // Tee 4
]);
const pinehurstNo6 = wc26Course("pinehurst-no-6", "Pinehurst No. 6", [
  ukYdTee("ph6-uk-g11", "F", "USKids Girls 11", wc26G11.par, wc26G11.yd, 1, 69.2, 123, "#ef4444"), // Tee 4
]);
const pinehurstNo1 = wc26Course("pinehurst-no-1", "Pinehurst No. 1", [
  ukYdTee("ph1-uk-b9", "M", "USKids Boys 9", wc26B9.par, wc26B9.yd, 1, 62.4, 100, "#f97316"), // Tee 3
]);
const talamoreGolfClub = wc26Course("talamore-golf-club", "Talamore Golf Club", [
  ukYdTee("tal-uk-b11", "M", "USKids Boys 11", wc26B11.par, wc26B11.yd, 1, 67.2, 125, "#ffffff"), // Tee 5
]);
const legacyGolfLinks = wc26Course("legacy-golf-links", "Legacy Golf Links", [
  ukYdTee("leg-uk-b10", "M", "USKids Boys 10", wc26B10.par, wc26B10.yd, 1, 64.6, 114, "#ef4444"), // Tee 4
]);
const quailRidge = wc26Course("quail-ridge", "Quail Ridge", [
  ukYdTee("qr-uk-g10", "F", "USKids Girls 10", wc26G10.par, wc26G10.yd, 1, 65, 113, "#f97316"), // Tee 3
]);
const longleafGolf = wc26Course("longleaf-golf-family-club", "Longleaf Golf & Family Club", [
  ukYdTee("ll-uk-g9", "F", "USKids Girls 9", wc26G9.par, wc26G9.yd, 1, 30.5, 107, "#fbbf24"), // Tee 2, 1–9
  ukYdTee("ll-uk-g8", "F", "USKids Girls 8", wc26G8.par, wc26G8.yd, 10, 29.8, 102, "#1e3a8a"), // Tee 1, 10–18
  ukYdTee("ll-uk-g7", "F", "USKids Girls 7 & Under", wc26G7.par, wc26G7.yd, 1, 29.2, 97, null), // Tee RS, 1–9
  ukYdTee("ll-uk-b6", "M", "USKids Boys 6 & Under", wc26B6.par, wc26B6.yd, 10, 27.8, 85, null), // Tee RS, 10–18
]);
const midPines = wc26Course("mid-pines", "Mid Pines", [
  ukYdTee("mp-uk-b8", "M", "USKids Boys 8", wc26B8.par, wc26B8.yd, 10, 30.6, 113, "#fbbf24"), // Tee 2, 10–18
  ukYdTee("mp-uk-b7", "M", "USKids Boys 7", wc26B7.par, wc26B7.yd, 1, 28.7, 106, "#1e3a8a"), // Tee 1, 1–9
]);

/* Exportacao */

/** Campos extra adicionados manualmente (ainda sem rondas no melhorias.json) */
/* ─────────────────────────────────────────────────────────────────────────
   Golf Paris Val d'Europe Disneyland — USKids Paris Invitational 2025
   Campo: 27 buracos (3×9: ROUGE, BLEU, BLANC). Combinação do torneio: RED+BLUE.
   Fonte distâncias: mscorecard.com (cid=1236598351821) + PDF oficial do torneio.
   SI: mscorecard (requer login) — confirmado para Rouge e Bleu nines.
   CR/Slope: tees nomeados via des-balles-et-des-birdies.com; tees de torneio
   USKids via PDF oficial "SSS & SLOPE" Val d'Europe (Boys 13-18 72/131,
   Boys 12 67.8/119, Boys 10-11 66/115, Girls 13-18 72.8/132).
   ────────────────────────────────────────────────────────────────────── */

// Par e SI para a combinação RED (Rouge) + BLUE (Bleu)
const parisPar = [5,3,5,4,3,5,4,3,4, 4,4,4,3,5,3,4,4,5]; // par 72
const parisSI  = [7,15,3,11,17,1,5,13,9, 14,18,6,10,2,16,12,4,8];

// Distâncias por tee (metros) — fonte mscorecard.com (tees nomeados do campo)
// Combinação Rouge (front 9) + Bleu (back 9)
const parisNoirs   = [461,159,442,331,126,473,341,179,329, 326,283,393,198,542,151,294,373,475]; // 5876m — Noirs/Brancos (mesmo tee físico)
const parisJaunes  = [429,141,408,304,108,449,316,148,305, 310,257,373,176,499,143,279,347,450]; // 5442m — Amarelos
const parisBleus   = [408,124,387,282, 84,399,296,123,282, 287,242,351,155,485,118,258,326,422]; // 5029m — Azuis
const parisRouges  = [383,102,367,263, 68,374,275,110,256, 267,228,329,137,466,101,233,306,406]; // 4671m — Vermelhos
const parisViolets = [365,110,375,270, 75,355,285,115,235, 210,340,230,123,290,270, 90,225,310]; // 4273m — Violetas

// Distâncias por tee (metros) — fonte: PDF "Paris Invitational 2025 - Meters" (tees de torneio USKids)
// Nota: parisBleus = parisB12M (mesmo tee físico Bleus). Os outros são interpolados/específicos do torneio.
const parisB11M   = [383,102,367,263, 84,374,253,105,249, 267,224,329,134,466,101,233,306,406]; // 4646m (Boys 11, 10) — entre Bleus e Rouges
const parisB9M    = [337, 90,328,236, 90,311,207,100,218, 226,196,264,117,350,101,216,277,320]; // 3985m (Girls 11-12, Boys 9)

function parisHoles(dist: number[]): Hole[] {
  return dist.map((d, i) => ({ hole: i + 1, par: parisPar[i], si: parisSI[i], distance: d }));
}
function parisDist(dist: number[]): { total: number; front9: number; back9: number; holesCount: 18; complete18: true } {
  const front9 = dist.slice(0, 9).reduce((a, b) => a + b, 0);
  const back9  = dist.slice(9).reduce((a, b) => a + b, 0);
  return { total: front9 + back9, front9, back9, holesCount: 18, complete18: true };
}

// Nota: os PDFs de distâncias de 2025 e 2026 são IDÊNTICOS em todos os dados
// (mesmas distâncias por buraco, pares, escalões e tees RED-BLUE/WHITE) — só
// muda o ano no título. Mantemos os dois links por completude.
const PARIS_PDF_LINKS = [
  { label: "US Kids Paris Invitational 2025 - Distances (Meters)", url: "/data/paris_invitational_2025_distances_-_meters.pdf" },
  { label: "US Kids Paris Invitational 2026 - Distances (Meters) — iguais às de 2025", url: "/data/paris_invitational_2026_distances_-_meters.pdf" },
];

const golfParisValDEurope: Course = {
  courseKey: "away-golf-paris-val-deurope-red-blue",
  master: {
    courseId: "away-golf-paris-val-deurope-red-blue",
    name: "Golf Paris Val d'Europe Disneyland - RED/BLUE",
    country: "França",
    links: {
      fpg: null,
      scorecards: "https://www.mscorecard.com/mscorecard/showcourse.php?cid=1236598351821",
      extra: PARIS_PDF_LINKS,
    },
    tees: [
      // ── Tees nomeados do campo (mscorecard + CR/Slope via des-balles-et-des-birdies.com) ──
      {
        teeId: "paris-noirs",
        sex: "M",
        teeName: "Noirs / USKids Boys 15-18 / 13-14",
        scorecardMeta: { teeColor: "#1a1a1a" },
        ratings: { holes18: { par: 72, courseRating: 72.0, slopeRating: 131 } },
        holes: parisHoles(parisNoirs),
        distances: parisDist(parisNoirs),
      },
      {
        teeId: "paris-jaunes-m",
        sex: "M",
        teeName: "Jaunes",
        scorecardMeta: { teeColor: "#eab308" },
        ratings: { holes18: { par: 72, courseRating: 69.9, slopeRating: 123 } },
        holes: parisHoles(parisJaunes),
        distances: parisDist(parisJaunes),
      },
      {
        teeId: "paris-jaunes-f",
        sex: "F",
        teeName: "Jaunes",
        scorecardMeta: { teeColor: "#eab308" },
        ratings: { holes18: { par: 72, courseRating: 75.3, slopeRating: 138 } },
        holes: parisHoles(parisJaunes),
        distances: parisDist(parisJaunes),
      },
      {
        teeId: "paris-bleus-m",
        sex: "M",
        teeName: "Bleus / USKids Girls 13-18 / Boys 12", // Tee 5 USKids: Girls 13-18 e Boys 12
        scorecardMeta: { teeColor: "#3b82f6" },
        ratings: { holes18: { par: 72, courseRating: 67.8, slopeRating: 119 } },
        holes: parisHoles(parisBleus),
        distances: parisDist(parisBleus),
      },
      {
        teeId: "paris-bleus-f",
        sex: "F",
        teeName: "Bleus / USKids Girls 13-18 / Boys 12",
        scorecardMeta: { teeColor: "#3b82f6" },
        ratings: { holes18: { par: 72, courseRating: 72.8, slopeRating: 132 } },
        holes: parisHoles(parisBleus),
        distances: parisDist(parisBleus),
      },
      {
        teeId: "paris-rouges-m",
        sex: "M",
        teeName: "Rouges",
        scorecardMeta: { teeColor: "#ef4444" },
        ratings: { holes18: { par: 72, courseRating: 66.0, slopeRating: 115 } },
        holes: parisHoles(parisRouges),
        distances: parisDist(parisRouges),
      },
      {
        teeId: "paris-rouges-f",
        sex: "F",
        teeName: "Rouges",
        scorecardMeta: { teeColor: "#ef4444" },
        ratings: { holes18: { par: 72, courseRating: 70.4, slopeRating: 127 } },
        holes: parisHoles(parisRouges),
        distances: parisDist(parisRouges),
      },
      {
        teeId: "paris-violets-m",
        sex: "M",
        teeName: "Violets",
        scorecardMeta: { teeColor: "#a855f7" },
        ratings: { holes18: { par: 72, courseRating: 63.8, slopeRating: 112 } },
        holes: parisHoles(parisViolets),
        distances: parisDist(parisViolets),
      },
      {
        teeId: "paris-violets-f",
        sex: "F",
        teeName: "Violets",
        scorecardMeta: { teeColor: "#a855f7" },
        ratings: { holes18: { par: 72, courseRating: 67.9, slopeRating: 124 } },
        holes: parisHoles(parisViolets),
        distances: parisDist(parisViolets),
      },
      // ── Tees de torneio USKids (PDF oficial) — distâncias intermédias sem nome no mscorecard ──
      {
        teeId: "paris-uk-boys11",
        sex: "M",
        teeName: "USKids Boys 11 / 10",
        scorecardMeta: { teeColor: "#f97316" }, // Longleaf Tee 4 — entre Bleus e Rouges
        // CR/Slope oficiais USKids (PDF "SSS & SLOPE" Val d'Europe — Boys 10-11).
        ratings: { holes18: { par: 72, courseRating: 66.0, slopeRating: 115 } },
        holes: parisHoles(parisB11M),
        distances: parisDist(parisB11M),
      },
      {
        teeId: "paris-uk-boys9",
        sex: "M",
        teeName: "USKids Boys 9 / Girls 11-12",
        scorecardMeta: { teeColor: "#f97316" }, // Longleaf Tee 3
        ratings: { holes18: { par: 72, courseRating: null, slopeRating: null } },
        holes: parisHoles(parisB9M),
        distances: parisDist(parisB9M),
      },
    ],
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   Zarapicos Golf & Country Club (Salamanca, Espanha) — Amarelas
   Entrou a 23/10/2026 pelo cartão WHS do 6437 (29/05/2026, Tiger Trip
   Salamanca), com os metros a zero. Metros por buraco da tarjeta do campo
   (golfingrecord.com, «Amarillas», 6050 m; a GolfAdvisor dá 6042 m). Par e SI
   iguais buraco a buraco aos do cartão FPG; CR/Slope ficam os do cartão
   (69,1/136 — a tarjeta dá 69/136).
   ───────────────────────────────────────────────────────────────────────── */

const zarPar  = [5,4,4,3,5,4,4,3,4, 4,5,4,3,4,4,4,3,5];
const zarSI   = [7,11,1,17,15,9,5,13,3, 10,6,8,4,14,12,16,18,2];
const zarDistAmarelas = [484,304,399,150,439,357,375,168,365, 339,494,362,189,359,327,317,125,497];

const zarapicos: Course = {
  courseKey: "away-zarapicos-golf-country-club",
  master: {
    courseId: "away-zarapicos-golf-country-club",
    name: "Zarapicos Golf & Country Club",
    country: "Espanha",
    links: {
      fpg: null,
      scorecards: "https://www.golfingrecord.com/golf-scorecard/f46cd596-e33f-48c9-8061-f92f5935bd74",
    },
    tees: [
      {
        teeId: "away-zarapicos-golf-country-club-0",
        sex: "U",
        teeName: "AMARELAS",
        ratings: {
          holes18: { par: 72, courseRating: 69.1, slopeRating: 136 },
          holes9Front: { par: 36, courseRating: 34.5, slopeRating: 136 },
          holes9Back: { par: 36, courseRating: 34.5, slopeRating: 136 },
        },
        holes: ltHoles(zarPar, zarSI, zarDistAmarelas),
        distances: ltDist(zarDistAmarelas),
      },
    ],
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   The Alto Club (Espanha) — US Kids Golf Spanish Open 2025
   Fonte: «U.S. Kids Golf Spanish Open 2025 – The Alto Club – Meters»
   (spanish_open_distances_-_meters_0.pdf — a versão corrigida: bate com a de
   jardas; a primeira tinha o tee 6 com 5741 m) e «Spanish Open 2025 – Course
   Rating and S.R.» (so25). Os escalões de 9 buracos jogam o 10–18.
   É o antigo Almenara, em Sotogrande. SI do cartão do campo (AllSquare,
   «almenara-golf-sotogrande»: um só SI, igual para homens e senhoras; os tees
   Bull 69,7/126 e Vulture 72,1/128 dão os mesmos CR/Slope do PDF USKids). O
   campo é par 71: a USKids joga o buraco 2 como par 5.
   ───────────────────────────────────────────────────────────────────────── */

const altoPar = [5,5,4,3,4,4,3,5,3, 4,3,4,5,4,4,3,5,4]; // 72 (USKids)
const altoSI  = [10,4,6,14,16,1,18,15,12, 9,17,8,11,2,7,5,13,3];
const altoTee6 = [440,380,335,125,301,377,150,484,165, 344,153,351,422,368,312,160,413,335]; // 5615m — Boys 13-18
const altoTee5 = [434,355,300,109,257,357,114,410,145, 317,124,340,390,343,253,150,407,306]; // 5111m — Boys 12 / Girls 13-18
const altoTee4 = [360,355,280,101,245,285,89,360,126, 280,120,280,350,285,225,136,353,268];  // 4498m — Boys 11 / 10
const altoTee3 = [315,311,245,97,214,249,85,315,110, 245,105,245,306,249,197,119,309,235];   // 3952m — Boys 9 / Girls 11-12
const altoTee2  = [210,90,210,255,214,169,102,250,201]; // 1701m — Boys 8 / Girls 9-10 (10–18)
const altoTee1  = [175,75,175,213,178,141,85,208,168];  // 1417m — Boys 7 (10–18)
const altoTeeRS = [140,60,140,170,143,113,68,167,134];  // 1134m — Boys 6&U / Girls 8&U (10–18)

const SPANISH_OPEN_2025_LINKS = [
  {
    label: "US Kids Spanish Open 2025 - Distances (Meters)",
    url: "https://tournaments.uskidsgolf.com/sites/default/files/spanish_open_distances_-_meters_0.pdf",
  },
  {
    label: "US Kids Spanish Open 2025 - Course Rating & Slope",
    url: "https://tournaments.uskidsgolf.com/sites/default/files/so25_-_course_rating_and_slopes.pdf",
  },
];

/** Nove buracos jogados no 10–18 (holes numerados 10..18). */
function backNineHoles(par: number[], si: number[] | null, dist: number[]): Hole[] {
  return dist.map((d, i) => ({ hole: i + 10, par: par[i], si: si?.[i] ?? null, distance: d }));
}

function backNineDist(dist: number[]): { total: number; front9: null; back9: number; holesCount: 9; complete18: false } {
  const back9 = dist.reduce((a, b) => a + b, 0);
  return { total: back9, front9: null, back9, holesCount: 9, complete18: false };
}

const theAltoClub: Course = {
  courseKey: "away-the-alto-club",
  master: {
    courseId: "away-the-alto-club",
    name: "The Alto Club (Sotogrande)",
    country: "Espanha",
    links: { fpg: null, scorecards: null, extra: SPANISH_OPEN_2025_LINKS },
    tees: [
      {
        teeId: "alto-uk-boys1318",
        sex: "M",
        teeName: "USKids Boys 13-18",
        scorecardMeta: { teeColor: "#111827" }, // Longleaf Tee 6
        ratings: { holes18: { par: 72, courseRating: 69.7, slopeRating: 126 } },
        holes: vHoles(altoPar, altoTee6, altoSI),
        distances: vDist(altoTee6),
      },
      {
        teeId: "alto-uk-boys12",
        sex: "M",
        teeName: "USKids Boys 12",
        scorecardMeta: { teeColor: "#ffffff" }, // Longleaf Tee 5
        ratings: { holes18: { par: 72, courseRating: 67.5, slopeRating: 119 } },
        holes: vHoles(altoPar, altoTee5, altoSI),
        distances: vDist(altoTee5),
      },
      {
        teeId: "alto-uk-girls1318",
        sex: "F",
        teeName: "USKids Girls 13-18",
        scorecardMeta: { teeColor: "#ffffff" }, // Longleaf Tee 5 (o mesmo do Boys 12)
        ratings: { holes18: { par: 72, courseRating: 72.1, slopeRating: 128 } },
        holes: vHoles(altoPar, altoTee5, altoSI),
        distances: vDist(altoTee5),
      },
      {
        teeId: "alto-uk-boys11",
        sex: "M",
        teeName: "USKids Boys 11 / 10",
        scorecardMeta: { teeColor: "#ef4444" }, // Longleaf Tee 4
        ratings: { holes18: { par: 72, courseRating: null, slopeRating: null } },
        holes: vHoles(altoPar, altoTee4, altoSI),
        distances: vDist(altoTee4),
      },
      {
        teeId: "alto-uk-boys9",
        sex: "U",
        teeName: "USKids Boys 9 / Girls 11-12",
        scorecardMeta: { teeColor: "#f97316" }, // Longleaf Tee 3
        ratings: { holes18: { par: 72, courseRating: null, slopeRating: null } },
        holes: vHoles(altoPar, altoTee3, altoSI),
        distances: vDist(altoTee3),
      },
      {
        teeId: "alto-uk-tee2",
        sex: "U",
        teeName: "USKids Boys 8 / Girls 9-10",
        scorecardMeta: { teeColor: "#fbbf24" }, // Longleaf Tee 2
        ratings: { holes9Back: { par: 36, courseRating: null, slopeRating: null } },
        holes: backNineHoles(altoPar.slice(9), altoSI.slice(9), altoTee2),
        distances: backNineDist(altoTee2),
      },
      {
        teeId: "alto-uk-tee1",
        sex: "M",
        teeName: "USKids Boys 7",
        scorecardMeta: { teeColor: "#1e3a8a" }, // Longleaf Tee 1
        ratings: { holes9Back: { par: 36, courseRating: null, slopeRating: null } },
        holes: backNineHoles(altoPar.slice(9), altoSI.slice(9), altoTee1),
        distances: backNineDist(altoTee1),
      },
      {
        teeId: "alto-uk-teers",
        sex: "U",
        teeName: "USKids Boys 6&U / Girls 8&U",
        scorecardMeta: { teeColor: null }, // tee RS
        ratings: { holes9Back: { par: 36, courseRating: null, slopeRating: null } },
        holes: backNineHoles(altoPar.slice(9), altoSI.slice(9), altoTeeRS),
        distances: backNineDist(altoTeeRS),
      },
    ],
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   PGA National (Palm Beach Gardens, EUA) — US Kids Golf Holiday Classic 2025
   Fonte: «2025 Holiday Classic Yardages» (2025_holiday_classic_yardages.pdf,
   «Subject to Change»). Distâncias em JARDAS no PDF — guardadas tal como lá
   estão e convertidas para metros (×0,9144). Sem CR/Slope publicados.
   SI dos cartões do campo na GolfPass — tee M e misto com o SI de homens, tee
   F com o de senhoras. Palmer e Fazio: pares iguais ao PDF buraco a buraco.
   Match: é o «The Match» (par 67) com par USKids 72 — os par 3 estão nos
   mesmos buracos (2,4,6,11,13,18) e o 3 tem 255 jd como o tee Helm; a USKids
   faz par 5 de cinco par 4 compridos (1,9,10,15,17). O SI é o do campo.
   CR/Slope: a USGA (NCRDB) só tem os tees do resort (Fazio: Haig, 1…5; Match:
   Anchor, Sailboat, Helm, Pelican; Palmer); os tees USKids misturam marcas
   buraco a buraco e não têm rating — fica null, não se estima.
   Campos por escalão iguais de 2021 a 2025 (PDFs de cada ano e
   uskids-results); excepção: Girls 11 no Palmer até 2024 e no Match em 2025.
   Nomes dos campos iguais aos dos resultados USKids.
   ───────────────────────────────────────────────────────────────────────── */

const yd2m = (yd: number[]) => yd.map((y) => Math.round(y * 0.9144));

const HOLIDAY_CLASSIC_2025_LINKS = [
  {
    label: "US Kids Holiday Classic 2025 - Yardages",
    url: "https://tournaments.uskidsgolf.com/sites/default/files/2025_holiday_classic_yardages.pdf",
  },
  {
    label: "US Kids Holiday Classic 2025 - Player Information",
    url: "https://tournaments.uskidsgolf.com/sites/default/files/holiday_classic_player_email_2025.pdf",
  },
];

// Palmer — par 72
const pgaPalmerPar = [4,3,4,5,3,4,4,5,4, 3,4,5,3,4,4,4,4,5];
const pgaPalmerSIM = [9,17,3,1,15,7,11,5,13, 16,6,2,18,14,12,10,8,4];
const pgaPalmerSIF = [11,17,7,3,15,9,13,1,5, 16,6,4,18,14,12,8,10,2];
const pgaPalmerB1314 = yd2m([377,147,347,498,154,384,345,472,356, 156,357,455,126,299,343,368,377,550]); // 6111 yd — Tee 7
const pgaPalmerG1314 = yd2m([337,123,337,440,125,324,291,467,351, 120,342,425,121,295,289,357,302,546]); // 5592 yd — Tee 6
const pgaPalmerG11   = yd2m([282,94,303,401,88,316,237,417,286, 115,296,395,100,232,229,310,260,456]); // 4817 yd — Tee 4, Girls 11 (2021–2024)
const pgaPalmerG12   = yd2m([332,96,332,436,120,320,271,428,290, 117,300,399,105,285,267,346,292,479]);   // 5215 yd — Tee 5

// Match — par 72
const pgaMatchPar = [5,3,4,3,5,3,4,4,5, 5,3,4,3,4,5,4,5,3]; // par USKids (o campo é par 67)
const pgaMatchSIM = [5,17,3,15,11,13,1,7,9, 2,14,6,18,12,8,16,4,10];
const pgaMatchTee4 = yd2m([400,110,255,108,425,119,275,295,403, 391,124,244,117,258,430,268,349,130]); // 4701 yd — Girls 11 / Boys 10
const pgaMatchTee3 = yd2m([365,100,216,98,383,107,256,234,344, 368,87,200,112,225,386,229,320,118]);   // 4148 yd — Girls 10 / Boys 9

// Fazio — par 72; os escalões de 9 buracos jogam o 1–9 ou o 10–18
const pgaFazioPar = [5,4,4,5,3,4,3,4,4, 4,4,5,3,4,4,3,5,4];
const pgaFazioSIM = [5,13,9,1,17,11,15,3,7, 12,8,2,18,4,14,16,6,10];
const pgaFazioB12  = yd2m([499,328,320,466,127,306,131,318,345, 322,325,480,115,312,293,139,458,349]); // 5633 yd — Tee 6
const pgaFazioB11  = yd2m([475,302,300,430,110,285,125,275,312, 280,305,452,108,305,285,135,421,310]); // 5215 yd — Tee 5
const pgaFazioF9T1 = yd2m([241,175,181,232,65,162,76,188,199]);  // 1519 yd — Girls 8 / Boys 7 (1–9)
const pgaFazioF9RS = yd2m([212,121,142,201,63,148,66,137,141]);  // 1231 yd — Girls 7&U / Boys 6&U (1–9)
const pgaFazioB9T2 = yd2m([217,233,297,101,196,241,83,311,209]); // 1888 yd — Boys 8 / Girls 9 (10–18)

function pgaTee18(teeId: string, sex: "M" | "F" | "U", teeName: string, teeColor: string | null, par: number[], dist: number[], si?: number[]): Tee {
  return {
    teeId, sex, teeName,
    scorecardMeta: { teeColor },
    ratings: { holes18: { par: 72, courseRating: null, slopeRating: null } },
    holes: vHoles(par, dist, si),
    distances: vDist(dist),
  };
}

const pgaFazioUsgaTees: Tee[] = [
  ncrdbTee("pgaFazio-haig-m", "M", "Haig", pgaFazioPar, 72, 73.9, 130, 6977),
  ncrdbTee("pgaFazio-1-m", "M", "Tee 1", pgaFazioPar, 72, 71.9, 127, 6551),
  ncrdbTee("pgaFazio-2-m", "M", "Tee 2", pgaFazioPar, 72, 70, 125, 6187),
  ncrdbTee("pgaFazio-23-m", "M", "Tee 2/3", pgaFazioPar, 72, 68.5, 122, 5966),
  ncrdbTee("pgaFazio-3-m", "M", "Tee 3", pgaFazioPar, 72, 67.2, 117, 5574),
  ncrdbTee("pgaFazio-34-m", "M", "Tee 3/4", pgaFazioPar, 72, 66.3, 114, 5395),
  ncrdbTee("pgaFazio-4-m", "M", "Tee 4", pgaFazioPar, 72, 65.2, 112, 5117),
  ncrdbTee("pgaFazio-5-m", "M", "Tee 5", pgaFazioPar, 72, 60.7, 103, 4054),
  ncrdbTee("pgaFazio-1-f", "F", "Tee 1", pgaFazioPar, 72, 77.5, 137, 6551),
  ncrdbTee("pgaFazio-2-f", "F", "Tee 2", pgaFazioPar, 72, 76.1, 134, 6187),
  ncrdbTee("pgaFazio-23-f", "F", "Tee 2/3", pgaFazioPar, 72, 74.3, 130, 5966),
  ncrdbTee("pgaFazio-3-f", "F", "Tee 3", pgaFazioPar, 72, 72.8, 126, 5574),
  ncrdbTee("pgaFazio-34-f", "F", "Tee 3/4", pgaFazioPar, 72, 71.5, 124, 5395),
  ncrdbTee("pgaFazio-4-f", "F", "Tee 4", pgaFazioPar, 72, 70.1, 121, 5117),
  ncrdbTee("pgaFazio-5-f", "F", "Tee 5", pgaFazioPar, 72, 64.4, 106, 4054),
];
const pgaPalmerUsgaTees: Tee[] = [
  ncrdbTee("pgaPalmer-king-m", "M", "King", pgaPalmerPar, 72, 74.7, 142, 7077),
  ncrdbTee("pgaPalmer-1-m", "M", "Tee 1", pgaPalmerPar, 72, 72.9, 139, 6690),
  ncrdbTee("pgaPalmer-12-m", "M", "Tee 1/2", pgaPalmerPar, 72, 71.1, 138, 6329),
  ncrdbTee("pgaPalmer-2-m", "M", "Tee 2", pgaPalmerPar, 72, 70.3, 133, 6127),
  ncrdbTee("pgaPalmer-23-m", "M", "Tee 2/3", pgaPalmerPar, 72, 69.4, 127, 5855),
  ncrdbTee("pgaPalmer-3-m", "M", "Tee 3", pgaPalmerPar, 72, 67.8, 121, 5518),
  ncrdbTee("pgaPalmer-34-m", "M", "Tee 3/4", pgaPalmerPar, 72, 66.3, 117, 5177),
  ncrdbTee("pgaPalmer-4-m", "M", "Tee 4", pgaPalmerPar, 72, 63.8, 116, 4766),
  ncrdbTee("pgaPalmer-5-m", "M", "Tee 5", pgaPalmerPar, 72, 61.3, 108, 4044),
  ncrdbTee("pgaPalmer-1-f", "F", "Tee 1", pgaPalmerPar, 72, 79.4, 149, 6690),
  ncrdbTee("pgaPalmer-12-f", "F", "Tee 1/2", pgaPalmerPar, 72, 77.5, 145, 6329),
  ncrdbTee("pgaPalmer-2-f", "F", "Tee 2", pgaPalmerPar, 72, 76.3, 143, 6127),
  ncrdbTee("pgaPalmer-23-f", "F", "Tee 2/3", pgaPalmerPar, 72, 74.8, 139, 5855),
  ncrdbTee("pgaPalmer-3-f", "F", "Tee 3", pgaPalmerPar, 72, 72.9, 135, 5518),
  ncrdbTee("pgaPalmer-34-f", "F", "Tee 3/4", pgaPalmerPar, 72, 71, 129, 5177),
  ncrdbTee("pgaPalmer-4-f", "F", "Tee 4", pgaPalmerPar, 72, 69, 119, 4766),
  ncrdbTee("pgaPalmer-5-f", "F", "Tee 5", pgaPalmerPar, 72, 63.8, 103, 4044),
];
const pgaMatchUsgaTees: Tee[] = [
  ncrdbTee("pgaMatch-anchor-m", "M", "Anchor", null, 67, 69.1, 130, 5789),
  ncrdbTee("pgaMatch-sailboat-m", "M", "Sailboat", null, 67, 64.5, 118, 4889),
  ncrdbTee("pgaMatch-helm-m", "M", "Helm", null, 67, 60.9, 109, 3980),
  ncrdbTee("pgaMatch-anchor-f", "F", "Anchor", null, 67, 74.2, 136, 5789),
  ncrdbTee("pgaMatch-sailboat-f", "F", "Sailboat", null, 67, 69.1, 125, 4889),
  ncrdbTee("pgaMatch-helm-f", "F", "Helm", null, 67, 64, 109, 3980),
];

const pgaNationalPalmer: Course = {
  courseKey: "away-pga-national-golf-club-palmer",
  master: {
    courseId: "away-pga-national-golf-club-palmer",
    name: "PGA National Golf Club - Palmer",
    country: "EUA",
    links: { fpg: null, scorecards: null, extra: HOLIDAY_CLASSIC_2025_LINKS },
    tees: [
      pgaTee18("pga-palmer-uk-b1314", "M", "USKids Boys 13-14", null, pgaPalmerPar, pgaPalmerB1314, pgaPalmerSIM), // Tee 7
      pgaTee18("pga-palmer-uk-g1314", "F", "USKids Girls 13-14", "#111827", pgaPalmerPar, pgaPalmerG1314, pgaPalmerSIF), // Tee 6
      pgaTee18("pga-palmer-uk-g12", "F", "USKids Girls 12", "#ffffff", pgaPalmerPar, pgaPalmerG12, pgaPalmerSIF), // Tee 5
      pgaTee18("pga-palmer-uk-g11", "F", "USKids Girls 11 (2021–2024)", "#ef4444", pgaPalmerPar, pgaPalmerG11, pgaPalmerSIF), // Tee 4
      ...pgaPalmerUsgaTees,
    ],
  },
};

const pgaNationalMatch: Course = {
  courseKey: "away-pga-national-golf-club-match",
  master: {
    courseId: "away-pga-national-golf-club-match",
    name: "PGA National Golf Club - Match",
    country: "EUA",
    links: { fpg: null, scorecards: null, extra: HOLIDAY_CLASSIC_2025_LINKS },
    tees: [
      pgaTee18("pga-match-uk-tee4", "U", "USKids Girls 11 / Boys 10", "#ef4444", pgaMatchPar, pgaMatchTee4, pgaMatchSIM), // Tee 4
      pgaTee18("pga-match-uk-tee3", "U", "USKids Girls 10 / Boys 9", "#f97316", pgaMatchPar, pgaMatchTee3, pgaMatchSIM), // Tee 3
      ...pgaMatchUsgaTees,
    ],
  },
};

const pgaNationalFazio: Course = {
  courseKey: "away-pga-national-golf-club-fazio",
  master: {
    courseId: "away-pga-national-golf-club-fazio",
    name: "PGA National Golf Club - Fazio",
    country: "EUA",
    links: { fpg: null, scorecards: null, extra: HOLIDAY_CLASSIC_2025_LINKS },
    tees: [
      pgaTee18("pga-fazio-uk-b12", "M", "USKids Boys 12", "#111827", pgaFazioPar, pgaFazioB12, pgaFazioSIM), // Tee 6
      pgaTee18("pga-fazio-uk-b11", "M", "USKids Boys 11", "#ffffff", pgaFazioPar, pgaFazioB11, pgaFazioSIM), // Tee 5
      {
        teeId: "pga-fazio-uk-tee2",
        sex: "U",
        teeName: "USKids Boys 8 / Girls 9",
        scorecardMeta: { teeColor: "#fbbf24" }, // Tee 2 — 10–18
        ratings: { holes9Back: { par: 36, courseRating: null, slopeRating: null } },
        holes: backNineHoles(pgaFazioPar.slice(9), pgaFazioSIM.slice(9), pgaFazioB9T2),
        distances: backNineDist(pgaFazioB9T2),
      },
      {
        teeId: "pga-fazio-uk-tee1",
        sex: "U",
        teeName: "USKids Girls 8 / Boys 7",
        scorecardMeta: { teeColor: "#1e3a8a" }, // Tee 1 — 1–9
        ratings: { holes9Front: { par: 36, courseRating: null, slopeRating: null } },
        holes: vHoles(pgaFazioPar.slice(0, 9), pgaFazioF9T1, pgaFazioSIM.slice(0, 9)),
        distances: vDist(pgaFazioF9T1),
      },
      {
        teeId: "pga-fazio-uk-teers",
        sex: "U",
        teeName: "USKids Girls 7&U / Boys 6&U",
        scorecardMeta: { teeColor: null }, // tee RS — 1–9
        ratings: { holes9Front: { par: 36, courseRating: null, slopeRating: null } },
        holes: vHoles(pgaFazioPar.slice(0, 9), pgaFazioF9RS, pgaFazioSIM.slice(0, 9)),
        distances: vDist(pgaFazioF9RS),
      },
      ...pgaFazioUsgaTees,
    ],
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   PGA National Slieve Russell (Irlanda) — European Ladies' Team Championship 2026
   Três portuguesas jogaram-no (7–8/07/2026) e os clubes delas registaram o
   mesmo tee como «AZUIS», «VERMELHAS» e «AMARELAS», em duas entradas de campo
   («… Golf» e «… Golf (Irlanda)»). Era um tee só: o da prova, CR 77,1 /
   Slope 139 (EGA, «HCP Adjustment Data – ELTC 2026»). Buracos, par e SI do
   cartão da brochura oficial (Golf Ireland, «ELTC26 Information Brochure»,
   rascunho de 04/03/2026) — distâncias em JARDAS, convertidas aqui; o cartão
   «AMARELAS» tinha-as copiado como metros. O SI bate com os cartões dos
   clubes; no 10 a brochura dá 384 jd e o cartão 390 (fica a brochura).
   As duas chaves recebem o mesmo tee para a fusão por nome (alias em
   courseAliases.ts) não trazer de volta os tees dos cartões.
   ───────────────────────────────────────────────────────────────────────── */

const slievePar = [4,4,4,3,4,5,3,4,5, 4,3,4,5,4,4,3,4,5]; // 72
const slieveSI  = [9,1,6,18,4,15,17,13,12, 10,16,2,3,14,7,11,8,5];
const slieveELTC = yd2m([384,366,369,135,369,478,185,329,498, 384,135,376,497,348,397,160,382,469]);

function slieveRussell(courseKey: string, name: string): Course {
  return {
    courseKey,
    master: {
      courseId: courseKey,
      name,
      country: "Irlanda",
      links: {
        fpg: null,
        scorecards: null,
        extra: [
          {
            label: "ELTC 2026 - Information Brochure (scorecard)",
            url: "https://www.ega-golf.ch/sites/ega/files/2026-03/ELTC26_IRL_Information%20Brochure_Final.pdf",
          },
        ],
      },
      tees: [
        {
          teeId: "slieve-eltc-2026",
          sex: "F",
          teeName: "European Ladies Team Championship",
          scorecardMeta: { teeColor: null },
          ratings: { holes18: { par: 72, courseRating: 77.1, slopeRating: 139 } },
          holes: vHoles(slievePar, slieveELTC, slieveSI),
          distances: vDist(slieveELTC),
        },
      ],
    },
  };
}

const slieveRussellMain = slieveRussell("away-pga-national-slieve-russell-golf", "PGA National Slieve Russell Golf");
const slieveRussellIrlanda = slieveRussell("away-pga-national-slieve-russell-golf-irlanda", "PGA National Slieve Russell Golf (Irlanda)");

/* ─────────────────────────────────────────────────────────────────────────
   Parador de Málaga Golf (Espanha) — Campeonato Internacional de Andalucía 2026
   Três entradas do mesmo campo («Parador Málaga del Golf», «Parador, Málaga»,
   «Parador Malaga Espanha»), todas da mesma prova (31/07–02/08/2026). Os
   clubes registaram dois tees: AZUIS 75,1/134 e BRANCAS 73,2/132. Par e SI do
   cartão do campo (GolfingRecord), iguais ao cartão do clube que trazia SI;
   os outros tinham SI 1..18 seguido ou par 4×18 (inventados). Sem metros por
   tee: o cartão do campo (5900 m) não diz de que tee é.
   ───────────────────────────────────────────────────────────────────────── */

const paradorMalagaPar = [5,4,4,4,4,3,4,4,3, 4,3,5,3,5,4,5,4,4]; // 72
const paradorMalagaSI  = [18,13,15,2,5,9,1,14,8, 11,6,7,12,10,4,17,16,3];

function paradorMalagaTee(teeId: string, teeName: string, cr: number, slope: number): Tee {
  return {
    teeId,
    sex: "U",
    teeName,
    ratings: { holes18: { par: 72, courseRating: cr, slopeRating: slope } },
    holes: paradorMalagaPar.map((p, i) => ({ hole: i + 1, par: p, si: paradorMalagaSI[i], distance: null })),
    distances: { total: null, front9: null, back9: null, holesCount: 18, complete18: true },
  };
}

function paradorMalaga(courseKey: string, name: string): Course {
  return {
    courseKey,
    master: {
      courseId: courseKey,
      name,
      country: "Espanha",
      links: {
        fpg: null,
        scorecards: "https://www.golfingrecord.com/golf-scorecard/9d36bc4e-9a9e-2d73-1366-d8a208bf6288",
      },
      tees: [
        paradorMalagaTee("parador-malaga-azuis", "AZUIS", 75.1, 134),
        paradorMalagaTee("parador-malaga-brancas", "BRANCAS", 73.2, 132),
      ],
    },
  };
}

const paradorMalagaDelGolf = paradorMalaga("away-parador-malaga-del-golf", "Parador Málaga del Golf");
const paradorMalagaVirgula = paradorMalaga("away-parador-malaga", "Parador, Málaga");
const paradorMalagaEspanha = paradorMalaga("away-parador-malaga-espanha", "Parador Malaga Espanha");
// Duas entradas com o nome do TORNEIO no lugar do campo (mesmos pares e SI):
// sem tees, só levam as voltas para a fusão por nome (aliases em courseAliases.ts).
const semTees = (c: Course): Course => ({ ...c, master: { ...c.master, tees: [] } });
const paradorMalagaTorneio1 = semTees(paradorMalaga("away-campeonato-andalucia-sub-16-y-sub-18-mas-y-femen", "Campeonato Andalucia Sub 16 Y Sub 18 Mas. Y Femen."));
const paradorMalagaTorneio2 = semTees(paradorMalaga("away-campeonato-internacional-de-andalucia-sub18-e-sub1", "Campeonato Internacional de Andalucia Sub18 e Sub1"));

/* ─────────────────────────────────────────────────────────────────────────
   Craigielaw Golf Club (Aberlady, Escócia) — par 71
   Duas entradas do mesmo campo: «Craigielaw Golf Club» (um cartão «BRANCAS»
   com par 4×18, o CR do tee White e, como «metros», as JARDAS do Tee 4 da
   USKids) e «Cragielaw» (gralha; R&A Girls' Amateur 2026, cartão «VERMELHAS»
   CR 76,2/138, SI 1..18 inventado, sem metros). Agora:
   - tees do clube White/Blue/Red: jardas, par, SI e CR/Slope da GolfPass
     (White 72,5/129 confirmado na página da qualificação do The Open);
   - R&A Girls' Amateur 2026 (10–11/08): par 71, 6090 jd (R&A); CR/Slope do
     cartão da prova; sem metros por buraco publicados;
   - USKids Boys 11 do European Championship 2026: Tee 4, 5218 jd, par
     USKids 72 (uskids-results), CR 66,9/118 (course_rating_and_slope_-_euc_2026.pdf).
   A chave da gralha fica sem tees: só leva as voltas para a fusão por nome
   (alias «cragielaw» em courseAliases.ts) e assim é a entrada certa que dá
   o nome e o URL ao campo.
   ───────────────────────────────────────────────────────────────────────── */

const craigPar = [4,5,3,5,4,3,4,3,4, 3,5,4,4,4,4,4,3,5]; // 71
const craigSI  = [9,11,15,1,5,13,3,7,17, 10,12,6,4,8,18,2,16,14];
const craigWhite = yd2m([327,558,155,583,424,174,366,186,342, 174,540,445,403,407,346,467,161,543]); // 6601 yd
const craigBlue  = yd2m([291,509,149,535,393,149,351,138,328, 157,507,411,369,381,336,425,149,465]); // 6043 yd
const craigRed   = yd2m([272,464,132,474,355,129,274,122,300, 133,452,378,333,352,276,378,138,411]); // 5373 yd
const craigUKPar = [4,5,3,5,5,3,4,3,4, 3,5,5,4,4,4,4,3,4]; // par USKids 72
const craigUKB11 = yd2m([270,439,134,434,393,122,272,126,295, 133,455,370,333,352,275,329,136,350]); // 5218 yd — Tee 4

function craigTee(teeId: string, sex: "M" | "F", teeName: string, teeColor: string, dist: number[], cr: number, slope: number): Tee {
  return {
    teeId, sex, teeName,
    scorecardMeta: { teeColor },
    ratings: { holes18: { par: 71, courseRating: cr, slopeRating: slope } },
    holes: vHoles(craigPar, dist, craigSI),
    distances: vDist(dist),
  };
}

function craigielaw(courseKey: string, name: string): Course {
  return {
    courseKey,
    master: {
      courseId: courseKey,
      name,
      country: "Escócia",
      links: {
        fpg: null,
        scorecards: "https://www.golfpass.com/courses/16702-craigielaw-golf-club/scorecard-and-layout",
        extra: [
          {
            label: "US Kids European Championship 2026 - Course Rating & Slope",
            url: "https://tournaments.uskidsgolf.com/sites/default/files/course_rating_and_slope_-_euc_2026.pdf",
          },
        ],
      },
      tees: [
        craigTee("craig-white-m", "M", "White", "#ffffff", craigWhite, 72.5, 129),
        craigTee("craig-blue-m", "M", "Blue", "#3b82f6", craigBlue, 70.0, 124),
        craigTee("craig-blue-f", "F", "Blue", "#3b82f6", craigBlue, 76.0, 137),
        craigTee("craig-red-m", "M", "Red", "#ef4444", craigRed, 66.9, 118),
        craigTee("craig-red-f", "F", "Red", "#ef4444", craigRed, 72.4, 129),
        {
          teeId: "craig-randa-girls-2026",
          sex: "F",
          teeName: "R&A Girls' Amateur 2026",
          scorecardMeta: { teeColor: null },
          ratings: { holes18: { par: 71, courseRating: 76.2, slopeRating: 138 } },
          holes: craigPar.map((p, i) => ({ hole: i + 1, par: p, si: craigSI[i], distance: null })),
          distances: { total: Math.round(6090 * 0.9144), front9: null, back9: null, holesCount: 18, complete18: true },
        },
        {
          teeId: "craig-uk-boys11",
          sex: "M",
          teeName: "USKids Boys 11",
          scorecardMeta: { teeColor: "#ef4444" }, // Longleaf Tee 4
          ratings: { holes18: { par: 72, courseRating: 66.9, slopeRating: 118 } },
          holes: vHoles(craigUKPar, craigUKB11, craigSI),
          distances: vDist(craigUKB11),
        },
      ],
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   Terre dei Consoli Golf Club (Roma) — US Kids Rome Classic
   CR/Slope dos PDFs USKids «Rome Classic 2025/2026 – Course Rating and S.R.»
   (iguais nos dois anos; 12 escalões desde 30/10/2026): Boys 11 64,4/107 (o Manuel,
   2025); os de 9 buracos (Boys 8 29,5/95, Boys 7, Girls 9-10 e 8) no 10–18. Metros e
   par do PDF oficial rome_classic_2026_-_meters.pdf (o Signupanytime mostra os
   mesmos números como «YARDS»), que põe as raparigas nos tees dos rapazes
   (Girls 15-18 = Boys 12, 13-14 = Boys 11, 11-12 = Boys 9, 9-10 = Boys 8). Sem SI: a GolfPass tem o cartão estragado (par 3 de
   603 jd), não serve. «Terre Del Consoli» (gralha) junta-se pelo alias.
   ───────────────────────────────────────────────────────────────────────── */

const tdcParB11 = [4,5,3,4,4,4,4,5,3, 4,5,4,3,4,4,3,5,4];
const tdcB11 = [193,390,119,266,254,282,270,350,94, 263,350,229,110,284,224,134,350,260]; // 4422 m (= Boys 10)
const tdcB1318 = [297,489,150,339,338,334,366,460,123, 325,441,270,143,352,320,158,432,394]; // 5731 m
const tdcB12   = [255,442,125,298,293,315,327,380,106, 263,390,239,110,284,301,134,380,333]; // 4975 m
const tdcB9    = [193,350,119,200,254,247,236,330,90, 200,330,229,91,249,224,114,330,260];   // 4046 m
const tdcB8    = [180,300,170,91,200,191,70,300,223]; // 1725 m, buracos 10–18
const tdcB7    = [150,240,142,67,160,160,58,240,160]; // 1377 m, buracos 10–18
const tdcG8    = [115,185,109,67,123,133,58,185,123]; // 1098 m, buracos 10–18 (cartões do Signupanytime, 30/10/2026)

function tdcTee(id: string, sex: "M" | "F", teeName: string, cr: number, slope: number, dist: number[] | null, teeColor?: string): Tee {
  const back9 = dist?.length === 9 || (!dist && cr < 40);
  const par = back9 ? tdcParB11.slice(9) : tdcParB11;
  const holes: Hole[] = par.map((p, i) => ({ hole: i + (back9 ? 10 : 1), par: p, si: null, distance: dist?.[i] ?? null }));
  const r = { par: par.reduce((a, b) => a + b, 0), courseRating: cr, slopeRating: slope };
  return {
    teeId: id, sex, teeName,
    ...(teeColor ? { scorecardMeta: { teeColor } } : {}),
    ratings: back9 ? { holes9Back: r } : { holes18: r },
    holes,
    distances: dist ? (back9
      ? { total: dist.reduce((a, b) => a + b, 0), front9: null, back9: dist.reduce((a, b) => a + b, 0), holesCount: 9, complete18: false }
      : vDist(dist))
      : { total: null, front9: null, back9: null, holesCount: back9 ? 9 : 18, complete18: false },
  };
}

const terreDeiConsoli: Course = {
  courseKey: "away-terre-dei-consoli-golf-club",
  master: {
    courseId: "away-terre-dei-consoli-golf-club",
    name: "Terre Dei Consoli Golf Club",
    country: "Itália",
    links: {
      fpg: null,
      scorecards: null,
      extra: [
        {
          label: "US Kids Rome Classic 2026 - Course Rating & Slope",
          url: "https://tournaments.uskidsgolf.com/sites/default/files/rome_classic_2026_-_course_rating_and_slope.pdf",
        },
      ],
    },
    // Os 12 escalões do PDF 2026 (= 2025). Raparigas pelos cartões do Signupanytime:
    // jogaram os tees dos rapazes (G13-14 = B11/10, G11-12 = B9, G9-10 = B8), as G8 um
    // tee próprio; Girls 15-18 sem jogadoras em 2026 — sem distâncias.
    tees: [
      tdcTee("tdc-uk-boys1318", "M", "USKids Boys 13-18", 70.9, 124, tdcB1318),
      tdcTee("tdc-uk-boys12", "M", "USKids Boys 12", 67.1, 115, tdcB12),
      tdcTee("tdc-uk-boys11", "M", "USKids Boys 11", 64.4, 107, tdcB11),
      tdcTee("tdc-uk-boys10", "M", "USKids Boys 10", 64.4, 107, tdcB11),
      tdcTee("tdc-uk-boys9", "M", "USKids Boys 9", 62.5, 105, tdcB9),
      tdcTee("tdc-uk-boys8", "M", "USKids Boys 8", 29.5, 95, tdcB8, "#fbbf24"), // Longleaf Tee 2
      tdcTee("tdc-uk-boys7", "M", "USKids Boys 7 & Under", 27.8, 87, tdcB7),
      tdcTee("tdc-uk-girls1518", "F", "USKids Girls 15-18", 72.2, 121, tdcB12),
      tdcTee("tdc-uk-girls1314", "F", "USKids Girls 13-14", 68.9, 114, tdcB11),
      tdcTee("tdc-uk-girls1112", "F", "USKids Girls 11-12", 66.6, 109, tdcB9),
      tdcTee("tdc-uk-girls910", "F", "USKids Girls 9-10", 31.2, 96, tdcB8),
      tdcTee("tdc-uk-girls8", "F", "USKids Girls 8 & Under", 27.4, 80, tdcG8),
    ],
  },
};
const terreDelConsoli = semTees({ ...terreDeiConsoli, courseKey: "away-terre-del-consoli-golf-club", master: { ...terreDeiConsoli.master, courseId: "away-terre-del-consoli-golf-club", name: "Terre Del Consoli Golf Club" } });

/* ─────────────────────────────────────────────────────────────────────────
   Golf de Chantilly — Old Vineuil (European Ladies' Team Championship 2025)
   Percurso misto Vineuil/Longères, par 70 — não é o «Vineuil New» das provas
   U14 (par 71). O pipeline separa-o pelo desenho de par (parRoutes no
   course-aliases.json). Cartão da brochura oficial da EGA («ELTC Information
   Brochure», 2025): tee Yellow, SSS 75,4 / Slope 141, 5744 m; os cartões dos
   clubes chamavam-lhe «AZUIS»/«VERMELHAS» e davam 5841 m.
   ───────────────────────────────────────────────────────────────────────── */

const oldVineuilPar = [4,4,3,4,4,3,4,5,4, 4,4,4,4,3,4,3,4,5]; // 70
const oldVineuilSI  = [15,6,18,13,2,7,11,9,3, 10,5,16,1,12,4,17,8,14];
const oldVineuilYellow = [400,284,142,297,357,160,319,472,379, 370,320,328,379,168,378,159,368,464]; // 5744 m

const chantillyOldVineuil: Course = {
  courseKey: "away-golf-de-chantilly-old-vineuil",
  master: {
    courseId: "away-golf-de-chantilly-old-vineuil",
    name: "Golf de Chantilly - Old Vineuil",
    country: "França",
    links: {
      fpg: null,
      scorecards: null,
      extra: [
        {
          label: "ELTC 2025 - Information Brochure (scorecard)",
          url: "https://ega-golf.ch/sites/ega/files/2025-07/ELTC%20INFORMATION%20BROCHURE%20FINAL_.pdf",
        },
      ],
    },
    tees: [
      {
        teeId: "chantilly-old-vineuil-yellow-f",
        sex: "F",
        teeName: "Yellow (ELTC 2025)",
        scorecardMeta: { teeColor: "#fbbf24" },
        ratings: { holes18: { par: 70, courseRating: 75.4, slopeRating: 141 } },
        holes: vHoles(oldVineuilPar, oldVineuilYellow, oldVineuilSI),
        distances: vDist(oldVineuilYellow),
      },
    ],
  },
};

const craigielawMain = craigielaw("away-craigielaw-golf-club", "Craigielaw Golf Club");
const craigielawGralha: Course = (() => {
  const c = craigielaw("away-cragielaw", "Cragielaw");
  return { ...c, master: { ...c.master, tees: [] } };
})();

export function getExtraCourses(): Course[] {
  return [
    villaPadiernaFlamingos,
    villaPadiernaFlamingos2,
    sanRoqueOld,
    sanRoqueNew,
    valeWalesNational,
    valeLake,
    golfValleyMunchen,
    pinehurstNo8,
    pinehurstNo5,
    pinehurstNo6,
    pinehurstNo1,
    talamoreGolfClub,
    legacyGolfLinks,
    quailRidge,
    longleafGolf,
    midPines,
    elPratRosa,
    elPratAmarillo,
    elPratVerde,
    elPratAzul,
    elPratVioleta,
    elPratValles,
    marcoSimone,
    doralRedTiger,
    doralGoldenPalm,
    doralSilverFox,
    doralBlueMonster,
    leToquet_LaForet,
    leToquet_LaMer,
    glenGolfClub,
    montecchiaWhiteRed,
    montecchiaRedGreen,
    montecchiaGreenWhite,
    frassanelle,
    galzignano,
    golfParisValDEurope,
    zarapicos,
    theAltoClub,
    pgaNationalPalmer,
    pgaNationalMatch,
    pgaNationalFazio,
    slieveRussellMain,
    slieveRussellIrlanda,
    paradorMalagaDelGolf,
    paradorMalagaVirgula,
    paradorMalagaEspanha,
    paradorMalagaTorneio1,
    paradorMalagaTorneio2,
    craigielawMain,
    craigielawGralha,
    terreDeiConsoli,
    terreDelConsoli,
    chantillyOldVineuil,
  ];
}
