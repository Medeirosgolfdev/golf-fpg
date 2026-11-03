/**
 * src/ui/SidebarSectionTitle.tsx
 *
 * Header de grupo na sidebar. Encapsula sidebar-section-title e
 * sidebar-section-title-dark com suporte a cor customizada.
 *
 * Uso:
 *   <SidebarSectionTitle>🏌️ Torneios</SidebarSectionTitle>
 *   <SidebarSectionTitle dark>📅 Janeiro 2025</SidebarSectionTitle>
 *   <SidebarSectionTitle dark color="var(--color-info-dark)">🎯 USKids</SidebarSectionTitle>
 *   <SidebarSectionTitle sticky icon="⚔️" textColor="var(--color-good-dark)">Cruzou com Manuel (12)</SidebarSectionTitle>
 *   <SidebarSectionTitle sticky icon="🇪🇸" onClick={toggle}>Espanha …</SidebarSectionTitle>
 *   <SidebarSectionTitle dark color="var(--color-doral-dark)" textColor="var(--color-doral-text)" borderColor="var(--color-doral-mid)" letterSpacing="0.08em">
 *     🇺🇸 Doral Jr. Classic
 *   </SidebarSectionTitle>
 */
import React from "react";

interface SidebarSectionTitleProps {
  /** Usa sidebar-section-title-dark (fundo colorido) */
  dark?: boolean;
  /** Cor de fundo customizada */
  color?: string;
  /** Cor do texto customizada */
  textColor?: string;
  /** Cor da border-bottom customizada */
  borderColor?: string;
  /** Letter-spacing customizado */
  letterSpacing?: string;
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
  borderColor,
  letterSpacing,
  icon,
  sticky,
  onClick,
  className,
  children,
}: SidebarSectionTitleProps) {
  const base = dark ? "sidebar-section-title-dark" : "sidebar-section-title";
  const style: React.CSSProperties = {};
  if (color) style.background = color;
  if (textColor) style.color = textColor;
  if (borderColor) style.borderBottom = `1px solid ${borderColor}`;
  if (letterSpacing) style.letterSpacing = letterSpacing;

  return (
    <div className={`${base}${sticky ? " is-sticky" : ""}${onClick ? " is-clickable" : ""}${className ? " " + className : ""}`}
      style={Object.keys(style).length ? style : undefined} onClick={onClick}
      role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}>
      {icon && <span className="sidebar-section-icon">{icon}</span>}
      {children}
    </div>
  );
}
