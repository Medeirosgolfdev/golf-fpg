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
        distances: { total: doralRTDistB89.reduce((a,b)=>a+b,0), front9: 0, back9: doralRTDistB89.reduce((a,b)=>a+b,0), holesCount: 9 as any, complete18: false as any },
      },
      {
        teeId: "doral-rt-b7u",
        sex: "M",
        teeName: "Boys 7 & Under",
        scorecardMeta: { teeColor: "#fbbf24" },
        ratings: { holes18: { par: 36, courseRating: null, slopeRating: null } },
        holes: doralHoles9(doralRTParB9, doralRTDistB7, 10),
        distances: { total: doralRTDistB7.reduce((a,b)=>a+b,0), front9: 0, back9: doralRTDistB7.reduce((a,b)=>a+b,0), holesCount: 9 as any, complete18: false as any },
      },
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
    ],
  },
};

/* Exportação */

/** Campos extra adicionados manualmente (ainda sem rondas no melhorias.json) */
export function getExtraCourses(): Course[] {
  return [
    marcoSimone,
    doralRedTiger,
    doralGoldenPalm,
    doralSilverFox,
    doralBlueMonster,
    leToquet_LaForet,
    leToquet_LaMer,
  ];
}
