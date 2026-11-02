/**
 * TierBadge — a etiqueta do nível na carreira (Elite · Forte · Sólido · Em
 * Desenv. · Iniciante), com as cores do Kids 2. Uma só peça: o ranking do
 * Kids 2 e o Scout dos circuitos.
 */
import { getTierColors, getTierLabel, type TierKey } from "../pages/kids2/juniorCalc";

export default function TierBadge({ tier, title }: { tier: TierKey; title?: string }) {
  const c = getTierColors(tier);
  return (
    <span className="tier-pill tier-pill-sm" style={{ background: c.bg, color: c.fg }} title={title}>
      {getTierLabel(tier)}
    </span>
  );
}
