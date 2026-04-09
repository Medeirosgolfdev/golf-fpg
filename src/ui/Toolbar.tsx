/**
 * src/ui/Toolbar.tsx
 *
 * Toolbar global — wrapper + sub-componentes.
 * Substitui <div className="toolbar"> em todas as páginas.
 *
 * Uso:
 *   <Toolbar>
 *     <SidebarToggle ... />
 *     <ToolbarTitle>🏌️ FPG</ToolbarTitle>
 *     <ToolbarMeta>📍 Santo da Serra</ToolbarMeta>
 *     <ToolbarSep />
 *     <button ...>...</button>
 *     <span className="chip" style={{ marginLeft: "auto" }}>12 torneios</span>
 *   </Toolbar>
 */
import React from "react";

interface ToolbarProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Toolbar({ children, className, style }: ToolbarProps) {
  return (
    <div className={`toolbar${className ? " " + className : ""}`} style={style}>
      {children}
    </div>
  );
}

export function ToolbarTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`toolbar-title${className ? " " + className : ""}`}>{children}</span>;
}

export function ToolbarMeta({ children }: { children: React.ReactNode }) {
  return <span className="toolbar-meta">{children}</span>;
}

export function ToolbarSep() {
  return <div className="toolbar-sep" />;
}
