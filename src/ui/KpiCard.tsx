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
 *   size                 — "xs" (16px, cartão estreito e centrado, para cabeçalhos) | "sm" (16px) | "md" (22px, padrão) | "lg" (28px)
 *   accentBorder         — borda-esquerda colorida (estilo Aroeira2/ScoutView)
 *   align                — "center" para centrar (stats dos federados)
 *
 * Uso:
 *   <KpiCard label="Torneios" value="12" />
 *   <KpiCard label="Melhor SD" value="18.4" color="var(--color-good)" sub="abaixo do HCP" />
 *   <KpiCard label="SD · últ.5" value="13.1" delta={-1.2} deltaLabel="vs últ.20" tip="…" />
 */
import React from "react";
import InfoIcon from "./InfoIcon";
import { fmtSign } from "../utils/format";
import { Tint } from "./DataStyle";

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
  /** Preenche o cartão inteiro (fundo tingido + borda + valor colorido):
   *  "good" (verde) ou "danger" (vermelho). Ignorado se null. */
  fill?: "good" | "danger" | null;
  /** Percentagem 0–1 mostrada como sub-linha. */
  pct?: number;
  /** Tamanho do valor: "xs" (16px, cartão estreito e centrado) | "sm" (16px) | "md" (22px, padrão) | "lg" (28px). */
  size?: "xs" | "sm" | "md" | "lg";
  /** Borda-esquerda colorida (realce por tom). */
  accentBorder?: string;
  /** Centrar conteúdo (cards de estatística). */
  align?: "left" | "center";
  /** Classe extra no elemento raiz */
  className?: string;
  /** Classe extra no kpi-lbl */
  labelClassName?: string;
  /** Clique no cartão inteiro (ex: KPI P&P abre a vista P&P). */
  onClick?: () => void;
  /** Tooltip nativo no elemento raiz. */
  title?: string;
}

const SIZE_CLASS: Record<string, string> = {
  xs: "kpi-val fs-16",
  sm: "kpi-val fs-16",
  md: "kpi-val",
  lg: "kpi-val kpi-val-lg",
};

export default function KpiCard({
  label, value, sub, color, tip, delta, deltaLabel, pct,
  size = "md", accentBorder, align, className, labelClassName, fill,
  onClick, title,
}: KpiCardProps) {
  const valClass = SIZE_CLASS[size] || "kpi-val";
  const dCls = delta == null ? ""
    : delta < -0.05 ? " u-c-color-good"
    : delta > 0.05 ? " u-c-color-danger"
    : " u-c-text-3";
  // Classes (App.css): .kpi-fill-good/-danger pinta o cartão e o valor (a menos
  // que venha `color`); .kpi-accent + `accentBorder` = borda-esquerda de 4px;
  // .kpi-center centra. As cores que vêm de fora passam pelo Tint.
  const rootCls = "kpi"
    + (size === "xs" ? " kpi-xs" : "")
    + (fill ? " kpi-fill-" + fill : "")
    + (accentBorder ? " kpi-accent" : "")
    + (align === "center" || size === "xs" ? " kpi-center" : "")
    + (onClick ? " u-cur-pointer" : "")
    + (className ? " " + className : "");
  return (
    <Tint as="div" className={rootCls} bd={accentBorder} onClick={onClick} title={title}>
      <div className={labelClassName ? "kpi-lbl " + labelClassName : "kpi-lbl"}>
        {label}{tip && <InfoIcon title={tip} />}
      </div>
      <Tint as="div" className={valClass} fg={color}>{value}</Tint>
      {delta != null && (
        <div className={"kpi-delta" + dCls}>
          {fmtSign(delta, 1)} {deltaLabel ?? "vs média"}
        </div>
      )}
      {pct != null && <div className="kpi-sub">{(pct * 100).toFixed(1)}%</div>}
      {sub != null && <div className="kpi-sub">{sub}</div>}
    </Tint>
  );
}
