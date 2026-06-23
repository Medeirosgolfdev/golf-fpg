import { useState, useMemo } from "react";
import { flag, normPaisDisplay } from "../utils/flagUtils";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";
import WdBadge from "./WdBadge";
import KpiCard from "./KpiCard";
import { uskTournNames, normName as normNameAuto } from "../data/KIDSdataLoader";
import type { AutoRivalPlayer, FieldData } from "../data/KIDSdataLoader";

// Nota: KidsLink é importado/passado via props para evitar circular dependency
interface TGTournDef {
  id: string; name: string; short: string; date: string;
  rounds: number; par: number; field: number; nations: number;
  intendedRounds?: number; url: string; dateExact?: string;
}
interface TGResult {
  p: number | "WD"; t?: number | null; tp?: number | null; rd: number[];
}
interface TGPlayer {
  n: string; co: string; isM?: boolean; dob?: string;
  r: Record<string, TGResult>; up: string[];
}

// ── Torneios fixos (BJGT/EOWAGR — tids que NÃO existem no USKids scraper) ──
const TG_T: TGTournDef[] = [
  { id:"gg25",     name:"Greatgolf Open 2025",    short:"GG25",      date:"Fev 2025", rounds:2, par:72, field:12, nations:4,  dateExact:"2025-02-08", url:"https://scoring-pt.datagolf.pt/scripts/classif.asp?tourn=10202&club=935" },
  { id:"brjgt25",  name:"WJGC 2025",              short:"WJGC",      date:"Fev 2025", rounds:3, par:71, field:40, nations:17, dateExact:"2025-02-24", url:"https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/34/leaderboard.htm" },
  { id:"eowagr25", name:"European Open",           short:"EU Open",   date:"Ago 2025", rounds:3, par:72, field:8,  nations:6,  dateExact:"2025-08-01", url:"https://brjgt.bluegolfw/brjgt25/event/brjgt2512/contest/21/leaderboard.htm" },
  { id:"venice25", name:"Venice Open 2025",        short:"Venice",    date:"Ago 2025", rounds:3, par:72, field:39, nations:16, dateExact:"2025-08-07", url:"https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/515206/venice-open-2025/results" },
  { id:"rome25",   name:"Rome Classic 2025",       short:"Rome",      date:"Out 2025", rounds:2, par:72, field:14, nations:6,  dateExact:"2025-10-18", url:"https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516026/rome-classic-2025/results" },
  { id:"doral25",  name:"Doral Junior 2025",       short:"Doral",     date:"Dez 2025", rounds:2, par:71, field:35, nations:13, dateExact:"2025-12-18", url:"https://www.golfgenius.com/v2tournaments/4222407" },
  { id:"qdl25",    name:"QDL Junior Open 2025",    short:"QDL",       date:"Nov 2025", rounds:1, par:72, field:12, nations:7,  dateExact:"2025-11-08", url:"https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=962&tcode=10080&classif_order=2" },
  { id:"gg26",     name:"Greatgolf Junior Open",   short:"GG",        date:"Fev 2026", rounds:2, par:72, field:12, nations:4,  dateExact:"2026-02-08", url:"https://scoring-pt.datagolf.pt/scripts/classif.asp?tourn=10296&club=935&ack=OT342GH16T" },
  { id:"wjgc26",   name:"WJGC 2026",              short:"WJGC26",    date:"Fev 2026", rounds:3, par:72, field:38, nations:18, dateExact:"2026-02-24", url:"https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/73/leaderboard.htm" },
  { id:"marco26",  name:"Marco Simone Inv. 2026",  short:"Marco 26",  date:"Mar 2026", rounds:2, par:72, field:17, nations:9,  dateExact:"2026-03-14", url:"https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516989/marco-simone-invitational-2026/results" },
];


const TG_AUTO_META: Record<string, { field: number; par: number; url?: string }> = {
  wjgc25_b89:    { field:37, par:71 }, wjgc25_b1011: { field:40, par:71 }, wjgc25_b1213: { field:38, par:71 },
  wjgc26_b1213:  { field:39, par:73 },
  marco26_b9:    { field:17, par:72 }, marco26_b10: { field:17, par:72 }, marco26_b11: { field:17, par:72 }, marco26_b12: { field:17, par:72 },
  doral25_b89:   { field:30, par:71 }, doral25_b1011: { field:35, par:71 }, doral25_b1213: { field:32, par:71 },
  venice25_b9:   { field:35, par:72 }, venice25_b10: { field:38, par:72 }, venice25_b11: { field:39, par:72 }, venice25_b12: { field:36, par:72 },
  rome25_b9:     { field:12, par:72 }, rome25_b10: { field:14, par:72 }, rome25_b11: { field:14, par:72 }, rome25_b12: { field:12, par:72 },
};

