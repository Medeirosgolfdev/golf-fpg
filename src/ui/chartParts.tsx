/**
 * Peças comuns dos gráficos (recharts) — o mesmo aspecto em todas as páginas:
 * grelha, eixos, linha de referência, caixa da legenda/tooltip e o contentor
 * com altura fixa (evita o aviso «width(-1) height(-1)» quando o pai ainda não
 * tem tamanho — separador escondido, primeiro render).
 *   <ChartBox height={240}><LineChart …><CartesianGrid {...CHART_GRID} /><XAxis {...CHART_AXIS} …/>
 */
import type { ReactElement, ReactNode } from "react";
import { ResponsiveContainer } from "recharts";

export const CHART_GRID = { strokeDasharray: "3 3", stroke: "var(--border-light)" } as const;
export const CHART_TICK = { fontSize: 10, fill: "var(--text-3)" } as const;
export const CHART_AXIS = { tick: CHART_TICK, stroke: "var(--border)" } as const;
/** Linha de referência tracejada (par, Top 10…). */
export const CHART_REF = { stroke: "var(--text-3)", strokeDasharray: "4 4" } as const;
/** Caixa do Tooltip simples (contentStyle) — a mesma da ChartTooltipBox. */
export const CHART_TOOLTIP_STYLE = {
  background: "var(--bg-card)", border: "1px solid var(--border)",
  borderRadius: "var(--radius)", fontSize: "var(--fs-11)",
} as const;

export function ChartBox({ height, children }: { height: number; children: ReactElement }) {
  return (
    <div className="u-w-100pc u-minw-0">
      <ResponsiveContainer width="100%" height={height} minWidth={1} minHeight={1}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** Caixa de um Tooltip próprio (`content={…}`). */
export function ChartTooltipBox({ children }: { children: ReactNode }) {
  return <div className="chart-tooltip">{children}</div>;
}
