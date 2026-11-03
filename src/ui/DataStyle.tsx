/**
 * Peças para os valores que vêm dos DADOS (03/11/2026, pedido da Mariana: «0
 * estilos à mão»). As páginas não escrevem `style={{…}}`: o que é fixo vai para
 * classes; o que muda com os dados passa por uma destas peças, que são o ÚNICO
 * sítio com `style` (variáveis CSS lidas pelas classes `.tint-*`, `.fill`, `.cols`; cada
 * classe só entra quando o valor existe, para não apagar o fundo/cor das outras).
 *
 *   <Tint bg={teeHex} fg={teeFg}>Brancas</Tint>          cor de fundo/texto/borda dos dados
 *   <Fill pct={62} bg="var(--accent)" />                  barra: largura (ou altura) em %
 *   <Cols n={anos.length} className="u-gap-12px">…</Cols> grelha com N colunas iguais
 *   <Place left={x} top={y} maxH={h}>…</Place>            posição/medida calculada (popups, rótulos)
 *
 * `as` escolhe o elemento (span por defeito; div, td, th, a, button…); os outros
 * atributos (title, onClick, href, type, colSpan, className…) passam directo.
 */
import type { AllHTMLAttributes, CSSProperties, ElementType, ReactNode, Ref } from "react";

type Base = Omit<AllHTMLAttributes<HTMLElement>, "style" | "as"> & { as?: ElementType; children?: ReactNode; ref?: Ref<HTMLElement> };

const vars = (o: Record<string, string | number | null | undefined>): CSSProperties | undefined => {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(o)) if (v != null && v !== "") out[k] = v;
  return Object.keys(out).length ? (out as CSSProperties) : undefined;
};
const cls = (base: string, extra?: string) => (extra ? `${base} ${extra}` : base);

/** Cores que vêm dos dados: fundo (`bg`), texto (`fg`), borda (`bd`). Sem nenhuma → herda. */
export function Tint({ as: Tag = "span", bg, fg, bd, className, ...rest }: Base & {
  bg?: string | null; fg?: string | null; bd?: string | null;
}) {
  const c = [bg ? "tint-bg" : "", fg ? "tint-fg" : "", bd ? "tint-bd" : "", className ?? ""].filter(Boolean).join(" ");
  return <Tag {...rest} className={c || undefined} style={vars({ "--tint-bg": bg, "--tint-fg": fg, "--tint-bd": bd })} />;
}

/** Parte cheia de uma barra: `pct` (0–100) na largura, ou na altura com `vertical`. */
export function Fill({ as: Tag = "div", pct, bg, vertical, className, ...rest }: Base & {
  pct: number | string; bg?: string | null; vertical?: boolean;
}) {
  const v = typeof pct === "number" ? `${Math.max(0, Math.min(100, pct))}%` : pct;
  return <Tag {...rest} className={cls((vertical ? "fill fill-v" : "fill") + (bg ? " fill-bg" : ""), className)} style={vars({ "--fill": v, "--fill-bg": bg })} />;
}

/** Grelha com `n` colunas iguais (`min`: largura mínima de cada uma, ex. "60px"). */
export function Cols({ as: Tag = "div", n, min, className, ...rest }: Base & { n: number; min?: string }) {
  return <Tag {...rest} className={cls("cols", className)} style={vars({ "--cols": Math.max(1, n), "--col-min": min })} />;
}

/** Posição ou medida calculada (popups junto ao rato, rótulos com largura máxima
 *  pelo nº de colunas): `left`/`top`/`right` (px ou string), `w`, `maxW`, `maxH`.
 *  Só entram as que vêm preenchidas. */
export function Place({ as: Tag = "div", left, top, right, w, maxW, maxH, className, ...rest }: Base & {
  left?: number | string | null; top?: number | string | null; right?: number | string | null;
  w?: number | string | null; maxW?: number | string | null; maxH?: number | string | null;
}) {
  const px = (v: number | string | null | undefined) => (typeof v === "number" ? `${v}px` : v);
  const c = [left != null ? "place-l" : "", top != null ? "place-t" : "", right != null ? "place-r" : "",
    w != null ? "place-w" : "", maxW != null ? "place-mw" : "", maxH != null ? "place-mh" : "", className ?? ""].filter(Boolean).join(" ");
  return <Tag {...rest} className={c || undefined} style={vars({ "--pl": px(left), "--pt": px(top), "--pr": px(right), "--pw": px(w), "--pmw": px(maxW), "--pmh": px(maxH) })} />;
}
