import { MUTED } from "./tableCells";

import { fmtOrd } from "../utils/format";
/** Classe de cor do selo de posição (.pos-medal-1/2/3; -n fora do pódio). */
export function medalClass(pos: number): string {
  return pos >= 1 && pos <= 3 ? "pos-medal-" + pos : "pos-medal-n";
}

/** Badge de posição com medalha no pódio (1.º/2.º/3.º) e cor neutra no resto.
 *  Partilhado por AtletaSearchPanel e SantoDaSerraPanel; o Kids 2 usa as
 *  mesmas classes (.pos-medal) com o rótulo «🏆 #N». */
export default function PosBadge({ pos }: { pos: number }) {
  const label = (pos === 1 ? "🥇 " : pos === 2 ? "🥈 " : pos === 3 ? "🥉 " : "") + fmtOrd(pos);
  return <span className={"pos-medal " + medalClass(pos)}>{label}</span>;
}

/** Posição do Kids 2: pódio com selo «🏆 #N», resto «#N», sem posição «—».
 *  Uma só peça (antes 4 versões: PosBadge/PosBadgeSmall/PosTrophy/à mão). */
export function TrophyPos({ pos, small }: { pos: number | null | undefined; small?: boolean }) {
  if (typeof pos !== "number") return MUTED;
  if (pos <= 3) return <span className={"pos-medal " + medalClass(pos) + (small ? " pos-medal-sm" : "")}>🏆 #{pos}</span>;
  return <span className="pos-plain">#{pos}</span>;
}