const TG_AUTO_NAMES: Record<string, { name: string; short: string; date: string }> = {
  wjgc25_b89:    { name:"WJGC 2025",          short:"WJGC25",   date:"Fev 2025" },
  wjgc25_b1011:  { name:"WJGC 2025",          short:"WJGC25",   date:"Fev 2025" },
  wjgc25_b1213:  { name:"WJGC 2025",          short:"WJGC25",   date:"Fev 2025" },
  wjgc26_b1213:  { name:"WJGC 2026",          short:"WJGC26",   date:"Fev 2026" },
  eowagr25_b78:  { name:"European Open",       short:"EU Open",  date:"Ago 2025" },
  eowagr25_b910: { name:"European Open",       short:"EU Open",  date:"Ago 2025" },
  eowagr25_b1314:{ name:"European Open",       short:"EU Open",  date:"Ago 2025" },
  doral25_b89:   { name:"Doral Junior 2025",   short:"Doral",    date:"Dez 2025" },
  doral25_b1011: { name:"Doral Junior 2025",   short:"Doral",    date:"Dez 2025" },
  doral25_b1213: { name:"Doral Junior 2025",   short:"Doral",    date:"Dez 2025" },
  venice25_b9:   { name:"Venice Open 2025",    short:"Venice",   date:"Ago 2025" },
  venice25_b10:  { name:"Venice Open 2025",    short:"Venice",   date:"Ago 2025" },
  venice25_b11:  { name:"Venice Open 2025",    short:"Venice",   date:"Ago 2025" },
  venice25_b12:  { name:"Venice Open 2025",    short:"Venice",   date:"Ago 2025" },
  rome25_b10:    { name:"Rome Classic 2025",   short:"Rome",     date:"Out 2025" },
  rome25_b11:    { name:"Rome Classic 2025",   short:"Rome",     date:"Out 2025" },
  rome25_b12:    { name:"Rome Classic 2025",   short:"Rome",     date:"Out 2025" },
  marco25_b9:    { name:"Marco Simone Inv.",    short:"Marco25",  date:"Mar 2025" },
  marco25_b10:   { name:"Marco Simone Inv.",    short:"Marco25",  date:"Mar 2025" },
  marco25_b11:   { name:"Marco Simone Inv.",    short:"Marco25",  date:"Mar 2025" },
  marco25_b12:   { name:"Marco Simone Inv.",    short:"Marco25",  date:"Mar 2025" },
  marco26_b9:    { name:"Marco Simone Inv. 2026", short:"Marco26", date:"Mar 2026" },
  marco26_b10:   { name:"Marco Simone Inv. 2026", short:"Marco26", date:"Mar 2026" },
  marco26_b11:   { name:"Marco Simone Inv. 2026", short:"Marco26", date:"Mar 2026" },
  marco26_b12:   { name:"Marco Simone Inv. 2026", short:"Marco26", date:"Mar 2026" },
  desert26_b9:   { name:"Desert Shootout",     short:"Desert",   date:"Fev 2026" },
  desert26_b10:  { name:"Desert Shootout",     short:"Desert",   date:"Fev 2026" },
  desert26_b11:  { name:"Desert Shootout",     short:"Desert",   date:"Fev 2026" },
  desert26_b12:  { name:"Desert Shootout",     short:"Desert",   date:"Fev 2026" },
  sandestin26_b9: { name:"Sandestin Champ.",   short:"Sandest",  date:"Jan 2026" },
  sandestin26_b10:{ name:"Sandestin Champ.",   short:"Sandest",  date:"Jan 2026" },
  sandestin26_b11:{ name:"Sandestin Champ.",   short:"Sandest",  date:"Jan 2026" },
  sandestin26_b12:{ name:"Sandestin Champ.",   short:"Sandest",  date:"Jan 2026" },
  msstate26_b9:  { name:"MS State Inv. 2026",  short:"MS State", date:"Mar 2026" },
  msstate26_b10: { name:"MS State Inv. 2026",  short:"MS State", date:"Mar 2026" },
  msstate26_b11: { name:"MS State Inv. 2026",  short:"MS State", date:"Mar 2026" },
  msstate26_b12: { name:"MS State Inv. 2026",  short:"MS State", date:"Mar 2026" },
  elprat23_b8:   { name:"El Prat 2023",        short:"El Prat",  date:"Out 2023" },
  elprat23_b9:   { name:"El Prat 2023",        short:"El Prat",  date:"Out 2023" },
  elprat23_b10:  { name:"El Prat 2023",        short:"El Prat",  date:"Out 2023" },
  doral24_b89:   { name:"Doral Junior 2024",   short:"Doral24",  date:"Dez 2024" },
  doral24_b1011: { name:"Doral Junior 2024",   short:"Doral24",  date:"Dez 2024" },
  doral24_b1213: { name:"Doral Junior 2024",   short:"Doral24",  date:"Dez 2024" },
  gg25:          { name:"Greatgolf Open 2025",  short:"GG25",     date:"Fev 2025" },
  gg26_u14:      { name:"Greatgolf U14 2026",   short:"GG U14",   date:"Fev 2026" },
  gg26_open:     { name:"Greatgolf Open 2026",  short:"GG Open",  date:"Fev 2026" },
};

// ── Players estáticos (BJGT/WJGC não cobertos pelo USKids scraper) ──
const TG_D: TGPlayer[] = [
  {n:"Manuel Medeiros",co:"Portugal",isM:true,dob:"29/04/2014",r:{brjgt25:{p:26,t:265,tp:52,rd:[90,85,90]},eowagr25:{p:7,t:238,tp:22,rd:[85,77,76]},venice25:{p:28,t:237,tp:21,rd:[78,76,83]},rome25:{p:10,t:166,tp:22,rd:[89,77]},doral25:{p:29,t:177,tp:35,rd:[98,79]},qdl25:{p:11,t:90,tp:18,rd:[90]},gg26:{p:4,t:169,tp:25,rd:[87,82]},wjgc26:{p:9,t:232,tp:16,rd:[79,78,75]}},up:[]},
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
  {n:"Gregorio Vitolo",co:"Italy",r:{venice25:{p:2,t:204,tp:-12,rd:[64,71,69]},rome25:{p:1,t:134,tp:-10,rd:[67,67]},wjgc26:{p:14,t:244,tp:28,rd:[80,82,82]}},up:[]},
  {n:"Hugo Luque Reina",co:"Spain",r:{eowagr25:{p:4,t:229,tp:13,rd:[80,74,75]},wjgc26:{p:18,t:247,tp:31,rd:[82,82,83]}},up:["marco26"]},
  {n:"Maxime Vervaet",co:"Belgium",r:{eowagr25:{p:8,t:246,tp:30,rd:[85,80,81]},wjgc26:{p:16,t:244,tp:28,rd:[81,82,81]}},up:[]},
  {n:"Emilio Valverde",co:"Spain",r:{eowagr25:{p:9,t:252,tp:36,rd:[87,84,81]},wjgc26:{p:26,t:261,tp:45,rd:[87,87,87]}},up:[]},
  {n:"Nicolas Pape",co:"France",r:{wjgc26:{p:6,t:227,tp:11,rd:[75,76,76]}},up:[]},
];

