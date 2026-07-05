/**
 * uskidsData.ts — All USKids data constants (consolidated)
 *
 * Merged from:
 *   - uskidsConstants.ts (escalão ordering, keyword arrays, regional championships)
 *   - uskidsTournamentData.ts (tee lookup, tournament links)
 *
 * Functions and React helpers live in uskidsHelpers.ts.
 */

import type { TeeInfo } from "./uskidsTypes";

/* ═══════════════════════════════════════════════════════════════
   ESCALÃO ORDERING
   ═══════════════════════════════════════════════════════════════ */

const ESCALAO_ORDER: Record<string, number> = {
  "Boys 7 & Under": 1,
  "Boys 7": 2,
  "Boys 8": 3,
  "Boys 9": 4,
  "Boys 10": 5,
  "Boys 11": 6,
  "Boys 12": 7,
  "Boys 13": 8,
  "Boys 13-14": 9,
  "Boys 14": 10,
  "Boys 15-18": 11,
  "Girls 7 & Under": 20,
  "Girls 8 & Under": 21,
  "Girls 8": 22,
  "Girls 9": 23,
  "Girls 9-10": 24,
  "Girls 10": 25,
  "Girls 11": 26,
  "Girls 11-12": 27,
  "Girls 12": 28,
  "Girls 13": 29,
  "Girls 13-14": 30,
  "Girls 15-18": 31,
};

export const ESCALOES_DESTAQUE_USKIDS = new Set([
  "Boys 9", "Boys 10", "Boys 11", "Boys 12", "Boys 13", "Boys 13-14",
]);

export function sortEscaloes<T extends { nome: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (ESCALAO_ORDER[a.nome] ?? 99) - (ESCALAO_ORDER[b.nome] ?? 99));
}

/* ═══════════════════════════════════════════════════════════════
   KEYWORD ARRAYS (region / circuit classification)
   ═══════════════════════════════════════════════════════════════ */

export const USA_KEYWORDS = [
  "jekyll", "state invitational", "state championship", "state open",
  "tennessee", "florida", "texas", "california", "georgia", "virginia",
  "wisconsin", "nevada", "arkansas", "ohio", "oklahoma", "missouri",
  "mississippi", "hawaii", "illinois", "north carolina", "northwest",
  "palmer foundation", "van horn cup", "world championship", "world van horn",
  "canadian invitational",
];

export const EURO_KEYWORDS = [
  "european championship", "european van horn", "europe", "marco simone",
  "venice", "rome", "terre dei consoli", "irish open", "paris invitational",
  "nordic", "al hamra",
];

export const NON_USKIDS_KEYWORDS = [
  "greatgolf", "great golf", "quinta do lago", "qdl", "figo",
  "doral", "wjgc", "bjgt", "daily mail",
];

/* ═══════════════════════════════════════════════════════════════
   REGIONAL CHAMPIONSHIPS
   ═══════════════════════════════════════════════════════════════ */

export const REGIONAL_CHAMPIONSHIPS: Record<number, { shortName: string; location: string; urlUSKids?: string; past2026?: boolean }> = {
  20895: { shortName: "Sandestin Championship",   location: "Sandestin, FL",      urlUSKids: "https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/516801/sandestin-championship-2026", past2026: true },
  21004: { shortName: "Desert Shootout",           location: "Phoenix, AZ",        urlUSKids: "https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/516958/desert-shootout-2026", past2026: true },
  21133: { shortName: "Jekyll Island Cup",         location: "Jekyll Island, GA",  urlUSKids: "https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/517061/jekyll-island-cup-2026" },
  21620: { shortName: "Texas Open",                location: "Horseshoe Bay, TX",  urlUSKids: "https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/517558/texas-open-2026" },
  22037: { shortName: "Palmer Kids Invitational",   location: "Latrobe, PA",        urlUSKids: "https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/517996/palmer-foundation-kids-invitational-2026" },
};

/* ═══════════════════════════════════════════════════════════════
   TOURNAMENT LINKS
   ═══════════════════════════════════════════════════════════════ */

