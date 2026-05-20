/**
 * evoColumns.tsx — Colunas + linha de resumo da evolução ano-a-ano (Resumo).
 *
 * Partilhado pelas páginas de circuito que comparam um torneio com a sua
 * edição anterior (Junior Orange Bowl no MAJOR, etc.). As 3 colunas (Ant. · Δ ·
 * Percurso) e a linha de análise são idênticas ao bloco que a BJGTPage usa
 * internamente; aqui ficam num módulo reutilizável.
 */
import React from "react";
import EvoBadge from "../EvoBadge";
import { fmtSign } from "../../utils/format";
import { SC } from "../../utils/scoreDisplay";
import type { MultiRoundRow, ExtraColumn } from "../multiRoundTypes";
import type { EvoEntry } from "../../hooks/useEvoComparison";

/** Tipo de linha do MultiRoundLeaderboard com posição calculada. */
export type EvoRowWithPos = MultiRoundRow & { _pos?: number | null };

/** Constrói as 3 colunas de evolução ano-a-ano (Ant. · Δ · Percurso). */
export function makeEvoCols(evo: Map<string, EvoEntry>, evoYear?: string): ExtraColumn<EvoRowWithPos>[] {
  return [
    {
      header: evoYear || "Ant.", className: "ta-c fs-11 fw-600",
      headerStyle: { width: 44, textAlign: "center" as const, padding: "0 3px", borderLeft: "2px solid var(--border)" },
      cell: (row: EvoRowWithPos) => { const ev = evo.get(row.name); return ev ? <span className="inline-sep">{fmtSign(ev.otherValue)}</span> : <span className="c-muted inline-sep">–</span>; },
    },
    {
      header: "Δ", className: "ta-c fs-11 fw-700", headerStyle: { width: 34, textAlign: "center" as const, padding: "0 3px" },
      cell: (row: EvoRowWithPos) => { const ev = evo.get(row.name); if (!ev) return <span className="c-muted">–</span>; return <span style={{ color: ev.delta < 0 ? "var(--good-dark)" : ev.delta > 0 ? SC.danger : "var(--text-3)" }}>{ev.delta > 0 ? "+" : ""}{ev.delta}</span>; },
    },
    {
      header: "Percurso", className: "ta-c", headerStyle: { width: 140, textAlign: "center" as const, padding: "0 4px" },
      cell: (row: EvoRowWithPos) => { const ev = evo.get(row.name); return ev ? <EvoBadge pill={ev.pill} from={ev.from} to={ev.to} /> : <EvoBadge pill="NEW" label="novo" />; },
    },
  ];
}

/** Linha de análise da evolução ano-a-ano (acima do leaderboard do Resumo). */
export function EvoSummaryLine({ evo, evoYear }: { evo: Map<string, EvoEntry>; evoYear: string }) {
  if (!evo.size) return null;
  const returning = [...evo.values()].filter((e) => e.delta !== 0);
  const improved = returning.filter((e) => e.delta < 0).length;
  return (
    <div className="lb-evo-summary">
      {evo.size} jogadores regressaram de {evoYear}{returning.length > 0 ? ` · ${improved}/${returning.length} melhoraram (±par)` : ""}
    </div>
  );
}