// ── Pesos de presença (round averages a partir de D estático) ──
const TG_AVG_R: Record<string, Array<{ m: number; s: number } | null>> = {};
for (const t of TG_T) {
  TG_AVG_R[t.id] = [];
  for (let i = 0; i < t.rounds; i++) {
    const vals = TG_D.filter(p => (p.r[t.id] as any)?.rd?.[i] != null).map(p => (p.r[t.id] as any).rd[i]).filter((v: any): v is number => v != null);
    if (vals.length > 1) {
      const m = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
      const s = Math.sqrt(vals.reduce((a: number, b: number) => a + (b - m) ** 2, 0) / vals.length);
      TG_AVG_R[t.id][i] = { m, s };
    }
  }
}

const TG_TIER_L = { elite: "Elite", strong: "Forte", solid: "Sólido", developing: "Em Desenv.", beginner: "Iniciante" };
const TG_TR_I: Record<string, { i: string; c: string }> = {
  up2:    { i: "▲▲", c: "var(--color-good)" },
  up:     { i: "▲",  c: "var(--score-par-seg)" },
  stable: { i: "●",  c: "var(--text-muted)" },
  down:   { i: "▼",  c: "var(--color-warn)" },
  down2:  { i: "▼▼", c: "var(--color-danger)" },
};
const TG_TIER = {
  elite:      { bg: "var(--bg-success-strong)",  c: "var(--color-good-dark)" },
  strong:     { bg: "var(--bg-current,#e0f7fa)", c: "var(--text-current,#006064)" },
  solid:      { bg: "var(--bg-warn-light)",       c: "var(--color-warn-dark)" },
  developing: { bg: "var(--bg-warn-strong)",      c: "var(--color-warn-dark)" },
  beginner:   { bg: "var(--bg-danger-subtle,var(--bg-danger-strong))", c: "var(--color-danger-dark)" },
};

const TG_HIDDEN: Array<[string, string]> = [
  // WJGC25: brjgt25 escondido quando existe o tid USKids
  ["brjgt25",        "wjgc25_b1011"],
  // WJGC26: wjgc26_1213 (Boys 12-13) já não está em TG_T; suprimir auto tids USKids
  ["wjgc26_b1213",   "wjgc26_1213"],
  ["wjgc26_b1011",   "wjgc26"],
  // EU Open 2025: suprimir tids USKids em favor do TG_T eowagr25
  ["eowagr25_b78",   "eowagr25"], ["eowagr25_b910",  "eowagr25"],
  ["eowagr25_b1011", "eowagr25"], ["eowagr25_b1314", "eowagr25"],
  // Venice 2025
  ["venice25_b11","venice25"], ["venice25_b12","venice25"],
  ["venice25_b9", "venice25"], ["venice25_b10","venice25"],
  // Rome 2025
  ["rome25_b11","rome25"], ["rome25_b12","rome25"],
  ["rome25_b9", "rome25"], ["rome25_b10","rome25"],
  // Doral 2025
  ["doral25_b1011","doral25"], ["doral25_b89","doral25"], ["doral25_b1213","doral25"],
  // QDL 2025
  ["qdl25_b11","qdl25"], ["qdl25_b12","qdl25"], ["qdl25_b9","qdl25"],
  // Greatgolf 2026
  ["gg26_u14","gg26"], ["gg26_open","gg26"],
  // Marco Simone 2026 — esconder outros escalões quando Boys 11 (marco26) presente
  ["marco26_b9","marco26"],  ["marco26_b10","marco26"],  ["marco26_b12","marco26"],
  ["usk21080_b9","marco26"], ["usk21080_b10","marco26"], ["usk21080_b12","marco26"],
  // Marco Simone 2025 — esconder outros escalões quando Boys 11 (usk18438_b11) presente
  ["marco25_b9","usk18438_b11"],  ["marco25_b10","usk18438_b11"],  ["marco25_b12","usk18438_b11"],
  ["usk18438_b9","usk18438_b11"], ["usk18438_b10","usk18438_b11"], ["usk18438_b12","usk18438_b11"],
];

function tgHiddenTids(p: TGPlayer): Set<string> {
  const hidden = new Set<string>();
  for (const [toHide, whenPresent] of TG_HIDDEN) {
    if ((p.r[toHide] as any)?.rd?.length > 0 && (p.r[whenPresent] as any)?.rd?.length > 0)
      hidden.add(toHide);
  }
  return hidden;
}

function tgNPlayed(p: TGPlayer) {
  const total = Object.values(p.r).filter(r => r && (r.tp != null || r.rd?.length > 0)).length;
  return total - tgHiddenTids(p).size;
}

function tgNRounds(p: TGPlayer) {
  const hidden = tgHiddenTids(p);
  return Object.entries(p.r).reduce((acc, [tid, res]) => {
    if (hidden.has(tid)) return acc;
    return acc + (res?.rd ? res.rd.filter((x: number) => x != null && x > 0).length : 0);
  }, 0);
}

function tgGetVsAvg(p: TGPlayer, manuelRef: TGPlayer | null): number | null {
  if (p.isM || !manuelRef) return null;
  const ds: number[] = [];
  Object.keys(p.r).forEach(tid => {
    const mr = manuelRef.r[tid];
    if (mr && p.r[tid].tp != null && mr.tp != null) ds.push(p.r[tid].tp! - mr.tp!);
  });
  return ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null;
}

function tgGetTournInfo(tid: string): { name: string; short: string; date: string; dateExact: string } {
  const manual = TG_T.find(t => t.id === tid);
  if (manual) return { name: manual.name, short: manual.short, date: manual.date, dateExact: manual.dateExact ?? manual.date };
  const autoName = TG_AUTO_NAMES[tid];
  if (autoName) return { ...autoName, dateExact: autoName.date };
  const uskMatch = tid.match(/^(usk\d+)_b(\d+)$/);
  if (uskMatch) {
    const base = uskTournNames.get(uskMatch[1]);
    if (base) return { name: base.name, short: base.short, date: base.date, dateExact: base.dateExact ?? base.date };
  }
  return { name: tid, short: tid, date: "?", dateExact: "9999" };
}

function tgGetTournWeight(tid: string): number {
  if (tid.startsWith("brjgt") || tid.startsWith("wjgc"))  return 1.2;
  if (tid.startsWith("venice") || tid.startsWith("doral")) return 1.2;
  if (/^usk\d+_b\d+$/.test(tid)) {
    const base = tid.replace(/_b\d+$/, "");
    const name = (uskTournNames.get(base)?.name ?? "").toLowerCase();
    if (name.includes("world")) return 1.4;
    if (name.includes("european")) return 1.2;
    if (name.includes("venice")) return 1.2;
    return 1.0;
  }
  return 0.3;
}

