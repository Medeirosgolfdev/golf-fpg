/**
 * src/data/rivalData.ts
 *
 * Dados partilhados entre KIDSPage e BJGTAnalysisPage:
 * torneio actual, scorecards do field, escalas de performance.
 *
 * NÃO inclui: T (lista de torneios), D (jogadores rivais),
 * UP, AVG_R, AVG_T — esses variam entre as duas páginas.
 */

export const COURSE_KEYWORDS = ["villa padierna", "flamingos"];

export const TOURN = {
  name: "Daily Mail World Junior Golf Championship",
  dates: "24–27 Fev 2026",
  days: 3,
  location: "Villa Padierna — Flamingos Golf Club",
  city: "Málaga, Espanha",
};

export const FIELD_2025 = {
  nPlayers: 12, nRounds: 36, fieldAvg: 78.3, top5Avg: 73.0, top10Avg: 75.5,
  winner: { name: "Dmitrii Elchaninov", total: 205, result: -8 },
  holes: [
    { h:1,  par:5, fAvg:5.81, t5:5.33, fDbl:25.0, t5Dbl:13.3, fPob:44.4, t5Pob:66.7 },
    { h:2,  par:3, fAvg:3.11, t5:2.87, fDbl:0.0,  t5Dbl:0.0,  fPob:72.2, t5Pob:93.3 },
    { h:3,  par:4, fAvg:4.39, t5:4.00, fDbl:13.9, t5Dbl:0.0,  fPob:63.9, t5Pob:73.3 },
    { h:4,  par:3, fAvg:3.44, t5:3.53, fDbl:5.6,  t5Dbl:6.7,  fPob:52.8, t5Pob:46.7 },
    { h:5,  par:4, fAvg:4.17, t5:3.87, fDbl:8.3,  t5Dbl:0.0,  fPob:72.2, t5Pob:86.7 },
    { h:6,  par:5, fAvg:5.28, t5:5.00, fDbl:8.3,  t5Dbl:0.0,  fPob:66.7, t5Pob:73.3 },
    { h:7,  par:4, fAvg:4.14, t5:3.87, fDbl:5.6,  t5Dbl:0.0,  fPob:77.8, t5Pob:93.3 },
    { h:8,  par:3, fAvg:3.39, t5:3.00, fDbl:13.9, t5Dbl:0.0,  fPob:66.7, t5Pob:86.7 },
    { h:9,  par:4, fAvg:4.44, t5:4.20, fDbl:11.1, t5Dbl:6.7,  fPob:63.9, t5Pob:80.0 },
    { h:10, par:4, fAvg:4.89, t5:4.53, fDbl:25.0, t5Dbl:6.7,  fPob:44.4, t5Pob:66.7 },
    { h:11, par:5, fAvg:5.42, t5:5.20, fDbl:5.6,  t5Dbl:0.0,  fPob:52.8, t5Pob:60.0 },
    { h:12, par:3, fAvg:3.44, t5:3.27, fDbl:5.6,  t5Dbl:0.0,  fPob:58.3, t5Pob:66.7 },
    { h:13, par:4, fAvg:4.47, t5:4.27, fDbl:13.9, t5Dbl:6.7,  fPob:52.8, t5Pob:60.0 },
    { h:14, par:4, fAvg:4.22, t5:3.93, fDbl:11.1, t5Dbl:6.7,  fPob:69.4, t5Pob:86.7 },
    { h:15, par:5, fAvg:5.50, t5:5.07, fDbl:13.9, t5Dbl:6.7,  fPob:61.1, t5Pob:80.0 },
    { h:16, par:3, fAvg:3.28, t5:3.13, fDbl:11.1, t5Dbl:13.3, fPob:72.2, t5Pob:86.7 },
    { h:17, par:4, fAvg:4.19, t5:3.67, fDbl:5.6,  t5Dbl:0.0,  fPob:72.2, t5Pob:86.7 },
    { h:18, par:4, fAvg:4.69, t5:4.27, fDbl:16.7, t5Dbl:6.7,  fPob:41.7, t5Pob:60.0 },
  ],
  /* Difficulty rank: hardest first */
  diffRank: [10,1,18,15,13,9,4,12,11,8,3,6,16,14,17,5,7,2],
  leaderboard: [
    { name:"Dmitrii Elchaninov", pos:1, country:"🇷🇺", total:205, result:-8, rounds:[68,69,68], best:68 },
    { name:"Marcus Karim", pos:2, country:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", total:218, result:5, rounds:[74,73,71], best:71 },
    { name:"Harrison Barnett", pos:3, country:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", total:220, result:7, rounds:[77,71,72], best:71 },
    { name:"Julian Sepulveda", pos:4, country:"🇺🇸", total:223, result:10, rounds:[73,77,73], best:73 },
    { name:"Mihir Pasura", pos:5, country:"🇬🇧", total:229, result:16, rounds:[82,74,73], best:73 },
    { name:"Nicolas Pape", pos:6, country:"🇹🇭", total:231, result:18, rounds:[75,77,79], best:75 },
    { name:"Harry-James Odell", pos:7, country:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", total:231, result:18, rounds:[77,74,80], best:74 },
    { name:"Aronas Juodis", pos:8, country:"🇱🇹", total:232, result:19, rounds:[74,77,81], best:74 },
    { name:"Hugo Luque Reina", pos:9, country:"🇪🇸", total:237, result:24, rounds:[78,77,82], best:77 },
    { name:"Maxime Vervaet", pos:10, country:"🇪🇸", total:239, result:26, rounds:[83,77,79], best:77 },
    { name:"Miroslavs Bogdanovs", pos:24, country:"🇪🇸", total:263, result:50, rounds:[86,88,89], best:86 },
    { name:"Alexis Beringer", pos:33, country:"🇨🇭", total:290, result:77, rounds:[93,94,103], best:93 },
  ],
};

export const VP_PAR = [5,3,4,3,4,5,4,3,4,4,5,3,4,4,5,3,4,4]; // par 71 — tee normal
// Villa Padierna Flamingos — tee "VERMELHAS WJGC 2026" (dados: away-villa-padierna-flamingos-espanha-2)
// par 72 (buracos 10 é par 5 no WJGC vs par 4 no tee normal)
export const VP_WJGC26_PAR = [5,3,4,3,4,5,4,3,4,5,5,3,4,4,5,3,4,4];
export const VP_WJGC26_SI  = [4,10,6,18,16,8,14,12,2,1,7,9,15,11,5,13,17,3];
export const VP_WJGC26_M   = [428,144,313,117,268,420,290,125,262,322,417,119,254,311,384,93,237,338]; // 4842m
// Villa Padierna Flamingos — tee normal VERMELHAS (away-villa-padierna-flamingos-espanha-0)
export const VP_SI = [4,10,6,18,16,8,14,12,2,1,7,9,15,11,5,13,17,3];
export const VP_M  = [428,144,313,117,268,420,290,125,262,322,417,119,254,311,384,93,237,338]; // 4842m
// Villa Padierna Alferini — WJGC 2026 Boys 12-13 (away-villa-padierna-alferini-0)
export const VP_ALFERINI_PAR = [4,4,3,5,4,4,5,3,4,4,4,5,5,3,4,5,3,4]; // par 72
export const VP_ALFERINI_SI  = [5,1,15,13,7,17,11,3,9,16,6,18,14,12,4,2,10,8];
export const VP_ALFERINI_M   = [274,329,116,358,298,323,401,135,331,286,329,429,389,177,305,410,139,265]; // 5294m
// Le Touquet La Forêt — EOWAGR 2025 (away-golf-du-touquet-la-foret-0)
export const LT_FORET_PAR = [5,4,4,4,5,3,4,3,4,4,5,3,4,4,3,5,4,4]; // par 72
export const LT_FORET_SI  = [9,11,13,5,7,17,3,15,1,12,6,8,2,16,14,10,4,18];
export const LT_FORET_M   = [382,251,251,336,375,116,295,121,310,281,369,129,285,263,114,378,300,249]; // 4805m
// Frassanelle Golf Club — Venice Open 2025 tee AMARELAS (away-venice-junior-open-frassanele-golf-club-0)
export const VENICE_PAR = [4,5,4,4,3,5,4,3,4,5,3,4,4,4,3,4,4,5]; // par 72
export const VENICE_SI  = [16,4,10,2,6,8,12,14,18,5,15,17,7,9,13,11,3,1];
export const VENICE_M   = [323,501,311,380,174,493,331,161,286,477,145,258,380,356,125,301,355,522]; // 5879m

// Marco Simone — tees USKids (away-marco-simone-uskids-*)
// par/si comuns a todos os escalões USKids
export const MS_USKIDS_PAR = [4,4,4,3,4,4,3,5,5,4,4,5,3,4,4,4,3,5]; // par 72
export const MS_USKIDS_SI  = [11,1,3,17,13,15,5,9,7,4,16,12,18,6,2,10,14,8];
export const MS_USKIDS_M_B12   = [274,349,302,113,266,258,152,375,382,307,247,381,103,310,292,255,151,442]; // 4959m
export const MS_USKIDS_M_B1011 = [274,299,272,103,227,231,132,338,352,267,219,356,91,270,237,225,133,404]; // 4430m

// Golf Paris Val d'Europe Disneyland — USKids Paris Invitational 2025
// Combinação RED (Rouge) + BLUE (Bleu), par 72
// Fonte tees: mscorecard.com/mscorecard/showcourse.php?cid=1236598351821 + PDF oficial torneio
export const PARIS_VDE_PAR   = [5,3,5,4,3,5,4,3,4, 4,4,4,3,5,3,4,4,5]; // par 72
export const PARIS_VDE_SI    = [7,15,3,11,17,1,5,13,9, 14,18,6,10,2,16,12,4,8];
// Boys 12 → tee Bleus (Longleaf 5), 5029m
export const PARIS_VDE_B12_M = [408,124,387,282,84,399,296,123,282, 287,242,351,155,485,118,258,326,422]; // 5029m
// Boys 11/10 → tee intermédio (Longleaf 4), 4646m — distâncias oficiais do torneio
export const PARIS_VDE_B11_M = [383,102,367,263,84,374,253,105,249, 267,224,329,134,466,101,233,306,406]; // 4646m
// Boys 15-18 / Boys 13-14 → tee Brancos+tee intermédio (Longleaf 6), 5779m
export const PARIS_VDE_B1518_M = [461,159,442,331,126,473,341,155,329, 326,283,387,168,535,146,294,373,450]; // 5779m
export const MS_USKIDS_M_B9    = [240,262,238,103,200,201,127,298,308,234,219,291,91,236,225,190,133,354]; // 3950m

// Doral Junior Golf Classic (away-doral-*)
// Doral Golden Palm — Boys 10-11 (away-golden-palm-0)
export const DORAL_GP_PAR    = [4,5,4,5,4,4,3,4,3,4,5,3,4,4,3,5,3,4]; // par 71
export const DORAL_GP_M_B1011 = [275,417,324,404,296,326,132,270,127,264,425,104,251,303,113,443,139,273]; // 4886m
export const DORAL_GP_M_B1415 = [354,475,354,493,356,353,133,361,164,302,494,137,314,367,134,487,159,356]; // 5793m
// Doral Silver Fox — Boys 12-13 (away-doral-silver-fox-b1213)
export const DORAL_SF_PAR  = [4,4,5,3,4,4,3,4,4,4,5,4,4,4,3,5,3,4]; // par 71
export const DORAL_SF_M_B1213 = [321,311,455,130,293,317,123,311,306,314,425,300,281,279,125,428,121,304]; // 5144m

export const MANUEL_POS = 26; // 26º de 35 no torneio real

export const TIER = {
  elite: { bg: "var(--bg-success-strong)", c: "var(--color-good-dark)" },
  strong: { bg: "var(--bg-current)", c: "var(--text-current)" },
  solid: { bg: "var(--bg-warn-light)", c: "var(--color-warn-dark)" },
  developing: { bg: "var(--bg-warn-strong)", c: "var(--color-warn-dark)" },
  beginner: { bg: "var(--bg-danger-subtle)", c: "var(--color-danger-dark)" },
};

export const FIELD_CARDS = [
  { name:"Dmitrii Elchaninov", pos:1, rounds:[[4,3,5,4,4,5,4,2,4,4,5,3,4,3,5,2,4,3],[5,3,5,3,4,5,3,3,4,4,4,3,4,3,5,3,4,4],[5,2,3,4,3,5,4,3,4,4,6,3,4,3,5,3,3,4]], ecl:[4,2,3,3,3,5,3,2,4,4,4,3,4,3,5,2,3,3], eclTotal:60 },
  { name:"Marcus Karim", pos:2, rounds:[[7,3,4,3,4,4,4,3,3,4,4,4,5,4,6,3,4,5],[4,3,4,2,4,4,4,3,4,9,6,3,3,4,5,3,3,5],[7,2,4,3,4,4,4,3,5,4,5,2,5,3,5,3,3,5]], ecl:[4,2,4,2,4,4,4,3,3,4,4,2,3,3,5,3,3,5], eclTotal:62 },
  { name:"Harrison Barnett", pos:3, rounds:[[5,3,4,3,4,5,3,3,4,5,6,4,4,7,4,5,3,5],[5,3,3,4,4,5,4,3,4,5,6,3,3,4,5,3,3,4],[5,3,5,4,3,5,4,3,4,4,5,3,5,3,6,3,4,3]], ecl:[5,3,3,3,3,5,3,3,4,4,5,3,3,3,4,3,3,3], eclTotal:63 },
  { name:"Julian Sepulveda", pos:4, rounds:[[5,4,4,4,3,4,4,3,4,3,5,3,6,4,5,3,5,4],[6,3,5,3,3,6,5,3,4,5,6,4,4,4,5,3,4,4],[5,2,3,5,5,6,4,4,5,4,4,4,3,4,4,5,3,3]], ecl:[5,2,3,3,3,4,4,3,4,3,4,3,3,4,4,3,3,3], eclTotal:61 },
  { name:"Mihir Pasura", pos:5, rounds:[[6,3,3,4,5,6,3,4,4,4,6,4,5,4,7,3,5,6],[5,3,4,3,4,6,4,3,6,4,5,3,5,4,4,2,4,5],[6,3,4,4,4,5,4,2,4,5,5,3,4,5,5,3,3,4]], ecl:[5,3,3,3,4,5,3,2,4,4,5,3,4,4,4,2,3,4], eclTotal:65 },
  { name:"Nicolas Pape", pos:6, rounds:[[5,3,4,2,4,5,4,6,4,6,5,3,3,5,5,3,4,4],[5,4,4,3,4,6,4,3,4,5,6,4,5,4,5,2,4,5],[7,2,4,4,3,4,4,3,4,5,5,3,5,4,8,3,5,6]], ecl:[5,2,4,2,3,4,4,3,4,5,5,3,3,4,5,2,4,4], eclTotal:66 },
  { name:"Harry-James Odell", pos:7, rounds:[[7,4,4,3,4,5,3,4,3,4,5,3,4,5,6,3,5,5],[6,4,6,3,4,5,3,3,5,6,5,2,3,3,5,3,4,4],[6,2,4,4,3,5,5,4,5,3,6,3,6,3,5,2,8,6]], ecl:[6,2,4,3,3,5,3,3,3,3,5,2,3,3,5,2,4,4], eclTotal:63 },
  { name:"Aronas Juodis", pos:8, rounds:[[6,4,4,2,3,5,4,3,4,5,6,3,4,3,5,3,4,6],[5,3,4,4,4,5,4,3,5,5,4,3,4,5,6,3,4,6],[5,3,5,5,5,6,4,3,6,3,6,4,3,4,5,4,5,5]], ecl:[5,3,4,2,3,5,4,3,4,3,4,3,3,3,5,3,4,5], eclTotal:66 },
  { name:"Hugo Luque Reina", pos:9, rounds:[[6,2,4,3,5,6,4,3,4,7,5,4,5,3,5,3,4,5],[5,4,4,3,6,5,4,4,4,4,5,3,4,5,5,3,5,4],[7,3,4,3,4,5,5,4,5,4,5,4,5,4,8,3,4,5]], ecl:[5,2,4,3,4,5,4,3,4,4,5,3,4,3,5,3,4,4], eclTotal:69 },
  { name:"Maxime Vervaet", pos:10, rounds:[[6,4,6,4,4,7,4,3,4,5,5,5,5,5,4,3,4,5],[6,4,4,3,4,5,4,2,5,7,6,4,4,3,5,2,4,5],[5,3,5,3,4,4,4,5,6,5,6,3,4,4,6,4,4,4]], ecl:[5,3,4,3,4,4,4,2,4,5,5,3,4,3,4,2,4,4], eclTotal:67 },
  { name:"Miroslavs Bogdanovs", pos:24, rounds:[[8,3,5,3,4,5,4,3,5,7,6,7,5,3,6,4,4,4],[6,3,4,4,5,5,5,5,8,6,5,2,4,7,7,4,4,4],[6,3,6,4,5,6,6,2,5,4,6,4,5,5,8,5,4,5]], ecl:[6,3,4,3,4,5,4,2,5,4,5,2,4,3,6,4,4,4], eclTotal:72 },
  { name:"Alexis Beringer", pos:33, rounds:[[8,4,6,4,6,7,5,4,3,6,6,4,6,4,6,4,5,5],[7,3,5,3,6,6,5,5,4,5,7,3,6,8,6,4,6,5],[7,4,6,4,5,8,6,5,4,6,7,4,7,6,6,6,5,7]], ecl:[7,3,5,3,5,6,5,4,3,5,6,3,6,4,6,4,5,5], eclTotal:85 },
];
