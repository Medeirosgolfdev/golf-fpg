/**
 * KIDSdataLoader.ts
 *
 * Loader unificado que consome os 3 ficheiros canónicos produzidos pelo
 * agregador (scripts/aggregator/):
 *   - /data/juniors.json              — roster cross-federação
 *   - /data/juniors-tournaments.json  — torneios com results já mapeados a juniorId
 *   - /data/tournament-catalog.json   — séries de torneios indexadas
 *
 * Substitui o loader antigo que carregava 50+ JSONs separados e fazia merge
 * no browser. A identidade dos jogadores é resolvida em build-time pelo
 * agregador (corre via `node scripts/aggregator/index.js` ou GitHub Action).
 */

import { MONTHS_PT } from "../utils/format";
import { cachedFetchJson } from "../data/fetchCache";
import { normPaisDisplay } from "../utils/flagUtils";
import { normName } from "../utils/normName";

// ═════════════════════════════════════════════════════════════════════
// Helpers de string
// ═════════════════════════════════════════════════════════════════════

const CC: Record<string, string> = {
  US: "USA", GB: "United Kingdom", ES: "Spain", IT: "Italy",
  FR: "France", DE: "Germany", CH: "Switzerland", NO: "Norway",
  SE: "Sweden", PT: "Portugal", RU: "Russia", BG: "Bulgaria",
  NL: "Netherlands", LT: "Lithuania", TH: "Thailand", PH: "Philippines",
  CN: "China", RO: "Romania", UA: "Ukraine", SI: "Slovenia",
  BE: "Belgium", DK: "Denmark", CA: "Canada", BR: "Brazil",
  MX: "Mexico", AT: "Austria", HU: "Hungary", SK: "Slovakia",
  ZA: "South Africa", SG: "Singapore", IN: "India", TR: "Turkey",
  KR: "South Korea", LV: "Latvia", CZ: "Czech Republic", PL: "Poland",
  PY: "Paraguay", CL: "Chile", CO: "Colombia", PR: "Puerto Rico",
  IE: "Ireland", CY: "Cyprus", OM: "Oman", LB: "Lebanon",
  AE: "UAE", KZ: "Kazakhstan", VN: "Vietnam",
  JE: "Jersey", NG: "Nigeria", CR: "Costa Rica", AR: "Argentina",
  UK: "United Kingdom", PHL: "Philippines",
  AU: "Australia", JP: "Japan", NZ: "New Zealand", FI: "Finland",
  TW: "Taiwan", HK: "Hong Kong", ID: "Indonesia", EE: "Estonia",
  AM: "Armenia", BB: "Barbados", BS: "Bahamas", BO: "Bolivia",
  DO: "Dominican Rep.", DZ: "Algeria", EC: "Ecuador",
  GT: "Guatemala", HN: "Honduras", KE: "Kenya", KH: "Cambodia",
  MA: "Morocco", NI: "Nicaragua", PA: "Panama", PE: "Peru",
  RE: "Réunion", SV: "El Salvador", UG: "Uganda",
  UY: "Uruguay", VE: "Venezuela",
};

/** Normaliza qualquer representação de país num nome canónico em inglês. */
export function co(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "";
  const canon = normPaisDisplay(t);
  if (canon !== t) return canon;
  return CC[t] || CC[t.toUpperCase()] || t;
}

/** Normaliza nome para comparação (lowercase, sem acentos, espaços condensados).
 *  Re-export da fonte canónica em utils/normName (mantido para os consumidores). */
export { normName };

// ═════════════════════════════════════════════════════════════════════
// Tipos públicos
// ═════════════════════════════════════════════════════════════════════

export interface AutoTournResult {
  p: number | "WD" | null;
  t: number | null;
  tp: number | null;
  rd: number[];
  ageGroup?: string;
  nholes?: number;
}

/** Um snapshot de HCP exacto numa data específica, vindo de uma fonte concreta
 *  (tipicamente um torneio). Usado para construir sparklines + timeline. */
export interface HcpPoint {
  date: string;          // "YYYY-MM-DD"
  hcpExact: number;
  source: string;        // "fpg" | "ffg" | "fcg" | ...
  tcode?: string;        // identificador do torneio na fonte
  ccode?: string;
  label?: string;        // nome do torneio (para tooltip)
}

