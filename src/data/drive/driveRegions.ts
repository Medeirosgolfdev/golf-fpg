/**
 * Regiões do Drive — nomes e cores num só sítio (antes 4 cópias: DrivePage,
 * driveRanking, driveCalendar e driveCircuitData).
 */
export const DRIVE_REGION_LABEL: Record<string, string> = {
  norte: "Norte", tejo: "Tejo", sul: "Sul", madeira: "Madeira", acores: "Açores", nacional: "Nacional",
};

/** As 5 regiões dos circuitos regionais, pela ordem das pills. */
export const DRIVE_REGIONS = (["norte", "tejo", "sul", "madeira", "acores"] as const)
  .map((id) => ({ id, label: DRIVE_REGION_LABEL[id], emoji: "📍" }));

/** Bolinha de cor da região (calendário da época). */
export const DRIVE_REGION_EMOJI: Record<string, string> = { norte: "🔵", tejo: "🟡", sul: "🟢", madeira: "🟣", acores: "🔴", nacional: "⚪" };

export const regionLabel = (r: string): string => DRIVE_REGION_LABEL[r.toLowerCase()] || r;
