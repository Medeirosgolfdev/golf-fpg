/**
 * BJGTAnalysisPage.tsx — Análise Pré-Torneio: BJGT Daily Mail @ Villa Padierna
 *
 * Preparação para o Manuel (Sub-12).
 * Usa HOLE_STATS pré-calculado + HOLES/EC para eclético.
 * Inclui secção de rivais internacionais.
 */
import React, { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  type PlayerPageData,
  type RoundData,
  type HoleScores,
  type HoleStatsData,
  type HoleStatEntry,
  type EclecticEntry,
} from "../data/playerDataLoader";
import { usePlayerData } from "../data/usePlayerData";
import { norm, fmtToPar, firstName } from "../utils/format";
import { scClass, toParClass, sc2, sc2w, sc3, sc3m, diagLevel, scDark, SC } from "../utils/scoreDisplay";
import { isCalUnlocked } from "../utils/authConstants";
import PasswordGate from "../ui/PasswordGate";
import ScoreCircle from "../ui/ScoreCircle";
import SectionErrorBoundary from "../ui/SectionErrorBoundary";
import LoadingState from "../ui/LoadingState";

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

/* Field data from 2025 BJGT VP Flamingos — 12 players × 3 days = 36 scorecards */
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
/* ═══════════════════════════════════
   HELPERS
   ═══════════════════════════════════ */
function matchesCourse(name: string): boolean {
  const n = norm(name);
  return COURSE_KEYWORDS.some(kw => n.includes(kw));
}

/* ScoreCircle + SectionErrorBoundary imported from src/ui/ */

/* ═══════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════ */
/* PasswordGate + authConstants agora importados de src/ui/ e src/utils/ */


/* ═══════════════════════════════════════════
   RivaisDashboard (merged from RivaisDashboard.tsx)
   ═══════════════════════════════════════════ */

const FL={"Portugal":"🇵🇹","Spain":"🇪🇸","England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Russian Federation":"🇷🇺","Bulgaria":"🇧🇬","Switzerland":"🇨🇭","Italy":"🇮🇹","France":"🇫🇷","Ireland":"🇮🇪","Northern Ireland":"🇬🇧","Germany":"🇩🇪","Netherlands":"🇳🇱","Norway":"🇳🇴","Lithuania":"🇱🇹","Thailand":"🇹🇭","United States":"🇺🇸","United Kingdom":"🇬🇧","Sweden":"🇸🇪","Morocco":"🇲🇦","Wales":"🏴󠁧󠁢󠁷󠁬󠁳󠁿","Belgium":"🇧🇪","Slovenia":"🇸🇮","Ukraine":"🇺🇦","Romania":"🇷🇴","China":"🇨🇳","Philippines":"🇵🇭","Slovakia":"🇸🇰","United Arab Emirates":"🇦🇪","Turkey":"🇹🇷","India":"🇮🇳","Viet Nam":"🇻🇳","Kazakhstan":"🇰🇿","Hungary":"🇭🇺","South Africa":"🇿🇦","Singapore":"🇸🇬","Denmark":"🇩🇰","Mexico":"🇲🇽","Canada":"🇨🇦","Austria":"🇦🇹","Paraguay":"🇵🇾","Brazil":"🇧🇷","Jersey":"🇯🇪","Nigeria":"🇳🇬","Oman":"🇴🇲","Chile":"🇨🇱","Colombia":"🇨🇴","Puerto Rico":"🇵🇷","Costa Rica":"🇨🇷","Great Britain":"🇬🇧","Latvia":"🇱🇻","South Korea":"🇰🇷"};

