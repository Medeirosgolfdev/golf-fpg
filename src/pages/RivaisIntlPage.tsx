/**
 * RivaisIntlPage.tsx — Rivais Internacionais
 *
 * Dashboard comparativo de todos os rivais do Manuel
 * em torneios internacionais.
 */
import React, { useMemo, useState } from "react";
import { fmtToPar, fmtSign } from "../utils/format";
import { linearSlopeXY } from "../utils/mathUtils";
import { scClass, toParClass, sc3m, SC } from "../utils/scoreDisplay";
import { isCalUnlocked } from "../utils/authConstants";
import PasswordGate from "../ui/PasswordGate";


/* ═══════════════════════════════════
   TYPES
   ═══════════════════════════════════ */
interface TournResult { p: number; t: number; tp: number; rd: number[] }
interface RivalPlayer {
  n: string;
  co: string;
  isM?: boolean;
  r: Record<string, TournResult>;
  up: string[];
}
interface TournDef {
  id: string; name: string; short: string; date: string;
  rounds: number; par: number; field: number; nations: number;
  intendedRounds?: number; url: string;
}

/** Shape of a single hole sample for distance-band analysis */
interface HoleSample { ds: number; par: number; meters: number | null; gross: number }

/** Shape of a distance band definition */
interface BandDef { par: number; minM: number; maxM: number; label: string }

/** Filtered band result */
interface FilteredBand { label: string; n: number; avg: number; pob: number; dbl: number; allAvg?: number; allN?: number; col?: string }

/** Monthly stats entry */
interface MonthStat {
  key: string; label: string; avgGross: number; n: number;
  grossStdDev: number; avgSD?: number; parOrBetter: number; doubleOrWorse: number;
  bounceRate: number | null; bestRound?: number;
  birdieRate?: number; bestStreak?: number;
  first3VsPar?: number; last3VsPar?: number;
  last3Avg?: number;
}

/** Coach monthly entry */
interface CoachMonth { key: string; label: string; avgGross: number; n: number; grossStdDev: number }

/** Round average entry */
type RoundAvg = { m: number; s: number } | null;

/* ═══════════════════════════════════
   CONFIG
   ═══════════════════════════════════ */
const PLAYER_FED = "52884";
const PLAYER_NAME = "Manuel";
const COURSE_KEYWORDS = ["villa padierna", "flamingos"];
const TOURN = {
  name: "Daily Mail World Junior Golf Championship",
  dates: "24–27 Fev 2026",
  days: 3,
  location: "Villa Padierna — Flamingos Golf Club",
  city: "Málaga, Espanha",
};

