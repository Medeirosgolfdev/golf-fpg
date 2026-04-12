// @refresh reset
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
import React, { useMemo } from "react";
import { scClass } from "../utils/scoreDisplay";
import { fmtToPar } from "../utils/format";
import { useSort } from "../hooks/useSort";
import { tpColor } from "./tournamentPrimitives";
import { getTeeHex, teeBorder } from "../utils/teeColors";

export interface ScorecardRow {
  key: string | number;
  pos: React.ReactNode;
  gross: number;
  toPar: number | null;   // null para jogadores WD/DNS
  scores?: number[];
  rowBg?: string;
  stickyBg?: string;
  nameContent: React.ReactNode;
  /** <td> entre Jogador e ±Par — usar classes .lb-esc .lb-fed .lb-club .lb-hcp .lb-tee */
  prefixCells?: React.ReactNode;
  /** <td> após In (fim do scorecard) — usar classes .lb-sd .lb-bird .lb-par-stat .lb-bog */
  postScorecardCells?: React.ReactNode;
  /** @deprecated use postScorecardCells */
  postTotalCells?: React.ReactNode;
  /** Nome em texto para sorting interno (quando sortable=true) */
  sortName?: string;
  /** Posição numérica para sorting interno (quando sortable=true) */
  sortPos?: number | null;
}

interface ScorecardLeaderboardProps {
  par: number[];
  si?: number[];
  /** Label da linha SI (default: "S.I."). Usar "m" para metros. */
  siLabel?: string;
  /** Distâncias por buraco, por tee. Cada entrada gera uma linha "m" acima de SI/PAR. */
  teeMeters?: { teeName: string; meters: number[] }[];
  rows: ScorecardRow[];
  prefixHeaderCells?: React.ReactNode;
  /** Headers após In (SD, 🐦, Par, ■) */
  postScorecardHeaderCells?: React.ReactNode;
  /** @deprecated use postScorecardHeaderCells */
  postTotalHeaderCells?: React.ReactNode;
  parLabelColSpan?: number;
  postTotalColCount?: number;
  /** Número de colunas após o scorecard (SD, 🐦, Par, ■) — para preencher SI/PAR rows */
  postScorecardColCount?: number;
  /** Buraco inicial para numeração (default 1, back-9: 10) */
  startHole?: number;
  showScorecard: boolean;
  onToggleScorecard?: () => void;
  metaLine?: React.ReactNode;
  filterBar?: React.ReactNode;
  onSortPos?: () => void;
  onSortName?: () => void;
  activeSortKey?: string;
  activeSortDir?: "asc" | "desc";
  /** Sorting interno — usa sortName/sortPos de ScorecardRow. Ignora onSortPos/onSortName. */
  sortable?: boolean;
}

type SCSortKey = "pos" | "name" | "gross" | "toPar";

