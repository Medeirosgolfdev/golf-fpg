/**
 * recentTournaments.ts — Torneios recentes reconstruídos das voltas WHS dos
 * jogadores que seguimos (public/data/recent-tournaments.json, gerado por
 * scripts/build-recent-tournaments.js, formato "fpg-pull") → entradas do
 * CircuitShell (fase 7 do plano, 23/10/2026).
 *
 * Cada torneio é uma entrada com uma divisão; o desenho (TournamentDetail) é
 * da página.
 */
import type { Tournament } from "./fpgTypes";
import type { CircuitEntry } from "../ui/circuit/types";
import { normalizePlayer } from "../utils/playerUtils";

export interface RecentTournament extends Tournament {
  scraped: boolean;
  nOurs: number;
  dateSort: number;
}
export interface RecentDoc {
  generated: string;
  since: string;
  counts: { playersScanned: number; tournaments: number; scraped: number; unscraped: number };
  tournaments: RecentTournament[];
}

export const RECENT_URL = "/data/recent-tournaments.json";

/** Chave do URL: o ccode pode vir vazio (Drive) → «_» como separador. */
export const recentKey = (t: { ccode?: string; tcode: string }) => `${t.ccode ?? ""}_${t.tcode}`;

/** Jogadores normalizados (os scores planos repõem-se a partir de roundScores[0]). */
export function normalizeRecent(doc: RecentDoc): RecentTournament[] {
  return doc.tournaments.map((t) => ({ ...t, players: (t.players || []).map(normalizePlayer) }));
}

/** Estado como «fonte» do shell: chip colorido na lista e filtro «Fonte». */
export const RECENT_SOURCES = {
  labels: { scraped: "✓ scrapeado", unscraped: "por scrapear" } as Record<string, string>,
  colors: { scraped: "var(--text-3)", unscraped: "var(--color-warn)" } as Record<string, string>,
};

/** Uma entrada por torneio; a divisão (o detalhe) junta-a quem desenha. */
export function recentEntry(t: RecentTournament): Omit<CircuitEntry, "divisions"> {
  const iso = /^\d{4}-\d{2}-\d{2}/.test(t.date || "") ? (t.date as string).slice(0, 10) : undefined;
  return {
    id: recentKey(t),
    year: iso ? parseInt(iso.slice(0, 4), 10) : null,
    name: t.name,
    tcode: t.tcode,
    course: t.campo || undefined,
    dateStart: iso,
    source: t.scraped ? "scraped" : "unscraped",
    playerCount: t.nOurs,
    roundsCount: t.rounds || 1,
  };
}
