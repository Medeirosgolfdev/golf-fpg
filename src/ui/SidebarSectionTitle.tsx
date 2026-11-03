/**
 * src/ui/SidebarSectionTitle.tsx
 *
 * Header de grupo na sidebar. Encapsula sidebar-section-title e
 * sidebar-section-title-dark; as cores que vêm da configuração (circuito)
 * passam pelo <Tint> (fundo `color`, texto `textColor`).
 *
 * Uso:
 *   <SidebarSectionTitle>🏌️ Torneios</SidebarSectionTitle>
 *   <SidebarSectionTitle dark>📅 Janeiro 2025</SidebarSectionTitle>
 *   <SidebarSectionTitle dark color="var(--color-info-dark)">🎯 USKids</SidebarSectionTitle>
 *   <SidebarSectionTitle sticky icon="⚔️" className="u-c-color-good-dark">Cruzou com Manuel (12)</SidebarSectionTitle>
 *   <SidebarSectionTitle sticky icon="🇪🇸" onClick={toggle}>Espanha …</SidebarSectionTitle>
 *   <SidebarSectionTitle dark color={config.color} textColor={config.textColor} className="u-ls-0_08em">
 *     🇺🇸 Doral Jr. Classic
 *   </SidebarSectionTitle>
 */
import React from "react";
import { Tint } from "./DataStyle";

interface SidebarSectionTitleProps {
  /** Usa sidebar-section-title-dark (fundo colorido) */
  dark?: boolean;
  /** Cor de fundo (vem dos dados/configuração) */
  color?: string;
  /** Cor do texto (vem dos dados/configuração) */
  textColor?: string;
  /** Emoji/bandeira à esquerda. */
  icon?: React.ReactNode;
  /** Fica preso ao topo da lista ao fazer scroll (fundo cinzento). */
  sticky?: boolean;
  /** Cabeçalho clicável (abrir/fechar o grupo). */
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}

export default function SidebarSectionTitle({
  dark,
  color,
  textColor,
  icon,
  sticky,
  onClick,
  className,
  children,
}: SidebarSectionTitleProps) {
  const base = dark ? "sidebar-section-title-dark" : "sidebar-section-title";

  return (
    <Tint as="div" className={`${base}${sticky ? " is-sticky" : ""}${onClick ? " is-clickable" : ""}${className ? " " + className : ""}`}
      bg={color} fg={textColor} onClick={onClick}
      role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}>
      {icon && <span className="sidebar-section-icon">{icon}</span>}
      {children}
    </Tint>
  );
}
