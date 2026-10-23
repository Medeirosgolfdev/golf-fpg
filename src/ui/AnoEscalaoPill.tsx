import { anoEscalao } from "../utils/format";
import { escCls } from "../utils/playerUtils";

const ESC_COM_COR = new Set(["sub10", "sub12", "sub14", "sub16", "sub18", "sub21", "sub24"]);

/** Ano de nascimento no tom do escalão (as cores --esc-subNN-* do tokens.css,
 *  as mesmas das pílulas de escalão): 2.º ano com a cor cheia, 1.º ano com a
 *  cor clara e contorno (23/10/2026 — antes era verde/vermelho). */
export function AnoEscalaoPill({ dob, escalao }: { dob: string; escalao: string }) {
  if (!dob) return null;
  const anoNasc = dob.slice(0, 4);
  const isUltimo = anoEscalao(dob, escalao) === "2A";
  const k = escCls(escalao || "");
  const cor = ESC_COM_COR.has(k);
  const bg = cor ? `var(--esc-${k}-bg)` : "var(--text-3)";
  return (
    <span title={isUltimo ? `${anoNasc} — 2.º ano do escalão` : `${anoNasc} — 1.º ano do escalão`}
      style={{ fontSize: "var(--fs-9)", fontWeight: 700, padding: "1px 5px", borderRadius: 3, lineHeight: 1.4, flexShrink: 0,
        border: `1px solid ${bg}`,
        background: isUltimo ? bg : `color-mix(in srgb, ${bg} 22%, transparent)`,
        color: isUltimo ? (cor ? `var(--esc-${k}-fg)` : "#fff") : `color-mix(in srgb, ${bg} 70%, var(--text))` }}>
      {anoNasc}
    </span>
  );
}

export function TrendBadge({ trend, delta }: { trend: string | null; delta: number | null }) {
  if (!trend || trend === "stable") return <span className="muted fs-11" >–</span>;
  const up = trend === "up";
  return (
    <span style={{ color: up ? "var(--color-good)" : "var(--color-bad)", fontWeight: 700, fontSize: "var(--fs-13)" }}
      title={delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)} (3m)` : ""}>
      {up ? "↓" : "↑"}
    </span>
  );
}
