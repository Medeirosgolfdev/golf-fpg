/**
 * MasterDetail — o layout lista + detalhe de todas as páginas com sidebar
 * (FPG, Drive, USKids, kids2, Campos, Jogadores, CircuitShell…). O estado vem
 * do useMasterDetail: a sidebar fecha em mobile ao seleccionar e o detalhe
 * volta ao topo a cada selecção.
 */
import type React from "react";
import type { MasterDetailApi } from "../hooks/useMasterDetail";

export default function MasterDetail({ md, sidebar, children, sidebarRef, detailClassName }: {
  md: MasterDetailApi;
  sidebar: React.ReactNode;
  children: React.ReactNode;
  sidebarRef?: React.Ref<HTMLDivElement>;
  /** Classe extra do painel de detalhe (ex.: «jog-detail»). */
  detailClassName?: string;
}) {
  return (
    <div className="master-detail">
      <div className={md.sidebarClass} ref={sidebarRef}>{sidebar}</div>
      <div className={`course-detail${detailClassName ? ` ${detailClassName}` : ""}`} ref={md.detailRef}>{children}</div>
    </div>
  );
}
