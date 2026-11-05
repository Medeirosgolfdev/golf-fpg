/**
 * TierBadge — a etiqueta do Nível na geração, pelas pancadas do último ano (Elite · Forte · Sólido · Em
 * Desenv. · Iniciante), com as cores do Kids 2. Uma só peça: o ranking do
 * Kids 2 e o Scout dos circuitos.
 */
import { getTierColors, getTierLabel, type TierKey } from "../pages/kids2/juniorCalc";
import { Tint } from "./DataStyle";

/** Aviso do nível que assenta em poucas voltas do último ano. */
export const POUCAS_VOLTAS_TITULO = "Poucas voltas no último ano — o nível ainda é pouco seguro";

export default function TierBadge({ tier, title, incerto }: { tier: TierKey; title?: string; incerto?: boolean }) {
  const c = getTierColors(tier);
  return (
    <Tint className="tier-pill tier-pill-sm" bg={c.bg} fg={c.fg}
      title={incerto ? [title, POUCAS_VOLTAS_TITULO].filter(Boolean).join(" · ") : title}>
      {getTierLabel(tier)}{incerto ? " ?" : ""}
    </Tint>
  );
}