export const LINKS_EXTRA: Record<number, { label: string; url: string }[]> = {
  20175: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516026/rome-classic-2025/registration" },
    { label: "📄 Distâncias", url: "https://drive.google.com/file/d/14rQM4CQuN7d4VqWaYTewcrRAoSzCzrgv/view?usp=sharing" },
  ],
  19418: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/515206/venice-open-2025/field" },
    { label: "📄 Distâncias", url: "https://tournaments.uskidsgolf.com/sites/default/files/venice_open_2025_tournament_distances_-_meters.pdf" },
  ],
  18438: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/international/past-results?date%5Bvalue%5D%5Byear%5D=2025&tournament_id=514135" },
    { label: "📄 Distâncias", url: "https://drive.google.com/file/d/1AgicV6PnrYYc8AbA5CFPmttJOICzZVZm/view" },
  ],
  21080: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516989/marco-simone-invitational-2026" },
    { label: "📄 Distâncias", url: "https://drive.google.com/file/d/1AgicV6PnrYYc8AbA5CFPmttJOICzZVZm/view" },
    { label: "🏌️ Campo", url: "https://tournaments.uskidsgolf.com/node/514018" },
  ],
  21131: [
    { label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/517047/european-championship-2026" },
    { label: "ℹ️ Info jogadores ↗", url: "https://tournaments.uskidsgolf.com/player_info_hub_euc2026" },
  ],
  21239: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517160/2026-mississippi-state-invitational" }],
  21471: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517475/2026-hawaii-state-invitational" }],
  21133: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/517061/jekyll-island-cup-2026" }],
  21620: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/517558/texas-open-2026" }],
  22037: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/517996/palmer-foundation-kids-invitational-2026" }],
  21610: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/world/find-tournament/517536/world-championship-2026" }],
  21628: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517562/2026-tennessee-spring-state-invitational" }],
  21629: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517563/2026-wisconsin-state-invitational" }],
  21631: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517628/2026-nevada-state-invitational" }],
  21650: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517647/2026-northwest-state-invitational" }],
  21722: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517714/2026-arkansas-state-invitational" }],
  21845: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517776/2026-florida-spring-state-invitational" }],
  21846: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517777/2026-northern-california-state-invitational" }],
  21847: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517778/2026-arizona-state-invitational" }],
  21848: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/517786/2026-north-carolina-state-invitational" }],
  22059: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/518025/2026-illinois-state-invitational" }],
  22062: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/518037/2026-georgia-state-invitational" }],
  22080: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/518039/2026-oklahoma-state-invitational" }],
  22088: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/518045/2026-ohio-state-invitational" }],
  22090: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/518043/2026-missouri-state-invitational" }],
  22099: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/518057/2026-texas-spring-state-invitational" }],
  22121: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/518093/2026-washington-state-invitational" }],
  22122: [{ label: "USKids ↗", url: "https://tournaments.uskidsgolf.com/tournaments/state/find-tournament/518092/2026-virginia-state-invitational" }],
};

/* ═══════════════════════════════════════════════════════════════
   TEE LOOKUP (par + metres per flight per tournament)
   ═══════════════════════════════════════════════════════════════ */

// ── Paris Val d'Europe — par + metros por tee (RED/BLUE, par 72) ──
// Espelham os tees de extraCourses.ts (golfParisValDEurope). Reutilizados
// pelos dois Paris Invitational (2025 t=18975, 2026 t=21795) — setup idêntico.
const PARIS_PAR = [5,3,5,4,3,5,4,3,4, 4,4,4,3,5,3,4,4,5];
const PARIS_M_NOIRS  = [461,159,442,331,126,473,341,179,329, 326,283,393,198,542,151,294,373,475]; // Boys 13-18
const PARIS_M_BLEUS  = [408,124,387,282, 84,399,296,123,282, 287,242,351,155,485,118,258,326,422]; // Boys 12 / Girls 13-18
const PARIS_M_BOYS11 = [383,102,367,263, 84,374,253,105,249, 267,224,329,134,466,101,233,306,406]; // Boys 10-11
const PARIS_M_BOYS9  = [337, 90,328,236, 90,311,207,100,218, 226,196,264,117,350,101,216,277,320]; // Boys 9

