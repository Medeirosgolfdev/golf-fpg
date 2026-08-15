/**
 * src/pages/jogadores/hcpBins.ts
 *
 * Bins de HCP partilhados pelos painéis de estatísticas da JogadoresPage.
 * Antes da extracção (2026-08-15) havia DUAS cópias de HCP_BINS + binKey
 * (globalStats no corpo da página e FilteredStatsCard) e uma terceira tabela
 * de ranges no HcpBinDrillCard — esta é a fonte única.
 */

export const HCP_BINS = ["plus", "0-5", "5-10", "10-15", "15-20", "20-30", "30+"] as const;
export type HcpBin = (typeof HCP_BINS)[number];

/** Contagens M/F por bin, inicializadas a zero. */
export function emptyHcpBins(): Record<string, { m: number; f: number }> {
  return Object.fromEntries(HCP_BINS.map(k => [k, { m: 0, f: 0 }]));
}

export function hcpBinKey(h: number): HcpBin {
  if (h < 0) return "plus";
  if (h < 5) return "0-5";
  if (h < 10) return "5-10";
  if (h < 15) return "10-15";
  if (h < 20) return "15-20";
  if (h < 30) return "20-30";
  return "30+";
}

/** Range numérico + etiqueta longa de um bin (usado no drill-down). */
export function hcpBinRange(bin: string): { min: number; max: number; label: string } {
  if (bin === "plus") return { min: -Infinity, max: 0, label: "Scratch ou melhor (HCP ≤ 0)" };
  if (bin === "0-5")  return { min: 0, max: 5, label: "HCP 0 a 4.9" };
  if (bin === "5-10") return { min: 5, max: 10, label: "HCP 5 a 9.9" };
  if (bin === "10-15") return { min: 10, max: 15, label: "HCP 10 a 14.9" };
  if (bin === "15-20") return { min: 15, max: 20, label: "HCP 15 a 19.9" };
  if (bin === "20-30") return { min: 20, max: 30, label: "HCP 20 a 29.9" };
  return { min: 30, max: Infinity, label: "HCP 30+" };
}
