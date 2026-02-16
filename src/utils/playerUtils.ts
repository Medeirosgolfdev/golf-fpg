/**
 * src/utils/playerUtils.ts
 *
 * Funções utilitárias para dados de jogadores.
 * Centraliza helpers que estavam duplicados em JogadoresPage, TorneioPage, etc.
 */

import type { Player } from "../data/types";

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

/** Formata handicap: "12,3" ou "—" */
export function hcpDisplay(hcp: number | null | undefined): string {
  if (hcp == null) return "—";
  return hcp.toFixed(1).replace(".", ",");
}
