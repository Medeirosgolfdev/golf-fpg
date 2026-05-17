/**
 * fpgLoaders.ts — Funções puras para carregar dados FPG.
 *
 * Cada função devolve uma Promise com os dados parseados + meta de origem.
 * NÃO setam state — orquestração de useState/useEffect fica nos componentes
 * que consomem estes loaders. Reusável por qualquer página que precise dos
 * mesmos ficheiros (FPGPage, DrivePage, NacionaisJovensPage, KIDSPage).
 */
import { normalizePlayer } from "../utils/playerUtils";
import type { Tournament } from "./fpgTypes";
import type { DataSource } from "../ui/DataSources";
import { dataUrl, DATA_MAX, type DriveData, type FileMeta } from "../pages/fpg/constants";

export interface PullLoadResult {
  tournaments: Tournament[];
  fileMeta: FileMeta[];
  /** Útil para componentes que mostram progresso a meio do load. */
  partialUpdates?: Array<{ tournaments: Tournament[]; fileMeta: FileMeta[] }>;
}

export interface PullLoadOptions {
  /** Hook chamado no fim de cada batch — para UI mostrar progresso. */
  onBatchComplete?: (state: { tournaments: Tournament[]; fileMeta: FileMeta[] }) => void;
  /** Sinal de cancelamento — quando true, aborta após o batch corrente. */
  isAlive?: () => boolean;
  /** Mapa tcode → links externos (de tournament-links.json). Optional. */
  externalLinks?: Record<string, Record<string, string>>;
  /** Tamanho do batch concorrente (default 10). */
  parallelBatch?: number;
}

/**
 * Carrega os ficheiros pull-torneios000.json, 001.json, … em batches paralelos.
 *
 * Pára após 2 ficheiros consecutivos darem 404 (segurança contra DATA_MAX
 * ficheiros inexistentes). Aplica `normalizePlayer` a todos os jogadores.
 * Aplica `externalLinks` se fornecido.
 *
 * @returns array de torneios + meta de cada ficheiro lido com sucesso
 */
export async function loadPullTorneios(opts: PullLoadOptions = {}): Promise<PullLoadResult> {
  const {
    onBatchComplete,
    isAlive = () => true,
    externalLinks = {},
    parallelBatch = 10,
  } = opts;

  const allT: Tournament[] = [];
  const meta: FileMeta[] = [];
  let stopAt = DATA_MAX;

  for (let start = 0; start < stopAt; start += parallelBatch) {
    if (!isAlive()) break;
    const batchEnd = Math.min(start + parallelBatch, stopAt);
    const batch = await Promise.all(
      Array.from({ length: batchEnd - start }, (_, k) => start + k).map(async (i) => {
        const url = dataUrl(i);
        try {
          const resp = await fetch(url);
          if (!resp.ok) return { i, url, d: null as DriveData | null, parseErr: null as string | null };
          const d = await resp.json() as DriveData;
          return { i, url, d, parseErr: null };
        } catch (e) {
          return { i, url, d: null, parseErr: String(e).slice(0, 120) };
        }
      })
    );
    let consecutiveMisses = 0;
    let hitStop = false;
    for (const { i, url, d, parseErr } of batch) {
      if (!d) {
        if (parseErr) console.warn(`[fpgLoaders] Falhou a parsear ${url}: ${parseErr} — a continuar`);
        consecutiveMisses++;
        if (consecutiveMisses >= 2) { stopAt = i; hitStop = true; break; }
        continue;
      }
      consecutiveMisses = 0;
      const normalised = (d.tournaments || []).map(t => {
        const extLinks = externalLinks[String(t.tcode)];
        return { ...t, _sourceFile: url, _sourceIndex: i,
          players: t.players.map(normalizePlayer),
          ...(extLinks ? { links: { ...(t.links || {}), ...extLinks } } : {}) };
      });
      allT.push(...normalised);
      meta.push({ file: url, index: i, lastUpdated: d.lastUpdated, source: d.source, count: normalised.length });
    }
    if (onBatchComplete) onBatchComplete({ tournaments: [...allT], fileMeta: [...meta] });
    if (hitStop) break;
  }

  return { tournaments: allT, fileMeta: meta };
}

