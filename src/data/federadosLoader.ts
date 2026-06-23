/**
 * federadosLoader.ts
 *
 * Lazy-load do ficheiro /data/federados.json (~15 MB) com a lista completa
 * de federados FPG (cadastro, sem scorecards).
 *
 * Cruza com players.json para produzir MergedPlayer[] com 3 origens:
 *  - "both"   → match em ambos (396)
 *  - "players"→ só em players.json (65, não pagaram quotas FPG)
 *  - "feds"   → só em federados.json (15.250, descobertos via FPG)
 */

import type { Player, PlayersDb } from "./types";
import { cachedFetchJson } from "./fetchCache";
import { fixMojibake } from "../utils/fixEncoding";

/* ── Formato bruto do JSON (snake_case da API FPG) ──────────── */
export interface FederadoRaw {
  federation_code: string;        // "18734"
  federation_number: string;      // "0018734"
  name: string;
  gender: "M" | "F" | string;
  birthdate: string | null;       // YYYY-MM-DD (já convertido)
  admission_date: string | null;
  club_code: string;              // "001"
  club_name: string;              // "Oporto Golf Clube"
  acronym: string;                // "Oporto"
  country_prefix: string;         // "PT", "GB", "CH", ...
  country: string;                // "Portugal"
  hcp_exact: number | null;
  hcp_index: number | null;
  hcp_status: string;             // "Válido", "Inativo", ...
  hcp_status_id: number;
  hcp_type: string;               // "EGA"
  age_level: string;              // "Senior", "SUB16", ...
  age_level_id: number;
  player_type: string;            // "Amador" / "Profissional"
  player_type_id: number;
  federated_status: string;       // "Ativo"
  federated_status_id: number;
  rounds_current_year: number;
  photo: string | null;
  last_hcp_date: string | null;
  encryptedfedcode: string;
  [k: string]: unknown;
}

export interface FederadosFile {
  generated: string;
  source: string;
  totalReported: number;
  totalScraped: number;
  players: FederadoRaw[];
}

/* ── Tipo unificado para a JogadoresPage ────────────────────── */
export type MergedSource = "both" | "players" | "feds";

export interface MergedPlayer extends Player {
  _source: MergedSource;
  _federadoRaw?: FederadoRaw;
  /** Diferenças detectadas vs federados FPG (só quando _source === "both") */
  _fpgDiffs?: {
    hcpChanged?: { ours: number; fpg: number };
    clubChanged?: { ours: string; fpg: string };
  };
}

/* ── Normalização de escalão FPG ("SUB16") → nosso ("Sub-16") ─ */
const FPG_AGE_TO_OURS: Record<string, string> = {
  SUB10: "Sub-10",
  SUB12: "Sub-12",
  SUB14: "Sub-14",
  SUB16: "Sub-16",
  SUB18: "Sub-18",
  SUB21: "Sub-21",
  SUB24: "Sub-24",
  MidAmateur: "Absoluto",
  Senior: "Sénior",
  SuperSenior: "Sénior",
};
export const normalizeAgeLevel = (s: string | undefined | null): string => {
  const mapped = (s && FPG_AGE_TO_OURS[s]) || s;
  // Valor desconhecido/vazio → tratamos como "Absoluto" (default sensato para
  // federados adultos sem age_level preenchido — antes ficavam como "Outros").
  if (!mapped || mapped === "Outros" || mapped === "?") return "Absoluto";
  return mapped;
};

/* ── Converter FederadoRaw → Player (para os 15.250 só-cadastro) ─
 * O parâmetro `clubRegionMap` é derivado dos nossos players.json
 * (club.code → region), permitindo inferir a região em jogadores
 * FPG que nunca passaram pelo pipeline.
 */
export function federadoToPlayer(f: FederadoRaw, clubRegionMap?: Map<string, string>): Player {
  return {
    name: f.name,
    nfed: f.federation_code,
    dob: f.birthdate || "",
    sex: (f.gender === "M" || f.gender === "F") ? f.gender : "M",
    hcp: f.hcp_exact,
    escalao: normalizeAgeLevel(f.age_level),
    club: { code: f.club_code, short: f.acronym, long: f.club_name },
    region: clubRegionMap?.get(String(f.club_code)) || "",
    tags: [],
    altNames: [],
    extra: {},
  };
}

/** Constrói o mapa clube→região a partir de players.json (moda por clube). */
export function buildClubRegionMap(players: PlayersDb): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const p of Object.values(players)) {
    if (!p.region) continue;
    const code = typeof p.club === "object" ? p.club?.code : undefined;
    if (!code) continue;
    if (!counts.has(code)) counts.set(code, new Map());
    const regs = counts.get(code)!;
    regs.set(p.region, (regs.get(p.region) || 0) + 1);
  }
  const result = new Map<string, string>();
  for (const [code, regs] of counts) {
    let best = "", bestN = 0;
    for (const [r, n] of regs) if (n > bestN) { best = r; bestN = n; }
    if (best) result.set(code, best);
  }
  return result;
}

/* ── Lazy-load do ficheiro (cacheado via fetchCache) ─────────── */
let _cache: FederadosFile | null = null;
let _loading: Promise<FederadosFile> | null = null;

