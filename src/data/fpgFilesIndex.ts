/**
 * fpgFilesIndex.ts — que ficheiros de torneios da FPG existem em /data.
 *
 * Lê `/data/fpg-files-index.json` (gerado no predev/prebuild por
 * `scripts/build-fpg-files-index.js`, fora do git). As páginas pedem só os
 * ficheiros desta lista — antes sondavam os nomes (pull-torneios até falharem
 * dois seguidos, todos os meses de drive/aquapor) e cada falta era um 404.
 */
import { cachedFetchJson } from "./fetchCache";

export const FPG_FILES_INDEX_URL = "/data/fpg-files-index.json";

export type FpgFileSeries = "pull-torneios" | "drive-data" | "aquapor-data";

export type FpgFilesIndex = Partial<Record<FpgFileSeries, string[]>>;

/** O índice (vazio se não existir — nesse caso não se pede ficheiro nenhum). */
export async function loadFpgFilesIndex(): Promise<FpgFilesIndex> {
  return (await cachedFetchJson<FpgFilesIndex>(FPG_FILES_INDEX_URL).catch(() => null)) ?? {};
}

/** URLs `/data/…` de uma série, por ordem. Nos mensais (`drive-data-YYYY-MM`,
 *  `aquapor-data-YYYY-MM`), `fromYear` deixa de fora os anos anteriores. */
export function fpgFileUrls(index: FpgFilesIndex, series: FpgFileSeries, fromYear?: number): string[] {
  return (index[series] ?? [])
    .filter(name => {
      if (fromYear == null) return true;
      const y = /-(\d{4})-\d{2}\.json$/.exec(name);
      return !!y && parseInt(y[1], 10) >= fromYear;
    })
    .map(name => `/data/${name}`);
}

/** Número do ficheiro pull-torneios (`/data/pull-torneios003.json` → 3). */
export function pullTorneiosIndexOf(url: string): number {
  const m = /pull-torneios(\d+)\.json$/.exec(url);
  return m ? parseInt(m[1], 10) : -1;
}
