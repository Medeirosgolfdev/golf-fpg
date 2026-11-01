/**
 * src/ui/PlayerLink.tsx
 *
 * Nome de jogador que abre a ficha (/jogadores/:fed) numa janela nova — o mesmo
 * em todas as tabelas: cor do texto, sublinhado só ao passar o rato (.player-link).
 * Sem federado fica só o nome. O clique não chega à linha da tabela (que muitas
 * vezes abre o detalhe).
 *
 * Uso:
 *   <PlayerLink fed={row.fed} name={row.name} />
 *   <PlayerLink fed={row.fed} name={row.name} query="?view=federado" className="fw-700" />
 */
import React from "react";

interface PlayerLinkProps {
  fed: string | number | null | undefined;
  name: React.ReactNode;
  /** Query string a acrescentar ao endereço, ex: "?view=federado" */
  query?: string;
  className?: string;
  title?: string;
}

export default function PlayerLink({ fed, name, query = "", className, title }: PlayerLinkProps) {
  if (!fed) return <span className={className} title={title}>{name}</span>;
  return (
    <a
      href={`/jogadores/${fed}${query}`}
      target="_blank"
      rel="noopener noreferrer"
      className={"player-link" + (className ? " " + className : "")}
      title={title}
      onClick={e => e.stopPropagation()}
    >
      {name}
    </a>
  );
}
