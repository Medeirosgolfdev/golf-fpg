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
import { normPaisDisplay, flag as flagOf } from "../utils/flagUtils";
import { getTrend, getAvgZ } from "../utils/mathUtils";
import { scClass, toParClass, tpColorDark } from "../utils/scoreDisplay";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar, ToolbarTitle, ToolbarSep } from "../ui/Toolbar";
import { RoundPill } from "../ui/PillBadge";
import SexBadge from "../ui/SexBadge";
import { useMasterDetail } from "../hooks/useMasterDetail";
import EmptyState from "../ui/EmptyState";
import DetailHeader from "../ui/DetailHeader";
import KpiCard from "../ui/KpiCard";
import ExtLink from "../ui/ExternalLink";
import SidebarSectionTitle from "../ui/SidebarSectionTitle";
import { buildAutoRivals, normName, getScorecards, uskTournNames, uskFieldSizes, fpgTournNames, ffgolfTournNames, ncScoringType, getLoadedKidsFiles, type KidsFileMeta, type AutoRivalPlayer } from "../data/KIDSdataLoader";
import { cachedFetchJson } from "../data/fetchCache";
import { DataSourcesChip, DataSourcesProvider, type DataSource } from "../ui/DataSources";
import { FIELD_2025, VP_PAR, VP_SI, VP_M, VP_WJGC26_PAR, VP_WJGC26_SI, VP_WJGC26_M, VP_ALFERINI_PAR, VP_ALFERINI_SI, VP_ALFERINI_M, LT_FORET_PAR, LT_FORET_SI, LT_FORET_M, MS_USKIDS_M_B1011, MS_USKIDS_M_B12, DORAL_GP_M_B1011, DORAL_SF_M_B1213, FIELD_CARDS } from "../data/rivalData";
import { MANUEL_KNOWN_TIDS } from "../constants/manuel";
import { TR_I } from "../constants/config";
import TournScorecard from "./kids/TournScorecard";
import H2HSortableTable from "./kids/H2HSortableTable";
import AnaliseSection from "./kids/AnaliseSection";
import type { H2HConfronto } from "./kids/types";


/* ═══════════════════════════════════
   TYPES
   ═══════════════════════════════════ */
export interface TournResult { p: number | "WD"; t: number | null; tp: number | null; rd: (number | null)[]; nholes?: number }
export interface RivalPlayer {
  n: string;
  co: string;
  isM?: boolean;
  dob?: string;          // "DD/MM/YYYY" quando conhecida
  r: Record<string, TournResult>;
  up: string[];
}


/** Deriva label de escalão a partir de ageMin/ageMax */
export function ageLabel(ageMin?: number, ageMax?: number): string | null {
  if (ageMin == null && ageMax != null) return `Sub-${ageMax}`;
  if (ageMin == null || ageMax == null) return null;
  if (ageMin === ageMax) return `Boys ${ageMin}`;
  return `Boys ${ageMin}-${ageMax}`;
}

/* ── Member History (USKids) types ── */
export interface MHTournRound { gross: number }
export interface MHTournament {
  name: string; ageGroup: string; place: number;
  totalStrokes: number; rounds: Record<string, MHTournRound>;
  par?: number[]; startDate?: string;
}
export interface MHPlayer { memberId: string; name: string; torneios: Record<string, MHTournament & { tid?: string }> }
export interface MHData { jogadores: Record<string, MHPlayer> }

/* ═══════════════════════════════════
   CONFIG
   ═══════════════════════════════════ */


/* T extraído para kids/tournDef.ts */
import { T } from "./kids/tournDef";
import type { TournDef } from "./kids/tournDef";
export { T };
export type { TournDef };

