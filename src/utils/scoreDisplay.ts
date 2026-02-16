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
