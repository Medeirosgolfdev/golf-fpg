import { anoEscalao, fmtSign } from "../utils/format";
import { escCls } from "../utils/playerUtils";

const ESC_COM_COR = new Set(["sub10", "sub12", "sub14", "sub16", "sub18", "sub21", "sub24"]);

/** Ano de nascimento no tom do escalão (as cores --esc-subNN-* do tokens.css,
 *  as mesmas das pílulas de escalão): 2.º ano com a cor cheia, 1.º ano com a
 *  cor clara e contorno (23/10/2026 — antes era verde/vermelho). */
export function AnoEscalaoPill({ dob, escalao, data }: { dob: string; escalao: string; /** Data (ou ano) da prova; sem ela, o ano de hoje. */ data?: string | number | null }) {
  if (!dob) return null;
  const anoNasc = dob.slice(0, 4);
  const isUltimo = anoEscalao(dob, escalao, data) === "2A";
  const k = escCls(escalao || "");
  const cor = ESC_COM_COR.has(k);
  // Cores em .ano-esc-pill (+ .ae-subNN · .ult) no App.css; sem escalão com cor → cinzento.
  return (
    <span title={isUltimo ? `${anoNasc} — 2.º ano do escalão` : `${anoNasc} — 1.º ano do escalão`}
      className={"ano-esc-pill" + (cor ? " ae-" + k : "") + (isUltimo ? " ult" : "")}>
      {anoNasc}
    </span>
  );
}

export function TrendBadge({ trend, delta }: { trend: string | null; delta: number | null }) {
  if (!trend || trend === "stable") return <span className="muted fs-11" >–</span>;
  const up = trend === "up";
  return (
    <span className={`u-fw-700 u-fs-fs-13 ${up ? "tone-good" : "tone-bad"}`}
      title={delta != null ? `${fmtSign(delta, 1)} (3m)` : ""}>
      {up ? "↓" : "↑"}
    </span>
  );
}
