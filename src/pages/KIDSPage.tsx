/**
 * RivaisIntlPage.tsx — Rivais Internacionais
 *
 * Dashboard comparativo de todos os rivais do Manuel
 * em torneios internacionais.
 */
import React, { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { useLocation } from "react-router-dom";
import { fmtToPar, fmtSign, MONTHS_PT, MONTHS_PT_FULL, isoDate, medal, sortArrow } from "../utils/format";
/* useSort movido para ./kids/H2HSortableTable.tsx */
import { FL } from "../utils/flagUtils";
import { getTrend, getAvgZ } from "../utils/mathUtils";
import { scClass, toParClass, tpColorDark } from "../utils/scoreDisplay";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar, ToolbarTitle, ToolbarSep } from "../ui/Toolbar";
import { RoundPill } from "../ui/PillBadge";
import { useMasterDetail } from "../hooks/useMasterDetail";
import EmptyState from "../ui/EmptyState";
import DetailHeader from "../ui/DetailHeader";
import KpiCard from "../ui/KpiCard";
import SidebarSectionTitle from "../ui/SidebarSectionTitle";
import { buildAutoRivals, normName, getScorecards, uskTournNames, uskFieldSizes } from "../data/KIDSdataLoader";
import { FIELD_2025, VP_PAR, VP_SI, VP_M, VP_WJGC26_PAR, VP_WJGC26_SI, VP_WJGC26_M, VP_ALFERINI_PAR, VP_ALFERINI_SI, VP_ALFERINI_M, LT_FORET_PAR, LT_FORET_SI, LT_FORET_M, MS_USKIDS_M_B1011, MS_USKIDS_M_B12, DORAL_GP_M_B1011, DORAL_SF_M_B1213, FIELD_CARDS } from "../data/rivalData";
import { MANUEL_KNOWN_TIDS } from "../constants/manuel";
import { TR_I } from "../constants/config";
import TournScorecard from "./kids/TournScorecard";
import H2HSortableTable from "./kids/H2HSortableTable";
import type { ScRound, H2HConfronto, H2HSortKey } from "./kids/types";


/* ═══════════════════════════════════
   TYPES
   ═══════════════════════════════════ */
interface TournResult { p: number | "WD"; t: number | null; tp: number | null; rd: (number | null)[]; nholes?: number }
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

/** Para tids USKids (usk{tcode}_b{n}), devolve o URL signupanytime construído a partir do tcode.
 *  O tcode é o ID do torneio no signupanytime.com (mesmo número que aparece no URL do signupanytime). */
function getSignupanytimeUrl(tid: string): string | undefined {
  const m = tid.match(/^usk(\d+)_b\d+$/);
  if (!m) return undefined;
  return `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${m[1]}`;
}

/** Devolve os links de resultados para um tid:
 *  - signupanytimeUrl: sempre disponível para tids usk{tcode}_b{n}
 *  - uskidsUrl: quando existe no T[] ou AUTO_TOURN_META */
function getTournLinks(tid: string, manualUrl?: string): { signupanytimeUrl?: string; uskidsUrl?: string } {
  const uskidsUrl = manualUrl ?? AUTO_TOURN_META[tid]?.url;
  const signupanytimeUrl = getSignupanytimeUrl(tid);
  return { signupanytimeUrl, uskidsUrl };
}

/** @deprecated usar getTournLinks — mantido para não quebrar chamadas existentes */
function getTournUrl(tid: string, existingUrl?: string): string | undefined {
  return existingUrl ?? AUTO_TOURN_META[tid]?.url;
}

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
  nextBdayDays?: number; // dias para o próximo aniversário (só exact)
  nextAge?: number;      // próxima idade (só exact, quando countdown activo)
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
    const today = new Date();
    const a = ageAt(d, today);
    const nextBday = new Date(today.getFullYear(), d.getMonth(), d.getDate());
    if (nextBday <= today) nextBday.setFullYear(nextBday.getFullYear() + 1);
    const diffDays = Math.ceil((nextBday.getTime() - today.getTime()) / 86400000);
    const showCountdown = diffDays <= 90;
    return {
      exact: true, dob: d, dobStr: p.dob, rangeStr: p.dob, ageStr: `${a} anos`,
      nextBdayDays: showCountdown ? diffDays : undefined,
      nextAge: showCountdown ? a + 1 : undefined,
    };
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

/** Aliases de nomes conhecidos → nome canónico (normName).
 *  Usados no merge de autoPlayers com D[] para evitar duplicados quando
 *  a fonte de dados usa o nome completo em vez do nome curto. */
