/**
 * bluegolf.ts — Dados BlueGolf da /major: BJGT (Villa Padierna), EOWAGR (Le
 * Touquet), FCG Callaway World e JWGC (Torrey Pines).
 *
 *   - BLUEGOLF_FILES: um ficheiro por escalão (id, ano, série, URL de origem)
 *   - normalizeBlueGolf: ordena e posiciona (só quem terminou tem posição)
 *   - blueGolfToTournament: TData → Tournament (formato FPG) para o leaderboard
 *
 * Tirado da BJGTPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import { gf, normPaisDisplay } from "../../utils/flagUtils";
import type { Tournament as FPGTournament } from "../fpgTypes";
import { buildFPGTournament, type IntlPlayerIn } from "../intlTournament";
import { isNoCardGross } from "../intlCommon";

/* ── Types ── */
export interface RoundData { day: number; scores: number[] | null; f9: number | null; b9: number | null; gross: number }
export interface PlayerData { name: string; country: string; pos: number | null; result: number | null; total: number | null; rounds: RoundData[] }
export interface TData { tournament: string; par: number[]; si?: number[]; yards?: number[]; course?: string; parF9: number; parB9: number; parTotal: number; players: PlayerData[];
  /** CR/Slope (o BlueGolf não os publica) e PCC por dia — tirados dos SD oficiais
   *  dos portugueses na FPG; `ratingNota` diz de quem, o SD sai marcado como estimado. */
  courseRating?: number; slope?: number; pcc?: (number | null)[]; ratingNota?: string }
export interface TDef { id: string; label: string; shortLabel: string; data: TData; manuelName: string; year: number; category: string; roundDates?: string[]; series: "bjgt" | "eowagr" | "fcg" | "jwgc" }


/* ── Data URLs ── */
/* NOTA: nomes dos ficheiros WJGC actualizados após re-scrape (2026-05-14):
 *   wjgc_2025_contest34   → wjgc_2025_b1011
 *   wjgc_2026_b1011_3r    → wjgc_2026_b1011
 *   wjgc_2026_contest33   → wjgc_2026_b1213
 * `reverseRounds: true` REMOVIDO — o novo scrape-bluegolf.js ordena as rondas
 * pelo label correctamente, deixando de ser necessária inversão manual. */
