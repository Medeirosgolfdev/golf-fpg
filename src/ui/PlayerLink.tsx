/**
 * src/ui/PlayerLink.tsx
 *
 * Nome de jogador clicável que navega para o perfil (/jogadores/:fed).
 * Suporta 3 modos:
 *   - href externo (target _blank) — padrão para tabelas de torneio
 *   - onSelect callback — para navegação SPA
 *   - sem link (fed=null) — render passivo
 *
 * Uso:
 *   <PlayerLink fed={row.fed} name={row.name} />
 *   <PlayerLink fed={row.fed} name={row.name} query="?view=by_date" />
 *   <PlayerLink fed={row.fed} name={row.name} onSelect={setSelected} />
 *   <PlayerLink fed={null} name="Jogador desconhecido" />
 */
import React from "react";

interface PlayerLinkProps {
  fed: string | null | undefined;
  name: React.ReactNode;
  /** Query string a adicionar ao href, ex: "?view=by_date" */
  query?: string;
  /** Se fornecido, usa callback em vez de href */
  onSelect?: (fed: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function PlayerLink({
  fed,
  name,
  query = "",
  onSelect,
  className = "tourn-pname",
  style,
}: PlayerLinkProps) {
  if (!fed) return <span className={className} style={style}>{name}</span>;

  if (onSelect) {
    return (
      <span
        className={`${className} tourn-pname-link`}
        role="button"
        tabIndex={0}
        style={style}
        onClick={() => onSelect(fed)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(fed); } }}
      >
        {name}
      </span>
    );
  }

  return (
    <a
      href={`/jogadores/${fed}${query}`}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={{ color: "inherit", textDecoration: "none", ...style }}
    >
      {name}
    </a>
  );
}
