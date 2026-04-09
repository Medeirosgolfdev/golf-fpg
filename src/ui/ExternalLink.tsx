/**
 * src/ui/ExternalLink.tsx
 *
 * Link externo (target _blank) com rel="noopener noreferrer" garantido.
 * Suporta as 4 classes CSS de link do projecto.
 *
 * Uso:
 *   <ExtLink href={url}>🔗 Leaderboard oficial</ExtLink>
 *   <ExtLink href={url} className="tourn-ext-link" style={{ marginLeft: 8 }}>Ver ↗</ExtLink>
 *   <ExtLink href={url} className="detail-link">Ver scorecard ↗</ExtLink>
 *   <ExtLink href={url} className="sc-ext-link" title="FPG Scoring">🔗</ExtLink>
 */
import React from "react";

interface ExtLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export default function ExtLink({
  href, children, className, style, title, onClick,
}: ExtLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={style}
      title={title}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
