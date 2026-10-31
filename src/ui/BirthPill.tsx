/**
 * Pílula neutra do ano de nascimento / idade — a MESMA do Resumo
 * (MultiRoundLeaderboard), usada também no Draw e nas Inscrições para as
 * tabelas do torneio ficarem iguais (13/10/2026).
 */
import type { ReactNode } from "react";

export default function BirthPill({ children }: { children: ReactNode }) {
  return (
    <span className="p p-sm u-bg-bg-muted u-c-text-2 u-border-color-transparent">
      {children}
    </span>
  );
}
