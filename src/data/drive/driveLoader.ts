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