export interface AutoRivalPlayer {
  n: string;
  co: string;
  r: Record<string, AutoTournResult>;
  fpgClub?: string;
  /** HCP exacto FPG do jogador (quando aplicável — só PT players federados). Usado
   *  para cálculo preciso de SD (AGS) em tabelas USKids/internacionais. */
  fpgHcpExact?: number;
  /** Data do último update do HCP FPG (YYYY-MM-DD) — para tooltips e UX. */
  fpgHcpDate?: string;
  /** Série temporal de HCP — um snapshot por participação. Ordenada desc por date.
   *  Permite renderizar sparkline + timeline no KIDS2Page. */
  hcpHistory?: HcpPoint[];
  dob?: string;
  memberId?: string;
  esLicencia?: string;
  esClub?: string;
  esFullName?: string;
  esSex?: "M" | "F";
  esCatEdad?: string;
  esHcp?: number;
  esHcpDate?: string;
  esRegion?: string;
  ptFed?: string;
  frFed?: string;
}

export interface AutoScorecard {
  tid: string;
  playerName: string;
  par: number[];
  si: number[];
  meters: number[];
  rounds: number[][];
}

export type LoadProgress = { done: number; total: number; label: string };

export interface KidsFileMeta {
  path: string;
  status: "loaded" | "error";
  error?: string;
  group: string;
}

export interface FieldData {
  tid: string;
  players: AutoRivalPlayer[];
}

// ═════════════════════════════════════════════════════════════════════
// Maps globais — populados pelo loader, consumidos por dobInference,
// USKIDSPage, etc.
// ═════════════════════════════════════════════════════════════════════

export const uskTournNames: Map<string, { name: string; short: string; date: string; dateExact: string }> = new Map();
export const uskFieldSizes: Map<string, number> = new Map();
export const ncScoringType: Map<string, "SCRATCH" | "HANDICAP"> = new Map();
/** Metadados (nome, data ISO, link oficial) por tid EXTRA (wjgc/doral/eowagr).
 *  Consumido pelo FieldRivaisDashboard para dar nome+link às colunas destes
 *  torneios (que vivem fora do member-history). */
export const extraTidMeta: Map<string, { name: string; short: string; dateISO: string; url: string | null }> = new Map();
export const fpgTournNames: Map<string, {
  name: string; short: string; date: string; dateExact: string;
  ageMin?: number; ageMax?: number; sex?: "M" | "F"; escalao?: string;
}> = new Map();
export const ffgolfTournNames: Map<string, {
  name: string; short: string; date: string; dateExact: string;
  ageMin?: number; ageMax?: number; sex?: "M" | "F"; ageGroup?: string;
}> = new Map();

const _scorecards: Map<string, AutoScorecard[]> = new Map();
let _loadedFiles: KidsFileMeta[] = [];
let _autoRivalsCache: Promise<AutoRivalPlayer[]> | null = null;

export function getScorecards(playerName: string): AutoScorecard[] {
  const key = normName(playerName);
  const exact = _scorecards.get(key);
  if (exact?.length) return exact;
  const parts = key.split(" ").filter(Boolean);
  if (parts.length < 2) return [];
  const first = parts[0];
  const last = parts[parts.length - 1];
  for (const [k, v] of _scorecards.entries()) {
    const kp = k.split(" ").filter(Boolean);
    if (kp[0] === first && kp[kp.length - 1] === last) return v;
  }
  return [];
}

export function getScorecardsByTid(tid: string): Array<AutoScorecard & { normName: string }> {
  const out: Array<AutoScorecard & { normName: string }> = [];
  for (const [n, scs] of _scorecards.entries()) {
    for (const sc of scs) {
      if (sc.tid === tid) out.push({ ...sc, normName: n });
    }
  }
  return out;
}

export function getLoadedKidsFiles(): KidsFileMeta[] {
  return _loadedFiles;
}

export function invalidateAutoRivalsCache(): void {
  _autoRivalsCache = null;
}

// ═════════════════════════════════════════════════════════════════════
// Mapeamento canónico → tid legacy
// Os tids antigos (e.g. "wjgc26", "usk21080_b11", "doral25_b1011") ainda são
// referenciados em vários componentes (KIDSPage, RivalDetail, dobInference).
// Mantém-se o formato.
// ═════════════════════════════════════════════════════════════════════

