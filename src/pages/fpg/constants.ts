/**
 * constants.ts — Constantes e tipos da FPGPage extraídos para reuso.
 *
 * Reusável por outras páginas que precisem de:
 *  - Filtrar torneios por ano (PRE_2020_KEY, yearMatchesFilter)
 *  - Reconhecer torneios PJA pelo tcode (TOURN_PILLS)
 *  - Carregar pull-torneios*.json (DATA_BASE_URL, dataUrl, FileMeta, DriveData)
 */
import type { Tournament } from "../../data/fpgTypes";
import { PJA_TCODES } from "../../../ranking-pja/pja-rules.mjs";

/* ─────────────────────────────────────────────
   CONFIGURAÇÃO
   ───────────────────────────────────────────── */
const DATA_BASE_URL = "/data/pull-torneios";   // prefixo dos ficheiros
const DATA_EXT      = ".json";                  // extensão
const DATA_DIGITS   = 3;                        // 000, 001, 002 ...
export const DATA_MAX      = 50;                       // segurança: parar após N ficheiros

export type TournPill = "REGIONAL" | "NACIONAL" | "INTL" | "PJA" | "SSERRA";

/** Chave especial do filtro de ano que agrupa tudo o que é anterior a 2020.
 *  Evita ter 15+ botões individuais para anos com 1 entrada cada (Nacionais
 *  Jovens históricos 2005-2019). */
export const PRE_2020_KEY = "<2020";

/** Verifica se um ano (string "YYYY") corresponde ao filtro activo.
 *  - filter null → sempre true (sem filtro)
 *  - filter "<2020" → ano < 2020
 *  - filter "YYYY" → ano === filter */
export function yearMatchesFilter(year: string | undefined | null, filter: string | null): boolean {
  if (!filter) return true;
  const y = String(year ?? "");
  if (filter === PRE_2020_KEY) return !!y && y < "2020";
  return y === filter;
}

/**
 * Mapa tcode → pill de torneio.
 * Os tcodes PJA vêm da fonte única `ranking-pja/pja-rules.mjs` (partilhada
 * com a página standalone ranking-pja.vercel.app) — adicionar novos LÁ, com
 * o comentário de auditoria ao lado. Pills de outros tipos entram aqui.
 */
export const TOURN_PILLS: Record<string, TournPill> = Object.fromEntries(
  [...PJA_TCODES].map(tc => [tc, "PJA" as const]),
);


/** Links extra (regulamento, página oficial do evento, etc.) por torneio,
 *  chaveados por `${ccode}-${tcode}`. Renderizados no TournamentDetail a seguir
 *  aos links scraped (Draw/Scoring). PDFs ficam em `public/docs/`. */
export const TOURNAMENT_EXTRA_LINKS: Record<string, Array<{ label: string; url: string; icon?: string }>> = {
  "183-10142": [
    { label: "Regulamento PDF", url: "/docs/regulamento-torneio-jose-rosado-2025.pdf", icon: "📋" },
  ],
};


/** Constrói o URL de um índice: 0 → /data/pull-torneios000.json */
export function dataUrl(idx: number): string {
  return DATA_BASE_URL + String(idx).padStart(DATA_DIGITS, "0") + DATA_EXT;
}

export interface FileMeta {
  file: string; index: number;
  lastUpdated?: string; source?: string; count: number;
}

export interface DriveData {
  lastUpdated?: string; source?: string;
  totalTournaments: number; totalPlayers: number;
  tournaments: Tournament[];
}