function tgFmtSign(n: number | null | undefined, dec = 0): string {
  if (n == null) return "—";
  const s = dec === 0 ? Math.round(n).toString() : n.toFixed(dec);
  return n > 0 ? `+${s}` : s;
}

function tgSc3m(v: number): string {
  if (v < -2) return "var(--color-good)";
  if (v < 0) return "var(--score-par-seg,var(--color-good))";
  if (v === 0) return "var(--text-3)";
  if (v <= 3) return "var(--color-warn)";
  return "var(--color-danger)";
}

function tgTpColorDark(tp: number | null | undefined): string {
  if (tp == null) return "var(--text-3)";
  if (tp <= -5) return "var(--score-eagle)";
  if (tp < 0)  return "var(--color-good-dark)";
  if (tp === 0) return "var(--text-2)";
  if (tp <= 10) return "var(--color-warn-dark)";
  return "var(--color-danger-dark)";
}

// ── zTier calculation (simplified) ──
function tgZTier(playerAvg: number, field: { m: number; s: number }): keyof typeof TG_TIER | null {
  if (field.s <= 0) return null;
  const z = (playerAvg - field.m) / field.s;
  if (z <= -1.5) return "elite";
  if (z <= -0.8) return "strong";
  if (z <= 0.2)  return "solid";
  if (z <= 1.0)  return "developing";
  return "beginner";
}

// ── Rank map (simplified z-rank) ──
function tgBuildRankMap(rivals: TGPlayer[]): Record<string, number> {
  const scored: { n: string; avg: number }[] = [];
  for (const p of rivals) {
    const hidden = tgHiddenTids(p);
    const tps = Object.entries(p.r)
      .filter(([tid, r]) => !hidden.has(tid) && r?.tp != null)
      .map(([, r]) => r.tp as number);
    if (tps.length >= 2) {
      scored.push({ n: p.n, avg: tps.reduce((a, b) => a + b, 0) / tps.length });
    }
  }
  scored.sort((a, b) => a.avg - b.avg);
  const m: Record<string, number> = {};
  scored.forEach((s, i) => { m[s.n] = i + 1; });
  return m;
}

// ── Trend (simplified) ──
function tgGetTrend(p: TGPlayer): string | null {
  const hidden = tgHiddenTids(p);
  const tps = Object.entries(p.r)
    .filter(([tid, r]) => !hidden.has(tid) && r?.tp != null)
    .sort(([a], [b]) => tgGetTournInfo(a).dateExact.localeCompare(tgGetTournInfo(b).dateExact))
    .map(([, r]) => r.tp as number);
  if (tps.length < 2) return null;
  const half = Math.floor(tps.length / 2);
  const first = tps.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const last  = tps.slice(-half).reduce((a, b) => a + b, 0) / half;
  const diff = last - first;
  if (diff <= -5)  return "up2";
  if (diff <= -2)  return "up";
  if (diff >= 5)   return "down2";
  if (diff >= 2)   return "down";
  return "stable";
}

// ── Mapeamento de tids USKids/auto → tids canónicos de TG_T ──
// Permite que jogadores auto-carregados apareçam nas colunas fixas correctas.
// Mapeamento de tids auto → tids canónicos de TG_T.
// REGRA: mapear APENAS o escalão que o Manuel jogou em cada torneio.
// Os outros escalões ficam com o tid original e são ignorados (não aparecem
// em visibleTids nem em manuelTids → filtrados automaticamente na TabelaGlobal).
const TG_TID_EXACT: Record<string, string> = {
  // WJGC 2025 → brjgt25 — APENAS Boys 10-11 (escalão do Manuel)
  "wjgc25_b1011":"brjgt25",
  // EU Open 2025 → eowagr25 — Manuel jogou o escalão principal (eowagr25 directo)
  // Os outros escalões (b78, b910, b1314) não são mapeados e ficam suprimidos.
  // Venice 2025 → venice25 — APENAS Boys 11 (escalão do Manuel)
  "venice25_b11":"venice25",
  // Rome 2025 → rome25 — APENAS Boys 11 (escalão do Manuel)
  "rome25_b11":"rome25",
  // Doral 2025 → doral25 — APENAS Boys 10-11 (escalão do Manuel)
  "doral25_b1011":"doral25",
  // QDL 2025 → qdl25 (torneio sub-12 unificado — escalão único)
  "qdl25_b9":"qdl25", "qdl25_b11":"qdl25", "qdl25_b12":"qdl25",
  // GG 2025 → gg25 — APENAS Boys 10 (escalão do Manuel)
  "gg25_b10":"gg25",
  // WJGC 2026 → wjgc26 — APENAS Boys 10-11 (escalão do Manuel)
  "wjgc26_b1011":"wjgc26",
  // Marco Simone 2026 → marco26 — APENAS Boys 11 (escalão do Manuel)
  "marco26_b11":"marco26",
  // USKids completo (tcode numérico) — apenas escalão do Manuel
  "usk21080_b11":"marco26",   // Marco Simone Inv. 2026 (tcode 21080)
  "usk19418_b11":"venice25",  // Venice Open 2025 (tcode 19418) — Boys 11
  "usk20175_b11":"rome25",    // Rome Classic 2025 (tcode 20175) — Boys 11
  // Marco Simone 2025 — colapsar formato antigo no formato completo (evitar 2 colunas auto)
  "marco25_b11":"usk18438_b11",  // Marco Simone Inv. 2025 (tcode 18438) — Boys 11
};
// Mapeamento genérico por tcode USKids — vazio intencionalmente.
// Anteriormente mapeava TODOS os escalões de venice25/rome25 para o mesmo tid.
// Substituído por entradas exactas por escalão em TG_TID_EXACT acima.
const TG_USK_TCODE: Record<string, string> = {};