// CR/Slope OFICIAIS do PDF USKids "SSS & SLOPE" — Golf Val d'Europe (Paris
// Invitational 2026; distâncias e setup idênticos aos de 2025):
//   Boys 13-18 → 72 / 131 (Noirs) · Boys 12 → 67.8 / 119 (Bleus)
//   Boys 10-11 → 66 / 115 (tee USKids Boys 11/10) · Girls 13-18 → 72.8 / 132 (Bleus F)
// Boys 9 e escalões menores não têm SSS publicado (SD fica "—").
const parisTees: Record<number, TeeInfo> = {
  2111: { campo: "Golf Paris Val d'Europe", tee: "Boys 15-18", par: PARIS_PAR, metros: PARIS_M_NOIRS,  cr: 72.0, slope: 131 },
  2106: { campo: "Golf Paris Val d'Europe", tee: "Boys 13-14", par: PARIS_PAR, metros: PARIS_M_NOIRS,  cr: 72.0, slope: 131 },
  2105: { campo: "Golf Paris Val d'Europe", tee: "Boys 12",    par: PARIS_PAR, metros: PARIS_M_BLEUS,  cr: 67.8, slope: 119 },
  2104: { campo: "Golf Paris Val d'Europe", tee: "Boys 11",    par: PARIS_PAR, metros: PARIS_M_BOYS11, cr: 66.0, slope: 115 },
  2103: { campo: "Golf Paris Val d'Europe", tee: "Boys 10",    par: PARIS_PAR, metros: PARIS_M_BOYS11, cr: 66.0, slope: 115 },
  2102: { campo: "Golf Paris Val d'Europe", tee: "Boys 9",     par: PARIS_PAR, metros: PARIS_M_BOYS9 },
};

