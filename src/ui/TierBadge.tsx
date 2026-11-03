/**
 * TierBadge — a etiqueta do nível na carreira (Elite · Forte · Sólido · Em
 * Desenv. · Iniciante), com as cores do Kids 2. Uma só peça: o ranking do
 * Kids 2 e o Scout dos circuitos.
 */
import { getTierColors, getTierLabel, type TierKey } from "../pages/kids2/juniorCalc";
import { Tint } from "./DataStyle";

export default function TierBadge({ tier, title }: { tier: TierKey; title?: string }) {
  const c = getTierColors(tier);
  return (
    <Tint className="tier-pill tier-pill-sm" bg={c.bg} fg={c.fg} title={title}>
      {getTierLabel(tier)}
    </Tint>
  );
}
