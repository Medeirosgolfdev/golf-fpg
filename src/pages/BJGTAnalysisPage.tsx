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
import { norm, fmtToPar, firstName, fmtSign } from "../utils/format";
import { linearSlopeXY } from "../utils/mathUtils";
import { scClass, toParClass, sc2, sc2w, sc3, sc3m, diagLevel, scDark, SC } from "../utils/scoreDisplay";
import { isCalUnlocked } from "../utils/authConstants";
import PasswordGate from "../ui/PasswordGate";
import ScoreCircle from "../ui/ScoreCircle";
import SectionErrorBoundary from "../ui/SectionErrorBoundary";
import LoadingState from "../ui/LoadingState";

/* ═══════════════════════════════════
   TYPES
   ═══════════════════════════════════ */
interface TournResult { p: number | string; t: number | null; tp: number | null; rd: number[] }
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

/* ═══ WJGC 2026 — R1 data (Villa Padierna Flamingos, par 72) ═══ */
const VP26_PAR = [5,3,4,3,4,5,4,3,4, 5,5,3,4,4,5,3,4,4];
const VP26_SI  = [4,10,6,18,16,8,14,12,2, 1,7,9,15,11,5,13,17,3];
const VP26_PAR_F = 35, VP26_PAR_B = 37, VP26_PAR_T = 72;
interface VP26Player { n:string; co:string; flag:string; s:number[]|null; f9:number; b9:number; gross:number; tp:number; pos:number|string }
const VP26_RAW: {n:string;co:string;flag:string;s:number[]|null}[] = [
  {n:"Dmitrii Elchaninov",co:"Russian Federation",flag:"🇷🇺",s:[6,3,4,3,3,5,5,2,4,5,5,2,4,4,5,3,4,5]},
  {n:"Manuel Medeiros",co:"Portugal",flag:"🇵🇹",s:[5,3,3,3,4,7,3,3,4,4,6,3,5,4,6,4,4,4]},
  {n:"William Harran",co:"Switzerland",flag:"🇨🇭",s:[4,3,4,3,5,4,4,4,4,5,6,2,5,4,5,3,5,5]},
  {n:"Weilian Sun",co:"China",flag:"🇨🇳",s:[8,3,3,4,4,4,5,2,4,5,5,3,4,3,7,3,3,5]},
  {n:"Henry Bucys",co:"England",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",s:[4,3,4,3,3,4,4,4,4,6,5,5,5,4,6,4,4,4]},
  {n:"Myles Jones",co:"Wales",flag:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",s:[5,4,4,4,4,6,5,3,4,4,6,3,4,4,5,3,5,5]},
  {n:"Christian Chepishev",co:"Bulgaria",flag:"🇧🇬",s:[5,4,4,3,4,5,6,4,3,6,5,3,5,6,5,3,4,4]},
  {n:"Sean Wilding",co:"Thailand",flag:"🇹🇭",s:[6,4,5,3,3,5,5,2,4,5,5,4,6,4,6,3,5,4]},
  {n:"Leon Schneitter",co:"Switzerland",flag:"🇨🇭",s:[5,4,5,3,4,5,5,4,5,4,5,4,5,4,8,2,3,5]},
  {n:"Dylan Dedaj Ungureanu",co:"Spain",flag:"🇪🇸",s:[5,3,4,2,4,6,5,3,4,5,7,3,4,5,7,4,5,4]},
  {n:"Philippe Xiao",co:"France",flag:"🇫🇷",s:[6,4,4,3,5,6,5,2,4,5,5,4,5,6,6,2,4,4]},
  {n:"Diego Gross Paneque",co:"Spain",flag:"🇪🇸",s:[5,3,5,5,5,4,5,4,5,5,5,4,4,4,5,3,5,5]},
  {n:"Alexis Beringer",co:"Switzerland",flag:"🇨🇭",s:[4,5,5,4,4,5,7,4,3,5,5,3,5,4,5,3,5,5]},
  {n:"Aineon Hiram Jabonero",co:"Philippines",flag:"🇵🇭",s:[5,6,5,4,3,6,5,4,4,4,5,4,4,4,5,4,5,5]},
  {n:"Niko Alvarez Van Der Walt",co:"Spain",flag:"🇪🇸",s:[5,3,6,3,3,5,4,4,4,6,7,4,5,4,5,3,6,5]},
  {n:"Hugo Strasser",co:"Switzerland",flag:"🇨🇭",s:[5,3,3,4,5,6,3,3,5,5,6,4,6,4,7,3,5,5]},
  {n:"Álex Carrón",co:"Spain",flag:"🇪🇸",s:[5,3,4,3,4,6,4,4,4,7,7,4,5,4,6,3,5,5]},
  {n:"Oscar Bunt",co:"England",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",s:[5,5,4,3,4,8,4,4,3,4,5,5,4,5,6,4,5,5]},
  {n:"Benji Botham",co:"Northern Ireland",flag:"🇬🇧",s:[6,3,4,4,5,5,4,3,7,5,6,4,5,4,6,3,5,4]},
  {n:"Lukas Doherty",co:"Norway",flag:"🇳🇴",s:[6,4,5,3,4,5,5,3,4,5,6,4,5,4,7,3,6,5]},
  {n:"Elias Didjurgis",co:"Germany",flag:"🇩🇪",s:[7,5,4,3,4,6,6,2,6,5,6,3,5,4,7,3,5,5]},
  {n:"Maddox Tiemann",co:"Sweden",flag:"🇸🇪",s:[5,3,6,3,4,6,5,3,4,7,5,3,6,4,7,3,5,8]},
  {n:"Elijah Gibbons",co:"England",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",s:[6,4,4,3,5,6,3,4,4,9,5,4,6,3,7,5,4,5]},
  {n:"Buster Airey",co:"England",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",s:[7,3,5,3,5,5,5,4,4,8,5,4,6,4,6,4,5,5]},
  {n:"Aron Klinkenberg",co:"Netherlands",flag:"🇳🇱",s:[7,5,5,5,4,6,4,4,4,6,4,5,5,5,7,5,4,3]},
  {n:"Hermes Stuart Cañizares Plaja",co:"Spain",flag:"🇪🇸",s:[5,4,5,2,5,5,4,4,8,4,6,3,10,3,7,3,5,5]},
  {n:"Miroslavs Bogdanovs",co:"Spain",flag:"🇪🇸",s:[6,5,4,4,4,5,4,3,4,6,7,4,6,4,8,4,5,5]},
  {n:"Henry Liechti",co:"Switzerland",flag:"🇨🇭",s:[7,6,5,4,4,6,4,4,4,7,5,4,4,5,7,3,6,4]},
  {n:"Joe Short",co:"Portugal",flag:"🇵🇹",s:[6,4,6,3,3,8,6,4,3,5,6,3,5,5,6,7,4,6]},
  {n:"Zeyn Lababedi",co:"England",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",s:[8,5,5,3,4,6,5,3,4,6,7,4,5,5,9,3,4,5]},
  {n:"Rodrigo Palacios Bauer",co:"Spain",flag:"🇪🇸",s:[6,4,4,5,4,6,7,4,3,5,10,3,6,4,8,2,5,6]},
  {n:"Arthur Lamblin",co:"France",flag:"🇫🇷",s:[8,4,5,4,4,8,4,3,5,6,6,3,5,5,6,3,6,7]},
  {n:"Kai Russell",co:"England",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",s:[6,4,5,6,4,5,3,4,4,11,5,3,5,5,9,3,6,4]},
  {n:"James Doyle",co:"Ireland",flag:"🇮🇪",s:[8,8,6,3,4,7,4,3,5,3,9,6,3,5,8,6,6,4]},
  {n:"Joseph Robinson",co:"England",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",s:[8,6,4,4,4,8,7,3,5,5,6,4,6,4,4,4,12,5]},
  {n:"Kevin Canton",co:"Italy",flag:"🇮🇹",s:[4,3,8,4,5,6,7,2,4,7,6,4,6,5,8,5,9,7]},
  {n:"Isaac Cawrey",co:"England",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",s:null},
  {n:"Travis Reaves",co:"United States",flag:"🇺🇸",s:null},
];
const VP26_PLAYERS: VP26Player[] = (() => {
  const valid = VP26_RAW.filter(p => p.s).map(p => {
    const f9 = p.s!.slice(0,9).reduce((a,b)=>a+b,0);
    const b9 = p.s!.slice(9,18).reduce((a,b)=>a+b,0);
    return { ...p, f9, b9, gross: f9+b9, tp: f9+b9-VP26_PAR_T, pos: 0 as number|string };
  });
  valid.sort((a,b) => a.gross - b.gross);
  valid.forEach((v,i) => { v.pos = i===0 ? 1 : v.gross===valid[i-1].gross ? valid[i-1].pos : i+1; });
  const dns = VP26_RAW.filter(p => !p.s).map(p => ({ ...p, f9:0, b9:0, gross:0, tp:0, pos:"DNS" as number|string }));
  return [...valid, ...dns];
})();

/* ═══ WJGC Cross-Year Evolution Data ═══ */
interface EvoEntry { n:string; co:string; from:string; to:string; y25:number; y26:number; delta:number; pill:string }
const EVOLUTION: EvoEntry[] = [
  {n:"Alexis Beringer",co:"Suíça",from:"10-11",to:"10-11",y25:290,y26:246,delta:-44,pill:"STAY"},
  {n:"Christian Chepishev",co:"Bulgária",from:"10-11",to:"10-11",y25:270,y26:230,delta:-40,pill:"STAY"},
  {n:"Manuel Medeiros",co:"Portugal",from:"10-11",to:"10-11",y25:265,y26:232,delta:-33,pill:"STAY"},
  {n:"Kevin Canton",co:"Itália",from:"10-11",to:"10-11",y25:291,y26:273,delta:-18,pill:"STAY"},
  {n:"Diego Gross Paneque",co:"Espanha",from:"10-11",to:"10-11",y25:249,y26:232,delta:-17,pill:"STAY"},
  {n:"Kirill Sedov",co:"Fed. Russa",from:"10-11",to:"12-13",y25:247,y26:234,delta:-13,pill:"UP"},
  {n:"Niko Alvarez Van Der Walt",co:"Espanha",from:"10-11",to:"10-11",y25:261,y26:249,delta:-12,pill:"STAY"},
  {n:"Miroslavs Bogdanovs",co:"Espanha",from:"10-11",to:"10-11",y25:263,y26:252,delta:-11,pill:"STAY"},
  {n:"Maxime Vervaet",co:"Espanha",from:"10-11",to:"12-13",y25:239,y26:230,delta:-9,pill:"UP"},
  {n:"Lukas Doherty",co:"Noruega",from:"8-9",to:"10-11",y25:265,y26:258,delta:-7,pill:"UP"},
  {n:"Álex Carrón",co:"Espanha",from:"10-11",to:"10-11",y25:246,y26:241,delta:-5,pill:"STAY"},
  {n:"Joe Short",co:"Portugal",from:"8-9",to:"10-11",y25:268,y26:266,delta:-2,pill:"UP"},
  {n:"James Doyle",co:"Irlanda",from:"10-11",to:"10-11",y25:277,y26:276,delta:-1,pill:"STAY"},
  {n:"Daniel Avila Sanz",co:"Espanha",from:"10-11",to:"12-13",y25:240,y26:239,delta:-1,pill:"UP"},
  {n:"Aineon Hiram Jabonero",co:"Filipinas",from:"8-9",to:"10-11",y25:257,y26:257,delta:0,pill:"UP"},
  {n:"Hugo Luque Reina",co:"Espanha",from:"10-11",to:"12-13",y25:237,y26:239,delta:2,pill:"UP"},
  {n:"Benji Botham",co:"Irlanda do Norte",from:"8-9",to:"10-11",y25:240,y26:244,delta:4,pill:"UP"},
  {n:"Dmitrii Elchaninov",co:"Fed. Russa",from:"10-11",to:"10-11",y25:205,y26:210,delta:5,pill:"STAY"},
  {n:"Henry Liechti",co:"Suíça",from:"10-11",to:"10-11",y25:250,y26:255,delta:5,pill:"STAY"},
  {n:"Marcus Karim",co:"Inglaterra",from:"10-11",to:"12-13",y25:218,y26:225,delta:7,pill:"UP"},
  {n:"Buster Airey",co:"Inglaterra",from:"8-9",to:"10-11",y25:241,y26:252,delta:11,pill:"UP"},
  {n:"Aronas Juodis",co:"Lituânia",from:"10-11",to:"12-13",y25:232,y26:245,delta:13,pill:"UP"},
  {n:"Harrison Barnett",co:"Inglaterra",from:"10-11",to:"12-13",y25:220,y26:237,delta:17,pill:"UP"},
  {n:"Elijah Gibbons",co:"Inglaterra",from:"8-9",to:"10-11",y25:233,y26:253,delta:20,pill:"UP"},
];

const AGE_GROUP_26: Record<string, "ex89"|"ex1011"|"new"> = {
  "Dmitrii Elchaninov":"ex1011","William Harran":"new","Sean Wilding":"new","Weilian Sun":"new",
  "Philippe Xiao":"new","Hugo Strasser":"new","Christian Chepishev":"ex1011","Henry Bucys":"new",
  "Manuel Medeiros":"ex1011","Diego Gross Paneque":"ex1011","Leon Schneitter":"new",
  "Dylan Dedaj Ungureanu":"new","Alexis Beringer":"ex1011","Oscar Bunt":"new",
  "Benji Botham":"ex89","Álex Carrón":"ex1011","Myles Jones":"new",
  "Niko Alvarez Van Der Walt":"ex1011","Aineon Hiram Jabonero":"ex89","Lukas Doherty":"ex89",
  "Elijah Gibbons":"ex89","Hermes Stuart Cañizares Plaja":"new","Buster Airey":"ex89",
  "Joe Short":"ex89","Miroslavs Bogdanovs":"ex1011","Elias Didjurgis":"new",
  "Kai Russell":"new","Henry Liechti":"ex1011","Maddox Tiemann":"ex89","Aron Klinkenberg":"new",
  "Zeyn Lababedi":"new","Rodrigo Palacios bauer":"new","James Doyle":"ex1011",
  "Kevin Canton":"ex1011","Arthur Lamblin":"new","Joseph Robinson":"new",
};

/* ═══ WJGC 2026 — Final Leaderboard (3R) ═══ */
interface VP26Final { n:string; co:string; flag:string; p:number|string; t:number; tp:number; rd:number[]; ag?:string }
const VP26_FINAL: VP26Final[] = [
  {n:"Dmitrii Elchaninov",co:"Fed. Russa",flag:"🇷🇺",p:1,t:210,tp:-6,rd:[69,69,72],ag:"ex1011"},
  {n:"William Harran",co:"Suíça",flag:"🇨🇭",p:2,t:221,tp:5,rd:[75,71,75],ag:"new"},
  {n:"Sean Wilding",co:"Tailândia",flag:"🇹🇭",p:3,t:224,tp:8,rd:[71,74,79],ag:"new"},
  {n:"Weilian Sun",co:"China",flag:"🇨🇳",p:4,t:225,tp:9,rd:[77,73,75],ag:"new"},
  {n:"Philippe Xiao",co:"França",flag:"🇫🇷",p:5,t:227,tp:11,rd:[74,73,80],ag:"new"},
  {n:"Hugo Strasser",co:"Suíça",flag:"🇨🇭",p:6,t:228,tp:12,rd:[73,73,82],ag:"new"},
  {n:"Christian Chepishev",co:"Bulgária",flag:"🇧🇬",p:7,t:230,tp:14,rd:[75,76,79],ag:"ex1011"},
  {n:"Henry Bucys",co:"Inglaterra",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:8,t:231,tp:15,rd:[79,76,76],ag:"new"},
  {n:"Manuel Medeiros",co:"Portugal",flag:"🇵🇹",p:9,t:232,tp:16,rd:[79,78,75],ag:"ex1011"},
  {n:"Diego Gross Paneque",co:"Espanha",flag:"🇪🇸",p:9,t:232,tp:16,rd:[76,75,81],ag:"ex1011"},
  {n:"Leon Schneitter",co:"Suíça",flag:"🇨🇭",p:11,t:236,tp:20,rd:[76,80,80],ag:"new"},
  {n:"Álex Carrón",co:"Espanha",flag:"🇪🇸",p:12,t:241,tp:25,rd:[76,82,83],ag:"ex1011"},
  {n:"Benji Botham",co:"Irlanda N.",flag:"🇬🇧",p:13,t:244,tp:28,rd:[81,80,83],ag:"ex89"},
  {n:"Dylan Dedaj Ungureanu",co:"Espanha",flag:"🇪🇸",p:14,t:245,tp:29,rd:[84,81,80],ag:"new"},
  {n:"Oscar Bunt",co:"Inglaterra",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:14,t:245,tp:29,rd:[82,80,83],ag:"new"},
  {n:"Myles Jones",co:"Gales",flag:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",p:14,t:245,tp:29,rd:[79,88,78],ag:"new"},
  {n:"Alexis Beringer",co:"Suíça",flag:"🇨🇭",p:17,t:246,tp:30,rd:[83,82,81],ag:"ex1011"},
  {n:"Hermes S.C. Plaja",co:"Espanha",flag:"🇪🇸",p:18,t:248,tp:32,rd:[77,83,88],ag:"new"},
  {n:"Niko Alvarez",co:"Espanha",flag:"🇪🇸",p:19,t:249,tp:33,rd:[81,86,82],ag:"ex1011"},
  {n:"Buster Airey",co:"Inglaterra",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:20,t:252,tp:36,rd:[79,85,88],ag:"ex89"},
  {n:"Miroslavs Bogdanovs",co:"Espanha",flag:"🇪🇸",p:20,t:252,tp:36,rd:[78,86,88],ag:"ex1011"},
  {n:"Elijah Gibbons",co:"Inglaterra",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:22,t:253,tp:37,rd:[83,83,87],ag:"ex89"},
  {n:"Henry Liechti",co:"Suíça",flag:"🇨🇭",p:23,t:255,tp:39,rd:[79,87,89],ag:"ex1011"},
  {n:"Kai Russell",co:"Inglaterra",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:24,t:256,tp:40,rd:[81,83,92],ag:"new"},
  {n:"Aineon H. Jabonero",co:"Filipinas",flag:"🇵🇭",p:25,t:257,tp:41,rd:[88,87,82],ag:"ex89"},
  {n:"Lukas Doherty",co:"Noruega",flag:"🇳🇴",p:26,t:258,tp:42,rd:[89,85,84],ag:"ex89"},
  {n:"Elias Didjurgis",co:"Alemanha",flag:"🇩🇪",p:27,t:259,tp:43,rd:[84,89,86],ag:"new"},
  {n:"Joe Short",co:"Portugal",flag:"🇵🇹",p:28,t:266,tp:50,rd:[93,83,90],ag:"ex89"},
  {n:"Rodrigo P. Bauer",co:"Espanha",flag:"🇪🇸",p:29,t:267,tp:51,rd:[82,93,92],ag:"new"},
  {n:"Kevin Canton",co:"Itália",flag:"🇮🇹",p:30,t:273,tp:57,rd:[85,88,100],ag:"ex1011"},
  {n:"James Doyle",co:"Irlanda",flag:"🇮🇪",p:31,t:276,tp:60,rd:[91,87,98],ag:"ex1011"},
  {n:"Joseph Robinson",co:"Inglaterra",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:32,t:277,tp:61,rd:[85,93,99],ag:"new"},
  {n:"Arthur Lamblin",co:"França",flag:"🇫🇷",p:33,t:279,tp:63,rd:[89,98,92],ag:"new"},
  {n:"Zeyn Lababedi",co:"Inglaterra",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:34,t:280,tp:64,rd:[95,94,91],ag:"new"},
  {n:"Maddox Tiemann",co:"Suécia",flag:"🇸🇪",p:"WD",t:176,tp:32,rd:[89,87],ag:"ex89"},
  {n:"Aron Klinkenberg",co:"Holanda",flag:"🇳🇱",p:"WD",t:179,tp:35,rd:[91,88],ag:"new"},
];
const MANUEL_POS_26 = 9;
const FIELD_TOTAL_26 = 36;
/* ═══ ALL CONTEST DATA (4 age groups) ═══ */
interface RdData { g:number; s:number[] }
interface ContestPlayer { n:string; co:string; fl:string; p:number|string; t:number; tp:number; rd:RdData[]; isM?:boolean }
interface ContestData { label:string; par:number; parArr:number[]; nRounds:number; players:ContestPlayer[] }

const C25_89: ContestData = {
  label:"2025 Boys 8-9",par:71,parArr:[5, 3, 4, 3, 4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4],nRounds:3,
  players:[
    {n:"Elijah Gibbons",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:1,t:233,tp:20,rd:[{g:81,s:[5, 3, 4, 3, 4, 3, 5, 4, 4, 5, 5, 6, 6, 5, 6, 4, 4, 5]},{g:81,s:[6, 5, 4, 4, 4, 4, 4, 4, 4, 4, 5, 4, 5, 5, 7, 4, 4, 4]},{g:71,s:[4, 3, 5, 4, 4, 3, 5, 5, 3, 3, 4, 3, 4, 4, 7, 3, 3, 4]}]},
    {n:"Benji Botham",co:"Irlanda do Norte",fl:"🇬🇧",p:2,t:240,tp:27,rd:[{g:83,s:[5, 4, 7, 4, 4, 6, 6, 3, 4, 4, 6, 3, 5, 4, 7, 3, 4, 4]},{g:74,s:[5, 3, 3, 4, 4, 5, 4, 3, 4, 5, 4, 4, 4, 4, 6, 3, 4, 5]},{g:83,s:[6, 3, 5, 4, 3, 6, 3, 3, 8, 4, 6, 3, 5, 5, 7, 3, 4, 5]}]},
    {n:"Buster Airey",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:3,t:241,tp:28,rd:[{g:85,s:[5, 3, 5, 3, 4, 5, 4, 3, 5, 6, 7, 5, 6, 4, 7, 3, 6, 4]},{g:80,s:[5, 3, 4, 3, 4, 6, 5, 4, 4, 4, 4, 3, 6, 7, 6, 4, 5, 3]},{g:76,s:[6, 2, 3, 5, 4, 6, 4, 3, 4, 4, 6, 4, 4, 3, 6, 3, 5, 4]}]},
    {n:"Oliver McNamara",co:"Irlanda",fl:"🇮🇪",p:4,t:242,tp:29,rd:[{g:81,s:[5, 3, 4, 2, 6, 6, 4, 4, 4, 4, 5, 4, 5, 4, 7, 3, 6, 5]},{g:79,s:[4, 4, 5, 3, 4, 5, 4, 3, 4, 5, 4, 5, 4, 4, 6, 3, 4, 8]},{g:82,s:[5, 3, 3, 3, 4, 6, 4, 4, 7, 7, 5, 3, 4, 4, 6, 4, 6, 4]}]},
    {n:"David Dung Nguyen",co:"Vietnã",fl:"🇻🇳",p:5,t:244,tp:31,rd:[{g:81,s:[6, 3, 4, 4, 4, 6, 3, 4, 6, 4, 6, 4, 4, 5, 7, 3, 5, 3]},{g:84,s:[5, 3, 5, 3, 8, 6, 4, 4, 4, 4, 6, 3, 4, 4, 6, 4, 4, 7]},{g:79,s:[5, 4, 5, 3, 5, 4, 3, 4, 4, 6, 6, 3, 5, 4, 6, 4, 5, 3]}]},
    {n:"Sidney Scerri",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:6,t:248,tp:35,rd:[{g:83,s:[7, 4, 4, 3, 4, 5, 5, 4, 5, 4, 5, 3, 6, 4, 7, 4, 5, 4]},{g:84,s:[6, 3, 4, 4, 4, 6, 4, 4, 7, 4, 7, 3, 3, 6, 7, 3, 5, 4]},{g:81,s:[5, 3, 6, 4, 6, 7, 5, 4, 5, 4, 3, 3, 4, 4, 5, 4, 4, 5]}]},
    {n:"Gonzalo Bernal Suárez",co:"Espanha",fl:"🇪🇸",p:7,t:252,tp:39,rd:[{g:83,s:[5, 4, 4, 4, 4, 4, 4, 5, 4, 4, 5, 3, 5, 5, 7, 6, 4, 6]},{g:83,s:[6, 4, 4, 4, 4, 6, 4, 3, 4, 5, 7, 4, 4, 4, 7, 4, 4, 5]},{g:86,s:[5, 4, 4, 7, 4, 4, 5, 3, 5, 5, 6, 4, 5, 4, 7, 3, 5, 6]}]},
    {n:"Louis Locquet",co:"França",fl:"🇫🇷",p:8,t:253,tp:40,rd:[{g:85,s:[4, 5, 5, 3, 5, 6, 5, 5, 3, 4, 5, 4, 4, 6, 6, 6, 5, 4]},{g:85,s:[5, 3, 5, 3, 6, 6, 4, 4, 5, 4, 7, 2, 5, 5, 7, 4, 5, 5]},{g:83,s:[4, 3, 5, 6, 4, 5, 3, 4, 4, 4, 6, 4, 6, 5, 7, 3, 5, 5]}]},
    {n:"Taio-Blake Burkitt",co:"Gales",fl:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",p:9,t:254,tp:41,rd:[{g:83,s:[7, 3, 4, 4, 3, 4, 4, 4, 5, 6, 5, 3, 4, 6, 6, 3, 7, 5]},{g:83,s:[5, 4, 4, 5, 5, 5, 4, 4, 4, 4, 7, 4, 4, 5, 6, 2, 6, 5]},{g:88,s:[6, 3, 5, 4, 4, 5, 4, 7, 4, 4, 6, 4, 4, 8, 6, 3, 5, 6]}]},
    {n:"Isaac Cawrey",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:10,t:255,tp:42,rd:[{g:83,s:[5, 3, 6, 5, 5, 6, 4, 4, 3, 5, 5, 5, 5, 4, 6, 3, 4, 5]},{g:87,s:[6, 2, 5, 5, 5, 5, 4, 4, 4, 7, 9, 2, 5, 4, 7, 3, 6, 4]},{g:85,s:[7, 4, 4, 4, 5, 5, 4, 3, 4, 5, 6, 4, 6, 4, 7, 3, 5, 5]}]},
    {n:"Emin Rzayev",co:"Azerbaijão",fl:"🇦🇿",p:10,t:255,tp:42,rd:[{g:85,s:[5, 5, 5, 5, 4, 7, 4, 4, 5, 4, 5, 3, 6, 4, 7, 4, 4, 4]},{g:80,s:[5, 4, 4, 4, 6, 5, 4, 3, 4, 5, 5, 4, 4, 5, 7, 2, 4, 5]},{g:90,s:[6, 3, 5, 5, 5, 7, 2, 5, 4, 8, 5, 4, 7, 5, 5, 4, 4, 6]}]},
    {n:"Ritchie Riley",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:10,t:255,tp:42,rd:[{g:87,s:[5, 3, 6, 4, 5, 5, 4, 4, 3, 6, 5, 4, 6, 4, 8, 5, 5, 5]},{g:80,s:[5, 3, 5, 4, 5, 6, 4, 3, 6, 4, 5, 4, 4, 4, 7, 3, 3, 5]},{g:88,s:[5, 3, 5, 5, 5, 6, 3, 4, 6, 6, 7, 4, 8, 5, 5, 4, 4, 3]}]},
    {n:"Aineon Hiram Jabonero",co:"Filipinas",fl:"🇵🇭",p:13,t:257,tp:44,rd:[{g:83,s:[5, 3, 6, 4, 5, 5, 5, 4, 5, 4, 5, 3, 4, 4, 8, 3, 5, 5]},{g:93,s:[7, 4, 5, 4, 6, 6, 6, 4, 6, 6, 6, 5, 4, 4, 6, 3, 6, 5]},{g:81,s:[4, 4, 5, 4, 3, 6, 4, 5, 5, 6, 6, 4, 4, 4, 5, 3, 5, 4]}]},
    {n:"Maddox Tiemann",co:"Suécia",fl:"🇸🇪",p:14,t:258,tp:45,rd:[{g:91,s:[7, 3, 8, 4, 4, 6, 4, 3, 6, 6, 7, 4, 4, 5, 7, 4, 4, 5]},{g:84,s:[7, 3, 5, 4, 4, 7, 4, 4, 4, 4, 5, 4, 5, 5, 8, 3, 3, 5]},{g:83,s:[8, 3, 6, 3, 3, 6, 5, 4, 4, 4, 6, 3, 5, 4, 5, 4, 5, 5]}]},
    {n:"Harry Francis",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:15,t:259,tp:46,rd:[{g:89,s:[7, 6, 4, 5, 5, 5, 5, 5, 3, 5, 6, 3, 6, 4, 7, 3, 4, 6]},{g:86,s:[5, 3, 5, 5, 4, 5, 4, 4, 4, 4, 6, 3, 5, 6, 8, 4, 5, 6]},{g:84,s:[5, 3, 4, 4, 4, 6, 4, 4, 5, 4, 6, 2, 5, 5, 8, 4, 5, 6]}]},
    {n:"Morgan Chaney",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:16,t:263,tp:50,rd:[{g:88,s:[6, 4, 7, 4, 4, 6, 6, 3, 4, 4, 5, 3, 7, 6, 7, 3, 4, 5]},{g:84,s:[5, 4, 5, 3, 5, 6, 3, 3, 4, 6, 6, 5, 5, 4, 7, 3, 5, 5]},{g:91,s:[5, 3, 5, 5, 5, 6, 3, 3, 4, 9, 6, 4, 6, 3, 8, 4, 6, 6]}]},
    {n:"Tom Oster",co:"Alemanha",fl:"🇩🇪",p:16,t:263,tp:50,rd:[{g:89,s:[5, 3, 5, 4, 5, 5, 5, 5, 4, 4, 6, 4, 5, 5, 9, 4, 6, 5]},{g:85,s:[5, 3, 6, 5, 4, 6, 5, 4, 5, 5, 6, 4, 4, 4, 6, 3, 5, 5]},{g:89,s:[6, 4, 5, 4, 6, 6, 5, 5, 5, 4, 6, 3, 5, 5, 6, 3, 4, 7]}]},
    {n:"Hugh Dalzell",co:"Irlanda do Norte",fl:"🇬🇧",p:18,t:264,tp:51,rd:[{g:91,s:[7, 5, 4, 5, 6, 4, 4, 3, 4, 5, 8, 4, 7, 6, 8, 3, 4, 4]},{g:88,s:[5, 2, 8, 3, 4, 6, 5, 3, 5, 6, 6, 4, 4, 5, 8, 3, 4, 7]},{g:85,s:[7, 3, 4, 3, 3, 7, 4, 4, 4, 4, 6, 4, 6, 5, 6, 3, 7, 5]}]},
    {n:"Lukas Doherty",co:"Noruega",fl:"🇳🇴",p:19,t:265,tp:52,rd:[{g:88,s:[6, 4, 4, 3, 4, 4, 5, 5, 5, 8, 6, 5, 5, 5, 7, 3, 4, 5]},{g:92,s:[6, 5, 6, 4, 7, 7, 5, 4, 4, 5, 5, 4, 6, 4, 8, 2, 3, 7]},{g:85,s:[4, 3, 5, 4, 4, 6, 4, 4, 3, 6, 6, 3, 8, 3, 8, 4, 5, 5]}]},
    {n:"Kiaan Sharma",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:20,t:266,tp:53,rd:[{g:94,s:[6, 3, 5, 3, 6, 6, 4, 4, 8, 7, 6, 3, 5, 6, 8, 4, 4, 6]},{g:86,s:[6, 4, 5, 4, 4, 6, 5, 5, 5, 4, 6, 3, 4, 5, 6, 3, 6, 5]},{g:86,s:[5, 3, 5, 5, 5, 5, 4, 5, 5, 4, 6, 4, 6, 4, 6, 3, 6, 5]}]},
    {n:"Joe Short",co:"Portugal",fl:"🇵🇹",p:21,t:268,tp:55,rd:[{g:89,s:[6, 4, 5, 4, 5, 6, 3, 3, 5, 4, 7, 3, 7, 6, 5, 5, 4, 7]},{g:91,s:[4, 3, 6, 5, 6, 7, 6, 4, 4, 5, 6, 4, 6, 4, 9, 3, 4, 5]},{g:88,s:[6, 4, 6, 6, 5, 5, 2, 5, 4, 4, 6, 3, 6, 5, 8, 5, 4, 4]}]},
    {n:"Oisin Glynn",co:"Irlanda",fl:"🇮🇪",p:22,t:270,tp:57,rd:[{g:86,s:[5, 3, 5, 4, 5, 5, 5, 3, 4, 6, 7, 4, 5, 5, 6, 5, 4, 5]},{g:92,s:[5, 4, 4, 4, 7, 6, 4, 3, 4, 5, 6, 3, 5, 5, 7, 5, 6, 9]},{g:92,s:[6, 3, 4, 4, 5, 7, 3, 5, 5, 7, 7, 3, 5, 5, 9, 4, 5, 5]}]},
    {n:"Mario Valiente Novella",co:"Espanha",fl:"🇪🇸",p:22,t:270,tp:57,rd:[{g:90,s:[5, 3, 7, 6, 4, 6, 5, 4, 4, 5, 6, 4, 7, 4, 7, 3, 4, 6]},{g:87,s:[6, 3, 5, 3, 5, 6, 5, 3, 5, 5, 6, 4, 3, 4, 7, 6, 6, 5]},{g:93,s:[5, 3, 5, 5, 4, 6, 4, 4, 6, 6, 5, 5, 5, 5, 10, 4, 6, 5]}]},
    {n:"Sé Young",co:"Irlanda",fl:"🇮🇪",p:24,t:273,tp:60,rd:[{g:95,s:[6, 3, 5, 4, 7, 7, 4, 5, 4, 4, 6, 4, 5, 5, 12, 4, 4, 6]},{g:87,s:[5, 3, 5, 4, 6, 4, 4, 4, 4, 5, 5, 4, 5, 5, 7, 4, 6, 7]},{g:91,s:[5, 2, 4, 3, 4, 7, 4, 4, 9, 5, 6, 2, 5, 6, 8, 3, 6, 8]}]},
    {n:"Hanlin Wang",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:25,t:274,tp:61,rd:[{g:99,s:[6, 3, 4, 4, 6, 6, 4, 6, 4, 6, 7, 5, 4, 5, 10, 6, 7, 6]},{g:91,s:[4, 4, 5, 4, 5, 5, 4, 4, 4, 5, 6, 5, 6, 7, 6, 5, 6, 6]},{g:84,s:[5, 3, 3, 3, 6, 6, 4, 4, 5, 5, 4, 3, 5, 7, 9, 2, 4, 6]}]},
    {n:"Roman Hicks",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:26,t:277,tp:64,rd:[{g:99,s:[5, 4, 7, 4, 5, 6, 5, 5, 5, 4, 7, 6, 7, 4, 8, 6, 5, 6]},{g:87,s:[6, 3, 4, 4, 5, 5, 5, 5, 3, 4, 7, 4, 4, 5, 7, 5, 5, 6]},{g:91,s:[5, 3, 8, 4, 6, 5, 6, 4, 4, 6, 6, 3, 5, 5, 6, 4, 5, 6]}]},
    {n:"Raef Diwan",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:27,t:282,tp:69,rd:[{g:86,s:[5, 4, 5, 4, 5, 6, 5, 5, 5, 4, 5, 4, 4, 4, 6, 3, 5, 7]},{g:99,s:[9, 3, 8, 5, 4, 9, 5, 4, 4, 8, 7, 3, 5, 5, 7, 4, 4, 5]},{g:97,s:[6, 5, 4, 4, 4, 5, 4, 4, 8, 9, 5, 4, 6, 4, 9, 5, 6, 5]}]},
    {n:"Christian Boris",co:"Eslováquia",fl:"🏳️",p:"DNS",t:0,tp:0,rd:[]},
    {n:"Hamza Marfleet",co:"Reino Unido",fl:"🇬🇧",p:"DNS",t:0,tp:0,rd:[]},
    {n:"Sean Wilding",co:"Tailândia",fl:"🇹🇭",p:"DNS",t:0,tp:0,rd:[]},
  ]
};

const C25_1011: ContestData = {
  label:"2025 Boys 10-11",par:71,parArr:[5, 3, 4, 3, 4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4],nRounds:3,
  players:[
    {n:"Dmitrii Elchaninov",co:"Federação Russa",fl:"🇷🇺",p:1,t:205,tp:-8,rd:[{g:68,s:[5, 2, 3, 4, 3, 5, 4, 3, 4, 4, 6, 3, 4, 3, 5, 3, 3, 4]},{g:69,s:[5, 3, 5, 3, 4, 5, 3, 3, 4, 4, 4, 3, 4, 3, 5, 3, 4, 4]},{g:68,s:[4, 3, 5, 4, 4, 5, 4, 2, 4, 4, 5, 3, 4, 3, 5, 2, 4, 3]}]},
    {n:"Marcus Karim",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:2,t:218,tp:5,rd:[{g:71,s:[7, 2, 4, 3, 4, 4, 4, 3, 5, 4, 5, 2, 5, 3, 5, 3, 3, 5]},{g:73,s:[4, 3, 4, 2, 4, 4, 4, 3, 4, 9, 6, 3, 3, 4, 5, 3, 3, 5]},{g:74,s:[7, 3, 4, 3, 4, 4, 4, 3, 3, 4, 4, 4, 5, 4, 6, 3, 4, 5]}]},
    {n:"Harrison Barnett",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:3,t:220,tp:7,rd:[{g:72,s:[5, 3, 5, 4, 3, 5, 4, 3, 4, 4, 5, 3, 5, 3, 6, 3, 4, 3]},{g:71,s:[5, 3, 3, 4, 4, 5, 4, 3, 4, 5, 6, 3, 3, 4, 5, 3, 3, 4]},{g:77,s:[5, 3, 4, 3, 4, 5, 3, 3, 4, 5, 6, 4, 7, 4, 5, 4, 3, 5]}]},
    {n:"Julian Sepulveda",co:"Estados Unidos",fl:"🇺🇸",p:4,t:223,tp:10,rd:[{g:73,s:[5, 2, 3, 5, 5, 6, 4, 4, 5, 4, 4, 3, 4, 4, 5, 3, 3, 4]},{g:77,s:[6, 3, 5, 3, 3, 6, 5, 3, 4, 5, 6, 4, 4, 4, 5, 3, 4, 4]},{g:73,s:[5, 4, 4, 4, 3, 4, 4, 3, 4, 3, 5, 3, 6, 4, 5, 3, 5, 4]}]},
    {n:"Mihir Pasura",co:"Reino Unido",fl:"🇬🇧",p:5,t:229,tp:16,rd:[{g:73,s:[6, 3, 4, 4, 4, 5, 4, 2, 4, 5, 5, 3, 4, 5, 5, 3, 3, 4]},{g:74,s:[5, 3, 4, 3, 4, 6, 4, 3, 6, 4, 5, 3, 5, 4, 4, 2, 4, 5]},{g:82,s:[6, 3, 3, 4, 5, 6, 3, 4, 4, 4, 6, 4, 5, 4, 7, 3, 5, 6]}]},
    {n:"Nicolas Pape",co:"Tailândia",fl:"🇹🇭",p:6,t:231,tp:18,rd:[{g:79,s:[7, 2, 4, 4, 3, 4, 4, 3, 4, 5, 5, 3, 5, 4, 8, 3, 5, 6]},{g:77,s:[5, 4, 4, 3, 4, 6, 4, 3, 4, 5, 6, 4, 5, 4, 5, 2, 4, 5]},{g:75,s:[5, 3, 4, 2, 4, 5, 4, 6, 4, 6, 5, 3, 3, 5, 5, 3, 4, 4]}]},
    {n:"Harry-James Odell",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:6,t:231,tp:18,rd:[{g:80,s:[6, 2, 4, 4, 3, 5, 5, 4, 5, 3, 6, 3, 6, 3, 5, 2, 8, 6]},{g:74,s:[6, 4, 6, 3, 4, 5, 3, 3, 5, 6, 5, 2, 3, 3, 5, 3, 4, 4]},{g:77,s:[7, 4, 4, 3, 4, 5, 3, 4, 3, 4, 5, 3, 4, 5, 6, 3, 5, 5]}]},
    {n:"Aronas Juodis",co:"Lituânia",fl:"🇱🇹",p:8,t:232,tp:19,rd:[{g:81,s:[5, 3, 5, 5, 5, 6, 4, 3, 6, 3, 6, 4, 3, 4, 5, 4, 5, 5]},{g:77,s:[5, 3, 4, 4, 4, 5, 4, 3, 5, 5, 4, 3, 4, 5, 6, 3, 4, 6]},{g:74,s:[6, 4, 4, 2, 3, 5, 4, 3, 4, 5, 6, 3, 4, 3, 5, 3, 4, 6]}]},
    {n:"Hugo Luque Reina",co:"Espanha",fl:"🇪🇸",p:9,t:237,tp:24,rd:[{g:82,s:[7, 3, 4, 3, 4, 5, 5, 4, 5, 4, 5, 4, 5, 4, 8, 3, 4, 5]},{g:77,s:[5, 4, 4, 3, 6, 5, 4, 4, 4, 4, 5, 3, 4, 5, 5, 3, 5, 4]},{g:78,s:[6, 2, 4, 3, 5, 6, 4, 3, 4, 7, 5, 4, 5, 3, 5, 3, 4, 5]}]},
    {n:"Maxime Vervaet",co:"Espanha",fl:"🇪🇸",p:10,t:239,tp:26,rd:[{g:79,s:[5, 3, 5, 3, 4, 4, 4, 5, 6, 5, 6, 3, 4, 4, 6, 4, 4, 4]},{g:77,s:[6, 4, 4, 3, 4, 5, 4, 2, 5, 7, 6, 4, 4, 3, 5, 2, 4, 5]},{g:83,s:[6, 4, 6, 4, 4, 7, 4, 3, 4, 5, 5, 5, 5, 5, 4, 3, 4, 5]}]},
    {n:"Henry Atkinson",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:10,t:239,tp:26,rd:[{g:83,s:[7, 3, 4, 3, 5, 5, 5, 3, 5, 4, 5, 4, 5, 4, 6, 4, 5, 6]},{g:79,s:[5, 3, 5, 3, 4, 6, 5, 3, 5, 6, 6, 3, 4, 4, 5, 3, 5, 4]},{g:77,s:[5, 3, 5, 3, 6, 6, 3, 3, 5, 4, 7, 3, 4, 4, 5, 3, 5, 3]}]},
    {n:"Daniel Avila Sanz",co:"Espanha",fl:"🇪🇸",p:12,t:240,tp:27,rd:[{g:83,s:[5, 4, 4, 4, 3, 6, 4, 4, 4, 7, 5, 3, 6, 4, 8, 4, 4, 4]},{g:77,s:[5, 3, 4, 4, 4, 5, 4, 3, 4, 6, 5, 3, 4, 3, 9, 3, 4, 4]},{g:80,s:[5, 3, 4, 3, 4, 5, 4, 4, 3, 6, 5, 3, 5, 4, 8, 4, 4, 6]}]},
    {n:"Álex Carrón",co:"Espanha",fl:"🇪🇸",p:13,t:246,tp:33,rd:[{g:80,s:[6, 3, 5, 3, 5, 5, 4, 3, 4, 4, 5, 4, 5, 4, 6, 4, 4, 6]},{g:84,s:[7, 5, 4, 3, 4, 5, 4, 4, 3, 6, 6, 3, 5, 5, 8, 3, 5, 4]},{g:82,s:[6, 3, 5, 4, 4, 5, 4, 4, 5, 5, 5, 3, 4, 4, 8, 3, 4, 6]}]},
    {n:"Edward Fearnley",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:13,t:246,tp:33,rd:[{g:83,s:[8, 2, 4, 3, 4, 6, 6, 3, 6, 4, 6, 3, 5, 5, 5, 3, 4, 6]},{g:85,s:[6, 4, 5, 3, 4, 5, 5, 4, 4, 5, 6, 4, 4, 5, 7, 3, 5, 6]},{g:78,s:[6, 3, 4, 3, 4, 5, 4, 3, 5, 5, 5, 5, 5, 4, 5, 3, 4, 5]}]},
    {n:"Kirill Sedov",co:"Federação Russa",fl:"🇷🇺",p:15,t:247,tp:34,rd:[{g:81,s:[5, 3, 4, 3, 6, 6, 3, 3, 4, 4, 6, 4, 3, 4, 8, 4, 7, 4]},{g:82,s:[6, 6, 5, 3, 6, 6, 4, 3, 4, 4, 5, 2, 4, 5, 7, 4, 4, 4]},{g:84,s:[6, 3, 5, 3, 8, 5, 3, 4, 4, 7, 8, 3, 4, 4, 5, 3, 5, 4]}]},
    {n:"Diego Gross Paneque",co:"Espanha",fl:"🇪🇸",p:16,t:249,tp:36,rd:[{g:85,s:[7, 3, 5, 5, 6, 7, 4, 3, 5, 4, 6, 5, 5, 5, 4, 4, 4, 3]},{g:84,s:[7, 3, 4, 5, 4, 6, 3, 4, 4, 5, 5, 4, 5, 4, 7, 3, 4, 7]},{g:80,s:[4, 3, 5, 5, 4, 5, 3, 2, 3, 10, 7, 4, 4, 4, 5, 3, 3, 6]}]},
    {n:"Henry Liechti",co:"Suíça",fl:"🇨🇭",p:17,t:250,tp:37,rd:[{g:79,s:[6, 4, 5, 3, 3, 5, 3, 3, 4, 3, 7, 3, 6, 5, 6, 3, 5, 5]},{g:84,s:[8, 4, 5, 4, 5, 5, 4, 4, 4, 5, 5, 3, 5, 4, 6, 3, 5, 5]},{g:87,s:[5, 4, 4, 4, 5, 6, 4, 4, 4, 5, 6, 4, 7, 5, 7, 3, 5, 5]}]},
    {n:"Erik Martel",co:"Espanha",fl:"🇪🇸",p:17,t:250,tp:37,rd:[{g:88,s:[8, 3, 4, 5, 4, 6, 8, 3, 6, 4, 6, 5, 5, 4, 5, 4, 4, 4]},{g:79,s:[4, 3, 5, 2, 4, 5, 5, 4, 4, 7, 6, 3, 5, 3, 7, 3, 4, 5]},{g:83,s:[5, 3, 5, 4, 5, 6, 4, 3, 5, 8, 6, 3, 5, 4, 5, 3, 4, 5]}]},
    {n:"Nicolas De La Torre Montoto",co:"Espanha",fl:"🇪🇸",p:19,t:252,tp:39,rd:[{g:85,s:[5, 3, 6, 4, 6, 6, 4, 4, 5, 4, 5, 4, 4, 5, 6, 4, 5, 5]},{g:83,s:[6, 3, 4, 3, 4, 6, 4, 3, 4, 6, 9, 3, 5, 4, 6, 4, 4, 5]},{g:84,s:[4, 3, 5, 3, 6, 4, 4, 4, 4, 7, 8, 4, 4, 5, 5, 4, 6, 4]}]},
    {n:"Antonio Toledano Ibáñez-Aldecoa",co:"Espanha",fl:"🇪🇸",p:20,t:258,tp:45,rd:[{g:85,s:[5, 3, 5, 3, 6, 6, 6, 3, 6, 4, 7, 3, 6, 5, 6, 3, 4, 4]},{g:91,s:[7, 3, 4, 5, 4, 5, 4, 4, 5, 7, 6, 2, 6, 4, 7, 4, 8, 6]},{g:82,s:[4, 3, 5, 5, 5, 6, 4, 4, 7, 5, 6, 3, 7, 2, 5, 3, 4, 4]}]},
    {n:"Johnny Marriott",co:"Reino Unido",fl:"🇬🇧",p:21,t:260,tp:47,rd:[{g:90,s:[8, 3, 5, 3, 6, 6, 5, 4, 6, 4, 6, 3, 5, 5, 6, 4, 5, 6]},{g:86,s:[5, 3, 5, 3, 4, 6, 6, 5, 6, 5, 6, 3, 4, 4, 8, 3, 3, 7]},{g:84,s:[5, 3, 5, 4, 4, 7, 4, 3, 4, 5, 7, 4, 5, 4, 7, 3, 7, 3]}]},
    {n:"Niko Alvarez Van Der Walt",co:"Espanha",fl:"🇪🇸",p:22,t:261,tp:48,rd:[{g:89,s:[7, 3, 4, 3, 4, 7, 5, 5, 5, 5, 6, 4, 6, 4, 7, 4, 5, 5]},{g:83,s:[6, 3, 4, 4, 5, 8, 5, 3, 4, 4, 6, 3, 5, 4, 6, 3, 5, 5]},{g:89,s:[11, 4, 4, 3, 5, 5, 6, 3, 4, 5, 6, 4, 5, 4, 7, 4, 4, 5]}]},
    {n:"Edward (Bear) Millar",co:"Jersey",fl:"🇯🇪",p:23,t:263,tp:50,rd:[{g:85,s:[5, 4, 5, 4, 5, 7, 4, 4, 4, 5, 5, 4, 4, 5, 8, 3, 4, 5]},{g:93,s:[7, 5, 4, 4, 5, 6, 4, 6, 6, 6, 5, 3, 5, 6, 9, 3, 4, 5]},{g:85,s:[6, 3, 5, 5, 4, 6, 6, 3, 3, 7, 5, 2, 5, 4, 8, 2, 6, 5]}]},
    {n:"Miroslavs Bogdanovs",co:"Espanha",fl:"🇪🇸",p:23,t:263,tp:50,rd:[{g:89,s:[6, 3, 6, 4, 5, 6, 6, 2, 5, 4, 6, 4, 5, 5, 8, 5, 4, 5]},{g:88,s:[6, 3, 4, 4, 5, 5, 5, 5, 8, 6, 5, 2, 4, 7, 7, 4, 4, 4]},{g:86,s:[8, 3, 5, 3, 4, 5, 4, 3, 5, 7, 6, 7, 5, 3, 6, 4, 4, 4]}]},
    {n:"Nial Diwan",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:25,t:264,tp:51,rd:[{g:84,s:[5, 3, 4, 4, 6, 4, 5, 4, 6, 4, 6, 4, 6, 4, 4, 4, 5, 6]},{g:87,s:[5, 3, 5, 3, 5, 6, 4, 3, 5, 5, 6, 5, 5, 6, 6, 4, 4, 7]},{g:93,s:[6, 5, 5, 4, 6, 8, 4, 4, 6, 7, 6, 4, 7, 4, 5, 4, 4, 4]}]},
    {n:"Manuel Medeiros",co:"Portugal",fl:"🇵🇹",p:26,t:265,tp:52,rd:[{g:90,s:[6, 4, 4, 4, 4, 8, 6, 5, 6, 3, 5, 4, 6, 5, 6, 5, 4, 5]},{g:85,s:[6, 4, 5, 3, 7, 5, 4, 4, 4, 7, 5, 4, 5, 5, 5, 2, 5, 5]},{g:90,s:[7, 3, 5, 3, 5, 6, 5, 4, 6, 6, 6, 5, 6, 5, 6, 3, 4, 5]}],isM:true},
    {n:"Harvey Eastwood",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:27,t:268,tp:55,rd:[{g:97,s:[5, 3, 5, 5, 5, 9, 4, 4, 6, 8, 6, 5, 6, 4, 6, 3, 5, 8]},{g:85,s:[5, 3, 5, 5, 4, 7, 4, 3, 5, 7, 5, 4, 5, 3, 6, 3, 5, 6]},{g:86,s:[5, 3, 4, 4, 3, 7, 3, 4, 6, 9, 5, 4, 4, 4, 5, 5, 5, 6]}]},
    {n:"Yorick De Hek",co:"Holanda",fl:"🇳🇱",p:28,t:270,tp:57,rd:[{g:91,s:[5, 3, 6, 5, 4, 5, 4, 4, 6, 6, 6, 5, 6, 4, 9, 4, 4, 5]},{g:87,s:[7, 4, 4, 5, 5, 6, 5, 4, 4, 6, 5, 4, 4, 5, 7, 3, 4, 5]},{g:92,s:[7, 5, 4, 4, 6, 6, 4, 4, 4, 6, 6, 4, 6, 5, 4, 5, 6, 6]}]},
    {n:"Christian Chepishev",co:"Bulgária",fl:"🇧🇬",p:28,t:270,tp:57,rd:[{g:97,s:[6, 3, 6, 5, 5, 8, 4, 4, 5, 6, 6, 6, 6, 6, 7, 4, 4, 6]},{g:86,s:[6, 4, 4, 3, 4, 5, 3, 4, 6, 6, 7, 4, 5, 5, 7, 3, 5, 5]},{g:87,s:[5, 3, 3, 4, 5, 8, 5, 4, 6, 5, 7, 4, 5, 4, 7, 3, 5, 4]}]},
    {n:"Victor Canot Januel",co:"França",fl:"🇫🇷",p:30,t:274,tp:61,rd:[{g:98,s:[6, 3, 6, 4, 5, 6, 6, 4, 5, 6, 6, 5, 6, 5, 9, 3, 6, 7]},{g:88,s:[6, 3, 5, 4, 6, 6, 5, 3, 7, 5, 5, 4, 5, 4, 6, 3, 5, 6]},{g:88,s:[5, 3, 5, 4, 5, 6, 5, 3, 6, 6, 5, 3, 7, 5, 6, 4, 5, 5]}]},
    {n:"Theodore Dausse",co:"França",fl:"🇫🇷",p:31,t:275,tp:62,rd:[{g:89,s:[5, 3, 6, 4, 7, 5, 4, 3, 4, 7, 7, 4, 5, 4, 9, 4, 3, 5]},{g:90,s:[8, 4, 5, 3, 5, 6, 5, 5, 5, 6, 6, 4, 5, 4, 5, 3, 4, 7]},{g:96,s:[5, 3, 8, 4, 5, 13, 5, 3, 4, 8, 7, 4, 5, 4, 6, 3, 4, 5]}]},
    {n:"James Doyle",co:"Irlanda",fl:"🇮🇪",p:32,t:277,tp:64,rd:[{g:92,s:[5, 3, 6, 5, 6, 5, 5, 3, 5, 5, 6, 4, 6, 6, 8, 3, 5, 6]},{g:92,s:[7, 4, 5, 4, 5, 5, 5, 3, 7, 7, 6, 4, 5, 5, 6, 3, 4, 7]},{g:93,s:[6, 3, 6, 4, 5, 6, 6, 4, 3, 8, 6, 4, 6, 4, 6, 5, 5, 6]}]},
    {n:"Alexis Beringer",co:"Suíça",fl:"🇨🇭",p:33,t:290,tp:77,rd:[{g:103,s:[7, 4, 6, 4, 5, 8, 6, 5, 4, 6, 7, 4, 7, 6, 6, 6, 5, 7]},{g:94,s:[7, 3, 5, 3, 6, 6, 5, 5, 4, 5, 7, 3, 6, 8, 6, 4, 6, 5]},{g:93,s:[8, 4, 6, 4, 6, 7, 5, 4, 3, 6, 6, 4, 6, 4, 6, 4, 5, 5]}]},
    {n:"Kevin Canton",co:"Itália",fl:"🇮🇹",p:34,t:291,tp:78,rd:[{g:97,s:[6, 5, 5, 3, 9, 5, 8, 2, 6, 6, 8, 5, 4, 4, 8, 3, 5, 5]},{g:96,s:[8, 3, 6, 3, 9, 5, 6, 5, 4, 6, 7, 4, 6, 5, 5, 4, 5, 5]},{g:98,s:[9, 3, 4, 5, 7, 5, 4, 2, 6, 5, 8, 3, 6, 5, 9, 5, 5, 7]}]},
    {n:"Jamie Murray",co:"Suécia",fl:"🇸🇪",p:35,t:299,tp:86,rd:[{g:91,s:[8, 3, 6, 3, 5, 6, 5, 4, 4, 4, 7, 2, 5, 7, 9, 3, 5, 5]},{g:99,s:[8, 4, 5, 4, 5, 5, 5, 5, 5, 6, 7, 7, 5, 5, 9, 5, 4, 5]},{g:109,s:[9, 3, 8, 5, 7, 8, 4, 4, 4, 8, 6, 4, 8, 7, 8, 4, 5, 7]}]},
    {n:"Borja Enriquez Sainz de la Flor",co:"Espanha",fl:"🇪🇸",p:"WD",t:194,tp:52,rd:[{g:97,s:[5, 4, 6, 4, 5, 6, 4, 8, 4, 8, 5, 2, 6, 5, 8, 3, 6, 8]},{g:97,s:[8, 6, 5, 4, 5, 6, 4, 4, 6, 9, 5, 4, 6, 5, 7, 4, 4, 5]}]},
    {n:"Lewis Ikeji Dandyson",co:"Nigéria",fl:"🇳🇬",p:"DNS",t:0,tp:0,rd:[]},
    {n:"Jean Imperiali de Francavilla",co:"França",fl:"🇫🇷",p:"DNS",t:0,tp:0,rd:[]},
    {n:"Leon Schneitter",co:"Suíça",fl:"🇨🇭",p:"DNS",t:0,tp:0,rd:[]},
    {n:"Skyy Wilding",co:"Tailândia",fl:"🇹🇭",p:"DNS",t:0,tp:0,rd:[]},
  ]
};

const C26_1011: ContestData = {
  label:"2026 Boys 10-11",par:72,parArr:[5, 3, 4, 3, 4, 5, 4, 3, 4, 5, 5, 3, 4, 4, 5, 3, 4, 4],nRounds:3,
  players:[
    {n:"Dmitrii Elchaninov",co:"Federação Russa",fl:"🇷🇺",p:1,t:210,tp:-6,rd:[{g:69,s:[]},{g:69,s:[5, 3, 5, 4, 3, 5, 4, 3, 3, 4, 4, 3, 5, 4, 5, 2, 3, 4]},{g:72,s:[6, 3, 4, 3, 3, 5, 5, 2, 4, 5, 5, 2, 4, 4, 5, 3, 4, 5]}]},
    {n:"William Harran",co:"Suíça",fl:"🇨🇭",p:2,t:221,tp:5,rd:[{g:75,s:[]},{g:71,s:[5, 3, 4, 4, 3, 6, 3, 3, 4, 4, 5, 3, 4, 3, 7, 3, 3, 4]},{g:75,s:[4, 3, 4, 3, 5, 4, 4, 4, 4, 5, 6, 2, 5, 4, 5, 3, 5, 5]}]},
    {n:"Sean Wilding",co:"Tailândia",fl:"🇹🇭",p:3,t:224,tp:8,rd:[{g:71,s:[]},{g:74,s:[5, 4, 5, 3, 4, 6, 4, 3, 4, 5, 5, 3, 4, 3, 5, 2, 5, 4]},{g:79,s:[6, 4, 5, 3, 3, 5, 5, 2, 4, 5, 5, 4, 6, 4, 6, 3, 5, 4]}]},
    {n:"Weilian Sun",co:"China",fl:"🇨🇳",p:4,t:225,tp:9,rd:[{g:77,s:[]},{g:73,s:[5, 3, 4, 2, 4, 6, 3, 3, 4, 5, 4, 3, 4, 4, 6, 3, 6, 4]},{g:75,s:[8, 3, 3, 4, 4, 4, 5, 2, 4, 5, 5, 3, 4, 3, 7, 3, 3, 5]}]},
    {n:"Philippe Xiao",co:"França",fl:"🇫🇷",p:5,t:227,tp:11,rd:[{g:74,s:[]},{g:73,s:[6, 4, 4, 3, 3, 5, 3, 3, 4, 5, 6, 2, 4, 4, 5, 4, 4, 4]},{g:80,s:[6, 4, 4, 3, 5, 6, 5, 2, 4, 5, 5, 4, 5, 6, 6, 2, 4, 4]}]},
    {n:"Hugo Strasser",co:"Suíça",fl:"🇨🇭",p:6,t:228,tp:12,rd:[{g:73,s:[]},{g:73,s:[6, 3, 4, 3, 4, 4, 4, 3, 6, 5, 5, 3, 5, 3, 4, 3, 4, 4]},{g:82,s:[5, 3, 3, 4, 5, 6, 3, 3, 5, 5, 6, 4, 6, 4, 7, 3, 5, 5]}]},
    {n:"Christian Chepishev",co:"Bulgária",fl:"🇧🇬",p:7,t:230,tp:14,rd:[{g:75,s:[]},{g:76,s:[6, 3, 5, 3, 4, 5, 3, 4, 4, 5, 6, 2, 4, 5, 5, 3, 4, 5]},{g:79,s:[5, 4, 4, 3, 4, 5, 6, 4, 3, 6, 5, 3, 5, 6, 5, 3, 4, 4]}]},
    {n:"Henry Bucys",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:8,t:231,tp:15,rd:[{g:79,s:[]},{g:76,s:[5, 3, 4, 3, 4, 5, 4, 3, 4, 4, 5, 3, 5, 4, 6, 4, 4, 6]},{g:76,s:[4, 3, 4, 3, 3, 4, 4, 4, 4, 6, 5, 5, 5, 4, 6, 4, 4, 4]}]},
    {n:"Manuel Francisco Medeiros",co:"Portugal",fl:"🇵🇹",p:9,t:232,tp:16,rd:[{g:79,s:[]},{g:78,s:[5, 3, 4, 4, 3, 5, 5, 4, 4, 6, 5, 4, 4, 4, 7, 3, 4, 4]},{g:75,s:[5, 3, 3, 3, 4, 7, 3, 3, 4, 4, 6, 3, 5, 4, 6, 4, 4, 4]}],isM:true},
    {n:"Diego Gross Paneque",co:"Espanha",fl:"🇪🇸",p:9,t:232,tp:16,rd:[{g:76,s:[]},{g:75,s:[7, 3, 4, 3, 4, 5, 4, 3, 4, 5, 6, 3, 5, 4, 6, 2, 3, 4]},{g:81,s:[5, 3, 5, 5, 5, 4, 5, 4, 5, 5, 5, 4, 4, 4, 5, 3, 5, 5]}]},
    {n:"Leon Schneitter",co:"Suíça",fl:"🇨🇭",p:11,t:236,tp:20,rd:[{g:76,s:[]},{g:80,s:[8, 4, 4, 5, 4, 4, 4, 2, 4, 6, 5, 4, 6, 4, 5, 3, 4, 4]},{g:80,s:[5, 4, 5, 3, 4, 5, 5, 4, 5, 4, 5, 4, 5, 4, 8, 2, 3, 5]}]},
    {n:"Álex Carrón",co:"Espanha",fl:"🇪🇸",p:12,t:241,tp:25,rd:[{g:76,s:[]},{g:82,s:[6, 3, 5, 4, 5, 5, 4, 2, 5, 4, 5, 3, 5, 4, 7, 2, 5, 8]},{g:83,s:[5, 3, 4, 3, 4, 6, 4, 4, 4, 7, 7, 4, 5, 4, 6, 3, 5, 5]}]},
    {n:"Benji Botham",co:"Irlanda do Norte",fl:"🇬🇧",p:13,t:244,tp:28,rd:[{g:81,s:[]},{g:80,s:[6, 3, 4, 4, 4, 5, 5, 3, 6, 4, 5, 3, 5, 4, 7, 3, 5, 4]},{g:83,s:[6, 3, 4, 4, 5, 5, 4, 3, 7, 5, 6, 4, 5, 4, 6, 3, 5, 4]}]},
    {n:"Dylan Dedaj Ungureanu",co:"Espanha",fl:"🇪🇸",p:14,t:245,tp:29,rd:[{g:84,s:[]},{g:81,s:[6, 2, 5, 4, 4, 5, 5, 3, 6, 5, 5, 3, 5, 5, 6, 3, 5, 4]},{g:80,s:[5, 3, 4, 2, 4, 6, 5, 3, 4, 5, 7, 3, 4, 5, 7, 4, 5, 4]}]},
    {n:"Oscar Bunt",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:14,t:245,tp:29,rd:[{g:82,s:[]},{g:80,s:[5, 3, 5, 4, 5, 5, 3, 3, 4, 4, 5, 5, 6, 4, 5, 4, 5, 5]},{g:83,s:[5, 5, 4, 3, 4, 8, 4, 4, 3, 4, 5, 5, 4, 5, 6, 4, 5, 5]}]},
    {n:"Myles Jones",co:"Gales",fl:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",p:14,t:245,tp:29,rd:[{g:79,s:[]},{g:88,s:[5, 3, 4, 3, 4, 5, 4, 3, 5, 6, 6, 3, 7, 6, 8, 4, 6, 6]},{g:78,s:[5, 4, 4, 4, 4, 6, 5, 3, 4, 4, 6, 3, 4, 4, 5, 3, 5, 5]}]},
    {n:"Alexis Beringer",co:"Suíça",fl:"🇨🇭",p:17,t:246,tp:30,rd:[{g:83,s:[]},{g:82,s:[7, 3, 4, 4, 4, 5, 3, 3, 5, 8, 6, 4, 4, 3, 7, 3, 5, 4]},{g:81,s:[4, 5, 5, 4, 4, 5, 7, 4, 3, 5, 5, 3, 5, 4, 5, 3, 5, 5]}]},
    {n:"Hermes Stuart Cañizares Plaja",co:"Espanha",fl:"🇪🇸",p:18,t:248,tp:32,rd:[{g:77,s:[]},{g:83,s:[5, 5, 5, 3, 4, 5, 4, 3, 5, 8, 8, 3, 4, 4, 6, 3, 4, 4]},{g:88,s:[5, 4, 5, 2, 5, 5, 4, 4, 8, 4, 6, 3, 10, 3, 7, 3, 5, 5]}]},
    {n:"Niko Alvarez Van Der Walt",co:"Espanha",fl:"🇪🇸",p:19,t:249,tp:33,rd:[{g:81,s:[]},{g:86,s:[5, 7, 5, 3, 3, 6, 3, 3, 3, 4, 5, 4, 5, 4, 9, 3, 5, 9]},{g:82,s:[5, 3, 6, 3, 3, 5, 4, 4, 4, 6, 7, 4, 5, 4, 5, 3, 6, 5]}]},
    {n:"Buster Airey",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:20,t:252,tp:36,rd:[{g:79,s:[]},{g:85,s:[7, 4, 5, 5, 4, 5, 4, 4, 5, 6, 5, 3, 6, 5, 5, 4, 4, 4]},{g:88,s:[7, 3, 5, 3, 5, 5, 5, 4, 4, 8, 5, 4, 6, 4, 6, 4, 5, 5]}]},
    {n:"Miroslavs Bogdanovs",co:"Espanha",fl:"🇪🇸",p:20,t:252,tp:36,rd:[{g:78,s:[]},{g:86,s:[4, 4, 4, 3, 4, 5, 3, 3, 11, 6, 5, 4, 6, 5, 6, 3, 4, 6]},{g:88,s:[6, 5, 4, 4, 4, 5, 4, 3, 4, 6, 7, 4, 6, 4, 8, 4, 5, 5]}]},
    {n:"Elijah Gibbons",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:22,t:253,tp:37,rd:[{g:83,s:[]},{g:83,s:[7, 4, 4, 4, 4, 7, 4, 4, 4, 5, 6, 4, 3, 4, 6, 3, 4, 6]},{g:87,s:[6, 4, 4, 3, 5, 6, 3, 4, 4, 9, 5, 4, 6, 3, 7, 5, 4, 5]}]},
    {n:"Henry Liechti",co:"Suíça",fl:"🇨🇭",p:23,t:255,tp:39,rd:[{g:79,s:[]},{g:87,s:[6, 4, 5, 3, 5, 5, 5, 3, 4, 5, 5, 4, 4, 5, 10, 4, 5, 5]},{g:89,s:[7, 6, 5, 4, 4, 6, 4, 4, 4, 7, 5, 4, 4, 5, 7, 3, 6, 4]}]},
    {n:"Kai Russell",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:24,t:256,tp:40,rd:[{g:81,s:[]},{g:83,s:[7, 4, 5, 3, 4, 5, 4, 6, 5, 6, 6, 4, 4, 4, 6, 2, 5, 3]},{g:92,s:[6, 4, 5, 6, 4, 5, 3, 4, 4, 11, 5, 3, 5, 5, 9, 3, 6, 4]}]},
    {n:"Aineon Hiram Jabonero",co:"Filipinas",fl:"🇵🇭",p:25,t:257,tp:41,rd:[{g:88,s:[]},{g:87,s:[6, 4, 5, 4, 5, 6, 4, 2, 5, 6, 5, 4, 6, 4, 6, 4, 5, 6]},{g:82,s:[5, 6, 5, 4, 3, 6, 5, 4, 4, 4, 5, 4, 4, 4, 5, 4, 5, 5]}]},
    {n:"Lukas Doherty",co:"Noruega",fl:"🇳🇴",p:26,t:258,tp:42,rd:[{g:89,s:[]},{g:85,s:[9, 5, 5, 3, 4, 4, 5, 3, 4, 5, 5, 3, 4, 4, 7, 4, 5, 6]},{g:84,s:[6, 4, 5, 3, 4, 5, 5, 3, 4, 5, 6, 4, 5, 4, 7, 3, 6, 5]}]},
    {n:"Elias Didjurgis",co:"Alemanha",fl:"🇩🇪",p:27,t:259,tp:43,rd:[{g:84,s:[]},{g:89,s:[5, 3, 5, 4, 4, 5, 4, 4, 5, 5, 6, 5, 6, 4, 9, 4, 5, 6]},{g:86,s:[7, 5, 4, 3, 4, 6, 6, 2, 6, 5, 6, 3, 5, 4, 7, 3, 5, 5]}]},
    {n:"Joe Short",co:"Portugal",fl:"🇵🇹",p:28,t:266,tp:50,rd:[{g:93,s:[]},{g:83,s:[6, 3, 3, 3, 6, 7, 3, 4, 6, 6, 4, 5, 5, 4, 7, 2, 3, 6]},{g:90,s:[6, 4, 6, 3, 3, 8, 6, 4, 3, 5, 6, 3, 5, 5, 6, 7, 4, 6]}]},
    {n:"Rodrigo Palacios bauer",co:"Espanha",fl:"🇪🇸",p:29,t:267,tp:51,rd:[{g:82,s:[]},{g:93,s:[5, 3, 5, 4, 4, 6, 5, 3, 7, 10, 6, 4, 5, 5, 7, 4, 5, 5]},{g:92,s:[6, 4, 4, 5, 4, 6, 7, 4, 3, 5, 10, 3, 6, 4, 8, 2, 5, 6]}]},
    {n:"Kevin Canton",co:"Itália",fl:"🇮🇹",p:30,t:273,tp:57,rd:[{g:85,s:[]},{g:88,s:[6, 3, 5, 3, 4, 6, 4, 4, 6, 6, 5, 6, 5, 4, 7, 3, 4, 7]},{g:100,s:[4, 3, 8, 4, 5, 6, 7, 2, 4, 7, 6, 4, 6, 5, 8, 5, 9, 7]}]},
    {n:"James Doyle",co:"Irlanda",fl:"🇮🇪",p:31,t:276,tp:60,rd:[{g:91,s:[]},{g:87,s:[5, 4, 4, 4, 4, 7, 5, 3, 5, 5, 7, 4, 6, 5, 6, 3, 5, 5]},{g:98,s:[8, 8, 6, 3, 4, 7, 4, 3, 5, 3, 9, 6, 3, 5, 8, 6, 6, 4]}]},
    {n:"Joseph Robinson",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:32,t:277,tp:61,rd:[{g:85,s:[]},{g:93,s:[8, 3, 5, 2, 6, 5, 4, 6, 5, 9, 5, 4, 5, 6, 6, 4, 5, 5]},{g:99,s:[8, 6, 4, 4, 4, 8, 7, 3, 5, 5, 6, 4, 6, 4, 4, 4, 12, 5]}]},
    {n:"Arthur Lamblin",co:"França",fl:"🇫🇷",p:33,t:279,tp:63,rd:[{g:89,s:[]},{g:98,s:[6, 4, 4, 4, 4, 6, 5, 6, 6, 6, 6, 4, 6, 5, 10, 6, 5, 5]},{g:92,s:[8, 4, 5, 4, 4, 8, 4, 3, 5, 6, 6, 3, 5, 5, 6, 3, 6, 7]}]},
    {n:"Zeyn Lababedi",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:34,t:280,tp:64,rd:[{g:95,s:[]},{g:94,s:[7, 3, 5, 4, 5, 6, 5, 5, 6, 6, 6, 3, 5, 5, 8, 4, 5, 6]},{g:91,s:[8, 5, 5, 3, 4, 6, 5, 3, 4, 6, 7, 4, 5, 5, 9, 3, 4, 5]}]},
    {n:"Maddox Tiemann",co:"Suécia",fl:"🇸🇪",p:"WD",t:176,tp:32,rd:[{g:89,s:[7, 4, 4, 4, 7, 6, 4, 3, 4, 5, 5, 5, 4, 5, 8, 4, 4, 6]},{g:87,s:[5, 3, 6, 3, 4, 6, 5, 3, 4, 7, 5, 3, 6, 4, 7, 3, 5, 8]}]},
    {n:"Aron Klinkenberg",co:"Holanda",fl:"🇳🇱",p:"WD",t:179,tp:35,rd:[{g:91,s:[5, 3, 5, 4, 8, 5, 4, 3, 6, 6, 6, 3, 5, 6, 7, 4, 5, 6]},{g:88,s:[7, 5, 5, 5, 4, 6, 4, 4, 4, 6, 4, 5, 5, 5, 7, 5, 4, 3]}]},
    {n:"Isaac Cawrey",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:"DNS",t:0,tp:0,rd:[]},
    {n:"Travis Reaves",co:"Estados Unidos",fl:"🇺🇸",p:"DNS",t:0,tp:0,rd:[]},
  ]
};

const C26_1213: ContestData = {
  label:"2026 Boys 12-13",par:73,parArr:[4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 4, 5, 5, 3, 4, 5, 3, 4],nRounds:3,
  players:[
    {n:"Marcus Latt",co:"Estônia",fl:"🇪🇪",p:1,t:211,tp:-8,rd:[{g:69,s:[4, 3, 2, 4, 4, 4, 6, 3, 4, 3, 3, 5, 4, 3, 5, 4, 3, 5]},{g:71,s:[4, 5, 3, 4, 4, 4, 5, 3, 5, 3, 3, 5, 4, 4, 4, 5, 3, 3]},{g:71,s:[4, 4, 2, 5, 4, 3, 5, 3, 4, 3, 7, 4, 4, 3, 5, 5, 3, 3]}]},
    {n:"Freddie Buck",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:2,t:214,tp:-5,rd:[{g:71,s:[4, 5, 3, 5, 4, 4, 5, 2, 4, 3, 4, 5, 6, 3, 4, 4, 2, 4]},{g:72,s:[4, 5, 5, 3, 3, 4, 5, 3, 5, 3, 4, 5, 4, 3, 5, 4, 3, 4]},{g:71,s:[6, 4, 4, 5, 4, 3, 4, 3, 4, 3, 4, 4, 4, 3, 4, 5, 3, 4]}]},
    {n:"Harry Wang",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:2,t:214,tp:-5,rd:[{g:70,s:[4, 5, 3, 4, 3, 4, 5, 3, 4, 4, 4, 5, 4, 2, 4, 5, 4, 3]},{g:73,s:[5, 5, 3, 5, 5, 4, 6, 2, 4, 3, 4, 4, 4, 4, 4, 5, 3, 3]},{g:71,s:[5, 4, 4, 3, 5, 4, 4, 3, 4, 3, 5, 4, 4, 3, 4, 5, 3, 4]}]},
    {n:"Skyy Wilding",co:"Tailândia",fl:"🇹🇭",p:4,t:216,tp:-3,rd:[{g:70,s:[4, 4, 3, 3, 3, 4, 4, 3, 4, 3, 5, 5, 4, 3, 3, 6, 4, 5]},{g:73,s:[6, 6, 3, 5, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 4, 2, 4]},{g:73,s:[4, 5, 3, 4, 4, 3, 5, 3, 4, 4, 5, 5, 4, 3, 4, 6, 3, 4]}]},
    {n:"Leo Taylor",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:4,t:216,tp:-3,rd:[{g:72,s:[5, 5, 3, 5, 4, 4, 5, 2, 4, 3, 4, 5, 5, 3, 4, 5, 3, 3]},{g:72,s:[6, 5, 3, 5, 4, 3, 4, 3, 5, 4, 4, 4, 4, 2, 4, 5, 3, 4]},{g:72,s:[4, 5, 4, 4, 3, 4, 5, 3, 4, 3, 5, 5, 3, 3, 3, 5, 3, 6]}]},
    {n:"Matyáš Jirásek",co:"República Checa",fl:"🇨🇿",p:6,t:220,tp:1,rd:[{g:71,s:[4, 5, 2, 4, 4, 4, 4, 4, 4, 4, 3, 4, 5, 3, 4, 7, 3, 3]},{g:76,s:[7, 6, 3, 4, 4, 4, 6, 3, 4, 4, 4, 4, 4, 3, 5, 5, 4, 2]},{g:73,s:[4, 5, 3, 4, 4, 4, 4, 3, 5, 4, 4, 4, 6, 3, 4, 5, 3, 4]}]},
    {n:"Marcus Karim",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:7,t:225,tp:6,rd:[{g:75,s:[6, 6, 3, 4, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 3, 4, 5, 4]},{g:78,s:[6, 5, 4, 5, 4, 4, 4, 3, 3, 4, 4, 5, 6, 3, 5, 5, 3, 5]},{g:72,s:[5, 6, 3, 3, 3, 4, 5, 3, 3, 3, 4, 6, 5, 3, 4, 4, 4, 4]}]},
    {n:"Emile Cuanalo",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:7,t:225,tp:6,rd:[{g:79,s:[5, 7, 4, 4, 4, 5, 4, 4, 4, 4, 4, 4, 5, 3, 6, 4, 4, 4]},{g:74,s:[3, 6, 3, 6, 4, 4, 5, 3, 3, 4, 4, 5, 5, 3, 3, 5, 4, 4]},{g:72,s:[5, 5, 3, 5, 4, 4, 4, 4, 4, 4, 3, 5, 4, 3, 3, 5, 3, 4]}]},
    {n:"Maxime Vervaet",co:"Espanha",fl:"🇪🇸",p:9,t:230,tp:11,rd:[{g:76,s:[5, 4, 3, 4, 4, 4, 5, 3, 4, 3, 5, 5, 4, 3, 6, 5, 4, 5]},{g:78,s:[6, 4, 3, 5, 5, 6, 5, 3, 4, 4, 5, 4, 4, 3, 6, 4, 3, 4]},{g:76,s:[5, 3, 4, 5, 4, 6, 4, 3, 4, 4, 5, 4, 4, 3, 5, 5, 4, 4]}]},
    {n:"Jake Notton",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:9,t:230,tp:11,rd:[{g:78,s:[5, 5, 3, 5, 5, 4, 4, 5, 5, 3, 5, 5, 4, 3, 4, 5, 3, 5]},{g:80,s:[4, 6, 3, 5, 5, 4, 5, 3, 6, 3, 5, 3, 4, 3, 7, 6, 4, 4]},{g:72,s:[5, 4, 2, 4, 5, 4, 5, 3, 6, 3, 4, 4, 4, 3, 5, 4, 3, 4]}]},
    {n:"Karol Gil",co:"Polônia",fl:"🇵🇱",p:11,t:232,tp:13,rd:[{g:72,s:[4, 5, 3, 5, 4, 4, 4, 4, 4, 4, 3, 5, 4, 3, 3, 4, 3, 6]},{g:75,s:[4, 5, 3, 4, 4, 4, 6, 4, 4, 3, 4, 4, 5, 4, 5, 5, 3, 4]},{g:85,s:[4, 6, 4, 4, 3, 5, 4, 3, 6, 7, 8, 4, 4, 3, 6, 4, 5, 5]}]},
    {n:"Harry Mody",co:"Escócia",fl:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",p:11,t:232,tp:13,rd:[{g:74,s:[4, 5, 3, 3, 4, 4, 5, 4, 5, 3, 4, 5, 4, 2, 4, 7, 3, 5]},{g:78,s:[4, 4, 3, 6, 4, 4, 5, 4, 6, 5, 4, 4, 5, 3, 4, 6, 3, 4]},{g:80,s:[5, 5, 4, 4, 5, 4, 5, 3, 4, 4, 4, 5, 6, 5, 4, 5, 4, 4]}]},
    {n:"Memphis Greenwood",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:11,t:232,tp:13,rd:[{g:75,s:[5, 4, 3, 5, 5, 4, 4, 3, 3, 5, 4, 6, 4, 3, 3, 6, 3, 5]},{g:79,s:[5, 4, 3, 4, 3, 4, 4, 3, 5, 6, 4, 5, 5, 3, 6, 6, 3, 6]},{g:78,s:[5, 5, 4, 4, 4, 5, 5, 3, 4, 6, 4, 5, 4, 3, 5, 5, 3, 4]}]},
    {n:"Harrison Jones",co:"Gales",fl:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",p:14,t:233,tp:14,rd:[{g:79,s:[5, 5, 3, 6, 4, 4, 5, 5, 4, 4, 4, 4, 4, 4, 4, 5, 5, 4]},{g:80,s:[5, 5, 4, 5, 4, 6, 5, 3, 4, 5, 4, 6, 5, 3, 4, 5, 3, 4]},{g:74,s:[4, 5, 3, 5, 4, 4, 5, 3, 5, 5, 3, 5, 3, 3, 4, 5, 3, 5]}]},
    {n:"Luc Taylor",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:15,t:234,tp:15,rd:[{g:76,s:[5, 5, 4, 4, 4, 4, 4, 3, 4, 3, 4, 5, 5, 3, 5, 6, 4, 4]},{g:80,s:[5, 5, 3, 4, 4, 4, 5, 4, 4, 6, 4, 5, 5, 3, 6, 6, 3, 4]},{g:78,s:[4, 5, 3, 5, 5, 3, 6, 6, 4, 3, 4, 5, 5, 4, 3, 4, 3, 6]}]},
    {n:"Kirill Sedov",co:"Federação Russa",fl:"🇷🇺",p:15,t:234,tp:15,rd:[{g:78,s:[5, 5, 2, 4, 5, 3, 5, 4, 5, 6, 3, 7, 5, 3, 3, 5, 4, 4]},{g:77,s:[4, 5, 2, 5, 5, 4, 5, 2, 4, 3, 6, 5, 5, 3, 4, 6, 4, 5]},{g:79,s:[5, 4, 3, 5, 5, 5, 5, 3, 5, 4, 3, 5, 7, 3, 4, 5, 4, 4]}]},
    {n:"Kostadin Kaloyanov",co:"Bulgária",fl:"🇧🇬",p:15,t:234,tp:15,rd:[{g:79,s:[4, 7, 4, 5, 5, 4, 4, 4, 4, 4, 6, 4, 3, 3, 4, 6, 4, 4]},{g:80,s:[6, 4, 4, 4, 4, 4, 7, 2, 4, 4, 5, 5, 4, 4, 4, 7, 3, 5]},{g:75,s:[5, 4, 3, 4, 4, 4, 5, 3, 5, 4, 4, 5, 4, 4, 4, 5, 4, 4]}]},
    {n:"Seb Toft",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:18,t:236,tp:17,rd:[{g:80,s:[5, 4, 3, 4, 4, 6, 4, 3, 5, 5, 4, 5, 6, 6, 4, 5, 3, 4]},{g:78,s:[5, 5, 3, 4, 6, 4, 5, 4, 4, 4, 4, 5, 4, 4, 3, 6, 4, 4]},{g:78,s:[4, 5, 3, 4, 3, 4, 5, 3, 4, 6, 4, 5, 4, 3, 6, 6, 4, 5]}]},
    {n:"Harrison Barnett",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:19,t:237,tp:18,rd:[{g:77,s:[4, 5, 3, 5, 7, 3, 7, 3, 5, 3, 4, 5, 3, 3, 6, 4, 3, 4]},{g:83,s:[7, 5, 3, 5, 4, 4, 7, 3, 4, 5, 6, 4, 4, 2, 5, 6, 5, 4]},{g:77,s:[5, 6, 3, 4, 4, 3, 5, 3, 5, 3, 5, 6, 4, 4, 5, 6, 3, 3]}]},
    {n:"Daniel Avila Sanz",co:"Espanha",fl:"🇪🇸",p:20,t:239,tp:20,rd:[{g:75,s:[6, 4, 3, 5, 6, 3, 5, 3, 5, 3, 4, 4, 5, 3, 4, 5, 4, 3]},{g:87,s:[5, 5, 3, 5, 4, 8, 5, 3, 5, 6, 3, 5, 4, 3, 4, 8, 6, 5]},{g:77,s:[6, 5, 3, 5, 4, 4, 5, 3, 5, 3, 4, 5, 5, 3, 5, 4, 4, 4]}]},
    {n:"Hugo Luque Reina",co:"Espanha",fl:"🇪🇸",p:20,t:239,tp:20,rd:[{g:77,s:[4, 6, 3, 5, 5, 5, 5, 3, 5, 4, 4, 4, 5, 3, 5, 4, 3, 4]},{g:81,s:[5, 5, 3, 5, 4, 4, 5, 3, 4, 4, 4, 5, 5, 3, 6, 7, 4, 5]},{g:81,s:[4, 4, 4, 5, 5, 5, 5, 3, 4, 5, 4, 6, 5, 3, 5, 5, 3, 6]}]},
    {n:"Jack Hollingsworth",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:22,t:240,tp:21,rd:[{g:81,s:[5, 4, 3, 4, 5, 4, 6, 5, 5, 3, 5, 5, 5, 3, 6, 5, 4, 4]},{g:82,s:[6, 5, 4, 4, 4, 4, 6, 4, 5, 4, 4, 6, 4, 4, 4, 5, 3, 6]},{g:77,s:[5, 4, 4, 5, 4, 4, 5, 3, 4, 4, 5, 5, 3, 2, 5, 7, 4, 4]}]},
    {n:"David Filip",co:"República Checa",fl:"🇨🇿",p:23,t:244,tp:25,rd:[{g:75,s:[5, 5, 4, 5, 3, 4, 4, 3, 5, 4, 5, 6, 4, 2, 4, 5, 3, 4]},{g:86,s:[6, 5, 4, 4, 5, 4, 5, 2, 5, 4, 4, 7, 6, 6, 5, 5, 5, 4]},{g:83,s:[4, 5, 3, 4, 4, 5, 6, 3, 5, 4, 9, 6, 5, 3, 3, 5, 4, 5]}]},
    {n:"Aronas Juodis",co:"Lituânia",fl:"🇱🇹",p:24,t:245,tp:26,rd:[{g:82,s:[6, 7, 2, 5, 5, 4, 6, 3, 5, 4, 6, 5, 4, 3, 5, 5, 3, 4]},{g:87,s:[6, 5, 3, 5, 5, 5, 5, 4, 5, 4, 5, 5, 6, 3, 5, 4, 5, 7]},{g:76,s:[4, 5, 3, 5, 4, 3, 5, 3, 5, 4, 6, 5, 5, 3, 4, 5, 3, 4]}]},
    {n:"Kris Kuusk",co:"Estônia",fl:"🇪🇪",p:25,t:246,tp:27,rd:[{g:83,s:[6, 5, 4, 5, 5, 4, 5, 3, 4, 5, 6, 5, 4, 3, 5, 5, 4, 5]},{g:83,s:[4, 5, 4, 4, 4, 4, 6, 4, 5, 5, 5, 5, 5, 4, 5, 7, 3, 4]},{g:80,s:[4, 4, 3, 4, 4, 5, 8, 3, 4, 4, 5, 5, 6, 4, 4, 6, 3, 4]}]},
    {n:"Jack Austin",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:26,t:249,tp:30,rd:[{g:80,s:[5, 5, 3, 5, 4, 6, 4, 3, 5, 4, 5, 5, 4, 3, 6, 5, 4, 4]},{g:81,s:[6, 5, 3, 5, 4, 4, 6, 3, 5, 4, 5, 5, 5, 2, 4, 7, 3, 5]},{g:88,s:[7, 5, 3, 5, 5, 5, 6, 7, 5, 4, 5, 5, 5, 3, 5, 5, 3, 5]}]},
    {n:"Beau Wheeler",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:26,t:249,tp:30,rd:[{g:80,s:[6, 6, 2, 6, 5, 4, 5, 5, 4, 4, 6, 4, 5, 3, 4, 4, 3, 4]},{g:83,s:[5, 5, 3, 6, 5, 4, 5, 4, 5, 5, 4, 6, 4, 2, 6, 7, 3, 4]},{g:86,s:[6, 5, 3, 4, 5, 5, 5, 6, 5, 4, 4, 5, 5, 4, 5, 6, 4, 5]}]},
    {n:"Alfie Skinner",co:"Gales",fl:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",p:28,t:250,tp:31,rd:[{g:85,s:[5, 6, 2, 5, 5, 5, 5, 3, 7, 6, 5, 4, 4, 5, 4, 5, 4, 5]},{g:81,s:[5, 6, 2, 5, 5, 5, 6, 3, 4, 4, 5, 4, 5, 3, 6, 6, 3, 4]},{g:84,s:[4, 6, 3, 5, 4, 5, 7, 3, 5, 4, 4, 4, 6, 4, 6, 5, 5, 4]}]},
    {n:"Rafael Devic Frugier",co:"França",fl:"🇫🇷",p:29,t:256,tp:37,rd:[{g:83,s:[4, 4, 4, 5, 5, 5, 6, 4, 7, 4, 4, 4, 4, 3, 5, 7, 4, 4]},{g:84,s:[5, 4, 4, 4, 4, 5, 5, 4, 4, 5, 6, 7, 5, 4, 4, 6, 2, 6]},{g:89,s:[7, 5, 4, 4, 6, 4, 6, 3, 7, 4, 9, 4, 4, 4, 4, 6, 4, 4]}]},
    {n:"Francisco Carvalho",co:"Portugal",fl:"🇵🇹",p:29,t:256,tp:37,rd:[{g:83,s:[4, 7, 2, 5, 5, 5, 4, 5, 4, 4, 4, 5, 5, 5, 5, 6, 4, 4]},{g:91,s:[6, 6, 3, 5, 4, 5, 6, 3, 7, 4, 6, 6, 6, 3, 5, 7, 4, 5]},{g:82,s:[5, 6, 3, 6, 5, 5, 5, 2, 6, 4, 5, 5, 5, 3, 5, 5, 3, 4]}]},
    {n:"George Wilson",co:"Inglaterra",fl:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",p:31,t:261,tp:42,rd:[{g:88,s:[6, 5, 3, 7, 5, 4, 7, 3, 6, 4, 5, 4, 5, 3, 5, 6, 4, 6]},{g:92,s:[6, 6, 4, 5, 5, 4, 7, 3, 5, 3, 5, 7, 5, 4, 6, 6, 4, 7]},{g:81,s:[3, 4, 5, 4, 5, 6, 5, 4, 6, 3, 5, 5, 5, 4, 5, 3, 4, 5]}]},
    {n:"Dylan Williams",co:"Gales",fl:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",p:32,t:264,tp:45,rd:[{g:83,s:[6, 5, 4, 4, 4, 9, 6, 3, 6, 5, 4, 4, 4, 3, 3, 5, 4, 4]},{g:94,s:[7, 5, 4, 5, 5, 8, 7, 4, 5, 5, 5, 7, 6, 4, 4, 4, 3, 6]},{g:87,s:[6, 4, 3, 7, 4, 6, 6, 3, 6, 5, 4, 5, 6, 3, 5, 6, 3, 5]}]},
    {n:"Alejandro Gomez Morillo",co:"Colômbia",fl:"🇨🇴",p:33,t:276,tp:57,rd:[{g:95,s:[6, 5, 4, 5, 5, 5, 6, 4, 6, 5, 5, 5, 6, 3, 6, 7, 4, 8]},{g:91,s:[4, 6, 2, 6, 6, 6, 7, 6, 3, 5, 4, 5, 5, 4, 7, 6, 4, 5]},{g:90,s:[8, 6, 3, 6, 3, 5, 6, 5, 7, 4, 5, 4, 5, 3, 5, 6, 3, 6]}]},
    {n:"Fredrik Sonsteby",co:"Noruega",fl:"🇳🇴",p:34,t:290,tp:71,rd:[{g:98,s:[6, 6, 6, 6, 6, 5, 6, 5, 6, 4, 5, 6, 5, 3, 5, 6, 5, 7]},{g:93,s:[8, 6, 3, 5, 6, 5, 6, 4, 6, 5, 5, 4, 5, 4, 7, 6, 3, 5]},{g:99,s:[7, 7, 3, 5, 5, 5, 6, 7, 7, 4, 6, 7, 5, 3, 5, 7, 5, 5]}]},
    {n:"William Ottesen Wang",co:"Noruega",fl:"🇳🇴",p:35,t:294,tp:75,rd:[{g:100,s:[6, 8, 3, 4, 5, 6, 8, 3, 4, 8, 4, 6, 6, 4, 7, 10, 3, 5]},{g:97,s:[7, 8, 5, 6, 5, 8, 6, 4, 4, 4, 5, 7, 7, 3, 4, 5, 4, 5]},{g:97,s:[6, 6, 4, 5, 5, 4, 6, 5, 9, 6, 7, 5, 6, 5, 5, 5, 4, 4]}]},
    {n:"César Goossens",co:"Suíça",fl:"🇨🇭",p:36,t:320,tp:101,rd:[{g:106,s:[8, 6, 6, 6, 6, 4, 8, 5, 6, 4, 4, 9, 6, 5, 4, 8, 4, 7]},{g:103,s:[6, 7, 3, 8, 7, 7, 5, 3, 6, 6, 6, 6, 6, 3, 5, 6, 5, 8]},{g:111,s:[8, 12, 3, 10, 7, 4, 7, 5, 5, 5, 6, 6, 7, 4, 6, 6, 5, 5]}]},
    {n:"Johnny Marriott",co:"Reino Unido",fl:"🇬🇧",p:"DNS",t:0,tp:0,rd:[]},
    {n:"Erik Martel",co:"Espanha",fl:"🇪🇸",p:"DNS",t:0,tp:0,rd:[]},
    {n:"Daniel Parizek",co:"República Checa",fl:"🇨🇿",p:"DNS",t:0,tp:0,rd:[]},
  ]
};

const ALL_CONTESTS: ContestData[] = [C25_89, C25_1011, C26_1011, C26_1213];
const CONTEST_KEYS = ["25_89","25_1011","26_1011","26_1213"] as const;
type ContestKey = typeof CONTEST_KEYS[number];
const CONTEST_MAP: Record<ContestKey, ContestData> = {"25_89":C25_89,"25_1011":C25_1011,"26_1011":C26_1011,"26_1213":C26_1213};
const CONTEST_LABELS: Record<ContestKey, string> = {"25_89":"2025 Boys 8-9","25_1011":"2025 Boys 10-11","26_1011":"2026 Boys 10-11","26_1213":"2026 Boys 12-13"};



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
  {id:"wjgc26",name:"WJGC 2026",short:"WJGC26",date:"Fev 2026",rounds:3,par:72,field:36,nations:19,url:"https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/73/leaderboard.htm"},
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
  {n:"Manuel Medeiros",co:"Portugal",isM:true,r:{brjgt25:{p:26,t:265,tp:52,rd:[90,85,90]},eowagr25:{p:7,t:238,tp:22,rd:[85,77,76]},venice25:{p:28,t:237,tp:21,rd:[78,76,83]},rome25:{p:10,t:166,tp:22,rd:[89,77]},doral25:{p:29,t:177,tp:35,rd:[98,79]},qdl25:{p:11,t:90,tp:18,rd:[90]},gg26:{p:4,t:169,tp:25,rd:[87,82]},wjgc26:{p:9,t:232,tp:16,rd:[79,78,75]}},up:["marco26"]},
  {n:"Dmitrii Elchaninov",co:"Russian Federation",r:{brjgt25:{p:1,t:205,tp:-8,rd:[69,68,68]},eowagr25:{p:2,t:218,tp:2,rd:[77,70,71]},venice25:{p:1,t:198,tp:-18,rd:[62,68,68]},qdl25:{p:1,t:71,tp:-1,rd:[71]},wjgc26:{p:1,t:210,tp:-6,rd:[69,69,72]}},up:[]},
  {n:"Diego Gross Paneque",co:"Spain",r:{brjgt25:{p:16,t:249,tp:36,rd:[80,84,85]},wjgc26:{p:9,t:232,tp:16,rd:[76,75,81]}},up:[]},
  {n:"Álex Carrón",co:"Spain",r:{brjgt25:{p:13,t:246,tp:33,rd:[82,84,80]},wjgc26:{p:12,t:241,tp:25,rd:[76,82,83]}},up:[]},
  {n:"Henry Liechti",co:"Switzerland",r:{brjgt25:{p:17,t:250,tp:37,rd:[87,84,79]},wjgc26:{p:23,t:255,tp:39,rd:[79,87,89]}},up:[]},
  {n:"Niko Alvarez Van Der Walt",co:"Spain",r:{brjgt25:{p:22,t:261,tp:48,rd:[89,83,89]},wjgc26:{p:19,t:249,tp:33,rd:[81,86,82]}},up:[]},
  {n:"Miroslavs Bogdanovs",co:"Spain",r:{brjgt25:{p:24,t:263,tp:50,rd:[86,88,89]},venice25:{p:18,t:227,tp:11,rd:[76,74,77]},wjgc26:{p:20,t:252,tp:36,rd:[78,86,88]}},up:[]},
  {n:"Christian Chepishev",co:"Bulgaria",r:{brjgt25:{p:29,t:270,tp:57,rd:[87,86,97]},wjgc26:{p:7,t:230,tp:14,rd:[75,76,79]}},up:["marco26"]},
  {n:"James Doyle",co:"Ireland",r:{brjgt25:{p:32,t:277,tp:64,rd:[93,92,92]},wjgc26:{p:31,t:276,tp:60,rd:[91,87,98]}},up:[]},
  {n:"Alexis Beringer",co:"Switzerland",r:{brjgt25:{p:33,t:290,tp:77,rd:[93,94,103]},wjgc26:{p:17,t:246,tp:30,rd:[83,82,81]}},up:[]},
  {n:"Kevin Canton",co:"Italy",r:{brjgt25:{p:34,t:291,tp:78,rd:[98,96,97]},wjgc26:{p:30,t:273,tp:57,rd:[85,88,100]}},up:[]},
  {n:"Leon Schneitter",co:"Switzerland",r:{brjgt25:{p:"WD",t:null,tp:null,rd:[]},wjgc26:{p:11,t:236,tp:20,rd:[76,80,80]}},up:[]},
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
  {n:"Hugo Strasser",co:"Switzerland",r:{wjgc26:{p:6,t:228,tp:12,rd:[73,73,82]}},up:["marco26"]},
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
  {n:"Maddox Tiemann",co:"Sweden",r:{wjgc26:{p:"WD",t:176,tp:32,rd:[89,87]}},up:[]},
  {n:"William Harran",co:"Switzerland",r:{wjgc26:{p:2,t:221,tp:5,rd:[75,71,75]}},up:[]},
  {n:"Louis Harran",co:"Switzerland",r:{},up:[]},
  {n:"Pietro Salvati",co:"Italy",r:{},up:[]},
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

/* ═══════════════════════════════════
   FieldPlayerDetail — scorecard view for BJGT field players
   ═══════════════════════════════════ */
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
  const [tab, setTab] = useState<ContestKey>("26_1011");
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
      <div className="toolbar"><div className="toolbar-left"><span className="toolbar-title">🇪🇸 BJGT</span></div></div>
      <div className="master-detail"><div className="course-detail empty-state-lg">
        <LoadingState size="lg" icon="🏌️" message="A carregar dados…" />
      </div></div>
    </div>
  );
  if (error) return (
    <div className="tourn-layout">
      <div className="toolbar"><div className="toolbar-left"><span className="toolbar-title">🇪🇸 BJGT</span></div></div>
      <div className="master-detail"><div className="course-detail">
        <div className="card empty-state"><div className="empty-icon">⚠️</div><div className="fw-700-dc">Erro: {error}</div></div>
      </div></div>
    </div>
  );
  if (!A || "err" in A) {
    const info = A as { err?: string; courses?: string[]; nRounds?: number; nCards?: number; hsKeys?: string[] };
    return (
      <div className="tourn-layout">
        <div className="toolbar"><div className="toolbar-left"><span className="toolbar-title">🇪🇸 BJGT</span></div></div>
        <div className="master-detail"><div className="course-detail">
          <div className="card empty-state">
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

  const { filteredBands: _fb, filteredN: _fn } = filteredBandsResult;

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
          <span className="toolbar-title">🇪🇸 BJGT</span>
          <span className="toolbar-meta">📍 {TOURN.location}</span>
          <span className="toolbar-meta">📅 {TOURN.dates}</span>
          <span className="toolbar-meta">🏷️ {PLAYER_NAME} · Sub-12</span>
          <div className="toolbar-sep" />
          <div className="escalao-pills">
            {CONTEST_KEYS.map(k => (
              <button key={k} onClick={() => setTab(k)}
                className={`tourn-tab tourn-tab-sm${tab === k ? " active" : ""}`}>
                {CONTEST_LABELS[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-right">
          <span className="chip">{(() => { const c = CONTEST_MAP[tab]; return `${c.players.filter(p=>typeof p.p==="number").length} field · ${c.nRounds}R · Par ${c.par}`; })()}</span>
        </div>
      </div>

      {/* ── Master-detail ── */}
      <div className="master-detail">
        {/* Sidebar: Contest players */}
        <div className={`sidebar${sidebarOpen ? "" : " sidebar-closed"}`}>
          <div className="sidebar-section-title">
            {CONTEST_LABELS[tab]}
          </div>
          {CONTEST_MAP[tab].players.filter(p => p.rd.length > 0).map((p, idx) => (
            <div key={idx} className="course-item" style={{padding:"4px 8px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid var(--border-subtle)", background: p.isM ? "var(--bg-success-subtle)" : undefined}}>
              <div className="course-item-name">
                <span style={{ minWidth: 22, color: typeof p.p === "number" && p.p <= 3 ? "var(--color-warn-dark)" : "var(--text-3)", fontWeight: 800, fontSize: 11 }}>{typeof p.p === "number" ? `${p.p}.` : ""}</span>
                {p.fl} {firstName(p.n)}
              </div>
              <div className="course-item-meta" style={{fontVariantNumeric:"tabular-nums"}}>
                {p.t} ({fmtToPar(p.tp)})
              </div>
            </div>
          ))}
        </div>

        {/* Detail: content */}
        <div className="course-detail">

      {/* ═══ PLAYER DETAIL (from sidebar click) ═══ */}
      {selectedPlayer && (
        <FieldPlayerDetail playerName={selectedPlayer} onBack={() => setSelectedPlayer(null)} />
      )}

      {/* ═══ CONTEST LEADERBOARD (all 4 tabs) ═══ */}
      {!selectedPlayer && (
        <ContestLeaderboard
          contest={CONTEST_MAP[tab]}
          evo={tab === "26_1011" ? EVOLUTION.filter(e => e.to === "10-11") : tab === "26_1213" ? EVOLUTION.filter(e => e.to === "12-13") : undefined}
        />
      )}


      {!selectedPlayer && (
        <div className="ta-c" style={{ margin: "20px 0" }}>
          <Link to={`/jogadores/${fed}`} className="p p-filter active" style={{ textDecoration: "none", padding: "8px 20px", fontSize: 13, height: "auto" }}>
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

function ContestLeaderboard({ contest, evo }: { contest: ContestData; evo?: EvoEntry[] }) {
  const [roundTab, setRoundTab] = useState<number>(0); // 0=accumulated, 1,2,3=rounds
  const par = contest.parArr;
  const parF = par.slice(0,9).reduce((a,b)=>a+b,0);
  const parB = par.slice(9).reduce((a,b)=>a+b,0);
  const parT = contest.par;
  const players = contest.players.filter(p => p.rd.length > 0);
  const nR = contest.nRounds;
  const fieldAvg = players.length > 0 ? (players.filter(p=>p.rd.length===nR).reduce((s,p)=>s+p.t,0) / players.filter(p=>p.rd.length===nR).length) : 0;
  const leader = players[0];
  const manuel = players.find(p => p.isM);

  // For round-specific view, sort by that round's gross
  const sortedForRound = roundTab > 0
    ? [...players].filter(p => p.rd[roundTab-1]).sort((a,b) => (a.rd[roundTab-1]?.g ?? 999) - (b.rd[roundTab-1]?.g ?? 999))
    : players;

  const hasScores = (ri: number) => players.some(p => p.rd[ri]?.s?.length > 0);

  return (
    <>
      {/* Sub-tabs: Accumulated + per-round */}
      <div className="escalao-pills mb-8" style={{gap:4}}>
        <button onClick={() => setRoundTab(0)} className={`tourn-tab tourn-tab-sm${roundTab === 0 ? " active" : ""}`}>Acumulado</button>
        {Array.from({length: nR}, (_, i) => (
          <button key={i+1} onClick={() => setRoundTab(i+1)} className={`tourn-tab tourn-tab-sm${roundTab === i+1 ? " active" : ""}`}>R{i+1}</button>
        ))}
      </div>

      {/* Meta */}
      <div className="muted fs-10 mb-8">
        {players.filter(p=>p.rd.length===nR).length} jogadores · {nR} rondas · Par {parT}
        {roundTab === 0 && <> · Média: {fieldAvg.toFixed(1)} ({fmtToPar(Math.round(fieldAvg - parT * nR))}) · Líder: {leader?.n} ({leader?.t})</>}
      </div>

      {/* ── ACCUMULATED VIEW ── */}
      {roundTab === 0 && (
        <div className="card">
          <div className="h-md fs-14">🏆 Leaderboard — {contest.label}</div>
          <div className="tourn-scroll">
            <table className="dtable-lg">
              <thead><tr>
                <th className="col-w30">#</th>
                <th style={{textAlign:"left",minWidth:120}}>Jogador</th>
                {Array.from({length: nR}, (_, i) => <th key={i} className="r col-w40">R{i+1}</th>)}
                <th className="r col-w50 fw-700">Tot</th>
                <th className="r col-w40">±Par</th>
              </tr></thead>
              <tbody>
                {sortedForRound.map((p, idx) => {
                  const isM = p.isM;
                  const isWD = typeof p.p !== "number";
                  const prevP = idx > 0 ? sortedForRound[idx-1].p : null;
                  const showPos = p.p !== prevP;
                  return (
                    <tr key={idx} style={{background: isM ? "var(--bg-success-subtle)" : undefined, opacity: isWD ? 0.5 : 1}}>
                      <td className="fw-800" style={{color: typeof p.p === "number" && p.p <= 3 ? "var(--color-warn-dark)" : "var(--text-3)"}}>
                        {showPos ? (isWD ? "WD" : p.p) : ""}
                      </td>
                      <td style={{whiteSpace:"nowrap"}}>
                        {p.fl} <span className={isM ? "fw-800" : "fw-600"}>{p.n}</span>
                      </td>
                      {Array.from({length: nR}, (_, i) => (
                        <td key={i} className="r tourn-mono">{p.rd[i]?.g ?? "–"}</td>
                      ))}
                      <td className="r fw-800 tourn-mono">{p.t}</td>
                      <td className="r fw-700" style={{color: p.tp < 0 ? "var(--good-dark)" : p.tp === 0 ? "var(--text-1)" : "var(--text-3)"}}>
                        {isWD ? "–" : fmtToPar(p.tp)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PER-ROUND SCORECARD VIEW ── */}
      {roundTab > 0 && (
        <div className="card">
          <div className="h-md fs-14">📋 Round {roundTab} — Scorecards</div>
          {!hasScores(roundTab - 1) ? (
            <div className="muted fs-12" style={{padding:16}}>Scores buraco a buraco não disponíveis para esta ronda (apenas totais).</div>
          ) : (
            <div className="bjgt-chart-scroll">
              <table className="sc-table-modern" data-sc-table="1">
                <thead>
                  <tr>
                    <th className="hole-header" style={{textAlign:"center",width:30}}>Pos</th>
                    <th className="hole-header" style={{textAlign:"left",paddingLeft:8,minWidth:50}}>Jogador</th>
                    <th className="hole-header col-total" style={{width:32}}>Tot</th>
                    <th className="hole-header" style={{width:32}}>±Par</th>
                    {par.slice(0,9).map((_,i) => <th key={i} className="hole-header">{i+1}</th>)}
                    <th className="hole-header col-out">OUT</th>
                    {par.slice(9).map((_,i) => <th key={i} className="hole-header">{i+10}</th>)}
                    <th className="hole-header col-in">IN</th>
                  </tr>
                  <tr className="meta-row">
                    <td colSpan={2} className="row-label c-muted fs-10">Par</td>
                    <td className="col-total">{parT}</td>
                    <td></td>
                    {par.slice(0,9).map((p,i)=><td key={i}>{p}</td>)}
                    <td className="col-out fw-600">{parF}</td>
                    {par.slice(9).map((p,i)=><td key={i}>{p}</td>)}
                    <td className="col-in fw-600">{parB}</td>
                  </tr>
                </thead>
                <tbody>
                  {sortedForRound.filter(p => p.rd[roundTab-1]?.s?.length > 0).map((p, idx) => {
                    const rd = p.rd[roundTab-1];
                    const s = rd.s;
                    const f9 = s.slice(0,9).reduce((a: number,b: number)=>a+b,0);
                    const b9 = s.slice(9).reduce((a: number,b: number)=>a+b,0);
                    const tp = rd.g - parT;
                    const isM = p.isM;
                    return (
                      <tr key={idx} style={{background: isM ? "var(--bg-success-subtle)" : undefined}}>
                        <td className="fw-700 ta-c" style={{color: idx < 3 ? "var(--color-warn-dark)" : "var(--text-3)"}}>{idx+1}</td>
                        <td className="row-label fw-700" style={{whiteSpace:"nowrap"}}>{p.fl} {p.n}</td>
                        <td className="col-total">{rd.g}</td>
                        <td className="fw-700" style={{color: tp < 0 ? "var(--good-dark)" : tp === 0 ? "var(--text-1)" : "var(--text-3)"}}>
                          {fmtToPar(tp)}
                        </td>
                        {s.slice(0,9).map((sc: number, i: number) => (
                          <td key={i}><span className={`sc-score ${scClass(sc, par[i])}`}>{sc}</span></td>
                        ))}
                        <td className="col-out fw-600">{f9}</td>
                        {s.slice(9).map((sc: number, i: number) => (
                          <td key={i}><span className={`sc-score ${scClass(sc, par[9+i])}`}>{sc}</span></td>
                        ))}
                        <td className="col-in fw-600">{b9}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Manuel highlight (if in this contest) ── */}
      {manuel && evo && evo.length > 0 && roundTab === 0 && (() => {
        const mEvo = evo.find(e => e.n.includes("Manuel"));
        if (!mEvo) return null;
        return (
          <div className="card" style={{background:"var(--bg-success-subtle)", border:"1px solid var(--good)"}}>
            <div className="h-md fs-14">🇵🇹 Manuel — Evolução WJGC</div>
            <div className="d-flex" style={{gap:16,flexWrap:"wrap",alignItems:"center"}}>
              <div style={{textAlign:"center",flex:"1 1 100px"}}>
                <div className="muted fs-10">2025</div>
                <div className="fw-900" style={{fontSize:24}}>{mEvo.y25}</div>
                <div className="muted fs-10">{mEvo.from}</div>
              </div>
              <div style={{fontSize:24,color:"var(--good-dark)"}}>→</div>
              <div style={{textAlign:"center",flex:"1 1 100px"}}>
                <div className="muted fs-10">2026</div>
                <div className="fw-900" style={{fontSize:24, color: mEvo.delta < 0 ? "var(--good-dark)" : "var(--text-3)"}}>{mEvo.y26}</div>
                <div className="muted fs-10">{mEvo.to}</div>
              </div>
              <div style={{textAlign:"center",flex:"1 1 80px"}}>
                <div className="muted fs-10">Δ</div>
                <div className="fw-900" style={{fontSize:24, color: mEvo.delta < 0 ? "var(--good-dark)" : SC.danger}}>{mEvo.delta > 0 ? "+" : ""}{mEvo.delta}</div>
                <div className="muted fs-10">pancadas</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Cross-year evolution table ── */}
      {evo && evo.length > 0 && roundTab === 0 && (
        <div className="card">
          <div className="h-md fs-14">📈 Evolução 2025 → 2026</div>
          <div className="muted fs-10 mb-8">{evo.length} jogadores em ambas as edições</div>
          <div className="tourn-scroll">
            <table className="dtable-lg">
              <thead><tr>
                <th style={{textAlign:"left",minWidth:120}}>Jogador</th>
                <th className="r col-w55">2025</th>
                <th className="r col-w55">2026</th>
                <th className="r col-w45">Δ</th>
                <th className="col-w70">Percurso</th>
              </tr></thead>
              <tbody>
                {evo.map((e, idx) => {
                  const isM = e.n.includes("Manuel");
                  return (
                    <tr key={idx} style={{background: isM ? "var(--bg-success-subtle)" : undefined}}>
                      <td className={isM ? "fw-800" : "fw-600"} style={{whiteSpace:"nowrap"}}>{e.n}</td>
                      <td className="r tourn-mono">{e.y25}</td>
                      <td className="r tourn-mono">{e.y26}</td>
                      <td className="r fw-700" style={{color: e.delta < 0 ? "var(--good-dark)" : e.delta > 0 ? SC.danger : "var(--text-3)"}}>
                        {e.delta > 0 ? "+" : ""}{e.delta}
                      </td>
                      <td>
                        {e.pill === "UP"
                          ? <span style={{background:"#dbeafe",color:"#1e40af",fontSize:9,padding:"1px 5px",borderRadius:6,fontWeight:700}}>⬆ {e.from}→{e.to}</span>
                          : <span style={{background:"#fef3c7",color:"#92400e",fontSize:9,padding:"1px 5px",borderRadius:6,fontWeight:700}}>= {e.from}</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
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
