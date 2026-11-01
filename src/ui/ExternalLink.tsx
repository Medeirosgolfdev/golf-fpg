/**
 * src/ui/ExternalLink.tsx
 *
 * Link externo: abre numa janela nova, sempre com rel="noopener noreferrer".
 * Todos os links para fora da app passam por aqui (nada de <a target="_blank"> à mão).
 * Aceita os atributos normais de um <a> (className, title, onClick, aria-label…).
 *
 * Uso:
 *   <ExtLink href={url}>🔗 Leaderboard oficial</ExtLink>
 *   <ExtLink href={url} className="tourn-ext-link ml-8" >Ver ↗</ExtLink>
 *   <ExtLink href={url} className="sc-ext-link" title="FPG Scoring">🔗</ExtLink>
 */
import React from "react";

type ExtLinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "target" | "rel"> & { href: string };

export default function ExtLink({ children, ...rest }: ExtLinkProps) {
  return (
    <a target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}