export function ScorecardLeaderboard({
  par, si, siLabel = "S.I.", teeMeters, rows,
  prefixHeaderCells,
  postScorecardHeaderCells, postTotalHeaderCells,
  parLabelColSpan = 1,
  postTotalColCount = 0,
  postScorecardColCount = 0,
  startHole: startHoleProp,
  showScorecard, onToggleScorecard,
  metaLine, filterBar,
  onSortPos, onSortName, activeSortKey, activeSortDir,
  sortable = false,
}: ScorecardLeaderboardProps) {
  const startHole = startHoleProp ?? 1;
  const nh = par.length;
  const is9 = nh <= 9;
  const parF9 = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const parB9 = !is9 ? par.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
  const parTotal = par.reduce((a, b) => a + b, 0);
  const hasSI = (si?.length ?? 0) >= nh;
  const siArr = hasSI ? si!.slice(0, nh).map(v => typeof v === 'string' ? parseInt(v as string, 10) : (Number(v) || 0)) : [];
  const siF9    = siArr.length >= 9 ? siArr.slice(0, 9).reduce((a, b) => a + b, 0) : 0;
  const siB9    = !is9 && siArr.length >= 18 ? siArr.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
  const siTotal = siArr.reduce((a, b) => a + b, 0);

  // Filtrar teeMeters válidos (com metros suficientes)
  const validTeeMeters = (teeMeters || []).filter(tm => tm.meters.length >= nh);

  const afterScorecardHeaders = postScorecardHeaderCells ?? postTotalHeaderCells;

  /* ── Sorting interno ── */
  const { sortKey: intSortKey, sortDir: intSortDir, toggleSort: intToggle } = useSort<SCSortKey>("pos", "asc");

  const effectiveSortKey = sortable ? intSortKey : activeSortKey;
  const effectiveSortDir = sortable ? intSortDir : activeSortDir;

  const sortedRows = useMemo(() => {
    if (!sortable) return rows;
    const INF = 9999;
    return [...rows].sort((a, b) => {
      const dir = intSortDir === "asc" ? 1 : -1;
      switch (intSortKey) {
        case "pos":   return dir * ((a.sortPos ?? INF) - (b.sortPos ?? INF));
        case "name":  return dir * ((a.sortName ?? a.key.toString()).localeCompare(b.sortName ?? b.key.toString(), "pt"));
        case "gross": return dir * (a.gross - b.gross);
        case "toPar": return dir * ((a.toPar ?? INF) - (b.toPar ?? INF));
        default:      return 0;
      }
    });
  }, [rows, sortable, intSortKey, intSortDir]);

  const handleSortPos  = sortable ? () => intToggle("pos")  : onSortPos;
  const handleSortName = sortable ? () => intToggle("name") : onSortName;
  const isSortable = sortable || !!onSortPos || !!onSortName;

  function SortArrow({ col }: { col: string }) {
    if (effectiveSortKey !== col) return null;
    return <span className="sort-arrow">{effectiveSortDir === "asc" ? "▲" : "▼"}</span>;
  }

  return (
    <div>
      {(metaLine != null || onToggleScorecard) && (
        <div className="muted fs-11 mb-8 p-0-4px flex-wrap"
          
          style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {metaLine}
          {onToggleScorecard && (
            <button onClick={onToggleScorecard} className="btn ml-auto" >
              {showScorecard ? "Ocultar scorecard" : "Ver scorecard"}
            </button>
          )}
        </div>
      )}

      {filterBar}

      <div className="bjgt-chart-scroll">
        <table className={"sc-lb" + (showScorecard ? " sc-lb-with-sc" : "")} data-sc-table="1">
          <thead>
            {/* Linhas de metros por tee — uma por cada tee distinto, NÃO sticky */}
            {showScorecard && validTeeMeters.map(tm => {
              const mArr = tm.meters.slice(0, nh);
              const mF9  = mArr.slice(0, 9).reduce((a, b) => a + b, 0);
              const mB9  = !is9 ? mArr.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
              const mTot = mArr.reduce((a, b) => a + b, 0);
              const hex  = getTeeHex(tm.teeName);
              const bdr  = teeBorder(hex) || "1px solid rgba(0,0,0,.18)";
              return (
                <tr key={tm.teeName} className="lb-si-row">
                  <td className="sticky-col-0" />
                  <td className="lb-par-lbl sticky-col-1" colSpan={parLabelColSpan + 1}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: hex, border: bdr, flexShrink: 0 }} />
                      <span>m</span>
                    </span>
                  </td>
                  <td className="lb-topar" />
                  <td className="lb-gross">{mTot > 0 ? mTot.toLocaleString("pt") : ""}</td>
                  {Array.from({ length: postTotalColCount }, (_, i) => <td key={i} />)}
                  {mArr.slice(0, 9).map((v, i) => (
                    <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{v || ""}</td>
                  ))}
                  <td className="lb-halftot">{mF9 > 0 ? mF9.toLocaleString("pt") : ""}</td>
                  {!is9 && mArr.slice(9, 18).map((v, i) => (
                    <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{v || ""}</td>
                  ))}
                  {!is9 && <td className="lb-halftot">{mB9 > 0 ? mB9.toLocaleString("pt") : ""}</td>}
                  {postScorecardColCount > 0 && Array.from({ length: postScorecardColCount }, (_, i) => <td key={i} />)}
                </tr>
              );
            })}

            {/* Linha S.I. — NÃO sticky */}
            {showScorecard && hasSI && (
              <tr className="lb-si-row">
                <td className="sticky-col-0" />
                <td className="lb-par-lbl sticky-col-1" colSpan={parLabelColSpan + 1}>{siLabel}</td>
                <td className="lb-topar" />
                <td className="lb-gross">{siTotal > 0 ? siTotal : ""}</td>
                {Array.from({ length: postTotalColCount }, (_, i) => <td key={i} />)}
                {siArr.slice(0, 9).map((v, i) => (
                  <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{v || ""}</td>
                ))}
                <td className="lb-halftot">{siF9 > 0 ? siF9 : ""}</td>
                {!is9 && siArr.slice(9, 18).map((v, i) => (
                  <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{v || ""}</td>
                ))}
                {!is9 && <td className="lb-halftot">{siB9 > 0 ? siB9 : ""}</td>}
                {postScorecardColCount > 0 && Array.from({ length: postScorecardColCount }, (_, i) => <td key={i} />)}
              </tr>
            )}

            {/* Linha PAR — segundo, NÃO sticky */}
            {showScorecard && (
              <tr className="lb-par-row">
                <td className="sticky-col-0" />
                <td className="lb-par-lbl sticky-col-1" colSpan={parLabelColSpan + 1}>PAR</td>
                <td className="lb-topar" />
                <td className="lb-gross">{parTotal}</td>
                {Array.from({ length: postTotalColCount }, (_, i) => <td key={i} />)}
                {par.slice(0, 9).map((v, i) => (
                  <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{v}</td>
                ))}
                <td className="lb-halftot">{parF9}</td>
                {!is9 && par.slice(9, 18).map((v, i) => (
                  <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{v}</td>
                ))}
                {!is9 && <td className="lb-halftot">{parB9}</td>}
                {postScorecardColCount > 0 && Array.from({ length: postScorecardColCount }, (_, i) => <td key={i} />)}
              </tr>
            )}

            {/* Header principal — terceiro, sticky vertical */}
            <tr>
              <th className={"lb-pos sticky-col-0" + (handleSortPos ? " lb-sortable" : "")} onClick={handleSortPos}>
                #<SortArrow col="pos" />
              </th>
              <th className={"lb-name sticky-col-1" + (handleSortName ? " lb-sortable" : "")} onClick={handleSortName}>
                Jogador<SortArrow col="name" />
              </th>
              {prefixHeaderCells}
              <th className={"lb-topar" + (sortable ? " lb-sortable" : "")} onClick={sortable ? () => intToggle("toPar") : undefined}>
                ±<SortArrow col="toPar" />
              </th>
              <th className={"lb-gross" + (sortable ? " lb-sortable" : "")} onClick={sortable ? () => intToggle("gross") : undefined}>
                Tot<SortArrow col="gross" />
              </th>
              {showScorecard && <>
                {Array.from({ length: Math.min(9, nh) }, (_, i) => (
                  <th key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{startHole + i}</th>
                ))}
                <th className="lb-halftot">{is9 ? "Tot" : "Out"}</th>
                {!is9 && Array.from({ length: Math.min(9, nh - 9) }, (_, i) => (
                  <th key={i + 9} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{startHole + 9 + i}</th>
                ))}
                {!is9 && <th className="lb-halftot">In</th>}
              </>}
              {afterScorecardHeaders}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(row => {
              const sticky = row.stickyBg || "var(--bg-card,#fff)";
              const manuelCls = row.rowBg ? " row-manuel" : "";
              const scores = row.scores ?? [];
              const f9 = scores.slice(0, 9).reduce((a, b) => a + b, 0);
              const b9 = !is9 ? scores.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
              const afterScorecard = row.postScorecardCells ?? row.postTotalCells;
              return (
                <tr key={row.key} className={manuelCls.trim() || undefined}>
                  <td className="lb-pos sticky-col-0" style={{ background: sticky }}>{row.pos}</td>
                  <td className="lb-name sticky-col-1" style={{ background: sticky }}>{row.nameContent}</td>
                  {row.prefixCells}
                  <td className="lb-topar" style={{ color: tpColor(row.toPar) }}>{fmtToPar(row.toPar)}</td>
                  <td className="lb-gross">{row.gross > 0 && row.toPar != null ? row.gross : "–"}</td>
                  {showScorecard && <>
                    {scores.slice(0, 9).map((sc, i) => (
                      <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
                        <span className={"sc-score " + scClass(sc, par[i])}>{sc || ""}</span>
                      </td>
                    ))}
                    <td className="lb-halftot">
                      {f9} <span className="fs-10 c-text-3">({fmtToPar(f9 - parF9)})</span>
                    </td>
                    {!is9 && scores.slice(9, 18).map((sc, i) => (
                      <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
                        <span className={"sc-score " + scClass(sc, par[9 + i])}>{sc || ""}</span>
                      </td>
                    ))}
                    {!is9 && (
                      <td className="lb-halftot">
                        {b9} <span className="fs-10 c-text-3">({fmtToPar(b9 - parB9)})</span>
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
