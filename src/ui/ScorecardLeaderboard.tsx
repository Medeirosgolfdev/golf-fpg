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
  /** Par por buraco DESTE jogador nesta ronda. Usado para colorir os scores
   *  (birdie/par/bogey) e os subtotais OUT/IN quando o campo da ronda está
   *  dividido por vários percursos (ex: FSGA joga R1 Roost / R2 Karoo em ondas
   *  — cada jogador tem o par do SEU campo). Fallback: o `par` partilhado. */
  holePars?: number[];
  /** Máscara de buracos inferidos (preenchimento posterior de cartão incompleto).
   *  Quando inferredHoles[i] é true, o buraco i é pintado a cinzento. */
  inferredHoles?: boolean[];
  /** Buraco de saída do jogador (1 ou 10 em saídas a dois tees). A célula desse
   *  buraco recebe a classe .sc-start-hole (realce). Não altera a ordem. */
  startHole?: number;
  rowBg?: string;
  stickyBg?: string;
  /** True quando a linha é do Manuel — aplica .row-manuel (highlight verde). */
  isManuel?: boolean;
  /** True quando o jogador é português — aplica .row-portuguese (highlight verde néon).
   *  Usado nas páginas internacionais (FFG, etc.) para destacar conterrâneos. */
  isPortuguese?: boolean;
  /** Border-top style para linha (aplicado a pos, name, e scorecard cells) */
  borderTop?: string;
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
  /** fedCode do jogador (opcional) — usado para filtrar PDF PJA via data-fed attribute. */
  fedCode?: string;
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
  /** Handler externo para ordenar pela coluna ±Par. Quando fornecido, o cabeçalho fica clicável mesmo com sortable=false. */
  onSortToPar?: () => void;
  /** Handler externo para ordenar pela coluna Tot/gross. */
  onSortGross?: () => void;
  /** Handler externo para ordenar por um buraco específico (0-based). */
  onSortHole?: (holeIndex: number) => void;
  /** Handler externo para ordenar pelo total dos primeiros 9 buracos (Out). */
  onSortF9?: () => void;
  /** Handler externo para ordenar pelo total dos últimos 9 buracos (In). */
  onSortB9?: () => void;
  activeSortKey?: string;
  activeSortDir?: "asc" | "desc";
  /** Sorting interno — usa sortName/sortPos de ScorecardRow. Ignora onSortPos/onSortName. */
  sortable?: boolean;
  /** Esconder colunas ± e Tot (built-in). Útil para fontes sem par real (PDFs LGPIDF). */
  hideTotals?: boolean;
}

