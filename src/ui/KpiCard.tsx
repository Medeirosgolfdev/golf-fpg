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
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
  /** Classe extra no elemento raiz (ex: "op-4" para desactivado) */
  className?: string;
  /** Tamanho do valor: "md" (22px, padrão) | "sm" (16px) */
  size?: "md" | "sm";
}

export default function KpiCard({ label, value, sub, color, className, size = "md" }: KpiCardProps) {
  const valClass = size === "sm" ? "kpi-val fs-16" : "kpi-val";
  return (
    <div className={`kpi${className ? " " + className : ""}`}>
      <div className="kpi-lbl">{label}</div>
      <div className={valClass} style={color ? { color } : undefined}>{value}</div>
      {sub != null && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}