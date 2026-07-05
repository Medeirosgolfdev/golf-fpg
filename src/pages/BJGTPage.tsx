/**
 * BJGTPage.tsx — módulo de dados + módulos ricos BJGT/EOWAGR
 *
 * ⚠ Já NÃO é uma página. NOTA (2026-07-02): a UI standalone legada
 * (master-detail com sidebar por ano + PasswordGate, rota /bjgt-legacy) foi
 * removida — /bjgt-legacy redirecciona agora para /major.
 *
 * Este módulo exporta o catálogo URLS, o loader loadT, os tipos
 * TData/TDef/RoundData/PlayerData e os módulos ricos (EvoSummary, bjgtEvoFor,
 * makeEvoCols, bjgtMajorDivision — que embrulha FStats/HoleDiff/ManuelDay e o
 * adaptador tDataToTournament) consumidos pela MajorPage (CircuitShell).
 */
import React from "react";
import { scClass, SC } from "../utils/scoreDisplay";
import { isManuelByName as isM } from "../constants/manuel";
import EvoBadge from "../ui/EvoBadge";
import { gf, normPaisDisplay } from "../utils/flagUtils";
import { fmtToPar, fmtSign, fmtSignParen as fmtSub } from "../utils/format";
import type { MultiRoundRow, ExtraColumn } from "../ui/multiRoundTypes";
import { type Tournament as FPGTournament, type Player as FPGPlayer, type RoundScore as FPGRoundScore, type ScorecardOptions } from "./FPGPage";
import { RoundPill } from "../ui/PillBadge";
import { buildEvoMap, type EvoEntry, type EvoInput } from "../hooks/useEvoComparison";
import type { CircuitDivision } from "../ui/circuit/types";

/* ── Types ── */
interface RoundData { day: number; scores: number[] | null; f9: number | null; b9: number | null; gross: number }
interface PlayerData { name: string; country: string; pos: number | null; result: number | null; total: number | null; rounds: RoundData[] }
export interface TData { tournament: string; par: number[]; si?: number[]; yards?: number[]; course?: string; parF9: number; parB9: number; parTotal: number; players: PlayerData[] }
export interface TDef { id: string; label: string; shortLabel: string; data: TData; manuelName: string; year: number; category: string; roundDates?: string[]; series: "bjgt" | "eowagr" }

/* ── Data URLs ── */
/* NOTA: nomes dos ficheiros WJGC actualizados após re-scrape (2026-05-14):
 *   wjgc_2025_contest34   → wjgc_2025_b1011
 *   wjgc_2026_b1011_3r    → wjgc_2026_b1011
 *   wjgc_2026_contest33   → wjgc_2026_b1213
 * `reverseRounds: true` REMOVIDO — o novo scrape-bluegolf.js ordena as rondas
 * pelo label correctamente, deixando de ser necessária inversão manual. */
