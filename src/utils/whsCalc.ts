/**
 * src/utils/whsCalc.ts
 *
 * Fórmulas genéricas do World Handicap System (WHS).
 * Centraliza cálculos que estavam duplicados em SimuladorPage e TorneioPage.
 *
 * Nota: TorneioPage tem um wrapper `calcSD(gross, teeColor, sex)` que combina
 * lookup de tee ratings + esta fórmula. Esse wrapper é específico do torneio
 * e continua lá — usa esta função internamente.
 */

/** Score Differential = (113 / Slope) × (Score − CR − PCC) */
export function calcSD(score: number, cr: number, slope: number, pcc = 0): number {
  return (113 / slope) * (score - cr - pcc);
}

/** Inverso: Score = SD × (Slope / 113) + CR + PCC */
export function calcScore(sd: number, cr: number, slope: number, pcc = 0): number {
  return sd * (slope / 113) + cr + pcc;
}

/** Playing Handicap = HI × (Slope / 113) + (CR − Par) */
export function calcPlayingHcp(hi: number, slope: number, cr: number, par: number): number {
  return hi * (slope / 113) + (cr - par);
}
