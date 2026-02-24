/**
 * src/utils/authConstants.ts
 *
 * Constantes partilhadas para o sistema de password gate.
 * Usadas por CalendarioPage, BJGTAnalysisPage, TorneioPage e App.tsx.
 */

export const CAL_PASSWORD = "machico";
export const CAL_STORAGE_KEY = "cal_unlocked";

/** Evento custom disparado quando o calendário é desbloqueado.
 *  App.tsx escuta este evento para mostrar os tabs BJGT e GG26. */
export const CAL_UNLOCK_EVENT = "cal-unlocked";

/** Verifica se o calendário está desbloqueado */
export function isCalUnlocked(): boolean {
  try { return localStorage.getItem(CAL_STORAGE_KEY) === "1"; } catch { return false; }
}

/** Desbloqueia e notifica listeners */
export function unlockCalendar(): void {
  try { localStorage.setItem(CAL_STORAGE_KEY, "1"); } catch {}
  window.dispatchEvent(new Event(CAL_UNLOCK_EVENT));
}
