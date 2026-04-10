/**
 * src/utils/playerUtils.ts
 *
 * Funções utilitárias para dados de jogadores.
 * Centraliza helpers que estavam duplicados em JogadoresPage, TorneioPage, etc.
 */

import type { Player } from "../data/types";
import type { NormalizedTournament } from "./tournamentTypes";

/** Nome curto do clube (aceita string ou objecto {short, long}) */
export function clubShort(p: Player): string {
  if (typeof p.club === "object" && p.club) return p.club.short || p.club.long || "";
  return String(p.club || "");
}

/** Nome completo do clube */
export function clubLong(p: Player): string {
  if (typeof p.club === "object" && p.club) return p.club.long || p.club.short || "";
  return String(p.club || "");
}

/** Formata handicap para display PT: "12,3" ou "—"
 *  Nota: para contexto de torneio com sinal (+/−), usar fmtHcp de format.ts */
export function hcpDisplay(hcp: number | null | undefined): string {
  if (hcp == null) return "—";
  return hcp.toFixed(1).replace(".", ",");
}

/**
 * Resolve feds em falta num NormalizedTournament por match de nome contra players DB.
 * Muta o norm directamente (draws, results, allDraw, birthYears, pjaFeds).
 * Seguro para chamar múltiplas vezes — usa WeakSet para não repetir.
 * Nomes duplicados no players DB são ignorados por segurança.
 */
const _resolvedNorms = new WeakSet<NormalizedTournament>();

export function resolveFedsFromPlayers(
  norm: NormalizedTournament,
  players: Record<string, Player>,
): number {
  if (_resolvedNorms.has(norm)) return 0;

  // Build name → fed map; skip ambiguous names
  const nameToFed = new Map<string, string>();
  const nameCounts = new Map<string, number>();
  for (const [fed, p] of Object.entries(players)) {
    const n = p.name?.toLowerCase().trim();
    if (!n) continue;
    nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
    nameToFed.set(n, fed);
  }
  for (const [n, count] of nameCounts) {
    if (count > 1) nameToFed.delete(n);
  }

  const resolveName = (name: string): string | null =>
    nameToFed.get(name.toLowerCase().trim()) ?? null;

  const enrichFed = (fed: string) => {
    const p = players[fed];
    if (p?.dob) {
      const y = parseInt(p.dob.substring(0, 4));
      if (!isNaN(y)) norm.birthYears[fed] = y;
    }
    if (p?.tags?.includes("PJA")) norm.pjaFeds.add(fed);
  };

  let resolved = 0;

  // allDraw
  for (const d of norm.allDraw) {
    if (d.fed) continue;
    const fed = resolveName(d.name);
    if (fed) { d.fed = fed; enrichFed(fed); resolved++; }
  }

  // draws per category/day
  for (const catDraws of Object.values(norm.draws)) {
    for (const dayDraw of Object.values(catDraws)) {
      for (const d of dayDraw) {
        if (d.fed) continue;
        const fed = resolveName(d.name);
        if (fed) d.fed = fed;
      }
    }
  }

  // results per category/day
  for (const catResults of Object.values(norm.results)) {
    for (const dayResults of Object.values(catResults)) {
      for (const r of dayResults) {
        if (r.fed) continue;
        const fed = resolveName(r.name);
        if (fed) r.fed = fed;
      }
    }
  }

  _resolvedNorms.add(norm);
  if (resolved > 0) console.log(`[resolveFedsFromPlayers] Resolved ${resolved} feds by name`);
  return resolved;
}

/**
 * Resolve feds em falta em torneios genéricos (DrivePage format).
 * Muta os players directamente, preenchendo `fed` onde possível.
 */
export function resolveFedsInTournaments(
  tournaments: { players: { name: string; fed?: string; fedCode?: string }[] }[],
  playersDB: Record<string, { name?: string }>,
): number {
  const nameToFed = new Map<string, string>();
  const nameCounts = new Map<string, number>();
  for (const [fed, p] of Object.entries(playersDB)) {
    const n = p.name?.toLowerCase().trim();
    if (!n) continue;
    nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
    nameToFed.set(n, fed);
  }
  for (const [n, count] of nameCounts) {
    if (count > 1) nameToFed.delete(n);
  }

  let resolved = 0;
  for (const t of tournaments) {
    for (const p of t.players) {
      if (p.fed || p.fedCode) continue;
      const fed = nameToFed.get(p.name.toLowerCase().trim());
      if (fed) { p.fed = fed; resolved++; }
    }
  }
  if (resolved > 0) console.log(`[resolveFedsInTournaments] Resolved ${resolved} feds by name`);
  return resolved;
}

