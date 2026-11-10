/**
 * PosMedal — o selo pequeno do lugar numa grelha: «3.º» com a cor do pódio
 * (.pos-medal-1/2/3; neutro fora dele) e, opcionalmente, «/N» jogadores.
 *
 * Uma só peça (10/11/2026) para o que o Scout, a «Época» da /drive e as
 * «Edições anteriores» escreviam cada um à mão. O lugar é SEMPRE o do jogador
 * (com empates: dois 1.ºs são dois selos dourados) — nunca o número da linha.
 * Sem lugar → `empty` (por omissão o traço esbatido das tabelas).
 */
import type { ReactNode } from "react";
import { fmtOrd } from "../utils/format";
import { medalClass } from "./PosBadge";
import { MUTED } from "./tableCells";

export default function PosMedal({ pos, field, title, empty = MUTED }: {
  /** Lugar do jogador (1 = 1.º); null/undefined = sem lugar. */
  pos: number | null | undefined;
  /** Jogadores da prova — mostra «3.º/42». */
  field?: number | null;
  title?: string;
  /** O que mostrar sem lugar. */
  empty?: ReactNode;
}) {
  if (pos == null) return <>{empty}</>;
  return (
    <span className={"pos-medal pos-medal-sm " + medalClass(pos)} title={title}>
      {fmtOrd(pos)}{field ? <span className="scout-field">/{field}</span> : null}
    </span>
  );
}
