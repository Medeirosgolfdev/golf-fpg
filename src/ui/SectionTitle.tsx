/**
 * SectionTitle — o título de uma secção, o mesmo em todas as páginas
 * (03/11/2026: havia ~20 escritos à mão em 7 tamanhos/pesos).
 *   - size "sm" (12px) · "md" (14px, padrão) · "lg" (16px) → classes .h-sm/.h-md/.h-lg
 *   - icon  — emoji à esquerda («🏆», «📊»)
 *   - sub   — nota pequena a seguir ao título («clica para detalhar», «stacked M/F»)
 *   - right — contagem ou controlos encostados à direita (.section-hdr)
 *   - as    — o elemento ("h3" por defeito; "div" dentro de cartões que já têm h3)
 *
 *   <SectionTitle icon="🏆">Top 10 HCPs</SectionTitle>
 *   <SectionTitle sub="clica para detalhar" right={<span>12 escalões</span>}>Por escalão</SectionTitle>
 */
import type { ReactNode } from "react";

export default function SectionTitle({ children, size = "md", icon, sub, right, as: Tag = "h3", className }: {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  as?: "h2" | "h3" | "h4" | "div";
  className?: string;
}) {
  const title = (
    <Tag className={`h-${size} section-title${right ? " section-title-flex" : ""}${!right && className ? " " + className : ""}`}>
      {icon && <span className="section-title-icon">{icon}</span>}
      {children}
      {sub && <span className="section-title-sub">{sub}</span>}
    </Tag>
  );
  if (!right) return title;
  return (
    <div className={`section-hdr${className ? " " + className : ""}`}>
      {title}
      <div className="section-hdr-right">{right}</div>
    </div>
  );
}
