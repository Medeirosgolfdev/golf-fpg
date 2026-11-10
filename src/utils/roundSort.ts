/**
 * src/utils/roundSort.ts — ordenar VOLTAS de um jogador por coluna, num só sítio
 * (10/11/2026 — a mesma lista de casos estava em «Por data», «Por campo» e nas
 * «Últimas 20»). Vazios sempre no fim, nas duas direcções; uma volta «sem
 * cartão» (gross ≥ 900) conta como vazia no Gross.
 */
import type { RoundData } from "../data/playerDataLoader";
import { compareNullsLast, compareTextNullsLast } from "../hooks/useSort";
import { temCartao } from "./classificacao";

/** As colunas comuns das tabelas de voltas. */
export type RoundSortKey = "date" | "course" | "event" | "holes" | "hcp" | "tee" | "meters" | "gross" | "stb" | "sd";

const COLUNAS: ReadonlySet<string> = new Set(["date", "course", "event", "holes", "hcp", "tee", "meters", "gross", "stb", "sd"]);

/** É uma das colunas comuns? (As tabelas com colunas próprias tratam as suas e passam o resto.) */
export function isRoundSortKey(key: string): key is RoundSortKey {
  return COLUNAS.has(key);
}

/** Compara duas voltas pela coluna `key`; `dir` = 1 (asc) ou −1 (desc). Uma
 *  chave desconhecida ordena pela data. */
export function compareRoundBy<T extends RoundData & { course?: string | null }>(a: T, b: T, key: string, dir: 1 | -1): number {
  switch (key) {
    // (o campo só vem nas tabelas que juntam voltas de vários campos)
    case "course": return compareTextNullsLast(a.course, b.course, dir);
    case "event": return compareTextNullsLast(a.eventName, b.eventName, dir);
    case "tee": return compareTextNullsLast(a.tee, b.tee, dir);
    case "holes": return compareNullsLast(a.holeCount, b.holeCount, dir);
    case "hcp": return compareNullsLast(a.hi, b.hi, dir);
    case "meters": return compareNullsLast(a.meters || null, b.meters || null, dir);
    case "gross": return compareNullsLast(temCartao(a.gross) ? a.gross : null, temCartao(b.gross) ? b.gross : null, dir);
    case "stb": return compareNullsLast(a.stb, b.stb, dir);
    case "sd": return compareNullsLast(a.sd, b.sd, dir);
    default: return compareNullsLast(a.dateSort, b.dateSort, dir);
  }
}
