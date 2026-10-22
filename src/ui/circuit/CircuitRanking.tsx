/**
 * src/ui/circuit/CircuitRanking.tsx — o RANKING como capacidade do CircuitShell
 * (`CircuitConfig.ranking`, 22/10/2026).
 *
 * Qualquer página de circuito pode ter uma vista «Ranking» ao lado dos torneios:
 * a página dá as LINHAS (calculadas a partir dos torneios que o shell mostra —
 * os filtros da página e do shell já lá estão) e as COLUNAS; a tabela é a peça
 * única `RankingTable` (ordenável por clique, o aspecto do EGR/WAGR). Opcional:
 * outras vistas sobre as mesmas linhas (grelha, evolução), um cabeçalho
 * (filtros próprios, KPIs) e o detalhe de uma linha.
 *
 * A aba «Época» do torneio usa a MESMA capacidade, com os torneios da época
 * (série/zona/ano do torneio aberto): a classificação acumulada fica por cima
 * da lista das etapas.
 *
 * Quem tem o ranking num ficheiro próprio, com filtros próprios (EGR, WAGR),
 * entrega só `render`.
 */
import React, { useMemo } from "react";
import { RankingTable, type RankingCol } from "../ranking/RankingPage";
import EmptyState from "../EmptyState";
import type { CircuitEntry } from "./types";

export interface CircuitRankingContext {
  /** Os torneios: na vista Ranking os visíveis; na «Época» os da época. */
  entries: CircuitEntry[];
  /** "view" = a vista Ranking; "season" = a aba «Época» do torneio aberto. */
  scope: "view" | "season";
  /** Na «Época»: o escalão/divisão aberto (rótulo), para a página escolher. */
  division?: string | null;
}

export interface CircuitRankingTable<R> {
  cols: RankingCol<R>[];
  rowKey: (r: R) => string;
  defaultSort: string;
  defaultDir: "asc" | "desc";
  tieBreak?: (a: R, b: R) => number;
  rowStyle?: (r: R) => React.CSSProperties | undefined;
  /** Páginas de 100. */
  paged?: boolean;
}

export interface CircuitRanking<R> {
  /** Chave da vista (vive no URL da página como as vistas «Info»). */
  key: string;
  /** Botão na barra (ou opção no menu Info com `inInfoMenu`). */
  label: string;
  inInfoMenu?: boolean;
  /** Conteúdo próprio (ranking de um ficheiro, com filtros próprios). */
  render?: () => React.ReactNode;
  /** As linhas a partir dos torneios. */
  rows?: (ctx: CircuitRankingContext) => R[];
  /** A tabela (fixa, ou a partir das linhas — ex.: a coluna «#» por pontos). */
  table?: CircuitRankingTable<R> | ((rows: R[], ctx: CircuitRankingContext) => CircuitRankingTable<R>);
  /** Vistas sobre as mesmas linhas; a que tem `table: true` é a RankingTable. */
  views?: { key: string; label: string; table?: boolean; render?: (rows: R[], ctx: CircuitRankingContext) => React.ReactNode }[];
  /** Vista activa (controlada pela página — URL). */
  view?: string;
  onView?: (key: string) => void;
  /** Acima da tabela (filtros próprios, KPIs, calendário). */
  header?: (rows: R[], ctx: CircuitRankingContext) => React.ReactNode;
  /** Detalhe de uma linha (aberto por clique), acima da tabela. */
  detail?: {
    selected: string | null;
    onSelect: (key: string | null) => void;
    render: (row: R, close: () => void) => React.ReactNode;
  };
  emptyMessage?: string;
  /** Título da secção na «Época» (sem ele, a «Época» não leva ranking). */
  seasonTitle?: (rows: R[], ctx: CircuitRankingContext) => React.ReactNode;
}

/** A vista (ou a secção da «Época») de um ranking com linhas. */
export function CircuitRankingView<R>({ ranking, ctx }: { ranking: CircuitRanking<R>; ctx: CircuitRankingContext }) {
  const rows = useMemo(() => ranking.rows?.(ctx) ?? [], [ranking, ctx]);
  const views = ranking.views ?? [{ key: "table", label: "Tabela", table: true }];
  const season = ctx.scope === "season";
  // Na «Época» só a tabela; na vista, a escolhida.
  const view = season ? views.find(v => v.table) ?? views[0] : views.find(v => v.key === ranking.view) ?? views[0];
  const table = typeof ranking.table === "function" ? ranking.table(rows, ctx) : ranking.table;
  const rowKey = table?.rowKey;
  const sel = !season && ranking.detail?.selected && rowKey ? rows.find(r => rowKey(r) === ranking.detail!.selected) : undefined;
  const onRowClick = !season && ranking.detail && rowKey
    ? (r: R) => ranking.detail!.onSelect(ranking.detail!.selected === rowKey(r) ? null : rowKey(r))
    : undefined;
  return (
    <div className="circuit-ranking">
      {season ? ranking.seasonTitle?.(rows, ctx) : ranking.header?.(rows, ctx)}
      {!season && views.length > 1 && (
        <div className="segmented-toggle circuit-ranking-views" role="tablist" aria-label="Vista">
          {views.map(v => (
            <button key={v.key} type="button" role="tab" aria-selected={v.key === view.key}
              className={"seg-btn" + (v.key === view.key ? " active" : "")}
              onClick={() => ranking.onView?.(v.key)}>
              <span className="seg-label">{v.label}</span>
            </button>
          ))}
        </div>
      )}
      {sel && ranking.detail!.render(sel, () => ranking.detail!.onSelect(null))}
      {rows.length === 0
        ? <EmptyState icon="🏅" message={ranking.emptyMessage ?? "Sem jogadores com resultados."} />
        : view.table && table
          ? <RankingTable rows={rows} cols={table.cols} rowKey={table.rowKey}
              defaultSort={table.defaultSort} defaultDir={table.defaultDir} tieBreak={table.tieBreak}
              rowStyle={table.rowStyle} paged={table.paged} onRowClick={onRowClick}
              rowTitle={onRowClick ? "Ver os resultados deste jogador" : undefined} />
          : view.render?.(rows, ctx)}
    </div>
  );
}

/** Uma capacidade `ranking` para a `CircuitConfig` (o shell não conhece o tipo das linhas). */
export function circuitRanking<R>(r: CircuitRanking<R>): CircuitRanking<unknown> {
  return r as unknown as CircuitRanking<unknown>;
}
