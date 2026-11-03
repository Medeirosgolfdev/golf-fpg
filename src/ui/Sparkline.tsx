/**
 * Sparkline — mini-gráfico de linha em SVG, o mesmo em todas as páginas
 * (HCP do Kids 2, posições por edição…). Os valores nulos deixam um buraco
 * (o traço salta-os). `lowAtTop`: o valor mais baixo fica em cima (posições:
 * o 1.º lugar no topo); sem ele, o mais alto fica em cima (HCP: descer = melhorar).
 */
export interface SparklineProps {
  values: (number | null)[];
  width?: number;
  height?: number;
  /** Domínio fixo [mín, máx]; por defeito o dos dados. */
  domain?: [number, number];
  lowAtTop?: boolean;
  stroke?: string;
  strokeOpacity?: number;
  /** Pontos: só o último («last») ou todos («all»). */
  dots?: "last" | "all";
  dotColor?: (i: number) => string;
  dotRadius?: (i: number) => number;
  dotTitle?: (i: number) => string;
  /** Linha de base cinzenta por baixo. */
  baseline?: boolean;
  padX?: number;
  padY?: number;
  className?: string;
}

export default function Sparkline({
  values, width = 80, height = 20, domain, lowAtTop, stroke = "var(--text-3)", strokeOpacity,
  dots = "last", dotColor, dotRadius, dotTitle, baseline, padX = 2, padY = 2, className = "u-d-block",
}: SparklineProps) {
  const valid = values.filter((v): v is number => v != null);
  if (!valid.length) return null;
  const [min, max] = domain ?? [Math.min(...valid), Math.max(...valid)];
  const range = max - min || 1;
  const w = width - padX * 2, h = height - padY * 2;
  const pts = values.map((v, i) => ({
    x: padX + (values.length === 1 ? w / 2 : (i / (values.length - 1)) * w),
    y: v == null ? null : padY + Math.min(h, Math.max(0, ((lowAtTop ? v - min : max - v) / range) * h)),
  }));
  const path = pts.filter(p => p.y != null).map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y!.toFixed(1)}`).join(" ");
  let lastIdx = -1;
  pts.forEach((p, i) => { if (p.y != null) lastIdx = i; });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className}>
      {baseline && <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="var(--border-light)" strokeWidth={1} />}
      {path && <path d={path} fill="none" stroke={stroke} strokeOpacity={strokeOpacity} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />}
      {pts.map((p, i) => {
        if (p.y == null || (dots === "last" && i !== lastIdx)) return null;
        return (
          <circle key={i} cx={p.x} cy={p.y} r={dotRadius ? dotRadius(i) : 2} fill={dotColor ? dotColor(i) : stroke}>
            {dotTitle && <title>{dotTitle(i)}</title>}
          </circle>
        );
      })}
    </svg>
  );
}
