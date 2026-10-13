/**
 * Pílula neutra do ano de nascimento / idade — a MESMA do Resumo
 * (MultiRoundLeaderboard), usada também no Draw e nas Inscrições para as
 * tabelas do torneio ficarem iguais (13/10/2026).
 */
import type { ReactNode } from "react";

export default function BirthPill({ children }: { children: ReactNode }) {
  return (
    <span className="p p-sm" style={{ background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "transparent" }}>
      {children}
    </span>
  );
}