export const BLUEGOLF_FILES = [
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

  /* ── FCG Callaway World Championship 2025 (Westin Mission Hills, 14-16 Jul; multi-campo Desert Falls / Desert Willow) ── */
  { id: "fcg25_b1518", url: "/data/fcg251_boys_15-18.json",  label: "2025 // Boys 15-18",  shortLabel: "2025 Boys 15-18",  manuelName: "", year: 2025, category: "Boys 15-18",  roundDates: ["14 Jul", "15 Jul", "16 Jul"] as string[], series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg25/event/fcg251/contest/1/leaderboard.htm" },
  { id: "fcg25_g1518", url: "/data/fcg251_girls_15-18.json", label: "2025 // Girls 15-18", shortLabel: "2025 Girls 15-18", manuelName: "", year: 2025, category: "Girls 15-18", roundDates: ["14 Jul", "15 Jul", "16 Jul"] as string[], series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg25/event/fcg251/contest/13/leaderboard.htm" },
  { id: "fcg25_b1314", url: "/data/fcg251_boys_13-14.json",  label: "2025 // Boys 13-14",  shortLabel: "2025 Boys 13-14",  manuelName: "", year: 2025, category: "Boys 13-14",  roundDates: ["14 Jul", "15 Jul", "16 Jul"] as string[], series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg25/event/fcg251/contest/17/leaderboard.htm" },
  { id: "fcg25_g1314", url: "/data/fcg251_girls_13-14.json", label: "2025 // Girls 13-14", shortLabel: "2025 Girls 13-14", manuelName: "", year: 2025, category: "Girls 13-14", roundDates: ["14 Jul", "15 Jul", "16 Jul"] as string[], series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg25/event/fcg251/contest/37/leaderboard.htm" },
  { id: "fcg25_b1112", url: "/data/fcg251_boys_11-12.json",  label: "2025 // Boys 11-12",  shortLabel: "2025 Boys 11-12",  manuelName: "", year: 2025, category: "Boys 11-12",  roundDates: ["14 Jul", "15 Jul", "16 Jul"] as string[], series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg25/event/fcg251/contest/25/leaderboard.htm" },
  { id: "fcg25_g1112", url: "/data/fcg251_girls_11-12.json", label: "2025 // Girls 11-12", shortLabel: "2025 Girls 11-12", manuelName: "", year: 2025, category: "Girls 11-12", roundDates: ["14 Jul", "15 Jul", "16 Jul"] as string[], series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg25/event/fcg251/contest/33/leaderboard.htm" },
  { id: "fcg25_b910",  url: "/data/fcg251_boys_9-10.json",   label: "2025 // Boys 9-10",   shortLabel: "2025 Boys 9-10",   manuelName: "", year: 2025, category: "Boys 9-10",   roundDates: ["14 Jul", "15 Jul", "16 Jul"] as string[], series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg25/event/fcg251/contest/29/leaderboard.htm" },
  { id: "fcg25_g910",  url: "/data/fcg251_girls_9-10.json",  label: "2025 // Girls 9-10",  shortLabel: "2025 Girls 9-10",  manuelName: "", year: 2025, category: "Girls 9-10",  roundDates: ["14 Jul", "15 Jul", "16 Jul"] as string[], series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg25/event/fcg251/contest/21/leaderboard.htm" },
  { id: "fcg25_b78",   url: "/data/fcg251_boys_7-8.json",    label: "2025 // Boys 7-8",    shortLabel: "2025 Boys 7-8",    manuelName: "", year: 2025, category: "Boys 7-8",    roundDates: ["14 Jul", "15 Jul", "16 Jul"] as string[], series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg25/event/fcg251/contest/9/leaderboard.htm" },
  { id: "fcg25_g78",   url: "/data/fcg251_girls_7-8.json",   label: "2025 // Girls 7-8",   shortLabel: "2025 Girls 7-8",   manuelName: "", year: 2025, category: "Girls 7-8",   roundDates: ["14 Jul", "15 Jul", "16 Jul"] as string[], series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg25/event/fcg251/contest/5/leaderboard.htm" },

  /* ── FCG Callaway World Championship 2026 (Desert Willow - Mt. View, Palm Desert CA; 13-15 Jul) ──
     10 escalões (Boys/Girls 7-8 → 15-18). Os 7-8 jogam 9 buracos (par 36) e os
     9-10 percursos encurtados (par 65 M / 57 F) — vem assim dos dados. */
  { id: "fcg26_b1518", url: "/data/fcg268_boys_15-18.json",  label: "2026 // Boys 15-18",  shortLabel: "2026 Boys 15-18",  manuelName: "", year: 2026, category: "Boys 15-18", roundDates: ["13 Jul", "14 Jul", "15 Jul"] as string[],  series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg26/event/fcg268/contest/33/leaderboard.htm" },
  { id: "fcg26_g1518", url: "/data/fcg268_girls_15-18.json", label: "2026 // Girls 15-18", shortLabel: "2026 Girls 15-18", manuelName: "", year: 2026, category: "Girls 15-18", roundDates: ["13 Jul", "14 Jul", "15 Jul"] as string[], series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg26/event/fcg268/contest/1/leaderboard.htm" },
  { id: "fcg26_b1314", url: "/data/fcg268_boys_13-14.json",  label: "2026 // Boys 13-14",  shortLabel: "2026 Boys 13-14",  manuelName: "", year: 2026, category: "Boys 13-14", roundDates: ["13 Jul", "14 Jul", "15 Jul"] as string[],  series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg26/event/fcg268/contest/13/leaderboard.htm" },
  { id: "fcg26_g1314", url: "/data/fcg268_girls_13-14.json", label: "2026 // Girls 13-14", shortLabel: "2026 Girls 13-14", manuelName: "", year: 2026, category: "Girls 13-14", roundDates: ["13 Jul", "14 Jul", "15 Jul"] as string[], series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg26/event/fcg268/contest/5/leaderboard.htm" },
  { id: "fcg26_b1112", url: "/data/fcg268_boys_11-12.json",  label: "2026 // Boys 11-12",  shortLabel: "2026 Boys 11-12",  manuelName: "", year: 2026, category: "Boys 11-12", roundDates: ["13 Jul", "14 Jul", "15 Jul"] as string[],  series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg26/event/fcg268/contest/21/leaderboard.htm" },
  { id: "fcg26_g1112", url: "/data/fcg268_girls_11-12.json", label: "2026 // Girls 11-12", shortLabel: "2026 Girls 11-12", manuelName: "", year: 2026, category: "Girls 11-12", roundDates: ["13 Jul", "14 Jul", "15 Jul"] as string[], series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg26/event/fcg268/contest/29/leaderboard.htm" },
  { id: "fcg26_b910",  url: "/data/fcg268_boys_9-10.json",   label: "2026 // Boys 9-10",   shortLabel: "2026 Boys 9-10",   manuelName: "", year: 2026, category: "Boys 9-10", roundDates: ["13 Jul", "14 Jul", "15 Jul"] as string[],   series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg26/event/fcg268/contest/37/leaderboard.htm" },
  { id: "fcg26_g910",  url: "/data/fcg268_girls_9-10.json",  label: "2026 // Girls 9-10",  shortLabel: "2026 Girls 9-10",  manuelName: "", year: 2026, category: "Girls 9-10", roundDates: ["13 Jul", "14 Jul", "15 Jul"] as string[],  series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg26/event/fcg268/contest/9/leaderboard.htm" },
  { id: "fcg26_b78",   url: "/data/fcg268_boys_7-8.json",    label: "2026 // Boys 7-8",    shortLabel: "2026 Boys 7-8",    manuelName: "", year: 2026, category: "Boys 7-8", roundDates: ["13 Jul", "14 Jul", "15 Jul"] as string[],    series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg26/event/fcg268/contest/17/leaderboard.htm" },
  { id: "fcg26_g78",   url: "/data/fcg268_girls_7-8.json",   label: "2026 // Girls 7-8",   shortLabel: "2026 Girls 7-8",   manuelName: "", year: 2026, category: "Girls 7-8", roundDates: ["13 Jul", "14 Jul", "15 Jul"] as string[],   series: "fcg" as const, sourceUrl: "https://fcg.bluegolf.com/bluegolf/fcg26/event/fcg268/contest/25/leaderboard.htm" },

  /* ── Uswing Mojing Junior World (JWGC) 2026 (Torrey Pines - South, San Diego; 3 rondas) ──
     4 escalões Boys (9-10, 11-12, 13-14, 15-18). `roundDates` omitidas
     (datas por confirmar) — o torneio aparece sem datas precisas. */
  { id: "jwgc26_b1518", url: "/data/jwgc261_boys_15-18.json", label: "2026 // Boys 15-18", shortLabel: "2026 Boys 15-18", manuelName: "", year: 2026, category: "Boys 15-18", series: "jwgc" as const, sourceUrl: "https://jwgc.bluegolf.com/bluegolf/jwgc26/event/jwgc261/contest/16/leaderboard.htm" },
  { id: "jwgc26_b1314", url: "/data/jwgc261_boys_13-14.json", label: "2026 // Boys 13-14", shortLabel: "2026 Boys 13-14", manuelName: "", year: 2026, category: "Boys 13-14", series: "jwgc" as const, sourceUrl: "https://jwgc.bluegolf.com/bluegolf/jwgc26/event/jwgc261/contest/35/leaderboard.htm" },
  { id: "jwgc26_b1112", url: "/data/jwgc261_boys_11-12.json", label: "2026 // Boys 11-12", shortLabel: "2026 Boys 11-12", manuelName: "", year: 2026, category: "Boys 11-12", series: "jwgc" as const, sourceUrl: "https://jwgc.bluegolf.com/bluegolf/jwgc26/event/jwgc261/contest/31/leaderboard.htm" },
  { id: "jwgc26_b910",  url: "/data/jwgc261_boys_9-10.json",  label: "2026 // Boys 9-10",  shortLabel: "2026 Boys 9-10",  manuelName: "", year: 2026, category: "Boys 9-10",  series: "jwgc" as const, sourceUrl: "https://jwgc.bluegolf.com/bluegolf/jwgc26/event/jwgc261/contest/43/leaderboard.htm" },
];

/* ── Flags ── */

/** Buracos efectivamente jogados numa ronda (scores preenchidos e > 0). */
function roundHolesPlayed(r: any): number {
  return (r?.scores ?? []).filter((s: any) => s != null && s > 0).length;
}

/** Um jogador só TERMINOU o torneio se tem todas as rondas E cada ronda tem os
 *  buracos-padrão do campo jogados. Guarda de segurança: uma ronda parcial
 *  (WD/DNF a meio, ou ainda em jogo) deflaciona o total e, sem esta verificação,
 *  o jogador aparecia indevidamente no topo da classificação como "vencedor"
 *  (ex: JWGC 2026 Boys 11-12 — Ryan Kim jogou só 9 buracos na R3). O BlueGolf
 *  não traz `pos`, por isso calculamo-la nós — mas só entre quem completou. */
function isPlayerComplete(p: any, maxR: number, holesPerRound: number): boolean {
  if (!p.rounds || p.rounds.length < maxR) return false;
  return p.rounds.every((r: any) => roundHolesPlayed(r) >= holesPerRound);
}

export function normalizeBlueGolf(raw: any, reverseRounds?: boolean): TData {
  const d = raw as TData;
  let players = d.players;
  if (reverseRounds) {
    players = players.map(p => ({ ...p, rounds: [...p.rounds].reverse() }));
  }
  const holesPerRound = d.par?.length || 18;
  const withR = players.filter((p: any) => p.rounds?.length > 0);
  const maxR = Math.max(0, ...withR.map((p: any) => p.rounds.length));
  players = withR.filter((p: any) => p.total != null)
    // Total «sem cartão» (≥ 900) não terminou: sem posição, para o fim.
    .map((p: any) => ({ ...p, _complete: !isNoCardGross(p.total) && isPlayerComplete(p, maxR, holesPerRound) }))
    .sort((a: any, b: any) => {
      // Quem não terminou vai sempre para o fim, independentemente do total.
      if (a._complete !== b._complete) return a._complete ? -1 : 1;
      return a.total - b.total;
    });
  let pos = 1;
  players.forEach((p: any, i: number) => {
    if (!p._complete) { p.pos = null; return; }
    const prev = players[i - 1] as any;
    if (i > 0 && prev != null && prev._complete && prev.total != null && p.total != null && p.total > prev.total) pos = i + 1;
    p.pos = pos;
  });
  return { ...d, players };
}

/** Bandeira robusta para localidades JWGC/FCG. O país US/CA já vem resolvido
 *  ("United States"/"Canada") pela lib; os internacionais podem vir como
 *  "Cidade, País" (ex: "Hong Kong, China", "Silang, Philippines") ou "Cidade, ISO2"
 *  ("Taipei, TW"). Tenta a string toda e depois cada segmento por vírgula, do
 *  ÚLTIMO (normalmente o país) para o primeiro. Sem risco de California→Canada:
 *  as siglas de estado US foram consumidas antes (viraram "United States"). */
export function flagForLocation(loc: string): string {
  const whole = gf(loc);
  if (whole && whole !== "🏳️") return whole;
  const segs = loc.split(",").map((s) => s.trim()).filter((s) => s && s !== "-");
  for (let i = segs.length - 1; i >= 0; i--) {
    const f = gf(segs[i]);
    if (f && f !== "🏳️") return f;
  }
  return "🏳️";
}

export function blueGolfToTournament(data: TData, def: TDef): FPGTournament {
  const { par, si, parTotal, players, courseRating, slope, pcc } = data;
  const rated = courseRating != null && slope != null;
  const nR = Math.max(...players.map(p => p.rounds.length), 0);
  // Distâncias: o BlueGolf dá `yards` por buraco → converter para metros.
  const meters = data.yards && data.yards.length >= par.length ? data.yards.map(y => Math.round(y * 0.9144)) : [];
  const hasMeters = meters.length >= par.length && par.length > 0;
  const t = buildFPGTournament({
    name: def.label,
    tcode: def.id,
    rounds: nR,
    // ⚠ O campo hardcoded só vale para as séries para que foi escrito: os
    // ficheiros BJGT/WJGC trazem "Villa Padierna" sem o percurso (Flamingos vs
    // Alferini) e o EOWAGR vem vazio. Quando o FCG e o JWGC entraram nesta
    // família (também BlueGolf) herdaram o hardcode e o FCG aparecia a jogar em
    // "Villa Padierna — Flamingos" em vez de Desert Willow. Esses trazem o
    // campo real no próprio ficheiro → usar `data.course`.
    campo: def.series === "eowagr" ? "Le Touquet GC — La Forêt"
      : def.series === "bjgt" ? (def.category === "Boys 12-13" ? "Villa Padierna — Alferini" : "Villa Padierna — Flamingos")
      : (data.course || ""),
  }, { par, si, meters: hasMeters ? meters : null, teeName: hasMeters ? (data.course || "Tee") : undefined, ...(rated ? { courseRating, slope } : {}) },
  players.map((p): IntlPlayerIn => {
    // JWGC/FCG: os ficheiros trazem `gradYear` + país já limpo (p/ bandeira) +
    // `hometown` (cidade/estado, ex: "New York, NY"). Defensivo p/ dados antigos
    // "CLASSE, LOCAL" ainda no country. A coluna "País" mostra a bandeira do país
    // + a ORIGEM detalhada (hometown quando existe — mais informativo que só "USA").
    const rawCountry = p.country || "";
    const ym = /^(\d{4})\s*,\s*(.*)$/.exec(rawCountry);
    const gradField = (p as unknown as { gradYear?: number }).gradYear;
    const classYear = gradField ?? (ym ? +ym[1] : null);
    const flagCountry = gradField != null ? rawCountry : (ym ? ym[2].trim() : rawCountry);
    const hometown = (p as unknown as { hometown?: string }).hometown ?? (ym ? ym[2].trim() : "");
    const origin = hometown || normPaisDisplay(flagCountry);
    return {
      id: p.name, name: p.name, pos: p.pos,
      club: flagCountry ? `${flagForLocation(flagCountry)} ${origin}` : "",
      country: p.country,
      total: p.total,
      toPar: p.result ?? (p.total != null ? p.total - parTotal * nR : null),
      // HCP FPG à data (portugueses) — o BlueGolf não publica HCP; serve o NDB do SD.
      hcp: (p as unknown as { hcp?: number | null }).hcp ?? undefined,
      rounds: rated && pcc ? p.rounds.map((r, i) => {
        const dayPcc = pcc[(r.day ?? i + 1) - 1];
        return typeof dayPcc === "number" ? { ...r, extra: { pcc: dayPcc } } : r;
      }) : p.rounds,
      // Rondas em falta OU ronda parcial (WD/DNF) → não terminou. Reusa o
      // resultado de loadT (`_complete`); fallback para quem não passou por loadT.
      wd: (p as any)._complete != null ? !(p as any)._complete : !isPlayerComplete(p, nR, par.length),
      extra: { _classYear: classYear },
    };
  }));
  if (rated) t._sdEstimate = `CR ${courseRating.toFixed(1)} · Slope ${slope} estimados — ${data.ratingNota || "não publicados"}`;
  return t;
}
