/**
 * src/ui/TeeDate.tsx
 *
 * Data abreviada (DD-MM) com fundo colorido do tee.
 * Resolve a cor automaticamente via getTeeHex.
 */

import { getTeeHex, textOnColor, teeBorder } from "../utils/teeColors";
import { shortDate } from "../utils/format";
import { Tint } from "./DataStyle";

type Props = {
  date: string;
  tee: string;
  /** Cor hex explícita — se fornecida, usa directamente */
  hex?: string;
};

export default function TeeDate({ date, tee, hex }: Props) {
  const hx = hex || getTeeHex(tee);
  const fg = textOnColor(hx);
  return (
    <Tint className={teeBorder(hx) ? "tee-date tee-bd-claro" : "tee-date"} bg={hx} fg={fg}>
      {shortDate(date)}
    </Tint>
  );
}
