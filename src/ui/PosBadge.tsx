/** Classe de cor do selo de posição (.pos-medal-1/2/3; -n fora do pódio). */
export function medalClass(pos: number): string {
  return pos >= 1 && pos <= 3 ? "pos-medal-" + pos : "pos-medal-n";
}

/** Badge de posição com medalha no pódio (1º/2º/3º) e cor neutra no resto.
 *  Partilhado por AtletaSearchPanel e SantoDaSerraPanel; o Kids 2 usa as
 *  mesmas classes (.pos-medal) com o rótulo «🏆 #N». */
export default function PosBadge({ pos }: { pos: number }) {
  const label = pos === 1 ? "🥇 1º" : pos === 2 ? "🥈 2º" : pos === 3 ? "🥉 3º" : pos + "º";
  return <span className={"pos-medal " + medalClass(pos)}>{label}</span>;
}