export const URLS = [
  /* ── BJGT 2025/2026 (Daily Mail WJGC — Villa Padierna, brjgt251 + brjgt2537) ── */
  { id: "2025_b7u",   url: "/data/brjgt251_boys_7under.json",    label: "2025 // Boys 7&U",    shortLabel: "2025 Boys 7&U",    manuelName: "",                          year: 2025, category: "Boys 7&U",    roundDates: undefined, series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/20/leaderboard.htm" },
  { id: "2025_b89",   url: "/data/brjgt251_boys_8-9.json",    label: "2025 // Boys 8-9",    shortLabel: "2025 Boys 8-9",    manuelName: "",                          year: 2025, category: "Boys 8-9",    roundDates: undefined, series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/28/leaderboard.htm" },
  { id: "2025_b1011", url: "/data/brjgt251_boys_10-11.json",  label: "2025 // Boys 10-11",  shortLabel: "2025 Boys 10-11",  manuelName: "Manuel Medeiros",           year: 2025, category: "Boys 10-11",  roundDates: undefined, series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/34/leaderboard.htm" },
  { id: "2025_g1213", url: "/data/brjgt251_girls_12-13.json",  label: "2025 // Girls 12-13", shortLabel: "2025 Girls 12-13", manuelName: "",                          year: 2025, category: "Girls 12-13", roundDates: undefined, series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/43/leaderboard.htm" },
  { id: "2025_bwagr", url: "/data/brjgt251_boys_wagr.json",  label: "2025 // Boys WAGR",   shortLabel: "2025 Boys WAGR",   manuelName: "",                          year: 2025, category: "Boys WAGR",   roundDates: undefined, series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/101/leaderboard.htm" },
  { id: "2026_b89",   url: "/data/brjgt2537_boys_8-9.json",    label: "2026 // Boys 8-9",    shortLabel: "2026 Boys 8-9",    manuelName: "",                          year: 2026, category: "Boys 8-9",    roundDates: ["25 Fev", "26 Fev", "27 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/25/leaderboard.htm" },
  { id: "2026_b1011", url: "/data/brjgt2537_boys_10-11.json",  label: "2026 // Boys 10-11",  shortLabel: "2026 Boys 10-11",  manuelName: "Manuel Francisco Medeiros", year: 2026, category: "Boys 10-11",  roundDates: ["25 Fev", "26 Fev", "27 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/73/leaderboard.htm" },
  { id: "2026_b1213", url: "/data/brjgt2537_boys_12-13.json",  label: "2026 // Boys 12-13",  shortLabel: "2026 Boys 12-13",  manuelName: "",                          year: 2026, category: "Boys 12-13",  roundDates: ["25 Fev", "26 Fev", "27 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/33/leaderboard.htm" },
  { id: "2026_bwagr", url: "/data/brjgt2537_boys_wagr.json",  label: "2026 // Boys WAGR",   shortLabel: "2026 Boys WAGR",   manuelName: "",                          year: 2026, category: "Boys WAGR",   roundDates: ["25 Fev", "26 Fev", "27 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/5/leaderboard.htm" },
  { id: "2026_gwagr", url: "/data/brjgt2537_girls_wagr.json",  label: "2026 // Girls WAGR",  shortLabel: "2026 Girls WAGR",  manuelName: "",                          year: 2026, category: "Girls WAGR",  roundDates: ["25 Fev", "26 Fev", "27 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/69/leaderboard.htm" },
  /* ── BJGT 2025 — escalões adicionais (brjgt251 cobre 14 contests) ── */
  { id: "2025_g7u",   url: "/data/brjgt251_girls_7under.json", label: "2025 // Girls 7&U",   shortLabel: "2025 Girls 7&U",   manuelName: "",                          year: 2025, category: "Girls 7&U",   roundDates: undefined, series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt251/contest/24/leaderboard.htm" },
  { id: "2025_g89",   url: "/data/brjgt251_girls_8-9.json",    label: "2025 // Girls 8-9",   shortLabel: "2025 Girls 8-9",   manuelName: "",                          year: 2025, category: "Girls 8-9",   roundDates: undefined, series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt251/contest/31/leaderboard.htm" },
  { id: "2025_g1011", url: "/data/brjgt251_girls_10-11.json",  label: "2025 // Girls 10-11", shortLabel: "2025 Girls 10-11", manuelName: "",                          year: 2025, category: "Girls 10-11", roundDates: undefined, series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt251/contest/37/leaderboard.htm" },
  { id: "2025_b1213", url: "/data/brjgt251_boys_12-13.json",   label: "2025 // Boys 12-13",  shortLabel: "2025 Boys 12-13",  manuelName: "",                          year: 2025, category: "Boys 12-13",  roundDates: undefined, series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt251/contest/40/leaderboard.htm" },
  { id: "2025_b1415", url: "/data/brjgt251_boys_14-15.json",   label: "2025 // Boys 14-15",  shortLabel: "2025 Boys 14-15",  manuelName: "",                          year: 2025, category: "Boys 14-15",  roundDates: undefined, series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt251/contest/46/leaderboard.htm" },
  { id: "2025_g1415", url: "/data/brjgt251_girls_14-15.json",  label: "2025 // Girls 14-15", shortLabel: "2025 Girls 14-15", manuelName: "",                          year: 2025, category: "Girls 14-15", roundDates: undefined, series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt251/contest/49/leaderboard.htm" },
  { id: "2025_b1618", url: "/data/brjgt251_boys_16-18.json",   label: "2025 // Boys 16-18",  shortLabel: "2025 Boys 16-18",  manuelName: "",                          year: 2025, category: "Boys 16-18",  roundDates: undefined, series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt251/contest/52/leaderboard.htm" },
  { id: "2025_g1618", url: "/data/brjgt251_girls_16-18.json",  label: "2025 // Girls 16-18", shortLabel: "2025 Girls 16-18", manuelName: "",                          year: 2025, category: "Girls 16-18", roundDates: undefined, series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt251/contest/55/leaderboard.htm" },
  { id: "2025_gwagr", url: "/data/brjgt251_girls_wagr.json",   label: "2025 // Girls WAGR",  shortLabel: "2025 Girls WAGR",  manuelName: "",                          year: 2025, category: "Girls WAGR",  roundDates: undefined, series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt251/contest/105/leaderboard.htm" },
  /* ── BJGT 2026 — escalões adicionais (brjgt2537 cobre 14 contests) ── */
  { id: "2026_b7u",   url: "/data/brjgt2537_boys_7under.json",  label: "2026 // Boys 7&U",    shortLabel: "2026 Boys 7&U",    manuelName: "",                          year: 2026, category: "Boys 7&U",    roundDates: ["25 Fev", "26 Fev", "27 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2537/contest/29/leaderboard.htm" },
  { id: "2026_g7u",   url: "/data/brjgt2537_girls_7under.json", label: "2026 // Girls 7&U",   shortLabel: "2026 Girls 7&U",   manuelName: "",                          year: 2026, category: "Girls 7&U",   roundDates: ["25 Fev", "26 Fev", "27 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2537/contest/65/leaderboard.htm" },
  { id: "2026_g89",   url: "/data/brjgt2537_girls_8-9.json",    label: "2026 // Girls 8-9",   shortLabel: "2026 Girls 8-9",   manuelName: "",                          year: 2026, category: "Girls 8-9",   roundDates: ["25 Fev", "26 Fev", "27 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2537/contest/49/leaderboard.htm" },
  { id: "2026_g1011", url: "/data/brjgt2537_girls_10-11.json",  label: "2026 // Girls 10-11", shortLabel: "2026 Girls 10-11", manuelName: "",                          year: 2026, category: "Girls 10-11", roundDates: ["25 Fev", "26 Fev", "27 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2537/contest/21/leaderboard.htm" },
  { id: "2026_g1213", url: "/data/brjgt2537_girls_12-13.json",  label: "2026 // Girls 12-13", shortLabel: "2026 Girls 12-13", manuelName: "",                          year: 2026, category: "Girls 12-13", roundDates: ["25 Fev", "26 Fev", "27 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2537/contest/85/leaderboard.htm" },
  { id: "2026_b1415", url: "/data/brjgt2537_boys_14-15.json",   label: "2026 // Boys 14-15",  shortLabel: "2026 Boys 14-15",  manuelName: "",                          year: 2026, category: "Boys 14-15",  roundDates: ["25 Fev", "26 Fev", "27 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2537/contest/61/leaderboard.htm" },
  { id: "2026_g1415", url: "/data/brjgt2537_girls_14-15.json",  label: "2026 // Girls 14-15", shortLabel: "2026 Girls 14-15", manuelName: "",                          year: 2026, category: "Girls 14-15", roundDates: ["25 Fev", "26 Fev", "27 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2537/contest/9/leaderboard.htm" },
  { id: "2026_b1618", url: "/data/brjgt2537_boys_16-18.json",   label: "2026 // Boys 16-18",  shortLabel: "2026 Boys 16-18",  manuelName: "",                          year: 2026, category: "Boys 16-18",  roundDates: ["25 Fev", "26 Fev", "27 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2537/contest/13/leaderboard.htm" },
  { id: "2026_g1618", url: "/data/brjgt2537_girls_16-18.json",  label: "2026 // Girls 16-18", shortLabel: "2026 Girls 16-18", manuelName: "",                          year: 2026, category: "Girls 16-18", roundDates: ["25 Fev", "26 Fev", "27 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2537/contest/41/leaderboard.htm" },
  /* ── BJGT 2024 (Daily Mail WJGC — Villa Padierna, brjgt243 + brjgt2431) ── */
  { id: "2024_b7u",   url: "/data/brjgt243_boys_7under.json",  label: "2024 // Boys 7&U",    shortLabel: "2024 Boys 7&U",    manuelName: "",                          year: 2024, category: "Boys 7&U",    roundDates: ["20 Fev", "21 Fev", "22 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://www.bluegolf.com/junior/events/brjgt243/index.html" },
  { id: "2024_g7u",   url: "/data/brjgt243_girls_7under.json", label: "2024 // Girls 7&U",   shortLabel: "2024 Girls 7&U",   manuelName: "",                          year: 2024, category: "Girls 7&U",   roundDates: ["20 Fev", "21 Fev", "22 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://www.bluegolf.com/junior/events/brjgt243/index.html" },
  { id: "2024_b89",   url: "/data/brjgt243_boys_8-9.json",     label: "2024 // Boys 8-9",    shortLabel: "2024 Boys 8-9",    manuelName: "",                          year: 2024, category: "Boys 8-9",    roundDates: ["20 Fev", "21 Fev", "22 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://www.bluegolf.com/junior/events/brjgt243/index.html" },
  { id: "2024_g89",   url: "/data/brjgt243_girls_8-9.json",    label: "2024 // Girls 8-9",   shortLabel: "2024 Girls 8-9",   manuelName: "",                          year: 2024, category: "Girls 8-9",   roundDates: ["20 Fev", "21 Fev", "22 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://www.bluegolf.com/junior/events/brjgt243/index.html" },
  { id: "2024_b1011", url: "/data/brjgt243_boys_10-11.json",   label: "2024 // Boys 10-11",  shortLabel: "2024 Boys 10-11",  manuelName: "",                          year: 2024, category: "Boys 10-11",  roundDates: ["20 Fev", "21 Fev", "22 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://www.bluegolf.com/junior/events/brjgt243/index.html" },
  { id: "2024_g1011", url: "/data/brjgt243_girls_10-11.json",  label: "2024 // Girls 10-11", shortLabel: "2024 Girls 10-11", manuelName: "",                          year: 2024, category: "Girls 10-11", roundDates: ["20 Fev", "21 Fev", "22 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://www.bluegolf.com/junior/events/brjgt243/index.html" },
  { id: "2024_g1213", url: "/data/brjgt243_girls_12-13.json",  label: "2024 // Girls 12-13", shortLabel: "2024 Girls 12-13", manuelName: "",                          year: 2024, category: "Girls 12-13", roundDates: ["20 Fev", "21 Fev", "22 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://www.bluegolf.com/junior/events/brjgt243/index.html" },
  { id: "2024_b1213", url: "/data/brjgt2431_boys_12-13.json",  label: "2024 // Boys 12-13",  shortLabel: "2024 Boys 12-13",  manuelName: "",                          year: 2024, category: "Boys 12-13",  roundDates: ["20 Fev", "21 Fev", "22 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://www.bluegolf.com/junior/events/brjgt2431/index.html" },
  { id: "2024_b1415", url: "/data/brjgt2431_boys_14-15.json",  label: "2024 // Boys 14-15",  shortLabel: "2024 Boys 14-15",  manuelName: "",                          year: 2024, category: "Boys 14-15",  roundDates: ["20 Fev", "21 Fev", "22 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://www.bluegolf.com/junior/events/brjgt2431/index.html" },
  { id: "2024_g1415", url: "/data/brjgt2431_girls_14-15.json", label: "2024 // Girls 14-15", shortLabel: "2024 Girls 14-15", manuelName: "",                          year: 2024, category: "Girls 14-15", roundDates: ["20 Fev", "21 Fev", "22 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://www.bluegolf.com/junior/events/brjgt2431/index.html" },
  { id: "2024_b1618", url: "/data/brjgt2431_boys_16-18.json",  label: "2024 // Boys 16-18",  shortLabel: "2024 Boys 16-18",  manuelName: "",                          year: 2024, category: "Boys 16-18",  roundDates: ["20 Fev", "21 Fev", "22 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://www.bluegolf.com/junior/events/brjgt2431/index.html" },
  { id: "2024_g1618", url: "/data/brjgt2431_girls_16-18.json", label: "2024 // Girls 16-18", shortLabel: "2024 Girls 16-18", manuelName: "",                          year: 2024, category: "Girls 16-18", roundDates: ["20 Fev", "21 Fev", "22 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://www.bluegolf.com/junior/events/brjgt2431/index.html" },
  /* ── EOWAGR (European Open WAGR 2025 — Le Touquet GC, La Forêt) ──
     13 escalões (Boys/Girls 7-8→15-18 + 6/Under + Boys/Girls WAGR), um
     ficheiro eowagr25_contest{id}.json por escalão. Os sub-contests "Par 3/4/5"
     são projeções dos mesmos 18 buracos e NÃO se registam (derivam-se via
     scripts/eowagr-par-splits.js). */
  { id: "eo25_b78",    url: "/data/eowagr25_contest121.json", label: "2025 // Boys 7-8",    shortLabel: "2025 Boys 7-8",    manuelName: "",                year: 2025, category: "Boys 7-8",    roundDates: ["11 Ago", "12 Ago", "13 Ago"] as string[], series: "eowagr" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/121/leaderboard.htm" },
  { id: "eo25_g78",    url: "/data/eowagr25_contest109.json", label: "2025 // Girls 7-8",   shortLabel: "2025 Girls 7-8",   manuelName: "",                year: 2025, category: "Girls 7-8",   roundDates: ["11 Ago", "12 Ago", "13 Ago"] as string[], series: "eowagr" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/109/leaderboard.htm" },
  { id: "eo25_b910",   url: "/data/eowagr25_contest13.json",  label: "2025 // Boys 9-10",   shortLabel: "2025 Boys 9-10",   manuelName: "",                year: 2025, category: "Boys 9-10",   roundDates: ["11 Ago", "12 Ago", "13 Ago"] as string[], series: "eowagr" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/13/leaderboard.htm" },
  { id: "eo25_g910",   url: "/data/eowagr25_contest73.json",  label: "2025 // Girls 9-10",  shortLabel: "2025 Girls 9-10",  manuelName: "",                year: 2025, category: "Girls 9-10",  roundDates: ["11 Ago", "12 Ago", "13 Ago"] as string[], series: "eowagr" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/73/leaderboard.htm" },
  { id: "eo25_b1112",  url: "/data/eowagr25_contest21.json",  label: "2025 // Boys 11-12",  shortLabel: "2025 Boys 11-12",  manuelName: "Manuel Medeiros", year: 2025, category: "Boys 11-12",  roundDates: ["11 Ago", "12 Ago", "13 Ago"] as string[], series: "eowagr" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/21/leaderboard.htm" },
  { id: "eo25_g1112",  url: "/data/eowagr25_contest5.json",   label: "2025 // Girls 11-12", shortLabel: "2025 Girls 11-12", manuelName: "",                year: 2025, category: "Girls 11-12", roundDates: ["11 Ago", "12 Ago", "13 Ago"] as string[], series: "eowagr" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/5/leaderboard.htm" },
  { id: "eo25_b1314",  url: "/data/eowagr25_contest77.json",  label: "2025 // Boys 13-14",  shortLabel: "2025 Boys 13-14",  manuelName: "",                year: 2025, category: "Boys 13-14",  roundDates: ["11 Ago", "12 Ago", "13 Ago"] as string[], series: "eowagr" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/77/leaderboard.htm" },
  { id: "eo25_g1314",  url: "/data/eowagr25_contest132.json", label: "2025 // Girls 13-14", shortLabel: "2025 Girls 13-14", manuelName: "",                year: 2025, category: "Girls 13-14", roundDates: ["11 Ago", "12 Ago", "13 Ago"] as string[], series: "eowagr" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/132/leaderboard.htm" },
  { id: "eo25_b1518",  url: "/data/eowagr25_contest151.json", label: "2025 // Boys 15-18",  shortLabel: "2025 Boys 15-18",  manuelName: "",                year: 2025, category: "Boys 15-18",  roundDates: ["11 Ago", "12 Ago", "13 Ago"] as string[], series: "eowagr" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/151/leaderboard.htm" },
  { id: "eo25_g1518",  url: "/data/eowagr25_contest155.json", label: "2025 // Girls 15-18", shortLabel: "2025 Girls 15-18", manuelName: "",                year: 2025, category: "Girls 15-18", roundDates: ["11 Ago", "12 Ago", "13 Ago"] as string[], series: "eowagr" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/155/leaderboard.htm" },
  { id: "eo25_6u",     url: "/data/eowagr25_contest17.json",  label: "2025 // 6/Under",     shortLabel: "2025 6/Under",     manuelName: "",                year: 2025, category: "6/Under",     roundDates: ["11 Ago", "12 Ago", "13 Ago"] as string[], series: "eowagr" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/17/leaderboard.htm" },
  { id: "eo25_bwagr",  url: "/data/eowagr25_contest162.json", label: "2025 // Boys WAGR",   shortLabel: "2025 Boys WAGR",   manuelName: "",                year: 2025, category: "Boys WAGR",   roundDates: ["11 Ago", "12 Ago", "13 Ago"] as string[], series: "eowagr" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/162/leaderboard.htm" },
  { id: "eo25_gwagr",  url: "/data/eowagr25_contest159.json", label: "2025 // Girls WAGR",  shortLabel: "2025 Girls WAGR",  manuelName: "",                year: 2025, category: "Girls WAGR",  roundDates: ["11 Ago", "12 Ago", "13 Ago"] as string[], series: "eowagr" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/159/leaderboard.htm" },
];

/* ── Flags ── */

export function loadT(raw: any, reverseRounds?: boolean): TData {
  const d = raw as TData;
  let players = d.players;
  if (reverseRounds) {
    players = players.map(p => ({ ...p, rounds: [...p.rounds].reverse() }));
  }
  const maxR = Math.max(...players.filter((p: any) => p.rounds?.length > 0).map((p: any) => p.rounds.length));
  players = players.filter((p: any) => p.total != null && p.rounds?.length > 0)
    .sort((a: any, b: any) => {
      const aFull = a.rounds.length === maxR ? 0 : 1;
      const bFull = b.rounds.length === maxR ? 0 : 1;
      if (aFull !== bFull) return aFull - bFull;
      return a.total - b.total;
    });
  let pos = 1;
  players.forEach((p: any, i: number) => {
    if (p.rounds.length < maxR) { p.pos = null; return; }
    const prev = players[i - 1];
    if (i > 0 && p.total != null && prev != null && prev.total != null && p.total > prev.total && prev.rounds.length === maxR) pos = i + 1;
    p.pos = pos;
  });
  return { ...d, players };
}


/* ═══════════════════════════════════════════════════════════════
   ADAPTADOR TData → FPGTournament (padrão DORALPage)
   ═══════════════════════════════════════════════════════════════ */
function tDataToTournament(data: TData, def: TDef): FPGTournament {
  const { par, si, parTotal, players } = data;
  const nR = Math.max(...players.map(p => p.rounds.length), 0);
  // Distâncias: o BlueGolf dá `yards` por buraco → converter para metros.
  const meters = data.yards && data.yards.length >= par.length ? data.yards.map(y => Math.round(y * 0.9144)) : [];
  const hasMeters = meters.length >= par.length && par.length > 0;
  const teeName = hasMeters ? (data.course || "Tee") : undefined;
  const fpgPlayers: FPGPlayer[] = players
    .filter(p => p.rounds.length > 0)
    .map(p => {
      const roundScores: FPGRoundScore[] = p.rounds.map((r, ri) => ({
        round: ri + 1,
        gross: r.gross,
        scores: r.scores ?? [],
        pars: par,
        si: si && si.length >= par.length ? si : [],
        meters: hasMeters ? meters : [],
        teeName,
      }));
      const incomplete = p.rounds.length < nR;
      return {
        scoreId: p.name,
        pos: p.pos,
        name: p.name,
        club: p.country ? `${gf(p.country)} ${normPaisDisplay(p.country)}` : "",
        grossTotal: p.total,
        toPar: p.result ?? (p.total != null ? p.total - parTotal * nR : null),
        nholes: par.length,
        parTotal,
        scores: p.rounds[0]?.scores ?? undefined,
        par,
        si: si && si.length >= par.length ? si : undefined,
        meters: hasMeters ? meters : undefined,
        teeName,
        roundScores,
        _wd: incomplete,
        _roundsPlayed: p.rounds.length,
        _isPortuguese: /portugal/i.test(p.country || "") || /^(pt|prt)$/i.test(p.country || ""),
      } as FPGPlayer;
    });
  return {
    name: def.label,
    tcode: def.id,
    date: "",
    campo: def.series === "eowagr" ? "Le Touquet GC — La Forêt" : def.category === "Boys 12-13" ? "Villa Padierna — Alferini" : "Villa Padierna — Flamingos",
    rounds: nR,
    playerCount: fpgPlayers.length,
    players: fpgPlayers,
  };
}


/** Opções para ocultar colunas FPG-específicas e adaptar ao contexto BJGT */
function bjgtScorecardOptions(): ScorecardOptions {
  return {
    hideHCP: true,
    hideSD: true,
    hideEsc: true,
    hideFed: true,
    hideTee: true,
    clubLabel: "País",
  };
}

/* ═══════════════════════════════════════════════════════════════
   HOLE DIFFICULTY
   ═══════════════════════════════════════════════════════════════ */
function HoleDiff({ data, ri, mn }: { data: TData; ri: number | "all"; mn?: string }) {
  const { par, parF9, parB9, parTotal, players } = data;
  const avgs = par.map((p, i) => {
    const sc: number[] = [];
    for (const pl of players) { if (ri === "all") { for (const r of pl.rounds) if (r.scores?.[i] != null) sc.push(r.scores[i]); } else { const r = pl.rounds[ri]; if (r?.scores?.[i] != null) sc.push(r.scores[i]); } }
    const avg = sc.length > 0 ? sc.reduce((a, b) => a + b, 0) / sc.length : p;
    return { avg, diff: avg - p, n: sc.length };
  });
  if (avgs.every(h => h.n === 0)) return null;
  const m = mn ? players.find(p => isM(p.name)) : null;
  const mr = m && ri !== "all" ? m.rounds[ri] : null;
  return (
    <div className="bjgt-chart-scroll">
      <table className="sc-table-modern" data-sc-table="1">
        <thead><tr>
          <th className="hole-header ta-left"></th>
          {par.slice(0,9).map((_,i) => <th key={i} className="hole-header">{i+1}</th>)}
          <th className="hole-header col-out fs-10">Out</th>
          {par.slice(9).map((_,i) => <th key={i+9} className="hole-header">{i+10}</th>)}
          <th className="hole-header col-in fs-10">In</th>
          <th className="hole-header col-total">TOT</th>
        </tr></thead>
        <tbody>
          <tr className="sep-row"><td className="row-label par-label">Par</td>
            {par.slice(0,9).map((p,i) => <td key={i}>{p}</td>)}<td className="col-out fw-600">{parF9}</td>
            {par.slice(9).map((p,i) => <td key={i+9}>{p}</td>)}<td className="col-in fw-600">{parB9}</td><td className="col-total">{parTotal}</td></tr>
          <tr><td className="row-label fw-700">Média</td>
            {avgs.map((h,i) => <React.Fragment key={i}><td className="fw-600" style={{ color: h.diff > 0.7 ? SC.danger : h.diff < 0.2 ? SC.good : "var(--text-2)" }}>{h.avg.toFixed(1)}</td>{i === 8 && <td className="col-out"></td>}</React.Fragment>)}
            <td className="col-in"></td><td className="col-total fw-700">{avgs.reduce((a,h) => a + h.avg, 0).toFixed(1)}</td></tr>
          <tr className="meta-row sep-row"><td className="row-label c-muted fs-10">vs Par</td>
            {avgs.map((h,i) => <React.Fragment key={i}><td className="fs-10 fw-600" style={{ color: h.diff > 0.7 ? SC.danger : h.diff < 0.2 ? SC.good : "var(--text-muted)" }}>{fmtSign(h.diff, 1)}</td>{i === 8 && <td className="col-out"></td>}</React.Fragment>)}
            <td className="col-in"></td><td className="col-total"></td></tr>
          {mr?.scores && <tr style={{ background: "var(--bg-success-subtle)" }}><td className="row-label fw-700">🇵🇹 Manuel</td>
            {mr.scores.slice(0,9).map((sc,i) => <td key={i}><span className={`sc-score ${scClass(sc, par[i])}`}>{sc}</span></td>)}
            <td className="col-out fw-700">{mr.f9}<span className={`sc-topar ${(mr.f9!-parF9)<0?"sc-under":(mr.f9!-parF9)>0?"sc-over":""}`}>{fmtSign(mr.f9!-parF9)}</span></td>
            {mr.scores.slice(9).map((sc,i) => <td key={i+9}><span className={`sc-score ${scClass(sc, par[9+i])}`}>{sc}</span></td>)}
            <td className="col-in fw-700">{mr.b9}<span className={`sc-topar ${(mr.b9!-parB9)<0?"sc-under":(mr.b9!-parB9)>0?"sc-over":""}`}>{fmtSign(mr.b9!-parB9)}</span></td>
            <td className="col-total fw-700">{mr.gross}<span className={`sc-topar ${(mr.gross-parTotal)<0?"sc-under":(mr.gross-parTotal)>0?"sc-over":""}`}>{fmtSign(mr.gross-parTotal)}</span></td>
          </tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MANUEL DAY ANALYSIS
   ═══════════════════════════════════════════════════════════════ */
function ManuelDay({ data, ri }: { data: TData; ri: number }) {
  const { par, parF9, parB9, parTotal, players } = data;
  const manuel = players.find(p => isM(p.name));
  if (!manuel) return null;
  const r = manuel.rounds[ri]; if (!r?.scores) return null;
  const prevR = ri > 0 ? manuel.rounds[ri - 1] : null;

  const holes = r.scores.map((sc, i) => ({ h: i+1, par: par[i], gross: sc, diff: sc - par[i], prev: prevR?.scores?.[i] ?? null }));
  const eagles = holes.filter(h => h.diff <= -2), birdies = holes.filter(h => h.diff === -1);
  const pars = holes.filter(h => h.diff === 0), bogeys = holes.filter(h => h.diff === 1);
  const doubles = holes.filter(h => h.diff === 2), worse = holes.filter(h => h.diff >= 3);

  const byPar = (t: number) => { const h = holes.filter(x => x.par === t); return { n: h.length, total: h.reduce((s,x) => s+x.diff, 0), avg: h.length ? h.reduce((s,x) => s+x.diff, 0)/h.length : 0, scores: h.map(x => x.gross) }; };
  const p3 = byPar(3), p4 = byPar(4), p5 = byPar(5);

  const vsPrev = prevR?.scores ? holes.map(h => ({ ...h, delta: h.prev != null ? h.gross - h.prev : 0 })) : null;
  const worseVP = vsPrev?.filter(h => h.delta > 0).sort((a,b) => b.delta - a.delta) ?? [];
  const betterVP = vsPrev?.filter(h => h.delta < 0).sort((a,b) => a.delta - b.delta) ?? [];
  const fieldAvg = players.filter(p => p.rounds[ri]).reduce((s,p) => s + p.rounds[ri].gross, 0) / players.filter(p => p.rounds[ri]).length;

  return (
    <div className="card">
      <div className="h-md">🇵🇹 Análise Manuel — R{ri + 1}</div>
      <div className="muted fs-10 mb-8">Gross: {r.gross} ({fmtToPar(r.gross-parTotal)}) · F9: {r.f9} {fmtSub(r.f9!-parF9)} · B9: {r.b9} {fmtSub(r.b9!-parB9)} · Média field: {fieldAvg.toFixed(1)}</div>
      <div className="grid-auto-fill mb-8" style={{ gap: 6 }}>
        {eagles.length > 0 && <div className="card-detail br" style={{ padding: "4px 8px" }}><span className="fw-800" style={{ color: SC.good }}>🦅 {eagles.length}</span><span className="fs-10 c-text-3"> {eagles.map(h => "H"+h.h).join(", ")}</span></div>}
        <div className="card-detail br" style={{ padding: "4px 8px" }}><span className="fw-800" style={{ color: SC.good }}>🐦 {birdies.length}</span><span className="fs-10 c-text-3"> {birdies.map(h => "H"+h.h).join(", ")}</span></div>
        <div className="card-detail br" style={{ padding: "4px 8px" }}><span className="fw-800 c-text-2">⛳ {pars.length} pars</span></div>
        <div className="card-detail br" style={{ padding: "4px 8px" }}><span className="fw-800 c-text-2">📦 {bogeys.length}</span><span className="fs-10 c-text-3"> {bogeys.map(h => "H"+h.h).join(", ")}</span></div>
        {doubles.length > 0 && <div className="card-detail br" style={{ padding: "4px 8px" }}><span className="fw-800 c-warn-dark">💥 {doubles.length} dbl</span><span className="fs-10 c-text-3"> {doubles.map(h => "H"+h.h).join(", ")}</span></div>}
        {worse.length > 0 && <div className="card-detail br" style={{ padding: "4px 8px" }}><span className="fw-800 c-warn-dark">🔥 {worse.length} triple+</span><span className="fs-10 c-text-3"> {worse.map(h => "H"+h.h+"(+"+h.diff+")").join(", ")}</span></div>}
      </div>
      <div className="muted fs-10 mb-4 fw-700">Performance por tipo de buraco</div>
      <div className="grid-auto-fill mb-8" style={{ gap: 6 }}>
        {[{ label: "Par 3", d: p3 },{ label: "Par 4", d: p4 },{ label: "Par 5", d: p5 }].map(({ label, d }) => (
          <div key={label} className="card-detail br" style={{ padding: "4px 8px" }}>
            <div className="fw-700 fs-11">{label} ({d.n})</div>
            <div className="fs-10">{d.scores.join(", ")} → <span className="fw-700" style={{ color: d.total < 0 ? SC.good : d.total > 0 ? SC.danger : undefined }}>{d.total > 0 ? "+"+d.total : d.total === 0 ? "E" : d.total}</span><span className="c-text-3"> (avg {d.avg > 0 ? "+" : ""}{d.avg.toFixed(2)})</span></div>
          </div>
        ))}
      </div>
      {prevR?.scores && vsPrev && <>
        <div className="muted fs-10 mb-4 fw-700">vs R{ri} (anterior: {prevR.gross})</div>
        <div className="gap-12 flex-wrap" style={{ display: "flex" }}>
          {worseVP.length > 0 && <div className="fs-10"><span className="fw-700 c-warn-dark">Pior (+{worseVP.reduce((s,h) => s+h.delta, 0)}):</span> {worseVP.map(h => `H${h.h} ${h.prev}→${h.gross}`).join(", ")}</div>}
          {betterVP.length > 0 && <div className="fs-10"><span className="fw-700" style={{ color: SC.good }}>Melhor ({betterVP.reduce((s,h) => s+h.delta, 0)}):</span> {betterVP.map(h => `H${h.h} ${h.prev}→${h.gross}`).join(", ")}</div>}
        </div>
      </>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FIELD STATS SUMMARY
   ═══════════════════════════════════════════════════════════════ */
function FStats({ data, ri }: { data: TData; ri: number | "all" }) {
  const { parTotal, players } = data;
  const nR = Math.max(...players.map(p => p.rounds.length), 0);
  const fullPlayers = players.filter(p => p.rounds.length === nR);
  const nSC = ri === "all" ? players.filter(p => p.rounds.some(r => r.scores)).length : players.filter(p => p.rounds[ri as number]?.scores).length;
  if (ri === "all") {
    const avg = fullPlayers.reduce((s,p) => s + p.total!, 0) / fullPlayers.length;
    return <div className="muted fs-10 mb-8">{fullPlayers.length} jogadores{nR > 1 && <> (<RoundPill nR={nR} />)</>}{players.length > fullPlayers.length ? ` + ${players.length - fullPlayers.length} WD` : ""} · Par {parTotal} · Média: {avg.toFixed(1)} ({fmtToPar(Math.round(avg - parTotal * nR))}) · Líder: {fullPlayers[0]?.name} ({fullPlayers[0]?.total}){nSC < players.length && ` · ${nSC} com scorecard`}</div>;
  }
  const scores = players.filter(p => p.rounds[ri as number]).map(p => p.rounds[ri as number].gross);
  const avg = scores.reduce((s,v) => s+v, 0) / scores.length;
  return <div className="muted fs-10 mb-8">{scores.length} jogadores · Par {parTotal} · Média R{(ri as number)+1}: {avg.toFixed(1)} ({fmtToPar(Math.round(avg - parTotal))}){nSC < scores.length && ` · ${nSC} com scorecard`}</div>;
}

/** Mini-resumo de evolução ano-a-ano */
export function EvoSummary({ evo, evoYear }: { evo: Map<string, EvoEntry>; evoYear: string }) {
  if (!evo.size) return null;
  const returning = [...evo.values()].filter(e => e.delta !== 0);
  const improved = returning.filter(e => e.delta < 0).length;
  return (
    <div className="lb-evo-summary">
      {evo.size} jogadores regressaram de {evoYear}{returning.length > 0 ? ` · ${improved}/${returning.length} melhoraram (±par)` : ""}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Helpers para a página MAJOR (CircuitShell) — reutilizam os módulos
   ricos locais (HoleDiff/ManuelDay/FStats/EvoSummary) + o adaptador.
   ═══════════════════════════════════════════════════════════════ */

/** Evolução ano-a-ano para um TDef (bidirecional 2025↔2026). Pura (sem hooks). */
export function bjgtEvoFor(cur: TDef, all: TDef[]): { evo?: Map<string, EvoEntry>; evoYear?: string } {
  const refYear = cur.year === 2026 ? 2025 : cur.year === 2025 ? 2026 : 0;
  if (!refYear) return {};
  const refDefs = all.filter((t) => t && t.year === refYear && t.series === cur.series);
  if (!refDefs.length) return {};
  const curNR = Math.max(...cur.data.players.map((p) => p.rounds.length), 0);
  const curParTotal = cur.data.parTotal * curNR;
  const input: EvoInput = {
    currentPlayers: cur.data.players.filter((p) => p.total != null)
      .map((p) => ({ name: p.name, value: p.total! - curParTotal, category: cur.category })),
    referencePlayers: refDefs.flatMap((t) => {
      const tNR = Math.max(...t.data.players.map((p) => p.rounds.length), 0);
      const tPar = t.data.parTotal * tNR;
      return t.data.players.filter((p) => p.total != null)
        .map((p) => ({ name: p.name, value: p.total! - tPar, category: t.category }));
    }),
    referenceYear: String(refYear),
    isManuel: isM,
  };
  const raw = buildEvoMap(input);
  if (cur.year === 2025 && raw.evoMap) {
    const flipped = new Map<string, EvoEntry>();
    for (const [k, v] of raw.evoMap) flipped.set(k, { ...v, delta: -v.delta, from: v.to, to: v.from });
    return { evo: flipped, evoYear: raw.evoYear };
  }
  return { evo: raw.evoMap, evoYear: raw.evoYear };
}

/** Tipo de linha do MultiRoundLeaderboard com posição calculada. */
export type EvoRowWithPos = MultiRoundRow & { _pos?: number | null };

/** Constrói as 3 colunas de evolução ano-a-ano (Ant. · Δ · Percurso).
 *  Partilhado por BJGT/EOWAGR e Junior Orange Bowl no CircuitShell. */
export function makeEvoCols(evo: Map<string, EvoEntry>, evoYear?: string): ExtraColumn<EvoRowWithPos>[] {
  return [
    {
      header: evoYear || "Ant.", className: "ta-c fs-11 fw-600",
      headerStyle: { width: 44, textAlign: "center" as const, padding: "0 3px", borderLeft: "2px solid var(--border)" },
      cell: (row: EvoRowWithPos) => { const ev = evo.get(row.name); return ev ? <span className="inline-sep">{fmtSign(ev.otherValue)}</span> : <span className="c-muted inline-sep">–</span>; },
    },
    {
      header: "Δ", className: "ta-c fs-11 fw-700", headerStyle: { width: 34, textAlign: "center" as const, padding: "0 3px" },
      cell: (row: EvoRowWithPos) => { const ev = evo.get(row.name); if (!ev) return <span className="c-muted">–</span>; return <span style={{ color: ev.delta < 0 ? "var(--good-dark)" : ev.delta > 0 ? SC.danger : "var(--text-3)" }}>{ev.delta > 0 ? "+" : ""}{ev.delta}</span>; },
    },
    {
      header: "Percurso", className: "ta-c", headerStyle: { width: 140, textAlign: "center" as const, padding: "0 4px" },
      cell: (row: EvoRowWithPos) => { const ev = evo.get(row.name); return ev ? <EvoBadge pill={ev.pill} from={ev.from} to={ev.to} /> : <EvoBadge pill="NEW" label={evoYear === "2026" ? "não voltou" : "novo"} />; },
    },
  ];
}

/** CircuitDivision de um torneio BJGT/EOWAGR (results + evoCols + módulos ricos). */
export function bjgtMajorDivision(def: TDef, evo: Map<string, EvoEntry> | undefined, evoYear: string | undefined, sourceUrl?: string): CircuitDivision {
  const data = def.data;
  const manuelName = def.manuelName || (data.players.some((p) => isM(p.name)) ? "Manuel" : "");
  const hasEvo = !!evo && evo.size > 0;
  const roundLabels = def.roundDates?.map((d, i) => `R${i + 1} · ${d}`);
  const rLabel = (i: number) => (def.roundDates?.[i] ? `R${i + 1} · ${def.roundDates[i]}` : `R${i + 1}`);
  const evoCols = hasEvo ? makeEvoCols(evo!, evoYear) : undefined;
  const results = tDataToTournament(data, def);
  if (hasEvo) for (const pl of results.players) {
    const ev = evo!.get(pl.name);
    if (ev) { (pl as unknown as { _regressado?: boolean })._regressado = true; if (ev.pill === "UP") (pl as unknown as { _subiu?: boolean })._subiu = true; }
  }
  return {
    key: def.id,
    escalao: def.category,
    tabLabel: def.category,
    hasManuel: data.players.some((p) => isM(p.name)),
    links: sourceUrl ? [{ label: "BlueGolf", url: sourceUrl, icon: "🔗" }] : undefined,
    results,
    scOptions: bjgtScorecardOptions(),
    roundLabels,
    evoCols,
    // Apresentação PLANA (igual ao JOB/Doral): o leaderboard renderiza sem
    // "janela"/card. A análise extra (média + dificuldade por buraco + ManuelDay)
    // flui POR BAIXO, em cards próprios, via accHeader/accExtra/roundExtra.
    accHeader: hasEvo ? <EvoSummary evo={evo!} evoYear={evoYear!} /> : undefined,
    accExtra: (
      <div className="card">
        <div className="h-md">📊 Dificuldade por Buraco — Todas as rondas</div>
        <FStats data={data} ri="all" />
        <HoleDiff data={data} ri="all" mn={manuelName} />
      </div>
    ),
    roundExtra: (tab) => (
      <>
        <div className="card">
          <div className="h-md">📊 Dificuldade por Buraco — {rLabel(tab)}</div>
          <FStats data={data} ri={tab} />
          <HoleDiff data={data} ri={tab} mn={manuelName} />
        </div>
        {manuelName && <ManuelDay data={data} ri={tab} />}
      </>
    ),
  };
}
