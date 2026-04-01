/**
 * RivaisIntlPage.tsx — Rivais Internacionais
 *
 * Dashboard comparativo de todos os rivais do Manuel
 * em torneios internacionais.
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { fmtToPar, fmtSign, MONTHS_PT } from "../utils/format";
import { FL } from "../utils/flagUtils";
import { zTier, getTrend, getAvgZ } from "../utils/mathUtils";
import { scClass, toParClass, sc3m, SC, tpColorDark } from "../utils/scoreDisplay";
import { isCalUnlocked } from "../utils/authConstants";
import PasswordGate from "../ui/PasswordGate";
import SidebarToggle from "../ui/SidebarToggle";
import { useMasterDetail } from "../hooks/useMasterDetail";
import EmptyState from "../ui/EmptyState";
import { buildAutoRivals, normName, getScorecards, uskTournNames, uskFieldSizes } from "./KIDSdataLoader";
import { FIELD_2025, VP_PAR, VP_SI, VP_M, VP_WJGC26_PAR, VP_WJGC26_SI, VP_WJGC26_M, VP_ALFERINI_PAR, VP_ALFERINI_SI, VP_ALFERINI_M, LT_FORET_PAR, LT_FORET_SI, LT_FORET_M, VENICE_M, MS_USKIDS_M_B1011, MS_USKIDS_M_B12, DORAL_GP_M_B1011, DORAL_SF_M_B1213, TIER, FIELD_CARDS } from "../data/rivalData";


/* ═══════════════════════════════════
   TYPES
   ═══════════════════════════════════ */
interface TournResult { p: number | "WD"; t: number | null; tp: number | null; rd: (number | null)[] }
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

/** Round average entry */
type RoundAvg = { m: number; s: number } | null;

/* ── Member History (USKids) types ── */
interface MHTournRound { gross: number }
interface MHTournament {
  name: string; ageGroup: string; place: number;
  totalStrokes: number; rounds: Record<string, MHTournRound>;
  par?: number[]; startDate?: string;
}
interface MHPlayer { memberId: string; name: string; torneios: Record<string, MHTournament & { tid?: string }> }
interface MHData { jogadores: Record<string, MHPlayer> }

/* ═══════════════════════════════════
   CONFIG
   ═══════════════════════════════════ */


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



