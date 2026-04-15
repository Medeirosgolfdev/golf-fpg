/**
 * uskidsHelpers.ts — All USKids runtime helpers (consolidated)
 *
 * Merged from:
 *   - uskidsFormatters.ts (badge/date/status formatting)
 *   - uskidsRivalHelpers.ts (React context, rival tracking)
 *   - uskidsCanonical.ts (tournament name canonicalization, region detection)
 *
 * Data constants live in uskidsData.ts.
 */

import React from "react";
import type { AutoRivalPlayer } from "../data/KIDSdataLoader";
import { uskTournNames, uskFieldSizes } from "../data/KIDSdataLoader";
import { C } from "../utils/colors";
import { isoDate } from "../utils/format";
import { USA_KEYWORDS, EURO_KEYWORDS, NON_USKIDS_KEYWORDS } from "./uskidsData";

/* ═══════════════════════════════════════════════════════════════
   UI FORMATTERS (from uskidsFormatters)
   ═══════════════════════════════════════════════════════════════ */

/** Format tournament spot availability as badge */
export function badgeVagas(vagas: number, maximo: number) {
  if (maximo === 0) return null;
  if (vagas === 0)  return { bg: C.vagas.full.bg,         cor: C.vagas.full.fg,         label: "FULL" };
  if (vagas <= 1)   return { bg: C.vagas.almostFull.bg,   cor: C.vagas.almostFull.fg,   label: `+${vagas}` };
  if (vagas <= 3)   return { bg: C.vagas.limited.bg,      cor: C.vagas.limited.fg,      label: `+${vagas}` };
  if (vagas <= 6)   return { bg: C.vagas.available.bg,    cor: C.vagas.available.fg,     label: `+${vagas}` };
  return                   { bg: C.vagas.open.bg,         cor: C.vagas.open.fg,          label: `+${vagas}` };
}

/** Format ISO timestamp as localized Portuguese datetime string */
export function fmtTs(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-PT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
}

