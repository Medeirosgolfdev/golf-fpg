/**
 * kids2/components/NextTournamentsSection.tsx
 *
 * Próximos torneios em que ESTE jogador está inscrito (USKids + FPG).
 * Útil para decidir em que prova inscrever o Manuel para o apanhar.
 * Não aparece se o jogador não tiver inscrições futuras.
 */

import type { CanonicalData, Junior } from "../data";
import { useUpcomingByJunior, type UpcomingReg } from "../upcomingRegs";
import { fmtDayMonthYear } from "../../../utils/format";

interface Props {
  data: CanonicalData;
  junior: Junior;
}


const CIRCUIT_LABEL: Record<UpcomingReg["circuit"], string> = {
  uskids: "🇺🇸 USKids",
  fpg: "🇵🇹 FPG",
};

export default function NextTournamentsSection({ data, junior }: Props) {
  const map = useUpcomingByJunior(data);
  if (!map) return null; // ainda a carregar — não bloqueia o resto da ficha
  const regs = map.get(junior.id) ?? [];
  if (regs.length === 0) return null;

  return (
    <section style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "8px 0 10px", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: "var(--fs-14)", fontWeight: 700, color: "var(--text)" }}>
          📅 Próximos torneios
        </h3>
        <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
          {regs.length} {regs.length === 1 ? "inscrição" : "inscrições"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {regs.map((r) => (
          <a
            key={r.circuit + ":" + r.tournamentId}
            href={r.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "var(--bg-card)", border: "1px solid var(--border-light)",
              borderLeft: "3px solid var(--accent)", borderRadius: 6,
              padding: "8px 12px", textDecoration: "none", color: "inherit",
            }}
            title={`${r.name}${r.campo ? " · " + r.campo : ""}`}
          >
            <span style={{ fontSize: "var(--fs-11)", fontWeight: 700, color: "var(--text-2)", minWidth: 78 }}>
              {fmtDayMonthYear(r.date)}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: "var(--fs-13)", fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.name}
              </span>
              <span style={{ fontSize: "var(--fs-10)", color: "var(--text-3)" }}>
                {CIRCUIT_LABEL[r.circuit]}
                {r.escalao ? ` · ${r.escalao}` : ""}
                {r.campo ? ` · ${r.campo}` : ""}
              </span>
            </span>
            {r.status === "reserva" && (
              <span style={{
                fontSize: "var(--fs-9)", fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                background: "var(--bg-warn-orange, #fff7ed)", color: "var(--color-orange-deep, #c2410c)",
                border: "1px solid var(--color-amber, #f59e0b)", flexShrink: 0,
              }}>RESERVA</span>
            )}
            <span style={{ color: "var(--text-3)", fontSize: "var(--fs-13)", fontWeight: 600, flexShrink: 0 }}>↗</span>
          </a>
        ))}
      </div>
    </section>
  );
}
