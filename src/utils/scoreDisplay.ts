/**
 * src/utils/scoreDisplay.ts
 *
 * Funções de apresentação de scores de golfe.
 * Centraliza helpers de formatação que estavam inline no JogadoresPage.
 */

import type { RoundData } from "../data/playerDataLoader";

/** Classe CSS para score vs par (eagle, birdie, par, bogey, double, ...) */
export function scClass(gross: number | null, par: number | null): string {
  if (gross == null || par == null || gross <= 0 || par <= 0) return "";
  const d = gross - par;
  if (gross === 1) return "holeinone";
  if (d <= -3) return "albatross";
  if (d === -2) return "eagle";
  if (d === -1) return "birdie";
  if (d === 0) return "par";
  if (d === 1) return "bogey";
  if (d === 2) return "double";
  if (d === 3) return "triple";
  if (d === 4) return "quad";
  if (d === 5) return "quint";
  return "worse";
}

/** Formata gross + delta vs par: { text: "78", delta: "+6", cls: "pos" } */
export function fmtGrossDelta(
  gross: number | null,
  par: number | null,
): { text: string; delta: string; cls: string } {
  if (gross == null) return { text: "", delta: "", cls: "" };
  const g = Number(gross);
  if (!isFinite(g)) return { text: String(gross), delta: "", cls: "" };
  const p = Number(par);
  if (!isFinite(p) || p <= 0) return { text: String(g), delta: "", cls: "" };
  const diff = g - p;
  const txt = diff === 0 ? "E" : (diff > 0 ? "+" : "") + diff;
  const cls = diff > 0 ? "pos" : diff < 0 ? "neg" : "";
  return { text: String(g), delta: txt, cls };
}

/** Formata Stableford (9 buracos → soma + 17, com asterisco) */
export function fmtStb(stb: number | null | undefined, holeCount: number | undefined): string {
  if (stb == null) return "";
  if (holeCount === 9) return `${stb + 17}*`;
  return String(stb);
}

/** Classe CSS para SD relativo ao HCP (excellent, good, poor) */
export function sdClassByHcp(sd: number, hcp: number | null | undefined): string {
  if (hcp == null || !isFinite(sd)) return "";
  const hi = Number(hcp);
  if (!isFinite(hi)) return "";
  if (sd <= hi) return "sd-excellent";
  if (sd <= hi + 3) return "sd-good";
  return "sd-poor";
}

/** Formata SD de uma ronda: { text: "12.3", cls: "sd-good" } */
export function fmtSdVal(r: RoundData): { text: string; cls: string } {
  if (r.sd == null) return { text: "", cls: "" };
  const cls = sdClassByHcp(Number(r.sd), r.hi);
  return { text: String(r.sd), cls };
}

/* ═══ Semantic Color Utilities ═══
 * Replace inline ternaries like:
 *   color: val <= 3 ? "#16a34a" : val <= 5 ? "#d97706" : "#dc2626"
 * with:
 *   color: sc3(val, 3, 5)   →  "var(--color-good)" | "var(--color-warn)" | "var(--color-danger)"
 */

const C = {
  good:     "var(--color-good)",     // #16a34a
  warn:     "var(--color-warn)",     // #d97706
  danger:   "var(--color-danger)",   // #dc2626
  info:     "var(--color-info)",     // #1e40af
  muted:    "var(--text-3)",         // #7a8a6e
  goodDark: "var(--color-good-dark)",
  dangerDark:"var(--color-danger-dark)",
  warnDark: "var(--color-warn-dark)",
  infoDark: "var(--color-navy)",
} as const;

/** 3-level semantic color: good / warn / danger
 *  asc:  val <= lo → good, val <= hi → warn, else danger  (lower is better: SD, avg vs par)
 *  desc: val >= hi → good, val >= lo → warn, else danger  (higher is better: bounce%, GIR) */
export function sc3(val: number, lo: number, hi: number, dir: "asc" | "desc" = "asc"): string {
  if (dir === "asc") return val <= lo ? C.good : val <= hi ? C.warn : C.danger;
  return val >= hi ? C.good : val >= lo ? C.warn : C.danger;
}

/** 2-level semantic color: good / danger
 *  asc:  val <= threshold → good, else danger  (lower is better)
 *  desc: val >= threshold → good, else danger  (higher is better) */
export function sc2(val: number, threshold: number, dir: "asc" | "desc" = "asc"): string {
  if (dir === "asc") return val <= threshold ? C.good : C.danger;
  return val >= threshold ? C.good : C.danger;
}

/** 2-level with warn instead of danger */
export function sc2w(val: number, threshold: number, dir: "asc" | "desc" = "asc"): string {
  if (dir === "asc") return val <= threshold ? C.good : C.warn;
  return val >= threshold ? C.good : C.warn;
}

/** 3-level with muted middle (good / neutral / danger) */
export function sc3m(val: number, lo: number, hi: number): string {
  return val < -lo ? C.good : val > hi ? C.danger : C.muted;
}

/** Diagnostic level class: returns "diag-good" | "diag-warn" | "diag-danger" */
export function diagLevel(val: number, lo: number, hi: number, dir: "asc" | "desc" = "asc"): string {
  if (dir === "asc") return val <= lo ? "diag-good" : val <= hi ? "diag-warn" : "diag-danger";
  return val >= hi ? "diag-good" : val >= lo ? "diag-warn" : "diag-danger";
}

/** Dark variants for conclusion text */
export function scDark(level: "good" | "danger" | "info"): string {
  return level === "good" ? C.goodDark : level === "danger" ? C.dangerDark : C.infoDark;
}

/** Export color constants for edge cases */
export { C as SC };
