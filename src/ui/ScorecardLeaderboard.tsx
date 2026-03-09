/**
 * ScorecardLeaderboard.tsx — Leaderboard scorecard buraco-a-buraco.
 *
 * Ordem de colunas (mockup final):
 *   # | Jogador | [prefix: ESC·FED·Clube·HCP·Tee] | ±Par | Tot | 1…9 | Out | 10…18 | In | [postScorecard: SD·🐦·Par·■]
 *
 * Notas:
 *  – ±Par (lb-topar) vem ANTES de Tot (lb-gross).
 *  – Tot tem background accent-light via CSS.
 *  – ±Par tem border-left espessa (2px) via CSS.
 *  – SD e estatísticas vêm APÓS o scorecard (postScorecardCells).
 */
import React from "react";
import { scClass } from "../utils/scoreDisplay";
import { fmtToPar } from "../utils/format";

function tpColor(v: number): string | undefined {
  if (v < 0) return "var(--color-danger)";
  if (v === 0) return "var(--color-good)";
  return undefined;
}

export interface ScorecardRow {
  key: string | number;
  pos: React.ReactNode;
  gross: number;
  toPar: number;
  scores?: number[];
  rowBg?: string;
  nameContent: React.ReactNode;
  /** <td> entre Jogador e ±Par — usar classes .lb-esc .lb-fed .lb-club .lb-hcp .lb-tee */
  prefixCells?: React.ReactNode;
  /** <td> após In (fim do scorecard) — usar classes .lb-sd .lb-bird .lb-par-stat .lb-bog */
  postScorecardCells?: React.ReactNode;
  /** @deprecated use postScorecardCells */
  postTotalCells?: React.ReactNode;
}

interface ScorecardLeaderboardProps {
  par: number[];
  si?: number[];
  rows: ScorecardRow[];
  prefixHeaderCells?: React.ReactNode;
  /** Headers após In (SD, 🐦, Par, ■) */
  postScorecardHeaderCells?: React.ReactNode;
  /** @deprecated use postScorecardHeaderCells */
  postTotalHeaderCells?: React.ReactNode;
  parLabelColSpan?: number;
  postTotalColCount?: number;
  showScorecard: boolean;
  onToggleScorecard?: () => void;
  metaLine?: React.ReactNode;
  filterBar?: React.ReactNode;
  onSortPos?: () => void;
  onSortName?: () => void;
  activeSortKey?: string;
  activeSortDir?: "asc" | "desc";
}

