/**
 * ComparisonDonut — donut SVG simples estilo Masters.com
 *
 * Mostra uma percentagem do jogador (verde) com uma "costela" interna
 * a cinzento que representa a percentagem do field para a mesma métrica.
 * Ao centro: %player grande, %field pequeno por baixo.
 *
 * Intencionalmente sem dependências externas (não usa recharts).
 */
import React from "react";

interface Props {
  /** 0-100 */
  playerPct: number;
  /** 0-100, opcional */
  fieldPct?: number | null;
  /** Label no topo — "BIRDIES", "FAIRWAYS", etc. */
  label?: string;
  /** Texto abaixo do donut — ex: "19/72" */
  caption?: string;
  /** Tamanho do SVG em px (default 140) */
  size?: number;
  /** Stroke width do arc principal */
  strokeWidth?: number;
  /** Cor do arc do jogador */
  playerColor?: string;
  /** Cor do arc do field */
  fieldColor?: string;
  /** Esconder bloco de caption/label */
  minimal?: boolean;
}

export default function ComparisonDonut({
  playerPct,
  fieldPct = null,
  label,
  caption,
  size = 140,
  strokeWidth = 14,
  playerColor = "var(--accent)",
  fieldColor = "var(--text-3)",
  minimal = false,
}: Props) {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const pp = clamp(playerPct);
  const fp = fieldPct != null ? clamp(fieldPct) : null;

  const outerR  = (size - strokeWidth) / 2;
  const innerR  = outerR - strokeWidth - 2;  // arco do field por dentro
  const cx      = size / 2;
  const cy      = size / 2;
  const circumOuter = 2 * Math.PI * outerR;
  const circumInner = 2 * Math.PI * innerR;

  const dashOuter = (pp / 100) * circumOuter;
  const dashInner = fp != null ? (fp / 100) * circumInner : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      {!minimal && label && (
        <div style={{ fontSize: "var(--fs-11)", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.08em" }}>
          {label}
        </div>
      )}
      <svg width={size} height={size} role="img" aria-label={label ?? "donut"}>
        {/* Track principal */}
        <circle
          cx={cx} cy={cy} r={outerR}
          fill="none" stroke="var(--border-light)" strokeWidth={strokeWidth}
        />
        {/* Arco do field (interno) — só desenhado quando há field */}
        {fp != null && (
          <>
            <circle
              cx={cx} cy={cy} r={innerR}
              fill="none" stroke="var(--bg-muted)" strokeWidth={strokeWidth / 2}
            />
            <circle
              cx={cx} cy={cy} r={innerR}
              fill="none" stroke={fieldColor} strokeWidth={strokeWidth / 2}
              strokeDasharray={`${dashInner} ${circumInner - dashInner}`}
              strokeDashoffset={circumInner * 0.25}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: "stroke-dasharray 400ms ease-out" }}
            />
          </>
        )}
        {/* Arco do jogador (externo) */}
        <circle
          cx={cx} cy={cy} r={outerR}
          fill="none" stroke={playerColor} strokeWidth={strokeWidth}
          strokeDasharray={`${dashOuter} ${circumOuter - dashOuter}`}
          strokeDashoffset={circumOuter * 0.25}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dasharray 400ms ease-out" }}
        />
        {/* Centro */}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
          fontSize={size * 0.22} fontWeight={700} fill="var(--accent)">
          {Math.round(pp)}
          <tspan fontSize={size * 0.12} dy={-size * 0.05}>%</tspan>
        </text>
        {fp != null && (
          <text x={cx} y={cy + size * 0.18} textAnchor="middle"
            fontSize={size * 0.1} fill="var(--text-3)">
            {Math.round(fp)}%
          </text>
        )}
      </svg>
      {!minimal && caption && (
        <div style={{ fontSize: "var(--fs-11)", color: "var(--text-3)" }}>{caption}</div>
      )}
    </div>
  );
}
