/**
 * federadosPPLoader.ts
 *
 * Lazy-load do "mundo alternativo" Pitch & Putt da FPG.
 *
 * O P&P vive num subsistema de scoring paralelo (scoring.fpg.pt/listspp/),
 * com handicaps próprios (hcp_type="PP") separados do handicap de campo
 * normal. Um federado pode ter um índice de campo grande e um P&P pequeno,
 * ou existir só num dos lados.
 *
 * Dois ficheiros (ambos gerados por scrapers Node — ver
 * scripts/scrape-federados-pp-node.js e scripts/scrape-pp-whs-node.js):
 *
 *  1. /data/federados-pp.json        — dump de TODOS os federados P&P activos
 *                                        (~3.450). Cruzado por fed → pill +
 *                                        "quem é activo" (roundsYear).
 *  2. /data/pp-history/{fed}.json    — histórico P&P por jogador (voltas +
 *                                        scorecards buraco-a-buraco), só para
 *                                        os Nossos descarregados.
 *
 * Tudo degrada com elegância: se os ficheiros não existirem, os helpers
 * devolvem null/Map vazio e a UI simplesmente não mostra o P&P.
 */

import { cachedFetchJson } from "./fetchCache";

/* ── Dump de federados P&P (federados-pp.json) ───────────────────── */
export interface FederadoPP {
  fed: string;
  name: string;
  sex: "M" | "F" | string;
  dob: string | null;
  clubCode: string;
  club: string;
  acronym: string;
  hcp: number | null;        // hcp_index P&P
  hcpExact: number | null;   // hcp_exact P&P
  hcpStatus: string;         // "Válido" | "Sem HCP"
  hcpType: string;           // "PP"
  age: string;               // "Senior", "SUB12", ...
  country: string;
  roundsYear: number;        // cartões P&P no ano civil → actividade
  admission: string | null;
  lastHcp: string | null;
}

export interface FederadosPPFile {
  generated: string;
  source: string;
  totalReported: number;
  totalScraped: number;
  players: FederadoPP[];
}

/** Um federado tem handicap P&P "real" (estabelecido, não sentinela 99). */
export function hasRealPPHcp(p: FederadoPP | undefined | null): boolean {
  if (!p) return false;
  return p.hcpExact != null && p.hcpExact < 99 && !/sem hcp/i.test(p.hcpStatus || "");
}

let _ppCache: FederadosPPFile | null = null;
let _ppLoading: Promise<FederadosPPFile | null> | null = null;
let _ppByFed: Map<string, FederadoPP> | null = null;

/** Carrega federados-pp.json (cacheado). Devolve null se ausente. */
export function loadFederadosPP(): Promise<FederadosPPFile | null> {
  if (_ppCache) return Promise.resolve(_ppCache);
  if (_ppLoading) return _ppLoading;
  _ppLoading = cachedFetchJson<FederadosPPFile>("/data/federados-pp.json")
    .then(data => {
      _ppLoading = null;
      if (!data || !Array.isArray(data.players)) return null;
      _ppCache = data;
      _ppByFed = new Map(data.players.map(p => [String(p.fed), p]));
      return data;
    })
    .catch(() => { _ppLoading = null; return null; });
  return _ppLoading;
}

/** Mapa fed → registo P&P (vazio até loadFederadosPP resolver). */
export function getPPByFed(): Map<string, FederadoPP> {
  return _ppByFed || new Map();
}

export function ppForFed(fed: string | number | undefined | null): FederadoPP | null {
  if (fed == null) return null;
  return (_ppByFed && _ppByFed.get(String(fed))) || null;
}

export function invalidateFederadosPPCache(): void {
  _ppCache = null; _ppLoading = null; _ppByFed = null;
}

/* ── Histórico P&P por jogador (pp-history/{fed}.json) ────────────── */
export interface PPScorecard {
  par: (number | null)[];
  gross: (number | null)[];
  meters: (number | null)[];
  parTotal: number | null;
  grossTotal: number | null;
  courseRating: number | string | null;
  slope: number | string | null;
  teeName: string | null;
  startHole: number | null;
  nholes: number | null;
  course: string | null;
}

export interface PPRound {
  scoreId: string | number;
  date: string | null;
  tourn: string | null;
  course: string | null;
  holes: number | null;
  par: number | null;
  origin: string | null;
  index: number | null;
  playHcp: number | null;
  stableford: number | null;
  sd: number | null;
  scoringType: number | null;
  competitionType: number | null;
  scorecard?: PPScorecard | null;
}

export interface PPHistory {
  fed: string;
  name: string | null;
  generated: string;
  index: number | null;
  rounds: PPRound[];
}

const _histCache = new Map<string, PPHistory | null>();
const _histLoading = new Map<string, Promise<PPHistory | null>>();

/** Carrega o histórico P&P de um jogador. Devolve null se não houver ficheiro. */
export function loadPPHistory(fed: string | number): Promise<PPHistory | null> {
  const key = String(fed);
  if (_histCache.has(key)) return Promise.resolve(_histCache.get(key)!);
  const existing = _histLoading.get(key);
  if (existing) return existing;
  const p = cachedFetchJson<PPHistory>(`/data/pp-history/${key}.json`)
    .then(data => {
      _histLoading.delete(key);
      const val = data && Array.isArray(data.rounds) ? data : null;
      _histCache.set(key, val);
      return val;
    })
    .catch(() => { _histLoading.delete(key); _histCache.set(key, null); return null; });
  _histLoading.set(key, p);
  return p;
}

/* ── Index slim do histórico (pp-history-index.json) ─────────────── */
export interface PPHistoryIndexEntry { name: string | null; rounds: number; last: string | null; index: number | null; }
export interface PPHistoryIndexFile { generated: string; source: string; players: Record<string, PPHistoryIndexEntry>; }

let _idxCache: Record<string, PPHistoryIndexEntry> | null = null;
let _idxLoading: Promise<Record<string, PPHistoryIndexEntry>> | null = null;

/** Index slim: fed → {rounds,last,index}. Mapa vazio se ausente. */
export function loadPPHistoryIndex(): Promise<Record<string, PPHistoryIndexEntry>> {
  if (_idxCache) return Promise.resolve(_idxCache);
  if (_idxLoading) return _idxLoading;
  _idxLoading = cachedFetchJson<PPHistoryIndexFile>("/data/pp-history-index.json")
    .then(data => {
      _idxLoading = null;
      _idxCache = (data && data.players) || {};
      return _idxCache;
    })
    .catch(() => { _idxLoading = null; _idxCache = {}; return {}; });
  return _idxLoading;
}

/* ── URLs públicas P&P (sempre frescas, sem download) ────────────── */
export const ppPlayerUrl = (fed: string | number) => `https://scoring.fpg.pt/listspp/PlayerWHS.aspx?no=${fed}`;
