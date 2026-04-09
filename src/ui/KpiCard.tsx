/**
 * src/ui/KpiCard.tsx
 *
 * Componente reutilizável para KPIs — label / valor / sub-linha.
 * Usado em DrivePage, BJGTAnalysisPage, RivaisIntlPage, etc.
 *
 * Uso:
 *   <KpiCard label="Torneios" value="12" />
 *   <KpiCard label="Melhor SD" value="18.4" color="var(--color-good)" sub="abaixo do HCP" />
 */
import React from "react";

interface KpiCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
  /** Classe extra no elemento raiz */
  className?: string;
  /** Tamanho do valor: "md" (22px, padrão) | "sm" (16px) */
  size?: "md" | "sm";
  /** Style inline no elemento raiz — para flex, padding, minWidth customizados */
  style?: React.CSSProperties;
  /** Style inline no kpi-lbl */
  labelStyle?: React.CSSProperties;
}

export default function KpiCard({ label, value, sub, color, className, size = "md", style, labelStyle }: KpiCardProps) {
  const valClass = size === "sm" ? "kpi-val fs-16" : "kpi-val";
  return (
    <div className={`kpi${className ? " " + className : ""}`} style={style}>
      <div className="kpi-lbl" style={labelStyle}>{label}</div>
      <div className={valClass} style={color ? { color } : undefined}>{value}</div>
      {sub != null && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}