function tgNormalizeTid(tid: string): string {
  if (TG_TID_EXACT[tid]) return TG_TID_EXACT[tid];
  const m = tid.match(/^(usk\d+)_b\d+$/);
  if (m && TG_USK_TCODE[m[1]]) return TG_USK_TCODE[m[1]];
  return tid;
}

// ── Merge TG_D com autoRivals ──
function tgMerge(autoRivals: AutoRivalPlayer[]): TGPlayer[] {
  const ALIASES: Record<string, string> = {
    "manuel francisco medeiros": "manuel medeiros",
    "manuel goulartt medeiros":  "manuel medeiros",
    "manuel f medeiros":         "manuel medeiros",
  };
  const resolve = (n: string) => ALIASES[normNameAuto(n)] ?? normNameAuto(n);

  // Canonicalizar `co` na origem para que entradas estáticas ("Russian
  // Federation", "United States") dedupem com as canonicalizadas pelo loader
  // ("Russia", "USA") — ver KIDSPage.tsx ~601.
  const map = new Map<string, TGPlayer>(TG_D.map(p => [resolve(p.n), { ...p, co: normPaisDisplay(p.co), r: { ...p.r } }]));

  for (const ap of autoRivals) {
    const key = resolve(ap.n);
    const apCoCanon = normPaisDisplay(ap.co || "");
    if (map.has(key)) {
      const ex = map.get(key)!;
      for (const [rawTid, res] of Object.entries(ap.r)) {
        const tid = tgNormalizeTid(rawTid);
        if (!ex.r[tid] || (res.rd?.length ?? 0) > (ex.r[tid]?.rd?.length ?? 0)) {
          ex.r[tid] = { p: res.p ?? "WD", tp: res.tp ?? null, t: undefined, rd: res.rd ?? [] };
        }
      }
      if (apCoCanon && !ex.co) ex.co = apCoCanon;
      if (ap.dob && !ex.dob) ex.dob = ap.dob;
      // Merge up arrays — inscrições futuras do autoRivals
      if (ap.up?.length) ex.up = [...new Set([...ex.up, ...ap.up])];
    } else {
      const convertedR: Record<string, TGResult> = {};
      for (const [rawTid, v] of Object.entries(ap.r)) {
        const tid = tgNormalizeTid(rawTid);
        if (!convertedR[tid] || (v.rd?.length ?? 0) > (convertedR[tid]?.rd?.length ?? 0)) {
          convertedR[tid] = { p: v.p ?? "WD" as "WD", tp: v.tp ?? null, rd: v.rd ?? [] };
        }
      }
      map.set(key, { n: ap.n, co: apCoCanon, r: convertedR, up: ap.up ?? [] });
    }
  }
  return Array.from(map.values());
}

/* ════════════════════════════════════════════════════════════════
   TabelaGlobal — tabela completa de todos os rivais × torneios
   ════════════════════════════════════════════════════════════════ */
interface TabelaGlobalProps {
  autoRivals: AutoRivalPlayer[];
  futureCols?: { tid: string; short: string; escalao: string; url?: string }[];
  fieldData: FieldData | null;
  KidsLink?: React.ComponentType<{ nome: string }>;
}

