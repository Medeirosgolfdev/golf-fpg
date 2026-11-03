/**
 * src/pages/jogadores/statsWidgets.tsx
 *
 * Micro-widgets partilhados pelos painéis de estatísticas da JogadoresPage
 * (FederadosStatsPanel, FilteredStatsCard, DrillDownCard, HcpBinDrillCard).
 * Consolidação 2026-08-15: as barras stacked M/F horizontais/verticais e o
 * adaptador KpiCard numérico estavam duplicados por painel (o adaptador saiu a
 * 03/11/2026: os painéis usam o ui/KpiCard directamente).
 */
import SexBadge from "../../ui/SexBadge";
import { Fill } from "../../ui/DataStyle";

/** Largura percentual de uma barra relativa ao máximo (mín. 2% para ser visível). */
export function barPct(v: number, max: number): string {
  return `${Math.max(2, (v / Math.max(1, max)) * 100)}%`;
}

/** Barra horizontal stacked M/F sobre fundo subtle. `widthPct` = largura da
 *  parte preenchida relativa ao máximo da série (usar barPct). Cores M/F dos
 *  tokens --badge-male/--badge-female (pelo `Fill`); `lg` = 8px. */
export function MFBar({ m, f, widthPct, lg }: {
  m: number; f: number; widthPct: string; lg?: boolean;
}) {
  const total = m + f;
  const mPct = total > 0 ? (m / total) * 100 : 0;
  return (
    <div className={lg ? "mf-bar mf-bar-lg" : "mf-bar"}>
      <Fill pct={widthPct} bg="transparent" className="u-d-flex u-h-100pc">
        <Fill pct={mPct} bg="var(--badge-male)" />
        <Fill pct={100 - mPct} bg="var(--badge-female)" />
      </Fill>
    </div>
  );
}

/** Coluna vertical stacked M/F (histogramas). F em cima, M em baixo. A altura
 *  vem dos dados; a largura de cada histograma vai em `className`
 *  (.mf-col-lg · .mf-col-wide · .mf-col-sm, no App.css). */
export function MFColumn({ m, f, barHeight, className }: {
  m: number; f: number; barHeight: number; className?: string;
}) {
  const total = m + f;
  const mHeight = (m / Math.max(1, total)) * barHeight;
  const fHeight = barHeight - mHeight;
  return (
    <div className={className ? `mf-col ${className}` : "mf-col"}>
      {f > 0 && <Fill vertical pct={`${fHeight}px`} bg="var(--badge-female)" title={`${f} Feminino`} className="mf-seg" />}
      {m > 0 && <Fill vertical pct={`${mHeight}px`} bg="var(--badge-male)" title={`${m} Masculino`} className="mf-seg" />}
    </div>
  );
}

/** Legenda M/F compacta (badges + rótulos); `long` = «Masculino/Feminino». */
export function MFLegend({ long }: { long?: boolean }) {
  return (
    <div className={`u-d-flex u-fs-fs-10 ${long ? "u-gap-12px" : "u-gap-10px"}`}>
      <span className="u-d-inline-flex u-ai-center u-gap-3px"><SexBadge sex="M" /> {long ? "Masculino" : "M"}</span>
      <span className="u-d-inline-flex u-ai-center u-gap-3px"><SexBadge sex="F" /> {long ? "Feminino" : "F"}</span>
    </div>
  );
}
