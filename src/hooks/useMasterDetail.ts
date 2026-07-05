/**
 * src/hooks/useMasterDetail.ts
 *
 * Hook partilhado para todas as páginas com layout master-detail.
 * Centraliza: estado, mobile detection, fecho automático ao seleccionar,
 * e scroll-to-top do detalhe ao seleccionar novo item.
 *
 * Uso:
 *   const md = useMasterDetail(defaultOpen);
 *
 *   // Na toolbar:
 *   <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Campos" />
 *
 *   // No div de detalhe — para scroll-to-top:
 *   <div ref={md.detailRef} className="course-detail">
 *
 *   // Ao seleccionar item:
 *   onClick={() => { setSelected(x); md.onSelect(); }}
 *
 *   // Na sidebar div:
 *   <div className={md.sidebarClass}>
 */

import { useState, useCallback, useRef } from "react";
import { useIsMobile } from "./useIsMobile";

export interface MasterDetailApi {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  toggle: () => void;
  /** Chamar ao seleccionar um item: fecha sidebar em mobile + scroll to top no detalhe */
  onSelect: () => void;
  isMobile: boolean;
  sidebarClass: string;
  /** Ref para o div de detalhe — permite scroll-to-top automático */
  detailRef: React.RefObject<HTMLDivElement | null>;
}

export function useMasterDetail(defaultOpen = true): MasterDetailApi {
  const [open, setOpen] = useState(defaultOpen);
  const isMobile = useIsMobile();
  const detailRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setOpen(v => !v), []);

  const onSelect = useCallback(() => {
    if (isMobile) setOpen(false);
    // Scroll to top do detalhe ao seleccionar novo item
    if (detailRef.current) {
      detailRef.current.scrollTop = 0;
    }
  }, [isMobile]);

  const sidebarClass = `sidebar${open ? "" : " sidebar-closed"}`;

  return { open, setOpen, toggle, onSelect, isMobile, sidebarClass, detailRef };
}
