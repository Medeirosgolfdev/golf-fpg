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

export const ESCALAO_ORDER: Record<string, number> = {
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

export const TEES_LOOKUP: Record<number, Record<number, TeeInfo>> = {
  // ── Rome Classic 2025 – Terre Dei Consoli Golf Club ───
  20175: {
    2105: { campo: "Terre Dei Consoli Golf Club", tee: "Championship Course", par: [4,5,3,4,4,4,4,5,3, 4,5,4,3,4,4,3,5,4], metros: [255,442,125,298,293,315,327,380,106, 263,390,239,110,284,301,134,380,333] },
    2104: { campo: "Terre Dei Consoli Golf Club", tee: "Championship Course", par: [4,5,3,4,4,4,4,5,3, 4,5,4,3,4,4,3,5,4], metros: [193,390,119,266,254,282,270,350,94, 263,350,229,110,284,224,134,350,260] },
    2103: { campo: "Terre Dei Consoli Golf Club", tee: "Championship Course", par: [4,5,3,4,4,4,4,5,3, 4,5,4,3,4,4,3,5,4], metros: [193,390,119,266,254,282,270,350,94, 263,350,229,110,284,224,134,350,260] },
    2102: { campo: "Terre Dei Consoli Golf Club", tee: "Championship Course", par: [4,5,3,4,4,4,4,5,3, 4,5,4,3,4,4,3,5,4], metros: [193,350,119,200,254,247,236,330,90, 200,330,229,91,249,224,114,330,260] },
  },
  // ── Venice Open 2025 – Golf Della Montecchia ─────────
  19418: {
    2105: { campo: "Golf Della Montecchia", tee: "White+Red", par: [5,3,4,4,4,4,3,4,5, 4,3,5,4,4,4,4,3,5], metros: [401,145,300,310,280,330,128,290,390, 305,150,410,280,283,310,310,145,410] },
    2104: { campo: "Golf Della Montecchia", tee: "White+Red", par: [5,3,4,4,4,4,3,4,5, 4,3,5,4,4,4,4,3,5], metros: [389,145,262,266,280,289,128,290,350, 255,122,330,230,265,284,290,115,325] },
    2103: { campo: "Golf Della Montecchia", tee: "Red+Green", par: [4,3,5,4,4,4,4,3,5, 4,5,4,3,4,3,4,5,4], metros: [255,122,330,230,265,284,290,115,325, 263,350,287,120,250,103,244,340,250] },
    2102: { campo: "Golf Della Montecchia", tee: "Green+White", par: [4,5,4,3,4,3,4,5,4, 5,3,4,4,4,4,3,4,5], metros: [220,300,240,100,210,90,210,300,230, 300,110,225,230,210,230,95,215,290] },
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
};
