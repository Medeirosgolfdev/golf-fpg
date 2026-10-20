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


interface Props {
  /** Conteúdo à esquerda do título (ex: SidebarToggle na página principal). */
  leading?: ReactNode;
  /** Conteúdo extra (dados/filtros) — só visível onde for passado. */
  children?: ReactNode;
}

const TABS: { to: string; label: string; match: (p: string) => boolean }[] = [
  { to: "/kids2", label: "🌍 Jogadores", match: (p) =>
      p === "/kids2" || (/^\/kids2\/[^/]+$/.test(p) && p !== "/kids2/next-t" && p !== "/kids2/inscricoes" && p !== "/kids2/listas" && !p.startsWith("/kids2/ranking")) },
  { to: "/kids2/next-t", label: "📅 Próximos torneios", match: (p) => p === "/kids2/next-t" },
  { to: "/kids2/inscricoes", label: "📋 Inscrições", match: (p) => p === "/kids2/inscricoes" },
  { to: "/kids2/listas", label: "📝 Listas", match: (p) => p === "/kids2/listas" },
  { to: "/kids2/ranking", label: "🏆 Ranking", match: (p) => p.startsWith("/kids2/ranking") },
];

/** Título e vistas do Kids 2 — também na barra do CircuitShell dos Próximos
 *  torneios (lead do CircuitToolbarSlotCtx). */
export function Kids2Nav() {
  const { pathname } = useLocation();
  return (
    <>
      <Link to="/kids2" className="toolbar-title" style={{ textDecoration: "none" }}>🌍 Kids 2</Link>
      <ToolbarSep />
      {/* Vistas: o interruptor segmentado do resto do site (14/10/2026). */}
      <div className="segmented-toggle" role="tablist" aria-label="Vista" style={{ flexShrink: 0 }}>
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link key={t.to} to={t.to} role="tab" aria-selected={active}
              className={"seg-btn" + (active ? " active" : "")} style={{ textDecoration: "none" }}>
              <span className="seg-label">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

export default function Kids2SubNav({ leading, children }: Props) {
  return (
    <Toolbar>
      {leading}
      <Kids2Nav />
      {children && (
        <>
          <ToolbarSep />
          {children}
        </>
      )}
    </Toolbar>
  );
}
