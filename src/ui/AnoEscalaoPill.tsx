import { anoEscalao } from "../utils/format";

export function AnoEscalaoPill({ dob, escalao }: { dob: string; escalao: string }) {
  if (!dob) return null;
  const anoNasc = dob.slice(0, 4);
  const isUltimo = anoEscalao(dob, escalao) === "2A";
  return (
    <span title={isUltimo ? `${anoNasc} — 2o ano` : `${anoNasc} — 1o ano`}
      style={{ fontSize: "var(--fs-9)", fontWeight: 700, padding: "1px 5px", borderRadius: 3, lineHeight: 1.4,
        background: isUltimo ? "var(--color-bad)" : "var(--color-good)", color: "#fff", flexShrink: 0 }}>
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