/** WJGC/EOWAGR/Doral usavam tids hardcoded por sourceKey de ficheiro. */
const FILE_TO_LEGACY_TID: Record<string, string> = {
  "wjgc_2025_b89": "wjgc25_b89",
  "wjgc_2025_b1011": "wjgc25_b1011",
  "wjgc_2026_b1011": "wjgc26",
  "wjgc_2026_b1213": "wjgc26_1213",
  "eowagr25_contest121": "eowagr25_b78",
  "eowagr25_contest13": "eowagr25_b910",
  "eowagr25_contest21": "eowagr25",
  "eowagr25_contest77": "eowagr25_b1314",
  "ftm_doral_2018": "doral18",
  "ftm_doral_2019": "doral19",
  "ftm_doral_2020": "doral20",
  "ftm_doral_2021": "doral21",
  "ftm_doral_2022": "doral22",
  "ftm_doral_2023": "doral23",
  "ftm_doral_2024": "doral24",
  "ftm_doral_2025": "doral25",
};

interface CanonicalTournament {
  id: string;
  sourceId: string;
  sourceKey: string;
  name?: string;
  date?: string;
  parTotal?: number;
  holesPerRound?: number;
  links?: Array<{ label: string; url: string }>;
  flights: CanonicalFlight[];
}

interface CanonicalFlight {
  flightKey: string;
  label: string;
  ageMin?: number | null;
  ageMax?: number | null;
  sex?: "M" | "F" | "mixed" | null;
  par?: number[];
  yards?: number[];
  fieldSize?: number | null;
  results: CanonicalResult[];
}

interface CanonicalResult {
  juniorId: string;
  playerNameInSource?: string;
  pos?: number | null;
  status?: string;
  totalGross?: number | null;
  toPar?: number | null;
  rounds?: Array<{ round: number; gross?: number | null; strokes?: number[] }>;
}

interface CanonicalJunior {
  id: string;
  canonicalName: string;
  aliases?: string[];
  dob?: string;
  sex?: "M" | "F";
  country?: string;
  nationality?: string;
  region?: string;
  club?: string;
  sources?: any;
  tournamentIds?: string[];
}

function legacyTid(t: CanonicalTournament, f: CanonicalFlight): string | null {
  const sid = t.sourceId;
  const skey = t.sourceKey;

  if (sid === "uskids") {
    if (f.ageMin == null && f.ageMax == null) return `usk${skey}`;
    const sexCh = f.sex === "F" ? "g" : "b";
    const age = f.ageMin ?? f.ageMax;
    return `usk${skey}_${sexCh}${age}`;
  }
  if (sid === "wjgc" || sid === "eowagr") {
    return FILE_TO_LEGACY_TID[skey] || `${sid}-${skey}`;
  }
  if (sid === "doral") {
    const base = FILE_TO_LEGACY_TID[skey] || `doral${(t.date || "").slice(2, 4)}`;
    if (f.ageMin == null && f.ageMax == null) return base;
    const ages = `${f.ageMin || ""}${f.ageMax && f.ageMax !== f.ageMin ? f.ageMax : ""}`;
    return `${base}_b${ages}`;
  }
  if (sid === "fpg") {
    // sourceKey: "ccode-tcode-date-escSlug" → tid: "fpg{tcode}_{date}_{escSlug}"
    const parts = String(skey).split("-");
    const tcode = parts[1] || parts[0] || skey;
    const date = parts[2] || "";
    const esc = parts[3] || "";
    return `fpg${tcode}${date ? "_" + date : ""}${esc && esc !== "all" ? "_" + esc : ""}`;
  }
  if (sid === "rfeg") return String(skey); // já vem no formato "nc{id}_{escalão}" ou "lgs{id}"
  if (sid === "ffgolf") return `ff-${skey}`;
  return `${sid}-${skey}`;
}

function shortNameOf(name: string): string {
  return String(name || "").replace(/\s+/g, " ").trim().slice(0, 20);
}

function ptDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m] = String(iso).split("-").map(Number);
  if (!y || !m) return "";
  return `${MONTHS_PT[m - 1]} ${y}`;
}

