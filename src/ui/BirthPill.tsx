/**
 * Pílula do ano de nascimento / idade — a MESMA do Resumo
 * (MultiRoundLeaderboard), usada também no Draw e nas Inscrições para as
 * tabelas do torneio ficarem iguais (13/10/2026). Com o escalão (`esc`), toma a
 * cor desse escalão — a do EscPill (02/11/2026, pedido da Mariana); sem ele,
 * neutra. `dashed` = data não confirmada (janela ou inferida — ficha do Kids 2).
 */
import type { ReactNode } from "react";
import { escClassOf } from "./PillBadge";

export default function BirthPill({ children, esc, dashed, title }: {
  children: ReactNode; esc?: string | null; dashed?: boolean; title?: string;
}) {
  const cls = escClassOf(esc);
  return (
    <span className={(cls ? `p p-sm ${cls}` : "p p-sm p-muted") + (dashed ? " u-border-style-dashed" : "")}
      title={title}>
      {children}
    </span>
  );
}
