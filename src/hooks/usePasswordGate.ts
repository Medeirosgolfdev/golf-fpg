/**
 * usePasswordGate — Hook partilhado para o padrão de password gate
 *
 * Usado em 6 páginas: BJGTPage, DORALPage, KIDSPage, DrivePage, CalendarioPage, BJGTAnalysisPage
 */
import { useState } from "react";
import { isCalUnlocked } from "../utils/authConstants";

export function usePasswordGate() {
  const [unlocked, setUnlocked] = useState(() => {
    try { return isCalUnlocked(); } catch { return false; }
  });
  return { unlocked, unlock: () => setUnlocked(true) };
}
