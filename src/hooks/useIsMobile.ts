// src/hooks/useIsMobile.ts
import { useState, useEffect } from "react";

/** Breakpoint mobile canónico (px). Fonte única — antes estava o literal 768
 *  espalhado inline em várias páginas (CamposPage, JogadoresPage, CalendarioPage). */
export const MOBILE_BREAKPOINT = 768;

/**
 * Retorna true quando a largura do ecrã é ≤ breakpoint (default 768px).
 * Usa matchMedia para reagir a resize sem polling.
 */
export function useIsMobile(breakpoint = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= breakpoint
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);

  return isMobile;
}
