/**
 * src/ui/PillBadge.tsx
 *
 * Pill de tipo de torneio: REGIONAL, NACIONAL, INTL.
 * Normaliza variantes ("AWAY", "AWAY INTL", "INTERNACIONAL" → "INTL").
 *
 * Usado por JogadoresPage (dados do pipeline) e CamposPage (campos away).
 * Estilos em App.css: .pill-torneio, .pill-regional, .pill-nacional, .pill-intl
 */

const PILL_CLASSES: Record<string, string> = {
  REGIONAL: "pill-torneio pill-regional",
  NACIONAL: "pill-torneio pill-nacional",
  INTL: "pill-torneio pill-intl",
};

/** Normaliza o valor da pill para uma das chaves conhecidas */
function normalizePill(raw: string): string {
  const p = raw.trim().toUpperCase();
  if (p === "AWAY" || p === "AWAY INTL" || p === "INTERNACIONAL") return "INTL";
  return p;
}

type Props = {
  /** Valor da pill (e.g. "REGIONAL", "NACIONAL", "INTL", "AWAY", "INTERNACIONAL") */
  pill?: string;
};

export default function PillBadge({ pill }: Props) {
  if (!pill) return null;
  const normalized = normalizePill(pill);
  const cls = PILL_CLASSES[normalized];
  if (!cls) return null;
  return <span className={cls}>{normalized === "INTL" ? `🌍 ${normalized}` : normalized}</span>;
}
