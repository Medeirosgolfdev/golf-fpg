/**
 * src/ui/TeePill.tsx
 *
 * Pill colorida com o nome do tee — resolve a cor automaticamente
 * via getTeeHex (que consulta scorecardMeta + courseColorCache + fallback por nome).
 *
 * Usa sistema unificado: .p .p-tee (radius 12px)
 * Cores aplicadas inline via getTeeHex() + textOnColor().
 */

import { getTeeHex, textOnColor, teeBorder } from "../utils/teeColors";
import { Tint } from "./DataStyle";

type Props = {
  /** Nome do tee (e.g. "Amarelas", "Whites") */
  name: string;
  /** Cor hex explícita — se fornecida, usa directamente em vez de resolver pelo nome */
  hex?: string;
};

/** Nomes compridos (ex. «U12 Garçons (Azuis+Vermelhas)» das provas importadas)
 *  ficam só com a 1.ª palavra («U12»); o nome inteiro vai para o rollover. */
const MAX_TEE_LABEL = 12;
function shortTeeLabel(name: string): string {
  const n = name.trim();
  if (n.length <= MAX_TEE_LABEL) return n;
  return n.split(/\s+/)[0] || n;
}

export default function TeePill({ name, hex }: Props) {
  if (!name) return null;
  const hx = hex || getTeeHex(name);
  const fg = textOnColor(hx);
  const label = shortTeeLabel(name);
  return (
    <Tint className={teeBorder(hx) ? "p p-tee tee-bd-claro" : "p p-tee"} bg={hx} fg={fg} title={label !== name.trim() ? name : undefined}>
      <span className="p-tee-txt">{label}</span>
    </Tint>
  );
}
