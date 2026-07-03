/**
 * kids2/tournamentLinks.ts
 *
 * Categoriza `tournament.links` em fontes conhecidas (Signupanytime/USKids,
 * FPG, GolfGenius/Doral, RFEG, FFG, EOWAGR/BlueGolf, WJGC/BlueGolf) com
 * cor/label apropriados. Quando uma fonte é conhecida mas o aggregator não
 * populou link explícito, tenta construir URL via padrão estável.
 *
 * Output usado em HistoryByTournament e ResultsTimeline (botões coloridos por
 * fonte em vez do ↗ genérico).
 */

import type { Tournament } from "./data";

export interface CategorizedLink {
  key: "sat" | "fpg" | "doral" | "rfeg" | "ffgolf" | "wjgc" | "eowagr" | "fcg" | "england" | "gjgl" | "other";
  label: string;
  url: string;
  /** CSS var-name para cor (já existe em tokens.css). */
  colorVar: string;
}

const DOMAIN_MAP: Array<{ test: RegExp; key: CategorizedLink["key"]; label: string; colorVar: string }> = [
  // Interno: página France com deep-link ?t={trnId} (portal FFG é POST-only)
  { test: /^\/ffg(\?|$)/,           key: "ffgolf",  label: "France",  colorVar: "--source-ffgolf" },
  { test: /signupanytime\.com/i,    key: "sat",     label: "SAT",     colorVar: "--source-uskids" },
  { test: /tournaments\.uskidsgolf\.com/i, key: "sat", label: "USKids", colorVar: "--source-uskids" },
  { test: /scoring\.fpg\.pt|scoring\.datagolf\.pt|my\.fpg\.pt/i, key: "fpg", label: "FPG", colorVar: "--source-fpg" },
  { test: /eg-[a-z0-9-]*\.golfgenius\.com/i, key: "england", label: "England Golf", colorVar: "--source-england" },
  { test: /golfgenius\.com/i,       key: "doral",   label: "GolfGenius", colorVar: "--source-doral" },
  { test: /golfdirecto\.com/i,      key: "fcg",     label: "GolfDirecto", colorVar: "--source-fcg" },
  { test: /globaljuniorgolflive\.com/i, key: "gjgl", label: "GJGL",    colorVar: "--source-gjgl" },
  { test: /rfegolf\.livegolfscoring\.es|livegolfscoring\.com/i, key: "rfeg", label: "LiveGolfScoring", colorVar: "--source-rfeg" },
  { test: /nextcaddy\.com/i,        key: "rfeg",    label: "NextCaddy", colorVar: "--source-rfeg" },
  { test: /rfegolf\.es|federacionandaluzadegolf|laliga/i, key: "rfeg", label: "RFEG",  colorVar: "--source-rfeg" },
  { test: /ffgolf\.org|pages\.ffgolf/i, key: "ffgolf", label: "FFG",     colorVar: "--source-ffgolf" },
  { test: /brjgt\.bluegolf\.com|bluegolf\.com/i, key: "wjgc", label: "BlueGolf", colorVar: "--source-wjgc" },
];

function categorizeUrl(url: string, label: string): CategorizedLink {
  for (const m of DOMAIN_MAP) {
    if (m.test.test(url)) return { key: m.key, label: m.label, url, colorVar: m.colorVar };
  }
  return { key: "other", label: label || "↗", url, colorVar: "--text-3" };
}

/** Devolve botões por torneio. Faz dedup por (key, url) para evitar duplicados. */
export function categorizeTournamentLinks(tournament: Tournament): CategorizedLink[] {
  const seen = new Set<string>();
  const out: CategorizedLink[] = [];
  for (const l of tournament.links || []) {
    if (!l?.url) continue;
    const cat = categorizeUrl(l.url, l.label || "");
    const k = `${cat.key}|${cat.url}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(cat);
  }
  // Ordem fixa preferida (USKids primeiro, FPG ao meio, outros depois)
  const order: Record<CategorizedLink["key"], number> = {
    sat: 0, fpg: 1, ffgolf: 2, rfeg: 3, fcg: 4, doral: 5, wjgc: 6, eowagr: 7, england: 8, gjgl: 9, other: 99,
  };
  out.sort((a, b) => order[a.key] - order[b.key]);
  return out;
}
