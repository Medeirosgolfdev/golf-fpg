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

export default function TeePill({ name, hex }: Props) {
  if (!name) return null;
  const hx = hex || getTeeHex(name);
  const fg = textOnColor(hx);
  return (
    <Tint className={teeBorder(hx) ? "p p-tee tee-bd-claro" : "p p-tee"} bg={hx} fg={fg}>
      {name}
    </Tint>
  );
}
