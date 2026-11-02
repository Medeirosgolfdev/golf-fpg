/**
 * calendarData.ts — o próximo evento competitivo do calendário, para o
 * SimuladorPage pré-preencher o campo «Torneio» do overlay.
 *
 * Lê a lista ÚNICA de eventos (src/data/calendarEvents.ts, a mesma do
 * /calendario e dos .ics). Antes havia aqui uma cópia de 2026 «a manter
 * sincronizada» à mão.
 */
import { CAL_DEFS, EVENTS, type CalEvent } from "../data/calendarEvents";

/** Calendários de provas (sem aniversários, viagens, treinos, júnior…). */
const COMPETITIVOS = new Set(
  CAL_DEFS.filter((c) => c.group === "CGSS" || c.group === "DRIVE" || c.group === "FPG" || c.id === "drive_final" || c.id.startsWith("dest_"))
    .map((c) => c.id),
);

export function getNextCalendarEvent(today: Date = new Date()): CalEvent | null {
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const upcoming = EVENTS
    .filter((e) => COMPETITIVOS.has(e.calId) && e.date >= todayMidnight)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return upcoming[0] ?? null;
}
