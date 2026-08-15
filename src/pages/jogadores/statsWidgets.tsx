/**
 * src/pages/jogadores/statsWidgets.tsx
 *
 * Micro-widgets partilhados pelos painéis de estatísticas da JogadoresPage
 * (FederadosStatsPanel, FilteredStatsCard, DrillDownCard, HcpBinDrillCard).
 * Consolidação 2026-08-15: as barras stacked M/F horizontais/verticais e o
 * adaptador KpiCard numérico estavam duplicados por painel.
 */
import React from "react";
import UiKpiCard from "../../ui/KpiCard";
import SexBadge from "../../ui/SexBadge";

/** Cores oficiais M/F (tokens.css). */
export const COL_M = "var(--badge-male)";
export const COL_F = "var(--badge-female)";

/** Largura percentual de uma barra relativa ao máximo (mín. 2% para ser visível). */
export function barPct(v: number, max: number): string {
  return `${Math.max(2, (v / Math.max(1, max)) * 100)}%`;
}

/* Adaptador fino (stats) → delega na definição única ui/KpiCard.
   Valor numérico formatado pt-PT, centrado, com percentagem opcional. */
export function KpiCard({ label, value, pct, big, sub }: {
  label: React.ReactNode; value: number; pct?: number; big?: boolean; sub?: string;
}) {
  return (
    <UiKpiCard
      label={label}
      value={value.toLocaleString("pt-PT")}
      size={big ? "lg" : "md"}
      pct={pct}
      sub={sub}
      align="center"
    />
  );
}

/** Barra horizontal stacked M/F sobre fundo subtle. `widthPct` = largura da
 *  parte preenchida relativa ao máximo da série (usar barPct). */
export function MFBar({ m, f, widthPct, height = 6, radius = 2 }: {
  m: number; f: number; widthPct: string; height?: number; radius?: number;
}) {
  const total = m + f;
  const mPct = total > 0 ? (m / total) * 100 : 0;
  return (
    <div style={{ height, background: "var(--bg-subtle)", borderRadius: radius, overflow: "hidden" }}>
      <div style={{ width: widthPct, height: "100%", display: "flex" }}>
        <div style={{ width: `${mPct}%`, background: COL_M }} />
        <div style={{ width: `${100 - mPct}%`, background: COL_F }} />
      </div>
    </div>
  );
}

/** Coluna vertical stacked M/F (histogramas). F em cima, M em baixo. */
export function MFColumn({ m, f, barHeight, width = "85%", minWidth, shadow }: {
  m: number; f: number; barHeight: number; width?: string; minWidth?: number; shadow?: boolean;
}) {
  const total = m + f;
  const mHeight = (m / Math.max(1, total)) * barHeight;
  const fHeight = barHeight - mHeight;
  return (
    <div style={{
      width, minWidth, display: "flex", flexDirection: "column",
      borderRadius: "3px 3px 0 0", overflow: "hidden",
      boxShadow: shadow ? "0 1px 2px rgba(0,0,0,0.08)" : undefined,
    }}>
      {f > 0 && <div title={`${f} Feminino`} style={{ height: fHeight, background: COL_F, minHeight: 2 }} />}
      {m > 0 && <div title={`${m} Masculino`} style={{ height: mHeight, background: COL_M, minHeight: 2 }} />}
    </div>
  );
}

/** Legenda M/F compacta (badges + rótulos). */
export function MFLegend({ long, gap = 10 }: { long?: boolean; gap?: number }) {
  return (
    <div style={{ display: "flex", gap, fontSize: "var(--fs-10)" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><SexBadge sex="M" /> {long ? "Masculino" : "M"}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><SexBadge sex="F" /> {long ? "Feminino" : "F"}</span>
    </div>
  );
}
