/**
 * RivaisIntlPage.tsx — Rivais Internacionais
 *
 * Dashboard comparativo de todos os rivais do Manuel
 * em torneios internacionais.
 */
import React, { useMemo, useState } from "react";
import { fmtToPar, fmtSign } from "../utils/format";
import { linearSlopeXY } from "../utils/mathUtils";
import { scClass, toParClass, sc3m, SC, tpColorDark } from "../utils/scoreDisplay";
import { isCalUnlocked } from "../utils/authConstants";
import PasswordGate from "../ui/PasswordGate";
import EmptyState from "../ui/EmptyState";
import KpiCard from "../ui/KpiCard";
import { buildAutoRivals, normName, getScorecards, uskTournNames, uskFieldSizes } from "./rivaisDataLoader";


/* ═══════════════════════════════════
   TYPES
   ═══════════════════════════════════ */
interface TournResult { p: number; t: number; tp: number; rd: number[] }
interface RivalPlayer {
  n: string;
  co: string;
  isM?: boolean;
  dob?: string;          // "DD/MM/YYYY" quando conhecida
  r: Record<string, TournResult>;
  up: string[];
}

interface TournDef {
  id: string; name: string; short: string; date: string;
  rounds: number; par: number; field: number; nations: number;
  intendedRounds?: number; url: string;
  dateExact?: string;    // "YYYY-MM-DD" para cálculo de DOB
  ageMin?: number;       // escalão: idade mínima
  ageMax?: number;       // escalão: idade máxima
}

