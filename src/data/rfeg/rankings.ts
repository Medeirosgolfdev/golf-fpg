/**
 * rankings.ts — rankings juvenis da RFEG (scripts/scrape-rfeg-ranking.js):
 * o índice `rfeg-rankings-index.json` e cada lista em `rfeg-rankings/{file}`.
 */
import { cachedFetchJson } from "../fetchCache";
import { escalaoCanon } from "../model/escalao";

export interface RfegRankingIndexItem {
  file: string;
  id: number;
  year: number;
  comite: string;
  titulo: string;
  fecha: string | null;
  fechaIso: string | null;
  total: number;
  conLicencia?: number;
}

export interface RfegRankingIndex {
  generatedAt: string;
  rankings: RfegRankingIndexItem[];
}

export interface RfegRankingJogador {
  pos: number | null;
  nombre: string;
  puntos: number | null;
  licencia?: string | null;
  /** B Benjamín · A Alevín · I Infantil · C Cadete (só nos juvenis). */
  cat?: string | null;
  edad?: number | null;
}

export interface RfegRankingLista extends RfegRankingIndexItem {
  pdf?: string;
  players: RfegRankingJogador[];
}

export const RFEG_RANKINGS_INDEX_URL = "/data/rfeg-rankings-index.json";
export const loadRfegRankingsIndex = () => cachedFetchJson<RfegRankingIndex>(RFEG_RANKINGS_INDEX_URL);
export const loadRfegRanking = (file: string) => cachedFetchJson<RfegRankingLista>(`/data/rfeg-rankings/${file}`);

const CAT: Record<string, string> = { B: "Benjamín", A: "Alevín", I: "Infantil", C: "Cadete" };

/** Escalão pela letra da categoria do ranking (pela tabela única, fonte «es»). */
export function rfegRankingEscalao(cat: string | null | undefined): string | null {
  const nome = CAT[String(cat ?? "").trim().toUpperCase()];
  return nome ? escalaoCanon(nome, "es") : null;
}

/** Listas de um ano: os rankings nacionais primeiro, depois as zonas. */
export function rfegRankingsDoAno(idx: RfegRankingIndex, ano: number): RfegRankingIndexItem[] {
  const nacional = (t: string) => (/nacional/i.test(t) ? 0 : 1);
  return idx.rankings.filter((r) => r.year === ano)
    .sort((a, b) => nacional(a.titulo) - nacional(b.titulo) || a.titulo.localeCompare(b.titulo, "es"));
}
