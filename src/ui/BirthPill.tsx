/**
 * Pílula do ano de nascimento / idade — a MESMA do Resumo
 * (MultiRoundLeaderboard), usada também no Draw e nas Inscrições para as
 * tabelas do torneio ficarem iguais (13/10/2026). Com o escalão (`esc`), toma a
 * cor desse escalão — a do EscPill (02/11/2026, pedido da Mariana); sem ele,
 * neutra. `dashed` = data não confirmada (janela ou inferida — ficha do Kids 2).
 * `ano1` = 1.º ano do escalão: cor clara com contorno; o 2.º ano fica com a cor
 * cheia — a regra do AnoEscalaoPill (23/10/2026), para se ver logo a diferença
 * (04/11/2026: 2014 e 2015 no Sub 12 saíam iguais).
 */
import type { ReactNode } from "react";
import { escClassOf } from "./PillBadge";

export default function BirthPill({ children, esc, dashed, title, ano1 }: {
  children: ReactNode; esc?: string | null; dashed?: boolean; title?: string; ano1?: boolean;
}) {
  const cls = escClassOf(esc);
  return (
    <span className={(cls ? `p p-sm ${cls}${ano1 ? " p-ano1" : ""}` : "p p-sm p-muted") + (dashed ? " u-border-style-dashed" : "")}
      title={title}>
      {children}
    </span>
  );
}
