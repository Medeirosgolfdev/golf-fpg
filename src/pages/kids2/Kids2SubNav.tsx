/**
 * kids2/Kids2SubNav.tsx
 *
 * Barra de navegação ÚNICA de todo o KIDS2 — usada tanto na página principal
 * (Jogadores) como nas sub-páginas (Próximos torneios, Inscrições, Scout).
 * Cola-se à NavBar do topo (classe .toolbar) e mantém sempre a mesma ordem:
 *   [leading] · 🌍 Kids 2 · Jogadores · Próximos torneios · Inscrições · [contexto] · [children]
 *
 * A parte de dados/filtros (contagem, FONTE, vs Manuel, …) é passada via
 * `children` e só aparece onde for fornecida (página principal). Nas
 * sub-páginas fica oculta automaticamente.
 */

import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Toolbar, ToolbarSep } from "../../ui/Toolbar";

// Torneio de referência para o botão Scout (mesmo default usado em
// FieldRivaisDashboard/NextTournaments). Actualizar por temporada.
const DEFAULT_SCOUT_TID = "usk21131"; // European Championship 2026

interface Props {
  /** Conteúdo à esquerda do título (ex: SidebarToggle na página principal). */
  leading?: ReactNode;
  /** Conteúdo extra (dados/filtros) — só visível onde for passado. */
  children?: ReactNode;
}

const TABS: { to: string; label: string; match: (p: string) => boolean }[] = [
  { to: "/kids2", label: "🌍 Jogadores", match: (p) =>
      p === "/kids2" || (/^\/kids2\/[^/]+$/.test(p) && p !== "/kids2/next-t" && p !== "/kids2/inscricoes") },
  { to: "/kids2/next-t", label: "📅 Próximos torneios", match: (p) => p === "/kids2/next-t" },
  { to: "/kids2/inscricoes", label: "📋 Inscrições", match: (p) => p === "/kids2/inscricoes" },
  { to: `/kids2/scout/${DEFAULT_SCOUT_TID}`, label: "🔭 Scout", match: (p) => p.startsWith("/kids2/scout") },
];

export default function Kids2SubNav({ leading, children }: Props) {
  const { pathname } = useLocation();
  return (
    <Toolbar>
      {leading}
      <Link to="/kids2" className="toolbar-title" style={{ textDecoration: "none" }}>🌍 Kids 2</Link>
      <ToolbarSep />
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.to}
            to={t.to}
            className={"tourn-tab tourn-tab-sm" + (active ? " active" : " tourn-tab-muted")}
            style={{ flexShrink: 0, textDecoration: "none" }}
          >
            {t.label}
          </Link>
        );
      })}
      {children && (
        <>
          <ToolbarSep />
          {children}
        </>
      )}
    </Toolbar>
  );
}
