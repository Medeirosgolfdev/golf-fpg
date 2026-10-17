/**
 * evo.tsx — a evolução ano-a-ano dos torneios com várias edições (BJGT/EOWAGR,
 * Junior Orange Bowl, Future Masters, Doral): o resumo por cima do Resumo, as
 * colunas Ant. · Δ · Percurso e a marcação dos regressados. Cada página só
 * constrói o seu mapa de evolução (`buildEvoMap` ou o histórico da Doral).
 */
import { SC } from "../utils/scoreDisplay";
import { fmtSign } from "../utils/format";
import EvoBadge from "./EvoBadge";
import type { MultiRoundRow, ExtraColumn } from "./multiRoundTypes";
import type { EvoEntry } from "../hooks/useEvoComparison";

/** «N jogadores regressaram de 2025 · 7/12 melhoraram (±par)». */
export function EvoSummary({ evo, what, detail, metric }: {
  evo: ReadonlyMap<string, { delta: number }>;
  /** O que fizeram (ex.: «regressaram de 2025», «já passaram pelo Doral»). */
  what: string;
  /** Entre parênteses depois do `what` (ex.: «3 c/ 1 edição, 2 c/ 2»). */
  detail?: string;
  /** O que se compara (ex.: «±par»). */
  metric?: string;
}) {
  if (!evo.size) return null;
  const returning = [...evo.values()].filter(e => e.delta !== 0);
  const improved = returning.filter(e => e.delta < 0).length;
  return (
    <div className="lb-evo-summary">
      {evo.size} jogadores {what}{detail ? ` (${detail})` : ""}
      {returning.length > 0 ? ` · ${improved}/${returning.length} melhoraram${metric ? ` (${metric})` : ""}` : ""}
    </div>
  );
}

/** Marca cada jogador com _regressado (está no mapa de evolução) e _subiu
 *  (mudou de escalão para cima) — os toggles do CircuitShell lêem-nos. */
export function tagEvo(
  results: { players: { name: string }[] },
  evo: ReadonlyMap<string, { pill: string }> | null | undefined,
): void {
  if (!evo || evo.size === 0) return;
  for (const pl of results.players) {
    const ev = evo.get(pl.name);
    if (ev) {
      (pl as unknown as { _regressado?: boolean })._regressado = true;
      if (ev.pill === "UP") (pl as unknown as { _subiu?: boolean })._subiu = true;
    }
  }
}

/** Tipo de linha do MultiRoundLeaderboard com posição calculada. */
export type EvoRowWithPos = MultiRoundRow & { _pos?: number | null };

/** As 3 colunas de evolução ano-a-ano (Ant. · Δ · Percurso). */
export function makeEvoCols(evo: Map<string, EvoEntry>, evoYear?: string): ExtraColumn<EvoRowWithPos>[] {
  return [
    {
      // ⚠ O separador do grupo de evolução é bordo da COLUNA (`lb-col-divider`,
      // aplicado ao th E ao td), não um border-left num <span> dentro da célula:
      // assim é uma linha vertical contínua da tabela, em vez de um traço curto
      // à altura do texto, colado ao número e diferente em cada linha.
      header: evoYear || "Ant.", className: "ta-c fs-11 fw-600 lb-col-divider",
      headerStyle: { width: 44, textAlign: "center" as const, padding: "0 3px" },
      cell: (row: EvoRowWithPos) => { const ev = evo.get(row.name); return ev ? <span>{fmtSign(ev.otherValue)}</span> : <span className="c-muted">–</span>; },
    },
    {
      header: "Δ", className: "ta-c fs-11 fw-700", headerStyle: { width: 34, textAlign: "center" as const, padding: "0 3px" },
      cell: (row: EvoRowWithPos) => { const ev = evo.get(row.name); if (!ev) return <span className="c-muted">–</span>; return <span style={{ color: ev.delta < 0 ? "var(--good-dark)" : ev.delta > 0 ? SC.danger : "var(--text-3)" }}>{ev.delta > 0 ? "+" : ""}{ev.delta}</span>; },
    },
    {
      header: "Percurso", className: "ta-c", headerStyle: { width: 140, textAlign: "center" as const, padding: "0 4px" },
      cell: (row: EvoRowWithPos) => { const ev = evo.get(row.name); return ev ? <EvoBadge pill={ev.pill} from={ev.from} to={ev.to} /> : <EvoBadge pill="NEW" label={evoYear === "2026" ? "não voltou" : "novo"} />; },
    },
  ];
}
