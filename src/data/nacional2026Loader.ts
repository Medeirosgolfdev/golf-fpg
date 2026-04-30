/**
 * src/data/nacional2026Loader.ts
 *
 * Loader para `public/data/fpg-admissions-draws.json` — contém admissions +
 * draws dos 107 torneios FPG scrapados via browser console (ver CLAUDE.md
 * "Fluxo: Descarregar inscrições + draws").
 *
 * Apesar do nome, o loader carrega TODOS os 107 torneios (não só Nacional 2026).
 * O nome mantém-se por historial.
 */

import { cachedFetchJson } from "./fetchCache";

// ── Tipos ──────────────────────────────────────────────────────────

export interface FpgAdmissionPlayer {
  pos: number | null;
  fed: string | null;
  nome: string;
  clube: string | null;
  hcp: number | null;
  vac: number | null;
  dataInscricao: string | null;  // "YYYY/MM/DD HH:MM"
  status: "confirmed" | "reserva";
}

export interface FpgDrawFlight {
  teeTime: string;
  startHole: number | null;
  tee: string | null;
  players: Array<{
    nome: string;
    clube: string | null;
    fed?: string | null;
    hcp?: number | null;
  }>;
}

export interface FpgDraw {
  name?: string;
  date?: string;
  totalJogadores?: number;
  groups?: FpgDrawFlight[];
  note?: string;
  error?: string;
}

export interface FpgAdmissions {
  name?: string;
  date?: string;
  status?: string;
  totalInscritos?: number;
  reservas?: number;
  players?: FpgAdmissionPlayer[];
  error?: string;
}

export interface FpgTournamentData {
  ccode: string;
  tcode: string;
  name: string | null;
  date: string | null;
  admissions?: FpgAdmissions;
  draws?: Record<string, FpgDraw>;
}

export interface FpgAdmissionsDrawsFile {
  scrapedAt: string | null;
  total: number;
  source?: string;
  tournaments: FpgTournamentData[];
}

// ── Meta dos 10 torneios Nacional 2026 ───────────────────────────────

export const NACIONAL_2026_META: Record<string, {
  escalao: "Sub 10" | "Sub 12" | "Sub 14" | "Sub 16" | "Sub 18";
  sex: "M" | "F";
  name: string;
}> = {
  "10935": { escalao: "Sub 18", sex: "M", name: "Campeonato Nacional de Jovens Sub 18 M" },
  "10936": { escalao: "Sub 18", sex: "F", name: "Campeonato Nacional de Jovens Sub 18 F" },
  "10937": { escalao: "Sub 16", sex: "M", name: "Campeonato Nacional de Jovens Sub 16 M" },
  "10938": { escalao: "Sub 16", sex: "F", name: "Campeonato Nacional de Jovens Sub 16 F" },
  "10939": { escalao: "Sub 14", sex: "M", name: "Campeonato Nacional de Jovens Sub 14 M" },
  "10940": { escalao: "Sub 14", sex: "F", name: "Campeonato Nacional de Jovens Sub 14 F" },
  "10941": { escalao: "Sub 12", sex: "M", name: "Campeonato Nacional de Jovens Sub 12 M" },
  "10942": { escalao: "Sub 12", sex: "F", name: "Campeonato Nacional de Jovens Sub 12 F" },
  "10943": { escalao: "Sub 10", sex: "M", name: "Campeonato Nacional de Jovens Sub 10 M" },
  "10944": { escalao: "Sub 10", sex: "F", name: "Campeonato Nacional de Jovens Sub 10 F" },
};

export const NACIONAL_2026_TCODES = Object.keys(NACIONAL_2026_META);

// ── Loader ─────────────────────────────────────────────────────────

let _cache: FpgAdmissionsDrawsFile | null = null;

/**
 * Normaliza um player das admissions: o scraper produz dois formatos
 * dependendo da versão do script:
 *   - antigo: { vac, dataInscricao }                  (~3000 entries)
 *   - novo:   { vacf, registo }                       (~900 entries, Nacional 2026)
 * Aqui mapeamos sempre para o formato canónico {vac, dataInscricao} que o resto
 * do código usa. Sem isto, as colunas "VAC" e "Registo" na AdmissionsTab ficam
 * vazias para o Nacional 2026.
 */
function normalizePlayer(p: any): FpgAdmissionPlayer {
  return {
    pos: p.pos ?? null,
    fed: p.fed ?? null,
    nome: p.nome ?? "",
    clube: p.clube ?? null,
    hcp: p.hcp ?? null,
    vac: p.vac ?? p.vacf ?? null,
    dataInscricao: p.dataInscricao ?? p.registo ?? null,
    status: p.status === "reserva" ? "reserva" : "confirmed",
  };
}

export async function loadFpgAdmissionsDraws(opts: { force?: boolean } = {}): Promise<FpgAdmissionsDrawsFile> {
  if (_cache && !opts.force) return _cache;
  try {
    const raw = await cachedFetchJson<FpgAdmissionsDrawsFile>("/data/fpg-admissions-draws.json");
    if (raw) {
      for (const t of (raw.tournaments || [])) {
        if (t.admissions && Array.isArray(t.admissions.players)) {
          t.admissions.players = t.admissions.players.map(normalizePlayer);
        }
      }
    }
    _cache = raw || { scrapedAt: null, total: 0, tournaments: [] };
  } catch {
    _cache = { scrapedAt: null, total: 0, tournaments: [] };
  }
  return _cache;
}

/** Indexa os torneios por `${ccode}-${tcode}`. */
export function indexFpgAdmissionsDraws(file: FpgAdmissionsDrawsFile): Map<string, FpgTournamentData> {
  const m = new Map<string, FpgTournamentData>();
  for (const t of (file.tournaments || [])) {
    m.set(`${t.ccode}-${t.tcode}`, t);
  }
  return m;
}

export function invalidateFpgAdmissionsDrawsCache(): void {
  _cache = null;
}
