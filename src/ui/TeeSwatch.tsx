/**
 * TeeSwatch — o quadradinho da cor do tee, o mesmo em todas as tabelas e
 * filtros. `size`: "sm" 9px (linhas de informação, filtros) · "md" 12px (colunas
 * de tee). Os tees muito claros (branco, amarelo) levam o contorno do
 * `teeBorder` (.tee-bd-claro); os outros o contorno suave de .tee-swatch. Antes eram 5 cópias à
 * mão com 8, 9, 10 e 12px.
 */
import { getTeeHex, teeBorder } from "../utils/teeColors";
import { Tint } from "./DataStyle";

export default function TeeSwatch({ tee, size = "sm", title }: { tee: string; size?: "sm" | "md"; title?: string }) {
  const hex = getTeeHex(tee);
  return <Tint className={`tee-swatch is-${size}${teeBorder(hex) ? " tee-bd-claro" : ""}`} title={title} bg={hex} />;
}