/** Calculate days until a date string. Returns 999 if date is invalid */
export function diasAte(s: string) {
  const iso = isoDate(s);
  if (!iso) return 999;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

/** Check if tournament is finished (after 21:00 local time on last day) */
export function isTerminado(dateFim: string | undefined, dateInicio?: string): boolean {
  const raw = dateFim || dateInicio;
  const iso = raw ? isoDate(raw) : null;
  if (!iso) return false;
  const endTime = new Date(iso + "T21:00:00").getTime();
  return Date.now() > endTime;
}

/** Check if player withdrew or didn't play */
export function isWD(score: number, strokes: number[]): boolean {
  if (score > 0) return false;
  return !strokes || strokes.every(s => !s || s === 0);
}

/* ═══════════════════════════════════════════════════════════════
   RIVAL HELPERS (from uskidsRivalHelpers)
   ═══════════════════════════════════════════════════════════════ */

/** React Context: autoRivals map shared across USKIDSPage */
export const ArMapCtx = React.createContext<Map<string, AutoRivalPlayer>>(new Map());

/** Tournament with Manuel-specific enrichment */
export type TorneioComManuel = {
  t: number;
  name: string;
  date_inicio: string;
  escalaoManuel?: string;
  source: "field" | "results";
};

/** Extract series base from tournament name (canonical form without year) */
export function seriesBase(name: string): string {
  return tornCanon(name).replace(/-\d+$/, "");
}

/** Find a player's result in a specific tournament series for a given year */
export function playerSeriesResult(
  ar: AutoRivalPlayer,
  sBase: string,
  year: number,
): { p: number; tp: number | null; fieldSize: number } | null {
  for (const [tid, res] of Object.entries(ar.r)) {
    const uskM = tid.match(/^(usk\d+)/);
    if (!uskM) continue;
    const meta = uskTournNames.get(uskM[1]);
    if (!meta?.name || !meta?.dateExact) continue;
    const metaYear = parseInt(meta.dateExact.slice(0, 4));
    if (metaYear !== year) continue;
    const canon = tornCanon(meta.name).replace(/-\d+$/, "");
    if (canon !== sBase) continue;
    const fs = uskFieldSizes.get(tid) ?? 0;
    return { p: res.p ?? 0, tp: res.tp ?? null, fieldSize: fs };
  }
  return null;
}

/** Format rival position for display in series results */
export function fmtPosRivais(p: number, fieldSize: number): string {
  if (p <= 0) return "—";
  if (p === 1) return "🥇";
  if (p === 2) return "🥈";
  if (p === 3) return "🥉";
  return fieldSize > 0 ? `${p}/${fieldSize}` : `${p}º`;
}

/* ═══════════════════════════════════════════════════════════════
   CANONICAL NAMES & CLASSIFICATION (from uskidsCanonical)
   ═══════════════════════════════════════════════════════════════ */

/** Shorten tournament year: "Tournament 2025" → "Tournament '25" */
export function shortTornName(s: string): string {
  return s.replace(/\s(\d{4})$/, (_, y) => ` '${y.slice(2)}`);
}

/** Canonical tournament name for matching: "Venice Open 2025" → "venice-25" */
export function tornCanon(s: string): string {
  const low = s.toLowerCase().replace(/['']/g, "").trim();
  const y2 = low.match(/\b20(\d{2})\b/)?.[1] || low.match(/(?:^|\s)(\d{2})$/)?.[1] || "";
  const pc = /parent.child/i.test(low) ? "pc" : "";

  if (/venice/i.test(low)) return `venice${pc}-${y2}`;
  if (/rome|roma/i.test(low)) return `rome${pc}-${y2}`;
  if (/marco\s*simone/i.test(low)) return `marco${pc}-${y2}`;
  if (/wjgc|bjgt|world.*junior.*golf/i.test(low)) return `wjgc${pc}-${y2}`;
  if (/eu\s*open|european\s*open|eowagr/i.test(low)) return `euopen${pc}-${y2}`;
  if (/world\s*champ/i.test(low)) return `wc${pc}-${y2}`;
  if (/european\s*champ/i.test(low)) return `ec${pc}-${y2}`;
  if (/red.*white.*blue|rwb/i.test(low)) return `rwb${pc}-${y2}`;
  if (/doral/i.test(low)) return `doral${pc}-${y2}`;
  if (/great\s*golf/i.test(low)) return `gg${pc}-${y2}`;
  if (/quinta.*lago|qdl/i.test(low)) return `qdl${pc}-${y2}`;
  if (/desert/i.test(low)) return `desert${pc}-${y2}`;
  if (/sandestin/i.test(low)) return `sandestin${pc}-${y2}`;
  if (/mississippi|msstate/i.test(low)) return `msstate${pc}-${y2}`;
  if (/south\s*carolina|scstate/i.test(low)) return `scstate${pc}-${y2}`;
  if (/el\s*prat/i.test(low)) return `elprat${pc}-${y2}`;
  return low.replace(/[^a-z0-9]/g, "") + (y2 ? `-${y2}` : "") + pc;
}

/** Check if a tournament name matches any canonical name in a set */
export function hasCanon(set: Set<string>, name: string, short?: string): boolean {
  const cn = tornCanon(name);
  const cs = short ? tornCanon(short) : "";
  if (set.has(cn) || (cs && set.has(cs))) return true;
  const series = cn.split("-")[0];
  if (cn.endsWith("-") && series) {
    for (const k of set) {
      if (k.startsWith(series + "-") && k !== cn) return true;
    }
  }
  return false;
}

/** Detect tournament region: USA or EURO based on keywords */
export function torneioRegiao(name: string): "USA" | "EURO" | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (EURO_KEYWORDS.some((k) => n.includes(k))) return "EURO";
  if (USA_KEYWORDS.some((k) => n.includes(k))) return "USA";
  return null;
}

/** Detect if tournament is from USKids circuit (not in non-USKids keywords) */
export function isUSKidsTorneio(name: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return !NON_USKIDS_KEYWORDS.some((k) => n.includes(k));
}
