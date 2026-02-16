/**
 * src/ui/TeePill.tsx
 *
 * Pill colorida com o nome do tee — resolve a cor automaticamente
 * via getTeeHex (que consulta scorecardMeta + courseColorCache + fallback por nome).
 *
 * Usado em JogadoresPage para rondas onde só temos o nome do tee.
 * CamposPage/SimuladorPage usam TeeBadge (dot + label) que é visualmente diferente.
 */

import { getTeeHex, textOnColor, teeBorder } from "../utils/teeColors";

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
    <span
      className="teePill"
      style={{ background: hx, color: fg, border: teeBorder(hx) }}
    >
      {name}
    </span>
  );
}
