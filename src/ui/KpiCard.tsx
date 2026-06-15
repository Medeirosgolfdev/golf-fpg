/**
 * src/ui/KpiCard.tsx
 *
 * ★ DEFINIÇÃO ÚNICA de KPI card de toda a app. ★
 * Todos os outros "KPI" (KPICard rico da JogadoresPage, o card de stats dos
 * federados, KpiBox do ScoutView, KpiCard do Aroeira2) são adaptadores finos
 * que delegam AQUI — há uma só renderização/estilo (.kpi), igual em todo o lado.
 *
 * Props (todas opcionais excepto label/value):
 *   label / value / sub  — conteúdo
 *   color                — cor do valor (accent/tone/emphasis)
 *   tip                  — tooltip ℹ ao lado do label
 *   delta + deltaLabel   — linha de variação com cor automática (verde=desce)
 *   pct                  — mostra percentagem (0–1) como sub-linha
 *   size                 — "sm" (16px) | "md" (22px, padrão) | "lg" (28px)
 *   accentBorder         — borda-esquerda colorida (estilo Aroeira2/ScoutView)
 *   align                — "center" para centrar (stats dos federados)
 *
 * Uso:
 *   <KpiCard label="Torneios" value="12" />
 *   <KpiCard label="Melhor SD" value="18.4" color="var(--color-good)" sub="abaixo do HCP" />
 *   <KpiCard label="SD · últ.5" value="13.1" delta={-1.2} deltaLabel="vs últ.20" tip="…" />
 */
import React from "react";

interface KpiCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
  /** Tooltip ℹ ao lado do label. */
  tip?: string;
  /** Variação numérica — linha colorida (negativo=verde, positivo=vermelho). */
  delta?: number | null;
  deltaLabel?: string;
  /** Percentagem 0–1 mostrada como sub-linha. */
  pct?: number;
  /** Tamanho do valor: "sm" (16px) | "md" (22px, padrão) | "lg" (28px). */
  size?: "sm" | "md" | "lg";
  /** Borda-esquerda colorida (realce por tom). */
  accentBorder?: string;
  /** Centrar conteúdo (cards de estatística). */
  align?: "left" | "center";
  /** Classe extra no elemento raiz */
  className?: string;
  /** Style inline no elemento raiz */
  style?: React.CSSProperties;
  /** Style inline no kpi-lbl */
  labelStyle?: React.CSSProperties;
}

const SIZE_CLASS: Record<string, string> = {
  sm: "kpi-val fs-16",
  md: "kpi-val",
  lg: "kpi-val kpi-val-lg",
};

export default function KpiCard({
  label, value, sub, color, tip, delta, deltaLabel, pct,
  size = "md", accentBorder, align, className, style, labelStyle,
}: KpiCardProps) {
  const valClass = SIZE_CLASS[size] || "kpi-val";
  const dColor = delta == null ? undefined
    : delta < -0.05 ? "var(--color-good)"
    : delta > 0.05 ? "var(--color-danger)"
    : "var(--text-3)";
  const rootStyle: React.CSSProperties = {
    ...(accentBorder ? { borderLeft: `4px solid ${accentBorder}` } : null),
    ...(align === "center" ? { alignItems: "center", textAlign: "center" } : null),
    ...style,
  };
  return (
    <div className={`kpi${className ? " " + className : ""}`} style={rootStyle}>
      <div className="kpi-lbl" style={labelStyle}>
        {label}{tip && <span className="kpi-info ml-4" title={tip}>ℹ</span>}
      </div>
      <div className={valClass} style={color ? { color } : undefined}>{value}</div>
      {delta != null && (
        <div className="kpi-delta" style={{ color: dColor }}>
          {delta > 0 ? "+" : ""}{delta.toFixed(1)} {deltaLabel ?? "vs média"}
        </div>
      )}
      {pct != null && <div className="kpi-sub">{(pct * 100).toFixed(1)}%</div>}
      {sub != null && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
