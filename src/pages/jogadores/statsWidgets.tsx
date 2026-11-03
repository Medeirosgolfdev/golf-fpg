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

/** Largura percentual de uma barra relativa ao máximo (mín. 2% para ser visível). */
export function barPct(v: number, max: number): string {
  return `${Math.max(2, (v / Math.max(1, max)) * 100)}%`;
}

/** Barra horizontal stacked M/F sobre fundo subtle. `widthPct` = largura da
 *  parte preenchida relativa ao máximo da série (usar barPct). Cores M/F nas
 *  classes .bg-male/.bg-female (tokens --badge-male/--badge-female); `lg` = 8px. */
export function MFBar({ m, f, widthPct, lg }: {
  m: number; f: number; widthPct: string; lg?: boolean;
}) {
  const total = m + f;
  const mPct = total > 0 ? (m / total) * 100 : 0;
  return (
    <div className={lg ? "mf-bar mf-bar-lg" : "mf-bar"}>
      <div className="u-d-flex u-h-100pc" style={{ width: widthPct }}>
        <div className="bg-male" style={{ width: `${mPct}%` }} />
        <div className="bg-female" style={{ width: `${100 - mPct}%` }} />
      </div>
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
      {f > 0 && <div title={`${f} Feminino`} className="mf-seg bg-female" style={{ height: fHeight }} />}
      {m > 0 && <div title={`${m} Masculino`} className="mf-seg bg-male" style={{ height: mHeight }} />}
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