export function ScorecardLeaderboard({
  par, si, rows,
  prefixHeaderCells,
  postScorecardHeaderCells, postTotalHeaderCells,
  parLabelColSpan = 1,
  postTotalColCount = 0,
  showScorecard, onToggleScorecard,
  metaLine, filterBar,
  onSortPos, onSortName, activeSortKey, activeSortDir,
}: ScorecardLeaderboardProps) {
  const nh = par.length;
  const is9 = nh <= 9;
  const parF9 = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const parB9 = !is9 ? par.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
  const parTotal = par.reduce((a, b) => a + b, 0);
  const hasSI = (si?.length ?? 0) >= nh;

  const afterScorecardHeaders = postScorecardHeaderCells ?? postTotalHeaderCells;
  const hasPostScorecard = !!afterScorecardHeaders;

  function SortArrow({ col }: { col: string }) {
    if (activeSortKey !== col) return null;
    return <span style={{ marginLeft: 2, fontSize: 7 }}>{activeSortDir === "asc" ? "▲" : "▼"}</span>;
  }

  return (
    <div>
      {(metaLine != null || onToggleScorecard) && (
        <div className="muted fs-11 mb-8 p-0-4px"
          style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {metaLine}
          {onToggleScorecard && (
            <button onClick={onToggleScorecard} className="btn" style={{ marginLeft: "auto" }}>
              {showScorecard ? "Ocultar scorecard" : "Ver scorecard"}
            </button>
          )}
        </div>
      )}

      {filterBar}

      <div className="bjgt-chart-scroll">
        <table className="sc-lb" data-sc-table="1">
          <thead>
            {/* Linha S.I. */}
            {showScorecard && hasSI && (
              <tr className="lb-si-row">
                <td className="sticky-col-0" />
                <td className="lb-par-lbl sticky-col-1" colSpan={parLabelColSpan}>S.I.</td>
                <td /><td />
                {Array.from({ length: postTotalColCount }, (_, i) => <td key={i} />)}
                {si!.slice(0, 9).map((v, i) => <td key={i}>{v}</td>)}
                <td className="lb-halftot" />
                {!is9 && si!.slice(9, 18).map((v, i) => <td key={i}>{v}</td>)}
                {!is9 && <td className="lb-halftot" />}
                {hasPostScorecard && <td />}
              </tr>
            )}

            {/* Linha PAR */}
            {showScorecard && (
              <tr className="lb-par-row">
                <td className="sticky-col-0" />
                <td className="lb-par-lbl sticky-col-1" colSpan={parLabelColSpan}>PAR</td>
                <td className="lb-topar" />
                <td className="lb-gross">{parTotal}</td>
                {Array.from({ length: postTotalColCount }, (_, i) => <td key={i} />)}
                {par.slice(0, 9).map((v, i) => <td key={i}>{v}</td>)}
                <td className="lb-halftot">{parF9}</td>
                {!is9 && par.slice(9, 18).map((v, i) => <td key={i}>{v}</td>)}
                {!is9 && <td className="lb-halftot">{parB9}</td>}
                {hasPostScorecard && <td />}
              </tr>
            )}

            {/* Header principal */}
            <tr>
              <th className={"lb-pos sticky-col-0" + (onSortPos ? " lb-sortable" : "")} onClick={onSortPos}>
                #<SortArrow col="pos" />
              </th>
              <th className={"lb-name sticky-col-1" + (onSortName ? " lb-sortable" : "")} onClick={onSortName}>
                Jogador<SortArrow col="name" />
              </th>
              {prefixHeaderCells}
              {/* ±Par ANTES de Tot */}
              <th className="lb-topar">±</th>
              <th className="lb-gross">Tot</th>
              {showScorecard && <>
                {Array.from({ length: Math.min(9, nh) }, (_, i) => (
                  <th key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{i + 1}</th>
                ))}
                <th className="lb-halftot">{is9 ? "Tot" : "Out"}</th>
                {!is9 && Array.from({ length: Math.min(9, nh - 9) }, (_, i) => (
                  <th key={i + 9} className="lb-hole">{i + 10}</th>
                ))}
                {!is9 && <th className="lb-halftot">In</th>}
              </>}
              {afterScorecardHeaders}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const sticky = row.rowBg || "var(--bg-card,#fff)";
              const scores = row.scores ?? [];
              const f9 = scores.slice(0, 9).reduce((a, b) => a + b, 0);
              const b9 = !is9 ? scores.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
              const afterScorecard = row.postScorecardCells ?? row.postTotalCells;
              return (
                <tr key={row.key} style={row.rowBg ? { background: row.rowBg } : undefined}>
                  <td className="lb-pos sticky-col-0" style={{ background: sticky }}>{row.pos}</td>
                  <td className="lb-name sticky-col-1" style={{ background: sticky }}>{row.nameContent}</td>
                  {row.prefixCells}
                  <td className="lb-topar" style={{ color: tpColor(row.toPar) }}>{fmtToPar(row.toPar)}</td>
                  <td className="lb-gross">{row.gross > 0 ? row.gross : "–"}</td>
                  {showScorecard && <>
                    {scores.slice(0, 9).map((sc, i) => (
                      <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
                        <span className={"sc-score " + scClass(sc, par[i])}>{sc || ""}</span>
                      </td>
                    ))}
                    <td className="lb-halftot">
                      {f9} <span className="fs-8 c-text-3">({fmtToPar(f9 - parF9)})</span>
                    </td>
                    {!is9 && scores.slice(9, 18).map((sc, i) => (
                      <td key={i} className="lb-hole">
                        <span className={"sc-score " + scClass(sc, par[9 + i])}>{sc || ""}</span>
                      </td>
                    ))}
                    {!is9 && (
                      <td className="lb-halftot">
                        {b9} <span className="fs-8 c-text-3">({fmtToPar(b9 - parB9)})</span>
                      </td>
                    )}
                  </>}
                  {afterScorecard}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