// ─────────────────────────────────────────────────────────────────────────
// CLUBES
// ─────────────────────────────────────────────────────────────────────────
export const CLUBES_FILES_MAIN: { url: string; year: string }[] = [
  { url: "/data/clubes_sub_14&18_2026.json", year: "2026" },
  { url: "/data/clubes_sub_14&18_2025.json", year: "2025" },
  { url: "/data/clubes_sub_14&18_2024.json", year: "2024" },
];

export const CLUBES_FILES_D1: { url: string; escFallback: string | null; year: string }[] = [
  { url: "/data/clubes_sub_14_D1.json",     escFallback: "sub14", year: "2026" },
  { url: "/data/clubes_sub_18_D1.json",     escFallback: "sub18", year: "2026" },
  { url: "/data/clubes_sub_14&18_2026.json", escFallback: null,  year: "2026" },
  { url: "/data/clubes_sub_14&18_2025.json", escFallback: null,  year: "2025" },
  { url: "/data/clubes_sub_14&18_2024.json", escFallback: null,  year: "2024" },
];

export function resolveEscKey(escalao: string | null | undefined, fallback: string | null = "sub14"): string {
  if (escalao && /14/i.test(escalao)) return "sub14";
  if (escalao && /18/i.test(escalao)) return "sub18";
  return fallback ?? "sub14";
}

export interface ClubesLoadResult {
  tournaments: Tournament[];
  meta: DataSource[];
}

/** Carrega ficheiros clubes_sub_14&18_YYYY.json (master). */
export async function loadClubesMain(): Promise<ClubesLoadResult> {
  const meta: DataSource[] = [];
  const results = await Promise.all(CLUBES_FILES_MAIN.map(async ({ url, year }) => {
    try {
      const r = await fetch(url);
      if (!r.ok) {
        meta.push({ path: url, status: "error", error: `HTTP ${r.status}`, group: "clubes" });
        return [];
      }
      const d: DriveData = await r.json();
      const rows = (d.tournaments || []).map(t => ({
        ...t,
        series: "clubes" as const,
        _clubesEsc: resolveEscKey((t as any).escalao),
        _clubesYear: year,
        _sourceFile: url,
        players: t.players.map(normalizePlayer),
      }));
      meta.push({ path: url, status: "loaded", count: rows.length, source: d.source, lastUpdated: d.lastUpdated, group: "clubes" });
      return rows;
    } catch (e) {
      meta.push({ path: url, status: "error", error: String(e), group: "clubes" });
      return [];
    }
  }));
  // Dedup por tcode
  const flat = results.flat();
  const seen = new Map<string, Tournament>();
  for (const t of flat) seen.set(String(t.tcode), t as Tournament);
  return { tournaments: [...seen.values()], meta };
}

// ─────────────────────────────────────────────────────────────────────────
// JOVENS (Nacionais Jovens 2019-2026)
// ─────────────────────────────────────────────────────────────────────────
export const JOVENS_FILES: { url: string; year: string }[] = [
  { url: "/data/jovens_2026.json", year: "2026" },
  { url: "/data/jovens_2025.json", year: "2025" },
  { url: "/data/jovens_2024.json", year: "2024" },
  { url: "/data/jovens_2023.json", year: "2023" },
  { url: "/data/jovens_2022.json", year: "2022" },
  { url: "/data/jovens_2020.json", year: "2020" },
  { url: "/data/jovens_2019.json", year: "2019" },
];

export const JOVENS_HISTORICO_URL = "/data/fpg-nacionais-historico.json";

export interface JovensLoadResult {
  tournaments: Tournament[];
  meta: DataSource[];
}

