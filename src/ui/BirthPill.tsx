/**
 * Pílula do ano de nascimento / idade — a MESMA do Resumo
 * (MultiRoundLeaderboard), usada também no Draw e nas Inscrições para as
 * tabelas do torneio ficarem iguais (13/10/2026). Com o escalão (`esc`), toma a
 * cor desse escalão — a do EscPill (02/11/2026, pedido da Mariana); sem ele,
 * neutra.
 */
import type { ReactNode } from "react";
import { escClassOf } from "./PillBadge";

export default function BirthPill({ children, esc }: { children: ReactNode; esc?: string | null }) {
  const cls = escClassOf(esc);
  return (
    <span className={cls ? `p p-sm ${cls}` : "p p-sm u-bg-bg-muted u-c-text-2 u-border-color-transparent"}>
      {children}
    </span>
  );
}
