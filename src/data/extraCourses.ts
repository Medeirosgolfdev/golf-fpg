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

/* ─────────────────────────────────────────────────────────────────────────
   Glen Golf Club — East Links, North Berwick, Escócia (Reino Unido)
   Fonte (campo): scorecard oficial — 6 conjuntos de marcações.
   Fonte (USKids): "2025 U.S. Kids Golf European Championship Yardages" PDF
                   + "Course Rating and Slope" PDF (EUC 2025).
   Distâncias originais em JARDAS, convertidas para METROS (×0.9144) por buraco.

   Tees do campo:
     White (M, par 70, 6275y)         — medal masculino
     Yellow (M, par 70, 6048y)        — diária masculino
     Red (M, par 73, 5773y)           — avançada masculino (hh.9/12/15/17 par+1)
     Blue (M, par 67, 4801y)          — junior masculino (hh.3 par 3, hh.6 par 4)
     Blue (F, par 69, 4801y)          — medal feminino
     Red (F, par 69, 5773y)           — diária feminino

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
const glenParBlueM  = [4,4,3,3,4,4,4,4,3, 4,4,4,3,4,4,3,4,4]; // 67
const glenParBlueF  = [4,4,4,3,4,5,4,4,3, 4,4,4,3,4,4,3,4,4]; // 69
const glenParRedF   = glenParBlueF;                            // 69

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

// 6 tees do scorecard oficial do campo
const glenTees: Tee[] = [
  {
    teeId: "glen-white",
    sex: "M",
    teeName: "White",
    scorecardMeta: { teeColor: "#ffffff" },
    ratings: { holes18: { par: 70, courseRating: null, slopeRating: null } },
    holes: glenHoles(glenParWhite, glenSImain, glenDistWhite),
    distances: glenDist(glenDistWhite),
  },
  {
    teeId: "glen-yellow",
    sex: "M",
    teeName: "Yellow",
    scorecardMeta: { teeColor: "#fbbf24" },
    ratings: { holes18: { par: 70, courseRating: null, slopeRating: null } },
    holes: glenHoles(glenParYellow, glenSImain, glenDistYellow),
    distances: glenDist(glenDistYellow),
  },
  {
    teeId: "glen-red-m",
    sex: "M",
    teeName: "Red",
    scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 73, courseRating: null, slopeRating: null } },
    holes: glenHoles(glenParRedM, glenSIredM, glenDistRed),
    distances: glenDist(glenDistRed),
  },
  {
    teeId: "glen-blue-m",
    sex: "M",
    teeName: "Blue",
    scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 67, courseRating: null, slopeRating: null } },
    holes: glenHoles(glenParBlueM, glenSImain, glenDistBlue),
    distances: glenDist(glenDistBlue),
  },
  {
    teeId: "glen-blue-f",
    sex: "F",
    teeName: "Blue (F)",
    scorecardMeta: { teeColor: "#3b82f6" },
    ratings: { holes18: { par: 69, courseRating: null, slopeRating: null } },
    holes: glenHoles(glenParBlueF, glenSIblueF, glenDistBlue),
    distances: glenDist(glenDistBlue),
  },
  {
    teeId: "glen-red-f",
    sex: "F",
    teeName: "Red (F)",
    scorecardMeta: { teeColor: "#ef4444" },
    ratings: { holes18: { par: 69, courseRating: null, slopeRating: null } },
    holes: glenHoles(glenParRedF, glenSImain, glenDistRed),
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

/* Exportacao */

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
    glenGolfClub,
  ];
}