const FIELD_2025 = {
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
const VP_PAR = [5,3,4,3,4,5,4,3,4,4,5,3,4,4,5,3,4,4]; // par 71
const FIELD_CARDS = [
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
const MANUEL_POS = 26; // 26º de 35 no torneio real
const FIELD_TOTAL = 35; // total de jogadores no torneio

const FL={"Portugal":"🇵🇹","Spain":"🇪🇸","England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Russian Federation":"🇷🇺","Bulgaria":"🇧🇬","Switzerland":"🇨🇭","Italy":"🇮🇹","France":"🇫🇷","Ireland":"🇮🇪","Northern Ireland":"🇬🇧","Germany":"🇩🇪","Netherlands":"🇳🇱","Norway":"🇳🇴","Lithuania":"🇱🇹","Thailand":"🇹🇭","United States":"🇺🇸","United Kingdom":"🇬🇧","Sweden":"🇸🇪","Morocco":"🇲🇦","Wales":"🏴󠁧󠁢󠁷󠁬󠁳󠁿","Belgium":"🇧🇪","Slovenia":"🇸🇮","Ukraine":"🇺🇦","Romania":"🇷🇴","China":"🇨🇳","Philippines":"🇵🇭","Slovakia":"🇸🇰","United Arab Emirates":"🇦🇪","Turkey":"🇹🇷","India":"🇮🇳","Viet Nam":"🇻🇳","Kazakhstan":"🇰🇿","Hungary":"🇭🇺","South Africa":"🇿🇦","Singapore":"🇸🇬","Denmark":"🇩🇰","Mexico":"🇲🇽","Canada":"🇨🇦","Austria":"🇦🇹","Paraguay":"🇵🇾","Brazil":"🇧🇷","Jersey":"🇯🇪","Nigeria":"🇳🇬","Oman":"🇴🇲","Chile":"🇨🇱","Colombia":"🇨🇴","Puerto Rico":"🇵🇷","Costa Rica":"🇨🇷","Great Britain":"🇬🇧","Latvia":"🇱🇻","South Korea":"🇰🇷"};

const T: TournDef[]=[
  {id:"brjgt25",name:"WJGC 2025",short:"WJGC",date:"Fev 2025",rounds:3,par:71,field:40,nations:17,url:"https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/34/leaderboard.htm"},
  {id:"eowagr25",name:"European Open",short:"EU Open",date:"Ago 2025",rounds:3,par:72,field:8,nations:3,url:"https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/21/leaderboard.htm"},
  {id:"venice25",name:"Venice Open 2025",short:"Venice",date:"Ago 2025",rounds:3,par:72,field:39,nations:12,url:"https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/515206/venice-open-2025/results"},
  {id:"rome25",name:"Rome Classic 2025",short:"Rome",date:"Out 2025",rounds:2,par:72,field:14,nations:3,url:"https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516026/rome-classic-2025/results"},
  {id:"doral25",name:"Doral Junior 2025",short:"Doral",date:"Dez 2025",rounds:2,par:71,field:35,nations:9,url:"https://www.golfgenius.com/v2tournaments/4222407?called_from=widgets%2Fcustomized_tournament_results&hide_totals=false&player_stats_for_portal=true"},
  {id:"qdl25",name:"QDL Junior Open 2025",short:"QDL",date:"Nov 2025",rounds:1,par:72,field:12,nations:7,intendedRounds:3,url:"https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=962&tcode=10080&classif_order=2"},
  {id:"gg26",name:"Greatgolf Junior Open",short:"GG",date:"Fev 2026",rounds:2,par:72,field:12,nations:4,url:"https://scoring-pt.datagolf.pt/scripts/classif.asp?tourn=10296&club=935&ack=OT342GH16T"},
  {id:"wjgc26",name:"WJGC 2026",short:"WJGC26",date:"Fev 2026",rounds:2,intendedRounds:3,par:72,field:36,nations:19,url:"https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/73/leaderboard.htm"},
  {id:"wjgc26_1213",name:"WJGC 2026 12-13",short:"WJGC↑",date:"Fev 2026",rounds:2,intendedRounds:3,par:73,field:36,nations:19,url:"https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/33/leaderboard.htm"},
];

// Tournament prestige weight: rounds (40%) + field size (35%) + internationality (25%)
// Uses intendedRounds when available (e.g. QDL reduced by weather)
const T_WEIGHTS: Record<string, number> = (() => {
  const maxR = Math.max(...T.map(t => t.intendedRounds || t.rounds));
  const maxF = Math.max(...T.map(t => t.field));
  const maxN = Math.max(...T.map(t => t.nations));
  const w: Record<string, number> = {};
  for (const t of T) {
    const rNorm = (t.intendedRounds || t.rounds) / maxR;
    const fNorm = t.field / maxF;
    const nNorm = t.nations / maxN;
    w[t.id] = 0.40 * rNorm + 0.35 * fNorm + 0.25 * nNorm;
  }
  return w;
})();

const UP=[{id:"marco26",name:"Marco Simone Inv.",short:"M.SIMONE",url:"https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516989/marco-simone-invitational-2026/field"}];


const D: RivalPlayer[]=[
  {n:"Manuel Medeiros",co:"Portugal",isM:true,r:{brjgt25:{p:26,t:265,tp:52,rd:[90,85,90]},eowagr25:{p:7,t:238,tp:22,rd:[85,77,76]},venice25:{p:28,t:237,tp:21,rd:[78,76,83]},rome25:{p:10,t:166,tp:22,rd:[89,77]},doral25:{p:29,t:177,tp:35,rd:[98,79]},qdl25:{p:11,t:90,tp:18,rd:[90]},gg26:{p:4,t:169,tp:25,rd:[87,82]},wjgc26:{p:5,t:153,tp:9,rd:[75,78]}},up:["marco26"]},
  {n:"Dmitrii Elchaninov",co:"Russian Federation",r:{brjgt25:{p:1,t:205,tp:-8,rd:[69,68,68]},eowagr25:{p:2,t:218,tp:2,rd:[77,70,71]},venice25:{p:1,t:198,tp:-18,rd:[62,68,68]},qdl25:{p:1,t:71,tp:-1,rd:[71]},wjgc26:{p:1,t:141,tp:-3,rd:[72,69]}},up:[]},
  {n:"Diego Gross Paneque",co:"Spain",r:{brjgt25:{p:16,t:249,tp:36,rd:[80,84,85]},wjgc26:{p:10,t:156,tp:12,rd:[81,75]}},up:[]},
  {n:"Álex Carrón",co:"Spain",r:{brjgt25:{p:13,t:246,tp:33,rd:[82,84,80]},wjgc26:{p:16,t:165,tp:21,rd:[83,82]}},up:[]},
  {n:"Henry Liechti",co:"Switzerland",r:{brjgt25:{p:17,t:250,tp:37,rd:[87,84,79]},wjgc26:{p:28,t:176,tp:32,rd:[89,87]}},up:[]},
  {n:"Niko Alvarez Van Der Walt",co:"Spain",r:{brjgt25:{p:22,t:261,tp:48,rd:[89,83,89]},wjgc26:{p:18,t:168,tp:24,rd:[82,86]}},up:[]},
  {n:"Miroslavs Bogdanovs",co:"Spain",r:{brjgt25:{p:24,t:263,tp:50,rd:[86,88,89]},venice25:{p:18,t:227,tp:11,rd:[76,74,77]},wjgc26:{p:25,t:174,tp:30,rd:[88,86]}},up:[]},
  {n:"Christian Chepishev",co:"Bulgaria",r:{brjgt25:{p:29,t:270,tp:57,rd:[87,86,97]},wjgc26:{p:8,t:155,tp:11,rd:[79,76]}},up:["marco26"]},
  {n:"James Doyle",co:"Ireland",r:{brjgt25:{p:32,t:277,tp:64,rd:[93,92,92]},wjgc26:{p:31,t:185,tp:41,rd:[98,87]}},up:[]},
  {n:"Alexis Beringer",co:"Switzerland",r:{brjgt25:{p:33,t:290,tp:77,rd:[93,94,103]},wjgc26:{p:13,t:163,tp:19,rd:[81,82]}},up:[]},
  {n:"Kevin Canton",co:"Italy",r:{brjgt25:{p:34,t:291,tp:78,rd:[98,96,97]},wjgc26:{p:34,t:188,tp:44,rd:[100,88]}},up:[]},
  {n:"Leon Schneitter",co:"Switzerland",r:{brjgt25:{p:"WD",t:null,tp:null,rd:[]},wjgc26:{p:11,t:160,tp:16,rd:[80,80]}},up:[]},
  {n:"Victor Canot Januel",co:"France",r:{brjgt25:{p:30,t:274,tp:61,rd:[88,88,98]},venice25:{p:24,t:233,tp:17,rd:[76,82,75]}},up:[]},
  {n:"Theodore Dausse",co:"France",r:{brjgt25:{p:31,t:275,tp:62,rd:[96,90,89]},venice25:{p:30,t:244,tp:28,rd:[83,80,81]}},up:[]},
  {n:"Aronas Juodis",co:"Lithuania",r:{brjgt25:{p:8,t:232,tp:19,rd:[74,77,81]},eowagr25:{p:1,t:213,tp:-3,rd:[72,71,70]},qdl25:{p:4,t:75,tp:3,rd:[75]},wjgc26_1213:{p:22,t:163,tp:17,rd:[87,76]}},up:[]},
  {n:"Marcus Karim",co:"England",r:{brjgt25:{p:2,t:218,tp:5,rd:[74,73,71]},qdl25:{p:3,t:72,tp:0,rd:[72]},wjgc26_1213:{p:8,t:150,tp:4,rd:[78,72]}},up:[]},
  {n:"Harrison Barnett",co:"England",r:{brjgt25:{p:3,t:220,tp:7,rd:[77,71,72]},qdl25:{p:6,t:78,tp:6,rd:[78]},wjgc26_1213:{p:19,t:160,tp:14,rd:[83,77]}},up:[]},
  {n:"Julian Sepulveda",co:"United States",r:{brjgt25:{p:4,t:223,tp:10,rd:[73,77,73]},doral25:{p:17,t:162,tp:20,rd:[81,81]}},up:[]},
  {n:"Mihir Pasura",co:"United Kingdom",r:{brjgt25:{p:5,t:229,tp:16,rd:[82,74,73]}},up:[]},
  {n:"Yorick De Hek",co:"Netherlands",r:{brjgt25:{p:28,t:270,tp:57,rd:[92,87,91]},eowagr25:{p:5,t:234,tp:18,rd:[79,76,79]}},up:[]},
  {n:"Nial Diwan",co:"England",r:{brjgt25:{p:25,t:264,tp:51,rd:[93,87,84]},eowagr25:{p:6,t:238,tp:22,rd:[81,84,73]}},up:[]},
  {n:"Maximilien Demole",co:"Switzerland",r:{venice25:{p:3,t:207,tp:-9,rd:[69,70,68]},doral25:{p:5,t:155,tp:13,rd:[80,75]}},up:[]},
  {n:"Emile Cuanalo",co:"England",r:{eowagr25:{p:3,t:224,tp:8,rd:[70,76,78]},venice25:{p:5,t:211,tp:-5,rd:[67,71,73]},rome25:{p:2,t:139,tp:-5,rd:[70,69]},qdl25:{p:5,t:75,tp:3,rd:[75]},wjgc26_1213:{p:5,t:146,tp:0,rd:[74,72]}},up:[]},
  {n:"Paul Berger",co:"Germany",r:{venice25:{p:5,t:211,tp:-5,rd:[70,70,71]},doral25:{p:10,t:158,tp:16,rd:[82,76]}},up:[]},
  {n:"Matteo Durando",co:"Italy",r:{venice25:{p:11,t:215,tp:-1,rd:[70,76,69]},doral25:{p:9,t:156,tp:14,rd:[79,77]}},up:["marco26"]},
  {n:"Luis Maier",co:"Germany",r:{venice25:{p:9,t:213,tp:-3,rd:[69,70,74]},doral25:{p:26,t:175,tp:33,rd:[88,87]}},up:[]},
  {n:"Emilio Berti",co:"Italy",r:{venice25:{p:10,t:214,tp:-2,rd:[73,68,73]},rome25:{p:1,t:136,tp:-8,rd:[70,66]}},up:[]},
  {n:"Noah Birk Andersen",co:"Denmark",r:{venice25:{p:22,t:230,tp:14,rd:[79,74,77]}},up:["marco26"]},
  {n:"Alexander Pianigiani",co:"Italy",r:{rome25:{p:7,t:157,tp:13,rd:[83,74]}},up:["marco26"]},
  {n:"Edoardo Lemonnier",co:"Italy",r:{rome25:{p:3,t:143,tp:-1,rd:[69,74]}},up:["marco26"]},
  {n:"Haqvin Sylven",co:"Switzerland",r:{rome25:{p:8,t:160,tp:16,rd:[82,78]}},up:["marco26"]},
  {n:"Kimi Pulga",co:"Italy",r:{venice25:{p:26,t:234,tp:18,rd:[78,81,75]}},up:["marco26"]},
  {n:"Hugo Strasser",co:"Switzerland",r:{wjgc26:{p:8,t:155,tp:11,rd:[82,73]}},up:["marco26"]},
  {n:"Skyy Wilding",co:"Thailand",r:{brjgt25:{p:"WD",t:null,tp:null,rd:[]},venice25:{p:2,t:203,tp:-13,rd:[65,65,73]},wjgc26_1213:{p:5,t:146,tp:0,rd:[73,73]}},up:[]},
  {n:"Felipe Seferian",co:"Spain",r:{venice25:{p:4,t:209,tp:-7,rd:[67,70,72]}},up:[]},
  {n:"Nicolas Pape",co:"Thailand",r:{brjgt25:{p:6,t:231,tp:18,rd:[75,77,79]}},up:[]},
  {n:"Harry-James Odell",co:"England",r:{brjgt25:{p:7,t:231,tp:18,rd:[77,74,80]}},up:[]},
  {n:"Maxime Vervaet",co:"Spain",r:{brjgt25:{p:10,t:239,tp:26,rd:[83,77,79]},wjgc26_1213:{p:10,t:154,tp:8,rd:[78,76]}},up:[]},
  {n:"Henry Atkinson",co:"England",r:{brjgt25:{p:11,t:239,tp:26,rd:[77,79,83]}},up:[]},
  {n:"Kirill Sedov",co:"Russian Federation",r:{brjgt25:{p:15,t:247,tp:34,rd:[84,82,81]},wjgc26_1213:{p:13,t:156,tp:10,rd:[77,79]}},up:[]},
  {n:"Edward Fearnley",co:"England",r:{brjgt25:{p:14,t:246,tp:33,rd:[78,85,83]}},up:[]},
  {n:"Mauricio Mijares",co:"Mexico",r:{doral25:{p:1,t:148,tp:6,rd:[74,74]}},up:[]},
  {n:"Jean Imperiali De Francavilla",co:"France",r:{brjgt25:{p:"WD",t:null,tp:null,rd:[]},venice25:{p:23,t:231,tp:15,rd:[77,75,79]},rome25:{p:5,t:152,tp:8,rd:[77,75]}},up:[]},
  {n:"Sebastiano Giacobbi",co:"Italy",r:{venice25:{p:37,t:267,tp:51,rd:[95,87,85]},rome25:{p:13,t:173,tp:29,rd:[87,86]}},up:["marco26"]},
  {n:"Leo Egozi",co:"United States",r:{venice25:{p:36,t:252,tp:36,rd:[83,84,85]},rome25:{p:11,t:167,tp:23,rd:[82,85]}},up:[]},
  {n:"Joe Short",co:"Portugal",r:{gg26:{p:2,t:166,tp:22,rd:[79,87]},wjgc26:{p:23,t:173,tp:29,rd:[90,83]}},up:[]},
  {n:"Madalena Miguel Araújo",co:"Portugal",r:{},up:[]},
  {n:"Elijah Gibbons",co:"England",r:{wjgc26:{p:21,t:170,tp:26,rd:[87,83]}},up:[]},
  {n:"Harley Botham",co:"Northern Ireland",r:{gg26:{p:11,t:191,tp:47,rd:[98,93]}},up:[]},
  {n:"Benji Botham",co:"Northern Ireland",r:{gg26:{p:5,t:175,tp:31,rd:[88,87]},wjgc26:{p:13,t:163,tp:19,rd:[83,80]}},up:[]},
  {n:"Roman Hicks",co:"England",r:{},up:[]},
  {n:"Hanlin Wang",co:"England",r:{},up:[]},
  {n:"Mario Valiente Novella",co:"Spain",r:{},up:[]},
  {n:"Aineon Hiram Jabonero",co:"Philippines",r:{wjgc26:{p:19,t:169,tp:25,rd:[82,87]}},up:[]},
  {n:"David Dung Nguyen",co:"Viet Nam",r:{},up:[]},
  {n:"Maddox Tiemann",co:"Sweden",r:{wjgc26:{p:28,t:176,tp:32,rd:[87,89]}},up:[]},
  {n:"William Harran",co:"Switzerland",r:{wjgc26:{p:2,t:146,tp:2,rd:[75,71]}},up:[]},
  {n:"Louis Harran",co:"Switzerland",r:{},up:[]},
  {n:"Pietro Salvati",co:"Italy",r:{},up:[]},
  {n:"Erik Martel",co:"Spain",r:{brjgt25:{p:18,t:250,tp:37,rd:[83,79,88]}},up:[]},
  // BRJGT 2025 missing
  {n:"Hugo Luque Reina",co:"Spain",r:{brjgt25:{p:9,t:237,tp:24,rd:[78,77,82]},wjgc26_1213:{p:21,t:162,tp:16,rd:[81,81]}},up:[]},
  {n:"Daniel Avila Sanz",co:"Spain",r:{brjgt25:{p:12,t:240,tp:27,rd:[80,77,83]},wjgc26_1213:{p:24,t:164,tp:18,rd:[87,77]}},up:[]},
  {n:"Nicolas De La Torre Montoto",co:"Spain",r:{brjgt25:{p:19,t:252,tp:39,rd:[84,83,85]}},up:[]},
  {n:"Antonio Toledano Ibáñez-Aldecoa",co:"Spain",r:{brjgt25:{p:20,t:258,tp:45,rd:[82,91,85]}},up:[]},
  {n:"Johnny Marriott",co:"United Kingdom",r:{brjgt25:{p:21,t:260,tp:47,rd:[84,86,90]}},up:[]},
  {n:"Edward (Bear) Millar",co:"Jersey",r:{brjgt25:{p:23,t:263,tp:50,rd:[85,93,85]}},up:[]},
  {n:"Harvey Eastwood",co:"England",r:{brjgt25:{p:27,t:268,tp:55,rd:[86,85,97]}},up:[]},
  {n:"Jamie Murray",co:"Sweden",r:{brjgt25:{p:35,t:299,tp:86,rd:[109,99,91]}},up:[]},
  {n:"Borja Enriquez Sainz de la Flor",co:"Spain",r:{brjgt25:{p:"WD",t:null,tp:null,rd:[]}},up:[]},
  {n:"Lewis Ikeji Dandyson",co:"Nigeria",r:{brjgt25:{p:"WD",t:null,tp:null,rd:[]}},up:[]},
  {n:"Diego Mastrogiuseppe",co:"Italy",r:{rome25:{p:4,t:147,tp:3,rd:[74,73]}},up:[]},
  {n:"Andrea Capotosti",co:"Italy",r:{rome25:{p:6,t:154,tp:10,rd:[80,74]}},up:[]},
  {n:"Rocco Di Ciacca",co:"Great Britain",r:{rome25:{p:8,t:160,tp:16,rd:[83,77]}},up:[]},
  {n:"Leonardo Lopez",co:"Italy",r:{rome25:{p:12,t:171,tp:27,rd:[88,83]}},up:[]},
  // EO WAGR missing
  {n:"Maxwell Ip",co:"Netherlands",r:{eowagr25:{p:4,t:227,tp:11,rd:[73,79,75]}},up:[]},
  {n:"Muduo Wang",co:"China",r:{eowagr25:{p:8,t:262,tp:46,rd:[86,93,83]}},up:[]},
  // Venice Open missing
  {n:"Octavio Bailly",co:"France",r:{venice25:{p:5,t:211,tp:-5,rd:[68,75,68]}},up:[]},
  {n:"Arthur Lawson",co:"Brazil",r:{venice25:{p:5,t:211,tp:-5,rd:[73,69,69]}},up:[]},
  {n:"Federico Scorzoni",co:"Italy",r:{venice25:{p:12,t:216,tp:0,rd:[71,73,72]}},up:[]},
  {n:"Alfie Skinner",co:"Great Britain",r:{venice25:{p:13,t:217,tp:1,rd:[72,74,71]},wjgc26_1213:{p:25,t:165,tp:19,rd:[81,84]}},up:[]},
  {n:"Ben Pommer",co:"Germany",r:{venice25:{p:14,t:222,tp:6,rd:[75,71,76]}},up:[]},
  {n:"Wille Reis",co:"Sweden",r:{venice25:{p:14,t:222,tp:6,rd:[74,75,73]}},up:[]},
  {n:"Yusuf Al Rumhy",co:"Oman",r:{venice25:{p:16,t:226,tp:10,rd:[77,73,76]}},up:[]},
  {n:"Constantin Fritz",co:"Germany",r:{venice25:{p:16,t:226,tp:10,rd:[76,77,73]}},up:[]},
  {n:"Francesco Pacella",co:"Italy",r:{venice25:{p:18,t:227,tp:11,rd:[79,73,75]}},up:[]},
  {n:"Paul Perez",co:"France",r:{venice25:{p:18,t:227,tp:11,rd:[71,74,82]}},up:[]},
  {n:"Amiel Meisler",co:"France",r:{venice25:{p:21,t:229,tp:13,rd:[76,78,75]}},up:[]},
  {n:"Raphael Gozzo",co:"Italy",r:{venice25:{p:24,t:233,tp:17,rd:[79,79,75]}},up:[]},
  {n:"Felipe Tavares De Araujo",co:"Italy",r:{venice25:{p:27,t:235,tp:19,rd:[76,79,80]}},up:[]},
  {n:"Francesco Bellentani",co:"Italy",r:{venice25:{p:28,t:237,tp:21,rd:[79,79,79]}},up:[]},
  {n:"Roland Wochna",co:"Hungary",r:{venice25:{p:31,t:245,tp:29,rd:[83,76,86]}},up:[]},
  {n:"Noah Lobelius",co:"Sweden",r:{venice25:{p:32,t:246,tp:30,rd:[81,84,81]}},up:[]},
  {n:"Sami Vater",co:"Germany",r:{venice25:{p:32,t:246,tp:30,rd:[84,81,81]}},up:[]},
  {n:"Nikita Perini",co:"Italy",r:{venice25:{p:34,t:247,tp:31,rd:[82,83,82]}},up:[]},
  {n:"Welles Leano",co:"United States",r:{venice25:{p:35,t:251,tp:35,rd:[83,81,87]}},up:[]},
  {n:"Lapo Bavutti",co:"Italy",r:{venice25:{p:37,t:267,tp:51,rd:[85,87,95]},rome25:{p:14,t:174,tp:30,rd:[87,87]}},up:[]},
  {n:"Paul Renard",co:"France",r:{venice25:{p:39,t:292,tp:76,rd:[97,96,99]}},up:[]},
  // Doral Junior missing
  {n:"Victor Monssoh",co:"United States",r:{doral25:{p:2,t:152,tp:10,rd:[79,73]}},up:[]},
  {n:"Stephen Sanders",co:"United States",r:{doral25:{p:3,t:154,tp:12,rd:[76,78]}},up:[]},
  {n:"Ignacio Beaujon",co:"United States",r:{doral25:{p:4,t:154,tp:12,rd:[79,75]}},up:[]},
  {n:"Ethan Li",co:"United States",r:{doral25:{p:6,t:155,tp:13,rd:[78,77]}},up:[]},
  {n:"Alexander Heuberger",co:"United States",r:{doral25:{p:7,t:155,tp:13,rd:[79,76]}},up:[]},
  {n:"Pedro Araya",co:"Chile",r:{doral25:{p:8,t:155,tp:13,rd:[77,78]}},up:[]},
  {n:"Rivers Hood",co:"United States",r:{doral25:{p:11,t:158,tp:16,rd:[78,80]}},up:[]},
  {n:"Charlie Magee",co:"United States",r:{doral25:{p:12,t:159,tp:17,rd:[83,76]}},up:[]},
  {n:"Maxence Le Theo",co:"France",r:{doral25:{p:13,t:160,tp:18,rd:[83,77]}},up:[]},
  {n:"Matthew Schreibman",co:"United States",r:{doral25:{p:14,t:160,tp:18,rd:[79,81]}},up:[]},
  {n:"Bodie Patton",co:"United States",r:{doral25:{p:15,t:161,tp:19,rd:[80,81]}},up:[]},
  {n:"Paolo Yerena",co:"Mexico",r:{doral25:{p:16,t:162,tp:20,rd:[80,82]}},up:[]},
  {n:"Alfred Carmenate",co:"United States",r:{doral25:{p:18,t:166,tp:24,rd:[87,79]}},up:[]},
  {n:"Alejandro Gonzalez",co:"Mexico",r:{doral25:{p:19,t:167,tp:25,rd:[89,78]}},up:[]},
  {n:"Teddy Sullivan",co:"United States",r:{doral25:{p:20,t:167,tp:25,rd:[87,80]}},up:[]},
  {n:"Isak Lindstrom",co:"Costa Rica",r:{doral25:{p:21,t:167,tp:25,rd:[86,81]}},up:[]},
  {n:"John Sanabria",co:"United States",r:{doral25:{p:22,t:171,tp:29,rd:[88,83]}},up:[]},
  {n:"Aston Cruz",co:"United States",r:{doral25:{p:23,t:171,tp:29,rd:[82,89]}},up:[]},
  {n:"Nathan Khera",co:"Canada",r:{doral25:{p:24,t:172,tp:30,rd:[88,84]}},up:[]},
  {n:"William Murphy",co:"United States",r:{doral25:{p:25,t:174,tp:32,rd:[90,84]}},up:[]},
  {n:"Daniel Candon",co:"United States",r:{doral25:{p:27,t:176,tp:34,rd:[90,86]}},up:[]},
  {n:"Theo Dudley",co:"United States",r:{doral25:{p:28,t:176,tp:34,rd:[86,90]}},up:[]},
  {n:"Matteo Mair",co:"Austria",r:{doral25:{p:30,t:178,tp:36,rd:[88,90]}},up:[]},
  {n:"Pedro Restrepo",co:"Colombia",r:{doral25:{p:31,t:180,tp:38,rd:[89,91]}},up:[]},
  {n:"Thiago Marco Rodriguez",co:"Puerto Rico",r:{doral25:{p:32,t:181,tp:39,rd:[89,92]}},up:[]},
  {n:"Mateo Conde",co:"United States",r:{doral25:{p:33,t:187,tp:45,rd:[100,87]}},up:[]},
  {n:"William Saldana",co:"United States",r:{doral25:{p:34,t:217,tp:75,rd:[110,107]}},up:[]},
  {n:"Nikola Kitic",co:"United States",r:{doral25:{p:35,t:306,tp:164,rd:[144,162]}},up:[]},
  {n:"Oliver Smith",co:"United Kingdom",r:{qdl25:{p:2,t:72,tp:0,rd:[72]}},up:[]},
  // WJGC 2026 — jogadores em falta
  {n:"Weilian Sun",co:"China",r:{wjgc26:{p:3,t:148,tp:4,rd:[75,73]}},up:[]},
  {n:"Henry Bucys",co:"England",r:{wjgc26:{p:4,t:152,tp:8,rd:[76,76]}},up:[]},
  {n:"Sean Wilding",co:"Thailand",r:{wjgc26:{p:5,t:153,tp:9,rd:[79,74]}},up:[]},
  {n:"Philippe Xiao",co:"France",r:{wjgc26:{p:5,t:153,tp:9,rd:[80,73]}},up:[]},
  {n:"Dylan Dedaj Ungureanu",co:"Spain",r:{wjgc26:{p:12,t:161,tp:17,rd:[80,81]}},up:[]},
  {n:"Oscar Bunt",co:"England",r:{wjgc26:{p:13,t:163,tp:19,rd:[83,80]}},up:[]},
  {n:"Myles Jones",co:"Wales",r:{wjgc26:{p:17,t:166,tp:22,rd:[78,88]}},up:[]},
  {n:"Lukas Doherty",co:"Norway",r:{wjgc26:{p:19,t:169,tp:25,rd:[84,85]}},up:[]},
  {n:"Hermes Stuart Cañizares Plaja",co:"Spain",r:{wjgc26:{p:22,t:171,tp:27,rd:[88,83]}},up:[]},
  {n:"Buster Airey",co:"England",r:{wjgc26:{p:23,t:173,tp:29,rd:[88,85]}},up:[]},
  {n:"Elias Didjurgis",co:"Germany",r:{wjgc26:{p:26,t:175,tp:31,rd:[86,89]}},up:[]},
  {n:"Kai Russell",co:"England",r:{wjgc26:{p:26,t:175,tp:31,rd:[92,83]}},up:[]},
  {n:"Aron Klinkenberg",co:"Netherlands",r:{wjgc26:{p:30,t:179,tp:35,rd:[88,91]}},up:[]},
  {n:"Zeyn Lababedi",co:"England",r:{wjgc26:{p:31,t:185,tp:41,rd:[91,94]}},up:[]},
  {n:"Rodrigo Palacios Bauer",co:"Spain",r:{wjgc26:{p:31,t:185,tp:41,rd:[92,93]}},up:[]},
  {n:"Arthur Lamblin",co:"France",r:{wjgc26:{p:35,t:190,tp:46,rd:[92,98]}},up:[]},
  {n:"Joseph Robinson",co:"England",r:{wjgc26:{p:36,t:192,tp:48,rd:[99,93]}},up:[]},
  // WJGC 2026 12-13 — jogadores novos
  {n:"Marcus Latt",co:"Estonia",r:{wjgc26_1213:{p:1,t:142,tp:-4,rd:[71,71]}},up:[]},
  {n:"Freddie Buck",co:"England",r:{wjgc26_1213:{p:2,t:143,tp:-3,rd:[72,71]}},up:[]},
  {n:"Harry Wang",co:"England",r:{wjgc26_1213:{p:3,t:144,tp:-2,rd:[73,71]}},up:[]},
  {n:"Leo Taylor",co:"England",r:{wjgc26_1213:{p:3,t:144,tp:-2,rd:[72,72]}},up:[]},
  {n:"Matyáš Jirásek",co:"Czech Republic",r:{wjgc26_1213:{p:7,t:149,tp:3,rd:[76,73]}},up:[]},
  {n:"Jake Notton",co:"England",r:{wjgc26_1213:{p:9,t:152,tp:6,rd:[80,72]}},up:[]},
  {n:"Harrison Jones",co:"Wales",r:{wjgc26_1213:{p:10,t:154,tp:8,rd:[80,74]}},up:[]},
  {n:"Kostadin Kaloyanov",co:"Bulgaria",r:{wjgc26_1213:{p:12,t:155,tp:9,rd:[80,75]}},up:[]},
  {n:"Seb Toft",co:"England",r:{wjgc26_1213:{p:13,t:156,tp:10,rd:[78,78]}},up:[]},
  {n:"Memphis Greenwood",co:"England",r:{wjgc26_1213:{p:15,t:157,tp:11,rd:[79,78]}},up:[]},
  {n:"Luc Taylor",co:"England",r:{wjgc26_1213:{p:16,t:158,tp:12,rd:[80,78]}},up:[]},
  {n:"Harry Mody",co:"Scotland",r:{wjgc26_1213:{p:16,t:158,tp:12,rd:[78,80]}},up:[]},
  {n:"Jack Hollingsworth",co:"England",r:{wjgc26_1213:{p:18,t:159,tp:13,rd:[82,77]}},up:[]},
  {n:"Karol Gil",co:"Poland",r:{wjgc26_1213:{p:19,t:160,tp:14,rd:[75,85]}},up:[]},
  {n:"Kris Kuusk",co:"Estonia",r:{wjgc26_1213:{p:22,t:163,tp:17,rd:[83,80]}},up:[]},
  {n:"David Filip",co:"Czech Republic",r:{wjgc26_1213:{p:26,t:169,tp:23,rd:[86,83]}},up:[]},
  {n:"Beau Wheeler",co:"England",r:{wjgc26_1213:{p:26,t:169,tp:23,rd:[83,86]}},up:[]},
  {n:"Jack Austin",co:"England",r:{wjgc26_1213:{p:26,t:169,tp:23,rd:[81,88]}},up:[]},
  {n:"George Wilson",co:"England",r:{wjgc26_1213:{p:29,t:173,tp:27,rd:[92,81]}},up:[]},
  {n:"Rafael Devic Frugier",co:"France",r:{wjgc26_1213:{p:29,t:173,tp:27,rd:[84,89]}},up:[]},
  {n:"Dylan Williams",co:"Wales",r:{wjgc26_1213:{p:32,t:181,tp:35,rd:[94,87]}},up:[]},
  {n:"Alejandro Gomez Morillo",co:"Colombia",r:{wjgc26_1213:{p:32,t:181,tp:35,rd:[91,90]}},up:[]},
  {n:"Fredrik Sonsteby",co:"Norway",r:{wjgc26_1213:{p:34,t:192,tp:46,rd:[93,99]}},up:[]},
  {n:"William Ottesen Wang",co:"Norway",r:{wjgc26_1213:{p:35,t:194,tp:48,rd:[97,97]}},up:[]},
  {n:"César Goossens",co:"Switzerland",r:{wjgc26_1213:{p:36,t:214,tp:68,rd:[103,111]}},up:[]},
  {n:"Afonso de Sousa Pinto",co:"Portugal",r:{qdl25:{p:7,t:78,tp:6,rd:[78]}},up:[]},
  {n:"Marcos Ledesma",co:"Spain",r:{qdl25:{p:8,t:78,tp:6,rd:[78]}},up:[]},
  {n:"Francisco Carvalho",co:"Portugal",r:{qdl25:{p:9,t:80,tp:8,rd:[80]},wjgc26_1213:{p:29,t:173,tp:27,rd:[91,82]}},up:[]},
  {n:"Sabrina Ribeiro Crisóstomo",co:"Portugal",r:{qdl25:{p:10,t:88,tp:16,rd:[88]}},up:[]},
  {n:"George Campbell",co:"Ireland",r:{qdl25:{p:12,t:99,tp:27,rd:[99]},gg26:{p:8,t:186,tp:42,rd:[94,92]}},up:[]},
  {n:"Ricardo Castro Ferreira",co:"Portugal",r:{gg26:{p:1,t:154,tp:10,rd:[77,77]}},up:[]},
  {n:"Guo Ziyang",co:"China",r:{gg26:{p:3,t:167,tp:23,rd:[85,82]}},up:[]},
  {n:"Marek Pejas",co:"Portugal",r:{gg26:{p:9,t:189,tp:45,rd:[92,97]}},up:[]},
  {n:"Miguel Santos Pereira",co:"Portugal",r:{gg26:{p:6,t:181,tp:37,rd:[93,88]}},up:[]},
  {n:"Harry Seabrook",co:"Portugal",r:{gg26:{p:7,t:185,tp:41,rd:[98,87]}},up:[]},
  {n:"Gabriel Costa",co:"Portugal",r:{gg26:{p:10,t:190,tp:46,rd:[99,91]}},up:[]},
  {n:"Yeonjin Seo",co:"South Korea",r:{gg26:{p:12,t:203,tp:59,rd:[107,96]}},up:[]},
  {n:"Luke Arnao",co:"United States",r:{},up:["marco26"]},
  {n:"Zachary Blayney",co:"Great Britain",r:{},up:["marco26"]},
  {n:"Malthe Bryld Nissen",co:"Denmark",r:{},up:["marco26"]},
  {n:"William Clarke",co:"Great Britain",r:{},up:["marco26"]},
  {n:"Umberto Risso",co:"Italy",r:{},up:["marco26"]},
  {n:"Thiago Selva",co:"Paraguay",r:{},up:["marco26"]},
  {n:"Lorenzo Maria Triolo",co:"Italy",r:{},up:["marco26"]},
  {n:"Alessandro Zhang",co:"Great Britain",r:{},up:["marco26"]},
];

const manuel = D.find(x => x.isM);



// Compute field averages per round and per total
const AVG_R = {};
const AVG_T = {};
for (const t of T) {
  AVG_R[t.id] = [];
  for (let i = 0; i < t.rounds; i++) {
    const vals = D.filter(p => p.r[t.id] && p.r[t.id].rd && p.r[t.id].rd[i] != null).map(p => p.r[t.id].rd[i]);
    if (vals.length > 1) {
      const m = vals.reduce((a, b) => a + b, 0) / vals.length;
      const s = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
      AVG_R[t.id][i] = { m, s };
    }
  }
  const vals = D.filter(p => p.r[t.id] && p.r[t.id].t != null).map(p => p.r[t.id].t);
  if (vals.length > 1) {
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    const s = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
    AVG_T[t.id] = { m, s };
  }
}

function zTier(score, stats) {
  if (score == null || !stats || stats.s === 0) return null;
  const z = (score - stats.m) / (stats.s || 1);
  if (z <= -1.2) return "elite";
  if (z <= -0.4) return "strong";
  if (z <= 0.4) return "solid";
  if (z <= 1.2) return "developing";
  return "beginner";
}

const TIER = {
  elite: { bg: "var(--bg-success-strong)", c: "var(--color-good-dark)" },
  strong: { bg: "var(--bg-current)", c: "var(--text-current)" },
  solid: { bg: "var(--bg-warn-light)", c: "var(--color-warn-dark)" },
  developing: { bg: "var(--bg-warn-strong)", c: "var(--color-warn-dark)" },
  beginner: { bg: "var(--bg-danger-subtle)", c: "var(--color-danger-dark)" },
};
const TIER_L = { elite: "Elite", strong: "Forte", solid: "Sólido", developing: "Em Desenv.", beginner: "Iniciante" };

function getTrend(p) {
  const order = ["brjgt25", "eowagr25", "venice25", "rome25", "doral25", "qdl25", "gg26", "wjgc26"];
  const pts: { x: number; y: number }[] = [];
  for (let xi = 0; xi < order.length; xi++) {
    const res = p.r[order[xi]];
    if (res && res.tp != null) {
      const t = T.find(x => x.id === order[xi]);
      if (t) pts.push({ x: xi, y: res.tp / t.rounds });
    }
  }
  if (pts.length < 2) return null;
  const slope = linearSlopeXY(pts);
  if (slope == null) return null;
  if (slope <= -1.5) return "up2";
  if (slope < -0.3) return "up";
  if (slope >= 1.5) return "down2";
  if (slope > 0.3) return "down";
  return "stable";
}

const TR_I = { up2: { i: "▲▲", c: SC.good }, up: { i: "▲", c: "var(--score-par-seg)" }, stable: { i: "●", c: "var(--text-muted)" }, down: { i: "▼", c: SC.warn }, down2: { i: "▼▼", c: SC.danger } };

// Average z-score across all rounds played
function getAvgZ(p) {
  // Weighted z-score per tournament, with par-bonus:
  // - Prestige weight: rounds, field size, internationality
  // - Par bonus: scoring well under par boosts that tournament's weight
  let totalW = 0, sumWZ = 0, effRd = 0;
  for (const t of T) {
    const res = p.r[t.id];
    if (!res || !res.rd) continue;
    const zs: number[] = [];
    for (let i = 0; i < t.rounds; i++) {
      const sc = res.rd[i];
      const stats = AVG_R[t.id] && AVG_R[t.id][i];
      if (sc != null && stats && stats.s > 0) zs.push((sc - stats.m) / stats.s);
    }
    if (zs.length === 0) continue;
    const tournZ = zs.reduce((a, b) => a + b, 0) / zs.length;
    const tpPerRd = res.tp != null ? res.tp / t.rounds : 0;
    const parBonus = 1 + Math.max(0, -tpPerRd) * 0.15;
    const w = (T_WEIGHTS[t.id] || 0.5) * parBonus;
    sumWZ += tournZ * w;
    totalW += w;
    // Effective rounds: weighted by tournament prestige
    // 2 rounds at GG(0.43) = 0.86 eff, 3 rounds at WJGC(1.0) = 3.0 eff
    effRd += zs.length * (T_WEIGHTS[t.id] || 0.5);
  }
  if (totalW === 0) return null;
  const weightedAvg = sumWZ / totalW;
  // Bayesian shrinkage toward PRIOR (+1.5 = assume below average until proven)
  // With few effective rounds → pulled heavily toward prior (mediocre)
  // With many effective rounds → trust the data
  const prior = 1.5;
  const k = 12;
  const alpha = effRd / (effRd + k);
  return weightedAvg * alpha + prior * (1 - alpha);
}

const allCountries = [...new Set(D.map(p => p.co))].sort();

function RivaisDashboard({ onSelectPlayer }: { onSelectPlayer?: (name: string) => void }) {
  const [fTour, setFTour] = useState("all");
  const [fUp, setFUp] = useState("all");
  const [fCo, setFCo] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("zrank");
  const [dir, setDir] = useState<"asc"|"desc">("asc");
  const [dOnly, setDOnly] = useState(false);
  const [vsOn, setVsOn] = useState(true);

  const list = useMemo(() => {
    let pl = [...D];
    if (dOnly) pl = pl.filter(x => Object.values(x.r).some(r => r.tp != null));
    if (fTour !== "all") pl = pl.filter(x => x.r[fTour]);
    if (fUp !== "all") pl = pl.filter(x => x.up.includes(fUp));
    if (fCo !== "all") pl = pl.filter(x => x.co === fCo);
    if (q) { const ql = q.toLowerCase(); pl = pl.filter(x => x.n.toLowerCase().includes(ql)); }
    pl.sort((a, b) => {
      let cmp = 0;
      if (sort === "name") cmp = a.n.localeCompare(b.n);
      else if (sort === "zrank") { cmp = (getAvgZ(a) ?? 99) - (getAvgZ(b) ?? 99); }
      else if (sort === "vsManuel") { cmp = (getVsAvg(a) ?? 999) - (getVsAvg(b) ?? 999); }
      else if (sort.startsWith("t:")) {
        const tid = sort.slice(2);
        const posOf = (x: RivalPlayer) => { const r = x.r[tid]; if (!r || r.tp == null) return 9999; return typeof r.p === "number" ? r.p : 9998; };
        cmp = posOf(a) - posOf(b);
      }
      else if (sort.startsWith("up:")) {
        const uid = sort.slice(3);
        cmp = (a.up.includes(uid) ? 0 : 1) - (b.up.includes(uid) ? 0 : 1);
        if (cmp === 0) cmp = a.n.localeCompare(b.n);
      }
      return dir === "desc" ? -cmp : cmp;
    });
    return pl;
  }, [fTour, fUp, fCo, q, sort, dir, dOnly]);

  const doSort = (c: string) => { if (sort === c) setDir(d => d === "asc" ? "desc" : "asc"); else { setSort(c); setDir("asc"); } };
  const sortIcon = (c: string) => sort === c ? (dir === "asc" ? " ↑" : " ↓") : "";

  // Compute global ordinal rankings from z-score (across ALL players, not just filtered)
  const rankMap = useMemo(() => {
    const scored = D.map(p => ({ n: p.n, z: getAvgZ(p) })).filter(x => x.z != null) as { n: string; z: number }[];
    scored.sort((a, b) => a.z - b.z); // lower z = better
    const map: Record<string, number> = {};
    scored.forEach((s, i) => { map[s.n] = i + 1; });
    return map;
  }, []);
  const totalRanked = Object.keys(rankMap).length;

  function getVsAvg(p: RivalPlayer) {
    if (p.isM) return null;
    const ds: number[] = [];
    Object.keys(p.r).forEach(tid => {
      const m = manuel.r[tid];
      if (m && p.r[tid].tp != null && m.tp != null) ds.push(p.r[tid].tp - m.tp);
    });
    return ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null;
  }

  // Count tournaments & rounds played
  const nPlayed = (p: RivalPlayer) => T.filter(t => p.r[t.id] && p.r[t.id].tp != null).length;
  const nRounds = (p: RivalPlayer) => T.reduce((acc, t) => { const res = p.r[t.id]; return acc + (res && res.rd ? res.rd.filter((x: number | null) => x != null).length : 0); }, 0);

  return (
    <div className="tourn-section">
      {/* Manuel KPIs */}
      <div className="kpis" style={{ gridTemplateColumns: `repeat(${T.length}, 1fr)` }}>
        {T.map(t => {
          const res = manuel.r[t.id];
          if (!res) return (
            <div key={t.id} className="kpi op-4">
              <div className="kpi-lbl">{t.short}</div>
              <div className="kpi-val fs-16">–</div>
            </div>
          );
          return (
            <div key={t.id} className="kpi">
              <div className="kpi-lbl">{t.short}</div>
              <div className="kpi-val" style={{ fontSize: 16, color: res.tp <= 0 ? "var(--color-good-dark)" : res.tp <= 20 ? "var(--color-warn-dark)" : "var(--color-danger-dark)" }}>
                {fmtSign(res.tp)}
              </div>
              <div className="kpi-sub">#{res.p} · {res.rd.join("-")}</div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="detail-toolbar">
        <input type="text" placeholder="Pesquisar..." value={q} onChange={e => setQ(e.target.value)} className="input" style={{ maxWidth: 140 }} />
        <select value={fTour} onChange={e => setFTour(e.target.value)} className="select">
          <option value="all">Todos Torneios</option>
          {T.map(t => <option key={t.id} value={t.id}>{t.short}</option>)}
        </select>
        <select value={fUp} onChange={e => setFUp(e.target.value)} className="select">
          <option value="all">Próximos: Todos</option>
          {UP.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={fCo} onChange={e => setFCo(e.target.value)} className="select">
          <option value="all">🌍 País</option>
          {allCountries.map(c => <option key={c} value={c}>{FL[c] || ""} {c}</option>)}
        </select>
        <label className="filter-checkbox"><input type="checkbox" checked={dOnly} onChange={e => setDOnly(e.target.checked)} /> Só com dados</label>
        <label className="filter-checkbox"><input type="checkbox" checked={vsOn} onChange={e => setVsOn(e.target.checked)} /> vs Manuel</label>
        <div className="chip">{list.length} jogadores</div>
      </div>

      {/* Legend */}
      <div className="legend-row">
        {Object.keys(TIER).map(k => (
          <span key={k} className="legend-item">
            <span className="legend-dot" style={{ background: TIER[k].bg }} />
            <span style={{ color: TIER[k].c, fontSize: 10 }}>{TIER_L[k]}</span>
          </span>
        ))}
      </div>

      {/* Table */}
      <div className="card">
        <div className="scroll-x">
          <table className="tourn-form-table">
            <thead>
              <tr className="rivais-group-header">
                <th className="rivais-th-name pointer" onClick={() => doSort("name")}>Jogador{sortIcon("name")}</th>
                <th className="rivais-th pointer ta-center" onClick={() => doSort("zrank")} title="Torneios jogados">#T</th>
                {T.map(t => {
                  const w = T_WEIGHTS[t.id];
                  const stars = w >= 0.9 ? "★★★" : w >= 0.6 ? "★★" : w >= 0.4 ? "★" : "½";
                  return (
                  <th key={t.id} className="rivais-th pointer ta-center" style={{ minWidth: 56 }} onClick={() => doSort("t:" + t.id)}>
                    {t.url ? <a href={t.url} target="_blank" rel="noopener noreferrer" className="rivais-link" onClick={e => e.stopPropagation()}>{t.short}</a> : t.short}
                    {sortIcon("t:" + t.id)}
                    <div className="fs-9 fw-500 op-6 mt-1">{stars}</div>
                  </th>
                  );
                })}
                <th className="rivais-th pointer ta-center" style={{ borderLeft: "3px solid var(--text-muted)", minWidth: 56 }} onClick={() => doSort("zrank")}>Rank{sortIcon("zrank")}</th>
                <th className="rivais-th ta-center">▲</th>
                {UP.map(u => (
                  <th key={u.id} className="rivais-th pointer ta-center" onClick={() => doSort("up:" + u.id)}>
                    {u.url ? <a href={u.url} target="_blank" rel="noopener noreferrer" className="rivais-link" onClick={e => e.stopPropagation()}>{u.short}</a> : u.short}
                    {sortIcon("up:" + u.id)}
                  </th>
                ))}
                {vsOn && <th className="rivais-th pointer ta-center" onClick={() => doSort("vsManuel")}>vs M{sortIcon("vsManuel")}</th>}
              </tr>
            </thead>
            <tbody>
              {list.map(p => {
                const isM = p.isM;
                const tr = getTrend(p);
                const flag = FL[p.co] || "🏳️";
                const vsAvg = vsOn ? getVsAvg(p) : null;
                const played = nPlayed(p);

                return (
                  <tr key={p.n} className={isM ? "rivais-row-ref" : ""}>
                    {/* Player name — clickable */}
                    <td className="rivais-player-name">
                      <span className="rivais-flag" title={p.co}>{flag}</span>
                      {onSelectPlayer ? (
                        <button className="btn-link fs-12 fw-600" style={{ color: isM ? "var(--text)" : "var(--text-2)" }} onClick={() => onSelectPlayer(p.n)}>
                          {p.n}
                        </button>
                      ) : (
                        <span className={`fs-12${isM ? " fw-700" : " fw-600"}`} style={{ color: isM ? "var(--text)" : "var(--text-2)" }}>{p.n}</span>
                      )}
                      {isM && <span className="p p-sm p-outline ml-4">REF</span>}
                    </td>

                    {/* # tournaments played */}
                    <td className="ta-center fs-12 fw-600 c-text-3">{played || ""}</td>

                    {/* One cell per tournament: ±par colored + position */}
                    {T.map(t => {
                      const res = p.r[t.id];
                      if (!res || (res.tp == null && res.p !== "WD")) return <td key={t.id} />;
                      if (res.p === "WD") return <td key={t.id} className="ta-center fs-11 c-muted">WD</td>;

                      // Tier color
                      const playerAvg = res.t / t.rounds;
                      const roundAvgs = AVG_R[t.id];
                      let fieldAvg: number | null = null, fieldStd: number | null = null;
                      if (roundAvgs && roundAvgs.length > 0) {
                        const ms = roundAvgs.filter((x: RoundAvg): x is { m: number; s: number } => x != null).map(x => x.m);
                        const ss = roundAvgs.filter((x: RoundAvg): x is { m: number; s: number } => x != null).map(x => x.s);
                        if (ms.length > 0) { fieldAvg = ms.reduce((a: number, b: number) => a + b, 0) / ms.length; fieldStd = ss.reduce((a: number, b: number) => a + b, 0) / ss.length; }
                      }
                      const ti = fieldAvg != null ? zTier(playerAvg, { m: fieldAvg, s: fieldStd }) : null;
                      const st = ti ? TIER[ti] : {};
                      const tpStr = fmtSign(res.tp);

                      // vs Manuel delta
                      let vsM: number | null = null;
                      if (vsOn && !isM && manuel.r[t.id] && manuel.r[t.id].tp != null) {
                        vsM = res.tp - manuel.r[t.id].tp;
                      }

                      return (
                        <td key={t.id} className="ta-center" style={{ background: st.bg || "transparent", padding: "5px 4px" }}>
                          <div className="fw-700 fs-13" style={{ color: st.c || "var(--text-3)" }}>{tpStr}</div>
                          <div className="fs-10 fw-600 c-text-3">#{res.p}</div>
                          {vsM != null && <div className="fs-10 fw-600" style={{ color: sc3m(vsM, 0, 0) }}>{fmtSign(vsM)}</div>}
                        </td>
                      );
                    })}

                    {/* Rank */}
                    <td className="ta-center" style={{ borderLeft: "3px solid var(--border-light)", padding: "4px 6px" }}>
                      {rankMap[p.n] != null ? (
                        <div title={`z-score: ${(getAvgZ(p) ?? 0).toFixed(2)} · ${nRounds(p)} rondas`}>
                          <div className="fw-800 fs-13" style={{ color: rankMap[p.n] <= 10 ? "var(--color-good-dark)" : rankMap[p.n] <= 30 ? "var(--text)" : "var(--text-3)" }}>
                            {rankMap[p.n]}º
                          </div>
                          <div className="fs-10 c-text-3">{nPlayed(p)}T · {nRounds(p)}R</div>
                        </div>
                      ) : <span className="fs-10 c-border">s/d</span>}
                    </td>

                    {/* Trend */}
                    <td className="ta-center">
                      {tr ? <span className="fw-700 fs-13" style={{ color: TR_I[tr].c }}>{TR_I[tr].i}</span> : <span className="c-border">—</span>}
                    </td>

                    {/* Upcoming tournaments */}
                    {UP.map(u => (
                      <td key={u.id} className="ta-center fs-12">
                        {p.up.includes(u.id) ? <span className="fw-700 c-good-dark">✓</span> : <span className="c-border">—</span>}
                      </td>
                    ))}

                    {/* vs Manuel average */}
                    {vsOn && (
                      <td className="ta-center">
                        {isM ? <span className="fs-10 c-border">—</span> :
                        vsAvg != null ? <span className="fs-12 fw-700" style={{ color: sc3m(vsAvg, 0, 0) }}>{fmtSign(vsAvg)}</span> :
                        <span className="fs-10 c-border">—</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-subtitle ta-c mt-10">
        Clica num jogador para ver detalhe · Rank ponderado por prestígio: ★★★ peso máximo, ½ peso mínimo · ({totalRanked} jogadores com dados)
      </div>
    </div>
  );
}

function FieldPlayerDetail({ playerName, onBack }: { playerName: string; onBack: () => void }) {
  const card = FIELD_CARDS.find(c => c.name === playerName);
  const lbEntry = FIELD_2025.leaderboard.find(p => p.name === playerName);
  const rival = D.find(d => d.n === playerName);

  if (!lbEntry && !rival) return (
    <div className="tourn-section">
      <button className="p p-filter active mb-8" onClick={onBack}>← Voltar</button>
      <div className="empty-state-sm">Sem dados disponíveis para {playerName}</div>
    </div>
  );

  const par = VP_PAR;
  const FH = FIELD_2025.holes;
  const frontPar = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const backPar = par.slice(9).reduce((a, b) => a + b, 0);
  const totalPar = frontPar + backPar;
  const sm = (arr: number[], f: number, t: number) => arr.slice(f, t).reduce((a, b) => a + b, 0);

  /* ── Sub-total cell with ±par annotation ── */
  const SubCell = ({ gross, parVal, cls }: { gross: number; parVal: number; cls: string }) => {
    const tp = gross - parVal;
    return <td className={`${cls} fw-700`}>{gross}<span className={`sc-topar ${toParClass(tp)}`}>{fmtSign(tp)}</span></td>;
  };

  /* ── Shared table header ── */
  const THead = () => (
    <thead><tr>
      <th className="hole-header" style={{ textAlign: "left", paddingLeft: 8, minWidth: 50 }}>Buraco</th>
      {par.slice(0, 9).map((_, i) => <th key={i} className="hole-header">{i + 1}</th>)}
      <th className="hole-header col-out fs-10">Out</th>
      {par.slice(9).map((_, i) => <th key={i + 9} className="hole-header">{i + 10}</th>)}
      <th className="hole-header col-in fs-10">In</th>
      <th className="hole-header col-total">TOTAL</th>
    </tr></thead>
  );

  /* ── Par row ── */
  const ParRow = ({ sep }: { sep?: boolean }) => (
    <tr className={sep ? "sep-row" : "meta-row"}>
      <td className="row-label par-label">Par</td>
      {par.slice(0, 9).map((p, i) => <td key={i}>{p}</td>)}
      <td className="col-out fw-600">{frontPar}</td>
      {par.slice(9).map((p, i) => <td key={i + 9}>{p}</td>)}
      <td className="col-in fw-600">{backPar}</td>
      <td className="col-total">{totalPar}</td>
    </tr>
  );

  /* ── Gross row with sc-score circles + ±par subtotals ── */
  const GrossRow = ({ holes, label }: { holes: number[]; label: string }) => {
    const front = sm(holes, 0, 9), back = sm(holes, 9, 18), total = front + back;
    return (
      <tr>
        <td className="row-label fw-700">{label}</td>
        {holes.slice(0, 9).map((g, i) => <td key={i}><span className={`sc-score ${scClass(g, par[i])}`}>{g}</span></td>)}
        <SubCell gross={front} parVal={frontPar} cls="col-out" />
        {holes.slice(9).map((g, i) => <td key={i + 9}><span className={`sc-score ${scClass(g, par[i + 9])}`}>{g}</span></td>)}
        <SubCell gross={back} parVal={backPar} cls="col-in" />
        <SubCell gross={total} parVal={totalPar} cls="col-total" />
      </tr>
    );
  };

  /* ── vs Field row ── */
  const VsFieldRow = ({ holes }: { holes: number[] }) => (
    <tr className="meta-row">
      <td className="row-label c-muted fs-10 fw-400">vs Field</td>
      {holes.map((g, i) => {
        const diff = g - FH[i].fAvg;
        const col = diff <= -0.5 ? "var(--color-good)" : diff >= 0.5 ? "var(--color-danger)" : "var(--text-muted)";
        return (
          <React.Fragment key={i}>
            <td className="fs-10 fw-600" style={{ color: col }}>{fmtSign(diff, 1)}</td>
            {i === 8 && <td className="col-out" />}
          </React.Fragment>
        );
      })}
      <td className="col-in" />
      <td className="col-total" />
    </tr>
  );

  /* ── Difficulty rank row ── */
  const DiffRow = () => (
    <tr className="meta-row">
      <td className="row-label c-muted fs-10 fw-400">Dific.</td>
      {par.map((_, i) => {
        const rank = FIELD_2025.diffRank.indexOf(i + 1) + 1;
        const col = rank <= 3 ? "var(--color-danger)" : rank >= 16 ? "var(--color-good)" : "var(--text-muted)";
        return (
          <React.Fragment key={i}>
            <td className="fs-9 fw-600" style={{ color: col }}>{rank}</td>
            {i === 8 && <td className="col-out" />}
          </React.Fragment>
        );
      })}
      <td className="col-in" />
      <td className="col-total" />
    </tr>
  );

  /* ── Field Average row ── */
  const FieldAvgRow = () => (
    <tr className="meta-row">
      <td className="row-label c-muted fs-10 fw-400">Avg Field</td>
      {FH.map((h, i) => (
        <React.Fragment key={i}>
          <td className="fs-10 c-muted">{h.fAvg.toFixed(1)}</td>
          {i === 8 && <td className="col-out fs-10 c-muted">{FH.slice(0, 9).reduce((a, x) => a + x.fAvg, 0).toFixed(1)}</td>}
        </React.Fragment>
      ))}
      <td className="col-in fs-10 c-muted">{FH.slice(9).reduce((a, x) => a + x.fAvg, 0).toFixed(1)}</td>
      <td className="col-total fs-10 c-muted">{FH.reduce((a, x) => a + x.fAvg, 0).toFixed(1)}</td>
    </tr>
  );

  /* ── Single round scorecard ── */
  const renderScorecard = (holes: number[], label: string, idx: number) => {
    const total = sm(holes, 0, 18), tp = total - totalPar;
    return (
      <div key={idx} className="mb-12">
        <div className="tourn-meta fw-700 mb-4">{label} — {total} ({fmtToPar(tp)})</div>
        <div className="scroll-x">
          <table className="sc-table-modern" data-sc-table="1">
            <THead />
            <tbody>
              <DiffRow />
              <FieldAvgRow />
              <ParRow sep />
              <GrossRow holes={holes} label={label} />
              <VsFieldRow holes={holes} />
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Collect tournament results from Rivais
  const tournResults: { name: string; short: string; date: string; par: number; pos: number | string; total: number | null; tp: number | null; rounds: number[] }[] = [];
  if (rival) { for (const t of T) { const res = rival.r[t.id]; if (res) tournResults.push({ name: t.name, short: t.short, date: t.date, par: t.par, pos: res.p, total: res.t, tp: res.tp, rounds: res.rd }); } }

  const completedResults = tournResults.filter(r => r.tp != null);
  const allRounds = completedResults.flatMap(r => r.rounds);
  const bestTp = completedResults.length ? Math.min(...completedResults.map(r => r.tp!)) : null;
  const bestRound = allRounds.length ? Math.min(...allRounds) : null;
  const avgRound = allRounds.length ? allRounds.reduce((a, b) => a + b, 0) / allRounds.length : null;

  // Player avg per hole (across BJGT rounds)
  const playerHoleAvg = card ? par.map((_, i) => {
    const scores = card.rounds.map(rd => rd[i]);
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }) : null;

  // Scoring distribution
  const scoringStats = card ? (() => {
    let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0, worse = 0;
    for (const rd of card.rounds) for (let i = 0; i < 18; i++) {
      const d = rd[i] - par[i];
      if (d <= -2) eagles++; else if (d === -1) birdies++; else if (d === 0) pars++; else if (d === 1) bogeys++; else if (d === 2) doubles++; else worse++;
    }
    return { eagles, birdies, pars, bogeys, doubles, worse, total: card.rounds.length * 18 };
  })() : null;

  return (
    <div className="tourn-section">
      <button className="p p-filter mb-12" onClick={onBack}>← Análise</button>

      <div className="d-flex items-center gap-8 mb-12">
        <span className="fw-800 fs-15">{lbEntry?.country || (rival ? (FL as Record<string, string>)[rival.co] || "" : "")} {playerName}</span>
        {lbEntry && <span className="p p-outline">BJGT #{lbEntry.pos}</span>}
        <span className="p p-sub12">Sub-12</span>
        {rival?.co && <span className="p p-outline">{rival.co}</span>}
      </div>

      {/* KPIs */}
      <div className="kpis" style={{ gridTemplateColumns: `repeat(${card ? 5 : 4}, 1fr)`, marginBottom: 16 }}>
        {lbEntry && <div className="kpi"><div className="kpi-lbl">BJGT Total</div><div className="kpi-val">{lbEntry.total}</div><div className="kpi-sub">{fmtToPar(lbEntry.result)} · #{lbEntry.pos}</div></div>}
        {bestTp != null && <div className="kpi"><div className="kpi-lbl">Melhor ±Par</div><div className="kpi-val" style={{ color: bestTp <= 0 ? "var(--color-good-dark)" : "var(--text)" }}>{fmtToPar(bestTp)}</div></div>}
        {bestRound != null && <div className="kpi"><div className="kpi-lbl">Melhor Ronda</div><div className="kpi-val c-good-dark">{bestRound}</div></div>}
        {avgRound != null && <div className="kpi"><div className="kpi-lbl">Média Ronda</div><div className="kpi-val">{avgRound.toFixed(1)}</div></div>}
        {card && <div className="kpi"><div className="kpi-lbl">Eclético BJGT</div><div className="kpi-val c-good-dark">{card.eclTotal}</div><div className="kpi-sub">{fmtToPar(card.eclTotal - totalPar)}</div></div>}
      </div>

      {/* ── Scoring distribution ── */}
      {scoringStats && (
        <div className="d-flex items-center gap-8 mb-16 flex-wrap">
          <span className="fs-10 fw-600 c-text-3">Distribuição ({scoringStats.total} buracos):</span>
          {[
            { label: "Eagle+", val: scoringStats.eagles, cls: "eagle" },
            { label: "Birdie", val: scoringStats.birdies, cls: "birdie" },
            { label: "Par", val: scoringStats.pars, cls: "par" },
            { label: "Bogey", val: scoringStats.bogeys, cls: "bogey" },
            { label: "Double", val: scoringStats.doubles, cls: "double" },
            { label: "Triple+", val: scoringStats.worse, cls: "triple" },
          ].filter(s => s.val > 0).map(s => (
            <span key={s.label} className="d-flex items-center gap-4">
              <span className={`sc-score ${s.cls}`} style={{ width: 22, height: 22, fontSize: 10 }}>{s.val}</span>
              <span className="fs-10 fw-600 c-text-3">{s.label} ({(s.val / scoringStats.total * 100).toFixed(0)}%)</span>
            </span>
          ))}
        </div>
      )}

      {/* ── Tournament history ── */}
      {tournResults.length > 0 && (
        <div className="mb-16">
          <div className="tourn-meta fw-700 mb-6">Historial de Torneios</div>
          <div className="tourn-scroll">
            <table className="tourn-form-table">
              <thead><tr>
                <th>Torneio</th><th>Data</th><th className="r">Par</th><th className="r">Pos</th>
                {Array.from({ length: Math.max(...tournResults.map(r => r.rounds.length)) }, (_, i) => <th key={i} className="r">R{i + 1}</th>)}
                <th className="r">Total</th><th className="r">±Par</th>
              </tr></thead>
              <tbody>
                {tournResults.map((r, i) => {
                  const mx = Math.max(...tournResults.map(x => x.rounds.length));
                  return (
                    <tr key={i}>
                      <td className="fw-700 fs-12">{r.short}</td>
                      <td className="fs-11 c-text-3">{r.date}</td>
                      <td className="r tourn-mono">{r.par}</td>
                      <td className="r tourn-mono fw-700">{typeof r.pos === "number" ? `#${r.pos}` : r.pos}</td>
                      {Array.from({ length: mx }, (_, j) => {
                        const rd = r.rounds[j]; if (rd == null) return <td key={j} />;
                        const rdTp = rd - r.par;
                        const col = rdTp <= 0 ? "var(--color-good-dark)" : rdTp <= 5 ? "var(--color-warn-dark)" : "var(--color-danger-dark)";
                        return <td key={j} className="r tourn-mono fw-600" style={{ color: col }}>{rd}</td>;
                      })}
                      <td className="r tourn-mono fw-800">{r.total ?? "–"}</td>
                      <td className="r fw-700" style={{ color: r.tp != null && r.tp <= 0 ? "var(--color-good-dark)" : r.tp != null && r.tp <= 15 ? "var(--color-warn-dark)" : "var(--color-danger-dark)" }}>{fmtToPar(r.tp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BJGT Comparative scorecard ── */}
      {card && <>
        <div className="tourn-meta fw-700 mb-6">BJGT 2025 — Scorecard Comparativo</div>
        <div className="scroll-x mb-16">
          <table className="sc-table-modern" data-sc-table="1">
            <THead />
            <tbody>
              <DiffRow />
              <FieldAvgRow />
              <ParRow sep />
              {card.rounds.map((rd, i) => <GrossRow key={i} holes={rd} label={`R${i + 1}`} />)}
              <GrossRow holes={card.ecl} label="ECL" />
              {playerHoleAvg && (
                <tr className="meta-row">
                  <td className="row-label c-muted fs-10 fw-600">Média</td>
                  {playerHoleAvg.map((avg, i) => {
                    const diff = avg - par[i];
                    const col = diff <= -0.3 ? "var(--color-good)" : diff >= 0.5 ? "var(--color-danger)" : "var(--text-muted)";
                    return (
                      <React.Fragment key={i}>
                        <td className="fs-10 fw-600" style={{ color: col }}>{avg.toFixed(1)}</td>
                        {i === 8 && <td className="col-out fs-10 fw-600">{playerHoleAvg.slice(0, 9).reduce((a, b) => a + b, 0).toFixed(1)}</td>}
                      </React.Fragment>
                    );
                  })}
                  <td className="col-in fs-10 fw-600">{playerHoleAvg.slice(9).reduce((a, b) => a + b, 0).toFixed(1)}</td>
                  <td className="col-total fs-10 fw-700">{playerHoleAvg.reduce((a, b) => a + b, 0).toFixed(1)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="tourn-meta fw-700 mb-6">Rondas Individuais</div>
        {card.rounds.map((rd, i) => renderScorecard(rd, `R${i + 1}`, i))}
      </>}

      {!card && lbEntry && (
        <div className="tourn-meta mb-12">
          BJGT 2025: {lbEntry.rounds.join("-")} = {lbEntry.total} ({fmtToPar(lbEntry.result)}) — scorecard buraco-a-buraco não disponível
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════
   PAGE COMPONENT
   ═══════════════════════════════════ */
function RivaisIntlContent() {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  return (
    <div className="tourn-layout">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <span className="toolbar-title">🌍 Rivais Internacionais</span>
          <span className="toolbar-meta">Manuel · Sub-12</span>
        </div>
      </div>

      {selectedPlayer ? (
        <FieldPlayerDetail playerName={selectedPlayer} onBack={() => setSelectedPlayer(null)} />
      ) : (
        <RivaisDashboard onSelectPlayer={setSelectedPlayer} />
      )}
    </div>
  );
}

export default function RivaisIntlPage() {
  const [unlocked, setUnlocked] = useState(() => isCalUnlocked());
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  return <RivaisIntlContent />;
}