// ═════════════════════════════════════════════════════════════════════
// Loader principal
// ═════════════════════════════════════════════════════════════════════

async function fetchJson(path: string): Promise<unknown> {
  const data = await cachedFetchJson(path);
  if (data === null) throw new Error(`Ficheiro não encontrado: ${path}`);
  return data;
}

export async function buildAutoRivals(
  onProgress?: (p: LoadProgress) => void,
  opts?: { force?: boolean; onUpdate?: (players: AutoRivalPlayer[]) => void; ageGroups?: string[] }
): Promise<AutoRivalPlayer[]> {
  if (!opts?.force && _autoRivalsCache) return _autoRivalsCache;
  _autoRivalsCache = _buildAutoRivalsInternal(onProgress, opts?.onUpdate);
  return _autoRivalsCache;
}

async function _buildAutoRivalsInternal(
  onProgress?: (p: LoadProgress) => void,
  onUpdate?: (players: AutoRivalPlayer[]) => void
): Promise<AutoRivalPlayer[]> {
  _scorecards.clear();
  uskTournNames.clear();
  uskFieldSizes.clear();
  ncScoringType.clear();
  fpgTournNames.clear();
  extraTidMeta.clear();
  ffgolfTournNames.clear();
  _loadedFiles = [];

  const total = 3;
  let done = 0;
  const report = (label: string) => { done++; onProgress?.({ done, total, label }); };

  const [juniorsData, tournamentsManifest] = await Promise.all([
    fetchJson("/data/juniors.json")
      .then(d => { _loadedFiles.push({ path: "/data/juniors.json", status: "loaded", group: "canonical" }); report("Juniors"); return d; })
      .catch(e => { _loadedFiles.push({ path: "/data/juniors.json", status: "error", error: String(e), group: "canonical" }); report("Juniors"); return null; }),
    fetchJson("/data/juniors-tournaments.json")
      .then(d => { _loadedFiles.push({ path: "/data/juniors-tournaments.json", status: "loaded", group: "canonical" }); report("Tournaments"); return d; })
      .catch(e => { _loadedFiles.push({ path: "/data/juniors-tournaments.json", status: "error", error: String(e), group: "canonical" }); report("Tournaments"); return null; }),
    fetchJson("/data/tournament-catalog.json")
      .then(d => { _loadedFiles.push({ path: "/data/tournament-catalog.json", status: "loaded", group: "canonical" }); report("Catalog"); return d; })
      .catch(e => { _loadedFiles.push({ path: "/data/tournament-catalog.json", status: "error", error: String(e), group: "canonical" }); report("Catalog"); return null; }),
  ]);

  if (!juniorsData || !tournamentsManifest) {
    console.error("[KIDSdataLoader] Falhou carregar canónicos. Correr `node scripts/aggregator/index.js` primeiro.");
    return [];
  }

  const juniors: CanonicalJunior[] = (juniorsData as any).juniors || [];

  // juniors-tournaments.json pode ser:
  //   • Ficheiro único com `tournaments: [...]` inline
  //   • Manifesto sharded com `sharded: true, shards: ["juniors-tournaments-00.json", ...]`
  // No segundo caso, temos de carregar os shards e concatenar os tournaments.
  let tournaments: CanonicalTournament[] = [];
  const tResp = tournamentsManifest as any;
  if (tResp?.sharded && Array.isArray(tResp.shards)) {
    const shardLoads = await Promise.all(
      tResp.shards.map((fn: string) =>
        fetchJson(`/data/${fn}`)
          .then(d => { _loadedFiles.push({ path: `/data/${fn}`, status: "loaded", group: "canonical-shards" }); return d; })
          .catch(e => { _loadedFiles.push({ path: `/data/${fn}`, status: "error", error: String(e), group: "canonical-shards" }); return null; })
      )
    );
    for (const sd of shardLoads) {
      const arr = (sd as any)?.tournaments;
      if (Array.isArray(arr)) tournaments.push(...arr);
    }
  } else if (Array.isArray(tResp?.tournaments)) {
    tournaments = tResp.tournaments;
  }

  const flightTids = new Map<string, string>();
  for (const t of tournaments) {
    for (const f of t.flights) {
      const tid = legacyTid(t, f);
      if (!tid) continue;
      flightTids.set(`${t.id}|${f.flightKey}`, tid);

      if (t.sourceId === "uskids") {
        const baseTid = `usk${t.sourceKey}`;
        if (!uskTournNames.has(baseTid) && t.name) {
          uskTournNames.set(baseTid, {
            name: t.name,
            short: shortNameOf(t.name),
            date: ptDate(t.date),
            dateExact: t.date || "",
          });
        }
        if (f.fieldSize) uskFieldSizes.set(tid, f.fieldSize);
      }
      // RFEG: populamos uskTournNames com tid (e.g. "nc61067_alevín") porque
      // o KIDSPage faz lookup partilhado nesse map para tids "nc"/"lgs".
      if (t.sourceId === "rfeg" && t.name) {
        uskTournNames.set(tid, {
          name: t.name,
          short: shortNameOf(t.name),
          date: ptDate(t.date),
          dateExact: t.date || "",
        });
        if (f.fieldSize) uskFieldSizes.set(tid, f.fieldSize);
      }
      if (t.sourceId === "fpg" && t.name) {
        fpgTournNames.set(tid, {
          name: t.name,
          short: shortNameOf(t.name),
          date: ptDate(t.date),
          dateExact: t.date || "",
          ageMin: f.ageMin ?? undefined,
          ageMax: f.ageMax ?? undefined,
          sex: (f.sex === "M" || f.sex === "F") ? f.sex : undefined,
          escalao: f.label,
        });
      }
      if ((t.sourceId === "wjgc" || t.sourceId === "doral" || t.sourceId === "eowagr") && !extraTidMeta.has(tid)) {
        extraTidMeta.set(tid, {
          name: t.name || tid,
          short: shortNameOf(t.name || tid),
          dateISO: t.date || "",
          url: t.links && t.links[0] ? t.links[0].url : null,
        });
      }
      if (t.sourceId === "ffgolf" && t.name) {
        ffgolfTournNames.set(tid, {
          name: t.name,
          short: shortNameOf(t.name),
          date: ptDate(t.date),
          dateExact: t.date || "",
          ageMin: f.ageMin ?? undefined,
          ageMax: f.ageMax ?? undefined,
          sex: (f.sex === "M" || f.sex === "F") ? f.sex : undefined,
          ageGroup: f.label,
        });
      }
    }
  }

  const juniorResults = new Map<string, Array<{ tid: string; result: CanonicalResult; flight: CanonicalFlight; tournament: CanonicalTournament }>>();
  for (const t of tournaments) {
    for (const f of t.flights) {
      const tid = flightTids.get(`${t.id}|${f.flightKey}`);
      if (!tid) continue;
      for (const r of f.results || []) {
        const jId = r.juniorId;
        if (!jId) continue;
        let arr = juniorResults.get(jId);
        if (!arr) { arr = []; juniorResults.set(jId, arr); }
        arr.push({ tid, result: r, flight: f, tournament: t });
      }
    }
  }

  const players: AutoRivalPlayer[] = [];
  for (const j of juniors) {
    const p: AutoRivalPlayer = {
      n: j.canonicalName,
      co: j.country ? co(j.country) : (j.nationality ? co(j.nationality) : ""),
      r: {},
    };
    if (j.dob) p.dob = j.dob;
    if (j.sources?.uskids?.memberId) p.memberId = j.sources.uskids.memberId;
    if (j.sources?.fpg?.fed) {
      p.ptFed = j.sources.fpg.fed;
      p.fpgClub = j.sources.fpg.club || undefined;
      // HCP FPG (quando disponível em juniors.json sources.fpg.hcpExact)
      if (typeof j.sources.fpg.hcpExact === "number") {
        p.fpgHcpExact = j.sources.fpg.hcpExact;
      }
      if (typeof j.sources.fpg.hcpDate === "string") {
        p.fpgHcpDate = j.sources.fpg.hcpDate;
      }
    }
    if (j.sources?.rfeg?.lic) {
      p.esLicencia = j.sources.rfeg.lic;
      p.esClub = j.sources.rfeg.club || undefined;
      p.esCatEdad = j.sources.rfeg.catEdad || undefined;
      p.esHcp = j.sources.rfeg.hcp;
      p.esSex = j.sources.rfeg.sex || undefined;
    }
    if (j.sources?.ffgolf?.lic) {
      p.frFed = j.sources.ffgolf.lic;
    }
    // hcpHistory (cross-source) — vem directamente do aggregator
    if (Array.isArray((j as { hcpHistory?: HcpPoint[] }).hcpHistory)) {
      p.hcpHistory = (j as { hcpHistory?: HcpPoint[] }).hcpHistory;
    }

    const results = juniorResults.get(j.id) || [];
    for (const { tid, result, flight, tournament } of results) {
      const grossTotal = typeof result.totalGross === "number" ? result.totalGross : null;
      const toPar = typeof result.toPar === "number" ? result.toPar : null;
      const rd: number[] = [];
      for (const r of result.rounds || []) {
        if (typeof r.gross === "number") rd.push(r.gross);
      }
      const status = result.status;
      let pos: number | "WD" | null;
      if (status === "WD" || status === "DNS" || status === "DQ" || status === "IE") pos = "WD";
      else if (typeof result.pos === "number") pos = result.pos;
      else pos = null;

      const tr: AutoTournResult = {
        p: pos,
        t: grossTotal,
        tp: toPar,
        rd,
        ageGroup: flight.label,
        nholes: tournament.holesPerRound || 18,
      };
      const existing = p.r[tid];
      if (!existing) p.r[tid] = tr;
      else if (tr.rd.length >= (existing.rd?.length || 0)) p.r[tid] = tr;

      for (const round of result.rounds || []) {
        if (!Array.isArray(round.strokes) || round.strokes.length < 9) continue;
        const k = normName(p.n);
        if (!_scorecards.has(k)) _scorecards.set(k, []);
        const scs = _scorecards.get(k)!;
        let sc = scs.find((s) => s.tid === tid);
        if (!sc) {
          // Canónico guarda yards (vindo de USKids/WJGC/etc.). Converter para metros para display.
          // FPG e RFEG já devolvem metros — não converter quando flight.par + flight.yards vêm dessas fontes.
          const yardsArr = (flight.yards || []) as number[];
          const isYardsSource = tournament.sourceId === "uskids" || tournament.sourceId === "wjgc" || tournament.sourceId === "eowagr" || tournament.sourceId === "doral";
          const metersArr = isYardsSource
            ? yardsArr.map((y) => (typeof y === "number" && y > 0 ? Math.round(y * 0.9144) : 0))
            : yardsArr;
          sc = {
            tid,
            playerName: p.n,
            par: (flight.par || []) as number[],
            si: [],
            meters: metersArr,
            rounds: [],
          };
          scs.push(sc);
        }
        sc.rounds.push(round.strokes);
      }
    }

    players.push(p);
  }

  onUpdate?.(players);
  return players;
}

