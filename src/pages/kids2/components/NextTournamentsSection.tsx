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
    <section className="u-mb-4px">
      <div className="u-d-flex u-ai-baseline u-jc-space-between u-m-8px-0-10px u-gap-8px">
        <h3 className="u-m-0 u-fs-fs-14 u-fw-700 u-c-text">
          📅 Próximos torneios
        </h3>
        <span className="u-fs-fs-11 u-c-text-3">
          {regs.length} {regs.length === 1 ? "inscrição" : "inscrições"}
        </span>
      </div>

      <div className="u-d-flex u-fd-column u-gap-6px">
        {regs.map((r) => (
          <a
            key={r.circuit + ":" + r.tournamentId}
            href={r.link}
            target="_blank"
            rel="noopener noreferrer"
            className="u-d-flex u-ai-center u-gap-10px u-bg-bg-card u-bd-1px-solid-border-light u-bl-3px-solid-accent u-br-radius u-p-8px-12px u-td-none u-c-inherit"
            title={`${r.name}${r.campo ? " · " + r.campo : ""}`}
          >
            <span className="u-fs-fs-11 u-fw-700 u-c-text-2 u-minw-78px">
              {fmtDayMonthYear(r.date)}
            </span>
            <span className="u-fl-1 u-minw-0">
              <span className="u-d-block u-fs-fs-13 u-fw-600 u-c-text u-ov-hidden u-tov-ellipsis u-ws-nowrap">
                {r.name}
              </span>
              <span className="u-fs-fs-10 u-c-text-3">
                {CIRCUIT_LABEL[r.circuit]}
                {r.escalao ? ` · ${r.escalao}` : ""}
                {r.campo ? ` · ${r.campo}` : ""}
              </span>
            </span>
            {r.status === "reserva" && (
              <span className="u-fs-fs-9 u-fw-700 u-p-1px-6px u-br-3px u-bg-var-bg-warn-orange-fff7ed u-c-var-color-orange-deep-c2410c u-bd-ltbl9 u-fsh-0">RESERVA</span>
            )}
            <span className="u-c-text-3 u-fs-fs-13 u-fw-600 u-fsh-0">↗</span>
          </a>
        ))}
      </div>
    </section>
  );
}