const T: TournDef[]=[
  {id:"brjgt25",name:"WJGC 2025",short:"WJGC",date:"Fev 2025",rounds:3,par:71,field:40,nations:17,url:"https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/34/leaderboard.htm"},
  {id:"eowagr25",name:"European Open",short:"EU Open",date:"Ago 2025",rounds:3,par:72,field:8,nations:3,url:"https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/21/leaderboard.htm"},
  {id:"venice25",name:"Venice Open 2025",short:"Venice",date:"Ago 2025",rounds:3,par:72,field:39,nations:12,url:"https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/515206/venice-open-2025/results"},
  {id:"rome25",name:"Rome Classic 2025",short:"Rome",date:"Out 2025",rounds:2,par:72,field:14,nations:3,url:"https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516026/rome-classic-2025/results"},
  {id:"doral25",name:"Doral Junior 2025",short:"Doral",date:"Dez 2025",rounds:2,par:71,field:35,nations:9,url:"https://www.golfgenius.com/v2tournaments/4222407?called_from=widgets%2Fcustomized_tournament_results&hide_totals=false&player_stats_for_portal=true"},
  {id:"qdl25",name:"QDL Junior Open 2025",short:"QDL",date:"Nov 2025",rounds:1,par:72,field:12,nations:7,intendedRounds:3,url:"https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=962&tcode=10080&classif_order=2"},
  {id:"gg26",name:"Greatgolf Junior Open",short:"GG",date:"Fev 2026",rounds:2,par:72,field:12,nations:4,url:"https://scoring-pt.datagolf.pt/scripts/classif.asp?tourn=10296&club=935&ack=OT342GH16T"},
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

const UP=[{id:"wjgc26",name:"WJGC 2026",short:"WJGC"},{id:"marco26",name:"Marco Simone Inv.",short:"M.SIMONE",url:"https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516989/marco-simone-invitational-2026/field"}];

const D: RivalPlayer[]=[
  {n:"Manuel Medeiros",co:"Portugal",isM:true,r:{brjgt25:{p:26,t:265,tp:52,rd:[90,85,90]},eowagr25:{p:7,t:238,tp:22,rd:[85,77,76]},venice25:{p:28,t:237,tp:21,rd:[78,76,83]},rome25:{p:10,t:166,tp:22,rd:[89,77]},doral25:{p:29,t:177,tp:35,rd:[98,79]},qdl25:{p:11,t:90,tp:18,rd:[90]},gg26:{p:4,t:169,tp:25,rd:[87,82]}},up:["wjgc26","marco26"]},
  {n:"Dmitrii Elchaninov",co:"Russian Federation",r:{brjgt25:{p:1,t:205,tp:-8,rd:[69,68,68]},eowagr25:{p:2,t:218,tp:2,rd:[77,70,71]},venice25:{p:1,t:198,tp:-18,rd:[62,68,68]},qdl25:{p:1,t:71,tp:-1,rd:[71]}},up:["wjgc26"]},
  {n:"Diego Gross Paneque",co:"Spain",r:{brjgt25:{p:16,t:249,tp:36,rd:[80,84,85]}},up:["wjgc26"]},
  {n:"Álex Carrón",co:"Spain",r:{brjgt25:{p:13,t:246,tp:33,rd:[82,84,80]}},up:["wjgc26"]},
  {n:"Henry Liechti",co:"Switzerland",r:{brjgt25:{p:17,t:250,tp:37,rd:[87,84,79]}},up:["wjgc26"]},
  {n:"Niko Alvarez Van Der Walt",co:"Spain",r:{brjgt25:{p:22,t:261,tp:48,rd:[89,83,89]}},up:["wjgc26"]},
  {n:"Miroslavs Bogdanovs",co:"Spain",r:{brjgt25:{p:24,t:263,tp:50,rd:[86,88,89]},venice25:{p:18,t:227,tp:11,rd:[76,74,77]}},up:["wjgc26"]},
  {n:"Christian Chepishev",co:"Bulgaria",r:{brjgt25:{p:29,t:270,tp:57,rd:[87,86,97]}},up:["wjgc26","marco26"]},
  {n:"James Doyle",co:"Ireland",r:{brjgt25:{p:32,t:277,tp:64,rd:[93,92,92]}},up:["wjgc26"]},
  {n:"Alexis Beringer",co:"Switzerland",r:{brjgt25:{p:33,t:290,tp:77,rd:[93,94,103]}},up:["wjgc26"]},
  {n:"Kevin Canton",co:"Italy",r:{brjgt25:{p:34,t:291,tp:78,rd:[98,96,97]}},up:["wjgc26"]},
  {n:"Leon Schneitter",co:"Switzerland",r:{brjgt25:{p:"WD",t:null,tp:null,rd:[]}},up:["wjgc26"]},
  {n:"Victor Canot Januel",co:"France",r:{brjgt25:{p:30,t:274,tp:61,rd:[88,88,98]},venice25:{p:24,t:233,tp:17,rd:[76,82,75]}},up:[]},
  {n:"Theodore Dausse",co:"France",r:{brjgt25:{p:31,t:275,tp:62,rd:[96,90,89]},venice25:{p:30,t:244,tp:28,rd:[83,80,81]}},up:[]},
  {n:"Aronas Juodis",co:"Lithuania",r:{brjgt25:{p:8,t:232,tp:19,rd:[74,77,81]},eowagr25:{p:1,t:213,tp:-3,rd:[72,71,70]},qdl25:{p:4,t:75,tp:3,rd:[75]}},up:[]},
  {n:"Marcus Karim",co:"England",r:{brjgt25:{p:2,t:218,tp:5,rd:[74,73,71]},qdl25:{p:3,t:72,tp:0,rd:[72]}},up:[]},
  {n:"Harrison Barnett",co:"England",r:{brjgt25:{p:3,t:220,tp:7,rd:[77,71,72]},qdl25:{p:6,t:78,tp:6,rd:[78]}},up:[]},
  {n:"Julian Sepulveda",co:"United States",r:{brjgt25:{p:4,t:223,tp:10,rd:[73,77,73]},doral25:{p:17,t:162,tp:20,rd:[81,81]}},up:[]},
  {n:"Mihir Pasura",co:"United Kingdom",r:{brjgt25:{p:5,t:229,tp:16,rd:[82,74,73]}},up:[]},
  {n:"Yorick De Hek",co:"Netherlands",r:{brjgt25:{p:28,t:270,tp:57,rd:[92,87,91]},eowagr25:{p:5,t:234,tp:18,rd:[79,76,79]}},up:[]},
  {n:"Nial Diwan",co:"England",r:{brjgt25:{p:25,t:264,tp:51,rd:[93,87,84]},eowagr25:{p:6,t:238,tp:22,rd:[81,84,73]}},up:[]},
  {n:"Maximilien Demole",co:"Switzerland",r:{venice25:{p:3,t:207,tp:-9,rd:[69,70,68]},doral25:{p:5,t:155,tp:13,rd:[80,75]}},up:[]},
  {n:"Emile Cuanalo",co:"England",r:{eowagr25:{p:3,t:224,tp:8,rd:[70,76,78]},venice25:{p:5,t:211,tp:-5,rd:[67,71,73]},rome25:{p:2,t:139,tp:-5,rd:[70,69]},qdl25:{p:5,t:75,tp:3,rd:[75]}},up:[]},
  {n:"Paul Berger",co:"Germany",r:{venice25:{p:5,t:211,tp:-5,rd:[70,70,71]},doral25:{p:10,t:158,tp:16,rd:[82,76]}},up:[]},
  {n:"Matteo Durando",co:"Italy",r:{venice25:{p:11,t:215,tp:-1,rd:[70,76,69]},doral25:{p:9,t:156,tp:14,rd:[79,77]}},up:["marco26"]},
  {n:"Luis Maier",co:"Germany",r:{venice25:{p:9,t:213,tp:-3,rd:[69,70,74]},doral25:{p:26,t:175,tp:33,rd:[88,87]}},up:[]},
  {n:"Emilio Berti",co:"Italy",r:{venice25:{p:10,t:214,tp:-2,rd:[73,68,73]},rome25:{p:1,t:136,tp:-8,rd:[70,66]}},up:[]},
  {n:"Noah Birk Andersen",co:"Denmark",r:{venice25:{p:22,t:230,tp:14,rd:[79,74,77]}},up:["marco26"]},
  {n:"Alexander Pianigiani",co:"Italy",r:{rome25:{p:7,t:157,tp:13,rd:[83,74]}},up:["marco26"]},
  {n:"Edoardo Lemonnier",co:"Italy",r:{rome25:{p:3,t:143,tp:-1,rd:[69,74]}},up:["marco26"]},
  {n:"Haqvin Sylven",co:"Switzerland",r:{rome25:{p:8,t:160,tp:16,rd:[82,78]}},up:["marco26"]},
  {n:"Kimi Pulga",co:"Italy",r:{venice25:{p:26,t:234,tp:18,rd:[78,81,75]}},up:["marco26"]},
  {n:"Hugo Strasser",co:"Switzerland",r:{},up:["wjgc26","marco26"]},
  {n:"Skyy Wilding",co:"Thailand",r:{brjgt25:{p:"WD",t:null,tp:null,rd:[]},venice25:{p:2,t:203,tp:-13,rd:[65,65,73]}},up:[]},
  {n:"Felipe Seferian",co:"Spain",r:{venice25:{p:4,t:209,tp:-7,rd:[67,70,72]}},up:[]},
  {n:"Nicolas Pape",co:"Thailand",r:{brjgt25:{p:6,t:231,tp:18,rd:[75,77,79]}},up:[]},
  {n:"Harry-James Odell",co:"England",r:{brjgt25:{p:7,t:231,tp:18,rd:[77,74,80]}},up:[]},
  {n:"Maxime Vervaet",co:"Spain",r:{brjgt25:{p:10,t:239,tp:26,rd:[83,77,79]}},up:[]},
  {n:"Henry Atkinson",co:"England",r:{brjgt25:{p:11,t:239,tp:26,rd:[77,79,83]}},up:[]},
  {n:"Kirill Sedov",co:"Russian Federation",r:{brjgt25:{p:15,t:247,tp:34,rd:[84,82,81]}},up:[]},
  {n:"Edward Fearnley",co:"England",r:{brjgt25:{p:14,t:246,tp:33,rd:[78,85,83]}},up:[]},
  {n:"Mauricio Mijares",co:"Mexico",r:{doral25:{p:1,t:148,tp:6,rd:[74,74]}},up:[]},
  {n:"Jean Imperiali De Francavilla",co:"France",r:{brjgt25:{p:"WD",t:null,tp:null,rd:[]},venice25:{p:23,t:231,tp:15,rd:[77,75,79]},rome25:{p:5,t:152,tp:8,rd:[77,75]}},up:[]},
  {n:"Sebastiano Giacobbi",co:"Italy",r:{venice25:{p:37,t:267,tp:51,rd:[95,87,85]},rome25:{p:13,t:173,tp:29,rd:[87,86]}},up:["marco26"]},
  {n:"Leo Egozi",co:"United States",r:{venice25:{p:36,t:252,tp:36,rd:[83,84,85]},rome25:{p:11,t:167,tp:23,rd:[82,85]}},up:[]},
  {n:"Joe Short",co:"Portugal",r:{gg26:{p:2,t:166,tp:22,rd:[79,87]}},up:["wjgc26"]},
  {n:"Madalena Miguel Araújo",co:"Portugal",r:{},up:["wjgc26"]},
  {n:"Elijah Gibbons",co:"England",r:{},up:["wjgc26"]},
  {n:"Harley Botham",co:"Northern Ireland",r:{gg26:{p:11,t:191,tp:47,rd:[98,93]}},up:["wjgc26"]},
  {n:"Benji Botham",co:"Northern Ireland",r:{gg26:{p:5,t:175,tp:31,rd:[88,87]}},up:["wjgc26"]},
  {n:"Roman Hicks",co:"England",r:{},up:["wjgc26"]},
  {n:"Hanlin Wang",co:"England",r:{},up:["wjgc26"]},
  {n:"Mario Valiente Novella",co:"Spain",r:{},up:["wjgc26"]},
  {n:"Aineon Hiram Jabonero",co:"Philippines",r:{},up:["wjgc26"]},
  {n:"David Dung Nguyen",co:"Viet Nam",r:{},up:["wjgc26"]},
  {n:"Maddox Tiemann",co:"Sweden",r:{},up:["wjgc26"]},
  {n:"William Harran",co:"Switzerland",r:{},up:["wjgc26"]},
  {n:"Louis Harran",co:"Switzerland",r:{},up:["wjgc26"]},
  {n:"Pietro Salvati",co:"Italy",r:{},up:["wjgc26"]},
  {n:"Erik Martel",co:"Spain",r:{brjgt25:{p:18,t:250,tp:37,rd:[83,79,88]}},up:[]},
  // BRJGT 2025 missing
  {n:"Hugo Luque Reina",co:"Spain",r:{brjgt25:{p:9,t:237,tp:24,rd:[78,77,82]}},up:[]},
  {n:"Daniel Avila Sanz",co:"Spain",r:{brjgt25:{p:12,t:240,tp:27,rd:[80,77,83]}},up:[]},
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
  {n:"Alfie Skinner",co:"Great Britain",r:{venice25:{p:13,t:217,tp:1,rd:[72,74,71]}},up:[]},
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
  {n:"Afonso de Sousa Pinto",co:"Portugal",r:{qdl25:{p:7,t:78,tp:6,rd:[78]}},up:[]},
  {n:"Marcos Ledesma",co:"Spain",r:{qdl25:{p:8,t:78,tp:6,rd:[78]}},up:[]},
  {n:"Francisco Carvalho",co:"Portugal",r:{qdl25:{p:9,t:80,tp:8,rd:[80]}},up:[]},
  {n:"Sabrina Ribeiro Crisóstomo",co:"Portugal",r:{qdl25:{p:10,t:88,tp:16,rd:[88]}},up:[]},
  {n:"George Campbell",co:"Ireland",r:{qdl25:{p:12,t:99,tp:27,rd:[99]},gg26:{p:8,t:186,tp:42,rd:[94,92]}},up:["wjgc26"]},
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
  const order = ["brjgt25", "eowagr25", "venice25", "rome25", "doral25", "qdl25", "gg26"];
  const pts: { x: number; y: number }[] = [];
  for (let xi = 0; xi < order.length; xi++) {
    const res = p.r[order[xi]];
    if (res && res.tp != null) {
      const t = T.find(x => x.id === order[xi]);
      if (t) pts.push({ x: xi, y: res.tp / t.rounds });
    }
  }
  if (pts.length < 2) return null;
  // Linear regression slope
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p.x, 0);
  const sy = pts.reduce((a, p) => a + p.y, 0);
  const sxy = pts.reduce((a, p) => a + p.x * p.y, 0);
  const sxx = pts.reduce((a, p) => a + p.x * p.x, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
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
      <div className="tourn-kpis" style={{ gridTemplateColumns: `repeat(${T.length}, 1fr)` }}>
        {T.map(t => {
          const res = manuel.r[t.id];
          if (!res) return (
            <div key={t.id} className="tourn-kpi op-4">
              <div className="tourn-kpi-lbl">{t.short}</div>
              <div className="tourn-kpi-val fs-16">–</div>
            </div>
          );
          return (
            <div key={t.id} className="tourn-kpi">
              <div className="tourn-kpi-lbl">{t.short}</div>
              <div className="tourn-kpi-val" style={{ fontSize: 16, color: res.tp <= 0 ? "var(--color-good-dark)" : res.tp <= 20 ? "var(--color-warn-dark)" : "var(--color-danger-dark)" }}>
                {res.tp > 0 ? "+" : ""}{res.tp}
              </div>
              <div className="tourn-kpi-sub">#{res.p} · {res.rd.join("-")}</div>
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
      <div className="section-card">
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
                      {isM && <span className="jog-pill jog-pill-stats fs-9 ml-4">REF</span>}
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
                      const tpStr = (res.tp > 0 ? "+" : "") + res.tp;

                      // vs Manuel delta
                      let vsM: number | null = null;
                      if (vsOn && !isM && manuel.r[t.id] && manuel.r[t.id].tp != null) {
                        vsM = res.tp - manuel.r[t.id].tp;
                      }

                      return (
                        <td key={t.id} className="ta-center" style={{ background: st.bg || "transparent", padding: "5px 4px" }}>
                          <div className="fw-700 fs-13" style={{ color: st.c || "var(--text-3)" }}>{tpStr}</div>
                          <div className="fs-10 fw-600 c-text-3">#{res.p}</div>
                          {vsM != null && <div className="fs-10 fw-600" style={{ color: sc3m(vsM, 0, 0) }}>{vsM > 0 ? "+" : ""}{vsM}</div>}
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
                        {p.up.includes(u.id) ? <span className="fw-700" style={{ color: "var(--color-good-dark)" }}>✓</span> : <span className="c-border">—</span>}
                      </td>
                    ))}

                    {/* vs Manuel average */}
                    {vsOn && (
                      <td className="ta-center">
                        {isM ? <span className="fs-10 c-border">—</span> :
                        vsAvg != null ? <span className="fs-12 fw-700" style={{ color: sc3m(vsAvg, 0, 0) }}>{vsAvg > 0 ? "+" : ""}{vsAvg}</span> :
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

/* ═══════════════════════════════════
   FieldPlayerDetail — scorecard view for BJGT field players
   ═══════════════════════════════════ */
function FieldPlayerDetail({ playerName, onBack }: { playerName: string; onBack: () => void }) {
  const card = FIELD_CARDS.find(c => c.name === playerName);
  const lbEntry = FIELD_2025.leaderboard.find(p => p.name === playerName);
  const rival = D.find(d => d.n === playerName);

  if (!lbEntry && !rival) return (
    <div className="tourn-section">
      <button className="filter-pill active mb-8" onClick={onBack}>← Voltar</button>
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
    return <td className={`${cls} fw-700`}>{gross}<span className={`sc-topar ${toParClass(tp)}`}>{tp > 0 ? "+" : ""}{tp}</span></td>;
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
            <td className="fs-10 fw-600" style={{ color: col }}>{diff > 0 ? "+" : ""}{diff.toFixed(1)}</td>
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
      <button className="filter-pill mb-12" onClick={onBack}>← Análise</button>

      <div className="d-flex items-center gap-8 mb-12">
        <span className="fw-800 fs-15">{lbEntry?.country || (rival ? (FL as Record<string, string>)[rival.co] || "" : "")} {playerName}</span>
        {lbEntry && <span className="jog-pill jog-pill-stats">BJGT #{lbEntry.pos}</span>}
        <span className="jog-pill jog-pill-escalao jog-pill-escalao-sub12">Sub-12</span>
        {rival?.co && <span className="jog-pill jog-pill-stats">{rival.co}</span>}
      </div>

      {/* KPIs */}
      <div className="tourn-kpis" style={{ gridTemplateColumns: `repeat(${card ? 5 : 4}, 1fr)`, marginBottom: 16 }}>
        {lbEntry && <div className="tourn-kpi"><div className="tourn-kpi-lbl">BJGT Total</div><div className="tourn-kpi-val">{lbEntry.total}</div><div className="tourn-kpi-sub">{fmtToPar(lbEntry.result)} · #{lbEntry.pos}</div></div>}
        {bestTp != null && <div className="tourn-kpi"><div className="tourn-kpi-lbl">Melhor ±Par</div><div className="tourn-kpi-val" style={{ color: bestTp <= 0 ? "var(--color-good-dark)" : "var(--text)" }}>{fmtToPar(bestTp)}</div></div>}
        {bestRound != null && <div className="tourn-kpi"><div className="tourn-kpi-lbl">Melhor Ronda</div><div className="tourn-kpi-val" style={{ color: "var(--color-good-dark)" }}>{bestRound}</div></div>}
        {avgRound != null && <div className="tourn-kpi"><div className="tourn-kpi-lbl">Média Ronda</div><div className="tourn-kpi-val">{avgRound.toFixed(1)}</div></div>}
        {card && <div className="tourn-kpi"><div className="tourn-kpi-lbl">Eclético BJGT</div><div className="tourn-kpi-val" style={{ color: "var(--color-good-dark)" }}>{card.eclTotal}</div><div className="tourn-kpi-sub">{fmtToPar(card.eclTotal - totalPar)}</div></div>}
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

export default function BJGTAnalysisPage({ playerFed }: { playerFed?: string }) {
  const [unlocked, setUnlocked] = useState(() => {
    try { return isCalUnlocked(); } catch { return false; }
  });

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  return <BJGTContent playerFed={playerFed} />;
}

function BJGTContent({ playerFed }: { playerFed?: string }) {
  const { fed: urlFed } = useParams<{ fed?: string }>();
  const fed = urlFed || playerFed || PLAYER_FED;
  const { data, loading, error } = usePlayerData(fed);
  const [tab, setTab] = useState<"analise" | "rivais">("analise");
  const [distPeriod, setDistPeriod] = useState<number>(12); // months: 3,6,9,12,0=all
  const [expandedPlayers, setExpandedPlayers] = useState<Set<number>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  /* ── Analysis ── */
  const A = useMemo(() => {
    if (!data) return null;

    const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const MONTH_MAP: Record<string,number> = { jan:0,fev:1,feb:1,mar:2,abr:3,apr:3,mai:4,may:4,jun:5,jul:6,ago:7,aug:7,set:8,sep:8,out:9,oct:9,nov:10,dez:11,dec:11 };
    /** Parse a round's date info into { key: "2025-06", label: "Jun 25" } */
    function toMonth(dateStr: string, dateSort: number): { key: string; label: string } {
      // Try date string first: "15 Jun 2024", "2024-06-15", "15/06/2024", etc.
      if (dateStr) {
        // Pattern: "DD Mon YYYY" or "DD-Mon-YYYY"
        const m1 = dateStr.match(/(\d{1,2})\s+(\w{3})\w*\s+(\d{4})/);
        if (m1) {
          const mi = MONTH_MAP[m1[2].toLowerCase()];
          if (mi != null) return { key: `${m1[3]}-${String(mi+1).padStart(2,"0")}`, label: `${MONTH_NAMES[mi]} ${m1[3].slice(2)}` };
        }
        // Pattern: "YYYY-MM-DD"
        const m2 = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (m2) {
          const mi = Number(m2[2]) - 1;
          if (mi >= 0 && mi < 12) return { key: `${m2[1]}-${m2[2]}`, label: `${MONTH_NAMES[mi]} ${m2[1].slice(2)}` };
        }
        // Pattern: "DD/MM/YYYY"
        const m3 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (m3) {
          const mi = Number(m3[2]) - 1;
          if (mi >= 0 && mi < 12) return { key: `${m3[3]}-${m3[2].padStart(2,"0")}`, label: `${MONTH_NAMES[mi]} ${m3[3].slice(2)}` };
        }
      }
      // dateSort is a millisecond timestamp (epoch) — use Date constructor
      if (dateSort > 9999999) {
        const d = new Date(dateSort);
        const yr = d.getFullYear();
        const mo = d.getMonth(); // 0-11
        if (yr >= 2000 && yr <= 2099) {
          return { key: `${yr}-${String(mo+1).padStart(2,"0")}`, label: `${MONTH_NAMES[mo]} ${String(yr).slice(2)}` };
        }
      }
      // Last fallback
      return { key: `unknown-${dateSort}`, label: `?` };
    }

    // 1) Find VP courses
    const vpCourses = data.DATA.filter(c => matchesCourse(c.course));
    if (!vpCourses.length) return { err: "no_course", courses: data.DATA.map(c => c.course) };

    // 2) All rounds (no year filter!)
    const allR: (RoundData & { crs: string })[] = [];
    for (const c of vpCourses) for (const r of c.rounds) allR.push({ ...r, crs: c.course });
    allR.sort((a, b) => b.dateSort - a.dateSort);

    // 3) Find HOLE_STATS for this course (try each VP course name as key)
    let hs: HoleStatsData | null = null;
    let hsKey = "";
    for (const c of vpCourses) {
      // HOLE_STATS is keyed by course name → tee key
      const courseStats = data.HOLE_STATS?.[c.course];
      if (courseStats) {
        // Pick first tee with data
        const firstTee = Object.values(courseStats)[0];
        if (firstTee) { hs = firstTee; hsKey = c.course; break; }
      }
      // Try normalized key too
      const nk = norm(c.course);
      for (const [k, v] of Object.entries(data.HOLE_STATS || {})) {
        if (norm(k) === nk || norm(k).includes("villa padierna") || norm(k).includes("flamingos")) {
          const firstTee = Object.values(v)[0];
          if (firstTee) { hs = firstTee; hsKey = k; break; }
        }
      }
      if (hs) break;
    }

    // 4) Scorecards from HOLES
    const cards: { r: typeof allR[0]; h: HoleScores }[] = [];
    for (const r of allR) {
      const h = data.HOLES?.[r.scoreId];
      if (h?.g && h.g.length >= 9) cards.push({ r, h });
    }

    // 5) Eclectic from EC
    let ecl: EclecticEntry | null = null;
    for (const c of vpCourses) {
      const courseEc = data.EC?.[c.course];
      if (courseEc?.length) { ecl = courseEc[0]; break; }
      // Try by normalized key
      for (const [k, v] of Object.entries(data.EC || {})) {
        if (norm(k).includes("villa padierna") || norm(k).includes("flamingos")) {
          if (v?.length) { ecl = v[0]; break; }
        }
      }
      if (ecl) break;
    }

    // 6) If no HOLE_STATS, compute from scorecards
    let computed: HoleStatsData | null = null;
    if (!hs && cards.length > 0) {
      const nH = cards[0].h.g.length >= 18 ? 18 : 9;
      const c18 = cards.filter(c => c.h.g.length >= nH);
      if (c18.length > 0) {
        const p0 = c18[0].h;
        const holes: HoleStatEntry[] = Array.from({ length: nH }, (_, i) => {
          const par = p0.p[i] ?? 4;
          const si = p0.si?.[i] ?? (i + 1);
          const sc: number[] = [];
          for (const c of c18) { const s = c.h.g[i]; if (s != null && s > 0) sc.push(s); }
          const n = sc.length;
          const avg = n > 0 ? sc.reduce((a, b) => a + b, 0) / n : undefined;
          const best = n > 0 ? Math.min(...sc) : undefined;
          const worst = n > 0 ? Math.max(...sc) : undefined;
          const strokesLost = avg != null ? Math.max(0, avg - par) : 0;
          const dist = {
            eagle: sc.filter(s => s <= par - 2).length, birdie: sc.filter(s => s === par - 1).length,
            par: sc.filter(s => s === par).length, bogey: sc.filter(s => s === par + 1).length,
            double: sc.filter(s => s === par + 2).length, triple: sc.filter(s => s >= par + 3).length,
          };
          return { h: i + 1, par, si, n, avg, best, worst, strokesLost, dist };
        });
        const totalDist = holes.reduce((a, h) => {
          const d = h.dist!;
          a.eagle += d.eagle; a.birdie += d.birdie; a.par += d.par;
          a.bogey += d.bogey; a.double += d.double; a.triple += d.triple;
          a.total += Object.values(d).reduce((s, v) => s + v, 0);
          return a;
        }, { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0, total: 0 });
        const totalPar = holes.reduce((s, h) => s + (h.par ?? 0), 0);
        const totalSL = holes.reduce((s, h) => s + (h.strokesLost ?? 0), 0);
        const grosses = c18.map(c => c.h.g.slice(0, nH).reduce((s: number, v) => s + (v ?? 0), 0)).filter(g => g > 0);
        const avgGross = grosses.length > 0 ? grosses.reduce((a, b) => a + b, 0) / grosses.length : null;
        const bestRound = grosses.length > 0 ? { gross: Math.min(...grosses), date: "" } : null;

        // byParType
        const byParType: HoleStatsData["byParType"] = {};
        for (const pt of [3, 4, 5]) {
          const pH = holes.filter(h => h.par === pt);
          if (!pH.length) continue;
          const wA = pH.filter(h => h.avg != null);
          const avgVP = wA.length ? wA.reduce((s, h) => s + (h.avg! - h.par!), 0) / wA.length : null;
          const slR = wA.reduce((s, h) => s + (h.strokesLost ?? 0), 0);
          const tot = wA.reduce((s, h) => s + Object.values(h.dist!).reduce((a, b) => a + b, 0), 0);
          const pob = wA.reduce((s, h) => s + (h.dist!.eagle + h.dist!.birdie + h.dist!.par), 0);
          const dblW = wA.reduce((s, h) => s + (h.dist!.double + h.dist!.triple), 0);
          const dist = wA.reduce((a, h) => {
            const d = h.dist!; a.eagle += d.eagle; a.birdie += d.birdie; a.par += d.par;
            a.bogey += d.bogey; a.double += d.double; a.triple += d.triple; return a;
          }, { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0 });
          byParType[String(pt)] = {
            par: pt, holes: pH, totalN: tot, avg: null,
            avgVsPar: avgVP, strokesLostPerRound: slR, nHoles: pH.length,
            parOrBetterPct: tot > 0 ? pob / tot * 100 : 0,
            doubleOrWorsePct: tot > 0 ? dblW / tot * 100 : 0,
            dist,
          };
        }

        const f9h = holes.slice(0, 9);
        const b9h = nH >= 18 ? holes.slice(9, 18) : [];
        const f9sl = f9h.reduce((s, h) => s + (h.strokesLost ?? 0), 0);
        const b9sl = b9h.reduce((s, h) => s + (h.strokesLost ?? 0), 0);
        const f9p = f9h.reduce((s, h) => s + (h.par ?? 0), 0);
        const b9p = b9h.reduce((s, h) => s + (h.par ?? 0), 0);
        const f9dbl = f9h.reduce((s, h) => s + (h.dist?.double ?? 0) + (h.dist?.triple ?? 0), 0);
        const b9dbl = b9h.reduce((s, h) => s + (h.dist?.double ?? 0) + (h.dist?.triple ?? 0), 0);
        const f9tot = f9h.reduce((s, h) => s + Object.values(h.dist!).reduce((a, b) => a + b, 0), 0);
        const b9tot = b9h.reduce((s, h) => s + Object.values(h.dist!).reduce((a, b) => a + b, 0), 0);

        computed = {
          teeName: cards[0].r.tee || "", teeKey: "", holeCount: nH, nRounds: c18.length,
          holes, totalDist, totalPar, totalStrokesLost: totalSL, byParType,
          f9b9: nH >= 18 ? {
            f9: { strokesLost: f9sl, par: f9p, dblPct: f9tot > 0 ? f9dbl / f9tot * 100 : 0 },
            b9: { strokesLost: b9sl, par: b9p, dblPct: b9tot > 0 ? b9dbl / b9tot * 100 : 0 },
          } : null,
          bestRound, worstRound: null, avgGross, trend: null,
        };
      }
    }

    const stats = hs || computed;
    if (!stats) return { err: "no_stats", courses: vpCourses.map(c => c.course), nRounds: allR.length, nCards: cards.length, hsKeys: Object.keys(data.HOLE_STATS || {}) };

    // 7) ALL 18-hole rounds with details
    type FullRound = { sd: number; ds: number; gross: number; par: number; course: string; meters: number | null; date: string; scoreId: string };
    const allTR: FullRound[] = [];
    for (const c of data.DATA) for (const r of c.rounds) {
      if (r.holeCount === 18 && r.gross != null && Number(r.gross) > 50 && r.sd != null)
        allTR.push({ sd: Number(r.sd), ds: r.dateSort, gross: Number(r.gross), par: r.par ? Number(r.par) : 72, course: c.course, meters: r.meters != null ? Number(r.meters) : null, date: r.date || "", scoreId: r.scoreId });
    }
    allTR.sort((a, b) => b.ds - a.ds);
    const hcp = data.HCP_INFO?.current != null ? Number(data.HCP_INFO.current) : null;
    const avgOf = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    // 8) VP HOLE PROFILE — par, meters, SI for each VP hole
    const nH = cards.length > 0 && cards[0].h.g.length >= 18 ? 18 : 9;
    const vpCards = cards.filter(c => c.h.g.length >= nH).slice(0, 5);
    const parArr = vpCards.length > 0 ? vpCards[0].h.p.slice(0, nH) : [];
    const siArr = vpCards.length > 0 ? vpCards[0].h.si?.slice(0, nH) ?? [] : [];
    const vpMeters = vpCards.length > 0 ? (vpCards[0].h.m?.slice(0, nH) ?? []) : [];

    // 9) CROSS-COURSE ANALYSIS: every hole from every recent scorecard
    type HoleSample = { par: number; meters: number | null; gross: number; ds: number; course: string };
    const allHoleSamples: HoleSample[] = [];
    // Collect from ALL scorecards (not just VP)
    for (const c of data.DATA) {
      for (const r of c.rounds) {
        if (r.holeCount !== 18) continue;
        const h = data.HOLES?.[r.scoreId];
        if (!h?.g || h.g.length < 18) continue;
        for (let i = 0; i < 18; i++) {
          const g = h.g[i], p = h.p[i], m = h.m?.[i] ?? null;
          if (g != null && g > 0 && p != null && p >= 3 && p <= 5) {
            allHoleSamples.push({ par: p, meters: m != null ? Number(m) : null, gross: g, ds: r.dateSort, course: c.course });
          }
        }
      }
    }

    // Group by par + distance band
    type DistBand = { key: string; label: string; par: number; minM: number; maxM: number; samples: HoleSample[]; avg: number; pobPct: number; dblPct: number; n: number };
    const bands: DistBand[] = [];
    const bandDefs = [
      { par: 3, minM: 0, maxM: 130, label: "Par 3 curto (<130m)" },
      { par: 3, minM: 130, maxM: 160, label: "Par 3 médio (130–160m)" },
      { par: 3, minM: 160, maxM: 999, label: "Par 3 longo (160m+)" },
      { par: 4, minM: 0, maxM: 300, label: "Par 4 curto (<300m)" },
      { par: 4, minM: 300, maxM: 350, label: "Par 4 médio (300–350m)" },
      { par: 4, minM: 350, maxM: 999, label: "Par 4 longo (350m+)" },
      { par: 5, minM: 0, maxM: 450, label: "Par 5 curto (<450m)" },
      { par: 5, minM: 450, maxM: 999, label: "Par 5 longo (450m+)" },
    ];
    for (const bd of bandDefs) {
      const s = allHoleSamples.filter(h => h.par === bd.par && h.meters != null && h.meters >= bd.minM && h.meters < bd.maxM);
      if (s.length < 3) continue;
      const avg = s.reduce((a, b) => a + b.gross, 0) / s.length;
      const pob = s.filter(h => h.gross <= h.par).length / s.length * 100;
      const dbl = s.filter(h => h.gross >= h.par + 2).length / s.length * 100;
      bands.push({ key: `${bd.par}-${bd.minM}`, label: bd.label, par: bd.par, minM: bd.minM, maxM: bd.maxM, samples: s, avg, pobPct: pob, dblPct: dbl, n: s.length });
    }

    // 10) VP HOLE → CROSS-REFERENCE: for each VP hole, find matching band
    type VPHoleProfile = { h: number; par: number; meters: number | null; si: number | null; eclBest: number | null; vpScores: number[]; vpAvg: number; band: DistBand | null; recentAvg: number | null; improving: boolean | null };
    const vpHoleProfiles: VPHoleProfile[] = [];
    for (let i = 0; i < nH; i++) {
      const par = parArr[i] ?? 4;
      const m = vpMeters[i] != null ? Number(vpMeters[i]) : null;
      const si = siArr[i] != null ? Number(siArr[i]) : null;
      const eclBest = ecl?.holes?.[i]?.best ?? null;
      const vpScores = vpCards.map(c => c.h.g[i]).filter((s): s is number => s != null && s > 0);
      const vpAvg = vpScores.length > 0 ? vpScores.reduce((a, b) => a + b, 0) / vpScores.length : par;
      // Find matching distance band
      let band: DistBand | null = null;
      if (m != null) {
        band = bands.find(b => b.par === par && m >= b.minM && m < b.maxM) ?? null;
      }
      // Recent improvement: compare last 3 months vs older samples in same band
      let recentAvg: number | null = null;
      let improving: boolean | null = null;
      if (band && band.samples.length >= 6) {
        const sorted = [...band.samples].sort((a, b) => b.ds - a.ds);
        const recent = sorted.slice(0, Math.ceil(sorted.length / 2));
        const older = sorted.slice(Math.ceil(sorted.length / 2));
        const rAvg = recent.reduce((a, b) => a + b.gross, 0) / recent.length;
        const oAvg = older.reduce((a, b) => a + b.gross, 0) / older.length;
        recentAvg = rAvg;
        improving = rAvg < oAvg - 0.2;
      }
      vpHoleProfiles.push({ h: i + 1, par, meters: m, si, eclBest, vpScores, vpAvg, band, recentAvg, improving });
    }

    // 11) DISTANCE EVOLUTION: course meters over time + gross
    type DistPoint = { ds: number; date: string; meters: number; gross: number; course: string };
    const distEvolution: DistPoint[] = allTR
      .filter(r => r.meters != null && r.meters > 3000)
      .map(r => ({ ds: r.ds, date: r.date, meters: r.meters!, gross: r.gross, course: r.course }))
      .sort((a, b) => a.ds - b.ds);
    // Average meters first half vs second half
    let metersGrowing: boolean | null = null;
    let metersDiff: number | null = null;
    if (distEvolution.length >= 6) {
      const half = Math.ceil(distEvolution.length / 2);
      const firstHalf = distEvolution.slice(0, half);
      const secondHalf = distEvolution.slice(half);
      const avgFirst = firstHalf.reduce((a, b) => a + b.meters, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((a, b) => a + b.meters, 0) / secondHalf.length;
      metersDiff = avgSecond - avgFirst;
      metersGrowing = metersDiff > 50;
    }
    // Average gross for short vs long courses
    const medianMeters = distEvolution.length > 0 ? [...distEvolution].sort((a, b) => a.meters - b.meters)[Math.floor(distEvolution.length / 2)].meters : 0;
    const shortCourses = distEvolution.filter(r => r.meters < medianMeters);
    const longCourses = distEvolution.filter(r => r.meters >= medianMeters);
    const avgGrossShort = shortCourses.length > 0 ? shortCourses.reduce((a, b) => a + b.gross, 0) / shortCourses.length : null;
    const avgGrossLong = longCourses.length > 0 ? longCourses.reduce((a, b) => a + b.gross, 0) / longCourses.length : null;

    // 12) VP DAY-BY-DAY & PATTERNS (keep existing)
    type HolePattern = { h: number; par: number; scores: number[]; avg: number; best: number; worst: number; variance: number; dblCount: number; parOrBetter: number; isTrap: boolean; isStrength: boolean };
    const holePatterns: HolePattern[] = [];
    for (let i = 0; i < nH; i++) {
      const par = parArr[i] ?? 4;
      const scores = vpCards.map(c => c.h.g[i]).filter((s): s is number => s != null && s > 0);
      if (scores.length === 0) continue;
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const best = Math.min(...scores);
      const worst = Math.max(...scores);
      const variance = scores.length >= 2 ? Math.sqrt(scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length) : 0;
      const dblCount = scores.filter(s => s >= par + 2).length;
      const parOrBetter = scores.filter(s => s <= par).length;
      const isTrap = dblCount >= 2 || (scores.length >= 2 && avg >= par + 1.5);
      const isStrength = parOrBetter >= Math.ceil(scores.length * 0.5) && avg <= par + 0.5;
      holePatterns.push({ h: i + 1, par, scores, avg, best, worst, variance, dblCount, parOrBetter, isTrap, isStrength });
    }
    const trapHoles = holePatterns.filter(h => h.isTrap).sort((a, b) => (b.avg - b.par) - (a.avg - a.par));
    const strongHoles = holePatterns.filter(h => h.isStrength).sort((a, b) => (a.avg - a.par) - (b.avg - b.par));
    const volatileHoles = holePatterns.filter(h => h.variance >= 1.2 && !h.isTrap).sort((a, b) => b.variance - a.variance);

    type DaySummary = { idx: number; date: string; gross: number; f9: number; b9: number; doubles: number; pars: number; birdies: number };
    const daySummaries: DaySummary[] = vpCards.map((c, idx) => {
      const g = c.h.g.slice(0, nH);
      const p = c.h.p.slice(0, nH);
      const gross = g.reduce((a: number, b) => a + (b ?? 0), 0);
      const f9 = g.slice(0, 9).reduce((a: number, b) => a + (b ?? 0), 0);
      const b9 = nH >= 18 ? g.slice(9, 18).reduce((a: number, b) => a + (b ?? 0), 0) : 0;
      let doubles = 0, pars = 0, birdies = 0;
      for (let i = 0; i < nH; i++) {
        const s = g[i], par = p[i] ?? 4;
        if (s != null && s > 0) { if (s >= par + 2) doubles++; if (s <= par) pars++; if (s < par) birdies++; }
      }
      return { idx: idx + 1, date: c.r.date?.substring(0, 5) || "", gross, f9, b9, doubles, pars, birdies };
    });
    const bestDay = daySummaries.length > 0 ? daySummaries.reduce((a, b) => a.gross < b.gross ? a : b) : null;
    const worstDay = daySummaries.length > 0 ? daySummaries.reduce((a, b) => a.gross > b.gross ? a : b) : null;
    const f9avg = avgOf(daySummaries.map(d => d.f9));
    const b9avg = avgOf(daySummaries.map(d => d.b9));
    const f9par = parArr.slice(0, 9).reduce((a, b) => a + (b ?? 0), 0);
    const b9par = nH >= 18 ? parArr.slice(9, 18).reduce((a, b) => a + (b ?? 0), 0) : 0;

    // Recovery after double
    let goodRecovery = 0, badRecovery = 0, totalRecovery = 0;
    for (const c of vpCards) {
      const g = c.h.g.slice(0, nH); const p = c.h.p.slice(0, nH);
      for (let i = 0; i < nH - 1; i++) {
        const s = g[i], par = p[i] ?? 4, next = g[i + 1], nextPar = p[i + 1] ?? 4;
        if (s != null && s >= par + 2 && next != null && next > 0) { totalRecovery++; if (next <= nextPar + 1) goodRecovery++; else badRecovery++; }
      }
    }
    const recoveryRate = totalRecovery > 0 ? goodRecovery / totalRecovery * 100 : null;

    // 13) MONTHLY STATS — group all rounds by month for temporal analysis
    type RoundDetail = { ds: number; month: string; gross: number; par: number; course: string;
      f9: number; b9: number; nDbl: number; nHoles: number; nPob: number;
      p3sum: number; p3n: number; p4sum: number; p4n: number; p5sum: number; p5n: number };
    const roundDetails: RoundDetail[] = [];
    for (const tr of allTR) {
      const h = data.HOLES?.[tr.scoreId];
      if (!h?.g || h.g.length < 18) continue;
      let f9 = 0, b9 = 0, nDbl = 0, nPob = 0, nHoles = 0;
      let p3sum = 0, p3n = 0, p4sum = 0, p4n = 0, p5sum = 0, p5n = 0;
      for (let i = 0; i < 18; i++) {
        const g = h.g[i], p = h.p[i] ?? 4;
        if (g == null || g <= 0) continue;
        nHoles++;
        if (i < 9) f9 += g; else b9 += g;
        if (g >= p + 2) nDbl++;
        if (g <= p) nPob++;
        if (p === 3) { p3sum += g; p3n++; }
        else if (p === 4) { p4sum += g; p4n++; }
        else if (p === 5) { p5sum += g; p5n++; }
      }
      // month from date string or dateSort
      const { key: month } = toMonth(tr.date, tr.ds);
      roundDetails.push({ ds: tr.ds, month, gross: tr.gross, par: tr.par, course: tr.course,
        f9, b9, nDbl, nHoles, nPob, p3sum, p3n, p4sum, p4n, p5sum, p5n });
    }
    roundDetails.sort((a, b) => a.ds - b.ds);

    type MonthBucket = { month: string; label: string; rounds: number;
      avgGross: number; avgVsPar: number; dblPct: number; pobPct: number;
      p3Avg: number | null; p4Avg: number | null; p5Avg: number | null;
      f9Avg: number; b9Avg: number; bestGross: number; worstGross: number };
    const monthMap = new Map<string, RoundDetail[]>();
    for (const r of roundDetails) {
      if (!monthMap.has(r.month)) monthMap.set(r.month, []);
      monthMap.get(r.month)!.push(r);
    }
    const monthlyStats: MonthBucket[] = [];
    for (const [month, rds] of Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const n = rds.length;
      const avgGross = rds.reduce((s, r) => s + r.gross, 0) / n;
      const avgVsPar = rds.reduce((s, r) => s + (r.gross - r.par), 0) / n;
      const totalHoles = rds.reduce((s, r) => s + r.nHoles, 0);
      const totalDbl = rds.reduce((s, r) => s + r.nDbl, 0);
      const totalPob = rds.reduce((s, r) => s + r.nPob, 0);
      const tp3n = rds.reduce((s, r) => s + r.p3n, 0);
      const tp4n = rds.reduce((s, r) => s + r.p4n, 0);
      const tp5n = rds.reduce((s, r) => s + r.p5n, 0);
      const [y, mo] = month.split("-");
      const moIdx = Number(mo) - 1;
      const label = moIdx >= 0 && moIdx < 12 ? `${MONTH_NAMES[moIdx]} ${y.slice(2)}` : `${y.slice(2)}/${mo}`;
      monthlyStats.push({
        month, label, rounds: n,
        avgGross, avgVsPar,
        dblPct: totalHoles > 0 ? totalDbl / totalHoles * 100 : 0,
        pobPct: totalHoles > 0 ? totalPob / totalHoles * 100 : 0,
        p3Avg: tp3n > 0 ? rds.reduce((s, r) => s + r.p3sum, 0) / tp3n : null,
        p4Avg: tp4n > 0 ? rds.reduce((s, r) => s + r.p4sum, 0) / tp4n : null,
        p5Avg: tp5n > 0 ? rds.reduce((s, r) => s + r.p5sum, 0) / tp5n : null,
        f9Avg: rds.reduce((s, r) => s + r.f9, 0) / n,
        b9Avg: rds.reduce((s, r) => s + r.b9, 0) / n,
        bestGross: Math.min(...rds.map(r => r.gross)),
        worstGross: Math.max(...rds.map(r => r.gross)),
      });
    }

    // 14) COACHING DEVELOPMENT INDICATORS
    type CoachRound = {
      ds: number; month: string; gross: number; par: number; sd: number | null;
      grossSD: number; birdies: number; pobStreak: number; first3vp: number; last3vp: number;
      bounceGood: number; bounceTotal: number; nDbl: number; nTriple: number; nPob: number; nHoles: number;
    };
    const coachRounds: CoachRound[] = [];
    for (const tr of allTR) {
      const h = data.HOLES?.[tr.scoreId];
      if (!h?.g || h.g.length < 18) continue;
      const { key: month } = toMonth(tr.date, tr.ds);
      let birdies = 0, nDbl = 0, nTriple = 0, nPob = 0, nHoles = 0;
      let streak = 0, maxStreak = 0;
      let first3vp = 0, last3vp = 0;
      let bounceGood = 0, bounceTotal = 0;
      const scores: number[] = [];
      for (let i = 0; i < 18; i++) {
        const g = h.g[i], p = h.p[i] ?? 4;
        if (g == null || g <= 0) continue;
        nHoles++;
        scores.push(g);
        const diff = g - p;
        if (diff <= -1) birdies++;
        if (diff >= 2) nDbl++;
        if (diff >= 3) nTriple++;
        if (diff <= 0) { nPob++; streak++; maxStreak = Math.max(maxStreak, streak); } else { streak = 0; }
        if (i < 3) first3vp += diff;
        if (i >= 15) last3vp += diff;
        // Bounce-back: if previous was double+, check this hole
        if (i > 0) {
          const pg = h.g[i - 1], pp = h.p[i - 1] ?? 4;
          if (pg != null && pg >= pp + 2) {
            bounceTotal++;
            if (g <= p) bounceGood++;
          }
        }
      }
      // Gross standard deviation
      const gMean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const gVar = scores.reduce((a, b) => a + (b - gMean) ** 2, 0) / scores.length;
      const grossSD = Math.sqrt(gVar);
      // SD from original data
      const origR = allR.find(r => r.scoreId === tr.scoreId);
      const sd = origR?.sd != null ? Number(origR.sd) : (tr.sd != null ? Number(tr.sd) : null);
      coachRounds.push({ ds: tr.ds, month, gross: tr.gross, par: tr.par, sd,
        grossSD, birdies, pobStreak: maxStreak, first3vp, last3vp,
        bounceGood, bounceTotal, nDbl, nTriple, nPob, nHoles });
    }
    coachRounds.sort((a, b) => a.ds - b.ds);

    // Aggregate coaching monthly
    type CoachMonth = {
      month: string; label: string; n: number;
      avgGross: number; grossStdDev: number; bestVsAvgGap: number;
      birdieRate: number; pobPct: number; dblRate: number; tripleRate: number;
      avgPobStreak: number; bounceRate: number | null;
      first3Avg: number; last3Avg: number;
      avgSD: number | null; bestSD: number | null;
      avgIntraSD: number; // avg within-round score SD (consistency per hole)
    };
    const cMonthMap = new Map<string, CoachRound[]>();
    for (const r of coachRounds) {
      if (!cMonthMap.has(r.month)) cMonthMap.set(r.month, []);
      cMonthMap.get(r.month)!.push(r);
    }
    const coachMonthly: CoachMonth[] = [];
    for (const [month, rds] of Array.from(cMonthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const n = rds.length;
      const avG = rds.reduce((s, r) => s + r.gross, 0) / n;
      const bestG = Math.min(...rds.map(r => r.gross));
      const grossArr = rds.map(r => r.gross);
      const mean = avG;
      const variance = grossArr.reduce((s, g) => s + (g - mean) ** 2, 0) / n;
      const grossStdDev = n >= 2 ? Math.sqrt(variance) : 0;
      const totH = rds.reduce((s, r) => s + r.nHoles, 0);
      const totB = rds.reduce((s, r) => s + r.birdies, 0);
      const totDbl = rds.reduce((s, r) => s + r.nDbl, 0);
      const totTrip = rds.reduce((s, r) => s + r.nTriple, 0);
      const totPob = rds.reduce((s, r) => s + r.nPob, 0);
      const totBounceG = rds.reduce((s, r) => s + r.bounceGood, 0);
      const totBounceT = rds.reduce((s, r) => s + r.bounceTotal, 0);
      const sds = rds.filter(r => r.sd != null).map(r => r.sd!);
      const [yc, mc] = month.split("-");
      const mcIdx = Number(mc) - 1;
      const cLabel = mcIdx >= 0 && mcIdx < 12 ? `${MONTH_NAMES[mcIdx]} ${yc.slice(2)}` : `${yc.slice(2)}/${mc}`;
      coachMonthly.push({
        month, label: cLabel, n,
        avgGross: avG, grossStdDev, bestVsAvgGap: avG - bestG,
        birdieRate: totH > 0 ? totB / totH * 100 : 0,
        pobPct: totH > 0 ? totPob / totH * 100 : 0,
        dblRate: totH > 0 ? totDbl / totH * 100 : 0,
        tripleRate: totH > 0 ? totTrip / totH * 100 : 0,
        avgPobStreak: rds.reduce((s, r) => s + r.pobStreak, 0) / n,
        bounceRate: totBounceT > 0 ? totBounceG / totBounceT * 100 : null,
        first3Avg: rds.reduce((s, r) => s + r.first3vp, 0) / n,
        last3Avg: rds.reduce((s, r) => s + r.last3vp, 0) / n,
        avgSD: sds.length > 0 ? sds.reduce((a, b) => a + b, 0) / sds.length : null,
        bestSD: sds.length > 0 ? Math.min(...sds) : null,
        avgIntraSD: rds.reduce((s, r) => s + r.grossSD, 0) / n,
      });
    }

    return { stats, cards, ecl, allR, hcp, holePatterns, trapHoles, strongHoles, volatileHoles, daySummaries, bestDay, worstDay, f9avg, b9avg, f9par, b9par, recoveryRate, goodRecovery, badRecovery, totalRecovery, vpCards, nH, parArr, vpHoleProfiles, bands, bandDefs, distEvolution, metersGrowing, metersDiff, avgGrossShort, avgGrossLong, medianMeters, allHoleSamples, monthlyStats, roundDetails, coachMonthly, coachRounds };
  }, [data]);

  /* ── Filtered distance bands by period (must be before early returns!) ── */
  const filteredBandsResult = useMemo(() => {
    if (!A || "err" in A) return { filteredBands: [] as FilteredBand[], filteredN: 0, periodLabel: "all-time" };
    const { allHoleSamples: ahs, bandDefs: bd, bands: b } = A as { allHoleSamples: HoleSample[]; bandDefs: BandDef[]; bands: FilteredBand[] };
    if (!ahs || !bd) return { filteredBands: [] as FilteredBand[], filteredN: 0, periodLabel: "all-time" };
    if (distPeriod === 0) return { filteredBands: b, filteredN: ahs.length, periodLabel: "all-time" };
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - distPeriod, now.getDate()).getTime();
    const filtered = ahs.filter((h: HoleSample) => h.ds >= cutoff);
    const fb: FilteredBand[] = [];
    for (const bdef of bd) {
      const s = filtered.filter((h: HoleSample) => h.par === bdef.par && h.meters != null && h.meters >= bdef.minM && h.meters < bdef.maxM);
      if (s.length < 3) continue;
      const avg = s.reduce((a: number, b: HoleSample) => a + b.gross, 0) / s.length;
      const pob = s.filter((h: HoleSample) => h.gross <= bdef.par).length / s.length * 100;
      const dbl = s.filter((h: HoleSample) => h.gross >= bdef.par + 2).length / s.length * 100;
      fb.push({ key: `${bdef.par}-${bdef.minM}`, label: bdef.label, par: bdef.par, minM: bdef.minM, maxM: bdef.maxM, samples: s, avg, pobPct: pob, dblPct: dbl, n: s.length });
    }
    return { filteredBands: fb, filteredN: filtered.length, periodLabel: `${distPeriod}m` };
  }, [A, distPeriod]);

  /* ── Period-filtered monthly & coach data (must be before early returns!) ── */
  const filteredMonthly = useMemo(() => {
    if (!A || "err" in A) return [];
    const ms = (A as { monthlyStats: MonthStat[] }).monthlyStats;
    if (!ms) return [];
    if (distPeriod === 0) return ms;
    return ms.slice(-distPeriod);
  }, [A, distPeriod]);

  const filteredCoach = useMemo(() => {
    if (!A || "err" in A) return [];
    const cm = (A as { coachMonthly: CoachMonth[] }).coachMonthly;
    if (!cm) return [];
    if (distPeriod === 0) return cm;
    return cm.slice(-distPeriod);
  }, [A, distPeriod]);

  /* ═══ RENDER ═══ */
  if (loading) return (
    <div className="tourn-layout">
      <div className="toolbar"><div className="toolbar-left"><span className="tourn-toolbar-title">🇪🇸 BJGT</span></div></div>
      <div className="master-detail"><div className="course-detail empty-state-lg">
        <LoadingState size="lg" icon="🏌️" message="A carregar dados…" />
      </div></div>
    </div>
  );
  if (error) return (
    <div className="tourn-layout">
      <div className="toolbar"><div className="toolbar-left"><span className="tourn-toolbar-title">🇪🇸 BJGT</span></div></div>
      <div className="master-detail"><div className="course-detail">
        <div className="courseAnalysis empty-state"><div className="empty-icon">⚠️</div><div className="fw-700-dc">Erro: {error}</div></div>
      </div></div>
    </div>
  );
  if (!A || "err" in A) {
    const info = A as { err?: string; courses?: string[]; nRounds?: number; nCards?: number; hsKeys?: string[] };
    return (
      <div className="tourn-layout">
        <div className="toolbar"><div className="toolbar-left"><span className="tourn-toolbar-title">🇪🇸 BJGT</span></div></div>
        <div className="master-detail"><div className="course-detail">
          <div className="courseAnalysis empty-state">
            <div className="empty-icon-lg">🔍</div>
            <div className="fw-700-text2-mb8">
              {info?.err === "no_course" ? "Sem campo Villa Padierna nos dados" : "Sem estatísticas de buracos disponíveis"}
            </div>
            <div className="muted fs-11-lh16">
              {info?.err === "no_stats" && <>
                <div>Campo encontrado: {info.courses?.join(", ")}</div>
                <div>Rondas: {info.nRounds} · Scorecards: {info.nCards}</div>
                <div>HOLE_STATS keys: {info.hsKeys?.join(", ") || "nenhum"}</div>
              </>}
              {info?.err === "no_course" && <>Campos disponíveis: {info.courses?.join(", ") || "nenhum"}</>}
            </div>
          </div>
        </div></div>
      </div>
    );
  }

  const { stats, cards, ecl, allR, hcp, holePatterns, trapHoles, strongHoles, volatileHoles, daySummaries, bestDay, worstDay, f9avg, b9avg, f9par, b9par, recoveryRate, goodRecovery, badRecovery, totalRecovery, vpCards, nH, parArr, vpHoleProfiles, bands, bandDefs, distEvolution, metersGrowing, metersDiff, avgGrossShort, avgGrossLong, medianMeters, allHoleSamples, monthlyStats, roundDetails, coachMonthly, coachRounds } = A;
  const S = stats;
  const tp = S.totalPar;
  const pobN = S.totalDist.eagle + S.totalDist.birdie + S.totalDist.par;
  const dowN = S.totalDist.double + S.totalDist.triple;
  const totN = S.totalDist.total || (pobN + S.totalDist.bogey + dowN);
  const pobP = totN > 0 ? pobN / totN * 100 : 0;
  const dowP = totN > 0 ? dowN / totN * 100 : 0;
  const worstPT = Object.values(S.byParType).length > 1
    ? Object.values(S.byParType).reduce((a, b) => (b.avgVsPar ?? 0) > (a.avgVsPar ?? 0) ? b : a) : null;

  const { filteredBands, filteredN } = filteredBandsResult;

  return (
    <div className="tourn-layout">
      <style>{`
        .bjgt-chart-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .bjgt-chart-scroll > div { min-width: 320px; }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="toolbar">
        <div className="toolbar-left">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)} title={sidebarOpen ? "Fechar painel" : "Abrir painel"}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <span className="tourn-toolbar-title">🇪🇸 BJGT</span>
          <span className="tourn-toolbar-meta">📍 {TOURN.location}</span>
          <span className="tourn-toolbar-meta">📅 {TOURN.dates}</span>
          <span className="tourn-toolbar-meta">🏷️ {PLAYER_NAME} · Sub-12</span>
          <div className="tourn-toolbar-sep" />
          <div className="escalao-pills">
            {([["analise", "Análise VP"], ["rivais", "Rivais"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k as "analise" | "rivais")}
                className={`tourn-tab tourn-tab-sm${tab === k ? " active" : ""}`}>
                {l}
              </button>
            ))}
          </div>
          {tab === "analise" && <>
            <div className="tourn-toolbar-sep" />
            <div className="escalao-pills">
              {[3, 6, 9, 12, 0].map(m => (
                <button key={m} onClick={() => setDistPeriod(m)}
                  className={`filter-pill${distPeriod === m ? " active" : ""}`}
                  className="fs-10">
                  {m === 0 ? "All" : `${m}m`}
                </button>
              ))}
            </div>
          </>}
        </div>
        <div className="toolbar-right">
          <span className="chip">{FIELD_2025.nPlayers} field · {TOURN.days} dias</span>
        </div>
      </div>

      {/* ── Master-detail ── */}
      <div className="master-detail">
        {/* Sidebar: Field 2025 players */}
        <div className={`sidebar${sidebarOpen ? "" : " sidebar-closed"}`}>
          <div className="sidebar-section-title">
            Field 2025 — Sub-12
          </div>
          {FIELD_2025.leaderboard.map(p => (
            <button key={p.pos} className={`course-item${selectedPlayer === p.name ? " active" : ""}`}
              onClick={() => setSelectedPlayer(prev => prev === p.name ? null : p.name)}>
              <div className="course-item-name">
                <span style={{ minWidth: 22, color: p.pos <= 3 ? "var(--color-warn-dark)" : "var(--text-3)", fontWeight: 800, fontSize: 11 }}>{p.pos}.</span>
                {p.country} {firstName(p.name)}
              </div>
              <div className="course-item-meta">
                {p.rounds.join("-")} = {p.total} ({p.result > 0 ? `+${p.result}` : p.result})
              </div>
            </button>
          ))}
        </div>

        {/* Detail: content */}
        <div className="course-detail">

      {/* ═══ PLAYER DETAIL (from sidebar click) ═══ */}
      {selectedPlayer && (
        <FieldPlayerDetail playerName={selectedPlayer} onBack={() => setSelectedPlayer(null)} />
      )}

      {/* ═══ TAB: RIVAIS ═══ */}
      {!selectedPlayer && tab === "rivais" && <RivaisDashboard onSelectPlayer={setSelectedPlayer} />}

      {/* ═══ TAB: ANÁLISE VP ═══ */}
      {!selectedPlayer && tab === "analise" && <>

      {/* ── Objectivo: O Eclético ── */}
      {ecl && (
        <div className="courseAnalysis courseAnalysis-success">
 <div className="caTitle fs-14 c-good-dark-inline" >🎯 Objectivo: bater o eclético</div>
 <div className="caConcText mb-10 c-good-darker" >
            O ano passado fizeste <b>{daySummaries.map(d => d.gross).join(", ")}</b>. O eclético — o melhor que fizeste em cada buraco, espalhado nos {vpCards.length} dias — é <b>{ecl.totalGross}</b> ({fmtToPar(ecl.toPar ?? ecl.totalGross - tp)}).
            Com mais um ano de força, maturidade e experiência, o objectivo é juntar tudo isso e aproximar-te desse número.
          </div>
          <div className="objective-card">
            <div className="fs-10-fw700-op07">
              Objectivo por ronda
            </div>
 <div className="d-flex gap-10 mt-4 ai-baseline" >
 <span className="fw-900 fs-26">{ecl.totalGross}–{bestDay ? bestDay.gross : Math.round((ecl.totalGross + tp + 15) / 2)}</span>
 <span className="fs-12 op-8">({fmtToPar(ecl.toPar ?? ecl.totalGross - tp)} a {fmtToPar(bestDay ? bestDay.gross - tp : 15)})</span>
            </div>
            <div className="fs-10-op6 mt-4">
              Eclético → Melhor dia 2025{hcp != null ? ` · HCP actual: ${hcp.toFixed(1)}` : ""}
            </div>
          </div>
        </div>
      )}

      {/* ── O Field 2025 ── */}
      <div className="holeAnalysis">
        <div className="haTitle">🏆 O Field 2025 — Quem Jogou e Como</div>
        <div className="haDiag mb-10">
          <div className="haDiagCard">
            <div className="haDiagIcon diag-warn">🥇</div>
            <div className="haDiagBody">
              <div className="haDiagVal c-eagle">{FIELD_2025.winner.total}</div>
              <div className="haDiagLbl">{FIELD_2025.winner.name} ({fmtToPar(FIELD_2025.winner.result)})</div>
            </div>
          </div>
          <div className="haDiagCard">
            <div className="haDiagIcon diag-good">🏅</div>
            <div className="haDiagBody">
              <div className="haDiagVal c-par-ok">{FIELD_2025.top5Avg.toFixed(0)}</div>
              <div className="haDiagLbl">média Top 5 por ronda</div>
            </div>
          </div>
          <div className="haDiagCard">
            <div className="haDiagIcon diag-info">📊</div>
            <div className="haDiagBody">
              <div className="haDiagVal c-blue">{FIELD_2025.fieldAvg.toFixed(0)}</div>
              <div className="haDiagLbl">média field ({FIELD_2025.nPlayers} jogadores)</div>
            </div>
          </div>
        </div>
        {/* Mini leaderboard */}
        <div className="grid-auto-fill">
          {FIELD_2025.leaderboard.slice(0, 5).map(p => (
 <div key={p.pos} className="flex-center-gap6 card-detail br-default" style={{ padding: "5px 8px" }}>
              <span className="fw-900-fs13-muted">{p.pos}.</span>
              <div>
                <div className="fs-10-fw700-lh">{firstName(p.name)}</div>
 <div className="c-text-3 fs-10" >{p.rounds.join("-")} = {p.total} ({fmtToPar(p.result)})</div>
              </div>
            </div>
          ))}
        </div>

        {/* Full results table with expandable scorecards */}
        <div className="muted fs-9-mb4">Clica num jogador para ver os scorecards completos e o eclético.</div>
        <div className="tourn-scroll mb-8">
          <table className="sc-table-modern bjgt-mini-table-sm">
            <thead>
              <tr>
                <th className="sc-cell-w28 ta-c">Pos</th>
                <th className="row-label">Jogador</th>
                <th style={{ width: 24 }} className="ta-c"></th>
                <th className="ta-c">R1</th>
                <th className="ta-c">R2</th>
                <th className="ta-c">R3</th>
                <th className="ta-c fw-900">Total</th>
                <th className="ta-c">vs Par</th>
                <th className="ta-c">Melhor</th>
                <th className="ta-c">ECL</th>
              </tr>
            </thead>
            <tbody>
              {FIELD_2025.leaderboard.map((p) => {
                const expanded = expandedPlayers.has(p.pos);
                const fc = FIELD_CARDS.find(c => c.pos === p.pos);
                const toggle = () => setExpandedPlayers(prev => {
                  const next = new Set(prev);
                  if (next.has(p.pos)) next.delete(p.pos); else next.add(p.pos);
                  return next;
                });
                return (
                  <React.Fragment key={p.pos}>
                    <tr onClick={toggle} className="pointer">
                      <td className="fw-700 ta-c">{p.pos}</td>
                      <td className="row-label fw-600">{expanded ? "▾" : "▸"} {p.name}</td>
                      <td className="ta-c fs-12">{p.country}</td>
                      {p.rounds.map((r, ri) => (
                        <td key={ri} className="ta-c">{r}</td>
                      ))}
                      <td className="fw-800 ta-c">{p.total}</td>
                      <td className="fw-600 ta-c">{fmtToPar(p.result)}</td>
                      <td className="ta-c">{p.best}</td>
                      <td className="ta-c">{fc?.eclTotal ?? "–"}</td>
                    </tr>
                    {expanded && fc && (
                      <tr>
                        <td colSpan={10} className="bg-detail p-0">
                          <div className="scroll-x p-pad68">
                            <table className="bjgt-mini-table">
                              <thead>
                                <tr className="bg-border-light">
                                  <td className="fw-700 sc-cell-w40">Bur.</td>
                                  {VP_PAR.map((_, hi) => (
                                    <td key={hi} className="sc-cell-label sc-cell-w28">{hi + 1}</td>
                                  ))}
                                  <td className="sc-cell-heavy">Tot</td>
                                  <td className="sc-cell-label">±</td>
                                </tr>
                                <tr className="bg-page">
                                  <td className="sc-cell-fw600-muted">Par</td>
                                  {VP_PAR.map((p2, hi) => (
                                    <td key={hi} className="sc-cell-sub">{p2}</td>
                                  ))}
                                  <td className="sc-cell-muted-soft">71</td>
                                  <td></td>
                                </tr>
                              </thead>
                              <tbody>
                                {fc.rounds.map((rd, ri) => {
                                  const rdTotal = rd.reduce((a, b) => a + b, 0);
                                  return (
                                    <tr key={ri} className="b-light cross-sep">
                                      <td className="sc-cell-fw700">R{ri + 1}</td>
                                      {rd.map((s, hi) => (
                                        <td key={hi} className="ta-c">
                                          <span className={`sc-score ${scClass(s, VP_PAR[hi])} bjgt-mini-score`}>{s}</span>
                                        </td>
                                      ))}
                                      <td className="sc-cell-bold">{rdTotal}</td>
                                      <td className="sc-cell-muted">{fmtToPar(rdTotal - 71)}</td>
                                    </tr>
                                  );
                                })}
                                <tr className="bg-success bt-section">
 <td className="fw-800 p-2-4" >ECL</td>
                                  {fc.ecl.map((s, hi) => (
                                    <td key={hi} className="ta-c">
                                      <span className={`sc-score ${scClass(s, VP_PAR[hi])} bjgt-mini-score-b`}>{s}</span>
                                    </td>
                                  ))}
                                  <td className="sc-cell-heavy">{fc.eclTotal}</td>
                                  <td className="sc-cell-bold">{fmtToPar(fc.eclTotal - 71)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {/* Manuel */}
              {daySummaries.length === 3 && (() => {
                const mTotal = daySummaries.reduce((s, d) => s + d.gross, 0);
                const mResult = mTotal - 213;
                const mRounds = daySummaries.map(d => d.gross);
                const mBest = Math.min(...mRounds);
                const mExpanded = expandedPlayers.has(-1);
                const mToggle = () => setExpandedPlayers(prev => {
                  const next = new Set(prev);
                  if (next.has(-1)) next.delete(-1); else next.add(-1);
                  return next;
                });
                return (
                  <React.Fragment>
                    <tr onClick={mToggle} className="pointer bt-border">
                      <td className="fw-700 ta-c">{MANUEL_POS}</td>
                      <td className="row-label fw-600">{mExpanded ? "▾" : "▸"} {PLAYER_NAME}</td>
                      <td className="ta-c fs-12">🇵🇹</td>
                      {mRounds.map((r, ri) => (
                        <td key={ri} className="ta-c">{r}</td>
                      ))}
                      <td className="fw-800 ta-c">{mTotal}</td>
                      <td className="fw-600 ta-c">{fmtToPar(mResult)}</td>
                      <td className="ta-c">{mBest}</td>
                      <td className="ta-c">{ecl?.totalGross ?? "–"}</td>
                    </tr>
                    {mExpanded && vpCards.length > 0 && (
                      <tr>
                        <td colSpan={10} className="bg-detail p-0">
                          <div className="scroll-x p-pad68">
                            <table className="bjgt-mini-table">
                              <thead>
                                <tr className="bg-border-light">
                                  <td className="fw-700 sc-cell-w40">Bur.</td>
                                  {VP_PAR.map((_, hi) => (
                                    <td key={hi} className="sc-cell-label sc-cell-w28">{hi + 1}</td>
                                  ))}
                                  <td className="sc-cell-heavy">Tot</td>
                                  <td className="sc-cell-label">±</td>
                                </tr>
                                <tr className="bg-page">
                                  <td className="sc-cell-fw600-muted">Par</td>
                                  {VP_PAR.map((p2, hi) => (
                                    <td key={hi} className="sc-cell-sub">{p2}</td>
                                  ))}
                                  <td className="sc-cell-muted-soft">71</td>
                                  <td></td>
                                </tr>
                              </thead>
                              <tbody>
                                {vpCards.map((c, ri) => {
                                  const g = c.h.g.slice(0, 18);
                                  const rdTotal = g.reduce((a, b) => a + (b ?? 0), 0);
                                  return (
                                    <tr key={ri} className="b-light cross-sep">
                                      <td className="sc-cell-fw700">R{ri + 1}</td>
                                      {g.map((s, hi) => (
                                        <td key={hi} className="ta-c">
                                          {s != null ? <span className={`sc-score ${scClass(s, VP_PAR[hi])} bjgt-mini-score`}>{s}</span> : "·"}
                                        </td>
                                      ))}
                                      <td className="sc-cell-bold">{rdTotal}</td>
                                      <td className="sc-cell-muted">{fmtToPar(rdTotal - 71)}</td>
                                    </tr>
                                  );
                                })}
                                {ecl && (
                                  <tr className="bg-success bt-section">
 <td className="fw-800 p-2-4" >ECL</td>
                                    {ecl.holes.map((eh, hi) => (
                                      <td key={hi} className="ta-c">
                                        {eh.best != null ? <span className={`sc-score ${scClass(eh.best, VP_PAR[hi])} bjgt-mini-score-b`}>{eh.best}</span> : "·"}
                                      </td>
                                    ))}
                                    <td className="sc-cell-heavy">{ecl.totalGross}</td>
                                    <td className="sc-cell-bold">{fmtToPar(ecl.totalGross - 71)}</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })()}
            </tbody>
          </table>
        </div>
        <div className="muted fs-8-mb8">BJGT Villa Padierna 2025 · Sub-12 Boys · Par 71 · {FIELD_TOTAL} jogadores · Scorecards de {FIELD_CARDS.length} jogadores · Clica para expandir · ECL = eclético (melhor score por buraco)</div>
        {/* Context for Manuel */}
        {daySummaries.length > 0 && ecl && (
          <div className="caConclusion bg-info bc-info">
            <div className="caConcTitle c-navy">📍 Onde estava o Manuel?</div>
            <div className="caConcText c-dark-navy">
              Fez <b>{daySummaries.map(d => d.gross).join(", ")}</b> (total {daySummaries.reduce((a, d) => a + d.gross, 0)}). 
              O eclético é <b>{ecl.totalGross}</b> — {ecl.totalGross <= FIELD_2025.leaderboard[4]?.total / 3
                ? "um número de Top 5 se o conseguir manter nos 3 dias!"
                : `mais perto do Top 10 (${FIELD_2025.top10Avg.toFixed(0)}/ronda) do que parece.`}
              {" "}Com mais um ano de evolução, o objectivo é claro.
            </div>
          </div>
        )}
      </div>

      {/* ── Dificuldade Real do Campo ── */}
      <div className="holeAnalysis">
        <div className="haTitle">🔥 Dificuldade Real — O que o Field Diz</div>
        <div className="muted fs-10 mb-8">Baseado em {FIELD_2025.nRounds} rondas de {FIELD_2025.nPlayers} jogadores Sub-12. Não é o SI do campo — é onde estes miúdos realmente sofrem.</div>
        
        {/* Difficulty bars */}
        <div className="mb-12">
          {FIELD_2025.holes.map(h => {
            const vsPar = h.fAvg - h.par;
            const maxVs = Math.max(...FIELD_2025.holes.map(x => x.fAvg - x.par));
            const barPct = Math.min(100, (vsPar / maxVs) * 100);
            const rank = FIELD_2025.diffRank.indexOf(h.h) + 1;
            const isHard = rank <= 5;
            const isEasy = rank >= 14;
            // Manuel's avg for this hole
            const manuelH = holePatterns.find(hp => hp.h === h.h);
            const manuelAvg = manuelH?.avg;
            const manuelVsField = manuelAvg != null ? manuelAvg - h.fAvg : null;
            return (
              <div key={h.h} className="flex-center-gap6-mb2">
 <span className="fw-800" style={{ minWidth: 26, color: isHard ? SC.danger : isEasy ? SC.good : SC.muted }}>#{h.h}</span>
                <span className="muted fs-9" style={{ minWidth: 24 }}>P{h.par}</span>
                <div className="progress-track-overflow">
                  <div style={{
                    width: `${barPct}%`, height: "100%", borderRadius: "var(--radius-sm)",
                    background: isHard ? SC.danger : vsPar > 0.4 ? SC.warn : SC.good,
                    opacity: 0.7
                  }} />
                  <span className="bjgt-stat-abs">
                    {vsPar > 0 ? `+${vsPar.toFixed(2)}` : vsPar.toFixed(2)}
                  </span>
                </div>
                <span className="fs-9 fw-700 c-blue" style={{ minWidth: 28 }}>T5:{h.t5.toFixed(1)}</span>
                {manuelAvg != null && (
 <span className="fw-700 fs-10" style={{ minWidth: 32, color: sc3m(manuelVsField!, 0.2, 0.3) }}>
                    M:{manuelAvg.toFixed(1)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Insights */}
        {(() => {
          const hardest = FIELD_2025.holes.filter((_, i) => FIELD_2025.diffRank.indexOf(FIELD_2025.holes[i].h) < 3);
          const easiest = FIELD_2025.holes.filter((_, i) => FIELD_2025.diffRank.indexOf(FIELD_2025.holes[i].h) >= FIELD_2025.diffRank.length - 3);
          const t5zero = FIELD_2025.holes.filter(h => h.t5Dbl === 0 && h.fDbl > 10);
          return (
            <div className="grid-2">
              <div className="caConclusion concl-danger">
                <div className="caConcTitle c-dark-red">🔴 Mais difíceis</div>
 <div className="caConcText fs-11 c-danger-darker" >
                  {FIELD_2025.diffRank.slice(0, 4).map(h => `#${h}`).join(", ")} — todos sofrem aqui. Joga seguro, par é vitória.
                </div>
              </div>
              <div className="caConclusion concl-success">
                <div className="caConcTitle c-green-166">🟢 Mais acessíveis</div>
 <div className="caConcText fs-11 c-good-darker" >
                  {FIELD_2025.diffRank.slice(-4).map(h => `#${h}`).join(", ")} — aqui o Top 5 ataca. Oportunidade para ir buscar pancadas.
                </div>
              </div>
            </div>
          );
        })()}

        {/* Where top5 makes zero doubles but field struggles */}
        {(() => {
          const t5zero = FIELD_2025.holes.filter(h => h.t5Dbl === 0 && h.fDbl >= 10);
          if (t5zero.length === 0) return null;
          return (
            <div className="caConclusion concl-warn mt-8">
 <div className="caConcTitle c-warn-dark-inline" >💡 Onde o Top 5 nunca faz double</div>
 <div className="caConcText fs-11" style={{ color: "var(--color-warn-dark)" }}>
                Nos buracos {t5zero.map(h => `#${h.h}`).join(", ")}, o Top 5 fez <b>0% doubles</b> enquanto o field fez {t5zero.map(h => `${h.fDbl.toFixed(0)}%`).join(", ")}. 
                A diferença não é talento — é decisão. Eles jogam seguro e evitam o erro grande.
              </div>
            </div>
          );
        })()}
      </div>
      {distEvolution.length >= 4 && (
        <div className="holeAnalysis">
          <div className="haTitle">📏 Distância e Evolução</div>
          <div className="muted fs-9-mb8">
            Analisa como a distância total do campo (soma dos metros de todos os buracos) afecta o score.
            Campos são divididos em "curtos" e "longos" pela mediana ({medianMeters}m). A diferença mostra quantas pancadas a mais custa jogar em campos mais longos.
          </div>
          {metersGrowing && metersDiff != null && (
            <div className="caConclusion concl-info mb-10">
              <div className="caConcTitle c-navy">📈 Está a jogar campos mais longos</div>
              <div className="caConcText c-dark-navy">
                Distância média das rondas recentes é <b>+{metersDiff.toFixed(0)}m</b> acima das primeiras. Isto é crescimento real — mais força, mais distância.
              </div>
            </div>
          )}
          {avgGrossShort != null && avgGrossLong != null && (
            <div className="haDiag mb-10">
              <div className="haDiagCard">
                <div className="haDiagIcon diag-good">⛳</div>
                <div className="haDiagBody">
                  <div className="haDiagVal c-par-ok">{avgGrossShort.toFixed(0)}</div>
                  <div className="haDiagLbl">gross médio campos curtos (&lt;{medianMeters}m)</div>
                </div>
              </div>
              <div className="haDiagCard">
                <div className="haDiagIcon diag-danger">🏌️</div>
                <div className="haDiagBody">
                  <div className="haDiagVal c-birdie">{avgGrossLong.toFixed(0)}</div>
                  <div className="haDiagLbl">gross médio campos longos (≥{medianMeters}m)</div>
                </div>
              </div>
              <div className="haDiagCard">
                <div className="haDiagIcon diag-warn">📊</div>
                <div className="haDiagBody">
                  <div className="haDiagVal c-eagle">{Math.abs(avgGrossLong - avgGrossShort).toFixed(0)}</div>
                  <div className="haDiagLbl">pancadas extra em campos longos</div>
                </div>
              </div>
            </div>
          )}
          {/* Mini distance/gross scatter */}
 <div className="fw-700 mb-4 c-muted fs-10" >ÚLTIMAS 20 RONDAS</div>
          <div className="muted bjgt-sub">
            Cada quadrado é uma ronda recente, ordenada da mais antiga (esquerda) para a mais recente (direita).
 O número é o gross. Cor: <span className="fw-700 c-good-dark-inline" >verde ≤82</span> · <span style={{ color: "var(--color-warn-dark)", fontWeight: 700 }}>amarelo 83–88</span> · <span style={{ color: "var(--color-danger-dark)", fontWeight: 700 }}>vermelho ≥89</span>.
            Rondas em VP Flamingos têm borda vermelha e formato redondo. Passa o rato por cima para ver data, campo e distância.
          </div>
          <div className="flex-gap3">
            {distEvolution.slice(-20).map((r, i) => {
              const vpCourse = r.course.toLowerCase().includes("villa") || r.course.toLowerCase().includes("flamingos");
              return (
                <div key={i} title={`${r.date} · ${r.course} · ${r.meters ?? "?"}m → Gross ${r.gross}`}
                  style={{ width: 28, height: 28, borderRadius: vpCourse ? 999 : 4, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, border: vpCourse ? "2px solid var(--color-danger)" : "1px solid var(--border)",
                    background: r.gross <= 82 ? "var(--bg-success)" : r.gross <= 88 ? "var(--bg-warn)" : "var(--bg-danger)",
                    color: sc3(r.gross, 82, 88) }}>
                  {r.gross}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Perfil por Distância: Como se sai em buracos assim? ── */}
      {bands.length > 0 && (
        <div className="holeAnalysis">
          <div className="haTitle">🔬 Perfil por Distância — Como te sais em buracos assim?</div>
          <div className="muted fs-10 mb-8">
            {distPeriod === 0
              ? `${allHoleSamples.length} buracos (all-time)`
              : `${filteredN} buracos (últ. ${distPeriod} meses) · ${allHoleSamples.length} total`}
          </div>
          <div className="grid-auto-240">
            {(distPeriod === 0 ? bands : bands).map(b => {
              const vpInBand = vpHoleProfiles.filter(h => h.band?.key === b.key);
              const fb = filteredBands.find(r => r.key === b.key);
              const showFiltered = distPeriod !== 0 && fb;
              const mainAvg = showFiltered ? fb!.avg : b.avg;
              const mainN = showFiltered ? fb!.n : b.n;
              const mainPob = showFiltered ? fb!.pobPct : b.pobPct;
              const mainDbl = showFiltered ? fb!.dblPct : b.dblPct;
              const avgCol = sc3(mainAvg - b.par, 0.3, 0.8);
              const trend = showFiltered ? fb!.avg - b.avg : null;
              const trendCol = trend != null ? sc3m(trend, 0.15, 0.15) : SC.muted;
              const noData = distPeriod !== 0 && !fb;
              return (
 <div key={b.key} className={`section-card${noData ? " op-5" : ""}`} style={{ padding: "10px 12px", background: noData ? "var(--bg-detail)" : undefined }}>
                  <div className="fw-900-fs12-mb4">{b.label}</div>
                  {noData ? (
                    <div className="muted fs-10">Sem dados suficientes nos últimos {distPeriod} meses (all-time: {b.avg.toFixed(1)}, {b.n} buracos)</div>
                  ) : (
                    <>
                      <div className="flex-gap12-mb4">
                        <div>
 <div className="fs-18 fw-900" style={{ color: avgCol }}>{mainAvg.toFixed(1)}</div>
                          <div className="muted fs-9">
                            {showFiltered ? `últ. ${distPeriod}m (${mainN})` : `total (${mainN})`}
                          </div>
                        </div>
                        <div>
 <div className="fs-14 fw-800" style={{ color: SC.good }}>{mainPob.toFixed(0)}%</div>
                          <div className="muted fs-9">par ou melhor</div>
                        </div>
                        <div>
 <div className="fs-14 fw-800" style={{ color: SC.danger }}>{mainDbl.toFixed(0)}%</div>
                          <div className="muted fs-9">double+</div>
                        </div>
                      </div>
                      {/* All-time reference + trend */}
                      {showFiltered && (
 <div className="ai-center mb-4 fs-10 gap-8 c-muted d-flex" >
                          <span>All-time: <b className="c-text-3">{b.avg.toFixed(1)}</b> ({b.n})</span>
                          {trend != null && Math.abs(trend) > 0.1 && (
 <span className="fw-700" style={{ color: trendCol }}>
                              {trend < 0 ? `↗ ${Math.abs(trend).toFixed(1)} melhor` : `↘ +${trend.toFixed(1)} pior`}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {vpInBand.length > 0 && (
 <div className="fw-600 c-chart-2 fs-10 border-t pt-4">
                      VP buracos nesta faixa: {vpInBand.map(h => `#${h.h}`).join(", ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          EVOLUÇÃO TEMPORAL — 5 análises com gráficos inline
          ══════════════════════════════════════════════════════ */}
      {filteredMonthly.length >= 3 && (
        <div className="holeAnalysis">
          <div className="haTitle">📈 Evolução Temporal — {filteredMonthly.length} meses de dados</div>
          <div className="muted fs-10-mb12">
            Baseado em {filteredMonthly.reduce((s, m) => s + m.rounds, 0)} rondas de 18 buracos, de {filteredMonthly[0]?.label} a {filteredMonthly[filteredMonthly.length - 1]?.label}.
          </div>

          {/* ── 1. GROSS MÉDIO POR MÊS ── */}
          <div className="mb-20">
            <div className="haSubTitle c-navy">🏌️ Gross Médio por Mês</div>
            <div className="muted bjgt-sub">
              Cada barra = média do score bruto (gross) nas rondas de 18 buracos desse mês. Quanto mais baixa, melhor.
              As linhas tracejadas mostram a média do Top 5 e do field do BJGT VP 2025 como referência.
              A análise compara os 3 primeiros meses com os 3 últimos para avaliar a tendência.
            </div>
            {(() => {
              const ms = filteredMonthly;
              const avgs = ms.map(m => m.avgGross);
              const dataMin = Math.min(...avgs);
              const dataMax = Math.max(...avgs);
              const t5ref = FIELD_2025.top5Avg;
              const fieldRef = FIELD_2025.fieldAvg;
              const chartH = 160; // px
              const pad = 3; // score units padding
              const lo = Math.floor(Math.min(dataMin, fieldRef) - pad);
              const hi = Math.ceil(dataMax + pad);
              const range = hi - lo || 1;
              const toPx = (v: number) => ((v - lo) / range) * chartH;
              const first3 = ms.slice(0, Math.min(3, ms.length));
              const last3 = ms.slice(-Math.min(3, ms.length));
              const f3avg = first3.reduce((s, m) => s + m.avgGross, 0) / first3.length;
              const l3avg = last3.reduce((s, m) => s + m.avgGross, 0) / last3.length;
              const improving = l3avg < f3avg - 1;
              return (
                <div>
 <div className="mb-4" style={{ position: "relative", height: chartH }}>
                    {/* Reference lines */}
                    {[{ val: t5ref, label: "T5", col: SC.warn }, { val: fieldRef, label: "Field", col: "var(--text-muted)" }].map(ref => {
                      const bottom = toPx(ref.val);
                      if (bottom < 0 || bottom > chartH) return null;
                      return (
                        <div key={ref.label} style={{ position: "absolute", left: 0, right: 0, bottom,
                          borderTop: `1px dashed ${ref.col}`, zIndex: 1 }}>
                          <span style={{ position: "absolute", right: 0, bottom: 1, fontSize: 10,
                            color: ref.col, fontWeight: 700 }}>
                            {ref.label} {ref.val.toFixed(0)}
                          </span>
                        </div>
                      );
                    })}
                    {/* Bars */}
                    <div className="chart-bars" style={{ height: chartH }}>
                      {ms.map((m, i) => {
                        const barPx = Math.max(4, toPx(m.avgGross));
                        const col = m.avgGross <= t5ref ? SC.good : m.avgGross <= fieldRef ? "var(--chart-2)" : m.avgGross <= fieldRef + 5 ? SC.warn : SC.danger;
                        return (
                          <div key={i} className="chart-cell">
 <div className="fs-10 fw-700" style={{ color: col, marginBottom: 2 }}>{m.avgGross.toFixed(0)}</div>
                            <div style={{ height: barPx, background: col, borderRadius: "4px 4px 0 0", opacity: 0.75 }} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Labels */}
                  <div className="flex-gap2">
                    {ms.map((m, i) => (
 <div key={i} className="ta-center fs-10 c-muted flex-1" >
                        {m.label}<br /><span className="fs-7">({m.rounds}r)</span>
                      </div>
                    ))}
                  </div>
                  {/* Trend insight */}
 <div className={`caConclusion ${improving ? "concl-success" : "concl-danger"} mt-8`} >
 <div className="caConcText fs-11" style={{ color: scDark(improving ? "good" : "danger") }}>
                      {improving
                        ? <>📉 <b>A descer!</b> Primeiros meses: {f3avg.toFixed(0)} → Últimos meses: {l3avg.toFixed(0)}. Melhoria de {(f3avg - l3avg).toFixed(1)} pancadas.</>
                        : Math.abs(f3avg - l3avg) < 1
                          ? <>📊 <b>Estável.</b> Média mantém-se à volta de {l3avg.toFixed(0)} ({first3[0]?.label} → {last3[last3.length-1]?.label}).</>
                          : <>📈 Primeiros meses: {f3avg.toFixed(0)} → Últimos: {l3avg.toFixed(0)}. Pode haver mais variância recente — ver doubles abaixo.</>
                      }
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── 2. PAR 3/4/5 AO LONGO DO TEMPO ── */}
          <div className="mb-20">
            <div className="haSubTitle c-purple">⛳ Desempenho Par 3 / 4 / 5 ao Longo do Tempo</div>
            <div className="muted bjgt-sub">
              Média de pancadas por tipo de buraco em cada mês. Ex: "Par 3 → 3.81" significa que, em média, faz 3.81 pancadas nos buracos de par 3.
              Compara o primeiro e último terço dos dados para ver tendência. "T5 BJGT" é a referência dos 5 melhores do torneio.
            </div>
            <div className="grid-3">
              {[
                { par: 3, key: "p3Avg" as const, label: "Par 3", col: "var(--chart-2)", refAvg: 3 },
                { par: 4, key: "p4Avg" as const, label: "Par 4", col: "var(--chart-5)", refAvg: 4 },
                { par: 5, key: "p5Avg" as const, label: "Par 5", col: SC.good, refAvg: 5 },
              ].map(pt => {
                const vals = filteredMonthly.filter(m => m[pt.key] != null).map(m => ({ label: m.label, avg: m[pt.key]! }));
                if (vals.length < 3) return null;
                const minV = Math.min(...vals.map(v => v.avg));
                const maxV = Math.max(...vals.map(v => v.avg));
                const range = maxV - minV || 0.5;
                const first = vals.slice(0, Math.ceil(vals.length / 3));
                const last = vals.slice(-Math.ceil(vals.length / 3));
                const fAvg = first.reduce((s, v) => s + v.avg, 0) / first.length;
                const lAvg = last.reduce((s, v) => s + v.avg, 0) / last.length;
                const trend = lAvg - fAvg;
                // BJGT T5 refs
                const t5holes = FIELD_2025.holes.filter(h => h.par === pt.par);
                const t5avg = t5holes.length > 0 ? t5holes.reduce((s, h) => s + h.t5, 0) / t5holes.length : null;
                return (
                  <div key={pt.par} className="card-detail">
 <div className="fw-900 fs-11 mb-4" style={{ color: pt.col }}>{pt.label}</div>
                    <div className="chart-bars-1" style={{ height: 60 }}>
                      {vals.map((v, i) => {
                        const h = ((v.avg - minV + 0.2) / (range + 0.4)) * 100;
                        return (
                          <div key={i} className="bjgt-bar-col">
                            <div style={{ width: "100%", height: `${h}%`, background: pt.col, borderRadius: "var(--radius-xs)", opacity: 0.6, minHeight: 3 }} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex-spacebetween-fs9 mt-4">
                      <span className="c-muted">{vals[0].label}</span>
                      <span className="c-muted">{vals[vals.length - 1].label}</span>
                    </div>
 <div className="fw-700 mt-4 fs-10" style={{ color: sc3m(trend, 0.15, 0.15) }}>
                      {fAvg.toFixed(2)} → {lAvg.toFixed(2)} ({trend > 0 ? "+" : ""}{trend.toFixed(2)})
                    </div>
                    {t5avg != null && (
                      <div className="fs-9 c-muted">T5 BJGT: {t5avg.toFixed(2)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 3. DOUBLES POR PERÍODO ── */}
          <div className="mb-20">
            <div className="haSubTitle c-birdie">💥 Doubles+ por Mês — Blow-ups a Diminuir?</div>
            <div className="muted bjgt-sub">
              Percentagem de buracos onde o score foi double bogey ou pior (= 2+ pancadas acima do par).
              Estes "blow-ups" são o maior destruidor de scores em juniores. Reduzir de 25% para 15% pode valer 4-5 pancadas por ronda.
            </div>
            {(() => {
              const ms = filteredMonthly;
              const maxDbl = Math.max(...ms.map(m => m.dblPct));
              const first3 = ms.slice(0, Math.min(3, ms.length));
              const last3 = ms.slice(-Math.min(3, ms.length));
              const fDbl = first3.reduce((s, m) => s + m.dblPct, 0) / first3.length;
              const lDbl = last3.reduce((s, m) => s + m.dblPct, 0) / last3.length;
              const improving = lDbl < fDbl - 2;
              return (
                <div>
 <div className="chart-bars mb-4" style={{ height: 80 }}>
                    {ms.map((m, i) => {
                      const h = maxDbl > 0 ? (m.dblPct / maxDbl) * 100 : 0;
                      const col = sc3(m.dblPct, 15, 25);
                      return (
                        <div key={i} className="bjgt-bar-col">
 <div className="fs-10 fw-700" style={{ color: col }}>{m.dblPct.toFixed(0)}%</div>
                          <div style={{ width: "100%", height: `${h}%`, background: col, borderRadius: "3px 3px 0 0", opacity: 0.7, minHeight: 3 }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex-gap2">
                    {ms.map((m, i) => (
 <div key={i} className="ta-center fs-10 c-muted flex-1" >{m.label}</div>
                    ))}
                  </div>
 <div className={`caConclusion ${improving ? "concl-success" : "concl-danger"} mt-8`} >
 <div className="caConcText fs-11" style={{ color: scDark(improving ? "good" : "danger") }}>
                      {improving
                        ? <>✅ <b>Menos blow-ups!</b> Doubles baixaram de {fDbl.toFixed(0)}% para {lDbl.toFixed(0)}%. Isto é maturidade competitiva.</>
                        : lDbl > fDbl + 2
                          ? <>⚠️ Doubles subiram de {fDbl.toFixed(0)}% para {lDbl.toFixed(0)}%. Pode ser campos mais difíceis ou momentos de pressão. Ver buracos trap.</>
                          : <>📊 Doubles estáveis à volta de {lDbl.toFixed(0)}%. O Top 5 do BJGT faz ~{(FIELD_2025.holes.reduce((s, h) => s + h.t5Dbl, 0) / FIELD_2025.holes.length).toFixed(0)}% — este é o objectivo.</>
                      }
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── 4. FORMA RECENTE vs BENCHMARKS BJGT ── */}
          <div className="mb-20">
            <div className="haSubTitle c-eagle">🏆 Forma Recente vs Benchmarks BJGT 2025</div>
            <div className="muted bjgt-sub">
              Compara a forma dos últimos 3 meses com os benchmarks reais do BJGT Villa Padierna 2025: o score médio do vencedor, Top 5 e field inteiro.
              Permite ver a que distância competitiva está e se a tendência se aproxima destes níveis.
            </div>
            {(() => {
              const now6 = new Date(); now6.setMonth(now6.getMonth() - 6);
              const cut6 = now6.getTime();
              const last6m = roundDetails.filter(r => r.ds >= cut6);
              const now3 = new Date(); now3.setMonth(now3.getMonth() - 3);
              const cut3 = now3.getTime();
              const last3m = roundDetails.filter(r => r.ds >= cut3);
              const periods = [
                { label: "Últimos 3m", data: last3m },
                { label: "Últimos 6m", data: last6m },
                { label: "All-time", data: roundDetails },
              ].filter(p => p.data.length >= 2);
              const benchmarks = [
                { label: "🥇 Vencedor BJGT", value: FIELD_2025.leaderboard[0].total / 3, col: SC.warn },
                { label: "🏅 Top 5 BJGT", value: FIELD_2025.top5Avg, col: SC.good },
                { label: "📊 Field BJGT", value: FIELD_2025.fieldAvg, col: "var(--chart-2)" },
              ];
              return (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${periods.length}, 1fr)`, gap: 8, marginBottom: 8 }}>
                    {periods.map(p => {
                      const avg = p.data.reduce((s, r) => s + r.gross, 0) / p.data.length;
                      const best = Math.min(...p.data.map(r => r.gross));
                      const dblPct = p.data.reduce((s, r) => s + r.nDbl, 0) / p.data.reduce((s, r) => s + r.nHoles, 0) * 100;
                      const pobPct = p.data.reduce((s, r) => s + r.nPob, 0) / p.data.reduce((s, r) => s + r.nHoles, 0) * 100;
                      return (
                        <div key={p.label} className="card-detail ta-c">
                          <div className="fw-900-fs11-mb4">{p.label}</div>
                          <div className="fs-9-muted-mb4">{p.data.length} rondas</div>
 <div className="fw-900 c-text fs-22">{avg.toFixed(1)}</div>
                          <div className="muted fs-9">média</div>
                          <div className="flex-jc-center-gap10">
                            <span className="cb-par-ok">⬇{best}</span>
                            <span className="c-par-ok">{pobPct.toFixed(0)}% pob</span>
                            <span className="c-birdie">{dblPct.toFixed(0)}% dbl</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Benchmark comparison bars */}
                  {periods.length > 0 && (() => {
                    const recentAvg = periods[0].data.reduce((s, r) => s + r.gross, 0) / periods[0].data.length;
                    const recentBest = Math.min(...periods[0].data.map(r => r.gross));
                    const allVals = [...benchmarks.map(b => b.value), recentAvg, recentBest];
                    const minV = Math.min(...allVals) - 2;
                    const maxV = Math.max(...allVals) + 2;
                    const range = maxV - minV;
                    return (
                      <div className="mt-8">
                        {[...benchmarks, { label: `📍 ${PLAYER_NAME} média`, value: recentAvg, col: "var(--text)" }, { label: `📍 ${PLAYER_NAME} melhor`, value: recentBest, col: SC.good }].map((b, i) => (
                          <div key={i} className="flex-center-gap6 mb-3">
 <span className="fs-10 fw-600" style={{ minWidth: 110, color: b.col }}>{b.label}</span>
                            <div className="progress-track">
                              <div style={{ width: `${((b.value - minV) / range) * 100}%`, height: "100%", background: b.col, borderRadius: "var(--radius-sm)", opacity: 0.6 }} />
                              <span className="bjgt-stat-abs">{b.value.toFixed(1)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>

          {/* ── 5. FRONT 9 vs BACK 9 AO LONGO DO TEMPO ── */}
          <div className="mb-8">
 <div className="haSubTitle c-chart-6" >⚡ Front 9 vs Back 9 — Gestão de Energia</div>
            <div className="muted bjgt-sub">
              Compara a média de pancadas nos primeiros 9 buracos (F9) vs últimos 9 (B9). Se o B9 é consistentemente pior,
              pode indicar fadiga física, perda de concentração ou má hidratação/nutrição durante a ronda.
            </div>
            {(() => {
              const ms = filteredMonthly;
              const maxSplit = Math.max(...ms.map(m => Math.max(m.f9Avg, m.b9Avg)));
              const minSplit = Math.min(...ms.map(m => Math.min(m.f9Avg, m.b9Avg)));
              const range = maxSplit - minSplit || 2;
              const avgF9Gap = ms.reduce((s, m) => s + (m.b9Avg - m.f9Avg), 0) / ms.length;
              const recentGap = ms.length >= 3 ? ms.slice(-3).reduce((s, m) => s + (m.b9Avg - m.f9Avg), 0) / 3 : avgF9Gap;
              const earlyGap = ms.length >= 3 ? ms.slice(0, 3).reduce((s, m) => s + (m.b9Avg - m.f9Avg), 0) / 3 : avgF9Gap;
              return (
                <div>
                  {/* Paired bars */}
                  <div className="flex-gap2-mb4">
                    {ms.map((m, i) => {
                      const f9h = ((m.f9Avg - minSplit + 1) / (range + 2)) * 100;
                      const b9h = ((m.b9Avg - minSplit + 1) / (range + 2)) * 100;
                      return (
                        <div key={i} className="bjgt-bar-cell">
 <div className="fw-600 c-chart-6 fs-10" >{m.f9Avg.toFixed(0)}</div>
 <div className="chart-bars-1 w-full" style={{ height: 50 }}>
                            <div style={{ flex: 1, height: `${f9h}%`, background: "var(--chart-6)", borderRadius: "var(--radius-xs)", opacity: 0.6, minHeight: 3 }} />
                            <div style={{ flex: 1, height: `${b9h}%`, background: "var(--chart-4)", borderRadius: "var(--radius-xs)", opacity: 0.6, minHeight: 3 }} />
                          </div>
 <div className="fw-600 fs-10" style={{ color: "var(--chart-4)" }}>{m.b9Avg.toFixed(0)}</div>
                          <div className="fs-7-muted">{m.label}</div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Legend */}
                  <div className="chart-legend-mb8">
                    <span><span className="chart-legend-dot" style={{ background: "var(--chart-6)" }} />Front 9</span>
                    <span><span className="chart-legend-dot" style={{ background: "var(--chart-4)" }} />Back 9</span>
                  </div>
                  <div className="caConclusion bg-info bc-info">
                    <div className="caConcText c-dark-navy-11">
                      {Math.abs(avgF9Gap) < 1
                        ? <>📊 Front e Back 9 equilibrados (gap médio: {avgF9Gap > 0 ? "+" : ""}{avgF9Gap.toFixed(1)}). Boa gestão de energia!</>
                        : avgF9Gap > 0
                          ? <>⚠️ O Back 9 custa em média <b>+{avgF9Gap.toFixed(1)}</b> pancadas. {recentGap < earlyGap - 0.5 ? "Mas está a melhorar!" : "Água, banana, e rotina de reset entre buracos."}</>
                          : <>💪 O Back 9 é mais forte (–{Math.abs(avgF9Gap).toFixed(1)})! Arranca mais concentrado e capitaliza no final.</>
                      }
                      {Math.abs(recentGap - earlyGap) > 1 && (
                        <> Gap início: {earlyGap > 0 ? "+" : ""}{earlyGap.toFixed(1)} → recente: {recentGap > 0 ? "+" : ""}{recentGap.toFixed(1)}.
                          {recentGap < earlyGap ? " 📉 A fechar o gap — bom sinal!" : " 📈 O gap está a abrir — cuidado com a fadiga."}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          INDICADORES DE DESENVOLVIMENTO — Para Treinadores
          ══════════════════════════════════════════════════════ */}
      {filteredCoach.length >= 3 && (
        <div className="holeAnalysis">
          <div className="haTitle">🎓 Indicadores de Desenvolvimento</div>
          <div className="muted fs-10 mb-8">
            Métricas que os treinadores de golfe analisam para avaliar a evolução de jovens jogadores.
            Baseado em {coachRounds.length} rondas com scorecards detalhados (buraco a buraco).
            Cada gráfico mostra a evolução mensal e compara o primeiro terço com o último terço dos dados.
          </div>
          <div className="muted fs-10-mb12">
            Métricas que treinadores usam para avaliar evolução real. Dados de {coachRounds.length} rondas.
          </div>

          {/* ── 1. CONSISTÊNCIA — SD do gross + Best vs Avg gap ── */}
          <div className="mb-20">
            <div className="haSubTitle c-purple">🎯 Consistência — A Chave da Maturidade</div>
            <div className="muted bjgt-sub">
              <b>Desvio-padrão (σ):</b> mede a variação entre rondas no mesmo mês. σ ≤ 3 = muito consistente, σ &gt; 5 = imprevisível.
              <b>Gap Melhor–Média:</b> diferença entre a melhor ronda e a média do mês. Gap pequeno = joga sempre perto do seu melhor. Verde = bom, laranja = atenção, vermelho = a melhorar.
            </div>
            <div className="muted bjgt-sub">Desvio-padrão (σ) do gross e gap melhor/média. σ a descer = jogador mais previsível. Gap a fechar = menos altos e baixos.</div>
            <div className="bjgt-grid-2x2">
              {/* Gross SD */}
              <div className="card-detail">
                <div className="fw-800-fs10-purple-mb4">σ Gross (desvio-padrão)</div>
                <div className="bjgt-bar-wrap">
                  {filteredCoach.filter(m => m.n >= 2).map((m, i) => {
                    const maxSD = Math.max(...filteredCoach.filter(x => x.n >= 2).map(x => x.grossStdDev));
                    const h = maxSD > 0 ? (m.grossStdDev / maxSD) * 100 : 0;
                    const col = sc3(m.grossStdDev, 3, 5);
                    return (
                      <div key={i} className="bjgt-bar-col">
 <div className="fs-10 fw-700" style={{ color: col }}>{m.grossStdDev.toFixed(1)}</div>
                        <div style={{ width: "100%", height: `${h}%`, background: col, borderRadius: "var(--radius-xs)", opacity: 0.6, minHeight: 3 }} />
                        <div className="bjgt-kpi-tiny">{m.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Best vs Avg gap */}
              <div className="card-detail">
                <div className="fw-800 fs-10 c-blue mb-4">Gap: Média − Melhor</div>
                <div className="bjgt-bar-wrap">
                  {filteredCoach.filter(m => m.n >= 2).map((m, i) => {
                    const maxGap = Math.max(...filteredCoach.filter(x => x.n >= 2).map(x => x.bestVsAvgGap));
                    const h = maxGap > 0 ? (m.bestVsAvgGap / maxGap) * 100 : 0;
                    const col = sc3(m.bestVsAvgGap, 3, 6);
                    return (
                      <div key={i} className="bjgt-bar-col">
 <div className="fs-10 fw-700" style={{ color: col }}>{m.bestVsAvgGap.toFixed(0)}</div>
                        <div style={{ width: "100%", height: `${h}%`, background: col, borderRadius: "var(--radius-xs)", opacity: 0.6, minHeight: 3 }} />
                        <div className="bjgt-kpi-tiny">{m.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {(() => {
              const valid = filteredCoach.filter(m => m.n >= 2);
              if (valid.length < 3) return null;
              const first = valid.slice(0, Math.ceil(valid.length / 3));
              const last = valid.slice(-Math.ceil(valid.length / 3));
              const fSD = first.reduce((s, m) => s + m.grossStdDev, 0) / first.length;
              const lSD = last.reduce((s, m) => s + m.grossStdDev, 0) / last.length;
              const fGap = first.reduce((s, m) => s + m.bestVsAvgGap, 0) / first.length;
              const lGap = last.reduce((s, m) => s + m.bestVsAvgGap, 0) / last.length;
              const sdBetter = lSD < fSD - 0.5;
              const gapBetter = lGap < fGap - 1;
              return (
                <div className={`caConclusion ${sdBetter || gapBetter ? "concl-success" : "concl-danger"}`}>
 <div className="caConcText fs-11" style={{ color: scDark(sdBetter || gapBetter ? "good" : "danger") }}>
                    σ: {fSD.toFixed(1)} → {lSD.toFixed(1)} {sdBetter ? "✅ mais consistente" : "— manter trabalho"}
                    {" · "}Gap: {fGap.toFixed(0)} → {lGap.toFixed(0)} {gapBetter ? "✅ a fechar" : "— potencial por explorar"}.
                    {sdBetter && gapBetter && " Evolução clara em consistência — sinal de maturidade competitiva."}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── 2. RESILIÊNCIA — Bounce-back rate ── */}
          <div className="mb-20">
            <div className="haSubTitle c-birdie">🧠 Resiliência — Bounce-back Após Double</div>
            <div className="muted bjgt-sub">
              Depois de fazer double bogey ou pior, qual a % de vezes que faz par ou melhor no buraco seguinte?
              Mede a capacidade de "limpar a cabeça" após um mau buraco. Top juniores: ≥40%. Abaixo de 25% = o mau buraco está a arrastar os seguintes.
            </div>
            <div className="muted bjgt-sub">Depois de um double+, qual % de vezes faz par ou melhor no buraco seguinte? Top juniors: 40%+.</div>
 <div className="chart-bars mb-4" style={{ height: 60 }}>
              {filteredCoach.map((m, i) => {
                const rate = m.bounceRate;
                const h = rate != null ? Math.min(100, rate) : 0;
                const col = rate == null ? "var(--border-light)" : sc3(rate, 25, 40, "desc");
                return (
                  <div key={i} className="bjgt-bar-col">
 <div className="fs-10 fw-700" style={{ color: col }}>{rate != null ? `${rate.toFixed(0)}%` : "–"}</div>
                    <div style={{ width: "100%", height: `${h}%`, background: col, borderRadius: "3px 3px 0 0", opacity: 0.7, minHeight: rate != null ? 3 : 1 }} />
 <div className="c-muted fs-10 mt-1" >{m.label}</div>
                  </div>
                );
              })}
            </div>
            {(() => {
              const withData = filteredCoach.filter(m => m.bounceRate != null);
              if (withData.length < 3) return null;
              const first = withData.slice(0, Math.ceil(withData.length / 3));
              const last = withData.slice(-Math.ceil(withData.length / 3));
              const fR = first.reduce((s, m) => s + m.bounceRate!, 0) / first.length;
              const lR = last.reduce((s, m) => s + m.bounceRate!, 0) / last.length;
              return (
                <div className={`caConclusion ${lR > fR + 5 ? "concl-success" : "concl-info"}`}>
 <div className="caConcText fs-11" style={{ color: scDark(lR > fR + 5 ? "good" : "info") }}>
                    Bounce-back: {fR.toFixed(0)}% → {lR.toFixed(0)}%. {lR > fR + 5 ? "📈 A melhorar a gestão mental!" : lR >= fR ? "Estável." : "Trabalhar rotina de reset pós-erro."}
                    {" "}Um double não tem de custar dois.
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── 3. BIRDIES & PAR STREAKS — Capacidade Ofensiva + Concentração ── */}
          <div className="mb-20">
            <div className="haSubTitle c-par-ok">🦅 Birdies & Séries de Pares — Ataque e Concentração</div>
            <div className="muted bjgt-sub">
              <b>Taxa de Birdies (%):</b> % de buracos com birdie ou melhor — mede a capacidade ofensiva.
              <b>Melhor série par+ (média):</b> maior nº consecutivo de buracos com par ou melhor na ronda — mede concentração e consistência mental.
              Séries longas (&gt;5) indicam boa gestão do jogo.
            </div>
            <div className="bjgt-grid-2x2">
              {/* Birdie rate */}
              <div className="card-detail">
                <div className="fw-800-fs10-green-mb4">🦅 Taxa de Birdies (%)</div>
                <div className="bjgt-bar-wrap">
                  {filteredCoach.map((m, i) => {
                    const maxB = Math.max(...filteredCoach.map(x => x.birdieRate), 1);
                    const h = (m.birdieRate / maxB) * 100;
                    return (
                      <div key={i} className="bjgt-bar-col">
 <div className="fs-10 fw-700" style={{ color: SC.good }}>{m.birdieRate.toFixed(1)}</div>
                        <div style={{ width: "100%", height: `${h}%`, background: SC.good, borderRadius: "var(--radius-xs)", opacity: 0.6, minHeight: 3 }} />
                        <div className="bjgt-kpi-tiny">{m.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Par streak */}
              <div className="card-detail">
                <div className="fw-800 fs-10 c-blue mb-4">🔗 Melhor série par+ (média)</div>
                <div className="bjgt-bar-wrap">
                  {filteredCoach.map((m, i) => {
                    const maxS = Math.max(...filteredCoach.map(x => x.avgPobStreak), 1);
                    const h = (m.avgPobStreak / maxS) * 100;
                    return (
                      <div key={i} className="bjgt-bar-col">
 <div className="fw-700 c-chart-2 fs-10" >{m.avgPobStreak.toFixed(1)}</div>
                        <div style={{ width: "100%", height: `${h}%`, background: "var(--chart-2)", borderRadius: "var(--radius-xs)", opacity: 0.6, minHeight: 3 }} />
                        <div className="bjgt-kpi-tiny">{m.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {(() => {
              if (filteredCoach.length < 3) return null;
              const first = filteredCoach.slice(0, Math.ceil(filteredCoach.length / 3));
              const last = filteredCoach.slice(-Math.ceil(filteredCoach.length / 3));
              const fBird = first.reduce((s, m) => s + m.birdieRate, 0) / first.length;
              const lBird = last.reduce((s, m) => s + m.birdieRate, 0) / last.length;
              const fStreak = first.reduce((s, m) => s + m.avgPobStreak, 0) / first.length;
              const lStreak = last.reduce((s, m) => s + m.avgPobStreak, 0) / last.length;
              return (
                <div className="caConclusion bg-info bc-info">
                  <div className="caConcText c-dark-navy-11">
                    Birdies: {fBird.toFixed(1)}% → {lBird.toFixed(1)}% {lBird > fBird + 0.5 ? "📈" : "—"}
                    {" · "}Séries par+: {fStreak.toFixed(1)} → {lStreak.toFixed(1)} buracos {lStreak > fStreak + 0.3 ? "📈 mais focado" : "—"}.
                    {lBird > fBird + 1 && " Está a começar a atacar mais — sinal de confiança."}
                    {lStreak > fStreak + 1 && " Consegue manter o foco durante mais buracos consecutivos."}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── 4. INÍCIO vs FECHO — Nervos e Fadiga ── */}
          <div className="mb-20">
            <div className="haSubTitle c-eagle">🏁 Arranque vs Fecho — Nervos e Fadiga</div>
            <div className="muted bjgt-sub">
              Compara o desempenho nos 3 primeiros buracos (arranque) vs 3 últimos (fecho), medido em pancadas acima do par.
              Arranque alto = nervos no tee do 1. Fecho alto = fadiga ou pressão final.
              Ambos devem estar abaixo de +1.5. Acima disso, há trabalho específico a fazer (aquecimento, nutrição, rotina mental).
            </div>
            <div className="muted bjgt-sub">Média vs par nos primeiros 3 buracos (#1-3) e últimos 3 (#16-18). Para juniors, o arranque é nervos e o fecho é fadiga.</div>
            <div className="flex-gap2-mb4">
              {filteredCoach.map((m, i) => {
                const maxAbs = Math.max(...filteredCoach.map(x => Math.max(Math.abs(x.first3Avg), Math.abs(x.last3Avg))), 1);
                const f3h = Math.min(100, (Math.abs(m.first3Avg) / maxAbs) * 100);
                const l3h = Math.min(100, (Math.abs(m.last3Avg) / maxAbs) * 100);
                return (
                  <div key={i} className="bjgt-bar-cell">
 <div className="fw-600 fs-10" style={{ color: sc2w(m.first3Avg, 0.5) }}>
                      {m.first3Avg > 0 ? "+" : ""}{m.first3Avg.toFixed(1)}
                    </div>
 <div className="chart-bars-1 w-full" style={{ height: 40 }}>
                      <div style={{ flex: 1, height: `${f3h}%`, background: SC.warn, borderRadius: "var(--radius-xs)", opacity: 0.6, minHeight: 3 }} />
                      <div style={{ flex: 1, height: `${l3h}%`, background: "var(--chart-5)", borderRadius: "var(--radius-xs)", opacity: 0.6, minHeight: 3 }} />
                    </div>
 <div className="fw-600 fs-10" style={{ color: m.last3Avg <= 0.5 ? SC.good : "var(--chart-5)" }}>
                      {m.last3Avg > 0 ? "+" : ""}{m.last3Avg.toFixed(1)}
                    </div>
 <div className="c-muted fs-10" >{m.label}</div>
                  </div>
                );
              })}
            </div>
            <div className="chart-legend-mb6">
              <span><span className="chart-legend-dot" style={{ background: SC.warn }} />Bur. 1-3</span>
              <span><span className="chart-legend-dot" style={{ background: "var(--chart-5)" }} />Bur. 16-18</span>
            </div>
            {(() => {
              if (filteredCoach.length < 3) return null;
              const last3 = filteredCoach.slice(-3);
              const avgF = last3.reduce((s, m) => s + m.first3Avg, 0) / 3;
              const avgL = last3.reduce((s, m) => s + m.last3Avg, 0) / 3;
              const worse = avgF > avgL ? "arranque" : "fecho";
              const wVal = Math.max(avgF, avgL);
              return (
                <div className={`caConclusion ${wVal > 2 ? "concl-danger" : "concl-success"}`}>
 <div className="caConcText fs-11" style={{ color: scDark(wVal > 2 ? "danger" : "good") }}>
                    {worse === "arranque" && avgF > 1.5
                      ? <>⚠️ Perde mais nos primeiros 3 buracos (+{avgF.toFixed(1)} vs par). Pode ser nervos — aquecer bem e ter rotina pré-jogo.</>
                      : worse === "fecho" && avgL > 1.5
                        ? <>⚠️ Perde mais nos últimos 3 buracos (+{avgL.toFixed(1)} vs par). Fadiga ou perda de foco — hidratação e snacks no B9.</>
                        : <>✅ Bom equilíbrio entre arranque ({avgF > 0 ? "+" : ""}{avgF.toFixed(1)}) e fecho ({avgL > 0 ? "+" : ""}{avgL.toFixed(1)}). Gestão de volta sólida.</>
                    }
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── 5. SCORING DISTRIBUTION SHIFT — Evolução da Distribuição ── */}
          <div className="mb-20">
            <div className="haSubTitle c-blue">📊 Shift da Distribuição — Onde Vão os Scores?</div>
            <div className="muted bjgt-sub">
              Divide os dados em 3 períodos (Início, Meio, Recente) e mostra a distribuição dos scores: que % foram eagle, birdie, par, bogey, double ou triple+.
              Um jogador em evolução deve ver mais verde (pars+birdies) e menos vermelho (doubles+triples) no período recente.
            </div>
            <div className="muted bjgt-sub">Como a distribuição eagle/birdie/par/bogey/double/triple+ está a mudar ao longo do tempo.</div>
            {(() => {
              const thirds = Math.ceil(filteredCoach.length / 3);
              const periods = [
                { label: "Início", data: filteredCoach.slice(0, thirds) },
                { label: "Meio", data: filteredCoach.slice(thirds, thirds * 2) },
                { label: "Recente", data: filteredCoach.slice(-thirds) },
              ].filter(p => p.data.length > 0);
              return (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${periods.length}, 1fr)`, gap: 8 }}>
                  {periods.map(p => {
                    const avgPob = p.data.reduce((s, m) => s + m.pobPct, 0) / p.data.length;
                    const avgBird = p.data.reduce((s, m) => s + m.birdieRate, 0) / p.data.length;
                    const avgDbl = p.data.reduce((s, m) => s + m.dblRate, 0) / p.data.length;
                    const avgTrip = p.data.reduce((s, m) => s + m.tripleRate, 0) / p.data.length;
                    const avgBog = 100 - avgPob - avgDbl - avgTrip;
                    return (
                      <div key={p.label} className="card-detail ta-c">
                        <div className="fw-900-fs11-mb6">{p.label}</div>
                        <div className="fs-9-muted-mb4">{p.data.reduce((s, m) => s + m.n, 0)} rondas</div>
                        {/* Stacked bar */}
                        <div className="flex-h16-bar">
                          {avgBird > 0 && <div style={{ flex: avgBird, background: "var(--chart-2)" }} />}
                          {avgPob - avgBird > 0 && <div style={{ flex: avgPob - avgBird, background: SC.good }} />}
                          {avgBog > 0 && <div style={{ flex: avgBog, background: SC.warn }} />}
                          {avgDbl > 0 && <div style={{ flex: avgDbl, background: SC.danger }} />}
                          {avgTrip > 0 && <div style={{ flex: avgTrip, background: "var(--color-danger-dark)" }} />}
                        </div>
 <div className="fs-10 d-flex jc-between" >
                          <span className="cb-par-ok">Par+: {avgPob.toFixed(0)}%</span>
                          <span className="cb-birdie">Dbl+: {(avgDbl + avgTrip).toFixed(0)}%</span>
                        </div>
 <div className="fw-600 c-chart-2 fs-10" >🦅 {avgBird.toFixed(1)}%</div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* ── 6. SD TREND — Score Differential (mais significativo que gross) ── */}
          {filteredCoach.some(m => m.avgSD != null) && (
            <div className="mb-8">
              <div className="haSubTitle c-navy">📉 Score Differential (SD) — O Indicador que Conta</div>
              <div className="muted bjgt-sub">
                O SD normaliza o score para a dificuldade do campo: SD = (113 ÷ Slope) × (Gross − Course Rating).
                Permite comparar rondas em campos diferentes. É o indicador usado pelo WHS para calcular o handicap.
                Quanto mais baixo, melhor. A barra escura abaixo de cada mês mostra o melhor SD do mês.
              </div>
              <div className="muted bjgt-sub">O SD normaliza para a dificuldade do campo. Melhor que o gross para ver evolução real. O HCP baseia-se nos 8 melhores SD das últimas 20 rondas.</div>
 <div className="chart-bars mb-4" style={{ height: 70 }}>
                {filteredCoach.map((m, i) => {
                  if (m.avgSD == null) return <div key={i} className="flex-1" />;
                  const allSDs = filteredCoach.filter(x => x.avgSD != null).map(x => x.avgSD!);
                  const minSD = Math.min(...allSDs);
                  const maxSD = Math.max(...allSDs);
                  const range = maxSD - minSD || 5;
                  const h = ((m.avgSD - minSD + 1) / (range + 2)) * 100;
                  const col = sc3(m.avgSD, 15, 25);
                  return (
                    <div key={i} className="bjgt-bar-col">
 <div className="fs-10 fw-700" style={{ color: col }}>{m.avgSD.toFixed(1)}</div>
                      <div style={{ width: "100%", height: `${h}%`, background: col, borderRadius: "3px 3px 0 0", opacity: 0.7, minHeight: 3 }} />
                      {m.bestSD != null && (
 <div className="fs-10 fw-600" style={{ color: SC.good }}>⬇{m.bestSD.toFixed(1)}</div>
                      )}
                      <div className="fs-7-muted">{m.label}</div>
                    </div>
                  );
                })}
              </div>
              {(() => {
                const withSD = filteredCoach.filter(m => m.avgSD != null);
                if (withSD.length < 3) return null;
                const first = withSD.slice(0, Math.ceil(withSD.length / 3));
                const last = withSD.slice(-Math.ceil(withSD.length / 3));
                const fSD = first.reduce((s, m) => s + m.avgSD!, 0) / first.length;
                const lSD = last.reduce((s, m) => s + m.avgSD!, 0) / last.length;
                const allBest = filteredCoach.filter(m => m.bestSD != null).map(m => m.bestSD!);
                const overallBest = allBest.length > 0 ? Math.min(...allBest) : null;
                return (
                  <div className={`caConclusion ${lSD < fSD - 1 ? "concl-success" : "concl-info"}`}>
 <div className="caConcText fs-11" style={{ color: scDark(lSD < fSD - 1 ? "good" : "info") }}>
                      SD médio: {fSD.toFixed(1)} → {lSD.toFixed(1)} {lSD < fSD - 1 ? "📉 a baixar — evolução real!" : lSD > fSD + 1 ? "📈 a subir — pode ser campos mais duros" : "— estável"}.
                      {overallBest != null && <> Melhor SD de sempre: <b>{overallBest.toFixed(1)}</b>.</>}
                      {hcp != null && <> HCP actual: <b>{hcp.toFixed(1)}</b>.</>}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Summary table for coaches ── */}
          <div className="mt-12">
            <div className="haSubTitle">📋 Resumo para o Treinador</div>
            <div className="tourn-scroll">
            <table className="sc-table-modern bjgt-mini-table-sm">
              <thead><tr>
                <th className="row-label">Mês</th>
                <th>Rondas</th>
                <th>μ Gross</th>
                <th>σ</th>
                <th>Par+%</th>
                <th>🦅%</th>
                <th>Dbl%</th>
                <th>Bounce</th>
                <th>Streak</th>
                <th>#1-3</th>
                <th>#16-18</th>
                {filteredCoach.some(m => m.avgSD != null) && <th>μ SD</th>}
              </tr></thead>
              <tbody>
                {filteredCoach.map(m => (
                  <tr key={m.month}>
                    <td className="row-label fw-700">{m.label}</td>
                    <td>{m.n}</td>
                    <td className="fw-700">{m.avgGross.toFixed(0)}</td>
                    <td style={{ color: sc3(m.grossStdDev, 3, 5) }}>{m.n >= 2 ? m.grossStdDev.toFixed(1) : "–"}</td>
 <td className="fw-600" style={{ color: SC.good }}>{m.pobPct.toFixed(0)}</td>
                    <td className="c-blue">{m.birdieRate.toFixed(1)}</td>
                    <td className="c-birdie">{m.dblRate.toFixed(0)}</td>
                    <td style={{ color: m.bounceRate != null ? sc2w(m.bounceRate, 40, "desc") : SC.warn }}>{m.bounceRate != null ? `${m.bounceRate.toFixed(0)}%` : "–"}</td>
                    <td className="c-blue">{m.avgPobStreak.toFixed(1)}</td>
                    <td style={{ color: sc2(m.first3Avg, 1.5) }}>{m.first3Avg > 0 ? "+" : ""}{m.first3Avg.toFixed(1)}</td>
                    <td style={{ color: sc2(m.last3Avg, 1.5) }}>{m.last3Avg > 0 ? "+" : ""}{m.last3Avg.toFixed(1)}</td>
                    {filteredCoach.some(x => x.avgSD != null) && <td className="fw-600">{m.avgSD != null ? m.avgSD.toFixed(1) : "–"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="muted fs-8-mt4">σ = desvio-padrão do gross · Par+% = par ou melhor · 🦅% = birdies · Dbl% = doubles+ · Bounce = % par+ após double · Streak = melhor série consecutiva de par+ · #1-3/#16-18 = vs par nos primeiros/últimos 3 buracos · SD = Score Differential</div>
          </div>
        </div>
      )}

      {/* ── VP Buraco a Buraco: eclético + scores + cross-ref ── */}
      {vpHoleProfiles.length > 0 && (
        <div className="holeAnalysis">
          <div className="haTitle">🗺️ VP Flamingos — Manuel vs Field vs Top 5</div>
          <div className="muted fs-10 mb-8">
            Scorecard comparativo buraco a buraco. Cada coluna é um buraco (1-18). Mostra os 3 dias do Manuel, o eclético, e as médias do field e Top 5 do BJGT 2025.
            <br />μ M = média do Manuel nos 3 dias · μ T5 = média dos 5 melhores · μ Field = média dos {FIELD_2025.nPlayers} jogadores · Diff = Manuel − Field (negativo = melhor que o field).
          </div>
          <div className="tourn-scroll">
          <table className="sc-table-modern w-full fs-9">
            <thead>
              <tr>
                <th className="row-label" style={{ minWidth: 55 }}></th>
                {vpHoleProfiles.map(h => (
                  <th key={h.h} className="ta-c" style={{ minWidth: 28 }}>{h.h}</th>
                ))}
                <th className="sc-cell-sep">Tot</th>
              </tr>
            </thead>
            <tbody>
              {/* Par row */}
              <tr className="bg-page">
                <td className="row-label fw-700-muted">Par</td>
                {vpHoleProfiles.map(h => (
                  <td key={h.h} className="ta-c c-muted">{h.par}</td>
                ))}
                <td className="ta-c fw-700-muted bl-border">{tp}</td>
              </tr>
              {/* Manuel day rows */}
              {vpCards.map((c, di) => {
                const g = c.h.g.slice(0, nH);
                const rdTotal = g.reduce((a, b) => a + (b ?? 0), 0);
                return (
                  <tr key={di} className="b-light cross-sep">
                    <td className="row-label fw-700">D{di + 1}</td>
                    {g.map((s, hi) => (
                      <td key={hi} className="ta-c">
                        {s != null ? <ScoreCircle gross={s} par={vpHoleProfiles[hi]?.par ?? 4} size="small" /> : "·"}
                      </td>
                    ))}
                    <td className="sc-cell-sep-bold">{rdTotal}</td>
                  </tr>
                );
              })}
              {/* Eclectic row */}
              {ecl && (
                <tr className="bg-success bt-section">
                  <td className="row-label fw-800">ECL</td>
                  {ecl.holes.map((eh, hi) => (
                    <td key={hi} className="ta-c">
                      {eh.best != null ? <ScoreCircle gross={eh.best} par={vpHoleProfiles[hi]?.par ?? 4} size="small" /> : "·"}
                    </td>
                  ))}
                  <td className="sc-cell-sep">{ecl.totalGross}</td>
                </tr>
              )}
              {/* μ Manuel */}
              <tr className="bt-dark">
                <td className="row-label fw-700">μ M</td>
                {vpHoleProfiles.map(h => (
                  <td key={h.h} className="ta-c fw-600 fs-9">{h.vpAvg.toFixed(1)}</td>
                ))}
                <td className="sc-cell-sep-bold">
                  {daySummaries.length > 0 ? (daySummaries.reduce((a, d) => a + d.gross, 0) / daySummaries.length).toFixed(0) : "–"}
                </td>
              </tr>
              {/* μ T5 */}
              <tr>
                <td className="row-label fw-700">μ T5</td>
                {vpHoleProfiles.map(h => {
                  const fh = FIELD_2025.holes.find(x => x.h === h.h);
                  return <td key={h.h} className="ta-c fs-9">{fh?.t5.toFixed(1) ?? "–"}</td>;
                })}
                <td className="ta-c fw-600 bl-border">{FIELD_2025.top5Avg.toFixed(0)}</td>
              </tr>
              {/* μ Field */}
              <tr>
                <td className="row-label fw-700">μ Field</td>
                {vpHoleProfiles.map(h => {
                  const fh = FIELD_2025.holes.find(x => x.h === h.h);
                  return <td key={h.h} className="ta-c fs-9 c-text-3">{fh?.fAvg.toFixed(1) ?? "–"}</td>;
                })}
                <td className="ta-c c-text-3 bl-border">{FIELD_2025.fieldAvg.toFixed(0)}</td>
              </tr>
              {/* Diff row */}
              <tr className="bt-border">
                <td className="row-label fw-700">Diff</td>
                {vpHoleProfiles.map(h => {
                  const fh = FIELD_2025.holes.find(x => x.h === h.h);
                  const d = fh ? h.vpAvg - fh.fAvg : 0;
                  const col = d < -0.2 ? SC.good : d <= 0.2 ? SC.muted : d <= 0.5 ? SC.warn : SC.danger;
 return <td key={h.h} className="ta-center fw-700 fs-10" style={{ color: col }}>{d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1)}</td>;
                })}
                <td className="bl-border"></td>
              </tr>
            </tbody>
          </table>
          </div>
          <div className="muted fs-9-mt4">
            ECL = eclético (melhor score em cada buraco nos 3 dias) · Diff: vermelho = pior que o field, verde = melhor que o field.
          </div>
          
          {/* Key takeaway: where Manuel loses most vs field */}
          {(() => {
            const diffs = vpHoleProfiles.map(h => {
              const fh = FIELD_2025.holes.find(x => x.h === h.h);
              return { h: h.h, diff: fh ? h.vpAvg - fh.fAvg : 0 };
            }).sort((a, b) => b.diff - a.diff);
            const losing = diffs.filter(d => d.diff > 0.3).slice(0, 4);
            const gaining = diffs.filter(d => d.diff < -0.2).slice(-3);
            if (losing.length === 0) return null;
            return (
              <div className="caConclusion concl-danger mt-8">
                <div className="caConcTitle c-dark-red">📉 Onde o Manuel perde mais vs o field</div>
 <div className="caConcText c-danger-darker" >
                  Buracos {losing.map(d => `#${d.h} (+${d.diff.toFixed(1)})`).join(", ")} — aqui perdes {losing.reduce((a, d) => a + d.diff, 0).toFixed(1)} pancadas por ronda vs a média.
                  {gaining.length > 0 && <> Mas nos buracos {gaining.map(d => `#${d.h}`).join(", ")} estás <b>melhor</b> que o field!</>}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Como foi o ano passado ── */}
      <div className="holeAnalysis">
        <div className="haTitle">📋 Como foi em {TOURN.dates.split("–")[0].trim()} 2025</div>

        {/* Day summary cards */}
        {daySummaries.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(daySummaries.length, 3)}, 1fr)`, gap: 8, marginBottom: 12 }}>
            {daySummaries.map(d => {
              const isBest = bestDay && d.idx === bestDay.idx;
              const isWorst = worstDay && d.idx === worstDay.idx && daySummaries.length > 1;
              const border = isBest ? SC.good : isWorst ? SC.danger : "var(--border)";
              const bg = isBest ? "var(--bg-success)" : isWorst ? "var(--bg-danger)" : "var(--bg-card)";
              return (
                <div key={d.idx} style={{ border: `2px solid ${border}`, borderRadius: "var(--radius-lg)", padding: "10px 12px", background: bg }}>
                  <div className="flex-between-mb6">
                    <span className="fw-900 fs-13">Dia {d.idx}</span>
                    <span className="muted fs-10">{d.date}</span>
                  </div>
 <div className="fw-900" style={{ fontSize: 28, color: isBest ? SC.good : isWorst ? SC.danger : "var(--text)" }}>{d.gross}</div>
                  <div className="muted fs-10 mb-6">{fmtToPar(d.gross - tp)}</div>
                  <div className="flex-gap8-fs10">
                    <span>F9: <b>{d.f9}</b></span>
                    {nH >= 18 && <span>B9: <b>{d.b9}</b></span>}
                  </div>
 <div className="fs-10 mt-4 gap-8 c-text-3 d-flex" >
                    <span className="c-par-ok">⛳{d.pars}</span>
                    <span className="c-birdie">💣{d.doubles}</span>
                    {d.birdies > 0 && <span className="c-eagle">🐦{d.birdies}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Key insight: what made the best day better? */}
        {bestDay && worstDay && bestDay.idx !== worstDay.idx && (
 <div className="caConclusion concl-success mb-8" >
            <div className="caConcTitle c-green-166">💡 O que fez a diferença no Dia {bestDay.idx}?</div>
 <div className="caConcText c-good-darker" >
              {bestDay.doubles < worstDay.doubles && <>Menos {worstDay.doubles - bestDay.doubles} double{worstDay.doubles - bestDay.doubles > 1 ? "s" : ""}. </>}
              {bestDay.pars > worstDay.pars && <>Mais {bestDay.pars - worstDay.pars} par{bestDay.pars - worstDay.pars > 1 ? "es" : ""} ou melhor. </>}
              {nH >= 18 && bestDay.b9 < worstDay.b9 - 2 && <>Back 9 mais controlado ({bestDay.b9} vs {worstDay.b9}). </>}
              A diferença entre um bom dia e um mau dia neste campo são os doubles — não as grandes jogadas.
            </div>
          </div>
        )}

        {/* F9 vs B9 */}
        {nH >= 18 && f9avg != null && b9avg != null && (
          <div className="haDiag mb-8">
            <div className="haDiagCard">
              <div className="haDiagIcon diag-info">1️⃣</div>
              <div className="haDiagBody">
                <div className="haDiagVal c-blue">{f9avg.toFixed(0)}</div>
                <div className="haDiagLbl">média Front 9 ({fmtToPar(Math.round(f9avg - f9par))})</div>
              </div>
            </div>
            <div className="haDiagCard">
              <div className={`haDiagIcon ${Math.round(b9avg) > Math.round(f9avg) + 2 ? "diag-danger" : "diag-good"}`}>🔟</div>
              <div className="haDiagBody">
                <div className="haDiagVal" style={{ color: Math.round(b9avg) > Math.round(f9avg) + 2 ? SC.danger : "var(--text)" }}>{b9avg.toFixed(0)}</div>
                <div className="haDiagLbl">média Back 9 ({fmtToPar(Math.round(b9avg - b9par))})</div>
              </div>
            </div>
            {Math.abs(f9avg - b9avg) > 2 && (
              <div className="haDiagCard">
                <div className="haDiagIcon diag-warn">⚡</div>
                <div className="haDiagBody">
                  <div className="haDiagVal c-eagle">{Math.abs(f9avg - b9avg).toFixed(0)}</div>
                  <div className="haDiagLbl">{f9avg > b9avg ? "Front 9 custa mais — atenção à partida" : "Back 9 custa mais — gerir energia"}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recovery after double */}
        {totalRecovery >= 2 && recoveryRate != null && (
          <div className={`caConclusion ${recoveryRate >= 60 ? "concl-success" : recoveryRate >= 40 ? "concl-warn" : "concl-danger"}`}>
            <div className="caConcTitle" style={{ color: sc3(recoveryRate, 40, 60, "desc") }}>
              {recoveryRate >= 60 ? "💪" : "⚠️"} Recuperação após double
            </div>
            <div className="caConcText" style={{ color: sc3(recoveryRate, 40, 60, "desc") }}>
              Após um double, fizeste bogey ou melhor {goodRecovery} de {totalRecovery} vezes ({recoveryRate.toFixed(0)}%).
              {recoveryRate < 50 && <> Tendência para encadear buracos maus — pratica a rotina de reset: respira, esquece, joga o próximo buraco.</>}
              {recoveryRate >= 60 && <> Boa mentalidade — consegues isolar os maus buracos. Mantém essa força.</>}
            </div>
          </div>
        )}
      </div>

      {/* ── Buracos-chave: onde estudar na volta de treino ── */}
      <div className="holeAnalysis">
        <div className="haTitle">🔍 Mapa do Campo — Onde Estudar</div>

        {/* Trap holes */}
        {trapHoles.length > 0 && (
          <div className="mb-12">
            <div className="haSubTitle c-birdie">🚨 Buracos Armadilha ({trapHoles.length})</div>
            <div className="muted fs-10 mb-6">Fizeste double+ em 2 ou mais dias. Na volta de treino, estuda ESTES buracos com atenção.</div>
            <div className="bjgt-diag-grid">
              {trapHoles.map(h => (
 <div key={h.h} className="section-card-danger">
                  <div className="d-flex justify-between items-end">
                    <span className="bjgt-kpi-val">#{h.h}</span>
                    <span className="muted fs-10">Par {h.par}</span>
                  </div>
                  <div className="d-flex gap-4 mb-4 mt-4">
                    {h.scores.map((s, i) => <ScoreCircle key={i} gross={s} par={h.par} size="small" />)}
                  </div>
 <div className="fs-10 fw-600 c-danger-dark-inline" >
                    μ {h.avg.toFixed(1)} · {h.dblCount}× double+
                    {(() => { const fh = FIELD_2025.holes.find(x => x.h === h.h); return fh ? <span className="muted"> · field {fh.fAvg.toFixed(1)}</span> : null; })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Strong holes */}
        {strongHoles.length > 0 && (
          <div className="mb-12">
            <div className="haSubTitle c-par-ok">💪 Buracos Fortes ({strongHoles.length})</div>
            <div className="muted fs-10 mb-6">Fizeste par ou melhor em metade dos dias ou mais. Aqui podes atacar.</div>
            <div className="bjgt-diag-grid">
              {strongHoles.map(h => (
 <div key={h.h} className="section-card-success">
                  <div className="d-flex justify-between items-end">
                    <span className="bjgt-kpi-val">#{h.h}</span>
                    <span className="muted fs-10">Par {h.par}</span>
                  </div>
                  <div className="d-flex gap-4 mb-4 mt-4">
                    {h.scores.map((s, i) => <ScoreCircle key={i} gross={s} par={h.par} size="small" />)}
                  </div>
 <div className="fs-10 fw-600 c-good-dark-inline" >
                    μ {h.avg.toFixed(1)} · {h.parOrBetter}× par ou melhor
                    {(() => { const fh = FIELD_2025.holes.find(x => x.h === h.h); return fh ? <span className="muted"> · T5 {fh.t5.toFixed(1)}</span> : null; })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Volatile holes */}
        {volatileHoles.length > 0 && (
          <div className="mb-8">
            <div className="haSubTitle c-eagle">🎲 Buracos Imprevisíveis ({volatileHoles.length})</div>
            <div className="muted fs-10 mb-6">Grande oscilação entre dias. Precisa de um plano claro — escolhe a jogada segura.</div>
            <div className="bjgt-diag-grid">
              {volatileHoles.slice(0, 4).map(h => (
 <div key={h.h} className="section-card-warn">
                  <div className="d-flex justify-between items-end">
                    <span className="bjgt-kpi-val">#{h.h}</span>
                    <span className="muted fs-10">Par {h.par}</span>
                  </div>
                  <div className="d-flex gap-4 mb-4 mt-4">
                    {h.scores.map((s, i) => <ScoreCircle key={i} gross={s} par={h.par} size="small" />)}
                  </div>
 <div className="fs-10 fw-600 c-warn-dark-inline" >
                    {h.best}–{h.worst} (var. {h.variance.toFixed(1)})
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Volta de Treino ── */}
      <div className="courseAnalysis courseAnalysis-info">
 <div className="caTitle fs-14 c-navy-inline" >🏌️ Checklist — Volta de Treino</div>
        <div className="caConcText" style={{ color: "var(--color-navy)", lineHeight: 1.7 }}>
          {trapHoles.length > 0 && <p className="mb-6">
            <b>1. Estudar buracos armadilha:</b> #{trapHoles.map(h => h.h).join(", #")} — ver onde é o perigo, identificar a jogada segura, testar yardages.
          </p>}
          {volatileHoles.length > 0 && <p className="mb-6">
            <b>2. Definir estratégia para buracos incertos:</b> #{volatileHoles.slice(0, 4).map(h => h.h).join(", #")} — decidir antes de jogar: qual é o plano A?
          </p>}
          <p className="mb-6">
            <b>{trapHoles.length + volatileHoles.length > 0 ? "3" : "1"}. Greens:</b> Ler os greens dos buracos mais difíceis. Os putts contam.
          </p>
          {nH >= 18 && f9avg != null && b9avg != null && Math.round(b9avg) > Math.round(f9avg) + 2 && <p className="mb-6">
            <b>{trapHoles.length + volatileHoles.length > 0 ? "4" : "2"}. Gestão de energia:</b> O Back 9 custou mais ({b9avg!.toFixed(0)} vs {f9avg!.toFixed(0)} no Front). Água, banana, rotina entre holes.
          </p>}
          {strongHoles.length > 0 && <p className="mb-6">
            <b>✅ Confirmar:</b> Buracos #{strongHoles.map(h => h.h).join(", #")} — foram os melhores. Uma passagem rápida para manter a confiança.
          </p>}
          <p className="mb-6">
            <b>💡 Lição do Top 5 (2025):</b> Nos buracos {FIELD_2025.holes.filter(h => h.t5Dbl === 0 && h.fDbl >= 10).map(h => `#${h.h}`).join(", ")}, os 5 melhores fizeram <b>zero doubles</b>. A chave não é atacar — é evitar o erro grande.
          </p>
        </div>
      </div>

      {/* ── KPIs (haDiag style, same as JogadoresPage) ── */}
      <div className="holeAnalysis">
 <div className="haTitle fs-11">📊 Análise de Performance <span className="muted" >({S.nRounds} rondas · Vermelho par {tp})</span></div>
        <div className="haDiag">
          <div className="haDiagCard">
            <div className="haDiagIcon diag-danger">🏌️</div>
            <div className="haDiagBody">
 <div className="haDiagVal c-text" >{S.bestRound ? String(S.bestRound.gross) : "–"}</div>
              <div className="haDiagLbl">melhor gross {S.bestRound ? fmtToPar(S.bestRound.gross - tp) : ""}</div>
            </div>
          </div>
          <div className="haDiagCard">
            <div className="haDiagIcon diag-info">📊</div>
            <div className="haDiagBody">
              <div className="haDiagVal c-blue">{S.avgGross != null ? S.avgGross.toFixed(1) : "–"}</div>
              <div className="haDiagLbl">média gross {S.avgGross != null ? fmtToPar(Math.round(S.avgGross - tp)) : ""}</div>
            </div>
          </div>
          <div className="haDiagCard">
            <div className={`haDiagIcon ${diagLevel(S.totalStrokesLost, 8, 14)}`}>🎯</div>
            <div className="haDiagBody">
              <div className="haDiagVal" style={{ color: sc3(S.totalStrokesLost, 8, 14) }}>+{S.totalStrokesLost.toFixed(1)}</div>
              <div className="haDiagLbl">pancadas perdidas p/ volta vs par</div>
            </div>
          </div>
          <div className="haDiagCard">
            <div className={`haDiagIcon ${diagLevel(pobP, 35, 50, "desc")}`}>⛳</div>
            <div className="haDiagBody">
              <div className="haDiagVal" style={{ color: sc3(pobP, 35, 50, "desc") }}>{pobP.toFixed(0)}%</div>
              <div className="haDiagLbl">par ou melhor ({pobN}/{totN} buracos)</div>
            </div>
          </div>
          <div className="haDiagCard">
            <div className={`haDiagIcon ${diagLevel(dowP, 8, 18)}`}>💣</div>
            <div className="haDiagBody">
              <div className="haDiagVal" style={{ color: sc3(dowP, 8, 18) }}>{dowP.toFixed(0)}%</div>
              <div className="haDiagLbl">double bogey ou pior ({dowN}/{totN})</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Eclético ── */}
      {ecl && ecl.holes.length > 0 && (
        <div className="ecBlock">
          <div className="ecTitle">Eclético (gross) por tee</div>
          <div className="ecHint">Clique num tee na tabela de buracos para ver análise e filtrar rondas.</div>
          {/* Tee header with color */}
 <div className="section-card mt-8" style={{ borderColor: "var(--color-danger)", borderWidth: 2 }}>
 <div className="fw-600 fs-12" style={{ padding: "6px 10px", background: "var(--color-danger-alpha)" }}>
 <span className="sc-pill fs-10 c-white" style={{ background: SC.danger, padding: "2px 10px" }}>Vermelho</span>{" "}
              <span className="cb-blue-800">{ecl.totalGross}</span>
              <span className="muted ml-6">par {tp}</span>
            </div>
            <div className="scroll-x">
            <table className="sc-table-modern w-full">
              <thead><tr>
                <th className="row-label col-w60">BUR.</th>
                {Array.from({ length: 9 }, (_, i) => <th key={i}>{i + 1}</th>)}
                <th className="col-out">OUT</th>
                {ecl.holeCount >= 18 && Array.from({ length: 9 }, (_, i) => <th key={i + 9}>{i + 10}</th>)}
                {ecl.holeCount >= 18 && <th className="col-in">IN</th>}
                <th className="col-total">TOT</th>
              </tr></thead>
              <tbody>
                <tr className="bg-success">
                  <td className="row-label fw-700-fs10-green2">Par</td>
                  {ecl.holes.slice(0, 9).map((h, i) => <td key={i}>{h.par}</td>)}
                  <td className="col-out fw-700">{ecl.holes.slice(0, 9).reduce((s, h) => s + (h.par ?? 0), 0)}</td>
                  {ecl.holeCount >= 18 && ecl.holes.slice(9, 18).map((h, i) => <td key={i}>{h.par}</td>)}
                  {ecl.holeCount >= 18 && <td className="col-in fw-700">{ecl.holes.slice(9, 18).reduce((s, h) => s + (h.par ?? 0), 0)}</td>}
                  <td className="col-total fw-900">{tp}</td>
                </tr>
                {vpHoleProfiles.length > 0 && vpHoleProfiles.some(h => h.meters != null) && (
                <tr className="bg-detail">
                  <td className="row-label fw-600-fs9-text3">m</td>
                  {Array.from({ length: 9 }, (_, i) => {
                    const m = vpHoleProfiles[i]?.meters;
                    return <td key={i} className="fs-9 c-muted">{m ?? "–"}</td>;
                  })}
                  <td className="col-out fs-9 c-muted">{vpHoleProfiles.slice(0, 9).reduce((s, h) => s + (h.meters ?? 0), 0) || "–"}</td>
                  {ecl.holeCount >= 18 && Array.from({ length: 9 }, (_, i) => {
                    const m = vpHoleProfiles[i + 9]?.meters;
                    return <td key={i} className="fs-9 c-muted">{m ?? "–"}</td>;
                  })}
                  {ecl.holeCount >= 18 && <td className="col-in fs-9 c-muted">{vpHoleProfiles.slice(9, 18).reduce((s, h) => s + (h.meters ?? 0), 0) || "–"}</td>}
                  <td className="col-total fs-9 c-muted">{vpHoleProfiles.reduce((s, h) => s + (h.meters ?? 0), 0) || "–"}</td>
                </tr>
                )}
                <tr className="bt-heavy">
                  <td className="row-label cb-blue-10">Eclético</td>
                  {ecl.holes.slice(0, 9).map((h, i) => <td key={i}><ScoreCircle gross={h.best} par={h.par} /></td>)}
                  <td className="col-out fw-700">{ecl.holes.slice(0, 9).reduce((s, h) => s + (h.best ?? h.par ?? 0), 0)}</td>
                  {ecl.holeCount >= 18 && ecl.holes.slice(9, 18).map((h, i) => <td key={i}><ScoreCircle gross={h.best} par={h.par} /></td>)}
                  {ecl.holeCount >= 18 && <td className="col-in fw-700">{ecl.holes.slice(9, 18).reduce((s, h) => s + (h.best ?? h.par ?? 0), 0)}</td>}
                  <td className="col-total fw-900 fs-13">{ecl.totalGross}</td>
                </tr>
                {/* Individual day rows with tee-colored date pills */}
                {cards.filter(c => c.h.g.length >= (ecl!.holeCount >= 18 ? 18 : 9)).slice(0, 5).map(({ r, h }, idx) => {
                  const nH = ecl!.holeCount >= 18 ? 18 : 9;
                  const out = h.g.slice(0, 9).reduce((a: number, b) => a + (b ?? 0), 0);
                  const inn = nH >= 18 ? h.g.slice(9, 18).reduce((a: number, b) => a + (b ?? 0), 0) : 0;
                  const trDate = r.date ? r.date.substring(0, 5).replace("-", "/") : "";
                  return (
                    <tr key={idx} style={{ background: "rgba(220,38,38,0.04)" }}>
                      <td className="row-label fs-10">
 <span className="sc-pill fs-10 c-white" style={{ background: SC.danger, padding: "1px 6px" }}>{trDate}</span>
                      </td>
                      {h.g.slice(0, 9).map((s, i) => <td key={i}><ScoreCircle gross={s} par={ecl!.holes[i]?.par} size="small" /></td>)}
                      <td className="col-out fs-10-fw600">{out}</td>
                      {nH >= 18 && h.g.slice(9, 18).map((s, i) => <td key={i}><ScoreCircle gross={s} par={ecl!.holes[i + 9]?.par} size="small" /></td>)}
                      {nH >= 18 && <td className="col-in fs-10-fw600">{inn}</td>}
                      <td className="col-total fw-700">{out + inn}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Distribuição ── */}
      <div className="holeAnalysis">
        <div className="haTitle">Distribuição de Scores</div>
 <div className="d-flex gap-6 mb-16">
        {[
          { l: "Eagle+", n: S.totalDist.eagle, c: "eagle" }, { l: "Birdie", n: S.totalDist.birdie, c: "birdie" },
          { l: "Par", n: S.totalDist.par, c: "par" }, { l: "Bogey", n: S.totalDist.bogey, c: "bogey" },
          { l: "Double", n: S.totalDist.double, c: "double" }, { l: "Triple+", n: S.totalDist.triple, c: "triple" },
        ].map(x => (
 <div key={x.l} className="ta-center" style={{ flex: Math.max(x.n, 1) }}>
 <div className={`sc-score ${x.c} fw-900 fs-16 br-default w-full`} style={{ padding: "6px 0" }}>{x.n}</div>
 <div className="fw-700 c-muted fs-10 mt-3">{x.l}</div>
 <div className="c-border-heavy fs-10" >{totN > 0 ? `${(x.n / totN * 100).toFixed(0)}%` : ""}</div>
          </div>
        ))}
      </div>
      </div>

      {/* ── Par types ── */}
      {Object.values(S.byParType).length > 1 && (
        <div className="holeAnalysis">
          <div className="haSubTitle">Desempenho por Tipo de Buraco</div>
          <div className="haParGrid mb-16">
            {[3, 4, 5].map(pt => S.byParType[String(pt)]).filter(Boolean).map(d => {
              const isW = worstPT === d;
              const col = sc3(d.avgVsPar ?? 0, 0.1, 0.4);
              return (
                <div key={d.par} className="haParCard" style={isW ? { borderColor: "var(--border-danger)", background: "var(--bg-danger)" } : undefined}>
                  <div className="flex-between-mb6">
                    <span className="bjgt-kpi-val">Par {d.par}</span>
                    <span className="muted">{d.nHoles} bur.</span>
                  </div>
 <div className="fw-900" style={{ fontSize: 20, color: col }}>
                    {(d.avgVsPar ?? 0) >= 0 ? "+" : ""}{(d.avgVsPar ?? 0).toFixed(2)}
                  </div>
                  <div className="muted mb-6-fs10">média vs par por buraco</div>
 <div className="overflow-hidden br-sm d-flex" style={{ height: 8, gap: 1 }}>
                    {d.parOrBetterPct > 0 && <div className="seg-birdie" style={{ flex: d.parOrBetterPct }} />}
                    {100 - d.parOrBetterPct - d.doubleOrWorsePct > 0 && <div className="seg-bogey" style={{ flex: 100 - d.parOrBetterPct - d.doubleOrWorsePct }} />}
                    {d.doubleOrWorsePct > 0 && <div className="seg-double" style={{ flex: d.doubleOrWorsePct }} />}
                  </div>
 {isW && <div className="fs-10 fw-700 mt-4" style={{ color: SC.danger }}>⚠ Tipo mais difícil</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── F9 vs B9 ── */}
      {S.f9b9 && Math.abs(S.f9b9.f9.strokesLost - S.f9b9.b9.strokesLost) > 0.3 && (
        <div className="haDiag mb-16">
          <div className="haDiagCard">
            <div className="haDiagIcon diag-purple">🔄</div>
            <div className="haDiagBody">
              <div className="haDiagVal c-purple">{S.f9b9.f9.strokesLost > S.f9b9.b9.strokesLost ? "Front 9" : "Back 9"}</div>
              <div className="haDiagLbl">custa mais {Math.abs(S.f9b9.f9.strokesLost - S.f9b9.b9.strokesLost).toFixed(1)} panc./ronda</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tabela buraco a buraco ── */}
      <h3 className="tourn-h3">📊 Todos os Buracos</h3>
      <div className="tourn-scroll mb-16">
        <table className="tourn-table">
          <thead><tr>
            <th className="col-w40">Bur.</th>
            <th className="r col-w30">Par</th>
            <th className="r col-w30">SI</th>
            <th className="r col-w50">Média</th>
            <th className="r col-w50">vs Par</th>
            <th className="r" style={{ width: 35 }}>Best</th>
            <th className="col-mw120">Scores</th>
          </tr></thead>
          <tbody>
            {S.holes.map(h => {
              const vp = h.avg != null ? h.avg - (h.par ?? 4) : null;
              const bg = (h.strokesLost ?? 0) > 0.5 ? "var(--bg-danger)" : (h.strokesLost ?? 0) <= 0 ? "var(--bg-success)" : undefined;
              return (
                <tr key={h.h} style={{ background: bg }}>
                  <td className="fw-800">{h.h}</td>
                  <td className="r">{h.par}</td>
                  <td className="r muted">{h.si}</td>
                  <td className="r tourn-mono fw-700">{h.avg?.toFixed(1) ?? "–"}</td>
 <td className="r fw-800" style={{ color: vp == null ? SC.muted : sc3(vp, 0, 0.4) }}>
                    {vp != null ? (vp >= 0 ? "+" : "") + vp.toFixed(2) : "–"}
                  </td>
                  <td className="r"><ScoreCircle gross={h.best ?? null} par={h.par ?? 4} size="small" /></td>
                  <td>{h.dist && <MiniBar d={h.dist} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Plano de Jogo ── */}
      <div className="courseAnalysis courseAnalysis-accent">
 <div className="caTitle fs-14" >🗺️ Plano de Jogo — {TOURN.days} Dias em Málaga</div>
 <div className="caConcText c-text lh-17">
          {dowN > 0 && <p className="mb-8">
            <b>🚨 Regra nº1:</b> Evitar doubles! Tiveste <b>{dowN}</b> em {totN} buracos.
            Quando estás em apuros, joga para o centro do green — um bogey é sempre melhor que um double.
          </p>}
          {worstPT && (worstPT.avgVsPar ?? 0) > 0.3 && <p className="mb-8">
            <b>{worstPT.par === 3 ? "⛳" : worstPT.par === 4 ? "🏌️" : "🦅"} Par {worstPT.par}s:</b>{" "}
            {worstPT.par === 3 ? "Acerta no green — o centro dá-te par." :
              worstPT.par === 4 ? "A chave é um bom drive no fairway." :
              "Divide em 3 pancadas, não tentes chegar em 2."}
          </p>}
          {trapHoles.length > 0 && <p className="mb-8">
            <b>🎯 Proteger:</b> Buracos #{trapHoles.map(h => h.h).join(", #")} — foram armadilha no ano passado. Joga seguro, o centro do green é o teu amigo.
          </p>}
          {strongHoles.length > 0 && <p className="mb-8">
            <b>💪 Atacar:</b> Buracos #{strongHoles.map(h => h.h).join(", #")} — aqui jogas bem, confia!
          </p>}
          <p className="mb-8">
            <b>🧠 São {TOURN.days} dias!</b> O torneio não se ganha no 1º dia. Paciência, rotina, água.
          </p>
          {bestDay && worstDay && bestDay.doubles < worstDay.doubles && <p>
            <b>💪</b> No teu melhor dia fizeste {bestDay.doubles} double{bestDay.doubles !== 1 ? "s" : ""}, no pior {worstDay.doubles}. A diferença está aí — evitar os buracos grandes é a chave.
          </p>}
          {recoveryRate != null && recoveryRate < 50 && <p>
            <b>🧘</b> Depois de um double, respira fundo. Rotina de reset: esquece o último, joga O PRÓXIMO buraco.
          </p>}
          <p className="mb-8">
            <b>🏆 Benchmark:</b> O 5º lugar em 2025 fez {FIELD_2025.leaderboard[4]?.total} ({fmtToPar(FIELD_2025.leaderboard[4]?.result)}), ou ~{FIELD_2025.top5Avg.toFixed(0)}/ronda. 
            {ecl && <> O teu eclético é {ecl.totalGross} — se juntares o melhor de cada buraco, é número de Top 5.</>}
          </p>
        </div>
      </div>

      </>}

      {!selectedPlayer && (
        <div className="ta-c" style={{ margin: "20px 0" }}>
          <Link to={`/jogadores/${fed}`} className="filter-pill active" style={{ textDecoration: "none", padding: "8px 20px", fontSize: 13, height: "auto" }}>
            Ver perfil completo do {PLAYER_NAME} →
          </Link>
        </div>
      )}

        </div>{/* /course-detail */}
      </div>{/* /master-detail */}
    </div>
  );
}

/* ═══════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════ */
function Header() {
  return (
    <div className="tourn-header">
      <div className="tourn-header-top">
        <h1 className="tourn-title">🇪🇸 {TOURN.name}</h1>
      </div>
      <div className="tourn-header-info">
        <span>📅 {TOURN.dates}</span>
        <span>📍 {TOURN.location}</span>
        <span>⛳ {TOURN.days} dias</span>
        <span>🏷️ {PLAYER_NAME} · Sub-12</span>
      </div>
    </div>
  );
}

function MiniBar({ d }: { d: { eagle: number; birdie: number; par: number; bogey: number; double: number; triple: number } }) {
  const tot = Object.values(d).reduce((a, b) => a + b, 0);
  if (!tot) return <span className="muted">–</span>;
  const segs = [
    { n: d.eagle + d.birdie, cls: "seg-birdie" },
    { n: d.par, cls: "seg-par" },
    { n: d.bogey, cls: "seg-bogey" },
    { n: d.double + d.triple, cls: "seg-double" },
  ];
  return (
 <div className="overflow-hidden br-sm d-flex" style={{ height: 14, gap: 1 }}>
      {segs.filter(s => s.n > 0).map((s, i) => (
 <div key={i} className={`${s.cls} d-flex ai-center jc-center fs-10 fw-700 c-white`} style={{ flex: s.n }}>
          {s.n}
        </div>
      ))}
    </div>
  );
}
