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
  className?: string;
  children: React.ReactNode;
}

export default function SidebarSectionTitle({
  dark,
  color,
  textColor,
  borderColor,
  letterSpacing,
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
    <div className={`${base}${className ? " " + className : ""}`} style={Object.keys(style).length ? style : undefined}>
      {children}
    </div>
  );
}
