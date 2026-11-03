/**
 * ToPar — o ±par e as diferenças de pancadas, com UMA regra de cor em todo o site
 * (03/11/2026): abaixo de zero verde, acima vermelho, zero sem cor.
 *   - kind "par"   → «−2» · «E» · «+3» (resultado contra o par)
 *   - kind "delta" → «−1.5» · «0» · «+0.8» (diferença: média, evolução, vs campo)
 *   - tone "neutral" → diferença sem juízo bom/mau (Comparar: azul ▲ / âmbar ▼, «=» no zero)
 * Sem valor → MUTED. Fica em `src/ui` para não haver mais spans pintados à mão.
 */
import type { ReactNode } from "react";
import { MUTED } from "./tableCells";
import { fmtToPar, fmtSign } from "../utils/format";
import { toParClass } from "../utils/scoreDisplay";

export default function ToPar({ v, kind = "par", digits, tone = "score", light, className, title, prefix, suffix }: {
  v: number | null | undefined;
  kind?: "par" | "delta";
  /** Casas decimais (médias). */
  digits?: number;
  tone?: "score" | "neutral";
  /** Sem negrito (texto corrido, notas entre parênteses). */
  light?: boolean;
  className?: string;
  title?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
}) {
  if (v == null || !Number.isFinite(v)) return MUTED;
  const isZero = digits != null ? Number(v.toFixed(digits)) === 0 : v === 0;
  const txt = tone === "neutral" && isZero ? "="
    : isZero ? (kind === "par" ? "E" : "0")
    : kind === "par" && digits == null ? fmtToPar(v) : fmtSign(v, digits);
  const cls = tone === "neutral" ? (isZero ? "tp-zero" : v > 0 ? "tp-up" : "tp-down") : isZero ? "tp-zero" : toParClass(v);
  return (
    <span className={`tp ${cls}${light ? " tp-light" : ""}${className ? " " + className : ""}`} title={title}>
      {prefix}{txt}{suffix}
    </span>
  );
}