export function loadFederados(): Promise<FederadosFile> {
  if (_cache) return Promise.resolve(_cache);
  if (_loading) return _loading;
  _loading = cachedFetchJson<FederadosFile>("/data/federados.json")
    .then(data => {
      if (!data) throw new Error("Falha ao carregar /data/federados.json");
      // Repara mojibake/encoding nas strings PT (como o App.tsx faz aos players).
      // Performance: o ficheiro é grande (~15 MB) → reparamos só os campos de
      // texto relevantes por registo (não recursão cega no objecto inteiro).
      for (const f of data.players) {
        if (f.name) f.name = fixMojibake(f.name);
        if (f.club_name) f.club_name = fixMojibake(f.club_name);
        if (f.acronym) f.acronym = fixMojibake(f.acronym);
        if (f.country) f.country = fixMojibake(f.country);
      }
      _cache = data;
      _loading = null;
      return data;
    })
    .catch(err => { _loading = null; throw err; });
  return _loading;
}

/** Invalida o cache — usar após update do ficheiro em dev. */
export function invalidateFederadosCache(): void {
  _cache = null;
  _loading = null;
}

/* ── Estatísticas dos inactivos (ficheiro leve ~25 KB) ──────── */
export interface InativosStats {
  generated: string;
  source: string;
  total: number;
  male: number;
  female: number;
  otherGender: number;
  withHcp: number;
  avgHcp: number | null;
  avgAge: number | null;
  pros: number;
  byAge: Record<string, { m: number; f: number }>;
  hcpBins: Record<string, { m: number; f: number }>;
  topCountries: { cp: string; count: number; name: string }[];
  admissionYears: [string, { m: number; f: number }][];
  allClubs: { code: string; name: string; m: number; f: number; count: number }[];
}

let _inatStatsCache: InativosStats | null = null;
let _inatStatsLoading: Promise<InativosStats> | null = null;

export function loadInativosStats(): Promise<InativosStats> {
  if (_inatStatsCache) return Promise.resolve(_inatStatsCache);
  if (_inatStatsLoading) return _inatStatsLoading;
  _inatStatsLoading = cachedFetchJson<InativosStats>("/data/federados-inativos-stats.json")
    .then(data => {
      if (!data) throw new Error("Falha ao carregar inativos-stats.json");
      _inatStatsCache = data;
      _inatStatsLoading = null;
      return data;
    })
    .catch(err => { _inatStatsLoading = null; throw err; });
  return _inatStatsLoading;
}

/* ── Jovens inactivos (Sub-10 a Sub-21, ~3 MB) ──────────────── */
export interface InativosJovensFile {
  generated: string;
  source: string;
  total: number;
  ageLevels: string[];
  players: FederadoRaw[];
}

let _inatJovensCache: InativosJovensFile | null = null;
let _inatJovensLoading: Promise<InativosJovensFile> | null = null;

export function loadInativosJovens(): Promise<InativosJovensFile> {
  if (_inatJovensCache) return Promise.resolve(_inatJovensCache);
  if (_inatJovensLoading) return _inatJovensLoading;
  _inatJovensLoading = cachedFetchJson<InativosJovensFile>("/data/federados-inativos-jovens.json")
    .then(data => {
      if (!data) throw new Error("Falha ao carregar inativos-jovens.json");
      _inatJovensCache = data;
      _inatJovensLoading = null;
      return data;
    })
    .catch(err => { _inatJovensLoading = null; throw err; });
  return _inatJovensLoading;
}

/* ── Merge: cruza players.json com federados.json ────────────── */
export function mergePlayersWithFederados(
  players: PlayersDb,
  federados: FederadoRaw[],
): MergedPlayer[] {
  const byFedno = new Map<string, FederadoRaw>();
  for (const f of federados) byFedno.set(String(f.federation_code), f);
  const clubRegionMap = buildClubRegionMap(players);

  const merged: MergedPlayer[] = [];
  const seenFednos = new Set<string>();

  // Coage escalão inválido/desconhecido ("?", "", "Outros") para "Absoluto"
  // — default sensato para jogadores adultos sem escalão preenchido.
  const fixEscalao = (esc: string | undefined | null): string =>
    (!esc || esc === "?" || esc === "Outros") ? "Absoluto" : esc;

  // 1. Percorrer os NOSSOS primeiro (têm scorecards + região + tags)
  for (const [nfed, p] of Object.entries(players)) {
    const f = byFedno.get(String(nfed));
    seenFednos.add(String(nfed));
    if (f) {
      // both — detectar diferenças
      const diffs: MergedPlayer["_fpgDiffs"] = {};
      if (p.hcp != null && f.hcp_exact != null && Math.abs(p.hcp - f.hcp_exact) > 0.1) {
        diffs.hcpChanged = { ours: p.hcp, fpg: f.hcp_exact };
      }
      const oursClub = typeof p.club === "string" ? p.club : p.club?.code;
      if (oursClub && f.club_code && String(oursClub) !== String(f.club_code)) {
        diffs.clubChanged = {
          ours: typeof p.club === "string" ? p.club : (p.club?.short || ""),
          fpg: f.acronym,
        };
      }
      merged.push({
        ...p,
        escalao: fixEscalao(p.escalao),
        nfed,
        _source: "both",
        _federadoRaw: f,
        _fpgDiffs: Object.keys(diffs).length ? diffs : undefined,
      });
    } else {
      // Só em nossos (órfãos FPG — não pagaram quotas)
      merged.push({ ...p, escalao: fixEscalao(p.escalao), nfed, _source: "players" });
    }
  }

  // 2. Adicionar os FPG-only (15.250)
  for (const f of federados) {
    const nfed = String(f.federation_code);
    if (seenFednos.has(nfed)) continue;
    merged.push({
      ...federadoToPlayer(f, clubRegionMap),
      _source: "feds",
      _federadoRaw: f,
    });
  }

  return merged;
}
