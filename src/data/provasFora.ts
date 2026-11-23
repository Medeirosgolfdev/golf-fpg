/**
 * src/data/provasFora.ts — a prova verdadeira das voltas internacionais de um
 * federado (23/11/2026).
 *
 * A FPG regista as voltas jogadas lá fora (e nos internacionais cá, como o
 * Faldo Madeira) com o código de torneio fictício «999999»; um link da FPG com
 * esse código dá erro. O agregador do Kids 2 liga cada uma dessas voltas à sua
 * prova (pela data, e pela ficha do jogador ou pelo nome da prova) e grava o
 * link do organizador em `/data/provas-fora-federados.json`
 * (scripts/aggregator/util/provas-fora.js).
 */
import { useJson } from "../hooks/useJson";
import { categorizeTournamentLinks, type CategorizedLink } from "../pages/kids2/tournamentLinks";

/** O código de torneio que a FPG dá às voltas internacionais — não é um torneio. */
export const TCODE_INTL_FPG = "999999";

export const isTcodeIntlFpg = (tcode?: string | null): boolean => String(tcode ?? "").trim() === TCODE_INTL_FPG;

export interface ProvasForaFile {
  t: Record<string, [string, [string, string][]]>;
  v: Record<string, Record<string, string>>;
}

export interface ProvaFora {
  /** Id da prova no Kids 2. */
  tid: string;
  nome: string;
  /** Links do organizador, pela ordem do Kids 2 (USKids primeiro, rankings no fim). */
  links: CategorizedLink[];
}

const URL_PROVAS_FORA = "/data/provas-fora-federados.json";

/** A prova de uma volta 999999 deste federado, ou null (sem ligação segura → sem link). */
export function provaForaDaVolta(file: ProvasForaFile | null, fed: string | undefined, scoreId: string | undefined): ProvaFora | null {
  if (!file || !fed || !scoreId) return null;
  const tid = file.v[fed]?.[scoreId];
  const t = tid ? file.t[tid] : undefined;
  if (!tid || !t) return null;
  const links = categorizeTournamentLinks({ links: t[1].map(([label, url]) => ({ label, url })) });
  return links.length ? { tid, nome: t[0], links } : null;
}

/** Hook: carrega o índice só quando a volta é internacional (tcode 999999). */
export function useProvaFora(fed: string | undefined, scoreId: string | undefined, tcode: string | undefined): ProvaFora | null {
  const { data } = useJson<ProvasForaFile>(isTcodeIntlFpg(tcode) ? URL_PROVAS_FORA : null);
  return provaForaDaVolta(data, fed, scoreId);
}