/* ── Escalão lookup ── */

export type EscLookup = Map<string, string>;

/** Constrói mapa fed → escalão a partir de playersDB e opcionalmente de torneios */
export function buildEscLookup(
  playersDB: Record<string, { escalao?: string }>,
  allTournaments?: { escalao?: string; players: { fed?: string; fedCode?: string }[] }[]
): EscLookup {
  const m: EscLookup = new Map();
  for (const [fed, info] of Object.entries(playersDB)) {
    if (info.escalao) {
      m.set(fed, info.escalao.startsWith("Sub") ? info.escalao.replace("-", " ") : info.escalao);
    }
  }
  if (allTournaments) {
    for (const t of allTournaments) {
      if (t.escalao) {
        for (const p of t.players) {
          const fed = p.fed || p.fedCode;
          if (fed && !m.has(fed)) m.set(fed, t.escalao);
        }
      }
    }
  }
  return m;
}

/** Resolve escalão de um jogador via lookup */
export function resolveEscFromLookup(
  p: { fed?: string; fedCode?: string },
  escLookup: EscLookup
): string {
  const fed = (p as any).fed || (p as any).fedCode;
  if (fed && escLookup.has(fed)) return escLookup.get(fed)!;
  return "";
}

/**
 * Normaliza escalão para chave CSS: "Sénior" → "senior", "Sub-14" → "sub14".
 * Usado para gerar classes como "p p-sm p-sub12".
 */
export function escCls(esc: string): string {
  return esc.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Escalão → className completo para pill badge: "Sub 12" → "p p-sm p-sub12".
 * Retorna string vazia se escalão estiver em falta.
 */
export function escPillCls(esc: string | undefined | null): string {
  if (!esc) return "";
  return "p p-sm p-" + escCls(esc);
}

/* ── Player normalization ── */

/**
 * Converte formato "SOBRENOME,Nome" → "Nome Sobrenome" com capitalização apropriada.
 * Exemplos:
 *   "SOBRENOME,Nome" → "Nome Sobrenome"
 *   "IVO DE CARVALHO, José" → "José Ivo de Carvalho"
 * Partículas em português ("de", "da", "do", etc.) ficam minúsculas quando não são primeira palavra.
 */
export function formatPlayerName(raw: string): string {
  if (!raw) return raw;
  const commaIdx = raw.indexOf(",");
  if (commaIdx > 0) {
    const last  = raw.substring(0, commaIdx).trim();
    const first = raw.substring(commaIdx + 1).trim();
    const cap = (s: string) => s.split(" ").map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && ["de","da","do","das","dos","e","van","von","de la"].includes(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }).join(" ");
    return `${cap(first)} ${cap(last)}`.trim();
  }
  return raw;
}

/**
 * Normaliza um jogador de formato scraper (flat ou multi-round) para formato interno.
 * Preenche campos vazios com valores da primeira ronda se disponível.
 * Também normaliza o campo `fed` (prioridade: fed → fedCode) e o nome (via formatPlayerName).
 *
 * @param p Jogador em formato scraper (com campos opcionais flat e/ou roundScores)
 * @returns Jogador normalizado
 */
export function normalizePlayer(p: any): any {
  const r1 = p.roundScores?.[0];
  return {
    ...p,
    name: formatPlayerName(p.name),
    fed: p.fed || p.fedCode || undefined,
    scores: p.scores || r1?.scores,
    par: p.par || r1?.pars,
    si: p.si || r1?.si,
    meters: p.meters || r1?.meters,
    courseRating: p.courseRating ?? r1?.courseRating,
    slope: p.slope ?? r1?.slope,
    teeName: p.teeName || r1?.teeName,
  };
}
