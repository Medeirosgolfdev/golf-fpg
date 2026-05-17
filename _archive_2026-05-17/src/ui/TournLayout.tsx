/**
 * TournLayout — wrapper consistente para páginas de torneio (FPG, USKids, BJGT,
 * DORAL, Nacionais).
 *
 * Encapsula apenas o layout estrutural (Toolbar + master-detail + sidebar
 * com SidebarToggle). Não envolve em <DataSourcesProvider> porque esse
 * exige `tournaments` para construir o índice path → BadgeTournament — o
 * caller continua a controlar essa wrapping.
 *
 * Uso:
 *   <TournLayout
 *     md={md}
 *     toolbar={<ToolbarTitle>...</ToolbarTitle>}
 *     sidebar={<SidebarItems/>}
 *     detail={<MainContent/>}
 *   />
 */
import React from "react";
import { Toolbar } from "./Toolbar";
import SidebarToggle from "./SidebarToggle";
import type { useMasterDetail } from "../hooks/useMasterDetail";

type MasterDetailHandle = ReturnType<typeof useMasterDetail>;

interface TournLayoutProps {
  /** Resultado de useMasterDetail() — necessário para o sidebar toggle. */
  md: MasterDetailHandle;
  /** Conteúdo do Toolbar (título, chips, tabs, botões). */
  toolbar: React.ReactNode;
  /** Sidebar (lista de torneios/jogadores). */
  sidebar: React.ReactNode;
  /** Detalhe principal (tabs, leaderboard, scorecards). */
  detail: React.ReactNode;
  /** Label do botão "back" no SidebarToggle quando aberto (default: "Lista"). */
  backLabel?: string;
  /** Inclui SidebarToggle dentro da Toolbar (default: true). */
  includeSidebarToggle?: boolean;
}

export default function TournLayout({
  md, toolbar, sidebar, detail, backLabel = "Lista", includeSidebarToggle = true,
}: TournLayoutProps) {
  return (
    <div className="tourn-layout">
      <Toolbar>
        {includeSidebarToggle && (
          <SidebarToggle open={md.open} onToggle={md.toggle} backLabel={backLabel} />
        )}
        {toolbar}
      </Toolbar>
      <div className="master-detail">
        <div className={`sidebar${md.open ? "" : " sidebar-closed"}`}>
          {sidebar}
        </div>
        <div className="course-detail" ref={md.detailRef}>
          {detail}
        </div>
      </div>
    </div>
  );
}