export default function TabelaGlobal({ autoRivals, futureCols, fieldData, KidsLink }: TabelaGlobalProps) {
  const norm2 = normNameAuto;

  const rivals = useMemo(() => tgMerge(autoRivals), [autoRivals]);
  const manuelRef = useMemo(() => rivals.find(p => p.isM) ?? null, [rivals]);

  // Mapa de inscrições: tid → Set de nomes normalizados (de fieldData, não de up)
  const inscricaoMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (!fieldData || !futureCols?.length) return m;
    for (const fc of futureCols) {
      const tNum = parseInt(fc.tid.replace("usk", ""));
      const torneio = fieldData.torneios.find(t => t.t === tNum);
      if (!torneio) continue;
      const s = new Set<string>();
      for (const esc of torneio.escaloes) {
        for (const j of (esc.jogadores ?? [])) {
          s.add(norm2(j.nome));
        }
      }
      m.set(fc.tid, s);
    }
    return m;
  }, [fieldData, futureCols, norm2]);

  const [fTour, setFTour] = useState("all");
  const [fCo,   setFCo]   = useState("all");
  const [q,     setQ]     = useState("");
  const { sortKey: sort, sortDir: dir, toggleSort } = useSort<string>("rank");
  const [dOnly, setDOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const rankMap = useMemo(() => tgBuildRankMap(rivals), [rivals]);
  const totalRanked = Object.keys(rankMap).length;

  const allCountries = useMemo(() => [...new Set(rivals.map(p => p.co))].sort(), [rivals]);

  // Tids de escalões que o Manuel NÃO jogou — suprimir de colunas auto e do list filter
  const TG_SUPPRESS = [
    "wjgc26_1213",
    // WJGC 2025 — Boys 8-9 e Boys 12-13 (Manuel jogou Boys 10-11)
    "wjgc25_b89", "wjgc25_b1213",
    // EU Open 2025 — outros escalões (Manuel jogou eowagr25 directo = Boys 11-12)
    "eowagr25_b78", "eowagr25_b910", "eowagr25_b1011", "eowagr25_b1314",
    // Venice 2025 — Boys 9, 10, 12 (Manuel jogou Boys 11)
    "venice25_b9", "venice25_b10", "venice25_b12",
    "usk19418_b9", "usk19418_b10", "usk19418_b12",
    // Rome 2025 — Boys 9, 10, 12 (Manuel jogou Boys 11)
    "rome25_b9", "rome25_b10", "rome25_b12",
    "usk20175_b9", "usk20175_b10", "usk20175_b12",
    // Doral 2025 — Boys 8-9 e Boys 12-13 (Manuel jogou Boys 10-11)
    "doral25_b89", "doral25_b1213",
    // WJGC 2026 — Boys 12-13 (Manuel jogou Boys 10-11)
    "wjgc26_b1213",
    // GG 2026 — U14 e Open (Manuel jogou sub-12 = gg26)
    "gg26_u14", "gg26_open",
    // Marco 2026 — Boys 9, 10, 12 (Manuel jogou Boys 11)
    "marco26_b9", "marco26_b10", "marco26_b12",
    "usk21080_b9", "usk21080_b10", "usk21080_b12",
    // GG 2025 — outros escalões além do Boys 10 (Manuel)
    "gg25_b9", "gg25_b11", "gg25_b12",
    // Marco Simone 2025 — Boys 9, 10, 12 (Manuel jogou Boys 11 = usk18438_b11)
    "marco25_b9", "marco25_b10", "marco25_b12",
    "usk18438_b9", "usk18438_b10", "usk18438_b12",
    // Venice 2025 — Boys 8 (tcode 19418 e formato antigo; Manuel jogou Boys 11)
    "venice25_b8", "usk19418_b8",
  ];

  const autoTournCols = useMemo(() => {
    const tFixed = new Set(TG_T.map(t => t.id));
    const tFuture = new Set((futureCols ?? []).map(c => c.tid));

    // Tids onde o Manuel tem resultado real
    const manuelTids = new Set<string>();
    const manuel = rivals.find(p => p.isM);
    if (manuel) {
      for (const [tid, res] of Object.entries(manuel.r)) {
        if (res && (res.tp != null || (res.rd?.length ?? 0) > 0)) manuelTids.add(tid);
      }
    }

    const counts = new Map<string, number>();
    for (const p of rivals) {
      for (const [tid, res] of Object.entries(p.r)) {
        if (tFixed.has(tid) || tFuture.has(tid)) continue;
        if (TG_SUPPRESS.some(pfx => tid.startsWith(pfx))) continue; // duplicado de TG_T
        if (!manuelTids.has(tid)) continue;
        if (!res || (res.tp == null && !(res as any).p)) continue;
        counts.set(tid, (counts.get(tid) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .filter(([, n]) => n >= 1)
      .sort((a, b) => {
        const dA = tgGetTournInfo(a[0]).dateExact, dB = tgGetTournInfo(b[0]).dateExact;
        return dB.localeCompare(dA) || b[1] - a[1];
      })
      .map(([tid]) => ({ tid, info: tgGetTournInfo(tid), weight: tgGetTournWeight(tid) }));
  }, [rivals, futureCols]);

  // AVG_R dinâmico para colunas auto-detectadas (para z-tier coloring)
  const autoAvgR = useMemo(() => {
    const m: Record<string, { avg: number; std: number } | null> = {};
    for (const { tid } of autoTournCols) {
      const avgs: number[] = [];
      for (const p of rivals) {
        const res = p.r[tid];
        if (!res || res.tp == null) continue;
        const rounds = res.rd?.filter((x: number) => x > 0);
        if (!rounds?.length) continue;
        const gross = rounds.reduce((a: number, b: number) => a + b, 0);
        avgs.push(gross / rounds.length); // média por ronda
      }
      if (avgs.length < 3) { m[tid] = null; continue; }
      const avg = avgs.reduce((a, b) => a + b, 0) / avgs.length;
      const std = Math.sqrt(avgs.reduce((a, b) => a + (b - avg) ** 2, 0) / avgs.length);
      m[tid] = std > 0 ? { avg, std } : null;
    }
    return m;
  }, [autoTournCols, rivals]);

  const allTournCols = useMemo(() => [
    ...TG_T.map(t => ({ tid: t.id, info: { name: t.name, short: t.short, date: t.date, dateExact: t.dateExact ?? "" }, weight: tgGetTournWeight(t.id), url: t.url, isFixed: true, isFuture: false })),
    ...autoTournCols.map(c => ({ ...c, url: undefined, isFixed: false, isFuture: false })),
    ...(futureCols ?? []).map(c => ({ tid: c.tid, info: { name: c.short, short: c.short, date: "", dateExact: "9999" }, weight: 1.2, url: c.url, isFixed: false, isFuture: true })),
  ], [autoTournCols, futureCols]);

  const list = useMemo(() => {
    // Tids visíveis (colunas reais, sem futuras)
    const visibleTids = new Set(allTournCols.filter(c => !c.isFuture).map(c => c.tid));
    let pl = rivals.filter(p =>
      p.isM || Object.keys(p.r).some(tid => visibleTids.has(tid) && p.r[tid]?.tp != null)
    );
    if (dOnly) pl = pl.filter(x => Object.values(x.r).some(r => r.tp != null));
    if (fTour !== "all") pl = pl.filter(x => x.r[fTour]);
    if (fCo !== "all") pl = pl.filter(x => x.co === fCo);
    if (q) { const ql = q.toLowerCase(); pl = pl.filter(x => x.n.toLowerCase().includes(ql)); }
    pl.sort((a, b) => {
      let cmp = 0;
      if (sort === "name") cmp = a.n.localeCompare(b.n);
      else if (sort === "rank") cmp = (rankMap[a.n] ?? 9999) - (rankMap[b.n] ?? 9999);
      else if (sort === "nT") cmp = tgNPlayed(b) - tgNPlayed(a);
      else if (sort.startsWith("t:")) {
        const tid = sort.slice(2);
        const isFutureTid = allTournCols.find(c => c.tid === tid)?.isFuture ?? false;
        if (isFutureTid) {
          // Coluna de inscrições: inscritos primeiro (1), não inscritos depois (0)
          const inscribed = inscricaoMap.get(tid);
          const aIn = inscribed ? (a.isM ? inscribed.has(norm2("Manuel Medeiros")) : inscribed.has(norm2(a.n))) : false;
          const bIn = inscribed ? (b.isM ? inscribed.has(norm2("Manuel Medeiros")) : inscribed.has(norm2(b.n))) : false;
          cmp = (bIn ? 1 : 0) - (aIn ? 1 : 0);
        } else {
          const posOf = (x: TGPlayer) => { const r = x.r[tid]; if (!r || (r.tp == null && r.p !== "WD")) return 9999; return typeof r.p === "number" ? r.p : 9998; };
          cmp = posOf(a) - posOf(b);
        }
      }
      if (a.isM) return -999;
      if (b.isM) return 999;
      return dir === "desc" ? -cmp : cmp;
    });
    return pl;
  }, [fTour, fCo, q, sort, dir, dOnly, rivals, rankMap, allTournCols, inscricaoMap, norm2]);

  // Manuel KPIs
  const manuelKpis = manuelRef ? (() => {
    const allRds = Object.values(manuelRef.r).flatMap((r: any) => r.rd?.filter((x: number) => x > 0) ?? []) as number[];
    return {
      torn: tgNPlayed(manuelRef),
      rondas: tgNRounds(manuelRef),
      avg: allRds.length ? (allRds.reduce((a, b) => a + b, 0) / allRds.length).toFixed(1) : null,
      best: allRds.length ? Math.min(...allRds) : null,
    };
  })() : null;

  const activeCount = [fTour, fCo].filter(v => v !== "all").length + (dOnly ? 1 : 0) + (q ? 1 : 0);
  const resetAll = () => { setFTour("all"); setFCo("all"); setDOnly(false); setQ(""); };

  return (
    <div>
      {/* Manuel KPIs */}
      {manuelKpis && (
        <div style={{ display:"flex", gap:6, flexWrap:"nowrap", overflowX:"auto", marginBottom:12, alignItems:"stretch", scrollbarWidth:"none" }}>
          <KpiCard
            label="MANUEL — TOTAL"
            labelStyle={{ color:"var(--color-info-alt)", fontSize: 9, marginBottom:3 }}
            value={
              <div style={{ display:"flex", gap:8, alignItems:"baseline" }}>
                <span><span className="fw-800 fs-14">{manuelKpis.torn}</span><span style={{ fontSize: "var(--fs-9)", color:"var(--text-3)", marginLeft:2 }}>T</span></span>
                <span><span className="fw-800 fs-14">{manuelKpis.rondas}</span><span style={{ fontSize: "var(--fs-9)", color:"var(--text-3)", marginLeft:2 }}>R</span></span>
                {manuelKpis.avg && <span><span className="fw-700 fs-13">{manuelKpis.avg}</span><span style={{ fontSize: "var(--fs-9)", color:"var(--text-3)", marginLeft:2 }}>avg</span></span>}
                {manuelKpis.best && <span><span className="fw-700 fs-13" style={{ color:"var(--color-good-dark)" }}>{manuelKpis.best}</span><span style={{ fontSize: "var(--fs-9)", color:"var(--text-3)", marginLeft:2 }}>min</span></span>}
              </div>
            }
            style={{ flex:"0 0 auto", padding:"6px 10px", background:"var(--bg-info-subtle,var(--bg-info))", borderLeft:"3px solid var(--accent)", minWidth:0 }}
          />
          {TG_T.map(t => {
            const res = manuelRef?.r[t.id];
            if (!res) return (
              <KpiCard key={t.id} label={t.short} value="–" size="sm" style={{ opacity:.4, padding:"6px 8px", flex:"1 1 60px", minWidth:60 }} />
            );
            return (
              <KpiCard key={t.id} label={t.short} value={tgFmtSign(res.tp)} sub={<>#{res.p as number}{res.rd?.length > 0 && <span style={{ marginLeft:3, opacity:.7 }}>{res.rd.join("-")}</span>}</>} color={tgTpColorDark(res.tp)} size="sm" style={{ padding:"6px 8px", flex:"1 1 60px", minWidth:60 }} />
            );
          })}
        </div>
      )}

      {/* Filtros */}
      <div style={{ marginBottom:8 }}>
        <div className="detail-toolbar" style={{ flexWrap:"wrap" }}>
          <input type="text" placeholder="Pesquisar..." value={q} onChange={e => setQ(e.target.value)} className="input" style={{ maxWidth:140 }} />
          <select value={fTour} onChange={e => setFTour(e.target.value)} className="select">
            <option value="all">Todos Torneios</option>
            {allTournCols.map(({ tid, info }) => <option key={tid} value={tid}>{info.short} {info.date}</option>)}
          </select>
          <select value={fCo} onChange={e => setFCo(e.target.value)} className="select">
            <option value="all">🌍 País</option>
            {allCountries.map(c => <option key={c} value={c}>{flag(c)} {c}</option>)}
          </select>
          <button
            className={`p p-filter p-sm${showFilters ? " active" : ""}`}
            onClick={() => setShowFilters(s => !s)}
            style={{ position:"relative" }}>
            Filtros {showFilters ? "▲" : "▼"}
            {activeCount > 0 && (
              <span style={{ position:"absolute", top:-4, right:-4, background:"var(--accent)", color:"#fff", borderRadius:"50%", width:16, height:16, fontSize: "var(--fs-10)", fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {activeCount}
              </span>
            )}
          </button>
          {activeCount > 0 && <button className="p p-filter p-sm" onClick={resetAll} style={{ color:"var(--color-danger)" }}>✕ Limpar</button>}
          <div className="chip" style={{ marginLeft:"auto" }}>{list.length} jogadores</div>
        </div>
        {showFilters && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", padding:"8px 0 4px", borderTop:"1px solid var(--border-light)", marginTop:6 }}>
            <label className="filter-checkbox" style={{ fontSize: "var(--fs-11)" }}>
              <input type="checkbox" checked={dOnly} onChange={e => setDOnly(e.target.checked)} /> Só com dados
            </label>
          </div>
        )}
      </div>

      {/* Legenda tiers */}
      <div className="legend-row" style={{ marginBottom:8 }}>
        {(Object.keys(TG_TIER) as Array<keyof typeof TG_TIER>).map(k => (
          <span key={k} className="legend-item">
            <span className="legend-dot" style={{ background: TG_TIER[k].bg }} />
            <span style={{ color: TG_TIER[k].c, fontSize: "var(--fs-10)" }}>{TG_TIER_L[k]}</span>
          </span>
        ))}
      </div>

      {/* Tabela */}
      <div className="card">
        <div className="scroll-x">
          <table className="bc-collapse">
            <thead>
              <tr className="rivais-group-header">
                <SortableHdr k="name" sortKey={sort} sortDir={dir} onSort={toggleSort} className="rivais-th-name">Jogador</SortableHdr>
                <SortableHdr k="nT" sortKey={sort} sortDir={dir} onSort={toggleSort} className="rivais-th ta-c" title="Torneios">#T</SortableHdr>
                {allTournCols.map(({ tid, info, weight, url, isFixed, isFuture }) => {
                  const stars = weight >= 1.3 ? "★★★★★" : weight >= 1.1 ? "★★★★" : weight >= 0.9 ? "★★★" : weight >= 0.6 ? "★★" : weight >= 0.4 ? "★" : "½";
                  return (
                    <SortableHdr key={tid} k={"t:" + tid} sortKey={sort} sortDir={dir} onSort={toggleSort}
                      className="rivais-th ta-c"
                      style={{ minWidth:56, opacity: isFixed ? 1 : 0.85,
                        color: isFuture ? "var(--color-info)" : undefined }}>
                      {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="rivais-link" onClick={e => e.stopPropagation()}>{info.short}</a> : info.short}
                      {!isFuture && <div className="fs-10 fw-500 op-6 mt-1">{stars} {info.date}</div>}
                      {isFuture && <div className="fs-10 fw-500 mt-1" style={{ color:"var(--color-info)" }}>inscrito</div>}
                    </SortableHdr>
                  );
                })}
                <SortableHdr k="rank" sortKey={sort} sortDir={dir} onSort={toggleSort} className="rivais-th ta-c" style={{ borderLeft:"3px solid var(--text-muted)", minWidth:56 }}>Rank</SortableHdr>
                <th className="rivais-th ta-c">Tend.</th>
              </tr>
            </thead>
            <tbody>
              {list.map(p => {
                const isM = p.isM;
                const tr = tgGetTrend(p);
                const fl = flag(p.co);
                const played = tgNPlayed(p);
                return (
                  <tr key={p.n} className={isM ? "rivais-row-ref" : ""}>
                    <td className="rivais-player-name">
                      <span className="rivais-flag" title={p.co}>{fl}</span>
                      <span className={`fs-12${isM ? " fw-700" : " fw-600"}`} style={{ color: isM ? "var(--text)" : "var(--text-2)" }}>{p.n}</span>
                      {isM && <span className="p p-sm p-outline ml-4">REF</span>}
                      {!isM && KidsLink && <KidsLink nome={p.n} />}
                    </td>
                    <td className="ta-c fs-12 fw-600 c-text-3">{played || ""}</td>
                    {allTournCols.map(({ tid, isFixed, isFuture }) => {
                      // Coluna futura: mostrar escalão inscrito se player está inscrito
                      if (isFuture) {
                        const inscribed = inscricaoMap.get(tid);
                        const inscrito = p.isM
                          ? inscribed?.has(norm2("Manuel Medeiros")) ?? false
                          : inscribed?.has(norm2(p.n)) ?? false;
                        return (
                          <td key={tid} className="ta-c"
                            style={{ background: inscrito ? "var(--bg-info-strong,var(--bg-info))" : undefined }}>
                            {inscrito
                              ? <span style={{ fontSize: "var(--fs-14)" }}>⛳</span>
                              : <span className="fs-10 c-border">—</span>}
                          </td>
                        );
                      }
                      const res = p.r[tid];
                      if (!res || (res.tp == null && res.p !== "WD")) return <td key={tid} />;
                      if (res.p === "WD") return <td key={tid}><WdBadge muted /></td>;

                      // Calcular z-tier: usar TG_AVG_R para fixas, autoAvgR para auto
                      const validRd = res.rd?.filter((x: number) => x > 0) ?? [];
                      const rounds = validRd.length || 1;
                      const playerAvg = validRd.length
                        ? validRd.reduce((a: number, b: number) => a + b, 0) / rounds
                        : (res.t != null ? res.t / rounds : 0);
                      let ti: keyof typeof TG_TIER | null = null;
                      const fixedAvgs = TG_AVG_R[tid];
                      const hasFixedAvg = fixedAvgs?.some((x: any) => x != null);
                      if (hasFixedAvg) {
                        const ms = fixedAvgs.filter((x: any): x is {m:number;s:number} => x != null).map((x: {m:number}) => x.m);
                        const ss = fixedAvgs.filter((x: any): x is {m:number;s:number} => x != null).map((x: {s:number}) => x.s);
                        if (ms.length) ti = tgZTier(playerAvg, { m: ms.reduce((a,b)=>a+b,0)/ms.length, s: ss.reduce((a,b)=>a+b,0)/ss.length });
                      } else {
                        const ar = autoAvgR[tid];
                        if (ar) ti = tgZTier(playerAvg, { m: ar.avg, s: ar.std });
                      }
                      const st = ti ? TG_TIER[ti] : null;
                      const tpStr = res.tp != null ? tgFmtSign(res.tp) : "—";
                      return (
                        <td key={tid} className="ta-c" style={{ background: st?.bg || "transparent", padding:"5px 4px" }}>
                          <div className="fw-700 fs-13" style={{ color: st?.c || "var(--text-3)" }}>{tpStr}</div>
                          {res.p != null && <div className="fs-10 fw-600 c-text-3">#{res.p}</div>}
                        </td>
                      );
                    })}
                    <td className="ta-c" style={{ borderLeft:"3px solid var(--border-light)", padding:"4px 6px" }}>
                      {rankMap[p.n] != null ? (
                        <div>
                          <div className="fw-800 fs-13" style={{ color: rankMap[p.n] <= 10 ? "var(--color-good-dark)" : rankMap[p.n] <= 30 ? "var(--text)" : "var(--text-3)" }}>
                            {rankMap[p.n]}º
                          </div>
                          <div className="fs-10 c-text-3">{tgNPlayed(p)}T · {tgNRounds(p)}R</div>
                        </div>
                      ) : <span className="fs-10 c-border">s/d</span>}
                    </td>
                    <td className="ta-c">
                      {tr ? <span className="fw-700 fs-13" style={{ color: TG_TR_I[tr]?.c }}>{TG_TR_I[tr]?.i}</span> : <span className="c-border">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="section-subtitle ta-c mt-10">
        Clica num cabeçalho para ordenar · Rank por to-par médio · ★★★★★ WJGC/World · ★★★★ European/Venice · ★★★ USKids · ½ peso mínimo · ({totalRanked} jogadores classificados)
      </div>
    </div>
  );
}