// ═════════════════════════════════════════════════════════════════════
// Stubs para process* — alguns componentes podem ainda importar; devolvem
// [] silenciosamente. Manter para compat até refactor completo.
// ═════════════════════════════════════════════════════════════════════

export function mergeInto(_map: Map<string, AutoRivalPlayer>, _players: AutoRivalPlayer[], _forceTids?: ReadonlySet<string>): void {}
export function processWjgc(_data: unknown, _tid: string): AutoRivalPlayer[] { return []; }
export function processDoral(_data: unknown): AutoRivalPlayer[] { return []; }
export function processManuelOverrides(): AutoRivalPlayer[] { return []; }
export function processUskids(_data: unknown): AutoRivalPlayer[] { return []; }
export function processUskidsCompleto(_data: unknown): AutoRivalPlayer[] { return []; }
export function processMemberHistory(_data: unknown): AutoRivalPlayer[] { return []; }
export function processPullTorneios(_data: unknown): AutoRivalPlayer[] { return []; }
export function processFpgJuniorTourns(_data: unknown): AutoRivalPlayer[] { return []; }
export function processFpgJovensAll(_data: unknown): AutoRivalPlayer[] { return []; }
export function processFfgolfSlim(_data: unknown): AutoRivalPlayer[] { return []; }
export function processFfgolfGG(_data: unknown, _meta: unknown): AutoRivalPlayer[] { return []; }
export function processRfegolfRivals(_data: unknown): AutoRivalPlayer[] { return []; }