type SCSortKey = "pos" | "name" | "gross" | "toPar" | "f9" | "b9" | `hole:${number}`;

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
  onSortPos, onSortName, onSortToPar, onSortGross, onSortHole, onSortF9, onSortB9, activeSortKey, activeSortDir,
  sortable = false,
  hideTotals = false,
}: ScorecardLeaderboardProps) {
  const startHole = startHoleProp ?? 1;
  const nh = par.length;
  const is9 = nh <= 9;
  const parF9 = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const parB9 = !is9 ? par.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
  const parTotal = par.reduce((a, b) => a + b, 0);
  const hasSI = nh > 0 && (si?.length ?? 0) >= nh;
  const siArr = hasSI ? si!.slice(0, nh).map(v => typeof v === 'string' ? parseInt(v as string, 10) : (Number(v) || 0)) : [];

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
      // Sort por buraco específico: "hole:N" (0-based)
      if (typeof intSortKey === "string" && intSortKey.startsWith("hole:")) {
        const hi = parseInt(intSortKey.slice(5), 10);
        const sa = a.scores?.[hi];
        const sb = b.scores?.[hi];
        const va = sa && sa > 0 ? sa : INF;
        const vb = sb && sb > 0 ? sb : INF;
        return dir * (va - vb);
      }
      // Sort por Out (F9) ou In (B9) — soma dos 9 primeiros / 9 últimos buracos
      if (intSortKey === "f9" || intSortKey === "b9") {
        const sliceFn = (s: number[] | undefined) => {
          if (!s) return INF;
          const arr = intSortKey === "f9" ? s.slice(0, 9) : s.slice(9, 18);
          const valid = arr.filter(v => v > 0);
          if (!valid.length) return INF;
          return arr.reduce((acc, v) => acc + (v || 0), 0);
        };
        return dir * (sliceFn(a.scores) - sliceFn(b.scores));
      }
      switch (intSortKey) {
        case "pos":   return dir * ((a.sortPos ?? INF) - (b.sortPos ?? INF));
        case "name":  return dir * ((a.sortName ?? a.key.toString()).localeCompare(b.sortName ?? b.key.toString(), "pt"));
        case "gross": return dir * (a.gross - b.gross);
        case "toPar": return dir * ((a.toPar ?? INF) - (b.toPar ?? INF));
        default:      return 0;
      }
    });
  }, [rows, sortable, intSortKey, intSortDir]);

  const handleSortPos   = sortable ? () => intToggle("pos")   : onSortPos;
  const handleSortName  = sortable ? () => intToggle("name")  : onSortName;
  const handleSortToPar = sortable ? () => intToggle("toPar") : onSortToPar;
  const handleSortGross = sortable ? () => intToggle("gross") : onSortGross;
  const handleSortHole  = sortable
    ? (i: number) => intToggle(`hole:${i}` as SCSortKey)
    : onSortHole;
  const handleSortF9    = sortable ? () => intToggle("f9") : onSortF9;
  const handleSortB9    = sortable ? () => intToggle("b9") : onSortB9;

  function SortArrow({ col }: { col: string }) {
    if (effectiveSortKey !== col) return null;
    return <span className="sort-arrow">{effectiveSortDir === "asc" ? "▲" : "▼"}</span>;
  }

  return (
    <div>
      {(metaLine != null || onToggleScorecard) && (
        <div className="lb-info-line flex-wrap"
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

            {/* Linha S.I. — NÃO sticky.
             *  Quando siLabel === "m" a linha transporta METROS (USKids sem
             *  TEES_LOOKUP → sem teeName → sem linha teeMeters). Metros SÃO
             *  somáveis, ao contrário do S.I. real → preencher OUT/IN/TOT. */}
            {showScorecard && hasSI && (() => {
              const siIsMeters = siLabel === "m";
              const siF9  = siIsMeters ? siArr.slice(0, 9).reduce((a, b) => a + b, 0) : 0;
              const siB9  = siIsMeters && !is9 ? siArr.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
              const siTot = siIsMeters ? siArr.reduce((a, b) => a + b, 0) : 0;
              return (
              <tr className="lb-si-row">
                <td className="sticky-col-0" />
                <td className="lb-par-lbl sticky-col-1" colSpan={parLabelColSpan + 1}>{siLabel}</td>
                <td className="lb-topar" />
                {/* S.I. é um índice por buraco (1-18), NÃO somável → TOT em branco.
                 *  Metros (siLabel="m") são somáveis → mostrar total. */}
                <td className="lb-gross">{siIsMeters && siTot > 0 ? siTot.toLocaleString("pt") : ""}</td>
                {Array.from({ length: postTotalColCount }, (_, i) => <td key={i} />)}
                {siArr.slice(0, 9).map((v, i) => (
                  <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{v || ""}</td>
                ))}
                <td className="lb-halftot">{siIsMeters && siF9 > 0 ? siF9.toLocaleString("pt") : ""}</td>
                {!is9 && siArr.slice(9, 18).map((v, i) => (
                  <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{v || ""}</td>
                ))}
                {!is9 && <td className="lb-halftot">{siIsMeters && siB9 > 0 ? siB9.toLocaleString("pt") : ""}</td>}
                {postScorecardColCount > 0 && Array.from({ length: postScorecardColCount }, (_, i) => <td key={i} />)}
              </tr>
              );
            })()}

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
              {!hideTotals && (
                <>
                  <th
                    className={"lb-topar" + (handleSortToPar ? " lb-sortable" : "")}
                    onClick={handleSortToPar}
                    title={handleSortToPar ? "Clique para ordenar por ±Par" : undefined}
                  >
                    ±<SortArrow col="toPar" />
                  </th>
                  <th
                    className={"lb-gross" + (handleSortGross ? " lb-sortable" : "")}
                    onClick={handleSortGross}
                    title={handleSortGross ? "Clique para ordenar pelo total" : undefined}
                  >
                    Tot<SortArrow col="gross" />
                  </th>
                </>
              )}
              {showScorecard && <>
                {Array.from({ length: Math.min(9, nh) }, (_, i) => (
                  <th
                    key={i}
                    className={"lb-hole" + (i === 0 ? " lb-hole-first" : "") + (handleSortHole ? " lb-sortable" : "")}
                    onClick={handleSortHole ? () => handleSortHole(i) : undefined}
                    title={handleSortHole ? `Clique para ordenar pelo buraco ${startHole + i}` : undefined}
                  >
                    {startHole + i}<SortArrow col={`hole:${i}`} />
                  </th>
                ))}
                <th
                  className={"lb-halftot" + (handleSortF9 ? " lb-sortable" : "")}
                  onClick={handleSortF9}
                  title={handleSortF9 ? (is9 ? "Clique para ordenar pelo total" : "Clique para ordenar pelo total dos 9 primeiros (Out)") : undefined}
                >
                  {is9 ? "Tot" : "Out"}<SortArrow col="f9" />
                </th>
                {!is9 && Array.from({ length: Math.min(9, nh - 9) }, (_, i) => (
                  <th
                    key={i + 9}
                    className={"lb-hole" + (i === 0 ? " lb-hole-first" : "") + (handleSortHole ? " lb-sortable" : "")}
                    onClick={handleSortHole ? () => handleSortHole(9 + i) : undefined}
                    title={handleSortHole ? `Clique para ordenar pelo buraco ${startHole + 9 + i}` : undefined}
                  >
                    {startHole + 9 + i}<SortArrow col={`hole:${9 + i}`} />
                  </th>
                ))}
                {!is9 && (
                  <th
                    className={"lb-halftot" + (handleSortB9 ? " lb-sortable" : "")}
                    onClick={handleSortB9}
                    title={handleSortB9 ? "Clique para ordenar pelo total dos 9 últimos (In)" : undefined}
                  >
                    In<SortArrow col="b9" />
                  </th>
                )}
              </>}
              {afterScorecardHeaders}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(row => {
              const sticky = row.stickyBg || "var(--bg-card,#fff)";
              // Manuel toma precedência sobre Portuguese (só uma classe é aplicada).
              const highlightCls = row.isManuel ? " row-manuel" : (row.isPortuguese ? " row-portuguese" : "");
              const scores = row.scores ?? [];
              const inf = row.inferredHoles ?? [];
              const f9 = scores.slice(0, 9).reduce((a, b) => a + b, 0);
              const b9 = !is9 ? scores.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
              // Par por buraco do jogador (campo que ele jogou nesta ronda) —
              // cai para o par partilhado quando a linha não traz o seu próprio.
              const rp = row.holePars && row.holePars.length >= nh ? row.holePars : par;
              // ⚠ O ±par de cada nine soma o par SÓ DOS BURACOS JOGADOS. Com um
              // scorecard incompleto (cartão por entregar, jogo interrompido), o
              // par dos 9 contra a soma de 7 buracos dava um "(−1)" enganador.
              const playedPar = (from: number, to: number) =>
                rp.slice(from, to).reduce((a, p, i) => a + (scores[from + i] ? p : 0), 0);
              const playedN = (from: number, to: number) =>
                scores.slice(from, to).filter(Boolean).length;
              const rpF9 = playedPar(0, 9);
              const rpB9 = !is9 ? playedPar(9, 18) : 0;
              const nF9 = playedN(0, 9), nB9 = !is9 ? playedN(9, 18) : 0;
              const afterScorecard = row.postScorecardCells ?? row.postTotalCells;
              return (
                <tr key={row.key} className={highlightCls.trim() || undefined} style={row.rowBg && !row.isManuel && !row.isPortuguese ? { background: row.rowBg } : undefined} data-fed={row.fedCode}>
                  <td className="lb-pos sticky-col-0" style={{ background: sticky, borderTop: row.borderTop }}>{row.pos}</td>
                  <td className="lb-name sticky-col-1" style={{ background: sticky, borderTop: row.borderTop }}>{row.nameContent}</td>
                  {row.prefixCells}
                  {!hideTotals && (
                    <>
                      <td className="lb-topar" style={{ color: tpColor(row.toPar), borderTop: row.borderTop }}>{fmtToPar(row.toPar)}</td>
                      <td className="lb-gross" style={{ borderTop: row.borderTop }}>{row.gross > 0 ? row.gross : "–"}</td>
                    </>
                  )}
                  {showScorecard && <>
                    {scores.slice(0, 9).map((sc, i) => {
                      // Só realçar saídas FORA do buraco padrão (1ª coluna): hole 10 etc.
                      const isStart = row.startHole != null && row.startHole !== startHole && (startHole + i) === row.startHole;
                      return (
                      <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "") + (isStart ? " sc-start-hole" : "")} style={{ borderTop: row.borderTop }}
                        title={isStart ? `Saída no buraco ${row.startHole}` : undefined}>
                        <span className={"sc-score " + (inf[i] ? "sc-inferred" : scClass(sc, rp[i]))}
                          title={inf[i] ? "Buraco não terminado — valor estimado (Net Double Bogey)" : undefined}>{sc || ""}</span>
                      </td>
                    );})}
                    <td className="lb-halftot" style={{ borderTop: row.borderTop }}
                      title={nF9 > 0 && nF9 < 9 ? `Parcial — ${nF9} de 9 buracos` : undefined}>
                      {f9 || "–"}{nF9 > 0 && <span className="fs-10 c-text-3">
                        {" "}({fmtToPar(f9 - rpF9)}){nF9 < 9 && <span title={`${nF9} de 9 buracos`}> ·{nF9}b</span>}
                      </span>}
                    </td>
                    {!is9 && scores.slice(9, 18).map((sc, i) => {
                      const isStart = row.startHole != null && row.startHole !== startHole && (startHole + 9 + i) === row.startHole;
                      return (
                      <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "") + (isStart ? " sc-start-hole" : "")} style={{ borderTop: row.borderTop }}
                        title={isStart ? `Saída no buraco ${row.startHole}` : undefined}>
                        <span className={"sc-score " + (inf[9 + i] ? "sc-inferred" : scClass(sc, rp[9 + i]))}
                          title={inf[9 + i] ? "Buraco não terminado — valor estimado (Net Double Bogey)" : undefined}>{sc || ""}</span>
                      </td>
                    );})}
                    {!is9 && (
                      <td className="lb-halftot" style={{ borderTop: row.borderTop }}
                        title={nB9 > 0 && nB9 < 9 ? `Parcial — ${nB9} de 9 buracos` : undefined}>
                        {b9 || "–"}{nB9 > 0 && <span className="fs-10 c-text-3">
                          {" "}({fmtToPar(b9 - rpB9)}){nB9 < 9 && <span title={`${nB9} de 9 buracos`}> ·{nB9}b</span>}
                        </span>}
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
