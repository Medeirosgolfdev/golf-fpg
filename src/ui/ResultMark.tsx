/**
 * ResultMark — marca de resultado de MATCH PLAY, partilhada por todo o site:
 *   🏆 vitória · ✗ derrota (vermelho) · ½ empate
 *
 * Usada na MatchplayView (brackets ETC no CircuitShell) e no 3-Way Match Play
 * do Campeonato Regional de Clubes (FPGPage), para o vocabulário visual ser o
 * MESMO em qualquer torneio de match play. `gap` é o espaço à direita (para a
 * marca respirar antes da bandeira/nome; 0 quando a marca está sozinha).
 */
import type { CSSProperties } from "react";

export type ResultMarkKind = "win" | "loss" | "half";

export default function ResultMark({ kind, gap = 6, style }: { kind: ResultMarkKind; gap?: number; style?: CSSProperties }) {
  const base: CSSProperties = { display: "inline-block", marginRight: gap, ...style };
  if (kind === "win") return <span style={base} title="Ganhou">🏆</span>;
  if (kind === "loss") return <span style={{ ...base, color: "var(--color-danger-dark, #b91c1c)", fontWeight: 700 }} title="Perdeu">✗</span>;
  return <span style={{ ...base, color: "var(--text-2)", fontWeight: 700 }} title="Empatado">½</span>;
}