// Extended tournament names/display for auto-loaded tournaments
// Metadados completos para auto tids que substituem entradas manuais (field, nations, par, url)
const AUTO_TOURN_META: Record<string, { field: number; nations: number; par: number; url?: string }> = {
  // WJGC 2025
  wjgc25_b89:    { field: 37, nations: 15, par: 71, url: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/34/leaderboard.htm" },
  wjgc25_b1011:  { field: 40, nations: 17, par: 71, url: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/34/leaderboard.htm" },
  wjgc25_b1213:  { field: 38, nations: 16, par: 71, url: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/34/leaderboard.htm" },
  // WJGC 2026 B12-13 (auto tid)
  wjgc26_b1213:  { field: 39, nations: 17, par: 73, url: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/33/leaderboard.htm" },
  // Marco Simone 2026
  marco26_b9:    { field: 17, nations: 8,  par: 72, url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516989/marco-simone-invitational-2026/results" },
  marco26_b10:   { field: 17, nations: 8,  par: 72, url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516989/marco-simone-invitational-2026/results" },
  marco26_b11:   { field: 17, nations: 8,  par: 72, url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516989/marco-simone-invitational-2026/results" },
  marco26_b12:   { field: 17, nations: 8,  par: 72, url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516989/marco-simone-invitational-2026/results" },
  // Doral 2025
  doral25_b89:   { field: 30, nations: 12, par: 71, url: "https://www.golfgenius.com/v2tournaments/4222407?called_from=widgets%2Fcustomized_tournament_results&hide_totals=false&player_stats_for_portal=true" },
  doral25_b1011: { field: 35, nations: 13, par: 71, url: "https://www.golfgenius.com/v2tournaments/4222407?called_from=widgets%2Fcustomized_tournament_results&hide_totals=false&player_stats_for_portal=true" },
  doral25_b1213: { field: 32, nations: 11, par: 71, url: "https://www.golfgenius.com/v2tournaments/4222407?called_from=widgets%2Fcustomized_tournament_results&hide_totals=false&player_stats_for_portal=true" },
  // Venice 2025
  venice25_b9:   { field: 35, nations: 14, par: 72, url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/515206/venice-open-2025/results" },
  venice25_b10:  { field: 38, nations: 15, par: 72, url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/515206/venice-open-2025/results" },
  venice25_b11:  { field: 39, nations: 16, par: 72, url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/515206/venice-open-2025/results" },
  venice25_b12:  { field: 36, nations: 14, par: 72, url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/515206/venice-open-2025/results" },
  // Rome 2025
  rome25_b9:     { field: 12, nations: 5,  par: 72, url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516026/rome-classic-2025/results" },
  rome25_b10:    { field: 14, nations: 6,  par: 72, url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516026/rome-classic-2025/results" },
  rome25_b11:    { field: 14, nations: 6,  par: 72, url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516026/rome-classic-2025/results" },
  rome25_b12:    { field: 12, nations: 5,  par: 72, url: "https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516026/rome-classic-2025/results" },
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
  marco25_b9:     { name: "Marco Simone Inv.",   short: "Marco25",  date: "Mar 2025" },
  marco25_b10:    { name: "Marco Simone Inv.",   short: "Marco25",  date: "Mar 2025" },
  marco25_b11:    { name: "Marco Simone Inv.",   short: "Marco25",  date: "Mar 2025" },
  marco25_b12:    { name: "Marco Simone Inv.",   short: "Marco25",  date: "Mar 2025" },
  marco26_b9:     { name: "Marco Simone Inv. 2026", short: "Marco26", date: "Mar 2026" },
  marco26_b10:    { name: "Marco Simone Inv. 2026", short: "Marco26", date: "Mar 2026" },
  marco26_b11:    { name: "Marco Simone Inv. 2026", short: "Marco26", date: "Mar 2026" },
  marco26_b12:    { name: "Marco Simone Inv. 2026", short: "Marco26", date: "Mar 2026" },
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
  // Doral 2024
  doral24_b89:    { name: "Doral Junior 2024",  short: "Doral24",  date: "Dez 2024" },
  doral24_b1011:  { name: "Doral Junior 2024",  short: "Doral24",  date: "Dez 2024" },
  doral24_b1213:  { name: "Doral Junior 2024",  short: "Doral24",  date: "Dez 2024" },
  // Greatgolf
  gg25:           { name: "Greatgolf Open 2025", short: "GG25",    date: "Fev 2025" },
  gg26_u14:       { name: "Greatgolf U14 2026",  short: "GG U14",  date: "Fev 2026" },
  gg26_open:      { name: "Greatgolf Open 2026", short: "GG Open", date: "Fev 2026" },
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

/** Format age string for an EXACT DOB — includes countdown to next birthday */
function fmtAge(dob: Date): string {
  const today = new Date();
  const a = ageAt(dob, today);
  const nextBday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
  if (nextBday <= today) nextBday.setFullYear(nextBday.getFullYear() + 1);
  const diffMs = nextBday.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / 86400000);
  const diffMonths = Math.round(diffDays / 30.5);
  if (diffDays <= 60) return `${a} anos · faz ${a+1} em ${diffDays}d`;
  if (diffMonths <= 3) return `${a} anos · faz ${a+1} em ~${diffMonths}m`;
  return `${a} anos`;
}

/** Format age string for an ESTIMATED DOB (midpoint) — no countdown */
function fmtAgeEstimated(dob: Date): string {
  return `~${ageAt(dob, new Date())} anos`;
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
  marco26_b9:    { dateExact: "2026-03-13", ageMin: 9,  ageMax: 9  },
  marco26_b10:   { dateExact: "2026-03-13", ageMin: 10, ageMax: 10 },
  marco26_b11:   { dateExact: "2026-03-13", ageMin: 11, ageMax: 11 },
  marco26_b12:   { dateExact: "2026-03-13", ageMin: 12, ageMax: 12 },
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
  // Doral 2024
  doral24_b89:   { dateExact: "2024-12-19", ageMin: 8,  ageMax: 9  },
  doral24_b1011: { dateExact: "2024-12-19", ageMin: 10, ageMax: 11 },
  doral24_b1213: { dateExact: "2024-12-19", ageMin: 12, ageMax: 13 },
  // Greatgolf
  gg25:          { dateExact: "2025-02-08", ageMax: 12 },
  gg26_u14:      { dateExact: "2026-02-08", ageMin: 13, ageMax: 14 },
  gg26_open:     { dateExact: "2026-02-08" },
};

/** Parse "Boys 11" / "Boys 10-11" / "Boys 10 & 11" → exact age or null */
function parseExactAge(agStr: string): number | null {
  if (!agStr) return null;
  // "Boys 11" — single age, no range
  const single = agStr.match(/[Bb]oys\s+(\d+)$/);
  if (single) return Number(single[1]);
  // "Boys 10" with trailing spaces / punctuation
  const clean = agStr.match(/[Bb]oys\s+(\d+)\s*$/);
  if (clean) return Number(clean[1]);
  return null; // range like "Boys 10-11" or "Boys 10 & 11" → can't pin exact age
}

interface DobConstraint {
  dateExact: string;   // tournament date
  ageMin: number;      // minimum age bracket
  ageMax: number;      // maximum age bracket (same as min when exact)
  tid: string;
}

function computeDobInfo(p: RivalPlayer, mhPlayer?: MHPlayer | null): DobInfo {
  // If exact DOB known
  if (p.dob) {
    const d = parseDob(p.dob);
    return { exact: true, dob: d, dobStr: p.dob, rangeStr: p.dob, ageStr: fmtAge(d) };
  }

  // ── Step 1: collect constraints from p.r tournaments ──────────────────────
  const constraints: DobConstraint[] = [];
  const hidden = hiddenTids(p); // skip dedup'd tids to avoid contradictory constraints

  for (const [tid, res] of Object.entries(p.r)) {
    if (hidden.has(tid)) continue; // skip duplicates that could create contradictions
    let td: { dateExact?: string; ageMin?: number; ageMax?: number } | undefined = T_MAP[tid];

    // USKids completo tids "usk{tcode}_b{n}" → dateExact from name map, age from suffix
    if (!td) {
      const m = tid.match(/^(usk\d+)_b(\d+)$/);
      if (m) {
        const base = uskTournNames.get(m[1]);
        const age = Number(m[2]);
        if (base) td = { dateExact: base.dateExact, ageMin: age, ageMax: age };
      }
    }
    if (!td?.dateExact) continue;

    let ageMin = td.ageMin ?? null;
    let ageMax = td.ageMax ?? null;

    // Refine using the actual ageGroup string stored on this result
    const agStr = (res as any).ageGroup as string | undefined;
    if (agStr) {
      const exact = parseExactAge(agStr);
      if (exact != null) {
        ageMin = (ageMin == null) ? exact : Math.max(ageMin, exact);
        ageMax = (ageMax == null) ? exact : Math.min(ageMax, exact);
      }
    }

    if (ageMin == null || ageMax == null) continue;
    constraints.push({ dateExact: td.dateExact, ageMin, ageMax, tid });
  }

  // ── Step 1b: member history — precise single-age USKids data points ────────
  // Each entry gives an exact age on a specific date → very tight constraint
  // Multiple consecutive entries with a step-up reveal the birthday window precisely
  if (mhPlayer) {
    for (const [mhTid, t] of Object.entries(mhPlayer.torneios)) {
      if (!t.startDate || !t.ageGroup) continue;
      const isoD = isoDate(t.startDate);
      if (!isoD) continue;
      const exact = parseExactAge(t.ageGroup);
      if (exact == null) continue; // range label like "Boys 10-11" → skip
      constraints.push({ dateExact: isoD, ageMin: exact, ageMax: exact, tid: `mh_${mhTid}` });
    }
  }

  if (constraints.length === 0) {
    return { exact: false, rangeStr: "?", ageStr: "?" };
  }

  // ── Step 2: intersect all per-tournament DOB windows ───────────────────────
  // "Age A on date D" → birthday ∈ (D − (A+1) years, D − A years]
  // Apply each constraint only if it doesn't make the range impossible.
  // Bad constraints (e.g. from a name collision in auto-loaded data) are skipped.
  let rangeMin: Date | null = null;
  let rangeMax: Date | null = null;

  for (const c of constraints) {
    const tDate = new Date(c.dateExact);
    const latest = new Date(tDate);
    latest.setFullYear(latest.getFullYear() - c.ageMin);
    const earliest = new Date(tDate);
    earliest.setFullYear(earliest.getFullYear() - c.ageMax - 1);
    earliest.setDate(earliest.getDate() + 1);

    // Try applying — only commit if the result is still a valid window
    const newMin: Date = (!rangeMin || earliest > rangeMin) ? earliest : rangeMin;
    const newMax: Date = (!rangeMax || latest  < rangeMax)  ? latest   : rangeMax;
    if (newMin <= newMax) {
      rangeMin = newMin;
      rangeMax = newMax;
    }
    // else: this constraint conflicts with what we know — skip it silently
  }

  if (!rangeMin || !rangeMax || rangeMin > rangeMax) {
    return { exact: false, rangeStr: "?", ageStr: "?" };
  }

  // ── Step 3: tighten using age-group transitions ─────────────────────────────
  // If player was age A at T1 and A+1 at T2 (T2 > T1), their (A+1)-th birthday
  // falls strictly between T1 and T2 → birthday ∈ (T1 − (A+1) years, T2 − (A+1) years]
  // This same window is already captured by the intersection above, but the
  // transition check lets us tighten when we only have the later tournament:
  //   if we know birthday > T1 (because they were still A at T1), we can set
  //   a lower bound on birthday of (T1 - (A+1) years + 1 day).
  // So the main benefit is detecting the transition to add this lower bound constraint.

  const sorted = [...constraints].sort((a, b) => a.dateExact.localeCompare(b.dateExact));
  for (let i = 0; i < sorted.length - 1; i++) {
    const c1 = sorted[i], c2 = sorted[i + 1];
    // Is this a clear step-up? (c2's minimum age > c1's maximum age, difference = 1)
    if (c2.ageMin - c1.ageMax === 1) {
      // Birthday is the (c1.ageMax + 1)th birthday, which happened between T1 and T2
      // → birthday ∈ (T1 − (c1.ageMax+1) years, T2 − (c1.ageMax+1) years]
      const transA = c1.ageMax + 1;
      const transLate = new Date(c2.dateExact);
      transLate.setFullYear(transLate.getFullYear() - transA);
      const transEarly = new Date(c1.dateExact);
      transEarly.setFullYear(transEarly.getFullYear() - transA);
      transEarly.setDate(transEarly.getDate() + 1);

      // Apply transition tightening only if it keeps the range valid
      const tMin: Date = transEarly > rangeMin! ? transEarly : rangeMin!;
      const tMax: Date = transLate  < rangeMax! ? transLate  : rangeMax!;
      if (tMin <= tMax) { rangeMin = tMin; rangeMax = tMax; }
    }
  }

  if (rangeMin! > rangeMax!) {
    return { exact: false, rangeStr: "?", ageStr: "?" };
  }

  // ── Step 4: format output ───────────────────────────────────────────────────
  const minY = rangeMin!.getFullYear(), maxY = rangeMax!.getFullYear();
  const minM = rangeMin!.getMonth(),    maxM = rangeMax!.getMonth();
  const spanDays = Math.round((rangeMax!.getTime() - rangeMin!.getTime()) / 86400000);

  let rangeStr: string;
  if (spanDays <= 1) {
    // Single day — essentially exact
    const d = rangeMin!;
    rangeStr = `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  } else if (minY === maxY) {
    if (minM === maxM) {
      rangeStr = `${MONTHS_PT[minM]} ${minY}`;
    } else {
      rangeStr = `${MONTHS_PT[minM]}–${MONTHS_PT[maxM]} ${minY}`;
    }
  } else {
    rangeStr = `${MONTHS_PT[minM]} ${minY} – ${MONTHS_PT[maxM]} ${maxY}`;
  }

  // Estimate age: use midpoint of the DOB range
  const midMs  = (rangeMin!.getTime() + rangeMax!.getTime()) / 2;
  const midDob = new Date(midMs);
  // Never show countdown for estimated DOBs — midpoint is not the real birthday
  const ageStr = fmtAgeEstimated(midDob);

  return { exact: false, rangeMin: rangeMin ?? undefined, rangeMax: rangeMax ?? undefined, rangeStr, ageStr };
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

const manuel = D.find(x => x.isM)!;

/** Hook: carrega todos os ficheiros JSON e faz merge com D */
function useAutoRivals() {
  const [merged, setMerged] = React.useState<RivalPlayer[]>(D);
  const [loaded, setLoaded] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number; label: string } | null>(null);

  React.useEffect(() => {
    buildAutoRivals((p) => setProgress({ ...p })).then(autoPlayers => {
      // Trabalhar sobre uma cópia profunda de D
      const map = new Map<string, RivalPlayer>(
        D.map(p => [normName(p.n), { ...p, r: { ...p.r } }])
      );
      for (const ap of autoPlayers) {
        const key = normName(ap.n);
        if (map.has(key)) {
          const ex = map.get(key)!;
          for (const [tid, res] of Object.entries(ap.r)) {
            if (!ex.r[tid] || res.rd.length > (ex.r[tid]?.rd.length ?? 0))
              ex.r[tid] = { ...res, p: res.p ?? "WD" } as TournResult;
          }
        } else {
          const convertedR: Record<string, TournResult> = Object.fromEntries(
            Object.entries(ap.r).map(([k, v]) => [k, { ...v, p: v.p ?? "WD" } as TournResult])
          );
          map.set(key, { n: ap.n, co: ap.co, r: convertedR, up: [] });
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

/** Hook: carrega uskids-member-history.json */
function useMemberHist() {
  const [mh, setMh] = React.useState<MHData | null>(null);
  React.useEffect(() => {
    fetch("/data/uskids-member-history.json").then(r => r.json()).then(setMh).catch(() => {});
  }, []);
  return mh;
}

/** Parse data "MM/DD/YYYY" ou "YYYY-MM-DD" → "YYYY-MM-DD" para sort/display */
function isoDate(s: string): string {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  const p = s.split("/");
  if (p.length === 3) return `${p[2]}-${p[0].padStart(2,"0")}-${p[1].padStart(2,"0")}`;
  return "";
}

/** ±par color (dark theme friendly) */
function tpColorMH(tp: number | null): string {
  if (tp == null) return "var(--text-3)";
  if (tp < 0) return "var(--color-good-dark, #15803d)";
  if (tp === 0) return "var(--text-2)";
  return "var(--color-danger, #dc2626)";
}

/* ═══════════════════════════════════
   SCORECARD DATA — WJGC 2026 (3 rondas)
   ═══════════════════════════════════ */
// Villa Padierna Flamingos — tee WJGC 2026 (away-villa-padierna-flamingos-espanha-2)
const WJGC26_PAR = VP_WJGC26_PAR as unknown as readonly number[];
const WJGC26_SI  = VP_WJGC26_SI  as unknown as readonly number[];
const WJGC26_M   = VP_WJGC26_M   as unknown as readonly number[];
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
// Golf du Touquet La Forêt — EOWAGR 2025 (away-golf-du-touquet-la-foret-0)
// Le Touquet La Forêt — EOWAGR 2025
const EOWAGR25_PAR = LT_FORET_PAR as unknown as readonly number[];
const EOWAGR25_SI  = LT_FORET_SI  as unknown as readonly number[];
const EOWAGR25_M   = LT_FORET_M   as unknown as readonly number[];
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
// Villa Padierna Alferini — WJGC 2026 Boys 12-13
const WJGC26_1213_PAR = VP_ALFERINI_PAR as unknown as readonly number[];
const WJGC26_1213_SI  = VP_ALFERINI_SI  as unknown as readonly number[];
const WJGC26_1213_M   = VP_ALFERINI_M   as unknown as readonly number[];
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

// Compute field averages per round (used for tier coloring in dashboard)
const AVG_R: Record<string, Array<{ m: number; s: number } | null>> = {};
for (const t of T) {
  AVG_R[t.id] = [];
  for (let i = 0; i < t.rounds; i++) {
    const vals = D.filter(p => p.r[t.id]?.rd?.[i] != null).map(p => p.r[t.id].rd[i]).filter((v): v is number => v != null);
    if (vals.length > 1) {
      const m = vals.reduce((a, b) => a + b, 0) / vals.length;
      const s = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
      AVG_R[t.id][i] = { m, s };
    }
  }
}

const TIER_L = { elite: "Elite", strong: "Forte", solid: "Sólido", developing: "Em Desenv.", beginner: "Iniciante" };

const TR_I = { up2: { i: "▲▲", c: SC.good }, up: { i: "▲", c: "var(--score-par-seg)" }, stable: { i: "●", c: "var(--text-muted)" }, down: { i: "▼", c: SC.warn }, down2: { i: "▼▼", c: SC.danger } };

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
const RivalsCtx = React.createContext<RivalPlayer[]>(D);
function useRivals() { return React.useContext(RivalsCtx); }

const MemberHistCtx = React.createContext<MHData | null>(null);
function useMH() { return React.useContext(MemberHistCtx); }

/* ── Rank map derivado do array de rivais ── */
function buildRankMap(rivals: RivalPlayer[]): Record<string, number> {
  const scored = rivals.map(p => ({ n: p.n, z: (getAvgZ as unknown as (p: RivalPlayer) => number | null)(p) })).filter(x => x.z != null) as { n: string; z: number }[];
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
  ["brjgt25",       "wjgc25_b1011"],
  // WJGC 2026 — auto tid vs manual entry
  ["wjgc26_b1213",  "wjgc26_1213"],
  // Venice 2025 escalões vs manual entry
  ["venice25_b11","venice25"], ["venice25_b12","venice25"],
  ["venice25_b9", "venice25"], ["venice25_b10","venice25"],
  // Rome 2025
  ["rome25_b11",  "rome25"],   ["rome25_b12",  "rome25"],
  ["rome25_b9",   "rome25"],   ["rome25_b10",  "rome25"],
  // Doral 2025
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
function getVsAvg(p: RivalPlayer, manuelRef?: RivalPlayer | null) {
  const m = manuelRef ?? manuel;
  if (p.isM) return null;
  const ds: number[] = [];
  Object.keys(p.r).forEach(tid => {
    const mr = m?.r[tid];
    if (mr && p.r[tid].tp != null && mr.tp != null) ds.push(p.r[tid].tp - mr.tp);
  });
  return ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null;
}

/* ─────────────────────────────────────────────────────────────
   Generic scorecard table (WJGC26, GG26, QDL25)
   ───────────────────────────────────────────────────────────── */
interface ScRound { label: string; scores: number[] }
function TournScorecard({ par, si, meters, rounds }: { par: readonly number[]; si?: readonly number[]; meters?: readonly number[]; rounds: ScRound[] }) {
  const frontPar = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const backPar = par.slice(9).reduce((a, b) => a + b, 0);
  const totalPar = frontPar + backPar;
  const frontM = meters ? meters.slice(0, 9).reduce((a, b) => a + b, 0) : 0;
  const backM  = meters ? meters.slice(9).reduce((a, b) => a + b, 0) : 0;
  const totalM = frontM + backM;
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
          {meters && (
            <tr className="meta-row">
              <td className="row-label fs-10 c-text-3">m</td>
              {meters.slice(0, 9).map((m, i) => <td key={i} className="fs-10 c-text-3">{m}</td>)}
              <td className="col-out fs-10 c-text-3">{frontM}</td>
              {meters.slice(9).map((m, i) => <td key={i + 9} className="fs-10 c-text-3">{m}</td>)}
              <td className="col-in fs-10 c-text-3">{backM}</td>
              <td className="col-total fs-10 c-text-3">{totalM}</td>
            </tr>
          )}
          {si && (
            <tr className="meta-row">
              <td className="row-label fs-10">SI</td>
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
function RivaisDashboard({ onSelectPlayer }: { onSelectPlayer?: (name: string) => void }) {
  const rivals = useRivals();
  const memberHist = useMH();

  // Mapa nome (lowercase, normalizado) → nº de torneios USKids com resultados
  const mhCountMap = useMemo<Map<string, number>>(() => {
    const m = new Map<string, number>();
    if (!memberHist) return m;
    for (const mh of Object.values(memberHist.jogadores)) {
      if (!mh.name || mh.name === "?" || mh.name.startsWith("[unknown")) continue;
      const key = mh.name.toLowerCase().trim().replace(/\s+/g, " ");
      const cnt = Object.values(mh.torneios).filter(t => t.rounds && Object.keys(t.rounds).length > 0).length;
      if (cnt > 0) m.set(key, cnt);
    }
    return m;
  }, [memberHist]);

  const [fTour, setFTour] = useState("all");
  const [fUp, setFUp] = useState("all");
  const [fCo, setFCo] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("zrank");
  const [dir, setDir] = useState<"asc"|"desc">("asc");
  const [dOnly, setDOnly] = useState(false);
  const [vsOn, setVsOn] = useState(true);
  // New filters
  const [fJuntos, setFJuntos]   = useState("all");   // torneios jogados juntos com Manuel
  const [fPerf, setFPerf]       = useState("all");   // performance (melhor ±par)
  const [fTrend, setFTrend]     = useState("all");   // tendência
  const [fUsk, setFUsk]         = useState("all");   // USKids histórico
  const [fH2H, setFH2H]         = useState("all");   // H2H vs Manuel (ganhou/perdeu/equilibrado)
  const [showFilters, setShowFilters] = useState(false); // toggle painel de filtros extra

  const manuelMergedDash = useMemo(() => rivals.find(p => p.isM) ?? manuel, [rivals]);

  const list = useMemo(() => {
    let pl = [...rivals];
    if (dOnly) pl = pl.filter(x => Object.values(x.r).some(r => r.tp != null));
    if (fTour !== "all") pl = pl.filter(x => x.r[fTour]);
    if (fUp !== "all") pl = pl.filter(x => x.up.includes(fUp));
    if (fCo !== "all") pl = pl.filter(x => x.co === fCo);
    if (q) { const ql = q.toLowerCase(); pl = pl.filter(x => x.n.toLowerCase().includes(ql)); }

    // Torneios juntos com Manuel
    if (fJuntos !== "all" && manuelMergedDash) {
      pl = pl.filter(x => {
        if (x.isM) return true;
        const hidden = hiddenTids(x), mHidden = hiddenTids(manuelMergedDash);
        const shared = Object.keys(x.r).filter(tid =>
          !hidden.has(tid) && !mHidden.has(tid) &&
          typeof manuelMergedDash.r[tid]?.p === "number" && typeof x.r[tid]?.p === "number"
        ).length;
        if (fJuntos === "0")  return shared === 0;
        if (fJuntos === "1")  return shared === 1;
        if (fJuntos === "2+") return shared >= 2;
        if (fJuntos === "3+") return shared >= 3;
        return true;
      });
    }

    // Performance (melhor ±par total)
    if (fPerf !== "all") {
      pl = pl.filter(x => {
        if (x.isM) return true;
        const tps = Object.values(x.r).filter(r => r?.tp != null).map(r => r!.tp as number);
        if (tps.length === 0) return fPerf === "nodata";
        const best = Math.min(...tps);
        if (fPerf === "elite") return best <= 0;
        if (fPerf === "strong") return best > 0 && best <= 15;
        if (fPerf === "mid") return best > 15 && best <= 30;
        if (fPerf === "dev") return best > 30;
        return true;
      });
    }

    // Tendência
    if (fTrend !== "all") {
      pl = pl.filter(x => {
        if (x.isM) return true;
        const tr = (getTrend as (p: RivalPlayer) => string | null)(x);
        if (fTrend === "up")     return tr === "up" || tr === "up2";
        if (fTrend === "down")   return tr === "down" || tr === "down2";
        if (fTrend === "stable") return tr === "stable" || tr == null;
        return true;
      });
    }

    // USKids histórico
    if (fUsk !== "all") {
      pl = pl.filter(x => {
        if (x.isM) return true;
        const key = x.n.toLowerCase().trim().replace(/\s+/g, " ");
        const cnt = mhCountMap.get(key) ?? 0;
        if (fUsk === "yes") return cnt > 0;
        if (fUsk === "no")  return cnt === 0;
        if (fUsk === "3+")  return cnt >= 3;
        return true;
      });
    }

    // H2H vs Manuel
    if (fH2H !== "all" && manuelMergedDash) {
      pl = pl.filter(x => {
        if (x.isM) return true;
        const hidden = hiddenTids(x), mHidden = hiddenTids(manuelMergedDash);
        const shared = Object.keys(x.r).filter(tid =>
          !hidden.has(tid) && !mHidden.has(tid) &&
          typeof manuelMergedDash.r[tid]?.p === "number" && typeof x.r[tid]?.p === "number"
        );
        if (shared.length === 0) return fH2H === "none";
        const wins = shared.filter(t => (manuelMergedDash.r[t].p as number) < (x.r[t].p as number)).length;
        const losses = shared.filter(t => (manuelMergedDash.r[t].p as number) > (x.r[t].p as number)).length;
        if (fH2H === "manuel_wins") return wins > losses;
        if (fH2H === "rival_wins")  return losses > wins;
        if (fH2H === "balanced")    return wins === losses;
        if (fH2H === "none")        return shared.length === 0;
        return true;
      });
    }

    pl.sort((a, b) => {
      let cmp = 0;
      if (sort === "name") cmp = a.n.localeCompare(b.n);
      else if (sort === "zrank") { cmp = ((getAvgZ as unknown as (p: RivalPlayer) => number | null)(a) ?? 99) - ((getAvgZ as unknown as (p: RivalPlayer) => number | null)(b) ?? 99); }
      else if (sort === "vsManuel") { cmp = (getVsAvg(a, manuelMergedDash) ?? 999) - (getVsAvg(b, manuelMergedDash) ?? 999); }
      else if (sort.startsWith("t:")) {
        const tid = sort.slice(2);
        const posOf = (x: RivalPlayer) => { const r = x.r[tid]; if (!r || (r.tp == null && (r.p as any) !== "WD")) return 9999; return typeof r.p === "number" ? r.p : 9998; };
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
  }, [fTour, fUp, fCo, q, sort, dir, dOnly, fJuntos, fPerf, fTrend, fUsk, fH2H, rivals, manuelMergedDash]);

  const doSort = (c: string) => { if (sort === c) setDir(d => d === "asc" ? "desc" : "asc"); else { setSort(c); setDir("asc"); } };
  const sortIcon = (c: string) => sort === c ? (dir === "asc" ? " ↑" : " ↓") : "";

  // Count tournaments & rounds played
  const nPlayedLocal = (p: RivalPlayer) => nPlayed(p);
  const nRoundsLocal = (p: RivalPlayer) => nRounds(p);

  // Countries from merged rivals (includes auto-loaded players)
  const allCountries = useMemo(() => [...new Set(rivals.map(p => p.co))].sort(), [rivals]);

  // Build dynamic list of auto-loaded tournaments that actually appear in the data
  // Sorted by: most players first, then by date
  const autoTournCols = useMemo(() => {
    const tFixed = new Set(T.map(t => t.id));
    const hidden = new Set<string>();
    for (const p of rivals) for (const h of hiddenTids(p)) hidden.add(h);
    const counts = new Map<string, number>();
    for (const p of rivals) {
      for (const [tid, res] of Object.entries(p.r)) {
        if (tFixed.has(tid) || hidden.has(tid)) continue;
        if (!res || (res.tp == null && !(res as any).p)) continue;
        counts.set(tid, (counts.get(tid) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= 2) // at least 2 players → worth a column
      .sort((a, b) => {
        const infoA = getTournInfo(a[0]), infoB = getTournInfo(b[0]);
        // Sort: most recent first, then by player count
        const dateA = infoA.dateExact || infoA.date;
        const dateB = infoB.dateExact || infoB.date;
        const dateCmp = dateB.localeCompare(dateA);
        return dateCmp !== 0 ? dateCmp : b[1] - a[1];
      })
      .slice(0, 12) // cap at 12 extra columns
      .map(([tid]) => ({ tid, info: getTournInfo(tid), weight: getTournWeight(tid) }));
  }, [rivals]);

  const allTournCols = useMemo(() => [
    ...T.map(t => ({ tid: t.id, info: { name: t.name, short: t.short, date: t.date, dateExact: t.dateExact ?? t.date }, weight: getTournWeight(t.id), url: t.url, isFixed: true })),
    ...autoTournCols.map(c => ({ ...c, url: undefined, isFixed: false })),
  ], [autoTournCols]);

  return (
    <div>
      {/* Manuel KPIs — por torneio + resumo global */}
      {(() => {
        // Global stats for Manuel
        const manuelRivals = rivals.find(d => d.isM) ?? manuel;
        const allManuelRds = Object.values(manuelRivals.r).flatMap((r: any) => r.rd?.filter((x: number) => x > 0) ?? []) as number[];
        const manuelAvg = allManuelRds.length ? allManuelRds.reduce((a,b)=>a+b,0)/allManuelRds.length : null;
        const manuelBest = allManuelRds.length ? Math.min(...allManuelRds) : null;
        const manuelTorneios = nPlayed(manuelRivals);
        const manuelRondas = nRounds(manuelRivals);
        return (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "stretch" }}>
            {/* Global summary */}
            <div className="kpi" style={{ flex: "0 0 auto", padding: "8px 14px", background: "var(--bg-info-subtle,#e0f2fe)", borderLeft: "3px solid var(--accent,#2563eb)" }}>
              <div className="kpi-lbl" style={{ color: "var(--color-info-dark,#0369a1)" }}>Manuel — Total</div>
              <div style={{ display: "flex", gap: 16, alignItems: "baseline", marginTop: 4 }}>
                <span><span className="fw-800 fs-16">{manuelTorneios}</span><span className="fs-10 c-text-3 ml-4">torneios</span></span>
                <span><span className="fw-800 fs-16">{manuelRondas}</span><span className="fs-10 c-text-3 ml-4">rondas</span></span>
                {manuelAvg != null && <span><span className="fw-700 fs-14">{manuelAvg.toFixed(1)}</span><span className="fs-10 c-text-3 ml-4">média</span></span>}
                {manuelBest != null && <span><span className="fw-700 fs-14" style={{ color: "var(--color-good-dark)" }}>{manuelBest}</span><span className="fs-10 c-text-3 ml-4">melhor</span></span>}
              </div>
            </div>
            {/* Per-tournament */}
            {T.map(t => {
              const res = manuelRivals.r[t.id];
              if (!res) return (
                <div key={t.id} className="kpi op-4" style={{ padding: "8px 10px", flex: "1 1 80px", minWidth: 80 }}>
                  <div className="kpi-lbl">{t.short}</div>
                  <div className="kpi-val fs-16">–</div>
                </div>
              );
              return (
                <div key={t.id} className="kpi" style={{ padding: "8px 10px", flex: "1 1 80px", minWidth: 80 }}>
                  <div className="kpi-lbl">{t.short}</div>
                  <div className="kpi-val" style={{ fontSize: 18, color: tpColorDark(res.tp) }}>
                    {fmtSign(res.tp!)}
                  </div>
                  <div className="kpi-sub">
                    #{res.p as number}
                    {res.rd?.length > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>{res.rd.join("-")}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Filters */}
      {/* ── Toolbar + filtros ── */}
      {(() => {
        const activeCount = [fTour, fUp, fCo, fJuntos, fPerf, fTrend, fUsk, fH2H].filter(v => v !== "all").length
          + (dOnly ? 1 : 0) + (q ? 1 : 0);
        const resetAll = () => { setFTour("all"); setFUp("all"); setFCo("all"); setFJuntos("all"); setFPerf("all"); setFTrend("all"); setFUsk("all"); setFH2H("all"); setDOnly(false); setQ(""); };
        return (
          <div style={{ marginBottom: 8 }}>
            {/* Row 1: search + main filters + toggle */}
            <div className="detail-toolbar" style={{ flexWrap: "wrap" }}>
              <input type="text" placeholder="Pesquisar..." value={q} onChange={e => setQ(e.target.value)} className="input" style={{ maxWidth: 140 }} />
              <select value={fTour} onChange={e => setFTour(e.target.value)} className="select">
                <option value="all">Todos Torneios</option>
                {allTournCols.map(({ tid, info }) => <option key={tid} value={tid}>{info.short} {info.date}</option>)}
              </select>
              <select value={fCo} onChange={e => setFCo(e.target.value)} className="select">
                <option value="all">🌍 País</option>
                {allCountries.map(c => <option key={c} value={c}>{FL[c] || ""} {c}</option>)}
              </select>
              <label className="filter-checkbox"><input type="checkbox" checked={vsOn} onChange={e => setVsOn(e.target.checked)} /> vs M</label>
              <button
                className={`p p-filter p-sm${showFilters ? " active" : ""}`}
                onClick={() => setShowFilters(s => !s)}
                style={{ position: "relative" }}
              >
                Filtros {showFilters ? "▲" : "▼"}
                {activeCount > 0 && (
                  <span style={{ position: "absolute", top: -4, right: -4, background: "var(--accent,#2563eb)", color: "#fff", borderRadius: "50%", width: 16, height: 16, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {activeCount}
                  </span>
                )}
              </button>
              {activeCount > 0 && (
                <button className="p p-filter p-sm" onClick={resetAll} style={{ color: "var(--color-danger)" }}>✕ Limpar</button>
              )}
              <div className="chip" style={{ marginLeft: "auto" }}>{list.length} jogadores</div>
            </div>

            {/* Row 2: extra filters (collapsible) */}
            {showFilters && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "8px 0 4px", borderTop: "1px solid var(--border-light)", marginTop: 6 }}>

                {/* Torneios juntos com Manuel */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)" }}>🤝 Juntos</span>
                  <div style={{ display: "flex", gap: 3 }}>
                    {[["all","Todos"],["0","0"],["1","1"],["2+","2+"],["3+","3+"]].map(([v,l]) => (
                      <button key={v} className={`p p-filter p-sm${fJuntos===v?" active":""}`} onClick={() => setFJuntos(v)}>{l}</button>
                    ))}
                  </div>
                </div>

                {/* Performance */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)" }}>⛳ Melhor ±Par</span>
                  <div style={{ display: "flex", gap: 3 }}>
                    {[["all","Todos"],["elite","≤ E"],["strong","0–15"],["mid","16–30"],["dev",">30"],["nodata","S/d"]].map(([v,l]) => (
                      <button key={v} className={`p p-filter p-sm${fPerf===v?" active":""}`} onClick={() => setFPerf(v)}>{l}</button>
                    ))}
                  </div>
                </div>

                {/* Tendência */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)" }}>📈 Tendência</span>
                  <div style={{ display: "flex", gap: 3 }}>
                    {[["all","Todos"],["up","▲ A subir"],["stable","● Estável"],["down","▼ A descer"]].map(([v,l]) => (
                      <button key={v} className={`p p-filter p-sm${fTrend===v?" active":""}`} onClick={() => setFTrend(v)}>{l}</button>
                    ))}
                  </div>
                </div>

                {/* H2H vs Manuel */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)" }}>⚔️ H2H vs Manuel</span>
                  <div style={{ display: "flex", gap: 3 }}>
                    {[["all","Todos"],["manuel_wins","Manuel ganhou"],["rival_wins","Rival ganhou"],["balanced","Equilibrado"],["none","Sem encontros"]].map(([v,l]) => (
                      <button key={v} className={`p p-filter p-sm${fH2H===v?" active":""}`} onClick={() => setFH2H(v)}>{l}</button>
                    ))}
                  </div>
                </div>

                {/* USKids histórico */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)" }}>📊 USKids histórico</span>
                  <div style={{ display: "flex", gap: 3 }}>
                    {[["all","Todos"],["yes","Tem"],["3+","3+ torn."],["no","Sem"]].map(([v,l]) => (
                      <button key={v} className={`p p-filter p-sm${fUsk===v?" active":""}`} onClick={() => setFUsk(v)}>{l}</button>
                    ))}
                  </div>
                </div>

                {/* Próximos torneios */}
                {UP.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)" }}>▲ Próximos</span>
                    <div style={{ display: "flex", gap: 3 }}>
                      <button className={`p p-filter p-sm${fUp==="all"?" active":""}`} onClick={() => setFUp("all")}>Todos</button>
                      {UP.map(u => (
                        <button key={u.id} className={`p p-filter p-sm${fUp===u.id?" active":""}`} onClick={() => setFUp(u.id)}>{u.short}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Checkbox: só com dados */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3, justifyContent: "flex-end" }}>
                  <label className="filter-checkbox" style={{ fontSize: 11 }}>
                    <input type="checkbox" checked={dOnly} onChange={e => setDOnly(e.target.checked)} /> Só com dados
                  </label>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Legend */}
      <div className="legend-row">
        {(Object.keys(TIER) as Array<keyof typeof TIER>).map(k => (
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
                {allTournCols.map(({ tid, info, weight, url, isFixed }) => {
                  const stars = weight >= 1.3 ? "★★★★★" : weight >= 1.1 ? "★★★★" : weight >= 0.9 ? "★★★" : weight >= 0.6 ? "★★" : weight >= 0.4 ? "★" : "½";
                  return (
                    <th key={tid} className="rivais-th pointer ta-center"
                      style={{ minWidth: 56, opacity: isFixed ? 1 : 0.85 }}
                      onClick={() => doSort("t:" + tid)}>
                      {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="rivais-link" onClick={e => e.stopPropagation()}>{info.short}</a> : info.short}
                      {sortIcon("t:" + tid)}
                      <div className="fs-9 fw-500 op-6 mt-1">{stars} {info.date}</div>
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
                <th className="rivais-th ta-center" title="Torneios USKids no histórico oficial">📊</th>
              </tr>
            </thead>
            <tbody>
              {list.map(p => {
                const isM = p.isM;
                const tr = (getTrend as (p: RivalPlayer) => string | null)(p);
                const flag = FL[p.co] || "🏳️";
                const vsAvg = vsOn ? getVsAvg(p, manuelMergedDash) : null;
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
                    {allTournCols.map(({ tid, info: _info }) => {
                      const res = p.r[tid];
                      if (!res || (res.tp == null && res.p !== "WD")) return <td key={tid} />;
                      if (res.p === "WD") return <td key={tid} className="ta-center fs-11 c-muted">WD</td>;

                      const tDef = T.find(t => t.id === tid);
                      const rounds = tDef?.rounds ?? res.rd?.length ?? 1;
                      const playerAvg = res.t != null ? res.t / rounds : 0;
                      const roundAvgs = AVG_R[tid];
                      let fieldAvg: number | null = null, fieldStd: number | null = null;
                      if (roundAvgs && roundAvgs.length > 0) {
                        const ms = roundAvgs.filter((x: RoundAvg): x is { m: number; s: number } => x != null).map((x: { m: number }) => x.m);
                        const ss = roundAvgs.filter((x: RoundAvg): x is { m: number; s: number } => x != null).map((x: { s: number }) => x.s);
                        if (ms.length > 0) { fieldAvg = ms.reduce((a: number, b: number) => a + b, 0) / ms.length; fieldStd = ss.reduce((a: number, b: number) => a + b, 0) / ss.length; }
                      }
                      const ti = fieldAvg != null ? zTier(playerAvg, { m: fieldAvg, s: fieldStd ?? 0 }) : null;
                      const st = (ti ? TIER[ti as keyof typeof TIER] : null) as { bg: string; c: string } | null;
                      const tpStr = res.tp != null ? fmtSign(res.tp) : "—";

                      let vsM: number | null = null;
                      if (vsOn && !isM) {
                        const mRes = manuelMergedDash.r[tid];
                        if (mRes?.tp != null && res.tp != null) vsM = res.tp - mRes.tp;
                      }

                      return (
                        <td key={tid} className="ta-center" style={{ background: st?.bg || "transparent", padding: "5px 4px" }}>
                          <div className="fw-700 fs-13" style={{ color: st?.c || "var(--text-3)" }}>{tpStr}</div>
                          {res.p != null && <div className="fs-10 fw-600 c-text-3">#{res.p}</div>}
                          {vsM != null && <div className="fs-10 fw-600" style={{ color: sc3m(vsM, 0, 0) }}>{fmtSign(vsM)}</div>}
                        </td>
                      );
                    })}

                    {/* Rank */}
                    <td className="ta-center" style={{ borderLeft: "3px solid var(--border-light)", padding: "4px 6px" }}>
                      {rankMap[p.n] != null ? (
                        <div title={`z-score: ${((getAvgZ as unknown as (p: RivalPlayer) => number | null)(p) ?? 0).toFixed(2)} · ${nRounds(p)} rondas`}>
                          <div className="fw-800 fs-13" style={{ color: rankMap[p.n] <= 10 ? "var(--color-good-dark)" : rankMap[p.n] <= 30 ? "var(--text)" : "var(--text-3)" }}>
                            {rankMap[p.n]}º
                          </div>
                          <div className="fs-10 c-text-3">{nPlayedLocal(p)}T · {nRoundsLocal(p)}R</div>
                        </div>
                      ) : <span className="fs-10 c-border">s/d</span>}
                    </td>

                    {/* Trend */}
                    <td className="ta-center">
                      {tr ? <span className="fw-700 fs-13" style={{ color: TR_I[tr as keyof typeof TR_I].c }}>{TR_I[tr as keyof typeof TR_I].i}</span> : <span className="c-border">—</span>}
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

                    {/* 📊 Member history count */}
                    {(() => {
                      const key = p.n.toLowerCase().trim().replace(/\s+/g, " ");
                      const cnt = mhCountMap.get(key) ?? 0;
                      return (
                        <td className="ta-center">
                          {cnt > 0
                            ? <span className="fs-11 fw-700" style={{ color: "var(--accent,#2563eb)", cursor: onSelectPlayer ? "pointer" : "default" }}
                                onClick={() => onSelectPlayer?.(p.n)}>{cnt}</span>
                            : <span className="fs-10 c-border">—</span>}
                        </td>
                      );
                    })()}
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
  const mh = useMH();
  const mhPlayer = React.useMemo(() => {
    if (!mh) return null;
    const key = player.n.toLowerCase().trim().replace(/\s+/g, " ");
    return (Object.values(mh.jogadores) as MHPlayer[]).find(
      m => m.name && m.name.toLowerCase().trim().replace(/\s+/g, " ") === key
    ) ?? null;
  }, [mh, player.n]);

  const info = computeDobInfo(player, mhPlayer);
  if (!info.exact && info.rangeStr === "?") return null;

  if (info.exact) {
    return (
      <span style={{ fontSize: 10, color: "var(--color-good-dark)", marginLeft: 4, fontWeight: 600 }}
        title={`Nasceu em ${info.dobStr}`}>
        🎂 {info.dobStr}
      </span>
    );
  }

  const spanDays = info.rangeMin && info.rangeMax
    ? Math.round((info.rangeMax.getTime() - info.rangeMin.getTime()) / 86400000) : 999;
  const color = spanDays <= 60  ? "var(--color-good-dark)"
              : spanDays <= 180 ? "var(--text-2)"
              : "var(--text-3)";
  const fw = spanDays <= 180 ? 600 : 400;
  const icon = spanDays <= 60 ? "🎯" : "📅";
  const tooltip = `Estimativa: ${info.rangeStr} · janela de ${spanDays}d`;

  return (
    <span style={{ fontSize: 10, color, marginLeft: 4, fontWeight: fw }} title={tooltip}>
      {icon} ~{info.rangeStr}
    </span>
  );
}

// Grupos de torneios para o filtro da sidebar
const SIDEBAR_FILTERS = [
  { id: "all",     label: "Todos" },
  { id: "wjgc",   label: "WJGC/BJGT" },
  { id: "uskids", label: "US Kids" },
  { id: "eowagr", label: "EU Open" },
  { id: "doral",  label: "Doral" },
  { id: "pt",     label: "Nacional" },
  { id: "outros", label: "Outros" },
];

function playerMatchesFilter(p: RivalPlayer, fid: string): boolean {
  if (fid === "all") return true;
  const tids = Object.keys(p.r);
  if (fid === "wjgc")   return tids.some(t => t.startsWith("wjgc") || t.startsWith("brjgt"));
  if (fid === "uskids") return tids.some(t =>
    t.startsWith("usk") ||           // auto-loaded USKids completo tids
    t.startsWith("venice") || t.startsWith("rome") ||
    t.startsWith("marco") || t.startsWith("desert") ||
    t.startsWith("sandestin") || t.startsWith("msstate") ||
    t.startsWith("elprat")
    // Doral não é USKids — tem tab próprio
  );
  if (fid === "eowagr") return tids.some(t => t.startsWith("eowagr"));
  if (fid === "doral")  return tids.some(t => t.startsWith("doral"));
  if (fid === "pt")     return tids.some(t =>
    t.startsWith("gg") || t.startsWith("qdl")
  );
  if (fid === "outros") return !tids.some(t =>
    t.startsWith("wjgc") || t.startsWith("brjgt") ||
    t.startsWith("usk") || t.startsWith("venice") || t.startsWith("rome") ||
    t.startsWith("marco") || t.startsWith("desert") || t.startsWith("sandestin") ||
    t.startsWith("msstate") || t.startsWith("elprat") || t.startsWith("doral") ||
    t.startsWith("eowagr") || t.startsWith("gg") || t.startsWith("qdl")
  );
  return true;
}

function RivaisSidebar({ selected, onSelect }: { selected: string | null; onSelect: (n: string) => void }) {
  const [q, setQ] = useState("");
  const rivals = useRivals();
  const memberHist = useMH();
  const [fid, setFid] = useState("all");

  // Mapa nome → nº torneios USKids no histórico
  const mhCountSidebar = useMemo<Map<string, number>>(() => {
    const m = new Map<string, number>();
    if (!memberHist) return m;
    for (const mh of Object.values(memberHist.jogadores) as MHPlayer[]) {
      if (!mh.name || mh.name === "?" || mh.name.startsWith("[unknown")) continue;
      const key = mh.name.toLowerCase().trim().replace(/\s+/g, " ");
      const cnt = Object.values(mh.torneios).filter(t => t.rounds && Object.keys(t.rounds).length > 0).length;
      if (cnt > 0) m.set(key, cnt);
    }
    return m;
  }, [memberHist]);

  // Mapa nome → USKids member ID
  const mhIdSidebar = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>();
    if (!memberHist) return m;
    for (const mh of Object.values(memberHist.jogadores) as MHPlayer[]) {
      if (!mh.name || !mh.memberId) continue;
      m.set(mh.name.toLowerCase().trim().replace(/\s+/g, " "), mh.memberId);
    }
    return m;
  }, [memberHist]);

  // Pré-computar H2H para todos os rivais vs Manuel
  const manuelMerged = rivals.find(d => d.isM);
  const h2hMap = useMemo<Map<string, { w: number; l: number; d: number }>>(() => {
    const m = new Map<string, { w: number; l: number; d: number }>();
    if (!manuelMerged) return m;
    for (const p of rivals) {
      if (p.isM) continue;
      const hidden = hiddenTids(p);
      const mHidden = hiddenTids(manuelMerged);
      const shared = Object.keys(p.r).filter(tid => {
        if (hidden.has(tid) || mHidden.has(tid)) return false;
        const mp = manuelMerged.r[tid]; const rp = p.r[tid];
        return typeof mp?.p === "number" && typeof rp?.p === "number";
      });
      if (shared.length === 0) continue;
      const w = shared.filter(tid => (manuelMerged.r[tid].p as number) < (p.r[tid].p as number)).length;
      const l = shared.filter(tid => (manuelMerged.r[tid].p as number) > (p.r[tid].p as number)).length;
      m.set(p.n, { w, l, d: shared.length - w - l });
    }
    return m;
  }, [rivals, manuelMerged]);

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
          const flagEmoji = FL[p.co] || "🏳️";
          const rank = rankMap[p.n];
          const tr = (getTrend as (p: RivalPlayer) => string | null)(p);
          const played = nPlayed(p);
          const isActive = selected === p.n;
          const rankCls = rank == null ? "" : rank <= 3 ? "sidebar-rank-top3" : rank <= 10 ? "sidebar-rank-top10" : "sidebar-rank-rest";
          const mhKey = p.n.toLowerCase().trim().replace(/\s+/g, " ");
          const mhCnt = mhCountSidebar.get(mhKey) ?? 0;
          const mhId  = mhIdSidebar.get(mhKey) ?? null;
          const h2h = h2hMap.get(p.n);
          const togetherCount = h2h ? h2h.w + h2h.l + h2h.d : 0;

          // Best position across all tournaments (dedup-aware)
          const hidden = hiddenTids(p);
          const positions = Object.entries(p.r)
            .filter(([tid, r]) => !hidden.has(tid) && typeof r?.p === "number" && (r.p as number) > 0)
            .map(([, r]) => r.p as number);
          const bestPos = positions.length ? Math.min(...positions) : null;
          const hasTop3 = bestPos != null && bestPos <= 3;
          const bestTpVal = Object.entries(p.r)
            .filter(([tid, r]) => !hidden.has(tid) && r?.tp != null)
            .map(([, r]) => r.tp as number);
          const bestTp = bestTpVal.length ? Math.min(...bestTpVal) : null;
          return (
            <button key={p.n} className={`course-item${isActive ? " active" : ""}`} onClick={() => onSelect(p.n)}>
              <div className="course-item-name">
                <span>{flagEmoji}</span>
                <span className={p.isM ? "fw-800" : ""}>{p.n}</span>
                {p.isM && <span className="p p-sm p-outline ml-2">REF</span>}
                {hasTop3 && <span style={{ fontSize: 13, marginLeft: 4 }}>{bestPos === 1 ? "🥇" : bestPos === 2 ? "🥈" : "🥉"}</span>}
                {tr && <span style={{ fontSize: 11, color: TR_I[tr as keyof typeof TR_I].c, marginLeft: "auto" }}>{TR_I[tr as keyof typeof TR_I].i}</span>}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center", flexWrap: "wrap", fontSize: 11 }}>
                <span style={{ color: "var(--text-3)" }}>{p.co}</span>
                {played > 0 && <span style={{ color: "var(--text-2)", fontWeight: 600 }}>· {played}T</span>}
                {!hasTop3 && bestPos != null && <span style={{ color: "var(--text-3)" }}>· #{bestPos}</span>}
                {bestTp != null && <span style={{ fontWeight: 600, color: tpColorDark(bestTp) }}>{fmtToPar(bestTp)}</span>}
                <DobPill player={p} />
                {/* Torneios juntos — destaque principal */}
                {togetherCount > 0 && (
                  <span style={{ fontWeight: 700, color: "var(--text-2)" }} title={`${togetherCount} torneios juntos com Manuel`}>
                    🤝 {togetherCount}
                  </span>
                )}
                {/* USKids: nº torneios histórico + ID */}
                {mhCnt > 0 && (
                  <span style={{ color: "var(--accent,#2563eb)", fontWeight: 600 }}
                    title={`USKids: ${mhCnt} torneios · ID ${mhId ?? "?"}`}>
                    📊{mhCnt}
                    {mhId && <span style={{ opacity: 0.65, fontSize: 10 }}> #{mhId}</span>}
                  </span>
                )}
                {rank != null && (
                  <span className={`sidebar-rank ${rankCls}`} style={{ marginLeft: "auto" }}>#{rank}</span>
                )}
                {p.up.length > 0 && <span style={{ color: "var(--color-good-dark)", fontWeight: 700 }}>▲</span>}
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
   MEMBER HISTORY TABLE — sortable
   ═══════════════════════════════════ */
type MHSortCol = "date" | "pos" | "total" | "name";

function MemberHistTable({ mhTorneios, memberId }: {
  mhTorneios: Array<MHTournament & { tid: string }>;
  memberId: string;
}) {
  const [sortCol, setSortCol] = useState<MHSortCol>("date");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");

  const doSort = (col: MHSortCol) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir(col === "name" ? "asc" : "desc"); }
  };
  const sortIcon = (col: MHSortCol) => sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const sorted = useMemo(() => {
    return [...mhTorneios].sort((a, b) => {
      let cmp = 0;
      if (sortCol === "date") {
        const pa = isoDate(a.startDate || ""), pb = isoDate(b.startDate || "");
        cmp = pa.localeCompare(pb);
      } else if (sortCol === "pos") {
        cmp = (a.place || 999) - (b.place || 999);
      } else if (sortCol === "total") {
        cmp = (a.totalStrokes || 999) - (b.totalStrokes || 999);
      } else if (sortCol === "name") {
        cmp = (a.name || "").localeCompare(b.name || "");
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [mhTorneios, sortCol, sortDir]);

  const ThS = ({ col, label, style }: { col: MHSortCol; label: string; style?: React.CSSProperties }) => (
    <th onClick={() => doSort(col)} style={{ cursor: "pointer", userSelect: "none", ...style }}>
      {label}{sortIcon(col)}
    </th>
  );

  return (
    <div style={{ marginTop: 24, marginBottom: 16 }}>
      <div className="h-sm mb-8" style={{ color: "var(--text-2)", display: "flex", alignItems: "center", gap: 8 }}>
        <span>📊 Histórico USKids · {mhTorneios.length} torneios</span>
        <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 400 }}>ID: {memberId}</span>
      </div>
      <div className="scroll-x">
        <table className="dtable" style={{ width: "100%", fontSize: 12 }}>
          <thead>
            <tr>
              <ThS col="name"  label="Torneio"  style={{ textAlign: "left", padding: "4px 8px" }} />
              <th style={{ textAlign: "center", width: 60 }}>Escalão</th>
              <ThS col="pos"   label="Pos"   style={{ textAlign: "center", width: 42 }} />
              <ThS col="total" label="Total" style={{ textAlign: "center", width: 60 }} />
              <th style={{ textAlign: "center", width: 70 }}>Rondas</th>
              <ThS col="date"  label="Data"  style={{ textAlign: "left", width: 70 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(t => {
              const nRds = Object.keys(t.rounds || {}).length;
              const rdGross = Object.values(t.rounds || {}).map((rd: MHTournRound) => rd.gross).filter(g => g > 0);
              const parTotal = (t.par || []).reduce((a: number, b: number) => a + b, 0);
              const tp = t.totalStrokes && parTotal ? t.totalStrokes - parTotal * nRds : null;
              const tpStr = fmtToPar(tp, "");
              const isoD = isoDate(t.startDate || "");
              const fmtD = isoD ? new Date(isoD + "T12:00:00").toLocaleDateString("pt-PT", { month: "short", year: "numeric" }) : (t.startDate || "");
              return (
                <tr key={t.tid} style={{ borderBottom: "1px solid var(--border-light)" }}>
                  <td style={{ padding: "4px 8px", fontWeight: 500 }}>{t.name}</td>
                  <td style={{ textAlign: "center", fontSize: 10, color: "var(--text-2)" }}>{t.ageGroup}</td>
                  <td style={{ textAlign: "center", fontWeight: 700,
                    color: t.place <= 3 && t.place > 0 ? "var(--color-good-dark)" : "var(--text-2)" }}>
                    {t.place > 0 ? `${t.place}º` : "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {t.totalStrokes > 0 ? (
                      <>
                        <span style={{ fontWeight: 600 }}>{t.totalStrokes}</span>
                        {tpStr && <span style={{ color: tpColorMH(tp), marginLeft: 3, fontSize: 10 }}>({tpStr})</span>}
                      </>
                    ) : "—"}
                  </td>
                  <td style={{ textAlign: "center", fontSize: 10, color: "var(--text-3)" }}>
                    {rdGross.length > 0 ? rdGross.join(" + ") : "—"}
                  </td>
                  <td style={{ fontSize: 10, color: "var(--text-3)" }}>{fmtD}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════
   RIVAL DETAIL
   ═══════════════════════════════════ */
function RivalDetail({ playerName }: { playerName: string }) {
  const rivals = useRivals();
  const memberHist = useMH();
  const navigate = useNavigate();
  const rival = rivals.find(d => d.n === playerName);
  // Usar o Manuel do array merged (tem wjgc25_b1011 e outros tids auto)
  const manuelMerged = rivals.find(d => d.isM) ?? manuel;

  // Member history lookup for this player (used for DOB estimation + history table)
  const mhPlayer = React.useMemo(() => {
    if (!memberHist) return null;
    const key = playerName.toLowerCase().trim().replace(/\s+/g, " ");
    return (Object.values(memberHist.jogadores) as MHPlayer[]).find(
      m => m.name && m.name.toLowerCase().trim().replace(/\s+/g, " ") === key
    ) ?? null;
  }, [memberHist, playerName]);
  const bjgtCard = FIELD_CARDS.find(c => c.name === playerName);
  const lbEntry = FIELD_2025.leaderboard.find(p => p.name === playerName);
  const wjgcCard = findCard(WJGC26_CARDS, playerName);

  const eowagr25Card = findCard(EOWAGR25_CARDS, playerName);
  const wjgc26_1213Card = findCard(WJGC26_1213_CARDS, playerName);

  const [expandedTourns, setExpandedTourns] = useState<Set<string>>(() => new Set());

  // Reset expanded state whenever player changes
  React.useEffect(() => {
    setExpandedTourns(new Set());
  }, [playerName]);

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
  const tr = rival ? (getTrend as (p: RivalPlayer) => string | null)(rival) : null;
  const played = rival ? nPlayed(rival) : 0;
  const isManuel = rival?.isM;

  // Tournament results: T manual (com scorecard) + auto-loaded (sem scorecard)
  const manualTournIds = new Set(T.map(t => t.id));

  // Mapa explícito: auto tid → manual T id que o cobre
  // Necessário quando o id manual não deriva trivialmente do auto tid
  const AUTO_COVERED_BY: Record<string,string> = {
    // brjgt25 (manual) é coberto pelo tid específico do escalão
    "wjgc25_b89":    "brjgt25",
    "wjgc25_b1011":  "brjgt25",
    "wjgc25_b1213":  "brjgt25",
    // wjgc26_1213 (manual) é coberto pelo auto tid
    "wjgc26_b1213":  "wjgc26_1213",
    // Venice 2025
    "venice25_b11":  "venice25",
    "venice25_b12":  "venice25",
    "venice25_b9":   "venice25",
    "venice25_b10":  "venice25",
    // Rome 2025
    "rome25_b11":    "rome25",
    "rome25_b12":    "rome25",
    "rome25_b9":     "rome25",
    "rome25_b10":    "rome25",
    // Doral 2025
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
      return !!((rival?.r[manualTid]?.rd?.length ?? 0) > 0);
    }
    // Fallback genérico: strip _b\d+ suffix
    const base = tid.replace(/_b\d+$/, "");
    if (manualTournIds.has(base)) return !!((rival?.r[base]?.rd?.length ?? 0) > 0);
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
        found || ((rival.r[atid] as any)?.ageGroup ?? null), null)
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
        return { t: fakeDef, res, hasCard: !!autoCard, autoCard, ageGroup: ((res as any).ageGroup ?? null) as string | null, isAuto: true };
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

  // All scorecards start closed — user expands manually
  // Double-check: nPlayed(rival) deve bater com playedDedup
  if (rival && import.meta.env.DEV && nPlayed(rival) !== playedDedup) {
    console.warn(`[RivaisIntl] count mismatch for ${rival.n}: nPlayed=${nPlayed(rival)} vs tournResults=${playedDedup}`);
  }

  const allRds = tournResults.flatMap(x => x.res.rd.filter((r): r is number => r != null && r > 0));
  const completedResults = tournResults.filter(x => x.res.tp != null);
  const bestTp = completedResults.length ? Math.min(...completedResults.map(x => x.res.tp!)) : null;
  const _bestRd = allRds.length ? Math.min(...allRds) : null;
  void _bestRd;
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
  const sm = (arr: readonly number[], f: number, t: number) => arr.slice(f, t).reduce((a, b) => a + b, 0);

  const SubCell = ({ gross, parVal, cls }: { gross: number; parVal: number; cls: string }) => {
    const tp = gross - parVal;
    return <td className={`${cls} fw-700`}>{gross}<span className={`sc-topar ${toParClass(tp)}`}>{fmtSign(tp)}</span></td>;
  };
  const vpFrontM = VP_M.slice(0, 9).reduce((a, b) => a + b, 0);
  const vpBackM  = VP_M.slice(9).reduce((a, b) => a + b, 0);
  const vpTotalM = vpFrontM + vpBackM;

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
  const MetrosRow = () => (
    <tr className="meta-row">
      <td className="row-label fs-10 c-text-3">m</td>
      {VP_M.slice(0, 9).map((m, i) => <td key={i} className="fs-10 c-text-3">{m}</td>)}
      <td className="col-out fs-10 c-text-3">{vpFrontM}</td>
      {VP_M.slice(9).map((m, i) => <td key={i + 9} className="fs-10 c-text-3">{m}</td>)}
      <td className="col-in fs-10 c-text-3">{vpBackM}</td>
      <td className="col-total fs-10 c-text-3">{vpTotalM}</td>
    </tr>
  );
  const SIRow = () => (
    <tr className="meta-row">
      <td className="row-label fs-10">SI</td>
      {VP_SI.slice(0, 9).map((s, i) => <td key={i}>{s}</td>)}
      <td className="col-out" />
      {VP_SI.slice(9).map((s, i) => <td key={i + 9}>{s}</td>)}
      <td className="col-in" /><td className="col-total" />
    </tr>
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
      <div style={{ marginBottom: 20 }}>
        {/* Row 1: name + rank + trend */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 22 }}>{flag}</span>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "var(--text)" }}>{playerName}</h2>
          {rank != null && (
            <span className={`sidebar-rank ${rank <= 3 ? "sidebar-rank-top3" : rank <= 10 ? "sidebar-rank-top10" : "sidebar-rank-rest"}`}
              style={{ fontSize: 12, padding: "2px 8px" }}>
              #{rank}/{totalRanked}
            </span>
          )}
          {tr && <span style={{ fontSize: 15, fontWeight: 700, color: TR_I[tr as keyof typeof TR_I].c }}>{TR_I[tr as keyof typeof TR_I].i}</span>}
          {rival?.up.map(u => {
            const up = UP.find(x => x.id === u);
            return up ? <span key={u} className="p p-sm" style={{ background: "var(--bg-success-strong)", color: "var(--color-good-dark)", fontSize: 11 }}>▲ {up.short}</span> : null;
          })}
          {/* USKids link — far right */}
          {!isManuel && (
            <button
              onClick={() => navigate("/uskids", { state: { rival: playerName } })}
              className="p p-filter p-sm"
              style={{ marginLeft: "auto", fontSize: 11 }}
              title="Ver encontros e histórico USKids"
            >
              🏌️ USKids →
            </button>
          )}
        </div>

        {/* Row 2: country · dob · stats — spread across full width */}
        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: "var(--text-2)" }}>
          {rival && !isManuel && (
            <span style={{ fontWeight: 500 }}>{rival.co}</span>
          )}
          {isManuel && <span className="p p-outline p-sm">REF</span>}

          {/* DOB */}
          {rival && (() => {
            const d = computeDobInfo(rival, mhPlayer);
            if (!d.exact && d.rangeStr === "?") return null;
            if (d.exact) {
              return (
                <span style={{ color: "var(--color-good-dark)", fontWeight: 600 }}
                  title={`Data de nascimento exacta: ${d.dobStr}`}>
                  🎂 {d.ageStr} · {d.dobStr}
                </span>
              );
            }
            const spanDays = d.rangeMin && d.rangeMax
              ? Math.round((d.rangeMax.getTime() - d.rangeMin.getTime()) / 86400000) : 999;
            const col = spanDays <= 60  ? "var(--color-good-dark)"
                      : spanDays <= 180 ? "var(--text-2)" : "var(--text-3)";
            const icon = spanDays <= 60 ? "🎯" : "📅";
            return (
              <span style={{ color: col }} title={`Estimativa · janela ${spanDays}d`}>
                {icon} {d.ageStr} · ~{d.rangeStr}
              </span>
            );
          })()}

          {/* Stats pills */}
          {played > 0 && <>
            <span style={{ color: "var(--text-3)" }}>·</span>
            <span><strong style={{ fontWeight: 700, color: "var(--text)", fontSize: 14 }}>{played}</strong> torneios</span>
            <span><strong style={{ fontWeight: 700, color: "var(--text)", fontSize: 14 }}>{roundsDedup}</strong> rondas</span>
          </>}
          {bestTp != null && <>
            <span style={{ color: "var(--text-3)" }}>·</span>
            <span>melhor
              <strong style={{ fontWeight: 700, color: tpColorDark(bestTp), fontSize: 14, marginLeft: 4 }}>{fmtToPar(bestTp)}</strong>
            </span>
          </>}
          {avgRd != null && (
            <span>avg
              <strong style={{ fontWeight: 700, color: "var(--text)", fontSize: 14, marginLeft: 4 }}>{avgRd.toFixed(1)}</strong>
            </span>
          )}
        </div>
      </div>

      {/* ── H2H vs Manuel ── */}
      {(() => {
        if (!rival || isManuel) return null;
        const rivalHidden = hiddenTids(rival);
        const manuelHidden = hiddenTids(manuelMerged);
        const sharedTids = Object.keys(rival.r).filter(tid => {
          if (rivalHidden.has(tid) || manuelHidden.has(tid)) return false;
          const m = manuelMerged?.r[tid];
          const r = rival.r[tid];
          return typeof m?.p === "number" && typeof r?.p === "number";
        });
        if (sharedTids.length === 0) return null;
        const wins = sharedTids.filter(tid => (manuelMerged.r[tid].p as number) < (rival.r[tid].p as number)).length;
        const losses = sharedTids.filter(tid => (manuelMerged.r[tid].p as number) > (rival.r[tid].p as number)).length;
        const draws = sharedTids.length - wins - losses;
        const rivalShortName = playerName.split(" ").slice(-1)[0];
        return (
          <>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 8 }}>
              Head-to-Head · {sharedTids.length} torneios juntos
            </div>
            {/* Bar */}
            <div style={{ display: "flex", height: 18, borderRadius: 4, overflow: "hidden", gap: 2, marginBottom: 8 }}>
              {wins  > 0 && <div style={{ flex: wins,  background: "var(--color-good-dark,#15803d)" }} title={`Manuel ganhou: ${wins}`} />}
              {draws > 0 && <div style={{ flex: draws, background: "var(--border,#d1d5db)" }}          title={`Empates: ${draws}`} />}
              {losses> 0 && <div style={{ flex: losses,background: "var(--color-danger,#dc2626)" }}    title={`${rivalShortName} ganhou: ${losses}`} />}
            </div>
            {/* Legend */}
            <div style={{ display: "flex", gap: 16, fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--color-good-dark,#15803d)", display: "inline-block" }} />
                <strong style={{ color: "var(--color-good-dark)", fontWeight: 700, fontSize: 14 }}>{wins}</strong>
                <span style={{ color: "var(--text-3)" }}>Vitórias Manuel</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--border)", display: "inline-block" }} />
                <strong style={{ color: "var(--text-2)", fontWeight: 700, fontSize: 14 }}>{draws}</strong>
                <span style={{ color: "var(--text-3)" }}>Empates</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--color-danger,#dc2626)", display: "inline-block" }} />
                <strong style={{ color: "var(--color-danger)", fontWeight: 700, fontSize: 14 }}>{losses}</strong>
                <span style={{ color: "var(--text-3)" }}>Vitórias {rivalShortName}</span>
              </span>
            </div>
          </div>
            {/* Tabela de encontros */}
            <div className="scroll-x mt-10">
              <table className="dtable" style={{ width: "100%", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "4px 8px" }}>Torneio</th>
                    <th style={{ textAlign: "center", width: 70 }}>Escalão</th>
                    <th style={{ textAlign: "center", width: 80 }}>Manuel</th>
                    <th style={{ textAlign: "center", width: 80 }}>{rivalShortName}</th>
                    <th style={{ textAlign: "center", width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sharedTids
                    .map(tid => {
                      const info = getTournInfo(tid);
                      const mRes = manuelMerged.r[tid];
                      const rRes = rival.r[tid];
                      const mPos = mRes.p as number, rPos = rRes.p as number;
                      const manWon = mPos < rPos, rivalWon = rPos < mPos;
                      return { tid, info, mRes, rRes, mPos, rPos, manWon, rivalWon };
                    })
                    .sort((a, b) => (b.info.dateExact ?? b.info.date).localeCompare(a.info.dateExact ?? a.info.date))
                    .map(({ tid, info, mRes, rRes, mPos, rPos, manWon, rivalWon }) => {
                      const ageGrp = (rRes as any).ageGroup ?? null;
                      return (
                        <tr key={tid} style={{ borderBottom: "1px solid var(--border-light)" }}>
                          <td style={{ padding: "5px 8px", fontWeight: 500 }}>
                            {info.name}
                            <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 6 }}>{info.date}</span>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {ageGrp && (
                              <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                                background: "var(--bg-info-subtle,#e0f2fe)", color: "var(--color-info-dark,#0369a1)",
                                border: "1px solid var(--color-info-light,#7dd3fc)" }}>
                                {ageGrp}
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: "center", fontWeight: 700, fontSize: 13,
                            color: manWon ? "var(--color-good-dark)" : rivalWon ? "var(--color-danger)" : "var(--text-3)" }}>
                            #{mPos}
                            {mRes.tp != null && <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 3 }}>({fmtToPar(mRes.tp)})</span>}
                          </td>
                          <td style={{ textAlign: "center", fontWeight: 700, fontSize: 13,
                            color: rivalWon ? "var(--color-good-dark)" : manWon ? "var(--color-danger)" : "var(--text-3)" }}>
                            #{rPos}
                            {rRes.tp != null && <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 3 }}>({fmtToPar(rRes.tp)})</span>}
                          </td>
                          <td style={{ textAlign: "center", fontSize: 14, fontWeight: 800,
                            color: manWon ? "var(--color-good-dark)" : rivalWon ? "var(--color-danger)" : "var(--text-3)" }}>
                            {manWon ? "✓" : rivalWon ? "✗" : "="}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}

      {/* ── KPIs + Distribuição de scoring ── */}
      {(() => {
        // ── Scoring distribution from scorecards ──
        let eagles=0,birdies=0,pars=0,bogeys=0,doubles=0,worse=0;
        // Par-type breakdown
        const byPar: Record<3|4|5, { sum: number; n: number; under: number }> = {
          3: {sum:0,n:0,under:0}, 4: {sum:0,n:0,under:0}, 5: {sum:0,n:0,under:0}
        };
        for (let k=0;k<allCardScores.length;k++) {
          const sc=allCardScores[k], pp=allCardPars[k];
          for (let i=0;i<18;i++) {
            const d=sc[i]-pp[i];
            if(d<=-2)eagles++; else if(d===-1)birdies++; else if(d===0)pars++; else if(d===1)bogeys++; else if(d===2)doubles++; else worse++;
            const p3 = pp[i] as 3|4|5;
            if (p3 === 3 || p3 === 4 || p3 === 5) {
              byPar[p3].sum += sc[i]; byPar[p3].n++;
              if (d < 0) byPar[p3].under++;
            }
          }
        }
        const holeTotal = allCardScores.length * 18;
        const hasScoring = holeTotal > 0;

        // ── Round stats ──
        const rdSorted = [...allRds].sort((a,b)=>a-b);
        const bestRd = rdSorted[0] ?? null;
        const worstRd = rdSorted[rdSorted.length-1] ?? null;
        const rdMean = avgRd;
        const rdStdDev = allRds.length > 1
          ? Math.sqrt(allRds.reduce((s,r) => s + (r - rdMean!)*(r - rdMean!), 0) / (allRds.length - 1))
          : null;
        const _subParRds = allRds.length > 0
          ? allRds.filter((_r) => {
              // need par per round — approximate with avg par from scorecards
              return false; // will use scorecard pars below
            }).length : 0;
        void _subParRds;
        // Rounds under par from scorecards (more accurate)
        let underParRounds = 0, overParRounds = 0;
        for (let k=0;k<allCardScores.length;k++) {
          const total = allCardScores[k].reduce((a,b)=>a+b,0);
          const parTotal = allCardPars[k].reduce((a,b)=>a+b,0);
          if (total < parTotal) underParRounds++;
          else if (total > parTotal) overParRounds++;
        }

        // ── vs Manuel ──
        const vsManuelDeltas: number[] = [];
        if (!isManuel && rival && manuelMerged) {
          for (const tid of Object.keys(rival.r)) {
            const rr = rival.r[tid]; const mm = manuelMerged.r[tid];
            if (rr?.tp != null && mm?.tp != null) vsManuelDeltas.push(rr.tp - mm.tp);
          }
        }
        const vsManuelAvg = vsManuelDeltas.length
          ? vsManuelDeltas.reduce((a,b)=>a+b,0) / vsManuelDeltas.length : null;

        if (playedDedup === 0 && !hasScoring) return null;

        return (
          <div style={{ marginBottom: 16 }}>
            {/* ── Stat KPIs ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8, marginBottom: 12 }}>
              {playedDedup > 0 && (
                <div className="kpi" style={{ padding: "8px 10px" }}>
                  <div className="kpi-lbl">Torneios</div>
                  <div className="kpi-val" style={{ fontSize: 22 }}>{playedDedup}</div>
                  <div className="kpi-sub">{roundsDedup} rondas</div>
                </div>
              )}
              {bestTp != null && (
                <div className="kpi" style={{ padding: "8px 10px" }}>
                  <div className="kpi-lbl">Melhor ±Par</div>
                  <div className="kpi-val" style={{ fontSize: 22, color: tpColorDark(bestTp) }}>{fmtToPar(bestTp)}</div>
                  <div className="kpi-sub">torneio</div>
                </div>
              )}
              {rdMean != null && (
                <div className="kpi" style={{ padding: "8px 10px" }}>
                  <div className="kpi-lbl">Média Ronda</div>
                  <div className="kpi-val" style={{ fontSize: 22 }}>{rdMean.toFixed(1)}</div>
                  {rdStdDev != null && <div className="kpi-sub">σ {rdStdDev.toFixed(1)}</div>}
                </div>
              )}
              {bestRd != null && (
                <div className="kpi" style={{ padding: "8px 10px" }}>
                  <div className="kpi-lbl">Melhor Ronda</div>
                  <div className="kpi-val" style={{ fontSize: 22, color: "var(--color-good-dark)" }}>{bestRd}</div>
                  {worstRd != null && worstRd !== bestRd && <div className="kpi-sub">pior {worstRd}</div>}
                </div>
              )}
              {allCardScores.length > 0 && (
                <div className="kpi" style={{ padding: "8px 10px" }}>
                  <div className="kpi-lbl">Sub-Par</div>
                  <div className="kpi-val" style={{ fontSize: 22, color: underParRounds > 0 ? "var(--color-good-dark)" : "var(--text-3)" }}>
                    {allCardScores.length > 0 ? `${Math.round(underParRounds/allCardScores.length*100)}%` : "—"}
                  </div>
                  <div className="kpi-sub">{underParRounds}/{allCardScores.length} rondas</div>
                </div>
              )}
              {vsManuelAvg != null && (
                <div className="kpi" style={{ padding: "8px 10px" }}>
                  <div className="kpi-lbl">vs Manuel</div>
                  <div className="kpi-val" style={{ fontSize: 22, color: vsManuelAvg > 0 ? "var(--color-good-dark)" : vsManuelAvg < 0 ? "var(--color-danger)" : "var(--text-3)" }}>
                    {fmtSign(Math.round(vsManuelAvg))}
                  </div>
                  <div className="kpi-sub">{vsManuelDeltas.length} torneios</div>
                </div>
              )}
            </div>

            {/* ── Scoring distribution — horizontal bar ── */}
            {hasScoring && (() => {
              const segs = [
                { key:"eagle",  n:eagles,  cls:"seg-eagle",  label:"Eagle+" },
                { key:"birdie", n:birdies, cls:"seg-birdie", label:"Birdie" },
                { key:"par",    n:pars,    cls:"seg-par",    label:"Par" },
                { key:"bogey",  n:bogeys,  cls:"seg-bogey",  label:"Bogey" },
                { key:"double", n:doubles, cls:"seg-double", label:"Duplo" },
                { key:"triple", n:worse,   cls:"seg-triple", label:"Triple+" },
              ].filter(s => s.n > 0);
              return (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", marginBottom: 5 }}>
                    Distribuição de scoring · {holeTotal} buracos
                  </div>
                  {/* Bar — uses same seg-* classes as scorecard segments */}
                  <div style={{ display: "flex", height: 16, borderRadius: 4, overflow: "hidden", gap: 1, marginBottom: 6 }}>
                    {segs.map(s => (
                      <div key={s.key} className={s.cls}
                        style={{ flex: s.n, minWidth: 2 }}
                        title={`${s.label}: ${s.n} (${(s.n/holeTotal*100).toFixed(0)}%)`} />
                    ))}
                  </div>
                  {/* Legend */}
                  <div style={{ display: "flex", gap: "6px 12px", flexWrap: "wrap" }}>
                    {segs.map(s => (
                      <span key={s.key} style={{ fontSize: 10, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 4 }}>
                        <span className={s.cls} style={{ width: 8, height: 8, borderRadius: 2, display: "inline-block", flexShrink: 0 }} />
                        {s.label} {(s.n/holeTotal*100).toFixed(0)}%
                        <span style={{ color: "var(--text-3)", fontSize: 9 }}>({s.n})</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── Par-type breakdown ── */}
            {hasScoring && (byPar[3].n > 0 || byPar[4].n > 0 || byPar[5].n > 0) && (() => {
              const parAvgs = ([3,4,5] as const).map(p => ({
                p, avg: byPar[p].n ? byPar[p].sum / byPar[p].n : null,
                n: byPar[p].n, under: byPar[p].under,
              })).filter(x => x.n > 0);
              return (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {parAvgs.map(({ p, avg, n, under }) => {
                    const diff = avg != null ? avg - p : null;
                    const col = diff == null ? "var(--text-3)"
                              : diff < 0 ? "var(--color-good-dark)"
                              : diff < 0.3 ? "var(--text-2)" : "var(--color-warn,#d97706)";
                    return (
                      <div key={p} className="kpi" style={{ flex: "1 1 80px", padding: "6px 10px", minWidth: 72 }}>
                        <div className="kpi-lbl">Par {p}</div>
                        <div className="kpi-val" style={{ fontSize: 18, color: col }}>
                          {avg != null ? avg.toFixed(2) : "—"}
                        </div>
                        <div className="kpi-sub">{Math.round(under/n*100)}% sub-par</div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* ── Cards de torneio ── */}
      {tournResults.map(({ t, res, hasCard, autoCard, ageGroup, isAuto: _isAuto }) => {
        const expanded = expandedTourns.has(t.id);
        const wOrd = getTournWeight(t.id);
        const stars = wOrd >= 1.3 ? "★★★★★" : wOrd >= 1.1 ? "★★★★" : wOrd >= 0.9 ? "★★★" : wOrd >= 0.6 ? "★★" : wOrd >= 0.4 ? "★" : null;
        const manuelRes = !isManuel ? manuelMerged?.r[t.id] : null;
        const vsM = manuelRes?.tp != null && res.tp != null ? res.tp - manuelRes.tp : null;
        const tpDisplay = res.tp != null ? fmtToPar(res.tp) : null;
        const totalRds = (res.rd.filter((r): r is number => r != null) as number[]).reduce((a: number, b: number) => a + b, 0);

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
              {/* Col 4: Rondas com trend */}
              <div className="d-flex gap-8" style={{ flexWrap: "wrap", alignItems: "center" }}>
                {(() => {
                  const rds = res.rd.filter((r: number|null) => r != null && r > 0) as number[];
                  // Trend arrow: compare last vs first round
                  const trend = rds.length >= 2 ? rds[rds.length-1] - rds[0] : null;
                  return (
                    <>
                      {rds.map((r: number, i: number) => (
                        <span key={i} className="fs-12 fw-600" style={{ color: tpColorDark(r - t.par, 5) }}>
                          R{i+1}: {r}
                        </span>
                      ))}
                      {trend != null && rds.length >= 2 && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, marginLeft: 2,
                          color: trend < -1 ? "var(--color-good-dark)"
                               : trend > 1  ? "var(--color-danger)"
                               : "var(--text-3)",
                        }} title={`${trend > 0 ? "+" : ""}${trend} pancadas da R1 para a última ronda`}>
                          {trend < -1 ? "▲" : trend > 1 ? "▼" : "●"}
                        </span>
                      )}
                    </>
                  );
                })()}
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
                        <MetrosRow />
                        <SIRow />
                        <FieldAvgRow />
                        <ParRow sep />
                        {bjgtCard.rounds.map((rd, i) => <GrossRow key={i} holes={rd as number[]} label={`R${i + 1}`} />)}
                        <GrossRow holes={bjgtCard.ecl as number[]} label="ECL" />
                        <VsFieldRow holes={bjgtCard.ecl as number[]} />
                      </tbody>
                    </table>
                  </div>
                )}
                {/* WJGC 2025: se não tem bjgtCard usa o autoCard (wjgc25_b1011) com dados VP */}
                {t.id === "brjgt25" && !bjgtCard && autoCard && (
                  <TournScorecard
                    par={autoCard.par.length === 18 ? autoCard.par as unknown as readonly number[] : VP_PAR as unknown as readonly number[]}
                    si={autoCard.si.length > 0 ? autoCard.si as unknown as readonly number[] : VP_SI as unknown as readonly number[]}
                    meters={autoCard.meters.length > 0 ? autoCard.meters as unknown as readonly number[] : VP_M as unknown as readonly number[]}
                    rounds={autoCard.rounds.map((sc, i) => ({ label: `R${i + 1}`, scores: sc }))}
                  />
                )}
                {t.id === "wjgc26" && wjgcCard && (
                  <TournScorecard par={WJGC26_PAR} si={WJGC26_SI} meters={WJGC26_M}
                    rounds={wjgcCard.rds.map((sc, i) => ({ label: `R${i + 1}`, scores: [...sc] }))} />
                )}

                {t.id === "eowagr25" && eowagr25Card && (
                  <TournScorecard par={EOWAGR25_PAR} si={EOWAGR25_SI} meters={EOWAGR25_M}
                    rounds={eowagr25Card.rds.map((sc, i) => ({ label: `R${i + 1}`, scores: [...sc] }))} />
                )}
                {t.id === "wjgc26_1213" && wjgc26_1213Card && (
                  <TournScorecard par={WJGC26_1213_PAR} si={WJGC26_1213_SI} meters={WJGC26_1213_M}
                    rounds={wjgc26_1213Card.rds.map((sc, i) => ({ label: `R${i + 1}`, scores: [...sc] }))} />
                )}
                {/* Auto-loaded scorecard — torneios auto E torneios manuais sem card dedicado (Venice, Rome, Doral…) */}
                {autoCard && (() => {
                  // Fallback metros por tid quando o JSON não os inclui
                  const METERS_FALLBACK: Record<string, readonly number[]> = {
                    // Venice — Frassanelle tee AMARELAS
                    venice25: VENICE_M, venice25_b9: VENICE_M, venice25_b10: VENICE_M,
                    venice25_b11: VENICE_M, venice25_b12: VENICE_M,
                    // EOWAGR — Le Touquet La Forêt
                    eowagr25: LT_FORET_M,
                    eowagr25_b78: LT_FORET_M, eowagr25_b910: LT_FORET_M, eowagr25_b1314: LT_FORET_M,
                    // Marco Simone — tees USKids (B11 como default, B12 para escalão 12)
                    marco26_b9: MS_USKIDS_M_B1011, marco26_b10: MS_USKIDS_M_B1011,
                    marco26_b11: MS_USKIDS_M_B1011, marco26_b12: MS_USKIDS_M_B12,
                    marco25_b9: MS_USKIDS_M_B1011, marco25_b10: MS_USKIDS_M_B1011,
                    marco25_b11: MS_USKIDS_M_B1011, marco25_b12: MS_USKIDS_M_B12,
                    // Doral — Golden Palm B10-11, Silver Fox B12-13
                    doral25_b1011: DORAL_GP_M_B1011, doral25_b89: DORAL_GP_M_B1011,
                    doral25_b1213: DORAL_SF_M_B1213,
                    doral24_b1011: DORAL_GP_M_B1011, doral24_b89: DORAL_GP_M_B1011,
                    doral24_b1213: DORAL_SF_M_B1213,
                  };
                  const fallbackM = METERS_FALLBACK[t.id];
                  const meters = autoCard.meters.length > 0
                    ? autoCard.meters as unknown as readonly number[]
                    : fallbackM;
                  return (
                    <TournScorecard
                      par={autoCard.par as unknown as readonly number[]}
                      si={autoCard.si.length > 0 ? autoCard.si as unknown as readonly number[] : undefined}
                      meters={meters}
                      rounds={autoCard.rounds.map((sc, i) => ({ label: `R${i + 1}`, scores: sc }))}
                    />
                  );
                })()}
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

      {/* ── Histórico USKids completo (member history) ── */}
      {(() => {
        if (!mhPlayer) return null;
        const mhTorneiosAll = Object.entries(mhPlayer.torneios)
          .map(([tid, t]) => ({ tid, ...(t as MHTournament) }))
          .filter(t => t.rounds && Object.keys(t.rounds).length > 0);
        if (mhTorneiosAll.length === 0) return null;
        return <MemberHistTable mhTorneios={mhTorneiosAll} memberId={mhPlayer.memberId} />;
      })()}
      {played === 0 && !lbEntry && (
        <EmptyState size="sm" message="Sem resultados registados ainda." />
      )}
    </>
  );
}



/* ═══════════════════════════════════
   PAGE COMPONENT
   ═══════════════════════════════════ */
function RivaisIntlContent() {
  const { rivals, loaded, progress } = useAutoRivals();
  const memberHist = useMemberHist();

  // Actualizar rankMap quando os rivais carregam e forçar re-render
  const [_rankVersion, setRankVersion] = React.useState(0);
  React.useEffect(() => {
    if (loaded) {
      const newMap = buildRankMap(rivals);
      Object.keys(rankMap).forEach(k => delete rankMap[k]);
      Object.assign(rankMap, newMap);
      totalRanked = Object.keys(rankMap).length;
      setRankVersion(v => v + 1);
    }
  }, [rivals, loaded]);

  const location = useLocation();
  const locationPlayer = (location.state as any)?.player as string | undefined;

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(
    locationPlayer ?? "Manuel Medeiros"
  );
  const md = useMasterDetail();
  const [showTable, setShowTable] = useState(false);

  const handleSelectPlayer = (name: string) => {
    setSelectedPlayer(name);
    setShowTable(false);
  };

  return (
    <RivalsCtx.Provider value={rivals}>
    <MemberHistCtx.Provider value={memberHist}>
    <div className="tourn-layout">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Lista" />
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
        <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
          <RivaisSidebar selected={selectedPlayer} onSelect={handleSelectPlayer} />
        </div>
        <div className="course-detail">
          {showTable ? (
            <RivaisDashboard onSelectPlayer={handleSelectPlayer} />
          ) : selectedPlayer ? (
            <RivalDetail playerName={selectedPlayer} />
          ) : (
            <div className="muted p-16">Selecciona um rival na lista à esquerda.</div>
          )}
        </div>
      </div>
    </div>
    </MemberHistCtx.Provider>
    </RivalsCtx.Provider>
  );
}

export default function RivaisIntlPage() {
  const [unlocked, setUnlocked] = useState(() => isCalUnlocked());
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  return <RivaisIntlContent />;
}