const PLAYER_ALIASES: Record<string, string> = {
  // Manuel — nome completo usado nalguns torneios USKids
  "manuel francisco medeiros": "manuel medeiros",
  "manuel goulartt medeiros":  "manuel medeiros",
  "manuel f medeiros":         "manuel medeiros",
};
function resolvePlayerKey(n: string): string {
  const norm = normName(n);
  return PLAYER_ALIASES[norm] ?? norm;
}

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
/** Converte dob FPG "YYYY-MM-DD" → "DD/MM/YYYY" esperado por RivalPlayer.dob */
function fpgDobToPt(d: string): string {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

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
        const key = resolvePlayerKey(ap.n);
        if (map.has(key)) {
          const ex = map.get(key)!;
          for (const [tid, res] of Object.entries(ap.r)) {
            if (!ex.r[tid] || res.rd.length > (ex.r[tid]?.rd.length ?? 0))
              ex.r[tid] = { ...res, p: res.p ?? "WD" } as TournResult;
          }
          // Enriquecer com dados FPG se disponíveis
          if (ap.fpgClub) (ex as any).fpgClub = ap.fpgClub;
          if (ap.dob && !ex.dob) ex.dob = fpgDobToPt(ap.dob);
          if (ap.co === "Portugal" && !ex.isM) ex.co = "Portugal";
          if (ap.memberId && !(ex as any).memberId) (ex as any).memberId = ap.memberId;
        } else {
          const convertedR: Record<string, TournResult> = Object.fromEntries(
            Object.entries(ap.r).map(([k, v]) => [k, { ...v, p: v.p ?? "WD" } as TournResult])
          );
          const newPlayer: RivalPlayer = { n: ap.n, co: ap.co, r: convertedR, up: [] };
          if (ap.fpgClub) (newPlayer as any).fpgClub = ap.fpgClub;
          if (ap.dob) newPlayer.dob = fpgDobToPt(ap.dob);
          if (ap.memberId) (newPlayer as any).memberId = ap.memberId;
          map.set(key, newPlayer);
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

/** Hook: carrega uskids-member-history-slim.json e transforma em MHData */
function useMemberHist() {
  const [mh, setMh] = React.useState<MHData | null>(null);
  React.useEffect(() => {
    fetch("/data/uskids-member-history-slim.json")
      .then(r => r.json())
      .then((slim: {
        torneios: Record<string, { name: string; startDate: string; holesPerRound: number; par: number[] | null }>;
        jogadores: Record<string, {
          name: string; country: string; ageGroup: string;
          torneios: Record<string, { ageGroup: string; place: number | null; rounds: Record<string, { gross: number; strokes?: number[] }> }>;
        }>;
      }) => {
        const jogadores: Record<string, MHPlayer> = {};
        for (const [mid, p] of Object.entries(slim.jogadores || {})) {
          const torneios: Record<string, MHTournament> = {};
          for (const [tcode, t] of Object.entries(p.torneios || {})) {
            const shared = slim.torneios?.[tcode];
            const rounds: Record<string, MHTournRound> = {};
            let totalStrokes = 0;
            for (const [rn, rd] of Object.entries(t.rounds || {})) {
              rounds[rn] = { gross: rd.gross };
              totalStrokes += rd.gross || 0;
            }
            torneios[tcode] = {
              name: shared?.name || "",
              startDate: shared?.startDate || "",
              par: shared?.par || undefined,
              ageGroup: t.ageGroup,
              place: t.place ?? 0,
              totalStrokes,
              rounds,
            };
          }
          jogadores[mid] = { memberId: mid, name: p.name, torneios };
        }
        setMh({ jogadores });
      })
      .catch(() => {});
  }, []);
  return mh;
}

// ── Scoring stats (pré-calculadas de uskids-player-scoring-stats.json) ──
interface ScoringStatsBp {
  avg: number; n: number; under: number;
}
interface ScoringStatsEntry {
  name: string;
  e: number; b: number; p: number; bo: number; d: number; w: number;
  tot: number; n: number; avg: number | null; best: number | null; upr: number;
  bp?: Record<string, ScoringStatsBp>;
}
interface ScoringStatsData {
  gerado_em: string;
  jogadores: Record<string, ScoringStatsEntry>;
}

/** Hook: carrega uskids-player-scoring-stats.json */
function useScoringStats() {
  const [stats, setStats] = React.useState<ScoringStatsData | null>(null);
  React.useEffect(() => {
    fetch("/data/uskids-player-scoring-stats.json")
      .then(r => r.json()).then(setStats).catch(() => {});
  }, []);
  return stats;
}


/** Extrai o ano de um dateExact (YYYY-MM-DD) ou de um texto de data ("Fev 2025") */
function yearOf(dateExact?: string, fallback?: string): number {
  if (dateExact) return parseInt(dateExact.slice(0, 4));
  return parseInt(fallback?.match(/(\d{4})/)?.[1] ?? "0");
}

/** ±par color — variante local intencional: retorna sempre cor (nunca undefined), usa dark variants para contraste em cards */
function tpColorMH(tp: number | null): string {
  if (tp == null) return "var(--text-3)";
  if (tp < 0) return "var(--color-good-dark)";
  if (tp === 0) return "var(--text-2)";
  return "var(--color-danger)";
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

/* ── Canonical tournament name (strips year, normalises) ── */
function tornCanonK(name: string): string {
  return name.toLowerCase()
    .replace(/\s*\d{4}$/g, "").replace(/\s*'\d{2}$/g, "")
    .replace(/[^a-z0-9]/g, "").trim();
}

/* ── Player type classification — adapta USKIDSPage ── */
function getPlayerType(rival: RivalPlayer): { label: string; bg: string; fg: string } | null {
  if (rival.isM) return null;
  const hidden = hiddenTids(rival);
  const positions = Object.entries(rival.r)
    .filter(([tid, r]) => !hidden.has(tid) && typeof r?.p === "number" && (r.p as number) > 0)
    .map(([, r]) => r.p as number);
  if (!positions.length) return null;
  const wins   = positions.filter(p => p === 1).length;
  const avgPos = positions.reduce((a, b) => a + b, 0) / positions.length;
  const pcts   = Object.entries(rival.r)
    .filter(([tid, r]) => !hidden.has(tid) && typeof r?.p === "number" && (r.p as number) > 0)
    .map(([tid, r]) => {
      const tDef  = T.find(t => t.id === tid);
      const fi    = tDef?.field ?? AUTO_TOURN_META[tid]?.field ?? 0;
      return fi > 0 ? Math.round((r.p as number) / fi * 100) : null;
    }).filter((v): v is number => v != null);
  const avgPct  = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const total   = nPlayed(rival);
  const years   = Object.keys(rival.r).map(tid => parseInt((getTournInfo(tid).dateExact ?? "0").slice(0, 4))).filter(y => y > 2010);
  const anosActivo = years.length ? Math.max(...years) - Math.min(...years) + 1 : 0;

  if (wins >= 3 && avgPos <= 4)                        return { label: "🏆 Elite",            bg: "var(--score-eagle)",    fg: "#fff" };
  if (wins >= 1 && avgPos <= 5)                        return { label: "⭐ Top Contender",     bg: "var(--medal-gold)",     fg: "#fff" };
  if (avgPos <= 8 && (avgPct == null || avgPct <= 25)) return { label: "🎯 Forte Competidor",  bg: "var(--color-good-dark)", fg: "#fff" };
  if (total >= 20 && anosActivo >= 4)                  return { label: "🔁 Assíduo",           bg: "var(--text-dark)",      fg: "#fff" };
  if (avgPos <= 12 && total >= 10)                     return { label: "✅ Consistente",        bg: "var(--accent)",         fg: "#fff" };
  return null;
}

/* ══════════════════════════════════════════════════════
   RIVALS CONTEXT — partilha o array de rivais (após
   auto-merge async) por todos os sub-componentes
   ══════════════════════════════════════════════════════ */
const RivalsCtx = React.createContext<RivalPlayer[]>(D);
function useRivals() { return React.useContext(RivalsCtx); }

const MemberHistCtx = React.createContext<MHData | null>(null);
function useMH() { return React.useContext(MemberHistCtx); }

const ScoringStatsCtx = React.createContext<ScoringStatsData | null>(null);
function useScoringStatsCtx() { return React.useContext(ScoringStatsCtx); }

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
/* TournScorecard extraído para ./kids/TournScorecard.tsx */

/* ── Scoring distribution pills ── */
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
    <span className="fs-10 ml-4" style={{ color, fontWeight: fw }} title={tooltip}>
      {icon} ~{info.rangeStr}
    </span>
  );
}

// Filtros de circuito para o toolbar (row 2)
const SIDEBAR_FILTERS = [
  { id: "all",       label: "Todos" },
  { id: "directos",  label: "⚔️ Directos" },
  { id: "usk_circ",  label: "🎯 Torneios USKids" },
  { id: "wjgc",     label: "⭐ WJGC/BJGT" },
  { id: "eowagr",   label: "EU Open" },
  { id: "euro_usk",  label: "🌍 USKids Euro" },
  { id: "doral",    label: "🇺🇸 Doral" },
  { id: "pt",       label: "🇵🇹 Nacional" },
];


function playerMatchesFilter(p: RivalPlayer, fids: Set<string>): boolean {
  if (fids.size === 0) return true;
  const tids = Object.keys(p.r);
  return [...fids].some(fid => {
    if (fid === "directos") return !p.isM && tids.some(t => {
      const base = t.replace(/_b\d+$/, "");
      return MANUEL_KNOWN_TIDS.has(t) || MANUEL_KNOWN_TIDS.has(base) ||
        t.startsWith("wjgc") || t.startsWith("brjgt") ||
        t.startsWith("eowagr") || t.startsWith("venice") ||
        t.startsWith("rome") || t.startsWith("doral") ||
        t.startsWith("gg") || t.startsWith("qdl") || t.startsWith("marco");
    });
    if (fid === "usk_circ") return !p.isM && tids.some(t => /^usk\d+_b\d+$/.test(t));
    if (fid === "wjgc")     return tids.some(t => t.startsWith("wjgc") || t.startsWith("brjgt"));
    if (fid === "eowagr")   return tids.some(t => t.startsWith("eowagr"));
    if (fid === "euro_usk") return tids.some(t =>
      t.startsWith("usk") || t.startsWith("venice") || t.startsWith("rome") ||
      t.startsWith("marco") || t.startsWith("elprat")
    );
    if (fid === "doral")    return tids.some(t => t.startsWith("doral"));
    if (fid === "pt")       return tids.some(t => t.startsWith("gg") || t.startsWith("qdl"));
    return true;
  });
}

function RivaisSidebar({ selected, onSelect, fids, q, paisFilter, tierFilter, minTorn, apenasDirectos, playerTypeMap }: {
  selected: string | null;
  onSelect: (n: string) => void;
  fids: Set<string>;
  q: string;
  paisFilter: string;
  tierFilter: string;
  minTorn: number;
  apenasDirectos: boolean;
  playerTypeMap: Map<string, ReturnType<typeof getPlayerType>>;
}) {
  const rivals = useRivals();
  const memberHist = useMH();

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

  const manuelMerged = rivals.find(d => d.isM);

  const h2hMap = useMemo<Map<string, { w: number; l: number; d: number }>>(() => {
    const m = new Map<string, { w: number; l: number; d: number }>();
    if (!manuelMerged) return m;
    for (const p of rivals) {
      if (p.isM) continue;
      const hidden = hiddenTids(p), mHidden = hiddenTids(manuelMerged);
      const shared = Object.keys(p.r).filter(tid => {
        if (hidden.has(tid) || mHidden.has(tid)) return false;
        return typeof manuelMerged.r[tid]?.p === "number" && typeof p.r[tid]?.p === "number";
      });
      if (!shared.length) continue;
      const w = shared.filter(tid => (manuelMerged.r[tid].p as number) < (p.r[tid].p as number)).length;
      const l = shared.filter(tid => (manuelMerged.r[tid].p as number) > (p.r[tid].p as number)).length;
      m.set(p.n, { w, l, d: shared.length - w - l });
    }
    return m;
  }, [rivals, manuelMerged]);

  // Lista filtrada + agrupamento directos / circuito
  const { directos, circuito } = useMemo(() => {
    let pl = rivals.filter(p => nPlayed(p) > 0 || p.isM);
    if (fids.size > 0) pl = pl.filter(p => playerMatchesFilter(p, fids));
    if (paisFilter) pl = pl.filter(p => p.co === paisFilter);
    if (tierFilter) pl = pl.filter(p => !p.isM && playerTypeMap.get(p.n)?.label.includes(tierFilter.split(" ")[0]));
    if (minTorn > 0) pl = pl.filter(p => p.isM || nPlayed(p) >= minTorn);
    if (q) { const ql = q.toLowerCase(); pl = pl.filter(p => p.n.toLowerCase().includes(ql) || p.co.toLowerCase().includes(ql)); }

    const sorted = [...pl].sort((a, b) => {
      if (a.isM) return -1; if (b.isM) return 1;
      const ra = rankMap[a.n] ?? 9999, rb = rankMap[b.n] ?? 9999;
      return ra - rb;
    });

    const dir: typeof sorted = [];
    const circ: typeof sorted = [];
    for (const p of sorted) {
      if (p.isM) { dir.unshift(p); continue; }
      const h = h2hMap.get(p.n);
      if (h && h.w + h.l + h.d > 0) dir.push(p);
      else if (!apenasDirectos) circ.push(p);
    }
    return { directos: dir, circuito: circ };
  }, [q, fids, paisFilter, tierFilter, minTorn, apenasDirectos, rivals, h2hMap, playerTypeMap]);

  const renderItem = (p: RivalPlayer) => {
    const flagEmoji = FL[p.co] || "🏳️";
    const rank = rankMap[p.n];
    const played = nPlayed(p);
    const isActive = selected === p.n;
    const h2h = h2hMap.get(p.n);
    const mhKey = p.n.toLowerCase().trim().replace(/\s+/g, " ");
    const mhCnt = mhCountSidebar.get(mhKey) ?? 0;
    const playerType = playerTypeMap.get(p.n);
    const hidden = hiddenTids(p);
    const bestTpVal = Object.entries(p.r).filter(([tid, r]) => !hidden.has(tid) && r?.tp != null).map(([, r]) => r.tp as number);
    const bestTp = bestTpVal.length ? Math.min(...bestTpVal) : null;
    const recordStr = h2h && (h2h.w + h2h.l + h2h.d) > 0
      ? [h2h.w > 0 ? `${h2h.w}V` : "", h2h.d > 0 ? `${h2h.d}E` : "", h2h.l > 0 ? `${h2h.l}D` : ""].filter(Boolean).join(" ")
      : null;
    const recordBg = h2h ? (h2h.w > h2h.l ? "var(--bg-success-subtle)" : h2h.l > h2h.w ? "var(--bg-danger-strong)" : "var(--bg-muted)") : "var(--bg-muted)";
    const recordCo = h2h ? (h2h.w > h2h.l ? "var(--color-good-dark)" : h2h.l > h2h.w ? "var(--color-danger-dark)" : "var(--text-3)") : "var(--text-3)";
    const accentColor = h2h ? (h2h.w > h2h.l ? "var(--color-teal)" : h2h.l > h2h.w ? "var(--color-danger)" : h2h.w + h2h.l + h2h.d > 0 ? "var(--accent)" : "var(--border)") : "var(--border)";
    return (
      <button key={p.n} className={`course-item${isActive ? " active" : ""}`}
        style={{ borderLeftColor: isActive ? accentColor : undefined, padding: "8px 10px 7px 12px" }}
        onClick={() => onSelect(p.n)}>

        {/* Linha 1: rank + flag + nome + nº torneios */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
          {rank != null ? (
            <span style={{ flexShrink: 0, fontSize: 10, minWidth: 18, height: 18, borderRadius: 4,
              background: rank <= 3 ? "var(--bg-topbar)" : rank <= 10 ? "var(--bg-warn-strong)" : "var(--bg-muted)",
              color: rank <= 3 ? "var(--text-inv)" : rank <= 10 ? "var(--color-warn-dark)" : "var(--text-3)",
              display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
              {rank}
            </span>
          ) : <span style={{ width: 18 }} />}
          <span className="fs-13 shrink-0">{flagEmoji}</span>
          <span style={{ flex: 1, fontSize: 12, fontWeight: isActive ? 700 : 600, color: "var(--text)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.n}
            {p.isM && <span className="p p-sm p-outline" style={{ marginLeft: 5 }}>REF</span>}
          </span>
          <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: isActive ? "var(--accent)" : "var(--text-3)" }}>
            {played}
          </span>
        </div>

        {/* Linha 2: player type + record + bestTp + mhCnt + upcoming */}
        <div className="gap-4 flex-wrap" style={{ display: "flex", alignItems: "center", paddingLeft: 23 }}>
          {playerType && !p.isM && (
            <span className="fs-10 fw-700" style={{ padding: "1px 5px", borderRadius: 10, background: playerType.bg, color: playerType.fg }}>
              {playerType.label}
            </span>
          )}
          {recordStr && (
            <span className="p p-sm fs-10"  style={{ background: recordBg, color: recordCo, padding: "1px 5px" }}>
              {recordStr}
            </span>
          )}
          {bestTp != null && (
            <span className="fw-700 fs-11" style={{ color: tpColorDark(bestTp) }}>
              {fmtToPar(bestTp)}
            </span>
          )}
          {mhCnt > 0 && <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600 }} title={`${mhCnt} torneios USKids`}>📊</span>}
          {(p as any).fpgClub && (
            <span style={{ fontSize: 9, color: "var(--color-good-dark)", fontWeight: 600, opacity: 0.85 }}
              title="Clube FPG">
              🏌️ {(p as any).fpgClub}
            </span>
          )}
          {p.up.length > 0 && <span style={{ color: "var(--color-good-dark)", fontWeight: 700, marginLeft: "auto" }}>▲</span>}
        </div>
      </button>
    );
  };

  const total = directos.length + circuito.length;

  return (
    <div className="flex-col" style={{ display: "flex", height: "100%" }}>
      {/* Lista agrupada — sem pesquisa nem filtros (estão no toolbar) */}
      <div className="flex-1" style={{ overflowY: "auto" }}>
        {/* Grupo ⚔️ Directos */}
        {directos.length > 0 && (
          <>
            <SidebarSectionTitle dark>⚔️ Directos ({directos.length})</SidebarSectionTitle>
            {directos.map((p, i) => renderItem(p))}
          </>
        )}
        {/* Grupo 🌍 Circuito */}
        {circuito.length > 0 && !apenasDirectos && (
          <>
            <SidebarSectionTitle dark color="var(--color-info-dark)">
              🎯 Torneios USKids ({circuito.length})
            </SidebarSectionTitle>
            {circuito.map((p, i) => renderItem(p))}
          </>
        )}
        {total === 0 && (
          <div style={{ padding: "16px 12px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
            Sem rivais com estes filtros
          </div>
        )}
      </div>

      <div style={{ padding: "5px 10px", borderTop: "1px solid var(--border-light)", fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
        {total} rivais · {totalRanked} com rank
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
      {label}{sortArrow(col, sortCol, sortDir)}
    </th>
  );

  return (
    <div className="mt-24 mb-16">
      <div className="h-sm mb-8" style={{ color: "var(--text-2)", display: "flex", alignItems: "center", gap: 8 }}>
        <span>📊 Histórico USKids · {mhTorneios.length} torneios</span>
        <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 400 }}>ID: {memberId}</span>
      </div>
      <div className="scroll-x">
        <table className="dtable w-full fs-12" >
          <thead>
            <tr>
              <ThS col="name"  label="Torneio"  className="ta-left"  style={{ padding: "4px 8px" }} />
              <th className="ta-c" style={{ width: 60 }}>Escalão</th>
              <ThS col="pos"   label="Pos"   className="ta-c"   style={{ width: 42 }} />
              <ThS col="total" label="Total" className="ta-c" style={{ width: 60 }} />
              <th className="ta-c" style={{ width: 70 }}>Rondas</th>
              <ThS col="date"  label="Data"  className="ta-left"  style={{ width: 70 }} />
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
                  <td className="ta-c">
                    {t.totalStrokes > 0 ? (
                      <>
                        <span className="fw-600">{t.totalStrokes}</span>
                        {tpStr && <span className="fs-10" style={{ color: tpColorMH(tp), marginLeft: 3 }}>({tpStr})</span>}
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
   EVOLUÇÃO — gráfico recharts normalizado
   ═══════════════════════════════════ */
type EvoMode = "tpr" | "pos";

/** Devolve nholes a partir dos dados do torneio. Usa o valor explícito do loader. */
function inferNholes(nholes: number | undefined, _ageGroup?: string | null): number {
  return (nholes !== undefined && nholes > 0) ? nholes : 18;
}

/** ±par por ronda normalizado para equivalente 18 buracos */
function tprNorm(tp: number | null, rounds: number, nholes: number): number | null {
  if (tp == null || rounds <= 0) return null;
  // Normaliza para equivalente de 18 buracos: tp_18h = tp * (18/nholes) / rounds
  return Math.round(tp * (18 / nholes) / rounds * 10) / 10;
}

function EvolucaoChart({
  tournResults, manuelResults,
}: {
  tournResults: { id: string; short: string; dateExact: string; tp: number | null; rounds: number; nholes?: number; field: number; pos: number | null }[];
  manuelResults: typeof tournResults;
}) {
  const [mode, setMode] = useState<EvoMode>("tpr");

  const sorted = useMemo(() => [...tournResults].sort((a, b) => a.dateExact.localeCompare(b.dateExact)), [tournResults]);

  const data = useMemo(() => sorted.map(t => {
    const mEntry = manuelResults.find(m => m.id === t.id);
    const nh = t.nholes ?? 18;
    const rivalVal = mode === "tpr"
      ? tprNorm(t.tp, t.rounds, nh)
      : (t.pos != null && t.field > 0 ? Math.round(t.pos / t.field * 100) : null);
    const manuelVal = mEntry
      ? (mode === "tpr"
          ? tprNorm(mEntry.tp, mEntry.rounds, mEntry.nholes ?? 18)
          : (mEntry.pos != null && mEntry.field > 0 ? Math.round(mEntry.pos / mEntry.field * 100) : null))
      : null;
    return { name: t.short + (nh === 9 ? "⁹" : ""), rival: rivalVal, manuel: manuelVal };
  }), [sorted, manuelResults, mode]);

  const hasManuel = data.some(d => d.manuel != null);
  const yFormat  = (v: number) => mode === "tpr" ? (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) : `${v}%`;

  return (
    <div className="mb-16">
      <div className="flex-between-mb6">
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>
          Evolução por torneio
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {(["tpr", "pos"] as EvoMode[]).map(m => (
            <button key={m}
              className={`p p-filter p-sm fs-10${mode === m ? " active" : ""}`}
              onClick={() => setMode(m)}>
              {m === "tpr" ? "±par/ronda" : "posição %"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 6 }}>
        {mode === "tpr"
          ? "±par/ronda equiv. 18h — torneios de 9 buracos são normalizados (⁹ no nome)"
          : "Posição relativa no field — independente do par e dimensão do torneio"}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--text-3)" }} />
          <YAxis reversed={mode === "pos"} tickFormatter={yFormat} tick={{ fontSize: 10, fill: "var(--text-3)" }} width={42} />
          <Tooltip
            formatter={(val: number, name: string) => [yFormat(val), name === "rival" ? "Jogador" : "Manuel"]}
            contentStyle={{ fontSize: 11, background: "var(--bg-card)", border: "1px solid var(--border)" }}
          />
          {hasManuel && <Legend formatter={v => v === "rival" ? "Jogador" : "Manuel"} wrapperStyle={{ fontSize: 11 }} />}
          <Line type="monotone" dataKey="rival" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4, fill: "var(--accent)" }} connectNulls />
          {hasManuel && (
            <Line type="monotone" dataKey="manuel" stroke="var(--color-info-light)" strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 3, fill: "var(--color-info-light)" }} connectNulls />
          )}
          {mode === "tpr" && <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 2" />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══════════════════════════════════
   TORNEIOS RECORRENTES
   ═══════════════════════════════════ */
function TorneiosRecorrentes({
  groups,
}: {
  groups: { canon: string; name: string; entries: { year: number; pos: number | null; tp: number | null; ageGroup: string | null }[] }[];
}) {
  if (!groups.length) return null;
  return (
    <div className="card mb-12"  style={{ padding: "12px 16px" }}>
      <div className="h-sm mb-8" style={{ color: "var(--text-2)" }}>
        Evolução no mesmo torneio · <span className="fw-400 fs-11">torneios com 2+ presenças</span>
      </div>
      <div className="gap-8" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {groups.map(g => {
          const hasPodium    = g.entries.some(e => e.pos != null && e.pos <= 3);
          const podiumBorder = g.entries.some(e => e.pos === 1) ? "var(--medal-gold)"
            : g.entries.some(e => e.pos === 2) ? "var(--medal-silver)"
            : g.entries.some(e => e.pos === 3) ? "var(--medal-bronze)" : undefined;
          return (
            <div key={g.canon} className="card" style={{ padding: "8px 12px", margin: 0,
              borderLeft: podiumBorder ? `3px solid ${podiumBorder}` : undefined }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 6,
                display: "flex", alignItems: "center", gap: 4 }}>
                {hasPodium && <span>{g.entries.some(e => e.pos === 1) ? "🏆" : g.entries.some(e => e.pos === 2) ? "🥈" : "🥉"}</span>}
                <span className="overflow-hidden flex-1" style={{ textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                <span className="muted fs-10 fw-400 shrink-0" >{g.entries.length}×</span>
              </div>
              <div style={{ display: "flex", gap: 3, alignItems: "center", overflowX: "auto" }}>
                {g.entries.map((e, i) => {
                  const prev  = g.entries[i - 1];
                  const delta = (prev && e.pos != null && prev.pos != null) ? e.pos - prev.pos : null;
                  const mdl = medal(e.pos ?? 0);
                  const bg    = e.pos === 1 ? "#fffbea" : e.pos === 2 ? "#f0f4ff" : e.pos === 3 ? "#fff4f0" : "var(--bg-detail)";
                  const bd    = e.pos === 1 ? "var(--medal-gold)" : e.pos === 2 ? "var(--medal-silver)" : e.pos === 3 ? "var(--medal-bronze)" : "var(--border-light)";
                  const tpStr = fmtToPar(e.tp);
                  return (
                    <React.Fragment key={i}>
                      {i > 0 && (
                        <span style={{ fontSize: 12, fontWeight: 900, flexShrink: 0,
                          color: delta != null && delta < 0 ? "var(--color-good-dark)"
                            : delta != null && delta > 0 ? "var(--color-danger-vivid)"
                            : "var(--text-3)" }}>
                          {delta != null && delta < 0 ? "↑" : delta != null && delta > 0 ? "↓" : "="}
                        </span>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
                        padding: "3px 5px", borderRadius: 4, background: bg, border: `1px solid ${bd}`, flexShrink: 0 }}>
                        <span style={{ fontSize: 9, color: "var(--text-3)", fontWeight: 500 }}>{e.year}</span>
                        <span style={{ fontSize: mdl ? 14 : 11, fontWeight: 900, lineHeight: 1,
                          color: e.pos === 1 ? "var(--color-warn-dark)" : e.pos != null && e.pos <= 3 ? "var(--medal-silver)" : "var(--text-3)" }}>
                          {mdl ?? (e.pos != null ? `#${e.pos}` : "—")}
                        </span>
                        {e.tp != null && <span style={{ fontSize: 9, fontWeight: 600,
                          color: (e.tp ?? 0) <= 0 ? "var(--color-good-dark)" : "var(--text-3)" }}>{tpStr}</span>}
                        {e.ageGroup && <span style={{ fontSize: 8, color: "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>{e.ageGroup}</span>}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════
   HEAD-TO-HEAD TABLE DETALHADA
   ═══════════════════════════════════ */
/* H2HSortableTable extraído para ./kids/H2HSortableTable.tsx */

function H2HTable({
  confrontos, playerName,
}: {
  confrontos: H2HConfronto[];
  playerName: string;
}) {
  if (!confrontos.length) return null;
  const firstName = playerName.split(" ")[0];
  const vitorias  = confrontos.filter(c => c.manPos < c.rivalPos).length;
  const derrotas  = confrontos.filter(c => c.manPos > c.rivalPos).length;
  const avgDifTp  = (() => {
    const difs = confrontos.filter(c => c.manTp != null && c.rivalTp != null).map(c => (c.rivalTp ?? 0) - (c.manTp ?? 0));
    return difs.length ? (difs.reduce((a, b) => a + b, 0) / difs.length).toFixed(1) : null;
  })();
  const avgManPos  = Math.round(confrontos.reduce((s, c) => s + c.manPos, 0) / confrontos.length);
  const avgRivPos  = Math.round(confrontos.reduce((s, c) => s + c.rivalPos, 0) / confrontos.length);

  return (
    <div className="card mb-12 overflow-hidden" >
      <div className="flex-wrap" style={{ padding: "12px 16px 8px", display: "flex", alignItems: "baseline", gap: 10 }}>
        <div className="h-sm" style={{ color: "var(--text-2)" }}>
          Head-to-head · {confrontos.length} confronto{confrontos.length !== 1 ? "s" : ""}
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: derrotas < vitorias ? "var(--color-danger-vivid)" : "var(--color-good-dark)" }}>
          {firstName} {derrotas}× vs Manuel {vitorias}×
        </span>
        <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: "auto" }}>
          Avg: {firstName} {avgRivPos}º · Manuel {avgManPos}º
          {avgDifTp != null && ` · Dif. ±par: ${parseFloat(avgDifTp) > 0 ? "+" : ""}${avgDifTp}`}
        </span>
      </div>
      <div className="scroll-x">
        <H2HSortableTable confrontos={confrontos} firstName={firstName} />
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
  const scoringStats = useScoringStatsCtx();
  // Debug mode: activar com ?debug=1 na URL (funciona em prod e dev)
  const debugMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
  const rival = rivals.find(d => d.n === playerName);
  // Usar o Manuel do array merged (tem wjgc25_b1011 e outros tids auto)
  const manuelMerged = rivals.find(d => d.isM) ?? manuel;

  // Scoring stats pré-calculadas para este jogador (do slim.json)
  const playerScoringStats = React.useMemo(() => {
    if (!scoringStats) return null;
    const key = normName(playerName);
    return scoringStats.jogadores[key] ?? null;
  }, [scoringStats, playerName]);

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

  // Lookup inverso: nome de torneio (normalizado) → id do T[] manual
  const T_BY_NAME = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of T) {
      // normalizar: minúsculas, sem acentos, sem anos
      const k = t.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
        .replace(/\s*\d{4}$/, "").replace(/\s+/g, " ").trim();
      m.set(k, t.id);
      // também indexar o nome completo com ano
      const k2 = t.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
        .replace(/\s+/g, " ").trim();
      m.set(k2, t.id);
    }
    return m;
  }, []);

  function autoIsCoveredByManual(tid: string): boolean {
    // 1. Mapa explícito (formato antigo → tid manual T[])
    if (tid in AUTO_COVERED_BY) {
      const manualTid = AUTO_COVERED_BY[tid];
      return !!((rival?.r[manualTid]?.rd?.length ?? 0) > 0);
    }
    // 2. Novo formato usk{tcode}_b{n} → verifica contra T[] por nome
    const uskMatch = tid.match(/^(usk\d+)_b\d+$/);
    if (uskMatch) {
      const info = uskTournNames.get(uskMatch[1]);
      if (info) {
        const normFull = info.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
          .replace(/\s+/g, " ").trim();
        const normBase = normFull.replace(/\s*\d{4}$/, "").trim();
        const manualTid = T_BY_NAME.get(normFull) ?? T_BY_NAME.get(normBase);
        if (manualTid) return !!((rival?.r[manualTid]?.rd?.length ?? 0) > 0);
      }
      return false;
    }
    // 3. Formato antigo não mapeado (ex: marco26_b11): verifica se existe tid completo com mesmo nome
    const autoNameInfo = AUTO_TOURN_NAMES[tid];
    if (autoNameInfo) {
      const normOld = autoNameInfo.name.toLowerCase().replace(/\s*\d{4}$/, "").trim();
      for (const rivalTid of Object.keys(rival?.r ?? {})) {
        const um = rivalTid.match(/^(usk\d+)_b\d+$/);
        if (!um) continue;
        const completoInfo = uskTournNames.get(um[1]);
        if (!completoInfo) continue;
        const normC = completoInfo.name.toLowerCase().replace(/\s*\d{4}$/, "").trim();
        if (normC === normOld && (rival!.r[rivalTid]?.rd?.length ?? 0) > 0) return true;
      }
    }
    // 4. Fallback: strip _b\d+ suffix
    const base = tid.replace(/_b\d+$/, "");
    if (manualTournIds.has(base)) return !!((rival?.r[base]?.rd?.length ?? 0) > 0);
    return false;
  }

  /** Procura scorecard auto para um tid manual — verifica formato antigo E novo (usk{tcode}_b{n}) por nome */
  function findAutoScorecard(manualTid: string) {
    // 1. Formato antigo (MANUAL_AUTO_TIDS)
    const oldCard = (MANUAL_AUTO_TIDS[manualTid] || []).reduce(
      (found: typeof autoScorecards[0] | null, atid) =>
        found || autoScorecards.find(sc => sc.tid === atid) || null, null
    );
    if (oldCard) return oldCard;
    // 2. Mesmo tid
    const exact = autoScorecards.find(sc => sc.tid === manualTid);
    if (exact) return exact;
    // 3. Novo formato: usk{tcode}_b{n} com mesmo nome de torneio
    const manualT = T.find(t => t.id === manualTid);
    if (manualT) {
      const nameNorm = manualT.name.toLowerCase().replace(/\s*\d{4}$/, "").trim();
      return autoScorecards.find(sc => {
        const m = sc.tid.match(/^(usk\d+)_b\d+$/);
        if (!m) return false;
        const info = uskTournNames.get(m[1]);
        if (!info) return false;
        return info.name.toLowerCase().replace(/\s*\d{4}$/, "").trim() === nameNorm;
      }) ?? null;
    }
    return null;
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
        const isKnownDedicated = ["brjgt25","wjgc26","eowagr25","wjgc26_1213"].includes(t.id);
        const dedicatedMissing =
          (t.id === "brjgt25" && !bjgtCard) ||
          (t.id === "wjgc26" && !wjgcCard) ||
          (t.id === "eowagr25" && !eowagr25Card) ||
          (t.id === "wjgc26_1213" && !wjgc26_1213Card);
        if (isKnownDedicated && !dedicatedMissing) return null;
        return findAutoScorecard(t.id);
      })(),
      hasCard: (() => {
        if (t.id === "brjgt25")     return !!bjgtCard      || !!findAutoScorecard("brjgt25");
        if (t.id === "wjgc26")      return !!wjgcCard      || !!findAutoScorecard("wjgc26");
        if (t.id === "eowagr25")    return !!eowagr25Card  || !!findAutoScorecard("eowagr25");
        if (t.id === "wjgc26_1213") return !!wjgc26_1213Card;
        return !!findAutoScorecard(t.id);
      })(),
      // ageGroup: primeiro dos MANUAL_AUTO_TIDS, depois usk{tcode}_b{n} por nome, depois fallback
      ageGroup: (() => {
        const fromOld = (MANUAL_AUTO_TIDS[t.id] || []).reduce((found: string | null, atid) =>
          found || ((rival.r[atid] as any)?.ageGroup ?? null), null);
        if (fromOld) return fromOld;
        const nameNorm = t.name.toLowerCase().replace(/\s*\d{4}$/, "").trim();
        for (const [rTid, rRes] of Object.entries(rival.r)) {
          const m = rTid.match(/^(usk\d+)_b\d+$/);
          if (!m) continue;
          const info = uskTournNames.get(m[1]);
          if (!info) continue;
          if (info.name.toLowerCase().replace(/\s*\d{4}$/, "").trim() !== nameNorm) continue;
          const ag = (rRes as any)?.ageGroup;
          if (ag) return ag;
        }
        return ageLabel(t.ageMin, t.ageMax);
      })() as string | null,
      isAuto: false,
    })),
    // 2. Torneios auto-loaded não presentes em T e não cobertos por T
    ...Object.entries(rival.r)
      .filter(([tid, res]) => {
        if (manualTournIds.has(tid) || autoIsCoveredByManual(tid)) return false;
        if (!res?.rd?.length) return false;
        return true;
      })
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
          intendedRounds: res.rd.length, url: getTournUrl(tid, autoMeta?.url),
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

  // ── Player type badge ──────────────────────────────────────────────────────
  const playerType = rival && !isManuel ? getPlayerType(rival) : null;

  // ── Dados para o gráfico de evolução ──────────────────────────────────────
  const evoRivalData = tournResults.map(({ t, res }) => ({
    id: t.id,
    short: t.short,
    dateExact: t.dateExact ?? t.date,
    tp: res.tp,
    rounds: res.rd.filter((r: number | null): r is number => r != null && r > 0).length,
    nholes: inferNholes((res as any).nholes, (res as any).ageGroup),
    field: t.field,
    pos: typeof res.p === "number" ? res.p : null,
  }));

  const evoManuelData = !isManuel ? (() => {
    const manTournResults = manuelMerged ? (() => {
      const hidden = hiddenTids(manuelMerged);
      return Object.entries(manuelMerged.r)
        .filter(([tid]) => !hidden.has(tid))
        .map(([tid, res]) => {
          const info = getTournInfo(tid);
          const tDef = T.find(t => t.id === tid);
          return {
            id: tid, short: info.short,
            dateExact: info.dateExact ?? info.date,
            tp: res.tp,
            rounds: (res.rd || []).filter((r: number | null): r is number => r != null && r > 0).length,
            nholes: inferNholes((res as any).nholes, (res as any).ageGroup),
            field: tDef?.field ?? AUTO_TOURN_META[tid]?.field ?? 0,
            pos: typeof res.p === "number" ? res.p : null,
          };
        });
    })() : [];
    return manTournResults;
  })() : [];

  // ── Torneios recorrentes ───────────────────────────────────────────────────
  const torneiosRecorrentes = useMemo(() => {
    const map = new Map<string, { year: number; pos: number | null; tp: number | null; ageGroup: string | null }[]>();
    for (const { t, res, ageGroup } of tournResults) {
      const canon = tornCanonK(t.name.replace(/\s*\d{4}$/, "").replace(/\s*'\d{2}$/, ""));
      if (!map.has(canon)) map.set(canon, []);
      const yr = yearOf(t.dateExact, t.date);
      if (yr <= 0) continue;
      map.get(canon)!.push({ year: yr, pos: typeof res.p === "number" ? res.p : null, tp: res.tp, ageGroup });
    }
    return [...map.entries()]
      .map(([canon, entries]) => {
        const nameEntry = tournResults.find(x => tornCanonK(x.t.name.replace(/\s*\d{4}$/, "").replace(/\s*'\d{2}$/, "")) === canon);
        const name = nameEntry ? nameEntry.t.name.replace(/\s*\d{4}$/, "").replace(/\s*'\d{2}$/, "") : canon;
        // Dedup por (year, ageGroup) mantendo melhor resultado
        const dedupMap = new Map<string, typeof entries[0]>();
        for (const e of entries) {
          const k = `${e.year}|${e.ageGroup}`;
          const ex = dedupMap.get(k);
          if (!ex || (e.pos != null && (ex.pos == null || e.pos < ex.pos))) dedupMap.set(k, e);
        }
        const deduped = [...dedupMap.values()].sort((a, b) => a.year - b.year);
        return { canon, name, entries: deduped };
      })
      .filter(g => g.entries.length >= 2)
      .sort((a, b) => b.entries.length - a.entries.length);
  }, [tournResults]);

  // ── H2H detalhado ──────────────────────────────────────────────────────────
  const confrontosH2H = useMemo<{ tid: string; tornName: string; ageGroup: string | null; manPos: number; rivalPos: number; manTp: number | null; rivalTp: number | null; year: number }[]>(() => {
    if (!rival || isManuel) return [];
    const hidden = hiddenTids(rival);
    const manHidden = hiddenTids(manuelMerged ?? rival);
    return tournResults
      .filter(({ t, res }) => {
        if (hidden.has(t.id) || manHidden.has(t.id)) return false;
        const mRes = manuelMerged?.r[t.id];
        return typeof res.p === "number" && typeof mRes?.p === "number";
      })
      .map(({ t, res, ageGroup }) => {
        const mRes = manuelMerged!.r[t.id];
        return {
          tid: t.id, tornName: t.name, ageGroup,
          manPos:  mRes.p as number, rivalPos: res.p as number,
          manTp:   mRes.tp,          rivalTp:  res.tp,
          year:    yearOf(t.dateExact, t.date),
        };
      })
      .sort((a, b) => b.year - a.year);
  }, [tournResults, rival, manuelMerged, isManuel]);

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
      <th className="hole-header ta-left">Buraco</th>
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
      <td className="col-out c-text-3">{vpFrontM}</td>
      {VP_M.slice(9).map((m, i) => <td key={i + 9} className="fs-10 c-text-3">{m}</td>)}
      <td className="col-in c-text-3">{vpBackM}</td>
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
          {i === 8 && <td className="col-out c-muted">{FH.slice(0, 9).reduce((a, x) => a + x.fAvg, 0).toFixed(1)}</td>}
        </React.Fragment>
      ))}
      <td className="col-in c-muted">{FH.slice(9).reduce((a, x) => a + x.fAvg, 0).toFixed(1)}</td>
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


  // ── Helpers de data ──────────────────────────────────────────────
  const fmtDM = (dateExact?: string, fallback?: string): string => {
    if (dateExact) {
      const d = new Date(dateExact + "T12:00:00");
      return `${d.getDate()} ${MONTHS_PT_FULL[d.getMonth()]}`;
    }
    return fallback?.replace(/\s+\d{4}$/, "") ?? "";
  };

  // ── Palmarès ─────────────────────────────────────────────────────
  const palmares = React.useMemo(() =>
    tournResults.filter(x => x.res.p === 1)
      .sort((a, b) => (b.t.dateExact ?? b.t.date).localeCompare(a.t.dateExact ?? a.t.date)),
  [tournResults]);

  // ── Tier badge ───────────────────────────────────────────────────
  const tierBadge = React.useMemo(() => {
    if (!rival || isManuel || played === 0) return null;
    const wins = palmares.length;
    const ps = tournResults.filter(x => typeof x.res.p === "number").map(x => x.res.p as number);
    const avgPos = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null;
    if (wins >= 3 && avgPos != null && avgPos <= 4)  return { label: "Elite",         icon: "🏆", cls: "seg-eagle"  };
    if (wins >= 1 && avgPos != null && avgPos <= 5)  return { label: "Top Contender", icon: "⭐", cls: "seg-birdie" };
    if (avgPos != null && avgPos <= 8 && played >= 5) return { label: "Forte",        icon: "🎯", cls: "seg-par"   };
    if (played >= 20)                                return { label: "Assíduo",       icon: "🔁", cls: "seg-bogey" };
    return null;
  }, [rival, isManuel, played, palmares, tournResults]);

  // ── H2H data ─────────────────────────────────────────────────────
  // h2hData deriva de confrontosH2H (tournResults deduplicado) para ser consistente com a tabela
  const h2hData = React.useMemo(() => {
    if (!rival || isManuel || !confrontosH2H.length) return null;
    const w = confrontosH2H.filter(c => c.rivalPos < c.manPos).length;
    const l = confrontosH2H.filter(c => c.rivalPos > c.manPos).length;
    return {
      tids: confrontosH2H.map(c => c.tid),
      wins: w, losses: l, draws: confrontosH2H.length - w - l,
    };
  }, [rival, isManuel, confrontosH2H]);

  // ── Scoring block ─────────────────────────────────────────────────
  const scoringBlock = React.useMemo(() => {
    let e=0,b=0,p=0,bo=0,d=0,w=0,tot=0,upr=0;
    const bp: Record<number,{sum:number;n:number;under:number}> = {3:{sum:0,n:0,under:0},4:{sum:0,n:0,under:0},5:{sum:0,n:0,under:0}};
    const ps = playerScoringStats;
    if (ps) {
      e=ps.e; b=ps.b; p=ps.p; bo=ps.bo; d=ps.d; w=ps.w; tot=ps.tot; upr=ps.upr;
      for (const pp of [3,4,5] as const) {
        const bpe = ps.bp?.[pp];
        if (bpe) bp[pp] = { sum: bpe.avg*bpe.n, n: bpe.n, under: bpe.under };
      }
    } else {
      for (let k=0;k<allCardScores.length;k++) {
        const sc=allCardScores[k], par=allCardPars[k];
        for (let i=0;i<18;i++) {
          const dv=sc[i]-par[i];
          if(dv<=-2)e++; else if(dv===-1)b++; else if(dv===0)p++; else if(dv===1)bo++; else if(dv===2)d++; else w++;
          const pp=par[i] as 3|4|5;
          if(pp===3||pp===4||pp===5){bp[pp].sum+=sc[i];bp[pp].n++;if(dv<0)bp[pp].under++;}
        }
        const gt=sc.reduce((a,v)=>a+v,0),pt=par.reduce((a,v)=>a+v,0);
        if(gt<pt)upr++;
      }
      tot=allCardScores.length*18;
    }
    return { e,b,p,bo,d,w,tot,upr,n:ps?.n??allCardScores.length,bp };
  }, [playerScoringStats, allCardScores, allCardPars]);

  // ── Std dev rondas ───────────────────────────────────────────────
  const rdStdDev = allRds.length > 1
    ? Math.sqrt(allRds.reduce((s,r)=>s+(r-avgRd!)*(r-avgRd!),0)/(allRds.length-1))
    : null;

  // ── DOB ──────────────────────────────────────────────────────────
  const dobInfo = React.useMemo(() => rival ? computeDobInfo(rival, mhPlayer) : null, [rival, mhPlayer]);

  // ── Todos os hooks foram chamados — safe para early return ────────
  if (!rival && !lbEntry) return (
    <DetailHeader>
      <div className="muted">
        {/^\d+$/.test(playerName)
          ? "⏳ A identificar jogador…"
          : `Sem dados para ${playerName}`}
      </div>
    </DetailHeader>
  );

  return (
    <>
      {/* ══ HERO CARD ══ */}
      <div className="card" style={{ marginBottom: 12, padding: 0, overflow: "hidden", border: "1.5px solid var(--border-light)" }}>

        {/* Faixa de identidade */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: "20px 22px 16px", borderBottom: "1px solid var(--border-light)" }}>

          {/* Flag grande */}
          <div className="shrink-0" style={{ fontSize: 56, lineHeight: 1, marginTop: 2 }}>{flag}</div>

          {/* Nome + pills + palmarès inline */}
          <div className="flex-1" style={{ minWidth: 0 }}>
            <div className="flex-wrap mb-8" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: "var(--text)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                {playerName}
              </div>
              {/* Player type badge (getPlayerType) */}
              {playerType && (
                <span className="fs-12 fw-800 shrink-0" style={{ padding: "3px 10px", borderRadius: 20, background: playerType.bg, color: playerType.fg, letterSpacing: "0.02em" }}>
                  {playerType.label}
                </span>
              )}
              {/* Scoring tier badge (se não há playerType) */}
              {!playerType && tierBadge && (
                <span style={{ fontSize: 12, fontWeight: 800, padding: "3px 10px", borderRadius: 20,
                  background: tierBadge.cls === "seg-eagle" ? "var(--score-eagle)"
                    : tierBadge.cls === "seg-birdie" ? "var(--medal-gold)"
                    : tierBadge.cls === "seg-par" ? "var(--color-good-dark)"
                    : "var(--text-dark)",
                  color: "#fff", letterSpacing: "0.02em", flexShrink: 0 }}>
                  {tierBadge.icon} {tierBadge.label}
                </span>
              )}
            </div>

            {/* Pills: país · trend · DOB · rank · ano activo */}
            <div className="flex-wrap mb-8" style={{ display: "flex", gap: 5, alignItems: "center" }}>
              {rival && !isManuel && <span className="p p-sm p-muted fs-12" >{rival.co}</span>}
              {rival && !isManuel && (rival as any).fpgClub && (
                <span className="p p-sm p-club fs-11"  title="Clube FPG">
                  🏌️ {(rival as any).fpgClub}
                </span>
              )}
              {isManuel && <span className="p p-outline p-sm">REF</span>}
              {rank != null && (
                <span className={`sidebar-rank fs-11 ${rank <= 3 ? "sidebar-rank-top3" : rank <= 10 ? "sidebar-rank-top10" : "sidebar-rank-rest"}`}
                  style={{ padding: "2px 7px" }}>#{rank}/{totalRanked}</span>
              )}
              {tr && <span className="fs-13 fw-700" style={{ color: TR_I[tr as keyof typeof TR_I].c }}>{TR_I[tr as keyof typeof TR_I].i}</span>}
              {rival?.up.map(u => { const up = UP.find(x => x.id === u); return up ? <span key={u} className="p p-sm" style={{ background: "var(--bg-success-strong)", color: "var(--color-good-dark)", fontSize: 11 }}>▲ {up.short}</span> : null; })}
              {dobInfo && (() => {
                if (!dobInfo.exact && dobInfo.rangeStr === "?") return null;
                const pillStyle = { background: "var(--bg-info)", color: "var(--color-info)", fontWeight: 700, fontSize: 12 };
                if (dobInfo.exact) return (
                  <>
                    <span className="p p-sm" style={pillStyle}>🎂 {dobInfo.ageStr}</span>
                    {dobInfo.nextBdayDays != null && (
                      <span className="p p-sm" style={{ ...pillStyle, background: "var(--bg-warn)" }}>
                        faz {dobInfo.nextAge} em {dobInfo.nextBdayDays}d
                      </span>
                    )}
                    <span className="p p-sm" style={{ ...pillStyle, fontWeight: 500 }}>{dobInfo.dobStr}</span>
                  </>
                );
                const days = dobInfo.rangeMin && dobInfo.rangeMax ? Math.round((dobInfo.rangeMax.getTime() - dobInfo.rangeMin.getTime()) / 86400000) : 999;
                return (
                  <>
                    <span className="p p-sm" style={pillStyle}>{days <= 60 ? "🎯" : "📅"} {dobInfo.ageStr}</span>
                    <span className="p p-sm" style={{ ...pillStyle, fontWeight: 500 }}>~{dobInfo.rangeStr}</span>
                  </>
                );
              })()}
            </div>

            {/* Palmarès compacto inline */}
            {palmares.length > 0 && (
              <div className="gap-4 flex-wrap" style={{ display: "flex", alignItems: "flex-start" }}>
                {palmares.slice(0, 5).map(({ t, res }) => {
                  const ag = (res as any).ageGroup as string | null;
                  const mdl2 = medal(res.p) ?? "🥉";
                  const bg = res.p === 1 ? "#fffbea" : res.p === 2 ? "#f0f4ff" : "#fff4f0";
                  const border = res.p === 1 ? "var(--medal-gold)" : res.p === 2 ? "var(--medal-silver)" : "var(--medal-bronze)";
                  const shortName = t.name.replace(/\s*\d{4}$/, "").replace(/\s*'\d{2}$/, "");
                  return (
                    <div key={t.id} title={`${t.name} ${yearOf(t.dateExact, t.date)}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 7px",
                        borderRadius: 6, background: bg, border: `1px solid ${border}`, flexShrink: 0 }}>
                      <span className="fs-13">{mdl2}</span>
                      <div style={{ lineHeight: 1.2 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-warn-dark)", maxWidth: 90,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortName}</div>
                        <div style={{ fontSize: 9, color: "var(--text-3)" }}>
                          {yearOf(t.dateExact, t.date)}{ag ? ` · ${ag}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {palmares.length > 5 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px",
                    borderRadius: 6, background: "var(--bg-warn-strong)", border: "1px solid var(--medal-gold)" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "var(--color-warn-dark)" }}>+{palmares.length - 5}</span>
                    <span className="fs-11">🏆</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* V/E/D vs Manuel — caixas coloridas */}
          {h2hData && !isManuel && (
            <div className="shrink-0 ta-c">
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 6,
                textTransform: "uppercase", letterSpacing: "0.06em" }}>vs Manuel</div>
              <div style={{ display: "flex", gap: 5, marginBottom: 5 }}>
                {([
                  { n: h2hData.wins,   bg: "var(--bg-success-strong)", co: "var(--color-good-dark)", l: "V" },
                  { n: h2hData.draws,  bg: "var(--bg-muted)",          co: "var(--text-2)",          l: "E" },
                  { n: h2hData.losses, bg: "var(--bg-danger-strong)",  co: "var(--color-danger-vivid)", l: "D" },
                ] as const).map(({ n, bg, co, l }) => (
                  <div key={l} className="ta-c" style={{ minWidth: 46, padding: "10px 6px", background: bg, borderRadius: 10 }}>
                    <div className="fw-900" style={{ fontSize: 28, color: co, lineHeight: 1 }}>{n}</div>
                    <div className="fs-11 fw-700" style={{ color: co, marginTop: 2, opacity: .75 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                {h2hData.tids.length} confronto{h2hData.tids.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </div>

        {/* KPI grid — separados por bordas, sem rounded cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }}>
          {[
            { v: String(playedDedup),                                                      l: "torneios",      accent: false,                           sub: roundsDedup > 0 ? `${roundsDedup} rondas` : null },
            palmares.length > 0 ? { v: `${palmares.length}`, l: "vitórias 🥇",            accent: true,                                                sub: null } : null,
            bestTp != null ? { v: fmtToPar(bestTp),           l: "melhor ±par",            accent: bestTp < 0,  sub: null } : null,
            avgRd != null  ? { v: avgRd.toFixed(1),            l: "média ronda",            accent: false,       sub: rdStdDev != null ? `σ ${rdStdDev.toFixed(1)}` : null } : null,
            scoringBlock.n > 0 ? { v: `${Math.round(scoringBlock.upr / scoringBlock.n * 100)}%`, l: "sub-par rondas", accent: scoringBlock.upr / scoringBlock.n > 0.3, sub: `${scoringBlock.upr}/${scoringBlock.n}` } : null,
          ].filter(Boolean).map((item, i, arr) => {
            const { v, l, accent, sub } = item!;
            return (
              <div key={l} style={{ padding: "14px 10px", textAlign: "center",
                borderRight: i < arr.length - 1 ? "1px solid var(--border-light)" : "none",
                borderTop: "1px solid var(--border-light)" }}>
                <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1,
                  color: accent ? "var(--color-good-dark)" : "var(--text)" }}>{v}</div>
                {sub && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{sub}</div>}
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 5, fontWeight: 500 }}>{l}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══ GRÁFICO DE EVOLUÇÃO ══ */}
      {evoRivalData.filter(d => d.tp != null && d.rounds > 0).length >= 2 && (
        <div className="card mb-12"  style={{ padding: "12px 16px" }}>
          <EvolucaoChart tournResults={evoRivalData} manuelResults={evoManuelData} />
        </div>
      )}

      {/* ══ PALMARÈS ══ */}
      {palmares.length > 0 && (
        <div className="card mb-12"  style={{ padding: "12px 16px" }}>
          <div className="h-sm mb-8" style={{ color: "var(--text-2)" }}>🥇 Palmarès · {palmares.length} {palmares.length===1?"vitória":"vitórias"}</div>
          <div className="gap-8" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))" }}>
            {palmares.map(({ t, res }) => {
              const mPos = manuelMerged?.r[t.id]?.p;
              const bateuManuel = mPos!=null && typeof mPos==="number" && typeof res.p==="number" && res.p < mPos;
              const ag = (res as any).ageGroup as string|null;
              const agNum = parseInt((ag?.match(/\d+/)??[])[0]??"0");
              const agCls = agNum<=10?"p-sub10":agNum<=12?"p-sub12":agNum<=14?"p-sub14":"p-sub18";
              return (
                <div key={t.id} style={{ border: "1.5px solid var(--medal-gold,#d97706)", borderRadius: 8, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center" }}>
                  <span className="shrink-0" style={{ fontSize: 32, lineHeight: 1 }}>🥇</span>
                  <div>
                    <div className="fs-13 fw-600">{t.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>
                      {fmtDM(t.dateExact, t.date)}
                      {ag && <span className={`p p-sm ${agCls}`} style={{ marginLeft: 5 }}>{ag}</span>}
                      {t.field>0 && <span style={{ marginLeft: 5, color: "var(--text-3)" }}>· {t.field>15?"⭐ ":""}{t.field} jog.</span>}
                    </div>
                    {res.tp!=null && <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-good-dark)", marginTop: 2 }}>{fmtToPar(res.tp)} ±par</div>}
                    {bateuManuel && <div style={{ fontSize: 10, color: "var(--medal-gold,#d97706)", marginTop: 2 }}>⚔️ ganhou ao Manuel (#{mPos})</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ TORNEIOS RECORRENTES ══ */}
      <TorneiosRecorrentes groups={torneiosRecorrentes} />

      {/* ══ SCORING DISTRIBUTION ══ */}
      {scoringBlock.tot > 0 && (() => {
        const segs = [
          { key:"eagle",  n:scoringBlock.e,  cls:"seg-eagle",  label:"Eagle+", circle:true  },
          { key:"birdie", n:scoringBlock.b,  cls:"seg-birdie", label:"Birdie",  circle:true  },
          { key:"par",    n:scoringBlock.p,  cls:"seg-par",    label:"Par",     circle:false },
          { key:"bogey",  n:scoringBlock.bo, cls:"seg-bogey",  label:"Bogey",   circle:false },
          { key:"double", n:scoringBlock.d,  cls:"seg-double", label:"Duplo",   circle:false },
          { key:"triple", n:scoringBlock.w,  cls:"seg-triple", label:"Triple+", circle:false },
        ].filter(s=>s.n>0);
        const tot = scoringBlock.tot;
        const parAvgs = ([3,4,5] as const).map(pp=>({
          pp, n:scoringBlock.bp[pp].n,
          avg:scoringBlock.bp[pp].n?scoringBlock.bp[pp].sum/scoringBlock.bp[pp].n:null,
          under:scoringBlock.bp[pp].under,
        })).filter(x=>x.n>0);
        return (
          <div className="card mb-12"  style={{ padding: "12px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", marginBottom: 6 }}>
              Distribuição de scoring · {tot} buracos
            </div>
            {/* Barra — par é branco/transparente */}
            <div style={{ display: "flex", height: 16, borderRadius: 4, overflow: "hidden", gap: 1, marginBottom: 6, background: "var(--bg)" }}>
              {segs.map(s => (
                <div key={s.key} className={s.key==="par"?"":""+s.cls}
                  style={{ flex: s.n, minWidth: 2, background: s.key==="par"?"#fff":undefined }}
                  title={`${s.label}: ${(s.n/tot*100).toFixed(0)}%`} />
              ))}
            </div>
            {/* Legenda */}
            <div style={{ display: "flex", gap: "5px 12px", flexWrap: "wrap", marginBottom: parAvgs.length>0?10:0 }}>
              {segs.map(s => (
                <span key={s.key} style={{ fontSize: 10, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 4 }}>
                  <span className={s.key==="par"?"":s.cls}
                    style={{ width:8, height:8, display:"inline-block", flexShrink:0,
                      borderRadius: s.circle?"50%":2,
                      background: s.key==="par"?"#fff":undefined,
                      border: s.key==="par"?"1px solid var(--border)":undefined }} />
                  {s.label} {(s.n/tot*100).toFixed(0)}%
                  <span style={{ color:"var(--text-3)", fontSize:9 }}>({s.n})</span>
                </span>
              ))}
            </div>
            {/* Par 3 / 4 / 5 */}
            {parAvgs.length>0 && (
              <div className="gap-8 flex-wrap" style={{ display: "flex" }}>
                {parAvgs.map(({ pp, avg, n, under }) => {
                  const diff = avg!=null?avg-pp:null;
                  const col = diff==null?"var(--text-3)":diff<0?"var(--color-good-dark)":diff<0.3?"var(--text-2)":"var(--color-warn)";
                  return (
                    <KpiCard key={pp} label={`Par ${pp}`} value={avg!=null?avg.toFixed(2):"—"} sub={`${Math.round(under/n*100)}% sub-par`} color={col} style={{ flex:"1 1 80px", padding:"6px 10px", minWidth:72 }} />
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ══ LISTA DE TORNEIOS ══ */}
      {tournResults.length > 0 && (() => {
        let lastYear = 0;
        return (
          <div className="card mb-12 overflow-hidden" >
            {tournResults.map(({ t, res, hasCard, autoCard, ageGroup }) => {
              const expanded    = expandedTourns.has(t.id);
              const pos         = typeof res.p==="number" ? res.p : null;
              const mdl3        = pos != null ? medal(pos) : null;
              const nholes      = inferNholes((res as any).nholes, ageGroup);
              const is9h        = nholes === 9;
              const tpDisplay   = res.tp!=null ? fmtToPar(res.tp) : null;
              const rds         = res.rd.filter((r:number|null):r is number => r!=null && r>0);
              const topPct      = pos!=null && t.field>0 ? Math.round(pos/t.field*100) : null;
              const manuelRes   = !isManuel ? manuelMerged?.r[t.id] : null;
              const manuelEsteve = manuelRes!=null;
              const manuelPos   = typeof manuelRes?.p==="number" ? manuelRes.p : null;
              const isLarge     = t.field>15;
              const thisYear    = yearOf(t.dateExact, t.date);
              const showYrSep   = thisYear>0 && thisYear!==lastYear;
              if (thisYear>0) lastYear = thisYear;
              const agNum = parseInt((ageGroup?.match(/\d+/)??[])[0]??"0");
              const agCls = agNum<=10?"p-sub10":agNum<=12?"p-sub12":agNum<=14?"p-sub14":"p-sub18";
              const wOrd  = getTournWeight(t.id);
              const stars = wOrd>=1.3?"★★★★★":wOrd>=1.1?"★★★★":wOrd>=0.9?"★★★":wOrd>=0.6?"★★":wOrd>=0.4?"★":null;
              const trend = rds.length>=2 ? rds[rds.length-1]-rds[0] : null;

              return (
                <React.Fragment key={t.id}>
                  {/* Separador de ano */}
                  {showYrSep && (
                    <div style={{ padding:"4px 14px", fontSize:11, fontWeight:600, color:"var(--text-2)",
                      background:"var(--bg-muted)", borderBottom:"1px solid var(--border-light)",
                      borderTop: lastYear>0?"1px solid var(--border-light)":undefined }}>
                      {thisYear}
                    </div>
                  )}

                  {/* Linha do torneio */}
                  <div style={{ display:"grid", gridTemplateColumns:"40px 1fr auto auto auto auto",
                    alignItems:"center", gap:10, padding:"8px 14px",
                    borderBottom:expanded?"none":"1px solid var(--border-light)" }}>

                    {/* Col 1: medalha ou posição */}
                    <div className="ta-c">
                      {mdl3
                        ? <span style={{ fontSize:18, lineHeight:1 }}>{mdl3}</span>
                        : pos!=null
                          ? <span style={{ fontSize:13, fontWeight:700, color:"var(--text-2)" }}>#{pos}</span>
                          : <span style={{ fontSize:12, color:"var(--text-3)" }}>—</span>}
                    </div>

                    {/* Col 2: nome + pills + meta */}
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
                        <span style={{ fontWeight:600, fontSize:13 }}>{t.name}</span>
                        {/* Nº de rondas — pill do sistema global PillBadge */}
                        <RoundPill nR={rds.length} />
                        {/* ── DEBUG TEMPORÁRIO: fonte do torneio — remover após diagnóstico ── */}
                        {debugMode && (
                          <span title={`tid: ${t.id}`} className="fs-10 shrink-0 overflow-hidden" style={{ fontFamily: "'JetBrains Mono', monospace", padding: "1px 5px", borderRadius: 4, background: "#fef08a", color: "#713f12", border: "1px solid #fde047", maxWidth: 200, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {t.id}
                          </span>
                        )}
                        {/* Links */}
                        {(() => {
                          const { signupanytimeUrl, uskidsUrl } = getTournLinks(t.id, t.url);
                          const linkStyle: React.CSSProperties = {
                            display:"inline-flex", alignItems:"center", gap:2, fontSize:10,
                            fontWeight:600, textDecoration:"none", padding:"1px 5px",
                            borderRadius:4, lineHeight:1.2, flexShrink:0,
                          };
                          return (
                            <>
                              {signupanytimeUrl && (
                                <a href={signupanytimeUrl} target="_blank" rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()} title="Resultados (Signupanytime)"
                                  style={{ ...linkStyle, color:"var(--color-info-dark)", border:"1px solid var(--color-info-light)" }}>
                                  ↗ SAT
                                </a>
                              )}
                              {uskidsUrl && (
                                <a href={uskidsUrl} target="_blank" rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()} title="Ver resultados"
                                  style={{ ...linkStyle, color:"var(--accent)", border:"1px solid var(--accent)" }}>
                                  ↗ result
                                </a>
                              )}
                            </>
                          );
                        })()}
                        {manuelEsteve && !isManuel && (
                          <span style={{ background:"#d1fae5", color:"#065f46", border:"1px solid #6ee7b7",
                            fontSize:9, padding:"1px 5px", borderRadius:4, fontWeight:600 }}>★ M{manuelPos!=null?` #${manuelPos}`:""}</span>
                        )}
                      </div>
                      <div style={{ fontSize:11, color:"var(--text-2)", marginTop:1 }}>
                        {fmtDM(t.dateExact, t.date)}
                        {stars && ` · ${stars}`}
                        {t.field>0 && <> · {isLarge && "⭐ "}{t.field} jogadores</>}
                        {ageGroup && <></>}
                      </div>
                    </div>

                    {/* Col 3: escalão pill + 9H badge */}
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
                      {ageGroup && <span className={`p p-sm ${agCls}`}>{ageGroup}</span>}
                      {is9h && <span className="p p-sm" style={{ fontSize:9, background:"var(--color-info-dark)", color:"#fff", padding:"1px 4px" }}>9H</span>}
                    </div>

                    {/* Col 4: ±par total · se 9H mostra também equiv. 18H */}
                    <div style={{ textAlign:"right", minWidth:36 }}>
                      <div style={{ fontSize:14, fontWeight:700,
                        color: tpDisplay ? tpColorDark(res.tp) : "var(--text-3)" }}>
                        {tpDisplay ?? "—"}
                      </div>
                    </div>

                    {/* Col 5: top % */}
                    <div style={{ textAlign:"right", minWidth:52, fontSize:12, fontWeight:500,
                      color: topPct!=null && topPct<=15 ? "var(--color-good-dark)" : "var(--text-3)" }}>
                      {topPct!=null ? `top ${topPct}%` : ""}
                    </div>

                    {/* Col 6: Scorecard ▼ — span sem bordo, sem fundo */}
                    <div>
                      {hasCard && (
                        <span onClick={() => toggleExpand(t.id)}
                          style={{ fontSize:8, color:"var(--text-3)", cursor:"pointer", userSelect:"none" }}>
                          {expanded ? "Scorecard ▲" : "Scorecard ▼"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Scorecard expandido */}
                  {expanded && hasCard && (
                    <div style={{ padding:"0 8px 12px", borderBottom:"1px solid var(--border-light)", background:"var(--bg)" }}>
                      {t.id==="brjgt25" && bjgtCard && (
                        <div className="bjgt-chart-scroll">
                          <table className="sc-table-modern" data-sc-table="1">
                            <THead /><tbody>
                              <MetrosRow /><SIRow /><FieldAvgRow /><ParRow sep />
                              {bjgtCard.rounds.map((rd,i) => <GrossRow key={i} holes={rd as number[]} label={`R${i+1}`} />)}
                              <GrossRow holes={bjgtCard.ecl as number[]} label="ECL" />
                              <VsFieldRow holes={bjgtCard.ecl as number[]} />
                            </tbody>
                          </table>
                        </div>
                      )}
                      {t.id==="brjgt25" && !bjgtCard && autoCard && (
                        <TournScorecard
                          par={autoCard.par.length===18?autoCard.par as unknown as readonly number[]:VP_PAR as unknown as readonly number[]}
                          si={autoCard.si.length>0?autoCard.si as unknown as readonly number[]:VP_SI as unknown as readonly number[]}
                          meters={autoCard.meters.length>0?autoCard.meters as unknown as readonly number[]:VP_M as unknown as readonly number[]}
                          rounds={autoCard.rounds.map((sc,i)=>({label:`R${i+1}`,scores:sc}))} />
                      )}
                      {t.id==="wjgc26" && wjgcCard && (
                        <TournScorecard par={WJGC26_PAR} si={WJGC26_SI} meters={WJGC26_M}
                          rounds={wjgcCard.rds.map((sc,i)=>({label:`R${i+1}`,scores:[...sc]}))} />
                      )}
                      {t.id==="eowagr25" && eowagr25Card && (
                        <TournScorecard par={EOWAGR25_PAR} si={EOWAGR25_SI} meters={EOWAGR25_M}
                          rounds={eowagr25Card.rds.map((sc,i)=>({label:`R${i+1}`,scores:[...sc]}))} />
                      )}
                      {t.id==="wjgc26_1213" && wjgc26_1213Card && (
                        <TournScorecard par={WJGC26_1213_PAR} si={WJGC26_1213_SI} meters={WJGC26_1213_M}
                          rounds={wjgc26_1213Card.rds.map((sc,i)=>({label:`R${i+1}`,scores:[...sc]}))} />
                      )}
                      {autoCard && (() => {
                        const METERS_FALLBACK: Record<string,readonly number[]> = {
                          "usk20175_b11":MS_USKIDS_M_B1011,"usk20175_b10":MS_USKIDS_M_B1011,
                          "usk21080_b11":MS_USKIDS_M_B1011,"usk21080_b10":MS_USKIDS_M_B1011,
                          "usk21080_b12":MS_USKIDS_M_B12,"usk21080_b9":MS_USKIDS_M_B1011,
                          "usk20175_b12":MS_USKIDS_M_B12,
                          "doral25_b1011":DORAL_GP_M_B1011,"doral25_b89":DORAL_GP_M_B1011,
                          "doral25_b1213":DORAL_SF_M_B1213,
                          "doral24_b1011":DORAL_GP_M_B1011,"doral24_b89":DORAL_GP_M_B1011,
                          "doral24_b1213":DORAL_SF_M_B1213,
                        };
                        const dedicated = ["brjgt25","wjgc26","eowagr25","wjgc26_1213"];
                        if (dedicated.includes(t.id) && (bjgtCard||wjgcCard||eowagr25Card||wjgc26_1213Card)) return null;
                        if (!autoCard.par||autoCard.par.length<9) return <div className="fs-11 c-text-3 p-10">— scorecard buraco-a-buraco não disponível</div>;
                        return (
                          <TournScorecard
                            par={autoCard.par as unknown as readonly number[]}
                            si={autoCard.si as unknown as readonly number[]}
                            meters={(METERS_FALLBACK[t.id]??autoCard.meters??[]) as unknown as readonly number[]}
                            rounds={autoCard.rounds.map((sc,i)=>({label:`R${i+1}`,scores:sc}))}
                            siLabel="m" />
                        );
                      })()}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        );
      })()}

      {/* ══ HEAD-TO-HEAD DETALHADO ══ */}
      {!isManuel && <H2HTable confrontos={confrontosH2H} playerName={playerName} />}

      {/* ══ HISTÓRICO USKIDS ══ */}
      {(() => {
        if (!mhPlayer) return null;
        const mhTorneiosAll = Object.entries(mhPlayer.torneios)
          .map(([tid,t]) => ({ tid, ...(t as MHTournament) }))
          .filter(t => Object.keys(t.rounds||{}).length>0)
          .sort((a,b) => (isoDate(b.startDate||"")||"").localeCompare(isoDate(a.startDate||"")||""));
        if (mhTorneiosAll.length===0) return null;
        return <MemberHistTable mhTorneios={mhTorneiosAll} memberId={mhPlayer.memberId} />;
      })()}

      {played===0 && !lbEntry && (
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
  const scoringStats = useScoringStats();

  // Actualizar rankMap quando os rivais carregam
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
  // Suporte a /kids#NomeJogador (abre em nova janela desde USKIDSPage)
  const hashPlayer = location.hash ? decodeURIComponent(location.hash.slice(1)) : undefined;

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(
    locationPlayer ?? hashPlayer ?? "Manuel Medeiros"
  );
  const md = useMasterDetail();

  // ── Resolução do jogador do hash ─────────────────────────────────────────────
  // Um único effect com dep [rivals]: re-corre a cada carregamento parcial.
  // Para hash numérico: procura por memberId (propagado do loader para cada RivalPlayer).
  // Para hash de texto: procura por nome (exacto, depois normalizado).
  // hashResolvedRef evita re-selecções após resolução.
  const hashResolvedRef = React.useRef(false);
  React.useEffect(() => {
    if (hashResolvedRef.current || !hashPlayer) return;
    let found: RivalPlayer | undefined;
    if (/^\d+$/.test(hashPlayer)) {
      // Hash numérico → procurar por memberId
      found = rivals.find(d => (d as any).memberId === hashPlayer);
    } else {
      // Hash de texto → procurar por nome
      found = rivals.find(d => d.n === hashPlayer)
        ?? rivals.find(d => normName(d.n) === normName(hashPlayer));
    }
    if (found) {
      hashResolvedRef.current = true;
      setSelectedPlayer(found.n);
      md.onSelect(); // mobile: esconde sidebar; desktop: scroll to top
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rivals]);

  // ── Todos os filtros no toolbar ──
  const [fids, setFids]                 = useState<Set<string>>(new Set());
  const [paisFilter, setPaisFilter]     = useState("");
  const [tierFilter, setTierFilter]     = useState("");
  const [minTorn, setMinTorn]           = useState(0);
  const [apenasDirectos, setApenasDirectos] = useState(false);
  const [q, setQ]                       = useState("");

  const toggleFid = (id: string) => setFids(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const hasActiveFilters = !!(q || paisFilter || tierFilter || minTorn > 0 || apenasDirectos || fids.size > 0);

  // Países disponíveis
  const paises = useMemo(() => {
    const s = new Set<string>();
    for (const p of rivals) { if (!p.isM && p.co) s.add(p.co); }
    return [...s].sort();
  }, [rivals]);

  // Player type counts para os pills de tipo
  const playerTypeMap = useMemo(() => {
    const m = new Map<string, ReturnType<typeof getPlayerType>>();
    for (const p of rivals) { if (!p.isM) m.set(p.n, getPlayerType(p)); }
    return m;
  }, [rivals]);

  const resetFilters = () => { setPaisFilter(""); setTierFilter(""); setMinTorn(0); setApenasDirectos(false); setFids(new Set()); setQ(""); };

  const handleSelectPlayer = (name: string) => {
    setSelectedPlayer(name);
    md.onSelect();
  };

  return (
    <RivalsCtx.Provider value={rivals}>
    <MemberHistCtx.Provider value={memberHist}>
    <ScoringStatsCtx.Provider value={scoringStats}>
    <div className="tourn-layout">

      {/* ── Toolbar row 1 ── */}
      <Toolbar>
        <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Lista" />
        <ToolbarTitle>🌍 Kids</ToolbarTitle>
        <ToolbarSep />
        <span className="toolbar-meta shrink-0" >
          {loaded
            ? <span style={{ fontSize: 10, color: "var(--color-good-dark)", fontWeight: 700 }}>{rivals.length} rivais · ✓</span>
            : progress
              ? <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--text-muted)" }}>
                  {rivals.length} · {progress.done}/{progress.total}
                  <span style={{ display: "inline-block", width: 50, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden", position: "relative" }}>
                    <span style={{ position: "absolute", left: 0, top: 0, height: "100%",
                      width: `${Math.round(progress.done / progress.total * 100)}%`,
                      background: "var(--color-good-dark)", borderRadius: 2, transition: "width .3s" }} />
                  </span>
                </span>
              : <span style={{ fontSize: 10, color: "var(--text-muted)" }}>⏳ a iniciar…</span>}
        </span>
        <ToolbarSep />
        {/* Pesquisa */}
        <input type="text" value={q} onChange={e => setQ(e.target.value)}
          placeholder="🔎 Pesquisar rival…" className="input fs-12 shrink-0"
          
          style={{ width: 150, height: 26 }} />
        <ToolbarSep />
        {/* Filtros avançados: país, tipo, presenças, directos, limpar */}
        <select className="select fs-11 shrink-0" value={paisFilter} onChange={e => setPaisFilter(e.target.value)}
          style={{ height: 26, minWidth: 85 }}>
          <option value="">🌍 País</option>
          {paises.map(p => <option key={p} value={p}>{FL[p] || "🏳️"} {p}</option>)}
        </select>
        {[
          { emoji: "🏆", label: "Elite" }, { emoji: "⭐", label: "Top" },
          { emoji: "🎯", label: "Forte" }, { emoji: "🔁", label: "Assíduo" },
        ].map(({ emoji, label }) => {
          const active = tierFilter === label;
          return (
            <button key={label}
              className={"tourn-tab tourn-tab-sm" + (active ? " active" : " tourn-tab-muted")}
              style={{ flexShrink: 0 }}
              onClick={() => setTierFilter(active ? "" : label)}
              title={label}>
              {emoji}
            </button>
          );
        })}
        {[5, 10, 20].map(n => (
          <button key={n}
            className={"tourn-tab tourn-tab-sm" + (minTorn === n ? " active" : " tourn-tab-muted")}
            style={{ flexShrink: 0 }}
            onClick={() => setMinTorn(minTorn === n ? 0 : n)}>
            {n}+
          </button>
        ))}
        <button
          className={"tourn-tab tourn-tab-sm" + (apenasDirectos ? " active" : " tourn-tab-muted")}
          style={apenasDirectos
            ? { flexShrink: 0, background: "var(--bg-success-subtle)", borderColor: "var(--color-good)", color: "var(--color-good-dark)" }
            : { flexShrink: 0 }}
          onClick={() => setApenasDirectos(v => !v)}
          title="Só directos">
          ⚔️
        </button>
        {hasActiveFilters && (
          <button onClick={resetFilters} className="tourn-tab tourn-tab-sm"
            style={{ flexShrink: 0, background: "var(--bg-danger)", color: "var(--color-danger-dark)", borderColor: "var(--color-danger)" }}>
            ✕
          </button>
        )}
        <div className="flex-1" />
        <span className="chip shrink-0" >
          {rivals.filter(p => (nPlayed(p) > 0 || p.isM) && playerMatchesFilter(p, fids)).length}
        </span>
      </Toolbar>

      {/* ── Toolbar row 2: filtros de circuito (multi-select) ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "4px 10px 5px", overflowX: "auto", flexWrap: "nowrap",
        scrollbarWidth: "none",
        background: "var(--bg-card)", borderBottom: "1px solid var(--border-light)",
        flexShrink: 0,
      }}>
        {SIDEBAR_FILTERS.filter(f => f.id !== "all").map(f => {
          const active = fids.has(f.id);
          return (
            <button key={f.id}
              className={"tourn-tab tourn-tab-sm" + (active ? " active" : " tourn-tab-muted")}
              style={{ flexShrink: 0 }}
              onClick={() => toggleFid(f.id)}>
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Master-detail */}
      <div className="master-detail">
        <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
          <RivaisSidebar
            selected={selectedPlayer}
            onSelect={handleSelectPlayer}
            fids={fids} q={q}
            paisFilter={paisFilter}
            tierFilter={tierFilter}
            minTorn={minTorn}
            apenasDirectos={apenasDirectos}
            playerTypeMap={playerTypeMap}
          />
        </div>
        <div className="course-detail" ref={md.detailRef}>
          {selectedPlayer ? (
            <RivalDetail playerName={selectedPlayer} />
          ) : (
            <div className="muted p-16">Selecciona um rival na lista à esquerda.</div>
          )}
        </div>
      </div>
    </div>
    </ScoringStatsCtx.Provider>
    </MemberHistCtx.Provider>
    </RivalsCtx.Provider>
  );
}

export default function RivaisIntlPage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <RivaisIntlContent />;
}
