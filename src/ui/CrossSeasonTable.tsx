/**
 *
 * ═══════════════════════════════════════════════════════════════
 * FAMÍLIA DE TABELAS — MANTER SEMPRE EM SINCRONIA
 * ═══════════════════════════════════════════════════════════════
 * Este ficheiro faz parte de uma família de componentes de tabela
 * que partilham as mesmas regras visuais (App.css: .sc-lb):
 *
 *   • ScorecardLeaderboard.tsx   — leaderboard buraco-a-buraco
 *   • MultiRoundLeaderboard.tsx  — leaderboard multi-ronda
 *   • CrossSeasonTable.tsx       — tabela temporada cruzada
 *   • tournamentPrimitives.tsx   — primitivas partilhadas
 *
 * Ao alterar qualquer um, verifica se os outros precisam de ser
 * actualizados: fontes, padding, bordas, cores, larguras de colunas.
 * ═══════════════════════════════════════════════════════════════
 * CrossSeasonTable.tsx — Tabela temporada cruzada: jogadores × torneios
 *
 * Utilizada por ResumoTable (Drive Tour/Challenge/Aquapor) e TournamentGrid (Sub-12).
 * Não contém lógica de dados nem sort — apenas renderiza a estrutura HTML/CSS partilhada.
 *
 * Estrutura de colunas:
 *   [# | Jogador | Fed | Esc | Clube | HCP] | [T1: #|Gross|±|SD|🐦|Par|■] ... | [Resumo temporada]
 *
 * ─── Uso típico ──────────────────────────────────────────────────────────────
 *
 *   <CrossSeasonTable
 *     identityHeaders={<>
 *       <SortTh k="name" s={s} d={d} on={onSort} className="cs-pos sticky-col-0">#</SortTh>
 *       ...
 *     </>}
 *     groups={visibleTournaments.map(t => ({
 *       key: t.key,
 *       headerTh: <th className="cs-grp" colSpan={7}>...</th>,
 *       subHeaderThs: <>
 *         <SortTh k={"pos_"+t.key} s={s} d={d} on={onSort} className="cs-t-pos cs-grp">...</SortTh>
 *         ...
 *       </>,
 *     }))}
 *     summaryGroupTh={<th className="cs-grp" colSpan={N}>Temporada</th>}
 *     summarySubHeaders={<>...</>}
 *   >
 *     {rows.map(row => <tr key={row.key}>...</tr>)}
 *   </CrossSeasonTable>
 */
import React from "react";

/* ── SortTh exportado ───────────────────────────────────────────────────────
   Reutilizável em qualquer tabela ordenável.                                */
export interface SortThProps {
  /** Chave de sort que este th activa */
  k: string;
  /** Chave de sort activa */
  s: string;
  /** Direcção de sort activa */
  d: "asc" | "desc";
  on: (k: string) => void;
  className?: string;
  colSpan?: number;
  children: React.ReactNode;
}

export function SortTh({ k, s, d, on, className, colSpan, children }: SortThProps) {
  const active = s === k;
  return (
    <th
      colSpan={colSpan}
      className={"cs-sortable " + (className || "")}
      onClick={() => on(k)}
    >
      {children}
      {active && <span className="sort-arrow">{d === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

/* ── Interface ──────────────────────────────────────────────────────────────*/

export interface CSGroup {
  key: string;
  /** <th> completo do grupo na linha 1 (inclui colSpan, botão expand, etc.) */
  headerTh: React.ReactNode;
  /** 7 <th> de sub-colunas na linha 2 */
  subHeaderThs: React.ReactNode;
}

interface CrossSeasonTableProps {
  /**
   * 6 <th> de identidade fixa na linha 2:
   *   # (sticky-col-0) · Jogador (sticky-col-1) · Fed · Esc · Clube · HCP (.cs-id-end)
   */
  identityHeaders: React.ReactNode;
  /** Grupos de torneios — cada um produz um <th> de grupo e 7 <th> de sub-colunas */
  groups: CSGroup[];
  /** <th> de grupo do resumo de temporada (linha 1, com cs-grp) */
  summaryGroupTh: React.ReactNode;
  /** <th> de sub-colunas do resumo (linha 2) */
  summarySubHeaders: React.ReactNode;
  /** Linhas da tbody */
  children: React.ReactNode;
}

/* ── Componente ─────────────────────────────────────────────────────────────*/

export function CrossSeasonTable({
  identityHeaders,
  groups,
  summaryGroupTh,
  summarySubHeaders,
  children,
}: CrossSeasonTableProps) {
  return (
    <div className="bjgt-chart-scroll">
      <table className="cs-table">
        <thead>
          {/* Linha 1 — cabeçalhos de grupo */}
          <tr className="cs-grp-row">
            <td className="cs-grp-spacer sticky-col-0" />
            <td className="cs-grp-spacer sticky-col-1" colSpan={5} />
            {groups.map(g => (
              <React.Fragment key={g.key}>{g.headerTh}</React.Fragment>
            ))}
            {summaryGroupTh}
          </tr>
          {/* Linha 2 — cabeçalhos de coluna */}
          <tr>
            {identityHeaders}
            {groups.map(g => (
              <React.Fragment key={g.key}>{g.subHeaderThs}</React.Fragment>
            ))}
            {summarySubHeaders}
          </tr>
        </thead>
        <tbody>
          {children}
        </tbody>
      </table>
    </div>
  );
}
