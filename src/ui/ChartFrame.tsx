/**
 * src/ui/ChartFrame.tsx
 *
 * Moldura presentational para gráficos SVG da app (donut, sparkline,
 * radar, scatter…). Padroniza o padrão repetido "rótulo em cima →
 * gráfico → legenda/caption em baixo" que estava duplicado em
 * ComparisonDonut, CrossAnalysis, HcpSparkline, ConsistencySection, etc.
 *
 * NÃO desenha eixos nem dados — é só o invólucro (rótulo, espaçamento,
 * estado vazio, acessibilidade). O conteúdo SVG vem como children.
 *
 * Uso:
 *   <ChartFrame label="BIRDIES" caption="19/72">
 *     <svg …>…</svg>
 *   </ChartFrame>
 *
 *   <ChartFrame label="Consistência" empty={pts.length === 0}>
 *     <svg …>…</svg>
 *   </ChartFrame>
 */
import React from "react";
import EmptyState from "./EmptyState";

interface ChartFrameProps {
  /** Rótulo curto no topo (maiúsculas, estilo eyebrow). */
  label?: React.ReactNode;
  /** Legenda/nota por baixo do gráfico. */
  caption?: React.ReactNode;
  /** Conteúdo SVG (ou qualquer gráfico). */
  children: React.ReactNode;
  /** Quando true, mostra EmptyState em vez do gráfico. */
  empty?: boolean;
  /** Mensagem do estado vazio. */
  emptyMessage?: string;
  /** Alinhamento horizontal do conteúdo (default "center"). */
  align?: "center" | "start";
  /** Descrição acessível (aplicada como aria-label no contentor do gráfico). */
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function ChartFrame({
  label, caption, children, empty, emptyMessage = "Sem dados para representar.",
  align = "center", ariaLabel, className, style,
}: ChartFrameProps) {
  return (
    <div
      className={`chart-frame${className ? " " + className : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : "flex-start",
        gap: "var(--space-4)",
        ...style,
      }}
    >
      {label != null && (
        <div
          className="fs-11 fw-700 c-text-3"
          style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}
        >
          {label}
        </div>
      )}
      {empty ? (
        <EmptyState size="sm" message={emptyMessage} />
      ) : (
        <div role="img" aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}>
          {children}
        </div>
      )}
      {caption != null && !empty && (
        <div className="fs-11 c-text-3">{caption}</div>
      )}
    </div>
  );
}