// Tournament prestige weight: rounds (40%) + field size (35%) + internationality (25%)
// Uses intendedRounds when available (e.g. QDL reduced by weather)
export function getTournWeight(tid: string): number {
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
export const AUTO_TOURN_META: Record<string, { field: number; nations: number; par: number; url?: string }> = {
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

export const AUTO_TOURN_NAMES: Record<string, { name: string; short: string; date: string }> = {
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
 *  - uskidsUrl: quando existe no T[] ou AUTO_TOURN_META
 *  - fpgUrl: classif FPG pública para tids fpg{tcode}
 *  - ffgolfUrl: página resultats-details do FFGolf para tids ff{trnId}_U{N} */
export function getTournLinks(tid: string, manualUrl?: string): { signupanytimeUrl?: string; uskidsUrl?: string; fpgUrl?: string; ffgolfUrl?: string; lgsUrl?: string; ncUrl?: string } {
  const uskidsUrl = manualUrl ?? AUTO_TOURN_META[tid]?.url;
  const signupanytimeUrl = getSignupanytimeUrl(tid);
  const fpgUrl = getFpgUrl(tid);
  const ffgolfUrl = getFfgolfUrl(tid);
  const lgsUrl = getLgsUrl(tid);
  const ncUrl = getNextCaddyUrl(tid);
  return { signupanytimeUrl, uskidsUrl, fpgUrl, ffgolfUrl, lgsUrl, ncUrl };
}

/** Para tids LGS ("lgs{id}") devolve URL para clasificacion do livegolfscoring. */
function getLgsUrl(tid: string): string | undefined {
  const m = tid.match(/^lgs(\d+)$/);
  if (!m) return undefined;
  return `https://rfegolf.livegolfscoring.es/torneos/clasificacion/${m[1]}`;
}

/** Para tids NextCaddy ("nc{tourId}_{ageKey}") devolve URL para nextcaddy.com. */
function getNextCaddyUrl(tid: string): string | undefined {
  const m = tid.match(/^nc(\d+)/);
  if (!m) return undefined;
  return `https://www.nextcaddy.com/tour/${m[1]}/clasificaciones`;
}

/** Para tids FPG ("fpg{tcode}"), constrói URL para a classif pública FPG.
 *  Aceita tcodes simples ("10647") ou pré-fundidos ("10674+10676") — neste caso
 *  usa o primeiro tcode da combinação. */
function getFpgUrl(tid: string): string | undefined {
  const m = tid.match(/^fpg([\d+]+)$/);
  if (!m) return undefined;
  const fpg = fpgTournNames.get(tid);
  const ccode = fpg?.ccode || "000";
  const tcode = m[1].split("+")[0];  // se houver "+", usa só o primeiro
  return `https://scoring.fpg.pt/lists/linkpage.aspx?page=classif&club=${ccode}&tourn=${tcode}&ack=8428ACK987`;
}

/** Para tids FFGolf ("ff{trnId}_U{N}") devolve URL útil para o utilizador.
 *
 *  Estratégia em duas camadas:
 *  1. Se temos partKey + typeCompetition + ligue (vêm do scraper FFGolf) →
 *     URL com query params para a SPA `pages.ffgolf.org/resultats/`. A SPA
 *     pode ou não auto-carregar (depende de cookies), mas pelo menos abre
 *     no portal certo e o user encontra rapidamente.
 *  2. Caso contrário, fallback: pesquisa Google restrita aos sites oficiais. */
function getFfgolfUrl(tid: string): string | undefined {
  if (!tid.startsWith("ff")) return undefined;
  const ff = ffgolfTournNames.get(tid);
  if (!ff?.name) return undefined;

  // Tentar URL directa quando temos os identificadores completos
  const trnId = ff.trnId;
  const partKey = ff.partKey;
  const tc = ff.typeCompetition;
  const lg = ff.ligue;
  if (trnId && partKey && tc && lg) {
    const params = new URLSearchParams({
      trnId, glfPartKey: partKey, typeCompetition: tc, ligue: lg, iframe: "1",
    });
    return `https://pages.ffgolf.org/resultats/?${params.toString()}`;
  }

  // Fallback: pesquisa Google restrita
  const yr = ff.dateExact?.slice(0, 4) || "";
  const sites = "site:ffgolf.org OR site:lgpidf.com OR site:cpi.ffgolf.org";
  const q = `${ff.name} ${yr} ${sites}`.trim();
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/** @deprecated usar getTournLinks — mantido para não quebrar chamadas existentes.
 *  Nota: NÃO inclui getFfgolfUrl porque o link FFGolf é renderizado separadamente
 *  via getTournLinks().ffgolfUrl (botão ↗ FFG). Caso contrário, t.url e ffgolfUrl
 *  apontariam para o mesmo URL e apareceriam dois botões idênticos. */
export function getTournUrl(tid: string, existingUrl?: string): string | undefined {
  return existingUrl ?? AUTO_TOURN_META[tid]?.url ?? getFpgUrl(tid) ?? getLgsUrl(tid);
}

/** Lookup tournament display info by id (works for manual T and auto tourns) */
export function getTournInfo(tid: string): { name: string; short: string; date: string; dateExact: string } {
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
  // FPG juniores: "fpg{tcode}" — tcode pode conter + para torneios pré-fundidos (jovens_2023)
  if (/^fpg[\d+]+$/.test(tid)) {
    const fpg = fpgTournNames.get(tid);
    if (fpg) return { name: fpg.name, short: fpg.short, date: fpg.date, dateExact: fpg.dateExact };
  }
  // FFGolf (Fédération Française): "ff{nome}" — Champ. France, Internationaux, etc.
  if (tid.startsWith("ff")) {
    const ff = ffgolfTournNames.get(tid);
    if (ff) return { name: ff.name, short: ff.short, date: ff.date, dateExact: ff.dateExact };
  }
  // RFEGolf livegolfscoring: "lgs{id}" — registado por processRfegolfRivals em uskTournNames
  if (tid.startsWith("lgs")) {
    const lgs = uskTournNames.get(tid);
    if (lgs) return { name: lgs.name, short: lgs.short, date: lgs.date, dateExact: lgs.dateExact };
  }
  // RFEGolf NextCaddy: "nc{tourId}_{ageKey}" — registado por processRfegolfRivals (mesmo path)
  if (tid.startsWith("nc")) {
    const nc = uskTournNames.get(tid);
    if (nc) return { name: nc.name, short: nc.short, date: nc.date, dateExact: nc.dateExact };
  }
  // ── Fallback graceful — Maps ainda não populados (HMR / load incompleto) ──
  // Em vez de devolver o tid bruto + dateExact "9999" (que renderiza como
  // "1 janeiro"), tentamos reconstruir algo legível do próprio tid e usar
  // dateExact vazio (a UI ignora datas vazias).
  if (tid.startsWith("ff")) {
    const m = /^ff(\d+)_(U\d+)$/.exec(tid);
    if (m) return { name: `GP Jeunes ${m[2]}`, short: `FFG ${m[2]}`, date: "", dateExact: "" };
    return { name: "FFGolf", short: "FFG", date: "", dateExact: "" };
  }
  if (tid.startsWith("lgs")) return { name: "LiveGolfScoring", short: "LGS", date: "", dateExact: "" };
  if (tid.startsWith("nc")) {
    const m = /^nc\d+_(.+)$/.exec(tid);
    return { name: m ? `RFEG ${m[1]}` : "RFEG", short: "RFEG", date: "", dateExact: "" };
  }
  if (tid.startsWith("usk")) return { name: "USKids", short: "USK", date: "", dateExact: "" };
  if (tid.startsWith("fpg")) return { name: "FPG Jovens", short: "FPG", date: "", dateExact: "" };
  return { name: tid, short: tid, date: "", dateExact: "" };
}

/* ═══════════════════════════════════
   DOB DEDUCTION UTILITIES
   ═══════════════════════════════════ */
/** Parse "DD/MM/YYYY" → Date */
/* dobInference extraído para kids/dobInference.ts */
import { parseDob, ageAt, computeDobInfo, escalaoIntl, dobRangeStrict, arePlayersCompatible, T_MAP } from "./kids/dobInference";
import type { DobInfo } from "./kids/dobInference";


export const UP = [
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

export const D: RivalPlayer[]=[
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
   COHERENCE CHECKS — prevenir merges errados de jogadores diferentes
   ═══════════════════════════════════ */

/**
 * Devolve a janela DOB inferida das tids de um jogador (ou DOB exacta se p.dob).
 * Versão STRICT: tenta intersectar todas as constraints. Se não há informação
 * suficiente, retorna [null, null] — caller assume "não conclusivo".
 *
 * Usa as registries uskTournNames, fpgTournNames, ffgolfTournNames + T_MAP.
 */
/* dobInference (part 2) extraído para kids/dobInference.ts */

export const manuel = D.find(x => x.isM)!;

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
  const [fileMeta, setFileMeta] = React.useState<KidsFileMeta[]>([]);

  React.useEffect(() => {
    // HMR safety: se os Maps globais estão vazios (foram reset pelo Vite HMR
    // mas o cache _autoRivalsCache também foi reset), buildAutoRivals vai
    // re-correr e repopular tudo. Se os Maps já estão populados (load fresco),
    // a cache devolve o resultado cached imediatamente.
    buildAutoRivals((p) => setProgress({ ...p })).then(autoPlayers => {
      setFileMeta(getLoadedKidsFiles());
      // Trabalhar sobre uma cópia profunda de D — canonicalizar `co` na origem
      // para que entradas estáticas ("Russian Federation", "Great Britain")
      // dedupem com as canonicalizadas pelo loader ("Russia", "United Kingdom").
      const map = new Map<string, RivalPlayer>(
        D.map(p => [normName(p.n), { ...p, co: normPaisDisplay(p.co), r: { ...p.r } }])
      );
      // Helper: aplica os dados do `ap` num player existente
      const applyApIntoExisting = (ex: RivalPlayer, ap: AutoRivalPlayer, apCoCanon: string) => {
        for (const [tid, res] of Object.entries(ap.r)) {
          if (!ex.r[tid] || res.rd.length > (ex.r[tid]?.rd.length ?? 0))
            ex.r[tid] = { ...res, p: res.p ?? "WD" } as TournResult;
        }
        if (ap.fpgClub) (ex as any).fpgClub = ap.fpgClub;
        if (ap.dob && !ex.dob) ex.dob = fpgDobToPt(ap.dob);
        if (apCoCanon === "Portugal" && !ex.isM) ex.co = "Portugal";
        if (ap.memberId && !(ex as any).memberId) (ex as any).memberId = ap.memberId;
        // Identidades por federação
        if (ap.esLicencia && !(ex as any).esLicencia) (ex as any).esLicencia = ap.esLicencia;
        if (ap.esClub && !(ex as any).esClub) (ex as any).esClub = ap.esClub;
        if (ap.esFullName && !(ex as any).esFullName) (ex as any).esFullName = ap.esFullName;
        if (ap.esSex && !(ex as any).esSex) (ex as any).esSex = ap.esSex;
        if (ap.esCatEdad && !(ex as any).esCatEdad) (ex as any).esCatEdad = ap.esCatEdad;
        if (ap.esRegion && !(ex as any).esRegion) (ex as any).esRegion = ap.esRegion;
        if (ap.esHcp != null && (ex as any).esHcp == null) (ex as any).esHcp = ap.esHcp;
        if (ap.esHcpDate && !(ex as any).esHcpDate) (ex as any).esHcpDate = ap.esHcpDate;
        if (ap.ptFed && !(ex as any).ptFed) (ex as any).ptFed = ap.ptFed;
        if (ap.frFed && !(ex as any).frFed) (ex as any).frFed = ap.frFed;
      };

      // Helper: cria um novo RivalPlayer a partir de um AutoRivalPlayer
      const buildNewPlayer = (ap: AutoRivalPlayer, apCoCanon: string): RivalPlayer => {
        const convertedR: Record<string, TournResult> = Object.fromEntries(
          Object.entries(ap.r).map(([k, v]) => [k, { ...v, p: v.p ?? "WD" } as TournResult])
        );
        const newPlayer: RivalPlayer = { n: ap.n, co: apCoCanon, r: convertedR, up: [] };
        if (ap.fpgClub) (newPlayer as any).fpgClub = ap.fpgClub;
        if (ap.dob) newPlayer.dob = fpgDobToPt(ap.dob);
        if (ap.memberId) (newPlayer as any).memberId = ap.memberId;
        if (ap.esLicencia) (newPlayer as any).esLicencia = ap.esLicencia;
        if (ap.esClub) (newPlayer as any).esClub = ap.esClub;
        if (ap.esFullName) (newPlayer as any).esFullName = ap.esFullName;
        if (ap.esSex) (newPlayer as any).esSex = ap.esSex;
        if (ap.esCatEdad) (newPlayer as any).esCatEdad = ap.esCatEdad;
        if (ap.esRegion) (newPlayer as any).esRegion = ap.esRegion;
        if (ap.esHcp != null) (newPlayer as any).esHcp = ap.esHcp;
        if (ap.esHcpDate) (newPlayer as any).esHcpDate = ap.esHcpDate;
        if (ap.ptFed) (newPlayer as any).ptFed = ap.ptFed;
        if (ap.frFed) (newPlayer as any).frFed = ap.frFed;
        return newPlayer;
      };

      for (const ap of autoPlayers) {
        const baseKey = resolvePlayerKey(ap.n);
        const apCoCanon = normPaisDisplay(ap.co || "");

        // Pseudo-jogador a partir do ap, para usar arePlayersCompatible
        const apAsRP: RivalPlayer = {
          n: ap.n,
          co: apCoCanon,
          dob: ap.dob ? fpgDobToPt(ap.dob) : undefined,
          r: Object.fromEntries(
            Object.entries(ap.r).map(([k, v]) => [k, { ...v, p: v.p ?? "WD" } as TournResult])
          ),
          up: [],
        };
        if (ap.memberId) (apAsRP as any).memberId = ap.memberId;

        // Tenta merge na chave principal. Se incompatível por evidência forte
        // (memberId mismatch ou DOB explícitas distintas), abre 1 slot alternativo.
        // Para mais raros (evidência ainda mais clara), última fallback.
        if (!map.has(baseKey)) {
          map.set(baseKey, buildNewPlayer(ap, apCoCanon));
        } else {
          const ex = map.get(baseKey)!;
          if (arePlayersCompatible(ex, apAsRP)) {
            applyApIntoExisting(ex, ap, apCoCanon);
          } else {
            const altKey = `${baseKey}__alt2`;
            if (!map.has(altKey)) {
              map.set(altKey, buildNewPlayer(ap, apCoCanon));
            } else {
              const exAlt = map.get(altKey)!;
              if (arePlayersCompatible(exAlt, apAsRP)) {
                applyApIntoExisting(exAlt, ap, apCoCanon);
              }
              // sem alt3+ — caso seja preciso, prefere ignorar a fundir errado
            }
          }
        }
      }
      setMerged(Array.from(map.values()));
      setLoaded(true);
    }).catch(err => {
      console.warn("rivaisDataLoader: erro ao carregar JSON", err);
      setFileMeta(getLoadedKidsFiles());
      setLoaded(true);
    });
  }, []);

  return { rivals: merged, loaded, progress, fileMeta };
}

/** Hook: carrega uskids-member-history-slim.json e transforma em MHData */
function useMemberHist() {
  const [mh, setMh] = React.useState<MHData | null>(null);
  React.useEffect(() => {
    type SlimData = {
      torneios: Record<string, { name: string; startDate: string; holesPerRound: number; par: number[] | null }>;
      jogadores: Record<string, {
        name: string; country: string; ageGroup: string;
        torneios: Record<string, { ageGroup: string; place: number | null; rounds: Record<string, { gross: number; strokes?: number[] }> }>;
      }>;
    };
    cachedFetchJson<SlimData>("/data/uskids-member-history-slim.json")
      .then(slim => {
        if (!slim) return;
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
    cachedFetchJson<ScoringStatsData>("/data/uskids-player-scoring-stats.json")
      .then(d => { if (d) setStats(d); })
      .catch(() => {});
  }, []);
  return stats;
}


/** Extrai o ano de um dateExact (YYYY-MM-DD) ou de um texto de data ("Fev 2025") */
export function yearOf(dateExact?: string, fallback?: string): number {
  if (dateExact) return parseInt(dateExact.slice(0, 4));
  return parseInt(fallback?.match(/(\d{4})/)?.[1] ?? "0");
}

/** ±par color — variante local intencional: retorna sempre cor (nunca undefined), usa dark variants para contraste em cards */
export function tpColorMH(tp: number | null): string {
  if (tp == null) return "var(--text-3)";
  if (tp < 0) return "var(--color-good-dark)";
  if (tp === 0) return "var(--text-2)";
  return "var(--color-danger)";
}

/* ═══════════════════════════════════
   SCORECARD DATA — WJGC 2026 (3 rondas)
   ═══════════════════════════════════ */
// Villa Padierna Flamingos — tee WJGC 2026 (away-villa-padierna-flamingos-espanha-2)
/* courseScorecards extraído para kids/courseScorecards.ts */
import { WJGC26_CARDS, EOWAGR25_CARDS, WJGC26_1213_CARDS, WJGC26_PAR, WJGC26_SI, WJGC26_M, WJGC26_1213_PAR, WJGC26_1213_SI, WJGC26_1213_M, EOWAGR25_PAR, EOWAGR25_SI, EOWAGR25_M } from "./kids/courseScorecards";


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
export function matchName(dName: string, cardName: string): boolean {
  if (dName === cardName) return true;
  const dn = dName.toLowerCase().split(" ");
  const cn = cardName.toLowerCase().split(" ");
  return dn[0] === cn[0] && dn[dn.length - 1] === cn[cn.length - 1];
}
export function findCard<T extends { n: string }>(cards: T[], dName: string): T | undefined {
  return cards.find(c => matchName(dName, c.n));
}

/* ── Canonical tournament name (strips year, normalises) ── */
export function tornCanonK(name: string): string {
  return name.toLowerCase()
    .replace(/\s*\d{4}$/g, "").replace(/\s*'\d{2}$/g, "")
    .replace(/[^a-z0-9]/g, "").trim();
}

/* ── Player type classification — adapta USKIDSPage ──
 *
 * Camadas de elegibilidade:
 *   1. Mínimo de torneios jogados — sample size pequeno não dá tier.
 *   2. Idade Manuel-relevante — kids fora do range ±2 anos não dão "rival" no
 *      sentido prático (ele nunca joga com eles), pelo que não recebem tier.
 *      Implementação: usa janela DOB inferida; se a janela está completamente
 *      fora do range Manuel±2 anos, descarta. Se for ambígua (parcial), aceita.
 */
export function getPlayerType(rival: RivalPlayer): { label: string; bg: string; fg: string } | null {
  if (rival.isM) return null;
  const hidden = hiddenTids(rival);
  const positions = Object.entries(rival.r)
    .filter(([tid, r]) => !hidden.has(tid) && typeof r?.p === "number" && (r.p as number) > 0)
    .map(([, r]) => r.p as number);
  if (!positions.length) return null;

  const total   = nPlayed(rival);
  // Camada 1 — sample size mínimo para Tiers 'top'. Sem isto, 1 vitória num
  // único torneio seria suficiente para "Top Contender".
  const MIN_TOURNAMENTS_TIER = 3;

  // Camada 2 — gate por idade. Manuel nasceu MANUEL_BIRTH_YEAR (2014) → rival
  // tem de poder ter idade ±2 anos da do Manuel HOJE.
  // Se a janela DOB inferida do rival estiver completamente fora desse range,
  // não atribuir tier.
  const MANUEL_DOB = parseDob("29/04/2014");
  const todayMs = Date.now();
  const manuelAgeYears = (todayMs - MANUEL_DOB.getTime()) / (365.25 * 86400000);
  const minPlausibleAge = manuelAgeYears - 2;  // até 2 anos mais novo
  const maxPlausibleAge = manuelAgeYears + 2;  // até 2 anos mais velho
  const [rLo, rHi] = dobRangeStrict(rival);
  // Calcular idade actual do rival a partir da janela DOB
  if (rLo) {
    const ageFromLo = (todayMs - rLo.getTime()) / (365.25 * 86400000); // idade máxima
    if (ageFromLo > maxPlausibleAge + 0.5) return null; // demasiado velho
  }
  if (rHi) {
    const ageFromHi = (todayMs - rHi.getTime()) / (365.25 * 86400000); // idade mínima
    if (ageFromHi < minPlausibleAge - 0.5) return null; // demasiado novo
  }

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
  const years   = Object.keys(rival.r).map(tid => parseInt((getTournInfo(tid).dateExact ?? "0").slice(0, 4))).filter(y => y > 2010);
  const anosActivo = years.length ? Math.max(...years) - Math.min(...years) + 1 : 0;

  // Tiers altos (Elite/Top/Forte) exigem amostra mínima
  if (total >= MIN_TOURNAMENTS_TIER) {
    if (wins >= 3 && avgPos <= 4)                        return { label: "🏆 Elite",            bg: "var(--score-eagle)",    fg: "#fff" };
    if (wins >= 1 && avgPos <= 5)                        return { label: "⭐ Top Contender",     bg: "var(--medal-gold)",     fg: "#fff" };
    if (avgPos <= 8 && (avgPct == null || avgPct <= 25)) return { label: "🎯 Forte Competidor",  bg: "var(--color-good-dark)", fg: "#fff" };
  }
  // Tiers de volume já têm os seus próprios mínimos
  if (total >= 20 && anosActivo >= 4)                    return { label: "🔁 Assíduo",           bg: "var(--text-dark)",      fg: "#fff" };
  if (avgPos <= 12 && total >= 10)                       return { label: "✅ Consistente",        bg: "var(--accent)",         fg: "#fff" };
  return null;
}

/* ══════════════════════════════════════════════════════
   RIVALS CONTEXT — partilha o array de rivais (após
   auto-merge async) por todos os sub-componentes
   ══════════════════════════════════════════════════════ */
const RivalsCtx = React.createContext<RivalPlayer[]>(D);
export function useRivals() { return React.useContext(RivalsCtx); }

const MemberHistCtx = React.createContext<MHData | null>(null);
export function useMH() { return React.useContext(MemberHistCtx); }

const ScoringStatsCtx = React.createContext<ScoringStatsData | null>(null);
export function useScoringStatsCtx() { return React.useContext(ScoringStatsCtx); }

/* ── Rank map derivado do array de rivais ── */
export function buildRankMap(rivals: RivalPlayer[]): Record<string, number> {
  const scored = rivals.map(p => ({ n: p.n, z: (getAvgZ as unknown as (p: RivalPlayer) => number | null)(p) })).filter(x => x.z != null) as { n: string; z: number }[];
  scored.sort((a, b) => a.z - b.z);
  const m: Record<string, number> = {};
  scored.forEach((s, i) => { m[s.n] = i + 1; });
  return m;
}

// Inicializado vazio — populado só depois de loaded=true
export let rankMap: Record<string, number> = {};
export let totalRanked = 0;

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

export function hiddenTids(p: RivalPlayer): Set<string> {
  const hidden = new Set<string>();
  for (const [toHide, whenPresent] of HIDDEN_WHEN_PRESENT) {
    if (p.r[toHide]?.rd?.length > 0 && p.r[whenPresent]?.rd?.length > 0)
      hidden.add(toHide);
  }
  return hidden;
}

/**
 * Mapa explícito auto tid → manual T id que o cobre.
 * Necessário quando o id manual não deriva trivialmente do auto tid.
 * (Movido de dentro do componente para topo — usado por sidebar e detail.)
 */
const AUTO_COVERED_BY: Record<string, string> = {
  // brjgt25 (manual) era listado aqui mas conflitava com a regra na linha ~1444
  // que prefere o auto (`wjgc25_b{N}`). Resultado: ambos eram skipados → torneio
  // desaparecia. Mantemos apenas a preferência pelo auto na getCanonicalTids.
  // wjgc26_1213 (manual) cobre o auto
  // wjgc26_1213 (manual) cobre o auto
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

const _MANUAL_TIDS_SET = new Set(T.map(t => t.id));

const _T_BY_NAME = (() => {
  const m = new Map<string, string>();
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim();
  for (const t of T) {
    const k1 = norm(t.name);
    const k2 = norm(t.name).replace(/\s*\d{4}$/, "").trim();
    m.set(k1, t.id); m.set(k2, t.id);
  }
  return m;
})();

/**
 * Devolve os tids "canónicos" de um jogador — um por torneio real, sem
 * duplicação manual/auto. Usado para deduplicar tanto na sidebar (h2hMap)
 * como no detail (confrontosH2H), garantindo que o número de confrontos
 * directos é consistente.
 *
 * Regra:
 *   1. Para cada T[] manual com dados → incluir, EXCEPTO brjgt25 quando
 *      wjgc25_b1011 também existe (preferimos o auto com escalão específico).
 *   2. Para cada auto tid não coberto por manual:
 *      - AUTO_COVERED_BY[tid] aponta para um manual com dados → skip
 *      - usk{tcode}_b{n} cujo info.name corresponde a um T[] com dados → skip
 *      - Caso contrário → incluir.
 */
export function getCanonicalTids(p: RivalPlayer): Set<string> {
  const out = new Set<string>();
  // 1. T[] manuais com dados
  for (const t of T) {
    const r = p.r[t.id];
    if (!r || (!r.rd?.length && r.p == null && r.t == null && r.tp == null)) continue;
    if (t.id === "brjgt25" && p.r["wjgc25_b1011"]?.rd?.length) continue;
    out.add(t.id);
  }
  // 2. Auto tids não cobertos por manual
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim();
  for (const [tid, res] of Object.entries(p.r)) {
    if (_MANUAL_TIDS_SET.has(tid)) continue;
    // Aceitar tids com rd hbh OU pos/total (cp00 maioria sem hbh, só leaderboard)
    if (!res || (!res.rd?.length && res.p == null && res.t == null && res.tp == null)) continue;
    // 2a) AUTO_COVERED_BY explícito
    if (AUTO_COVERED_BY[tid]) {
      const manualTid = AUTO_COVERED_BY[tid];
      if (p.r[manualTid]?.rd?.length) continue;
    }
    // 2b) usk{tcode}_b{n} → match por nome em T[]
    const uskMatch = tid.match(/^(usk\d+)_b\d+$/);
    if (uskMatch) {
      const info = uskTournNames.get(uskMatch[1]);
      if (info) {
        const k1 = norm(info.name);
        const k2 = k1.replace(/\s*\d{4}$/, "").trim();
        const manualTid = _T_BY_NAME.get(k1) ?? _T_BY_NAME.get(k2);
        if (manualTid && p.r[manualTid]?.rd?.length) continue;
      }
    }
    // 2c) Strip _b\d+ suffix → manual T?
    const base = tid.replace(/_b\d+$/, "");
    if (_MANUAL_TIDS_SET.has(base) && p.r[base]?.rd?.length) continue;
    out.add(tid);
  }
  return out;
}

export function nPlayed(p: RivalPlayer) {
  const total = Object.values(p.r).filter(r => r && (r.tp != null || r.rd?.length > 0)).length;
  return total - hiddenTids(p).size;
}

/* ─────────────────────────────────────────────────────────────
   Generic scorecard table (WJGC26, GG26, QDL25)
   ───────────────────────────────────────────────────────────── */
/* TournScorecard extraído para ./kids/TournScorecard.tsx */

/* ── Scoring distribution pills ── */
/* ═══════════════════════════════════
   SIDEBAR
   ═══════════════════════════════════ */
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
  { id: "fr",       label: "🇫🇷 França" },
  { id: "es",       label: "🇪🇸 Espanha" },
];


export function playerMatchesFilter(p: RivalPlayer, fids: Set<string>): boolean {
  if (fids.size === 0) return true;
  const tids = Object.keys(p.r);
  return [...fids].some(fid => {
    if (fid === "directos") return !p.isM && tids.some(t => {
      const base = t.replace(/_b\d+$/, "");
      return MANUEL_KNOWN_TIDS.has(t) || MANUEL_KNOWN_TIDS.has(base) ||
        t.startsWith("wjgc") || t.startsWith("brjgt") ||
        t.startsWith("eowagr") || t.startsWith("venice") ||
        t.startsWith("rome") || t.startsWith("doral") ||
        t.startsWith("gg") || t.startsWith("qdl") || t.startsWith("marco") ||
        t.startsWith("fpg");
    });
    if (fid === "usk_circ") return !p.isM && tids.some(t => /^usk\d+_b\d+$/.test(t));
    if (fid === "wjgc")     return tids.some(t => t.startsWith("wjgc") || t.startsWith("brjgt"));
    if (fid === "eowagr")   return tids.some(t => t.startsWith("eowagr"));
    if (fid === "euro_usk") return tids.some(t =>
      t.startsWith("usk") || t.startsWith("venice") || t.startsWith("rome") ||
      t.startsWith("marco") || t.startsWith("elprat")
    );
    if (fid === "doral")    return tids.some(t => t.startsWith("doral"));
    if (fid === "pt")       return tids.some(t =>
      t.startsWith("gg") || t.startsWith("qdl") || t.startsWith("fpg")
    );
    if (fid === "fr")       return tids.some(t => t.startsWith("ff"));
    if (fid === "es")       return tids.some(t => t.startsWith("lgs") || t.startsWith("nc"));
    return true;
  });
}

/* RivaisSidebar extraído para kids/RivaisSidebar.tsx */
import { RivaisSidebar } from "./kids/RivaisSidebar";




/* ═══════════════════════════════════
   MEMBER HISTORY TABLE — sortable
   ═══════════════════════════════════ */
/* MemberHistTable extraído para kids/MemberHistTable.tsx */
import { MemberHistTable } from "./kids/MemberHistTable";
import type { MHSortCol } from "./kids/MemberHistTable";


/* ═══════════════════════════════════
   EVOLUÇÃO — gráfico recharts normalizado
   ═══════════════════════════════════ */
/* ═══════════════════════════════════
   RivalCharts — extraído para kids/RivalCharts.tsx (2026-05-09)
   ═══════════════════════════════════ */
import { inferNholes, tprNorm, EvolucaoChart, TorneiosRecorrentes, H2HTable } from "./kids/RivalCharts";


/* ═══════════════════════════════════
   RIVAL DETAIL
   ═══════════════════════════════════ */
/* RivalDetail extraído para kids/RivalDetail.tsx */
import { RivalDetail } from "./kids/RivalDetail";




/* ═══════════════════════════════════
   PAGE COMPONENT
   ═══════════════════════════════════ */
function RivaisIntlContent() {
  const { rivals, loaded, progress, fileMeta } = useAutoRivals();
  const allSources: DataSource[] = React.useMemo(() =>
    fileMeta.map(f => ({
      path: f.path,
      status: f.status,
      error: f.error,
      group: f.group,
    })),
    [fileMeta]
  );
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
    // Defensive: canonicalize one final time at display level. Garante que
    // mesmo que algum fluxo escape ao merge, o dropdown nunca tem variantes.
    const s = new Set<string>();
    for (const p of rivals) {
      if (p.isM || !p.co) continue;
      const canon = normPaisDisplay(p.co);
      if (canon) s.add(canon);
    }
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
    <DataSourcesProvider tournaments={[]}>
    <div className="tourn-layout">

      {/* ── Toolbar row 1 ── */}
      <Toolbar>
        <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Lista" />
        <ToolbarTitle>🌍 Kids</ToolbarTitle>
        <DataSourcesChip sources={allSources} />
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
          {paises.map(p => <option key={p} value={p}>{flagOf(p)} {p}</option>)}
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

      <div style={{
        display: "flex", gap: 6, padding: "6px 10px",
        overflowX: "auto", whiteSpace: "nowrap",
        borderBottom: "1px solid var(--border-light)",
        background: "var(--bg)",
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
            <div className="muted p-16">Selecciona um rival à esquerda.</div>
          )}
        </div>
      </div>
    </div>
    </DataSourcesProvider>
    </ScoringStatsCtx.Provider>
    </MemberHistCtx.Provider>
    </RivalsCtx.Provider>
  );
}

export default RivaisIntlContent;