export const TEES_LOOKUP: Record<number, Record<number, TeeInfo>> = {
  // ── Paris Invitational 2026 & 2025 – Golf Paris Val d'Europe (RED/BLUE) ──
  21795: parisTees,
  18975: parisTees,
  // ── Rome Classic 2025 – Terre Dei Consoli (Championship Course) ───
  // CR/Slope OFICIAIS do PDF USKids "COURSE RATING AND S.R." (rome_classic_2025).
  20175: {
    2105: { campo: "Terre Dei Consoli Golf Club", tee: "Championship Course", par: [4,5,3,4,4,4,4,5,3, 4,5,4,3,4,4,3,5,4], metros: [255,442,125,298,293,315,327,380,106, 263,390,239,110,284,301,134,380,333], cr: 67.1, slope: 115 },
    2104: { campo: "Terre Dei Consoli Golf Club", tee: "Championship Course", par: [4,5,3,4,4,4,4,5,3, 4,5,4,3,4,4,3,5,4], metros: [193,390,119,266,254,282,270,350,94, 263,350,229,110,284,224,134,350,260], cr: 64.4, slope: 107 },
    2103: { campo: "Terre Dei Consoli Golf Club", tee: "Championship Course", par: [4,5,3,4,4,4,4,5,3, 4,5,4,3,4,4,3,5,4], metros: [193,390,119,266,254,282,270,350,94, 263,350,229,110,284,224,134,350,260], cr: 64.4, slope: 107 },
    2102: { campo: "Terre Dei Consoli Golf Club", tee: "Championship Course", par: [4,5,3,4,4,4,4,5,3, 4,5,4,3,4,4,3,5,4], metros: [193,350,119,200,254,247,236,330,90, 200,330,229,91,249,224,114,330,260], cr: 62.5, slope: 105 },
  },
  // ── Venice Open 2025 – Golf Della Montecchia (Boys/Girls 9-12) + Frassanelle (13-18) ─
  // CR/Slope OFICIAIS do PDF USKids "COURSE RATING & SLOPE" (venice_open_2025_
  // course_rating_slope.pdf). 9H (Boys 8/7&U, Girls 9/8&U) sem SSS → SD "—".
  19418: {
    // Frassanelle Golf — escalões 13-18 (par/metros vêm dos results)
    2114: { campo: "Frassanelle Golf", tee: "Boys 13",     par: [], metros: [], cr: 70.7, slope: 129 },
    2115: { campo: "Frassanelle Golf", tee: "Boys 14",     par: [], metros: [], cr: 70.7, slope: 129 },
    2111: { campo: "Frassanelle Golf", tee: "Boys 15-18",  par: [], metros: [], cr: 70.7, slope: 129 },
    2121: { campo: "Frassanelle Golf", tee: "Girls 13-14", par: [], metros: [], cr: 71.7, slope: 126 },
    2112: { campo: "Frassanelle Golf", tee: "Girls 15-18", par: [], metros: [], cr: 71.7, slope: 126 },
    // Golf Della Montecchia — escalões 9-12
    2105: { campo: "Golf Della Montecchia", tee: "White+Red", par: [5,3,4,4,4,4,3,4,5, 4,3,5,4,4,4,4,3,5], metros: [401,145,300,310,280,330,128,290,390, 305,150,410,280,283,310,310,145,410], cr: 67.6, slope: 118 },
    2104: { campo: "Golf Della Montecchia", tee: "White+Red", par: [5,3,4,4,4,4,3,4,5, 4,3,5,4,4,4,4,3,5], metros: [389,145,262,266,280,289,128,290,350, 255,122,330,230,265,284,290,115,325], cr: 64.8, slope: 111 },
    2103: { campo: "Golf Della Montecchia", tee: "Red+Green", par: [4,3,5,4,4,4,4,3,5, 4,5,4,3,4,3,4,5,4], metros: [255,122,330,230,265,284,290,115,325, 263,350,287,120,250,103,244,340,250], cr: 63.3, slope: 106 },
    2102: { campo: "Golf Della Montecchia", tee: "Green+White", par: [4,5,4,3,4,3,4,5,4, 5,3,4,4,4,4,3,4,5], metros: [220,300,240,100,210,90,210,300,230, 300,110,225,230,210,230,95,215,290], cr: 60.5, slope: 100 },
    2120: { campo: "Golf Della Montecchia", tee: "Girls 12", par: [], metros: [], cr: 68.0, slope: 111 },
    2119: { campo: "Golf Della Montecchia", tee: "Girls 11", par: [], metros: [], cr: 68.0, slope: 112 },
    2118: { campo: "Golf Della Montecchia", tee: "Girls 10", par: [], metros: [], cr: 64.5, slope: 104 },
  },
  // ── El Prat (9H) ─────────────────────────────────────
  15573: {
    2102: { campo: "Real Club de Golf El Prat", tee: "Boys 9", par: [4,3,4,5,4,3,4,4,5], metros: [] },
  },
  // ── Marco Simone 2025 ────────────────────────────────
  18438: {
    2105: { campo: "Marco Simone Golf & Country Club", tee: "Boys 12", par: [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5], metros: [274,349,302,113,266,258,152,375,382, 307,247,381,103,310,292,255,151,442] },
    2104: { campo: "Marco Simone Golf & Country Club", tee: "Boys 11", par: [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5], metros: [274,299,272,103,227,231,132,338,352, 267,219,356,91,270,237,225,133,404] },
    2103: { campo: "Marco Simone Golf & Country Club", tee: "Boys 10", par: [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5], metros: [274,299,272,103,227,231,132,338,352, 267,219,356,91,270,237,225,133,404] },
    2102: { campo: "Marco Simone Golf & Country Club", tee: "Boys 9",  par: [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5], metros: [240,262,238,103,200,201,127,298,308, 234,219,291,91,236,225,190,133,354] },
  },
  // ── Marco Simone 2026 ────────────────────────────────
  21080: {
    2105: { campo: "Marco Simone Golf & Country Club", tee: "Boys 12", par: [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5], metros: [274,349,302,113,266,258,152,375,382, 307,247,381,103,310,292,255,151,442] },
    2104: { campo: "Marco Simone Golf & Country Club", tee: "Boys 11", par: [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5], metros: [274,299,272,103,227,231,132,338,352, 267,219,356,91,270,237,225,133,404] },
    2103: { campo: "Marco Simone Golf & Country Club", tee: "Boys 10", par: [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5], metros: [274,299,272,103,227,231,132,338,352, 267,219,356,91,270,237,225,133,404] },
    2102: { campo: "Marco Simone Golf & Country Club", tee: "Boys 9",  par: [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5], metros: [240,262,238,103,200,201,127,298,308, 234,219,291,91,236,225,190,133,354] },
  },
  // ── European Championship 2026 — Multi-campo (East Lothian, Escócia) ─
  // CR/Slope OFICIAIS do PDF USKids EUC (course_rating_and_slope_-_euc_2025.pdf
  // + tabela enviada pela organização para EUC 2026; valores idênticos).
  // age_group → escalão (via uskids-field.json):
  //   2104=Boys 11, 2105=Boys 12, 2114=Boys 13, 2115=Boys 14, 2111=Boys 15-18,
  //   2120=Girls 12, 2121=Girls 13-14, 2112=Girls 15-18.
  //
  // SEM CR/Slope publicados (UI mostra "—"):
  //   2101=Boys 8, 2102=Boys 9, 2103=Boys 10, 2113=Boys 7 & Under,
  //   2116=Girls 8 & Under, 2117=Girls 9, 2118=Girls 10, 2119=Girls 11.
  // Para esses escalões, par/metros são lidos do uskids-results.json em runtime.
  21131: {
    // Boys 11 @ Craigielaw Golf Club, Tee 4 — par 72, 5218y / 4771m
    2104: {
      campo: "Craigielaw Golf Club",
      tee: "Boys 11",
      par: [4,5,3,5,5,3,4,3,4, 3,5,5,4,4,4,4,3,4],
      metros: [247,401,123,397,359,112,249,115,270, 122,416,338,304,322,251,301,124,320],
      cr: 66.9,
      slope: 118,
    },
    // Boys 12 @ Glen Golf Club, Tee 5 (=Red tee) — par 72, 5773y / 5280m
    2105: {
      campo: "Glen Golf Club",
      tee: "Boys 12",
      par: [4,4,4,3,4,5,4,5,3, 4,4,5,3,4,5,3,4,4],
      metros: [299,314,305,148,324,427,329,347,180, 311,292,395,117,294,365,164,342,327],
      cr: 68.3,
      slope: 119,
    },
    // Boys 13 @ Royal Musselburgh Golf Club — par/metros vão chegar nos resultados
    2114: {
      campo: "Royal Musselburgh Golf Club",
      tee: "Boys 13",
      par: [],
      metros: [],
      cr: 68.8,
      slope: 123,
    },
    // Boys 14 @ Glen Golf Club (mesmo campo que Boys 12, tee diferente)
    2115: {
      campo: "Glen Golf Club",
      tee: "Boys 14",
      par: [],
      metros: [],
      cr: 70.6,
      slope: 124,
    },
    // Boys 15-18 @ Musselburgh Golf Club
    2111: {
      campo: "Musselburgh Golf Club",
      tee: "Boys 15-18",
      par: [],
      metros: [],
      cr: 72.4,
      slope: 131,
    },
    // Girls 12 @ Glen Golf Club
    2120: {
      campo: "Glen Golf Club",
      tee: "Girls 12",
      par: [],
      metros: [],
      cr: 66.6,
      slope: 110,
    },
    // Girls 13-14 @ Musselburgh Golf Club
    2121: {
      campo: "Musselburgh Golf Club",
      tee: "Girls 13-14",
      par: [],
      metros: [],
      cr: 69.5,
      slope: 119,
    },
    // Girls 15-18 @ Royal Musselburgh Golf Club
    2112: {
      campo: "Royal Musselburgh Golf Club",
      tee: "Girls 15-18",
      par: [],
      metros: [],
      cr: 72.8,
      slope: 128,
    },
  },
};
