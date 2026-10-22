/**
 * src/data/drive/driveLoader.ts — os ficheiros mensais do Drive e do AQUAPOR.
 *
 * `drive-data-YYYY-MM.json` e `aquapor-data-YYYY-MM.json`: só os meses que o
 * índice (`fpg-files-index.json`, gerado no build) diz existirem — nunca se
 * sondam meses às cegas. Lidos pelo `cachedFetchJson`, por isso a /drive e a
 * /FPG (Ranking PJA) partilham o mesmo pedido na mesma sessão.
 *
 * Cada torneio sai como objecto NOVO (jogadores normalizados, `_sourceFile`) —
 * as páginas mexem nos jogadores (fed resolvido por nome, posições), e o JSON
 * em cache tem de ficar como veio.
 */
import type { Tournament } from "../fpgTypes";
import type { DataSource } from "../../ui/DataSources";
import { cachedFetchJson } from "../fetchCache";
import { fpgFileUrls, loadFpgFilesIndex } from "../fpgFilesIndex";
import { normalizePlayer } from "../../utils/playerUtils";
import { loadFpgPlayersDB } from "../fpgPlayersDB";
import { expandMultiRound } from "../../ui/driveUtils";
import { loadFpgAdmissionsDraws, indexFpgAdmissionsDraws } from "../nacional2026Loader";
import type { PlayersDB } from "../../ui/tournamentPrimitives";
import type { DriveAdmissionsIndex } from "./driveSource";

export type DriveMonthlyPrefix = "drive-data" | "aquapor-data";

interface DriveMonthlyFile {
  tournaments?: Tournament[];
  source?: string;
  lastUpdated?: string;
}

export interface DriveMonthlyOptions {
  /** Só os meses deste ano em diante. */
  fromYear?: number;
  /** Força a série de todos os torneios (a /drive marca os do AQUAPOR). */
  forceSeries?: Tournament["series"];
}

export interface DriveMonthlyResult {
  tournaments: Tournament[];
  /** Um registo por ficheiro (carregado ou com erro), para o painel de fontes. */
  meta: DataSource[];
}

/** Torneios de todos os ficheiros mensais de uma série, por ordem do índice. */
export async function loadDriveMonthly(prefix: DriveMonthlyPrefix, opts: DriveMonthlyOptions = {}): Promise<DriveMonthlyResult> {
  const urls = fpgFileUrls(await loadFpgFilesIndex(), prefix, opts.fromYear);
  const lidos = await Promise.all(urls.map(async (url): Promise<{ url: string; d?: DriveMonthlyFile; error?: string }> => {
    try {
      const d = await cachedFetchJson<DriveMonthlyFile>(url);
      return d ? { url, d } : { url, error: "HTTP 404" };
    } catch (e) {
      return { url, error: String(e) };
    }
  }));
  const tournaments: Tournament[] = [];
  const meta: DataSource[] = [];
  for (const { url, d, error } of lidos) {
    if (!d) { meta.push({ path: url, status: "error", error, group: prefix }); continue; }
    const tourns = (d.tournaments || []).map((t): Tournament => ({
      ...t,
      ...(opts.forceSeries ? { series: opts.forceSeries } : {}),
      players: (t.players || []).map(normalizePlayer),
      _sourceFile: url,
    }));
    tournaments.push(...tourns);
    meta.push({ path: url, status: "loaded", count: tourns.length, source: d.source, lastUpdated: d.lastUpdated, group: prefix });
  }
  return { tournaments, meta };
}

/** Tudo o que a /drive precisa para arrancar: os mensais do Drive e do AQUAPOR
 *  (lista crua, por ordem do índice), a lista com as voltas expandidas
 *  (R1/R2/Resumo) e o playersDB da FPG (`loadFpgPlayersDB`: com as
 *  nacionalidades — bandeiras —, decisão F). */
export interface DriveDataLoad {
  raw: Tournament[];
  tournaments: Tournament[];
  meta: DataSource[];
  players: PlayersDB;
}
export async function loadDriveData(): Promise<DriveDataLoad> {
  const [driveR, aqR, pp] = await Promise.all([
    loadDriveMonthly("drive-data"),
    loadDriveMonthly("aquapor-data", { forceSeries: "aquapor" }),
    loadFpgPlayersDB().catch(() => ({} as PlayersDB)),
  ]);
  const raw = [...driveR.tournaments, ...aqR.tournaments];
  return { raw, tournaments: expandMultiRound(raw), meta: [...driveR.meta, ...aqR.meta], players: pp };
}

/** Classificação por equipas de uma Final (`drive-equipas.json`, lida do PDF oficial). */
export interface DriveEquipaJogador { nome: string; gross: number | null; toPar: number; buracos: number; conta: boolean }
export interface DriveEquipa { pos: number; regiao: string; toPar: number; jogadores: DriveEquipaJogador[] }
export interface DriveEquipasData { nome: string; data: string; regra: string; fonte: string; equipas: DriveEquipa[] }

/** Classificação por equipas (zonas) das Finais — `drive-equipas.json`, chave
 *  «ccode-tcode». Opcional: sem o ficheiro devolve `null`. */
export async function loadDriveEquipas(): Promise<Record<string, DriveEquipasData | null> | null> {
  return cachedFetchJson<Record<string, DriveEquipasData | null>>("/data/drive-equipas.json").catch(() => null);
}

/** Inscrições e draws da FPG indexados por «ccode-tcode», com o registo para o
 *  painel de fontes. Em erro: índice vazio e o registo do erro. */
export async function loadDriveAdmissions(): Promise<{ idx: DriveAdmissionsIndex; meta: DataSource }> {
  const path = "/data/fpg-admissions-draws.json";
  try {
    const f = await loadFpgAdmissionsDraws();
    return {
      idx: indexFpgAdmissionsDraws(f),
      meta: { path, status: "loaded", count: f?.tournaments?.length || 0, source: f?.source, lastUpdated: f?.scrapedAt ?? undefined, group: "admissions" },
    };
  } catch (e) {
    return { idx: new Map(), meta: { path, status: "error", error: String(e), group: "admissions" } };
  }
}