/** Carrega jovens_YYYY.json + fpg-nacionais-historico.json (filtra "de Clubes"). */
export async function loadJovens(): Promise<JovensLoadResult> {
  const meta: DataSource[] = [];

  const yearTasks = JOVENS_FILES.map(async ({ url, year }) => {
    try {
      const r = await fetch(url);
      if (!r.ok) {
        meta.push({ path: url, status: "error", error: `HTTP ${r.status}`, group: "jovens" });
        return [];
      }
      const d: DriveData = await r.json();
      const rows = (d.tournaments || []).map(t => ({
        ...t, _jovensYear: year, _sourceFile: url,
        players: t.players.map(normalizePlayer),
      }));
      meta.push({ path: url, status: "loaded", count: rows.length, source: d.source, lastUpdated: d.lastUpdated, group: "jovens" });
      return rows;
    } catch (e) {
      meta.push({ path: url, status: "error", error: String(e), group: "jovens" });
      return [];
    }
  });

  const histTask = (async () => {
    try {
      const r = await fetch(JOVENS_HISTORICO_URL);
      if (!r.ok) {
        meta.push({ path: JOVENS_HISTORICO_URL, status: "error", error: `HTTP ${r.status}`, group: "jovens" });
        return [];
      }
      const d: any = await r.json();
      const rows = ((d.tournaments || []) as any[])
        .filter((t: any) => !/de\s+clubes/i.test(t.name || ""))
        .map((t: any) => ({
          ...t,
          _jovensYear: (t.date || "").substring(0, 4),
          _sourceFile: JOVENS_HISTORICO_URL,
          players: (t.players || []).map(normalizePlayer),
          ...(t.admissions ? { _admissions: t.admissions } : {}),
          ...(t.draws ? { _draws: t.draws } : {}),
        }));
      meta.push({ path: JOVENS_HISTORICO_URL, status: "loaded", count: rows.length, source: d.source, lastUpdated: d.lastUpdated, group: "jovens" });
      return rows;
    } catch (e) {
      meta.push({ path: JOVENS_HISTORICO_URL, status: "error", error: String(e), group: "jovens" });
      return [];
    }
  })();

  const all = await Promise.all([...yearTasks, histTask]);
  return { tournaments: all.flat() as Tournament[], meta };
}

// ─────────────────────────────────────────────────────────────────────────
// PJA EXTRA (drive-data + aquapor-data mensais)
// ─────────────────────────────────────────────────────────────────────────
/** Carrega ficheiros mensais drive-data-YYYY-MM.json ou aquapor-data-YYYY-MM.json
 *  do startYear até ao mês corrente. Cada fetch falha silenciosamente. */
export async function loadMonthlyTournaments(prefix: string, startYear: number): Promise<Tournament[]> {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const urls: string[] = [];
  for (let y = startYear; y <= curYear; y++) {
    const endMonth = (y === curYear) ? curMonth : 12;
    for (let m = 1; m <= endMonth; m++) {
      urls.push(`/data/${prefix}-${y}-${String(m).padStart(2, "0")}.json`);
    }
  }
  const results = await Promise.all(urls.map(async (url) => {
    try {
      const r = await fetch(url);
      if (!r.ok) return [];
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("json")) return [];
      const d = await r.json();
      return (d.tournaments || []).map((t: any) => ({
        ...t, _sourceFile: url,
        players: (t.players || []).map(normalizePlayer),
      })) as Tournament[];
    } catch { return []; }
  }));
  return results.flat();
}

/** Carrega `/data/pja-members.json` (lista de fedCodes inscritos no PJA por ano). */
export async function loadPjaMembers(): Promise<Record<string, string[]>> {
  try {
    const r = await fetch("/data/pja-members.json");
    if (!r.ok) return {};
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("json")) return {};
    const d = await r.json();
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(d)) {
      if (k.startsWith("_")) continue;
      if (Array.isArray(v)) out[k] = v.map(String);
    }
    return out;
  } catch { return {}; }
}

/** Carrega `/data/pja-pdf-snapshot.json` (snapshot oficial PJA para comparação). */
export async function loadPjaPdfSnapshot(): Promise<Record<string, any[]>> {
  try {
    const r = await fetch("/data/pja-pdf-snapshot.json");
    if (!r.ok) return {};
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("json")) return {};
    const d = await r.json();
    const out: Record<string, any[]> = {};
    for (const [k, v] of Object.entries(d)) {
      if (k.startsWith("_")) continue;
      if (Array.isArray(v)) out[k] = v as any[];
    }
    return out;
  } catch { return {}; }
}
