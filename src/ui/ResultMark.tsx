/**
 * ResultMark — marca de resultado de MATCH PLAY, partilhada por todo o site:
 *   🏆 vitória · ✗ derrota (vermelho) · ½ empate
 *
 * Usada na MatchplayView (brackets ETC no CircuitShell) e no 3-Way Match Play
 * do Campeonato Regional de Clubes (FPGPage), para o vocabulário visual ser o
 * MESMO em qualquer torneio de match play. `gap` é o espaço à direita (para a
 * marca respirar antes da bandeira/nome; 0 quando a marca está sozinha).
 * Aspecto nas classes `.rm-*` (App.css).
 */
export type ResultMarkKind = "win" | "loss" | "half";

export default function ResultMark({ kind, gap = 6, className }: { kind: ResultMarkKind; gap?: 0 | 4 | 6; className?: string }) {
  const cls = `rm-mark rm-gap-${gap}${className ? " " + className : ""}`;
  if (kind === "win") return <span className={cls} title="Ganhou">🏆</span>;
  if (kind === "loss") return <span className={cls + " rm-loss"} title="Perdeu">✗</span>;
  return <span className={cls + " rm-half"} title="Empatado">½</span>;
}
