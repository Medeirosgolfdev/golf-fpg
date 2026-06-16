/**
 * src/ui/ListaTabela.tsx
 *
 * Tabela de lista ÚNICA, partilhada pelas vistas do Jogador (Por data, Por
 * campo, Por torneio) e potencialmente outras. Config por colunas: cada vista
 * passa as SUAS colunas (label, alinhamento, sortable, largura, render) + as
 * linhas. O cromo (card · scroll-x · dtable-lg · cabeçalho ordenável · linhas
 * expansíveis) é o mesmo em todas — assim a única diferença real entre vistas
 * são as colunas/dados, não o estilo.
 */
import React from "react";
import SortableHdr from "./SortableHdr";

export interface ListaColuna<T> {
  /** Chave de ordenação (e key React). */
  key: string;
  label: React.ReactNode;
  align?: "left" | "right";
  sortable?: boolean;
  /** Largura CSS da <col> aplicada inline (ex: "64px"). Colunas sem largura
   *  partilham o espaço restante (sob table-layout: fixed). */
  width?: string;
  /** Classe extra no <th>/<td> desta coluna. */
  cellClassName?: string;
  render: (row: T) => React.ReactNode;
}

interface ListaTabelaProps<T> {
  columns: ListaColuna<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (k: string) => void;
  minWidth?: number;
  /** Key da linha expandida (ou null). */
  expandedKey?: string | null;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T, open: boolean) => string | undefined;
  /** Conteúdo expandido (scorecard, detalhe…) por baixo da linha. */
  renderExpanded?: (row: T) => React.ReactNode;
  /** Separador opcional ANTES de uma linha (ex: barra de ano). */
  separatorBefore?: (row: T, prev: T | undefined) => React.ReactNode | null;
  /** Linha de rodapé opcional (TOTAL). */
  footer?: React.ReactNode;
  /** Sem o wrapper .card (quando a tabela já vive dentro de um card). */
  noCard?: boolean;
}

export default function ListaTabela<T>({
  columns, rows, rowKey, sortKey, sortDir, onSort, minWidth,
  expandedKey, onRowClick, rowClassName, renderExpanded, separatorBefore, footer, noCard,
}: ListaTabelaProps<T>) {
  const hasWidths = columns.some(c => c.width);
  const tableStyle: React.CSSProperties = {};
  if (minWidth) tableStyle.minWidth = minWidth;
  if (hasWidths) tableStyle.tableLayout = "fixed";
  const inner = (
    <div className="scroll-x">
        <table className="dtable-lg" style={tableStyle}>
          {hasWidths && (
            <colgroup>
              {columns.map(c => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}
            </colgroup>
          )}
          <thead>
            <tr>
              {columns.map(c => {
                const cls = [c.align === "right" ? "r" : "", c.cellClassName || ""].filter(Boolean).join(" ") || undefined;
                return c.sortable
                  ? <SortableHdr key={c.key} k={c.key} sortKey={sortKey} sortDir={sortDir} onSort={onSort} className={cls}>{c.label}</SortableHdr>
                  : <th key={c.key} className={cls}>{c.label}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const k = rowKey(row);
              const open = expandedKey != null && expandedKey === k;
              const sep = separatorBefore?.(row, rows[i - 1]);
              const expanded = open && renderExpanded ? renderExpanded(row) : null;
              return (
                <React.Fragment key={k}>
                  {sep && (
                    <tr>
                      <td colSpan={columns.length} style={{ padding: 0, background: "transparent", borderBottom: "2px solid var(--border)" }}>{sep}</td>
                    </tr>
                  )}
                  <tr
                    className={rowClassName?.(row, open)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    style={onRowClick ? { cursor: "pointer" } : undefined}
                  >
                    {columns.map(c => {
                      const cls = [c.align === "right" ? "r" : "", c.cellClassName || ""].filter(Boolean).join(" ") || undefined;
                      return <td key={c.key} className={cls}>{c.render(row)}</td>;
                    })}
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={columns.length} className="bg-page p-0">{expanded}</td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
          {footer && <tfoot>{footer}</tfoot>}
        </table>
      </div>
  );
  return noCard ? inner : <div className="card">{inner}</div>;
}
