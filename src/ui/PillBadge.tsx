/**
 * src/ui/PillBadge.tsx
 *
 * Pill de tipo de torneio: REGIONAL, NACIONAL, INTL, PJA.
 * Normaliza variantes ("AWAY", "AWAY INTL", "INTERNACIONAL" → "INTL").
 *
 * Usa sistema unificado de pills: .p .p-sm .p-tourn .p-{cor}
 */

const PILL_CLASSES: Record<string, string> = {
  REGIONAL: "p p-sm p-tourn p-regional",
  NACIONAL: "p p-sm p-tourn p-nacional",
  INTL: "p p-sm p-tourn p-intl",
  PJA: "p p-sm p-tourn p-pja",
};

/** Normaliza o valor da pill para uma das chaves conhecidas */
function normalizePill(raw: string): string {
  const p = raw.trim().toUpperCase();
  if (p === "AWAY" || p === "AWAY INTL" || p === "INTERNACIONAL" || p === "INTERN") return "INTL";
  return p;
}

type Props = {
  /** Valor da pill (e.g. "REGIONAL", "NACIONAL", "INTL", "AWAY", "INTERNACIONAL", "PJA") */
  pill?: string;
};

export default function PillBadge({ pill }: Props) {
  if (!pill) return null;
  const normalized = normalizePill(pill);
  const cls = PILL_CLASSES[normalized];
  if (!cls) return null;
  const label = normalized === "INTL" ? `🌍 ${normalized}`
    : normalized === "NACIONAL" ? `🇵🇹 ${normalized}`
    : normalized;
  return <span className={cls}>{label}</span>;
}