/** Deriva label de escalão a partir de ageMin/ageMax */
function ageLabel(ageMin?: number, ageMax?: number): string | null {
  if (ageMin == null && ageMax != null) return `Sub-${ageMax}`;
  if (ageMin == null || ageMax == null) return null;
  if (ageMin === ageMax) return `Boys ${ageMin}`;
  return `Boys ${ageMin}-${ageMax}`;
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

const FL: Record<string,string> = {"Portugal":"🇵🇹","Spain":"🇪🇸","England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Russian Federation":"🇷🇺","Bulgaria":"🇧🇬","Switzerland":"🇨🇭","Italy":"🇮🇹","France":"🇫🇷","Ireland":"🇮🇪","Northern Ireland":"🇬🇧","Germany":"🇩🇪","Netherlands":"🇳🇱","Norway":"🇳🇴","Lithuania":"🇱🇹","Thailand":"🇹🇭","United States":"🇺🇸","United Kingdom":"🇬🇧","Sweden":"🇸🇪","Morocco":"🇲🇦","Wales":"🏴󠁧󠁢󠁷󠁬󠁳󠁿","Belgium":"🇧🇪","Slovenia":"🇸🇮","Ukraine":"🇺🇦","Romania":"🇷🇴","China":"🇨🇳","Philippines":"🇵🇭","Slovakia":"🇸🇰","United Arab Emirates":"🇦🇪","Turkey":"🇹🇷","India":"🇮🇳","Viet Nam":"🇻🇳","Kazakhstan":"🇰🇿","Hungary":"🇭🇺","South Africa":"🇿🇦","Singapore":"🇸🇬","Denmark":"🇩🇰","Mexico":"🇲🇽","Canada":"🇨🇦","Austria":"🇦🇹","Paraguay":"🇵🇾","Brazil":"🇧🇷","Jersey":"🇯🇪","Nigeria":"🇳🇬","Oman":"🇴🇲","Chile":"🇨🇱","Colombia":"🇨🇴","Puerto Rico":"🇵🇷","Costa Rica":"🇨🇷","Great Britain":"🇬🇧","Latvia":"🇱🇻","South Korea":"🇰🇷","Australia":"🇦🇺","Japan":"🇯🇵","New Zealand":"🇳🇿","Finland":"🇫🇮","Taiwan":"🇹🇼","Hong Kong":"🇭🇰","Indonesia":"🇮🇩","Estonia":"🇪🇪","Armenia":"🇦🇲","Barbados":"🇧🇧","Bahamas":"🇧🇸","Bolivia":"🇧🇴","Dominican Republic":"🇩🇴","Algeria":"🇩🇿","Ecuador":"🇪🇨","Guatemala":"🇬🇹","Honduras":"🇭🇳","Kenya":"🇰🇪","Cambodia":"🇰🇭","Nicaragua":"🇳🇮","Panama":"🇵🇦","Peru":"🇵🇪","El Salvador":"🇸🇻","Uganda":"🇺🇬","Uruguay":"🇺🇾","Venezuela":"🇻🇪","Czech Republic":"🇨🇿","Poland":"🇵🇱","Argentina":"🇦🇷","Cyprus":"🇨🇾","Lebanon":"🇱🇧"};

const T: TournDef[]=[
  {id:"brjgt25",name:"WJGC 2025",short:"WJGC",date:"Fev 2025",rounds:3,par:71,field:40,nations:17,dateExact:"2025-02-24",ageMin:10,ageMax:11,url:"https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/34/leaderboard.htm"},
  {id:"eowagr25",name:"European Open",short:"EU Open",date:"Ago 2025",rounds:3,par:72,field:8,nations:6,dateExact:"2025-08-01",ageMin:11,ageMax:12,url:"https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/21/leaderboard.htm"},
  {id:"venice25",name:"Venice Open 2025",short:"Venice",date:"Ago 2025",rounds:3,par:72,field:39,nations:16,dateExact:"2025-08-07",ageMin:11,ageMax:11,url:"https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/515206/venice-open-2025/results"},
  {id:"rome25",name:"Rome Classic 2025",short:"Rome",date:"Out 2025",rounds:2,par:72,field:14,nations:6,dateExact:"2025-10-18",ageMin:11,ageMax:11,url:"https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516026/rome-classic-2025/results"},
  {id:"doral25",name:"Doral Junior 2025",short:"Doral",date:"Dez 2025",rounds:2,par:71,field:35,nations:13,dateExact:"2025-12-18",ageMin:11,ageMax:11,url:"https://www.golfgenius.com/v2tournaments/4222407?called_from=widgets%2Fcustomized_tournament_results&hide_totals=false&player_stats_for_portal=true"},
  {id:"qdl25",name:"QDL Junior Open 2025",short:"QDL",date:"Nov 2025",rounds:1,par:72,field:12,nations:7,intendedRounds:3,dateExact:"2025-11-08",ageMax:12,url:"https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=962&tcode=10080&classif_order=2"},
  {id:"gg26",name:"Greatgolf Junior Open",short:"GG",date:"Fev 2026",rounds:2,par:72,field:12,nations:4,dateExact:"2026-02-08",ageMax:12,url:"https://scoring-pt.datagolf.pt/scripts/classif.asp?tourn=10296&club=935&ack=OT342GH16T"},
  {id:"wjgc26",name:"WJGC 2026",short:"WJGC26",date:"Fev 2026",rounds:3,par:72,field:38,nations:18,dateExact:"2026-02-24",ageMin:10,ageMax:11,url:"https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/73/leaderboard.htm"},
  {id:"wjgc26_1213",name:"WJGC 2026",short:"WJGC26↑",date:"Fev 2026",rounds:2,intendedRounds:3,par:73,field:39,nations:17,dateExact:"2026-02-24",ageMin:12,ageMax:13,url:"https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/33/leaderboard.htm"},
];

// Tournament prestige weight: rounds (40%) + field size (35%) + internationality (25%)
// Uses intendedRounds when available (e.g. QDL reduced by weather)
function getTournWeight(tid: string): number {
  // Overrides explícitos — têm prioridade sobre T_WEIGHTS_BASE
  if (tid.startsWith("brjgt") || tid.startsWith("wjgc"))  return 1.2;  // BJGT/WJGC → ★★★★
  if (tid.startsWith("venice") || tid.startsWith("doral")) return 1.2; // Venice/Doral → ★★★★
  if (tid in T_WEIGHTS_BASE) return T_WEIGHTS_BASE[tid];
  if (/^usk\d+_b\d+$/.test(tid)) {
    const base = tid.replace(/_b\d+$/, "");
    const name = (uskTournNames.get(base)?.name ?? "").toLowerCase();
    if (name.includes("world")) return 1.4;       // World Championship → ★★★★★
    if (name.includes("european")) return 1.2;    // European Championship → ★★★★
    if (name.includes("venice")) return 1.2;      // Venice Open → ★★★★
    return 1.0;                                    // Red White & Blue, outros USKids → ★★★
  }
  return 0.3;
}

const T_WEIGHTS_BASE: Record<string, number> = (() => {
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

// Keep T_WEIGHTS as alias for backwards compat in ranking code
const T_WEIGHTS = T_WEIGHTS_BASE;

// Extended tournament names/display for auto-loaded tournaments
// Metadados completos para auto tids que substituem entradas manuais (field, nations, par, url)
const AUTO_TOURN_META: Record<string, { field: number; nations: number; par: number; url?: string }> = {
  wjgc25_b1011: { field: 40, nations: 17, par: 71, url: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/34/leaderboard.htm" },
};

const AUTO_TOURN_NAMES: Record<string, { name: string; short: string; date: string }> = {
  wjgc25_b89:     { name: "WJGC 2025",         short: "WJGC25",   date: "Fev 2025" },
  wjgc25_b1011:   { name: "WJGC 2025",         short: "WJGC25",   date: "Fev 2025" },
  wjgc25_b1213:   { name: "WJGC 2025",         short: "WJGC25",   date: "Fev 2025" },
  wjgc26_b1213:   { name: "WJGC 2026",         short: "WJGC26",   date: "Fev 2026" },
  eowagr25_b78:   { name: "European Open",      short: "EU Open",  date: "Ago 2025" },
  eowagr25_b910:  { name: "European Open",      short: "EU Open",  date: "Ago 2025" },
  eowagr25_b1314: { name: "European Open",      short: "EU Open",  date: "Ago 2025" },
  doral25_b89:    { name: "Doral Junior 2025",  short: "Doral",    date: "Dez 2025" },
  doral25_b1011:  { name: "Doral Junior 2025",  short: "Doral",    date: "Dez 2025" },
  doral25_b1213:  { name: "Doral Junior 2025",  short: "Doral",    date: "Dez 2025" },
  venice25_b9:    { name: "Venice Open 2025",   short: "Venice",   date: "Ago 2025" },
  venice25_b10:   { name: "Venice Open 2025",   short: "Venice",   date: "Ago 2025" },
  venice25_b11:   { name: "Venice Open 2025",   short: "Venice",   date: "Ago 2025" },
  venice25_b12:   { name: "Venice Open 2025",   short: "Venice",   date: "Ago 2025" },
  rome25_b10:     { name: "Rome Classic 2025",  short: "Rome",     date: "Out 2025" },
  rome25_b11:     { name: "Rome Classic 2025",  short: "Rome",     date: "Out 2025" },
  rome25_b12:     { name: "Rome Classic 2025",  short: "Rome",     date: "Out 2025" },
  marco25_b9:     { name: "Marco Simone Inv.",   short: "Marco",    date: "Mar 2025" },
  marco25_b10:    { name: "Marco Simone Inv.",   short: "Marco",    date: "Mar 2025" },
  marco25_b11:    { name: "Marco Simone Inv.",   short: "Marco",    date: "Mar 2025" },
  marco25_b12:    { name: "Marco Simone Inv.",   short: "Marco",    date: "Mar 2025" },
  desert26_b9:    { name: "Desert Shootout",    short: "Desert",   date: "Fev 2026" },
  desert26_b10:   { name: "Desert Shootout",    short: "Desert",   date: "Fev 2026" },
  desert26_b11:   { name: "Desert Shootout",    short: "Desert",   date: "Fev 2026" },
  desert26_b12:   { name: "Desert Shootout",    short: "Desert",   date: "Fev 2026" },
  sandestin26_b9: { name: "Sandestin Champ.",   short: "Sandest",  date: "Jan 2026" },
  sandestin26_b10:{ name: "Sandestin Champ.",   short: "Sandest",  date: "Jan 2026" },
  sandestin26_b11:{ name: "Sandestin Champ.",   short: "Sandest",  date: "Jan 2026" },
  sandestin26_b12:{ name: "Sandestin Champ.",   short: "Sandest",  date: "Jan 2026" },
  msstate26_b9:   { name: "MS State Inv. 2026", short: "MS State", date: "Mar 2026" },
  msstate26_b10:  { name: "MS State Inv. 2026", short: "MS State", date: "Mar 2026" },
  msstate26_b11:  { name: "MS State Inv. 2026", short: "MS State", date: "Mar 2026" },
  msstate26_b12:  { name: "MS State Inv. 2026", short: "MS State", date: "Mar 2026" },
  elprat23_b8:    { name: "El Prat 2023",       short: "El Prat",  date: "Out 2023" },
  elprat23_b9:    { name: "El Prat 2023",       short: "El Prat",  date: "Out 2023" },
  elprat23_b10:   { name: "El Prat 2023",       short: "El Prat",  date: "Out 2023" },
};

/** Lookup tournament display info by id (works for manual T and auto tourns) */
function getTournInfo(tid: string): { name: string; short: string; date: string; dateExact: string } {
  const manual = T.find(t => t.id === tid);
  if (manual) return { name: manual.name, short: manual.short, date: manual.date, dateExact: manual.dateExact ?? manual.date };
  const autoName = AUTO_TOURN_NAMES[tid];
  const autoMap = T_MAP[tid];
  if (autoName) return { ...autoName, dateExact: autoMap?.dateExact ?? autoName.date };
  // USKids completo: "usk{tcode}_b{n}" → lookup via uskTournNames
  const uskMatch = tid.match(/^(usk\d+)_b(\d+)$/);
  if (uskMatch) {
    const base = uskTournNames.get(uskMatch[1]);
    if (base) return { name: base.name, short: base.short, date: base.date, dateExact: base.dateExact };
  }
  return { name: tid, short: tid, date: "?", dateExact: "9999" };
}

/* ═══════════════════════════════════
   DOB DEDUCTION UTILITIES
   ═══════════════════════════════════ */
const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

/** Parse "DD/MM/YYYY" → Date */
function parseDob(s: string): Date {
  const [d, m, y] = s.split("/").map(Number);
  return new Date(y, m - 1, d);
}

/** Age at a given date */
function ageAt(dob: Date, at: Date): number {
  let age = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) age--;
  return age;
}

/** Format age string relative to today (Mar 2026) */
function fmtAge(dob: Date): string {
  const today = new Date(2026, 2, 10);
  const a = ageAt(dob, today);
  // Find next birthday
  const nextBday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
  if (nextBday <= today) nextBday.setFullYear(nextBday.getFullYear() + 1);
  const diffMs = nextBday.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / 86400000);
  const diffMonths = Math.round(diffDays / 30.5);
  if (diffDays <= 60) return `${a} anos · faz ${a+1} em ${diffDays}d`;
  if (diffMonths <= 3) return `${a} anos · faz ${a+1} em ~${diffMonths}m`;
  return `${a} anos`;
}

interface DobInfo {
  exact: boolean;
  dob?: Date;
  dobStr?: string;       // "DD/MM/YYYY"
  rangeMin?: Date;       // earliest possible
  rangeMax?: Date;       // latest possible
  rangeStr: string;      // e.g. "Mar–Dez 2014" or "2014–2015"
  ageStr: string;        // e.g. "11 anos" or "~11 anos"
}

const T_MAP: Record<string, { dateExact?: string; ageMin?: number; ageMax?: number }> = {
  ...Object.fromEntries(T.map(t => [t.id, t])),
  // Auto tourns from rivaisDataLoader
  wjgc25_b89:    { dateExact: "2025-02-24", ageMin: 8,  ageMax: 9  },
  wjgc25_b1011:  { dateExact: "2025-02-24", ageMin: 10, ageMax: 11 },
  wjgc25_b1213:  { dateExact: "2025-02-24", ageMin: 12, ageMax: 13 },
  eowagr25_b78:  { dateExact: "2025-08-01", ageMin: 7,  ageMax: 8  },
  eowagr25_b910: { dateExact: "2025-08-01", ageMin: 9,  ageMax: 10 },
  eowagr25_b1314:{ dateExact: "2025-08-01", ageMin: 13, ageMax: 14 },
  doral25_b89:   { dateExact: "2025-12-19", ageMin: 8,  ageMax: 9  },
  doral25_b1011: { dateExact: "2025-12-19", ageMin: 10, ageMax: 11 },
  doral25_b1213: { dateExact: "2025-12-19", ageMin: 12, ageMax: 13 },
  venice25_b9:   { dateExact: "2025-08-07", ageMin: 9,  ageMax: 9  },
  venice25_b10:  { dateExact: "2025-08-07", ageMin: 10, ageMax: 10 },
  venice25_b11:  { dateExact: "2025-08-07", ageMin: 11, ageMax: 11 },
  venice25_b12:  { dateExact: "2025-08-07", ageMin: 12, ageMax: 12 },
  rome25_b10:    { dateExact: "2025-10-09", ageMin: 10, ageMax: 10 },
  rome25_b11:    { dateExact: "2025-10-09", ageMin: 11, ageMax: 11 },
  rome25_b12:    { dateExact: "2025-10-09", ageMin: 12, ageMax: 12 },
  marco25_b9:    { dateExact: "2025-03-15", ageMin: 9,  ageMax: 9  },
  marco25_b10:   { dateExact: "2025-03-15", ageMin: 10, ageMax: 10 },
  marco25_b11:   { dateExact: "2025-03-15", ageMin: 11, ageMax: 11 },
  marco25_b12:   { dateExact: "2025-03-15", ageMin: 12, ageMax: 12 },
  desert26_b9:   { dateExact: "2026-02-21", ageMin: 9,  ageMax: 9  },
  desert26_b10:  { dateExact: "2026-02-21", ageMin: 10, ageMax: 10 },
  desert26_b11:  { dateExact: "2026-02-21", ageMin: 11, ageMax: 11 },
  desert26_b12:  { dateExact: "2026-02-21", ageMin: 12, ageMax: 12 },
  sandestin26_b9: { dateExact: "2026-01-17", ageMin: 9,  ageMax: 9  },
  sandestin26_b10:{ dateExact: "2026-01-17", ageMin: 10, ageMax: 10 },
  sandestin26_b11:{ dateExact: "2026-01-17", ageMin: 11, ageMax: 11 },
  sandestin26_b12:{ dateExact: "2026-01-17", ageMin: 12, ageMax: 12 },
  msstate26_b9:  { dateExact: "2026-03-09", ageMin: 9,  ageMax: 9  },
  msstate26_b10: { dateExact: "2026-03-09", ageMin: 10, ageMax: 10 },
  msstate26_b11: { dateExact: "2026-03-09", ageMin: 11, ageMax: 11 },
  msstate26_b12: { dateExact: "2026-03-09", ageMin: 12, ageMax: 12 },
  elprat23_b8:   { dateExact: "2023-10-22", ageMin: 8,  ageMax: 8  },
  elprat23_b9:   { dateExact: "2023-10-22", ageMin: 9,  ageMax: 9  },
  elprat23_b10:  { dateExact: "2023-10-22", ageMin: 10, ageMax: 10 },
};

function computeDobInfo(p: RivalPlayer): DobInfo {
  // If exact DOB known
  if (p.dob) {
    const d = parseDob(p.dob);
    return { exact: true, dob: d, dobStr: p.dob, rangeStr: p.dob, ageStr: fmtAge(d) };
  }

  // Deduce from tournaments: each gives a DOB range
  let rangeMin: Date | null = null;
  let rangeMax: Date | null = null;

  for (const tid of Object.keys(p.r)) {
    let td: { dateExact?: string; ageMin?: number; ageMax?: number } | undefined = T_MAP[tid];
    // USKids completo tids: "usk{tcode}_b{n}" → dateExact from uskTournNames, age from suffix
    if (!td) {
      const m = tid.match(/^(usk\d+)_b(\d+)$/);
      if (m) {
        const base = uskTournNames.get(m[1]);
        const age = Number(m[2]);
        if (base) td = { dateExact: base.dateExact, ageMin: age, ageMax: age };
      }
    }
    if (!td?.dateExact || td.ageMin == null || td.ageMax == null) continue;
    const tDate = new Date(td.dateExact);
    // Age at tournament must be in [ageMin, ageMax]
    // Latest DOB (youngest allowed, age = ageMin): born exactly ageMin years before → tDate - ageMin years
    const latestDob = new Date(tDate);
    latestDob.setFullYear(latestDob.getFullYear() - td.ageMin);
    // Earliest DOB (oldest allowed, age = ageMax): born just before ageMax+1 years ago
    // i.e. if born 1 day earlier they'd be ageMax+1
    const earliestDob = new Date(tDate);
    earliestDob.setFullYear(earliestDob.getFullYear() - td.ageMax - 1);
    earliestDob.setDate(earliestDob.getDate() + 1);

    if (!rangeMin || earliestDob > rangeMin) rangeMin = earliestDob;
    if (!rangeMax || latestDob < rangeMax) rangeMax = latestDob;
  }

  if (!rangeMin || !rangeMax || rangeMin > rangeMax) {
    return { exact: false, rangeStr: "?", ageStr: "?" };
  }

  // Format range string
  const minY = rangeMin.getFullYear(), maxY = rangeMax.getFullYear();
  const minM = rangeMin.getMonth(), maxM = rangeMax.getMonth();
  let rangeStr: string;
  if (minY === maxY) {
    if (minM === maxM) {
      rangeStr = `${MONTHS_PT[minM]} ${minY}`;
    } else {
      rangeStr = `${MONTHS_PT[minM]}–${MONTHS_PT[maxM]} ${minY}`;
    }
  } else {
    rangeStr = `${MONTHS_PT[minM]} ${minY} – ${MONTHS_PT[maxM]} ${maxY}`;
  }

  // Estimate age using midpoint
  const midMs = (rangeMin.getTime() + rangeMax.getTime()) / 2;
  const midDob = new Date(midMs);
  const ageStr = "~" + fmtAge(midDob);

  return { exact: false, rangeMin, rangeMax, rangeStr, ageStr };
}

const UP = [
  { id: "marco26", name: "Marco Simone Inv. 2026", short: "M.SIMONE", url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516989/marco-simone-invitational-2026/field" },
];

const D: RivalPlayer[]=[
  {n:"Manuel Medeiros",co:"Portugal",isM:true,dob:"29/04/2014",r:{brjgt25:{p:26,t:265,tp:52,rd:[90,85,90]},eowagr25:{p:7,t:238,tp:22,rd:[85,77,76]},venice25:{p:28,t:237,tp:21,rd:[78,76,83]},rome25:{p:10,t:166,tp:22,rd:[89,77]},doral25:{p:29,t:177,tp:35,rd:[98,79]},qdl25:{p:11,t:90,tp:18,rd:[90]},gg26:{p:4,t:169,tp:25,rd:[87,82]},wjgc26:{p:9,t:232,tp:16,rd:[79,78,75]}},up:["marco26"]},
  {n:"Dmitrii Elchaninov",co:"Russian Federation",dob:"13/05/2014",r:{brjgt25:{p:1,t:205,tp:-8,rd:[69,68,68]},eowagr25:{p:2,t:218,tp:2,rd:[77,70,71]},venice25:{p:1,t:198,tp:-18,rd:[62,68,68]},qdl25:{p:1,t:71,tp:-1,rd:[71]},wjgc26:{p:1,t:210,tp:-6,rd:[69,69,72]}},up:[]},
  {n:"Diego Gross Paneque",co:"Spain",r:{brjgt25:{p:16,t:249,tp:36,rd:[80,84,85]},wjgc26:{p:9,t:232,tp:16,rd:[76,75,81]}},up:[]},
  {n:"Álex Carrón",co:"Spain",r:{brjgt25:{p:13,t:246,tp:33,rd:[82,84,80]},wjgc26:{p:12,t:241,tp:25,rd:[76,82,83]}},up:[]},
  {n:"Henry Liechti",co:"Switzerland",r:{brjgt25:{p:17,t:250,tp:37,rd:[87,84,79]},wjgc26:{p:23,t:255,tp:39,rd:[79,87,89]}},up:[]},
  {n:"Niko Alvarez Van Der Walt",co:"Spain",r:{brjgt25:{p:22,t:261,tp:48,rd:[89,83,89]},wjgc26:{p:19,t:249,tp:33,rd:[81,86,82]}},up:[]},
  {n:"Miroslavs Bogdanovs",co:"Spain",dob:"19/05/2014",r:{brjgt25:{p:24,t:263,tp:50,rd:[86,88,89]},venice25:{p:18,t:227,tp:11,rd:[76,74,77]},wjgc26:{p:20,t:252,tp:36,rd:[78,86,88]}},up:[]},
  {n:"Christian Chepishev",co:"Bulgaria",r:{brjgt25:{p:29,t:270,tp:57,rd:[87,86,97]},wjgc26:{p:7,t:230,tp:14,rd:[75,76,79]}},up:["marco26"]},
  {n:"James Doyle",co:"Ireland",r:{brjgt25:{p:32,t:277,tp:64,rd:[93,92,92]},wjgc26:{p:31,t:276,tp:60,rd:[91,87,98]}},up:[]},
  {n:"Alexis Beringer",co:"Switzerland",r:{brjgt25:{p:33,t:290,tp:77,rd:[93,94,103]},wjgc26:{p:17,t:246,tp:30,rd:[83,82,81]}},up:[]},
  {n:"Kevin Canton",co:"Italy",r:{brjgt25:{p:34,t:291,tp:78,rd:[98,96,97]},wjgc26:{p:30,t:273,tp:57,rd:[85,88,100]}},up:[]},
  {n:"Leon Schneitter",co:"Switzerland",r:{brjgt25:{p:"WD",t:null,tp:null,rd:[]},wjgc26:{p:11,t:236,tp:20,rd:[76,80,80]}},up:[]},
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
  {n:"Hugo Strasser",co:"Switzerland",r:{wjgc26:{p:6,t:228,tp:12,rd:[73,73,82]}},up:["marco26"]},
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
  {n:"Joe Short",co:"Portugal",r:{gg26:{p:2,t:166,tp:22,rd:[79,87]},wjgc26:{p:28,t:266,tp:50,rd:[93,83,90]}},up:[]},
  {n:"Madalena Miguel Araújo",co:"Portugal",r:{},up:[]},
  {n:"Elijah Gibbons",co:"England",r:{wjgc26:{p:22,t:253,tp:37,rd:[83,83,87]}},up:[]},
  {n:"Harley Botham",co:"Northern Ireland",r:{gg26:{p:11,t:191,tp:47,rd:[98,93]}},up:[]},
  {n:"Benji Botham",co:"Northern Ireland",r:{gg26:{p:5,t:175,tp:31,rd:[88,87]},wjgc26:{p:13,t:244,tp:28,rd:[81,80,83]}},up:[]},
  {n:"Roman Hicks",co:"England",r:{},up:[]},
  {n:"Hanlin Wang",co:"England",r:{},up:[]},
  {n:"Mario Valiente Novella",co:"Spain",r:{},up:[]},
  {n:"Aineon Hiram Jabonero",co:"Philippines",r:{wjgc26:{p:25,t:257,tp:41,rd:[88,87,82]}},up:[]},
  {n:"David Dung Nguyen",co:"Viet Nam",r:{},up:[]},
  {n:"Maddox Tiemann",co:"Sweden",r:{wjgc26:{p:28,t:176,tp:32,rd:[87,89]}},up:[]},
  {n:"William Harran",co:"Switzerland",r:{wjgc26:{p:2,t:221,tp:5,rd:[75,71,75]}},up:[]},
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
  {n:"Weilian Sun",co:"China",r:{wjgc26:{p:4,t:225,tp:9,rd:[77,73,75]}},up:[]},
  {n:"Henry Bucys",co:"England",r:{wjgc26:{p:8,t:231,tp:15,rd:[79,76,76]}},up:[]},
  {n:"Sean Wilding",co:"Thailand",r:{wjgc26:{p:3,t:224,tp:8,rd:[71,74,79]}},up:[]},
  {n:"Philippe Xiao",co:"France",r:{wjgc26:{p:5,t:227,tp:11,rd:[74,73,80]}},up:[]},
  {n:"Dylan Dedaj Ungureanu",co:"Spain",r:{wjgc26:{p:14,t:245,tp:29,rd:[84,81,80]}},up:[]},
  {n:"Oscar Bunt",co:"England",r:{wjgc26:{p:14,t:245,tp:29,rd:[82,80,83]}},up:[]},
  {n:"Myles Jones",co:"Wales",r:{wjgc26:{p:14,t:245,tp:29,rd:[79,88,78]}},up:[]},
  {n:"Lukas Doherty",co:"Norway",r:{wjgc26:{p:26,t:258,tp:42,rd:[89,85,84]}},up:[]},
  {n:"Hermes Stuart Cañizares Plaja",co:"Spain",r:{wjgc26:{p:18,t:248,tp:32,rd:[77,83,88]}},up:[]},
  {n:"Buster Airey",co:"England",r:{wjgc26:{p:20,t:252,tp:36,rd:[79,85,88]}},up:[]},
  {n:"Elias Didjurgis",co:"Germany",r:{wjgc26:{p:27,t:259,tp:43,rd:[84,89,86]}},up:[]},
  {n:"Kai Russell",co:"England",r:{wjgc26:{p:24,t:256,tp:40,rd:[81,83,92]}},up:[]},
  {n:"Aron Klinkenberg",co:"Netherlands",r:{wjgc26:{p:30,t:179,tp:35,rd:[88,91]}},up:[]},
  {n:"Zeyn Lababedi",co:"England",r:{wjgc26:{p:34,t:280,tp:64,rd:[95,94,91]}},up:[]},
  {n:"Rodrigo Palacios Bauer",co:"Spain",r:{wjgc26:{p:29,t:267,tp:51,rd:[82,93,92]}},up:[]},
  {n:"Arthur Lamblin",co:"France",r:{wjgc26:{p:33,t:279,tp:63,rd:[89,98,92]}},up:[]},
  {n:"Joseph Robinson",co:"England",r:{wjgc26:{p:32,t:277,tp:61,rd:[85,93,99]}},up:[]},
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
  {n:"Marcos Ledesma",co:"Spain",dob:"13/01/2013",r:{qdl25:{p:8,t:78,tp:6,rd:[78]}},up:[]},
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

/* ═══════════════════════════════════
   D_BASE: array de jogadores base (manual)
   Os rivais auto-loaded são merged via
   useAutoRivals() hook abaixo
   ═══════════════════════════════════ */
const D_BASE = D; // alias para clareza

const manuel = D_BASE.find(x => x.isM)!;

/** Hook: carrega todos os ficheiros JSON e faz merge com D_BASE */
function useAutoRivals() {
  const [merged, setMerged] = React.useState<RivalPlayer[]>(D_BASE);
  const [loaded, setLoaded] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number; label: string } | null>(null);

  React.useEffect(() => {
    buildAutoRivals((p) => setProgress({ ...p })).then(autoPlayers => {
      // Trabalhar sobre uma cópia profunda do D_BASE
      const map = new Map<string, RivalPlayer>(
        D_BASE.map(p => [normName(p.n), { ...p, r: { ...p.r } }])
      );
      for (const ap of autoPlayers) {
        const key = normName(ap.n);
        if (map.has(key)) {
          const ex = map.get(key)!;
          for (const [tid, res] of Object.entries(ap.r)) {
            if (!ex.r[tid] || res.rd.length > (ex.r[tid]?.rd.length ?? 0))
              ex.r[tid] = res;
          }
        } else {
          map.set(key, { n: ap.n, co: ap.co, r: ap.r, up: [] });
        }
      }
      setMerged(Array.from(map.values()));
      setLoaded(true);
    }).catch(err => {
      console.warn("rivaisDataLoader: erro ao carregar JSON", err);
      setLoaded(true);
    });
  }, []);

  return { rivals: merged, loaded, progress };
}

/* ═══════════════════════════════════
   SCORECARD DATA — WJGC 2026 (3 rondas)
   ═══════════════════════════════════ */
const WJGC26_PAR=[5,3,4,3,4,5,4,3,4,5,5,3,4,4,5,3,4,4] as const;
const WJGC26_SI=[4,10,6,18,16,8,14,12,2,1,7,9,15,11,5,13,17,3] as const;
const WJGC26_CARDS=[
{n:"Dmitrii Elchaninov",pos:1,tp:-6,rds:[[4,3,3,4,4,4,3,4,4,5,4,4,3,4,5,3,4,4],[5,3,5,4,3,5,4,3,3,4,4,3,5,4,5,2,3,4],[6,3,4,3,3,5,5,2,4,5,5,2,4,4,5,3,4,5]]},
{n:"William Harran",pos:2,tp:5,rds:[[7,4,5,3,4,5,4,3,4,5,5,4,4,3,4,3,4,4],[5,3,4,4,3,6,3,3,4,4,5,3,4,3,7,3,3,4],[4,3,4,3,5,4,4,4,4,5,6,2,5,4,5,3,5,5]]},
{n:"Sean Wilding",pos:3,tp:8,rds:[[5,3,4,4,4,5,2,3,4,5,5,3,3,4,5,3,4,5],[5,4,5,3,4,6,4,3,4,5,5,3,4,3,5,2,5,4],[6,4,5,3,3,5,5,2,4,5,5,4,6,4,6,3,5,4]]},
{n:"Weilian Sun",pos:4,tp:9,rds:[[5,3,4,5,5,5,5,3,4,4,6,3,5,4,4,3,5,4],[5,3,4,2,4,6,3,3,4,5,4,3,4,4,6,3,6,4],[8,3,3,4,4,4,5,2,4,5,5,3,4,3,7,3,3,5]]},
{n:"Philippe Xiao",pos:5,tp:11,rds:[[5,3,4,3,4,5,5,3,4,5,5,3,5,3,6,3,4,4],[6,4,4,3,3,5,3,3,4,5,6,2,4,4,5,4,4,4],[6,4,4,3,5,6,5,2,4,5,5,4,5,6,6,2,4,4]]},
{n:"Hugo Strasser",pos:6,tp:12,rds:[[5,3,4,3,4,6,3,3,4,5,5,4,4,3,6,3,4,4],[6,3,4,3,4,4,4,3,6,5,5,3,5,3,4,3,4,4],[5,3,3,4,5,6,3,3,5,5,6,4,6,4,7,3,5,5]]},
{n:"Christian Chepishev",pos:7,tp:14,rds:[[4,4,5,3,4,5,4,3,4,5,5,4,5,4,6,4,3,3],[6,3,5,3,4,5,3,4,4,5,6,2,4,5,5,3,4,5],[5,4,4,3,4,5,6,4,3,6,5,3,5,6,5,3,4,4]]},
{n:"Henry Bucys",pos:8,tp:15,rds:[[6,3,5,4,4,5,4,4,5,5,5,4,4,4,5,3,4,5],[5,3,4,3,4,5,4,3,4,4,5,3,5,4,6,4,4,6],[4,3,4,3,3,4,4,4,4,6,5,5,5,4,6,4,4,4]]},
{n:"Diego Gross Paneque",pos:9,tp:16,rds:[[6,3,4,3,4,5,5,3,5,5,5,4,4,3,5,4,3,5],[7,3,4,3,4,5,4,3,4,5,6,3,5,4,6,2,3,4],[5,3,5,5,5,4,5,4,5,5,5,4,4,4,5,3,5,5]]},
{n:"Manuel Francisco Medeiros",pos:9,tp:16,rds:[[9,3,3,4,5,5,4,3,4,5,5,5,5,4,4,3,3,5],[5,3,4,4,3,5,5,4,4,6,5,4,4,4,7,3,4,4],[5,3,3,3,4,7,3,3,4,4,6,3,5,4,6,4,4,4]]},
{n:"Leon Schneitter",pos:11,tp:20,rds:[[5,3,4,4,5,6,4,3,5,4,5,3,3,4,6,3,4,5],[8,4,4,5,4,4,4,2,4,6,5,4,6,4,5,3,4,4],[5,4,5,3,4,5,5,4,5,4,5,4,5,4,8,2,3,5]]},
{n:"Álex Carrón",pos:12,tp:25,rds:[[5,3,4,3,4,5,4,3,4,8,5,4,4,4,4,3,4,5],[6,3,5,4,5,5,4,2,5,4,5,3,5,4,7,2,5,8],[5,3,4,3,4,6,4,4,4,7,7,4,5,4,6,3,5,5]]},
{n:"Benji Botham",pos:13,tp:28,rds:[[5,3,3,3,5,6,4,3,4,8,6,5,5,4,4,4,4,5],[6,3,4,4,4,5,5,3,6,4,5,3,5,4,7,3,5,4],[6,3,4,4,5,5,4,3,7,5,6,4,5,4,6,3,5,4]]},
{n:"Myles Jones",pos:14,tp:29,rds:[[7,4,5,3,4,6,4,3,4,5,6,3,4,4,5,3,4,5],[5,3,4,3,4,5,4,3,5,6,6,3,7,6,8,4,6,6],[5,4,4,4,4,6,5,3,4,4,6,3,4,4,5,3,5,5]]},
{n:"Oscar Bunt",pos:14,tp:29,rds:[[9,3,4,4,4,5,4,3,5,4,5,3,3,4,6,3,5,8],[5,3,5,4,5,5,3,3,4,4,5,5,6,4,5,4,5,5],[5,5,4,3,4,8,4,4,3,4,5,5,4,5,6,4,5,5]]},
{n:"Dylan Dedaj Ungureanu",pos:14,tp:29,rds:[[5,3,4,3,4,6,4,4,4,5,9,3,5,5,5,4,5,6],[6,2,5,4,4,5,5,3,6,5,5,3,5,5,6,3,5,4],[5,3,4,2,4,6,5,3,4,5,7,3,4,5,7,4,5,4]]},
{n:"Alexis Beringer",pos:17,tp:30,rds:[[5,4,5,3,4,6,3,5,6,6,5,3,5,4,8,3,4,4],[7,3,4,4,4,5,3,3,5,8,6,4,4,3,7,3,5,4],[4,5,5,4,4,5,7,4,3,5,5,3,5,4,5,3,5,5]]},
{n:"Hermes Stuart Cañizares Plaja",pos:18,tp:32,rds:[[7,4,3,4,4,5,4,3,4,4,5,3,4,4,7,3,4,5],[5,5,5,3,4,5,4,3,5,8,8,3,4,4,6,3,4,4],[5,4,5,2,5,5,4,4,8,4,6,3,10,3,7,3,5,5]]},
{n:"Niko Alvarez Van Der Walt",pos:19,tp:33,rds:[[5,3,4,5,4,5,4,4,5,5,5,4,4,4,7,3,4,6],[5,7,5,3,3,6,3,3,3,4,5,4,5,4,9,3,5,9],[5,3,6,3,3,5,4,4,4,6,7,4,5,4,5,3,6,5]]},
{n:"Miroslavs Bogdanovs",pos:20,tp:36,rds:[[5,3,5,3,4,4,4,2,5,5,5,3,5,4,9,4,4,4],[4,4,4,3,4,5,3,3,11,6,5,4,6,5,6,3,4,6],[6,5,4,4,4,5,4,3,4,6,7,4,6,4,8,4,5,5]]},
{n:"Buster Airey",pos:20,tp:36,rds:[[6,3,4,3,4,5,4,3,4,7,4,4,5,5,6,3,4,5],[7,4,5,5,4,5,4,4,5,6,5,3,6,5,5,4,4,4],[7,3,5,3,5,5,5,4,4,8,5,4,6,4,6,4,5,5]]},
{n:"Elijah Gibbons",pos:22,tp:37,rds:[[9,3,3,4,4,8,4,3,5,5,5,3,4,5,5,3,5,5],[7,4,4,4,4,7,4,4,4,5,6,4,3,4,6,3,4,6],[6,4,4,3,5,6,3,4,4,9,5,4,6,3,7,5,4,5]]},
{n:"Henry Liechti",pos:23,tp:39,rds:[[6,3,5,3,4,4,5,3,4,5,5,4,5,4,5,3,6,5],[6,4,5,3,5,5,5,3,4,5,5,4,4,5,10,4,5,5],[7,6,5,4,4,6,4,4,4,7,5,4,4,5,7,3,6,4]]},
{n:"Kai Russell",pos:24,tp:40,rds:[[7,6,3,3,4,5,4,4,5,5,6,4,3,4,6,3,5,4],[7,4,5,3,4,5,4,6,5,6,6,4,4,4,6,2,5,3],[6,4,5,6,4,5,3,4,4,11,5,3,5,5,9,3,6,4]]},
{n:"Aineon Hiram Jabonero",pos:25,tp:41,rds:[[5,3,6,5,6,5,4,4,7,5,7,4,5,4,5,4,4,5],[6,4,5,4,5,6,4,2,5,6,5,4,6,4,6,4,5,6],[5,6,5,4,3,6,5,4,4,4,5,4,4,4,5,4,5,5]]},
{n:"Lukas Doherty",pos:26,tp:42,rds:[[6,3,4,3,5,7,5,3,5,6,6,5,5,5,7,4,5,5],[9,5,5,3,4,4,5,3,4,5,5,3,4,4,7,4,5,6],[6,4,5,3,4,5,5,3,4,5,6,4,5,4,7,3,6,5]]},
{n:"Elias Didjurgis",pos:27,tp:43,rds:[[6,3,5,3,5,6,5,4,5,6,5,3,5,5,5,4,3,6],[5,3,5,4,4,5,4,4,5,5,6,5,6,4,9,4,5,6],[7,5,4,3,4,6,6,2,6,5,6,3,5,4,7,3,5,5]]},
{n:"Joe Short",pos:28,tp:50,rds:[[8,4,5,4,4,7,5,4,7,6,5,5,4,5,6,4,6,4],[6,3,3,3,6,7,3,4,6,6,4,5,5,4,7,2,3,6],[6,4,6,3,3,8,6,4,3,5,6,3,5,5,6,7,4,6]]},
{n:"Rodrigo Palacios Bauer",pos:29,tp:51,rds:[[5,3,3,3,4,5,5,3,4,7,7,3,6,5,6,2,5,6],[5,3,5,4,4,6,5,3,7,10,6,4,5,5,7,4,5,5],[6,4,4,5,4,6,7,4,3,5,10,3,6,4,8,2,5,6]]},
{n:"Kevin Canton",pos:30,tp:57,rds:[[5,2,5,3,6,7,5,4,4,6,5,2,4,5,8,3,5,6],[6,3,5,3,4,6,4,4,6,6,5,6,5,4,7,3,4,7],[4,3,8,4,5,6,7,2,4,7,6,4,6,5,8,5,9,7]]},
{n:"James Doyle",pos:31,tp:60,rds:[[6,4,8,4,5,7,4,3,4,5,5,5,4,6,8,4,4,5],[5,4,4,4,4,7,5,3,5,5,7,4,6,5,6,3,5,5],[8,8,6,3,4,7,4,3,5,3,9,6,3,5,8,6,6,4]]},
{n:"Joseph Robinson",pos:32,tp:61,rds:[[6,7,6,3,4,5,5,3,4,6,7,3,4,5,6,2,4,5],[8,3,5,2,6,5,4,6,5,9,5,4,5,6,6,4,5,5],[8,6,4,4,4,8,7,3,5,5,6,4,6,4,4,4,12,5]]},
{n:"Arthur Lamblin",pos:33,tp:63,rds:[[7,3,5,3,5,7,4,4,4,7,6,3,6,5,5,5,5,5],[6,4,4,4,4,6,5,6,6,6,6,4,6,5,10,6,5,5],[8,4,5,4,4,8,4,3,5,6,6,3,5,5,6,3,6,7]]},
{n:"Zeyn Lababedi",pos:34,tp:64,rds:[[6,3,5,5,7,7,4,5,5,5,6,5,6,5,6,4,5,6],[7,3,5,4,5,6,5,5,6,6,6,3,5,5,8,4,5,6],[8,5,5,3,4,6,5,3,4,6,7,4,5,5,9,3,4,5]]},
{n:"Maddox Tiemann",pos:null,tp:32,rds:[[7,4,4,4,7,6,4,3,4,5,5,5,4,5,8,4,4,6],[5,3,6,3,4,6,5,3,4,7,5,3,6,4,7,3,5,8]]},
];

/* ═══════════════════════════════════
   SCORECARD DATA — GG 2026 U12
   (Vilamoura - Laguna, 2 rounds, par 72)
   ═══════════════════════════════════ */
/* GG26 scorecards: lidos de pull-torneios000.json via loader */

/* QDL25 scorecards: lidos de pull-torneios000.json via loader */

/* ═══════════════════════════════════
   SCORECARD DATA — European Open WAGR 2025
   (par 72, 3 rondas, 8 jogadores)
   ═══════════════════════════════════ */
const EOWAGR25_PAR=[5,4,4,4,5,3,4,3,4,4,5,3,4,4,3,5,4,4] as const;
const EOWAGR25_SI=[9,11,13,5,7,17,3,15,1,12,6,8,2,16,14,10,4,18] as const;
const EOWAGR25_CARDS=[
{n:"Aronas Juodis",pos:1,tp:-3,rds:[[4,4,3,6,5,3,4,3,4,4,4,2,5,4,3,4,4,4],[4,6,4,4,5,4,4,2,5,3,4,3,5,3,3,4,4,4],[5,4,3,4,6,3,4,3,4,4,5,3,4,5,3,4,4,4]]},
{n:"Dmitrii Elchaninov",pos:2,tp:2,rds:[[5,4,4,4,5,3,4,3,4,4,4,3,4,4,3,5,4,4],[5,3,4,3,4,2,4,3,4,4,4,3,7,4,3,4,5,4],[5,4,4,4,5,3,4,4,4,4,6,3,4,5,3,5,6,4]]},
{n:"Emile Cuanalo",pos:3,tp:8,rds:[[5,6,4,4,5,3,5,4,7,4,4,3,4,4,4,4,4,4],[5,4,4,5,4,3,4,3,4,4,5,4,5,4,4,6,4,4],[5,4,4,4,4,3,4,2,3,4,5,3,4,4,4,5,4,4]]},
{n:"Maxwell Ip",pos:4,tp:11,rds:[[7,4,4,4,7,3,4,3,4,3,4,4,5,4,4,3,4,4],[6,4,4,4,3,3,4,3,8,4,4,3,6,5,4,5,4,5],[5,3,3,4,6,3,4,2,4,4,4,3,7,4,3,5,5,4]]},
{n:"Yorick De Hek",pos:5,tp:18,rds:[[6,5,4,4,4,4,4,3,5,4,8,4,4,5,3,4,4,4],[5,4,4,5,6,3,4,3,6,4,5,3,5,4,3,4,4,4],[5,4,5,4,4,4,4,3,5,5,5,3,5,5,3,5,5,5]]},
{n:"Nial Diwan",pos:6,tp:22,rds:[[5,5,4,4,4,3,4,3,4,4,5,4,4,4,3,5,4,4],[6,6,5,4,5,4,5,4,5,6,5,4,3,4,3,4,5,6],[5,4,4,5,6,4,5,4,4,5,5,3,4,4,4,6,5,4]]},
{n:"Manuel Medeiros",pos:7,tp:22,rds:[[4,3,4,5,6,3,5,4,5,4,5,3,6,4,3,4,4,4],[5,6,4,4,4,4,4,3,4,4,5,4,4,4,4,5,5,4],[7,5,4,6,5,3,4,3,5,3,6,3,6,4,5,6,5,5]]},
{n:"Muduo Wang",pos:8,tp:46,rds:[[4,6,5,4,5,3,6,4,6,4,6,4,5,5,2,4,5,5],[6,5,5,5,7,3,5,3,5,6,5,5,5,5,6,7,5,5],[7,6,5,5,7,3,5,3,5,5,5,3,5,5,3,5,5,4]]},
];

/* ═══════════════════════════════════
   SCORECARD DATA — WJGC 2026 Boys 12-13
   (contest 33, par 73, 3 rondas)
   ═══════════════════════════════════ */
const WJGC26_1213_PAR=[4,4,3,5,4,4,5,3,4,4,4,5,5,3,4,5,3,4] as const;
const WJGC26_1213_SI=[5,1,15,13,7,17,11,3,9,16,6,18,14,12,4,2,10,8] as const;
const WJGC26_1213_CARDS=[
{n:"Marcus Latt",pos:1,tp:-8,rds:[[4,3,2,4,4,4,6,3,4,3,3,5,4,3,5,4,3,5],[4,5,3,4,4,4,5,3,5,3,3,5,4,4,4,5,3,3],[4,4,2,5,4,3,5,3,4,3,7,4,4,3,5,5,3,3]]},
{n:"Skyy Wilding",pos:5,tp:0,rds:[[4,4,3,3,3,4,4,3,4,3,5,5,4,3,3,6,4,5],[6,6,3,5,4,4,5,3,4,4,4,4,4,3,4,4,2,4],[4,5,3,4,4,3,5,3,4,4,5,5,4,3,4,6,3,4]]},
{n:"Marcus Karim",pos:8,tp:6,rds:[[6,6,3,4,4,4,5,3,4,4,4,5,4,3,3,4,5,4],[6,5,4,5,4,4,4,3,3,4,4,5,6,3,5,5,3,5],[5,6,3,3,3,4,5,3,3,3,4,6,5,3,4,4,4,4]]},
{n:"Emile Cuanalo",pos:5,tp:0,rds:[[5,7,4,4,4,5,4,4,4,4,4,4,5,3,6,4,4,4],[3,6,3,6,4,4,5,3,3,4,4,5,5,3,3,5,4,4],[5,5,3,5,4,4,4,4,4,4,3,5,4,3,3,5,3,4]]},
{n:"Maxime Vervaet",pos:10,tp:8,rds:[[5,4,3,4,4,4,5,3,4,3,5,5,4,3,6,5,4,5],[6,4,3,5,5,6,5,3,4,4,5,4,4,3,6,4,3,4],[5,3,4,5,4,6,4,3,4,4,5,4,4,3,5,5,4,4]]},
{n:"Harrison Barnett",pos:19,tp:14,rds:[[4,5,3,5,7,3,7,3,5,3,4,5,3,3,6,4,3,4],[7,5,3,5,4,4,7,3,4,5,6,4,4,2,5,6,5,4],[5,6,3,4,4,3,5,3,5,3,5,6,4,4,5,6,3,3]]},
{n:"Kirill Sedov",pos:13,tp:10,rds:[[5,5,2,4,5,3,5,4,5,6,3,7,5,3,3,5,4,4],[4,5,2,5,5,4,5,2,4,3,6,5,5,3,4,6,4,5],[5,4,3,5,5,5,5,3,5,4,3,5,7,3,4,5,4,4]]},
{n:"Aronas Juodis",pos:22,tp:17,rds:[[6,7,2,5,5,4,6,3,5,4,6,5,4,3,5,5,3,4],[6,5,3,5,5,5,5,4,5,4,5,5,6,3,5,4,5,7],[4,5,3,5,4,3,5,3,5,4,6,5,5,3,4,5,3,4]]},
{n:"Francisco Carvalho",pos:29,tp:27,rds:[[4,7,2,5,5,5,4,5,4,4,4,5,5,5,5,6,4,4],[6,6,3,5,4,5,6,3,7,4,6,6,6,3,5,7,4,5],[5,6,3,6,5,5,5,2,6,4,5,5,5,3,5,5,3,4]]},
{n:"César Goossens",pos:36,tp:101,rds:[[8,6,6,6,6,4,8,5,6,4,4,9,6,5,4,8,4,7],[6,7,3,8,7,7,5,3,6,6,6,6,6,3,5,6,5,8],[8,12,3,10,7,4,7,5,5,5,6,6,7,4,6,6,5,5]]},
{n:"Seb Toft",pos:18,tp:17,rds:[[5,4,3,4,4,6,4,3,5,5,4,5,6,6,4,5,3,4],[5,5,3,4,6,4,5,4,4,4,4,5,4,4,3,6,4,4],[4,5,3,4,3,4,5,3,4,6,4,5,4,3,6,6,4,5]]},
{n:"Memphis Greenwood",pos:15,tp:11,rds:[[5,4,3,5,5,4,4,3,3,5,4,6,4,3,3,6,3,5],[5,4,3,4,3,4,4,3,5,6,4,5,5,3,6,6,3,6],[5,5,4,4,4,5,5,3,4,6,4,5,4,3,5,5,3,4]]},
{n:"Luc Taylor",pos:16,tp:12,rds:[[5,5,4,4,4,4,4,3,4,3,4,5,5,3,5,6,4,4],[5,5,3,4,4,4,5,4,4,6,4,5,5,3,6,6,3,4],[4,5,3,5,5,3,6,6,4,3,4,5,5,4,3,4,3,6]]},
{n:"Harry Mody",pos:16,tp:12,rds:[[4,5,3,3,4,4,5,4,5,3,4,5,4,2,4,7,3,5],[4,4,3,6,4,4,5,4,6,5,4,4,5,3,4,6,3,4],[5,5,4,4,5,4,5,3,4,4,4,5,6,5,4,5,4,4]]},
{n:"Jack Hollingsworth",pos:22,tp:21,rds:[[5,4,3,4,5,4,6,5,5,3,5,5,5,3,6,5,4,4],[6,5,4,4,4,4,6,4,5,4,4,6,4,4,4,5,3,6],[5,4,4,5,4,4,5,3,4,4,5,5,3,2,5,7,4,4]]},
{n:"Kris Kuusk",pos:25,tp:27,rds:[[6,5,4,5,5,4,5,3,4,5,6,5,4,3,5,5,4,5],[4,5,4,4,4,4,6,4,5,5,5,5,5,4,5,7,3,4],[4,4,3,4,4,5,8,3,4,4,5,5,6,4,4,6,3,4]]},
{n:"David Filip",pos:23,tp:25,rds:[[5,5,4,5,3,4,4,3,5,4,5,6,4,2,4,5,3,4],[6,5,4,4,5,4,5,2,5,4,4,7,6,6,5,5,5,4],[4,5,3,4,4,5,6,3,5,4,9,6,5,3,3,5,4,5]]},
{n:"Dylan Williams",pos:32,tp:45,rds:[[6,5,4,4,4,9,6,3,6,5,4,4,4,3,3,5,4,4],[7,5,4,5,5,8,7,4,5,5,5,7,6,4,4,4,3,6],[6,4,3,7,4,6,6,3,6,5,4,5,6,3,5,6,3,5]]},
{n:"Alejandro Gomez Morillo",pos:33,tp:57,rds:[[6,5,4,5,5,5,6,4,6,5,5,5,6,3,6,7,4,8],[4,6,2,6,6,6,7,6,3,5,4,5,5,4,7,6,4,5],[8,6,3,6,3,5,6,5,7,4,5,4,5,3,5,6,3,6]]},
{n:"Fredrik Sonsteby",pos:34,tp:71,rds:[[6,6,6,6,6,5,6,5,6,4,5,6,5,3,5,6,5,7],[8,6,3,5,6,5,6,4,6,5,5,4,5,4,7,6,3,5],[7,7,3,5,5,5,6,7,7,4,6,7,5,3,5,7,5,5]]},
{n:"William Ottesen Wang",pos:35,tp:75,rds:[[6,8,3,4,5,6,8,3,4,8,4,6,6,4,7,10,3,5],[7,8,5,6,5,8,6,4,4,4,5,7,7,3,4,5,4,5],[6,6,4,5,5,4,6,5,9,6,7,5,6,5,5,5,4,4]]},
{n:"Rafael Devic Frugier",pos:29,tp:37,rds:[[4,4,4,5,5,5,6,4,7,4,4,4,4,3,5,7,4,4],[5,4,4,4,4,5,5,4,4,5,6,7,5,4,4,6,2,6],[7,5,4,4,6,4,6,3,7,4,9,4,4,4,4,6,4,4]]},
];

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

  // Todos os torneios com resultado (T manual + auto-loaded)
  const allTids = Object.keys(p.r);

  for (const tid of allTids) {
    const res = p.r[tid];
    if (!res || !res.rd || res.rd.length === 0) continue;

    const tDef = T.find(t => t.id === tid);
    const nRd = tDef ? (tDef.intendedRounds || tDef.rounds) : res.rd.length;
    const w = getTournWeight(tid);

    const zs: number[] = [];
    for (let i = 0; i < res.rd.length; i++) {
      const sc = res.rd[i];
      const stats = AVG_R[tid] && AVG_R[tid][i];
      if (sc != null && sc > 0 && stats && stats.s > 0) {
        zs.push((sc - stats.m) / stats.s);
      } else if (sc != null && sc > 0) {
        // Sem estatísticas de grupo: usar desvio relativo ao par (72 típico)
        const parEst = 72;
        const sdEst = 8; // desvio padrão estimado para torneios sem dados
        zs.push((sc - parEst) / sdEst);
      }
    }
    if (zs.length === 0) continue;
    const tournZ = zs.reduce((a, b) => a + b, 0) / zs.length;
    const tpPerRd = res.tp != null ? res.tp / nRd : 0;
    const parBonus = 1 + Math.max(0, -tpPerRd) * 0.15;
    sumWZ += tournZ * w * parBonus;
    totalW += w * parBonus;
    effRd += zs.length * w;
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

/* ── Name matching: "Manuel Medeiros" <→ "Manuel Francisco Medeiros" ── */
function matchName(dName: string, cardName: string): boolean {
  if (dName === cardName) return true;
  const dn = dName.toLowerCase().split(" ");
  const cn = cardName.toLowerCase().split(" ");
  return dn[0] === cn[0] && dn[dn.length - 1] === cn[cn.length - 1];
}
function findCard<T extends { n: string }>(cards: T[], dName: string): T | undefined {
  return cards.find(c => matchName(dName, c.n));
}

/* ══════════════════════════════════════════════════════
   RIVALS CONTEXT — partilha o array de rivais (após
   auto-merge async) por todos os sub-componentes
   ══════════════════════════════════════════════════════ */
const RivalsCtx = React.createContext<RivalPlayer[]>(D_BASE);
function useRivals() { return React.useContext(RivalsCtx); }

/* ── Rank map derivado do array de rivais ── */
function buildRankMap(rivals: RivalPlayer[]): Record<string, number> {
  const scored = rivals.map(p => ({ n: p.n, z: getAvgZ(p) })).filter(x => x.z != null) as { n: string; z: number }[];
  scored.sort((a, b) => a.z - b.z);
  const m: Record<string, number> = {};
  scored.forEach((s, i) => { m[s.n] = i + 1; });
  return m;
}

// Inicializado vazio — populado só depois de loaded=true
let rankMap: Record<string, number> = {};
let totalRanked = 0;

// nPlayed e nRounds contam todos os torneios (T manual + auto-loaded)
// Tids que ficam ocultos no detalhe (deduplicação)
// Regra simples: contar quantos estão escondidos e subtrair ao total
const HIDDEN_WHEN_PRESENT: Array<[string, string]> = [
  // [tid oculto, tid que o substitui]
  ["brjgt25",    "wjgc25_b1011"],
  ["venice25_b11","venice25"], ["venice25_b12","venice25"],
  ["venice25_b9", "venice25"], ["venice25_b10","venice25"],
  ["rome25_b11",  "rome25"],   ["rome25_b12",  "rome25"],
  ["rome25_b9",   "rome25"],   ["rome25_b10",  "rome25"],
  ["doral25_b1011","doral25"], ["doral25_b89", "doral25"], ["doral25_b1213","doral25"],
];

function hiddenTids(p: RivalPlayer): Set<string> {
  const hidden = new Set<string>();
  for (const [toHide, whenPresent] of HIDDEN_WHEN_PRESENT) {
    if (p.r[toHide]?.rd?.length > 0 && p.r[whenPresent]?.rd?.length > 0)
      hidden.add(toHide);
  }
  return hidden;
}

function nPlayed(p: RivalPlayer) {
  const total = Object.values(p.r).filter(r => r && (r.tp != null || r.rd?.length > 0)).length;
  return total - hiddenTids(p).size;
}
function nRounds(p: RivalPlayer) {
  const hidden = hiddenTids(p);
  return Object.entries(p.r).reduce((acc, [tid, res]) => {
    if (hidden.has(tid)) return acc;
    return acc + (res?.rd ? res.rd.filter((x: number | null) => x != null && x > 0).length : 0);
  }, 0);
}
function getVsAvg(p: RivalPlayer) {
  if (p.isM) return null;
  const ds: number[] = [];
  Object.keys(p.r).forEach(tid => {
    const m = manuel!.r[tid];
    if (m && p.r[tid].tp != null && m.tp != null) ds.push(p.r[tid].tp - m.tp);
  });
  return ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null;
}

/* ─────────────────────────────────────────────────────────────
   Generic scorecard table (WJGC26, GG26, QDL25)
   ───────────────────────────────────────────────────────────── */
interface ScRound { label: string; scores: number[] }
function TournScorecard({ par, si, rounds }: { par: readonly number[]; si?: readonly number[]; rounds: ScRound[] }) {
  const frontPar = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const backPar = par.slice(9).reduce((a, b) => a + b, 0);
  const totalPar = frontPar + backPar;
  const Sub = ({ gross, base, cls }: { gross: number; base: number; cls: string }) => {
    const tp = gross - base;
    return <td className={`${cls} fw-700`}>{gross}<span className={`sc-topar ${toParClass(tp)}`}>{fmtSign(tp)}</span></td>;
  };
  return (
    <div className="scroll-x">
      <table className="sc-table-modern" data-sc-table="1">
        <thead><tr>
          <th className="hole-header" style={{ textAlign: "left", paddingLeft: 8, minWidth: 60 }}>Buraco</th>
          {par.slice(0, 9).map((_, i) => <th key={i} className="hole-header">{i + 1}</th>)}
          <th className="hole-header col-out fs-10">Out</th>
          {par.slice(9).map((_, i) => <th key={i + 9} className="hole-header">{i + 10}</th>)}
          <th className="hole-header col-in fs-10">In</th>
          <th className="hole-header col-total">TOT</th>
        </tr></thead>
        <tbody>
          {si && (
            <tr className="meta-row">
              <td className="row-label">SI</td>
              {si.slice(0, 9).map((s, i) => <td key={i}>{s}</td>)}
              <td className="col-out" />
              {si.slice(9).map((s, i) => <td key={i + 9}>{s}</td>)}
              <td className="col-in" /><td className="col-total" />
            </tr>
          )}
          <tr className="sep-row">
            <td className="row-label par-label">Par</td>
            {par.slice(0, 9).map((p, i) => <td key={i}>{p}</td>)}
            <td className="col-out fw-600">{frontPar}</td>
            {par.slice(9).map((p, i) => <td key={i + 9}>{p}</td>)}
            <td className="col-in fw-600">{backPar}</td>
            <td className="col-total">{totalPar}</td>
          </tr>
          {rounds.map((rd, ri) => {
            const front = rd.scores.slice(0, 9).reduce((a, b) => a + b, 0);
            const back = rd.scores.slice(9).reduce((a, b) => a + b, 0);
            const total = front + back;
            return (
              <tr key={ri}>
                <td className="row-label fw-700">{rd.label}</td>
                {rd.scores.slice(0, 9).map((g, i) => <td key={i}><span className={`sc-score ${scClass(g, par[i])}`}>{g}</span></td>)}
                <Sub gross={front} base={frontPar} cls="col-out" />
                {rd.scores.slice(9).map((g, i) => <td key={i + 9}><span className={`sc-score ${scClass(g, par[i + 9])}`}>{g}</span></td>)}
                <Sub gross={back} base={backPar} cls="col-in" />
                <Sub gross={total} base={totalPar} cls="col-total" />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Scoring distribution pills ── */
function ScoringDist({ allScores, allPars }: { allScores: number[][]; allPars: readonly number[] }) {
  let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0, worse = 0;
  for (const sc of allScores) for (let i = 0; i < 18; i++) {
    const d = sc[i] - allPars[i];
    if (d <= -2) eagles++; else if (d === -1) birdies++; else if (d === 0) pars++; else if (d === 1) bogeys++; else if (d === 2) doubles++; else worse++;
  }
  const total = allScores.length * 18;
  if (total === 0) return null;
  const items = [
    { label: "Eagle+", val: eagles, cls: "eagle" }, { label: "Birdie", val: birdies, cls: "birdie" },
    { label: "Par", val: pars, cls: "par" }, { label: "Bogey", val: bogeys, cls: "bogey" },
    { label: "Duplo", val: doubles, cls: "double" }, { label: "Triple+", val: worse, cls: "triple" },
  ].filter(s => s.val > 0);
  return (
    <div className="d-flex items-center gap-8 mb-12 flex-wrap">
      <span className="fs-10 fw-600 c-text-3">Distribuição ({total} buracos):</span>
      {items.map(s => (
        <span key={s.label} className="d-flex items-center gap-4">
          <span className={`sc-score ${s.cls}`} style={{ width: 22, height: 22, fontSize: 10 }}>{s.val}</span>
          <span className="fs-10 fw-600 c-text-3">{s.label} ({(s.val / total * 100).toFixed(0)}%)</span>
        </span>
      ))}
    </div>
  );
}

function RivaisDashboard({ onSelectPlayer }: { onSelectPlayer?: (name: string) => void }) {
  const rivals = useRivals();
  const [fTour, setFTour] = useState("all");
  const [fUp, setFUp] = useState("all");
  const [fCo, setFCo] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("zrank");
  const [dir, setDir] = useState<"asc"|"desc">("asc");
  const [dOnly, setDOnly] = useState(false);
  const [vsOn, setVsOn] = useState(true);

  const list = useMemo(() => {
    let pl = [...rivals];
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

  // Count tournaments & rounds played
  const nPlayedLocal = (p: RivalPlayer) => nPlayed(p);
  const nRoundsLocal = (p: RivalPlayer) => nRounds(p);

  return (
    <div>
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
              <div className="kpi-val" style={{ fontSize: 16, color: tpColorDark(res.tp) }}>
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
                  const w = getTournWeight(t.id);
                  const stars = w >= 1.3 ? "★★★★★" : w >= 1.1 ? "★★★★" : w >= 0.9 ? "★★★" : w >= 0.6 ? "★★" : w >= 0.4 ? "★" : "½";
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
                const played = nPlayedLocal(p);

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
                          <div className="fs-10 c-text-3">{nPlayedLocal(p)}T · {nRoundsLocal(p)}R</div>
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
        Clica num jogador para ver detalhe · Rank ponderado por prestígio: ★★★★★ USKids World · ★★★★ European/BJGT/Venice · ★★★ outros top · ½ peso mínimo · ({totalRanked} jogadores com dados)
      </div>
    </div>
  );
}

/* ═══════════════════════════════════
   SIDEBAR
   ═══════════════════════════════════ */
/* ── DOB Pill ── */
function DobPill({ player }: { player: RivalPlayer }) {
  const info = computeDobInfo(player);
  if (!info.exact && info.rangeStr === "?") return null;
  const text = info.exact ? info.dobStr! : `~${info.rangeStr}`;
  const color = info.exact ? "var(--color-good-dark)" : "var(--text-3)";
  return (
    <span style={{ fontSize: 10, color, marginLeft: 4, fontWeight: info.exact ? 600 : 400 }}>
      {info.exact ? "🎂" : "📅"} {text}
    </span>
  );
}

// Grupos de torneios para o filtro da sidebar
const SIDEBAR_FILTERS = [
  { id: "all",       label: "Todos" },
  { id: "wjgc",     label: "WJGC" },
  { id: "uskids",   label: "US Kids" },
  { id: "eowagr",   label: "EU Open" },
  { id: "doral",    label: "Doral" },
  { id: "bjgt",     label: "BJGT" },
  { id: "outros",   label: "Outros" },
];

function playerMatchesFilter(p: RivalPlayer, fid: string): boolean {
  if (fid === "all") return true;
  const tids = Object.keys(p.r);
  if (fid === "wjgc")   return tids.some(t => t.startsWith("wjgc"));
  if (fid === "uskids") return tids.some(t =>
    t.startsWith("venice25") || t.startsWith("rome25") || t.startsWith("marco25") ||
    t.startsWith("desert26") || t.startsWith("sandestin26") || t.startsWith("msstate26") || t.startsWith("elprat23")
  );
  if (fid === "eowagr") return tids.some(t => t.startsWith("eowagr"));
  if (fid === "doral")  return tids.some(t => t.startsWith("doral"));
  if (fid === "bjgt")   return tids.some(t => t.startsWith("brjgt") || t.startsWith("gg26") || t.startsWith("qdl"));
  if (fid === "outros") return !tids.some(t =>
    t.startsWith("wjgc") || t.startsWith("venice25") || t.startsWith("rome25") ||
    t.startsWith("marco25") || t.startsWith("desert26") || t.startsWith("sandestin26") ||
    t.startsWith("msstate26") || t.startsWith("elprat23") || t.startsWith("eowagr") ||
    t.startsWith("doral") || t.startsWith("brjgt") || t.startsWith("gg26") || t.startsWith("qdl")
  );
  return true;
}

function RivaisSidebar({ selected, onSelect }: { selected: string | null; onSelect: (n: string) => void }) {
  const [q, setQ] = useState("");
  const rivals = useRivals();
  const [fid, setFid] = useState("all");

  const list = useMemo(() => {
    let pl = rivals.filter(p => nPlayed(p) > 0 || p.isM);
    if (fid !== "all") pl = pl.filter(p => playerMatchesFilter(p, fid));
    if (q) { const ql = q.toLowerCase(); pl = pl.filter(p => p.n.toLowerCase().includes(ql) || p.co.toLowerCase().includes(ql)); }
    return [...pl].sort((a, b) => {
      if (a.isM) return -1; if (b.isM) return 1;
      const ra = rankMap[a.n] ?? 9999, rb = rankMap[b.n] ?? 9999;
      return ra - rb;
    });
  }, [q, fid, rivals]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search */}
      <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-light)", flexShrink: 0 }}>
        <input
          type="text" value={q} onChange={e => setQ(e.target.value)}
          placeholder="Pesquisar rival…" className="input"
          style={{ width: "100%", height: 28, fontSize: 12 }}
        />
      </div>
      {/* Source filter pills */}
      <div style={{ padding: "5px 8px", borderBottom: "1px solid var(--border-light)", flexShrink: 0, display: "flex", gap: 4, flexWrap: "wrap" }}>
        {SIDEBAR_FILTERS.map(f => (
          <button key={f.id}
            className={`p p-sm p-filter${fid === f.id ? " active" : ""}`}
            style={{ fontSize: 10, padding: "2px 7px" }}
            onClick={() => setFid(f.id)}
          >{f.label}</button>
        ))}
      </div>
      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {list.map(p => {
          const flag = FL[p.co] || "🏳️";
          const rank = rankMap[p.n];
          const tr = getTrend(p);
          const played = nPlayed(p);
          const isActive = selected === p.n;
          const rankCls = rank == null ? "" : rank <= 3 ? "sidebar-rank-top3" : rank <= 10 ? "sidebar-rank-top10" : "sidebar-rank-rest";
          const dobInfo = computeDobInfo(p);
          const hasDob = dobInfo.exact || dobInfo.rangeStr !== "?";
          return (
            <button key={p.n} className={`course-item${isActive ? " active" : ""}`} onClick={() => onSelect(p.n)}>
              <div className="course-item-name">
                <span>{flag}</span>
                <span className={p.isM ? "fw-800" : ""}>{p.n}</span>
                {p.isM && <span className="p p-sm p-outline ml-2">REF</span>}
                {tr && <span style={{ fontSize: 11, color: TR_I[tr].c, marginLeft: "auto" }}>{TR_I[tr].i}</span>}
              </div>
              <div style={{ display: "flex", gap: 5, marginTop: 3, alignItems: "center", flexWrap: "wrap" }}>
                <span className="fs-10 c-text-3">{p.co}</span>
                {played > 0 && <span className="fs-10 c-muted">· {played}T</span>}
                {hasDob && <DobPill player={p} />}
                {rank != null && (
                  <span className={`sidebar-rank ${rankCls}`} style={{ marginLeft: "auto" }}>
                    #{rank}
                  </span>
                )}
                {p.up.length > 0 && <span style={{ fontSize: 10, color: "var(--color-good-dark)", fontWeight: 700 }}>▲</span>}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ padding: "6px 10px", borderTop: "1px solid var(--border-light)", fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
        {list.length} rivais · {totalRanked} com rank
      </div>
    </div>
  );
}

/* ═══════════════════════════════════
   RIVAL DETAIL  (replaces FieldPlayerDetail)
   ═══════════════════════════════════ */
function RivalDetail({ playerName, onShowTable }: { playerName: string; onShowTable: () => void }) {
  const rivals = useRivals();
  const rival = rivals.find(d => d.n === playerName);
  const bjgtCard = FIELD_CARDS.find(c => c.name === playerName);
  const lbEntry = FIELD_2025.leaderboard.find(p => p.name === playerName);
  const wjgcCard = findCard(WJGC26_CARDS, playerName);

  const eowagr25Card = findCard(EOWAGR25_CARDS, playerName);
  const wjgc26_1213Card = findCard(WJGC26_1213_CARDS, playerName);

  const [expandedTourns, setExpandedTourns] = useState<Set<string>>(() => new Set());
  const toggleExpand = (id: string) => setExpandedTourns(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  if (!rival && !lbEntry) return (
    <div className="detail-header">
      <div className="muted">Sem dados para {playerName}</div>
    </div>
  );

  const flag = rival ? (FL[rival.co] || "🏳️") : "";
  const rank = rankMap[playerName];
  const tr = rival ? getTrend(rival) : null;
  const played = rival ? nPlayed(rival) : 0;
  const isManuel = rival?.isM;

  // Tournament results: T manual (com scorecard) + auto-loaded (sem scorecard)
  const manualTournIds = new Set(T.map(t => t.id));

  // Mapa explícito: auto tid → manual T id que o cobre
  // Necessário quando o id manual não deriva trivialmente do auto tid
  const AUTO_COVERED_BY: Record<string,string> = {
    "venice25_b11":  "venice25",
    "venice25_b12":  "venice25",
    "venice25_b9":   "venice25",
    "venice25_b10":  "venice25",
    "rome25_b11":    "rome25",
    "rome25_b12":    "rome25",
    "rome25_b9":     "rome25",
    "rome25_b10":    "rome25",
    "doral25_b1011": "doral25",
    "doral25_b89":   "doral25",
    "doral25_b1213": "doral25",
  };
  // Mapa inverso: manual T id → lista de auto tids equivalentes (para buscar scorecards)
  const MANUAL_AUTO_TIDS: Record<string,string[]> = {};
  for (const [autoTid, manTid] of Object.entries(AUTO_COVERED_BY)) {
    if (!MANUAL_AUTO_TIDS[manTid]) MANUAL_AUTO_TIDS[manTid] = [];
    MANUAL_AUTO_TIDS[manTid].push(autoTid);
  }

  function autoIsCoveredByManual(tid: string): boolean {
    // Só ocultar se o torneio manual substituto realmente existe em rival.r
    if (tid in AUTO_COVERED_BY) {
      const manualTid = AUTO_COVERED_BY[tid];
      return !!(rival?.r[manualTid]?.rd?.length > 0);
    }
    // Fallback genérico: strip _b\d+ suffix
    const base = tid.replace(/_b\d+$/, "");
    if (manualTournIds.has(base)) return !!(rival?.r[base]?.rd?.length > 0);
    return false;
  }

  const autoScorecards = rival ? getScorecards(rival.n) : [];

  const tournResults = rival ? [
    // 1. Torneios do array T manual com resultados
    ...T.filter(t => rival.r[t.id] && rival.r[t.id].rd?.length > 0
      // Ocultar brjgt25 se wjgc25_b1011 existir (o JSON tem info completa)
      && !(t.id === "brjgt25" && rival.r["wjgc25_b1011"]?.rd?.length > 0)
    ).map(t => ({
      t,
      res: rival.r[t.id],
      // Auto-scorecard: para tourns com card dedicado usa-o; caso contrário (ou se não existe para este jogador) usa auto
      autoCard: (() => {
        // Torneios com render especial próprio — só usar auto se o dedicado não existir para este jogador
        const dedicatedMissing =
          (t.id === "brjgt25" && !bjgtCard) ||
          (t.id === "wjgc26" && !wjgcCard) ||
          (t.id === "eowagr25" && !eowagr25Card) ||
          (t.id === "wjgc26_1213" && !wjgc26_1213Card);
        const isKnownDedicated = ["brjgt25","wjgc26","eowagr25","wjgc26_1213"].includes(t.id);
        if (isKnownDedicated && !dedicatedMissing) return null; // tem card dedicado → não precisar auto
        // Procurar via tids equivalentes OU pelo próprio tid (ex: gg26, qdl25 vêm directamente do loader)
        return (MANUAL_AUTO_TIDS[t.id] || []).reduce((found: typeof autoScorecards[0] | null, atid) =>
          found || autoScorecards.find(sc => sc.tid === atid) || null, null)
          ?? autoScorecards.find(sc => sc.tid === t.id) ?? null;
      })(),
      hasCard: (() => {
        if (t.id === "brjgt25") return !!bjgtCard || !!(MANUAL_AUTO_TIDS["brjgt25"] || []).some(atid => autoScorecards.find(sc => sc.tid === atid));
        if (t.id === "wjgc26") return !!wjgcCard || !!(MANUAL_AUTO_TIDS["wjgc26"] || []).some(atid => autoScorecards.find(sc => sc.tid === atid));
        if (t.id === "eowagr25") return !!eowagr25Card || !!(MANUAL_AUTO_TIDS["eowagr25"] || []).some(atid => autoScorecards.find(sc => sc.tid === atid));
        if (t.id === "wjgc26_1213") return !!wjgc26_1213Card;
        // Verificar tids equivalentes E o próprio tid
        return !!(MANUAL_AUTO_TIDS[t.id] || []).some(atid => autoScorecards.find(sc => sc.tid === atid))
          || !!autoScorecards.find(sc => sc.tid === t.id);
      })(),
      // For manual T tourns: prefer ageGroup from auto tid, fallback to ageMin/ageMax
      ageGroup: ((MANUAL_AUTO_TIDS[t.id] || []).reduce((found: string | null, atid) =>
        found || (rival.r[atid]?.ageGroup ?? null), null)
        ?? ageLabel(t.ageMin, t.ageMax)) as string | null,
      isAuto: false,
    })),
    // 2. Torneios auto-loaded não presentes em T e não cobertos por T
    ...Object.entries(rival.r)
      .filter(([tid, res]) =>
        !manualTournIds.has(tid) &&
        !autoIsCoveredByManual(tid) &&
        res?.rd?.length > 0
      )
      .map(([tid, res]) => {
        const info = getTournInfo(tid);
        const autoMeta = AUTO_TOURN_META[tid];
        const tmap = T_MAP[tid];
        const uskField = uskFieldSizes.get(tid) ?? 0;
        const fakeDef = {
          id: tid, name: info.name, short: info.short, date: info.date,
          dateExact: tmap?.dateExact ?? info.dateExact,
          rounds: res.rd.length, par: autoMeta?.par ?? 72,
          field: autoMeta?.field ?? uskField, nations: autoMeta?.nations ?? 0,
          intendedRounds: res.rd.length, url: autoMeta?.url,
        } as unknown as TournDef;
        const autoCard = autoScorecards.find(sc => sc.tid === tid) || null;
        return { t: fakeDef, res, hasCard: !!autoCard, autoCard, ageGroup: (res.ageGroup ?? null) as string | null, isAuto: true };
      }),
  ].sort((a, b) => {
    const da = a.t.dateExact ?? a.t.date;
    const db = b.t.dateExact ?? b.t.date;
    return db.localeCompare(da);  // mais recente primeiro
  }) : [];

  // Contadores baseados em tournResults (deduplicados) — fonte de verdade para o detalhe
  const playedDedup = tournResults.length;
  const roundsDedup = tournResults.reduce((acc, x) =>
    acc + x.res.rd.filter((r: number | null) => r != null && r > 0).length, 0);
  // Double-check: nPlayed(rival) deve bater com playedDedup
  if (rival && process.env.NODE_ENV !== "production" && nPlayed(rival) !== playedDedup) {
    console.warn(`[RivaisIntl] count mismatch for ${rival.n}: nPlayed=${nPlayed(rival)} vs tournResults=${playedDedup}`);
  }

  const allRds = tournResults.flatMap(x => x.res.rd.filter((r: number | null) => r != null && r > 0));
  const completedResults = tournResults.filter(x => x.res.tp != null);
  const bestTp = completedResults.length ? Math.min(...completedResults.map(x => x.res.tp!)) : null;
  const bestRd = allRds.length ? Math.min(...allRds) : null;
  const avgRd = allRds.length ? (allRds.reduce((a: number, b: number) => a + b, 0) / allRds.length) : null;

  // Collect all scores from any tournament with full scorecards for distribution
  const allCardScores: number[][] = [];
  const allCardPars: number[][] = [];
  if (bjgtCard) { allCardScores.push(...bjgtCard.rounds); bjgtCard.rounds.forEach(() => allCardPars.push([...VP_PAR])); }
  if (wjgcCard) { allCardScores.push(...wjgcCard.rds); wjgcCard.rds.forEach(() => allCardPars.push([...WJGC26_PAR])); }
  if (eowagr25Card) { allCardScores.push(...eowagr25Card.rds); eowagr25Card.rds.forEach(() => allCardPars.push([...EOWAGR25_PAR])); }
  if (wjgc26_1213Card) { allCardScores.push(...wjgc26_1213Card.rds); wjgc26_1213Card.rds.forEach(() => allCardPars.push([...WJGC26_1213_PAR])); }
  // Todos os auto-scorecards com par por buraco (evitar duplicar os que já foram incluídos acima)
  const dedupAutoTids = new Set(["brjgt25","wjgc26","eowagr25","wjgc26_1213"]);
  for (const sc of autoScorecards) {
    if (dedupAutoTids.has(sc.tid)) continue;  // já incluído via card dedicado
    dedupAutoTids.add(sc.tid);
    if (!sc.par || sc.par.length !== 18) continue;  // sem par por buraco → não conta para birdie %
    for (const rd of sc.rounds) {
      if (rd.length === 18 && rd.some(s => s > 0)) {
        allCardScores.push(rd);
        allCardPars.push(sc.par);
      }
    }
  }

  // BJGT 2025 special rendering (with field stats)
  const par = VP_PAR;
  const FH = FIELD_2025.holes;
  const frontPar = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const backPar = par.slice(9).reduce((a, b) => a + b, 0);
  const totalPar = frontPar + backPar;
  const sm = (arr: number[], f: number, t: number) => arr.slice(f, t).reduce((a, b) => a + b, 0);

  const SubCell = ({ gross, parVal, cls }: { gross: number; parVal: number; cls: string }) => {
    const tp = gross - parVal;
    return <td className={`${cls} fw-700`}>{gross}<span className={`sc-topar ${toParClass(tp)}`}>{fmtSign(tp)}</span></td>;
  };
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
      <td className="col-in" /><td className="col-total" />
    </tr>
  );

  return (
    <>
      {/* ── Header ── */}
      <div className="detail-header">
        <div className="detail-header-top">
          <h2 className="detail-title">
            <span>{flag}</span>
            <span>{playerName}</span>
            {rank != null && (
              <span className={`sidebar-rank ${rank <= 3 ? "sidebar-rank-top3" : rank <= 10 ? "sidebar-rank-top10" : "sidebar-rank-rest"}`}>
                #{rank}/{totalRanked}
              </span>
            )}
            {tr && <span className="fw-700 fs-13" style={{ color: TR_I[tr].c }}>{TR_I[tr].i}</span>}
          </h2>
          <button className="p p-filter p-sm" onClick={onShowTable}>Tabela ↗</button>
        </div>
        <div className="detail-sub">
          {rival && !isManuel && <span className="muted">{rival.co}</span>}
          {isManuel && <span className="p p-outline p-sm">REF</span>}
          {rival?.up.map(u => {
            const up = UP.find(x => x.id === u);
            return up ? <span key={u} className="p p-sm ml-6" style={{ background: "var(--bg-success-strong)", color: "var(--color-good-dark)" }}>▲ {up.short}</span> : null;
          })}
        </div>
      </div>

      {/* ── KPIs + Distribuição de scoring ── */}
      {(() => {
        let eagles=0,birdies=0,pars=0,bogeys=0,doubles=0,worse=0;
        for (let k=0;k<allCardScores.length;k++) {
          const sc=allCardScores[k], pp=allCardPars[k];
          for (let i=0;i<18;i++) { const d=sc[i]-pp[i]; if(d<=-2)eagles++; else if(d===-1)birdies++; else if(d===0)pars++; else if(d===1)bogeys++; else if(d===2)doubles++; else worse++; }
        }
        const holeTotal = allCardScores.length * 18;
        const pct = (v: number) => holeTotal ? (v/holeTotal*100).toFixed(0)+"%" : "—";
        const hasScoring = holeTotal > 0;
        const kpis: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }[] = [];
        if (playedDedup > 0) kpis.push({ label: "Torneios", value: playedDedup, sub: `${roundsDedup} rondas` });
        if (bestTp != null) kpis.push({ label: "Melhor ±Par", value: fmtToPar(bestTp), color: tpColorDark(bestTp) });
        if (avgRd != null) kpis.push({ label: "Média Ronda", value: avgRd.toFixed(1) });
        if (hasScoring) {
          if (eagles > 0) kpis.push({ label: "Eagle+", value: pct(eagles), sub: eagles, color: "var(--score-eagle-text, #7c3aed)" });
          kpis.push({ label: "Birdie", value: pct(birdies), sub: birdies, color: "var(--color-good-dark)" });
          kpis.push({ label: "Par", value: pct(pars), sub: pars });
          kpis.push({ label: "Bogey", value: pct(bogeys), sub: bogeys, color: "var(--color-warn, #d97706)" });
          if (doubles > 0) kpis.push({ label: "Duplo", value: pct(doubles), sub: doubles, color: "var(--color-bad, #dc2626)" });
          if (worse > 0) kpis.push({ label: "Triple+", value: pct(worse), sub: worse, color: "var(--color-bad, #dc2626)" });
        }
        if (!kpis.length) return null;
        const scoringItems = kpis.filter(k => ["Eagle+","Birdie","Par","Bogey","Duplo","Triple+"].includes(k.label));
        const statItems = kpis.filter(k => !["Eagle+","Birdie","Par","Bogey","Duplo","Triple+"].includes(k.label));
        const scoreClsMap: Record<string,string> = {"Eagle+":"eagle","Birdie":"birdie","Par":"par","Bogey":"bogey","Duplo":"double","Triple+":"triple"};
        return (
          <>
            {statItems.length > 0 && (
              <div className="kpis mb-8" style={{ gridTemplateColumns: `repeat(${Math.min(statItems.length, 5)}, 1fr)` }}>
                {statItems.map(k => (
                  <KpiCard key={k.label} label={k.label} value={k.value} sub={k.sub} color={k.color} size="sm" />
                ))}
              </div>
            )}
            {scoringItems.length > 0 && (
              <div className="d-flex gap-8 mb-12" style={{ flexWrap: "wrap", alignItems: "stretch" }}>
                {scoringItems.map(k => (
                  <div key={k.label} className="kpi" style={{ flex: "1 1 80px", minWidth: 72, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 6px" }}>
                    <span className="kpi-lbl">{k.label}</span>
                    <span className={`sc-score ${scoreClsMap[k.label] ?? ""}`} style={{ width: 36, height: 36, fontSize: 14, fontWeight: 900 }}>{k.value}</span>
                    <span className="kpi-sub">{k.sub}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        );
      })()}

      {/* ── Cards de torneio ── */}
      {tournResults.map(({ t, res, hasCard, autoCard, ageGroup, isAuto }) => {
        const expanded = expandedTourns.has(t.id);
        const wOrd = getTournWeight(t.id);
        const stars = wOrd >= 1.3 ? "★★★★★" : wOrd >= 1.1 ? "★★★★" : wOrd >= 0.9 ? "★★★" : wOrd >= 0.6 ? "★★" : wOrd >= 0.4 ? "★" : null;
        const manuelRes = !isManuel ? manuel?.r[t.id] : null;
        const vsM = manuelRes?.tp != null && res.tp != null ? res.tp - manuelRes.tp : null;
        const tpDisplay = res.tp != null ? fmtToPar(res.tp) : null;
        const totalRds = res.rd.reduce((a: number, b: number) => a + b, 0);

        return (
          <div key={t.id} className="sc-modern">
            <div className="sc-bar-head">
              <div>
                {t.url
                  ? <a href={t.url} target="_blank" rel="noopener noreferrer" className="rivais-link">{t.name}</a>
                  : <span>{t.name}</span>}
                <span className="fs-10 c-text-3 ml-6">
                  {t.date}
                  {stars && ` · ${stars}`}
                  {t.field > 0 && ` · ${t.field} jog. · ${t.nations} países`}
                </span>
                {ageGroup && (
                  <span style={{
                    display: "inline-flex", alignItems: "center",
                    background: "var(--bg-info-subtle, #e0f2fe)",
                    color: "var(--color-info-dark, #0369a1)",
                    border: "1px solid var(--color-info-light, #7dd3fc)",
                    borderRadius: 10, padding: "1px 7px",
                    fontSize: 10, fontWeight: 700, marginLeft: 6,
                    letterSpacing: "0.02em",
                  }}>{ageGroup}</span>
                )}
              </div>
              {hasCard && (
                <button className="p p-filter p-sm" onClick={() => toggleExpand(t.id)}>
                  {expanded ? "Fechar ▲" : "Scorecard ▼"}
                </button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "140px 90px 80px 1fr auto", alignItems: "center", padding: "10px 14px", gap: 0 }}>
              {/* Col 1: Posição */}
              <div className="d-flex items-center gap-6">
                {res.p != null && (() => {
                  const pos = typeof res.p === "number" ? res.p : null;
                  const fieldSize = t.field;
                  const medal = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : null;
                  const isTop10 = pos != null && pos <= 10 && pos > 3 && fieldSize >= 20;
                  return (
                    <div className="d-flex items-center gap-6">
                      {medal ? <span style={{ fontSize: 20, lineHeight: 1 }}>{medal}</span>
                        : isTop10 ? <span className="sidebar-rank sidebar-rank-top10" style={{ fontSize: 10, padding: "2px 6px", borderRadius: 10 }}>Top 10</span>
                        : null}
                      <div>
                        <span className="fs-11 c-text-3">Posição </span>
                        <span className="fw-800 fs-14">#{res.p}</span>
                        {fieldSize > 0 && <span className="fs-11 c-text-3">/{fieldSize}</span>}
                      </div>
                    </div>
                  );
                })()}
                {res.p == null && <span className="fs-11 c-text-3">—</span>}
              </div>
              {/* Col 2: Total */}
              <div>
                <span className="fs-11 c-text-3">Total </span>
                <span className="fw-700 fs-13">{res.t ?? totalRds}</span>
              </div>
              {/* Col 3: ±Par */}
              <div>
                {tpDisplay
                  ? <><span className="fs-11 c-text-3">±Par </span><span className="fw-700 fs-13" style={{ color: tpColorDark(res.tp) }}>{tpDisplay}</span></>
                  : <span className="fs-11 c-text-3">—</span>}
              </div>
              {/* Col 4: Rondas */}
              <div className="d-flex gap-8" style={{ flexWrap: "wrap" }}>
                {res.rd.filter((r: number|null) => r != null && r > 0).map((r: number, i: number) => (
                  <span key={i} className="fs-12 fw-600" style={{ color: tpColorDark(r - t.par, 5) }}>R{i+1}: {r}</span>
                ))}
              </div>
              {vsM != null && (
                <div>
                  <span className="fs-11 c-text-3">vs Manuel </span>
                  <span className="fw-700 fs-12" style={{ color: sc3m(vsM, 0, 0) }}>{fmtSign(vsM)}</span>
                </div>
              )}
            </div>

            {expanded && hasCard && (
              <div style={{ padding: "0 8px 12px", borderTop: "1px solid var(--border-light)" }}>
                {t.id === "brjgt25" && bjgtCard && (
                  <div className="bjgt-chart-scroll">
                    <table className="sc-table-modern" data-sc-table="1">
                      <THead />
                      <tbody>
                        <FieldAvgRow />
                        <ParRow sep />
                        {bjgtCard.rounds.map((rd, i) => <GrossRow key={i} holes={rd} label={`R${i + 1}`} />)}
                        <GrossRow holes={bjgtCard.ecl} label="ECL" />
                        <VsFieldRow holes={bjgtCard.ecl} />
                      </tbody>
                    </table>
                  </div>
                )}
                {t.id === "wjgc26" && wjgcCard && (
                  <TournScorecard par={WJGC26_PAR} si={WJGC26_SI}
                    rounds={wjgcCard.rds.map((sc, i) => ({ label: `R${i + 1}`, scores: [...sc] }))} />
                )}

                {t.id === "eowagr25" && eowagr25Card && (
                  <TournScorecard par={EOWAGR25_PAR} si={EOWAGR25_SI}
                    rounds={eowagr25Card.rds.map((sc, i) => ({ label: `R${i + 1}`, scores: [...sc] }))} />
                )}
                {t.id === "wjgc26_1213" && wjgc26_1213Card && (
                  <TournScorecard par={WJGC26_1213_PAR} si={WJGC26_1213_SI}
                    rounds={wjgc26_1213Card.rds.map((sc, i) => ({ label: `R${i + 1}`, scores: [...sc] }))} />
                )}
                {/* Auto-loaded scorecard — torneios auto E torneios manuais sem card dedicado (Venice, Rome, Doral…) */}
                {autoCard && (
                  <TournScorecard
                    par={autoCard.par as unknown as readonly number[]}
                    si={autoCard.si.length > 0 ? autoCard.si as unknown as readonly number[] : undefined}
                    rounds={autoCard.rounds.map((sc, i) => ({ label: `R${i + 1}`, scores: sc }))}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {!rival && lbEntry && (
        <div className="notice notice-info mt-10">
          BJGT 2025: {lbEntry.rounds.join("-")} = {lbEntry.total} ({fmtToPar(lbEntry.result)})
          {!bjgtCard && " — scorecard buraco-a-buraco não disponível"}
        </div>
      )}

      {played === 0 && !lbEntry && (
        <EmptyState size="sm" message="Sem resultados registados ainda." />
      )}
    </>
  );
}

function FieldPlayerDetail({ playerName, onBack }: { playerName: string; onBack: () => void }) {
  const card = FIELD_CARDS.find(c => c.name === playerName);
  const lbEntry = FIELD_2025.leaderboard.find(p => p.name === playerName);
  const rivals = useRivals();
  const rival = rivals.find(d => d.n === playerName);

  if (!lbEntry && !rival) return (
    <div className="tourn-section">
      <button className="p p-filter active mb-8" onClick={onBack}>← Voltar</button>
      <EmptyState size="sm" message={`Sem dados disponíveis para ${playerName}`} />
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
  const tournResults: { name: string; short: string; date: string; dateExact: string; par: number; pos: number | string | null; total: number | null; tp: number | null; rounds: number[] }[] = [];
  if (rival) {
    // First: manual T array
    for (const t of T) {
      const res = rival.r[t.id];
      if (res) tournResults.push({ name: t.name, short: t.short, date: t.date, dateExact: t.dateExact ?? t.date, par: t.par, pos: res.p, total: res.t, tp: res.tp, rounds: res.rd });
    }
    // Then: auto-loaded tourns not in manual T
    const manualIds = new Set(T.map(t => t.id));
    for (const [tid, res] of Object.entries(rival.r)) {
      if (!manualIds.has(tid)) {
        const info = getTournInfo(tid);
        tournResults.push({ name: info.name, short: info.short, date: info.date, dateExact: info.dateExact, par: 72, pos: res.p, total: res.t, tp: res.tp, rounds: res.rd });
      }
    }
    // Sort by date
    tournResults.sort((a, b) => a.dateExact.localeCompare(b.dateExact));
  }

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
                        const col = tpColorDark(rdTp, 5);
                        return <td key={j} className="r tourn-mono fw-600" style={{ color: col }}>{rd}</td>;
                      })}
                      <td className="r tourn-mono fw-800">{r.total ?? "–"}</td>
                      <td className="r fw-700" style={{ color: tpColorDark(r.tp, 15) }}>{fmtToPar(r.tp)}</td>
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
  const { rivals, loaded, progress } = useAutoRivals();

  // Actualizar rankMap quando os rivais carregam e forçar re-render
  const [rankVersion, setRankVersion] = React.useState(0);
  React.useEffect(() => {
    if (loaded) {
      const newMap = buildRankMap(rivals);
      Object.keys(rankMap).forEach(k => delete rankMap[k]);
      Object.assign(rankMap, newMap);
      totalRanked = Object.keys(rankMap).length;
      setRankVersion(v => v + 1);
    }
  }, [rivals, loaded]);

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>("Manuel Medeiros");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showTable, setShowTable] = useState(false);

  const handleSelectPlayer = (name: string) => {
    setSelectedPlayer(name);
    setShowTable(false);
  };

  return (
    <RivalsCtx.Provider value={rivals}>
    <div className="tourn-layout">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? "Fechar painel" : "Abrir painel"}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <span className="toolbar-title">🌍 Rivais Internacionais</span>
          <span className="toolbar-meta">
            Manuel · Sub-12
            {loaded
              ? <span style={{ marginLeft: 8, fontSize: 10, color: "var(--color-good-dark)", fontWeight: 700 }}> · {rivals.length} rivais · ✓ TUDO CARREGADO</span>
              : progress
                ? <span style={{ marginLeft: 8, fontSize: 10, color: "var(--text-muted)" }}>
                    · {rivals.length} rivais · <span style={{ color: "var(--text-2)" }}>{progress.done}/{progress.total}</span> <span style={{ color: "var(--text-3)" }}>{progress.label}</span>
                    <span style={{ display: "inline-block", marginLeft: 6, width: 60, height: 4, background: "var(--border)", borderRadius: 2, verticalAlign: "middle", position: "relative", overflow: "hidden" }}>
                      <span style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.round(progress.done / progress.total * 100)}%`, background: "var(--color-good-dark)", borderRadius: 2, transition: "width .3s" }} />
                    </span>
                  </span>
                : <span style={{ marginLeft: 8, fontSize: 10, color: "var(--text-muted)" }}>⏳ a iniciar...</span>}
          </span>
        </div>
        <div className="toolbar-right">
          <button
            className={`p p-filter p-sm${showTable ? " active" : ""}`}
            onClick={() => setShowTable(t => !t)}
          >Tabela</button>
        </div>
      </div>

      {/* Master-detail */}
      <div className="master-detail">
        <div className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
          <RivaisSidebar selected={selectedPlayer} onSelect={handleSelectPlayer} />
        </div>
        <div className="course-detail">
          {showTable ? (
            <RivaisDashboard onSelectPlayer={handleSelectPlayer} />
          ) : selectedPlayer ? (
            <RivalDetail playerName={selectedPlayer} onShowTable={() => setShowTable(true)} />
          ) : (
            <div className="muted p-16">Selecciona um rival na lista à esquerda.</div>
          )}
        </div>
      </div>
    </div>
    </RivalsCtx.Provider>
  );
}

export default function RivaisIntlPage() {
  const [unlocked, setUnlocked] = useState(() => isCalUnlocked());
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  return <RivaisIntlContent />;
}
