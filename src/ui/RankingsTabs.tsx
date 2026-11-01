/**
 * RankingsTabs — EGR · WAGR · GJGL como sub-páginas de uma só entrada
 * «Rankings» na barra (pedido da Mariana, 13/10/2026). Cada página continua
 * com as suas rotas (/egr, /wagr, /global-junior); os separadores entram na
 * PRÓPRIA barra do CircuitShell de cada uma (CircuitToolbarSlotCtx) — uma só
 * barra, em vez de uma fila extra por cima.
 */
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CircuitToolbarSlotCtx } from "./circuit/toolbarSlot";
import { ToolbarSep } from "./Toolbar";
import TabRow from "./TabRow";

const TABS = [
  { key: "egr", label: "🇪🇺 EGR", path: "/egr", title: "European Golf Rankings" },
  { key: "wagr", label: "🌍 WAGR", path: "/wagr", title: "World Amateur Golf Ranking" },
  { key: "global-junior", label: "🏌️ GJGL", path: "/global-junior", title: "Global Junior Golf League" },
] as const;

export default function RankingsTabs({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const seg = pathname.split("/")[1] || "";
  const lead = (
    <>
      <TabRow ariaLabel="Rankings" active={"/" + seg} onChange={(path) => navigate(path)}
        tabs={TABS.map((t) => ({ key: t.path as string, label: t.label, title: t.title, href: t.path }))} />
      <ToolbarSep />
    </>
  );
  return (
    <CircuitToolbarSlotCtx.Provider value={{ lead, hideTitle: true }}>
      {children}
    </CircuitToolbarSlotCtx.Provider>
  );
}
