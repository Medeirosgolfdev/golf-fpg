/**
 * src/hooks/useMasterDetail.ts
 *
 * Hook partilhado para todas as páginas com layout master-detail.
 * Centraliza estado, mobile detection e fecho automático ao seleccionar.
 *
 * Uso:
 *   const md = useMasterDetail();
 *
 *   // Na toolbar:
 *   <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Torneios" />
 *
 *   // Ao seleccionar item:
 *   onClick={() => { setSelected(x); md.onSelect(); }}
 *
 *   // Na sidebar div:
 *   <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
 */

import { useState, useCallback } from "react";
import { useIsMobile } from "./useIsMobile";

export interface MasterDetailApi {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  toggle: () => void;
  /** Chamar ao seleccionar um item — fecha automaticamente em mobile */
  onSelect: () => void;
  isMobile: boolean;
  /** Classe CSS para a div da sidebar */
  sidebarClass: string;
}

export function useMasterDetail(defaultOpen = true): MasterDetailApi {
  const [open, setOpen] = useState(defaultOpen);
  const isMobile = useIsMobile();

  const toggle = useCallback(() => setOpen(v => !v), []);

  const onSelect = useCallback(() => {
    if (isMobile) setOpen(false);
  }, [isMobile]);

  const sidebarClass = `sidebar${open ? "" : " sidebar-closed"}`;

  return { open, setOpen, toggle, onSelect, isMobile, sidebarClass };
}
