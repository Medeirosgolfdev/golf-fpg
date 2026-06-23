/**
 * kids2/components/ScorecardModal.tsx
 *
 * Modal hole-by-hole baseado no padrão KIDSPage/TournScorecard.
 * Suporta 9H e 18H, com metros calculados a partir de yards (×0.9144).
 *
 * Mostra TODAS as rondas do `result` numa única tabela (R1, R2, R3 como
 * linhas separadas) — o prop `round` é apenas usado para destacar
 * visualmente a ronda que originou o clique.
 */

import React from "react";
import type { Tournament, Flight, Result, Junior } from "../data";
import { scClass, toParClass } from "../../../utils/scoreDisplay";
import { fmtSign } from "../../../utils/format";
import { getKnownScorecard, mergeFlightWithKnown } from "../knownScorecards";

interface Props {
  open: boolean;
  onClose: () => void;
  tournament: Tournament;
  flight: Flight;
  result: Result;
  /** Ronda focada — só usada para highlight visual da linha. */
  round: number;
  playerName: string;
  /** Se passar o junior, o componente tenta enriquecer par/yards/strokes
   *  com os scorecards públicos hardcoded em `knownScorecards.ts` quando o
   *  canónico não os tem. */
  junior?: Junior;
}

export default function ScorecardModal({ open, onClose, tournament, flight, result, round, playerName, junior }: Props) {
  if (!open) return null;

  // Fallback transparente para scorecards públicos hardcoded (WJGC26, EOWAGR25, etc.)
  const known = junior ? getKnownScorecard(junior, tournament) : null;
  const merged = mergeFlightWithKnown(flight, result, known);

  const parArr = merged.par.slice();
  const yardsArr = merged.yards;
  const metersArr = yardsArr.length > 0
    ? yardsArr.map((y) => (y && y > 0 ? Math.round(y * 0.9144) : 0))
    : [];

  // Determinar nº de buracos pelo par ou pela primeira ronda com strokes.
  const holesFromPar = parArr.filter((p) => p > 0).length;
  const allRounds = merged.rounds.filter((r) => r && (r.strokes?.length || typeof r.gross === "number"));
  const firstStrokes = allRounds[0]?.strokes || [];
  const holesFromStrokes = firstStrokes.filter((s) => s > 0).length;
  const holes = holesFromPar > 0 ? holesFromPar : (holesFromStrokes <= 9 && holesFromStrokes > 0 ? 9 : 18);
  const is9 = holes <= 9;

  let effIndices: number[];
  if (is9 && parArr.length === 18) {
    effIndices = parArr.map((p, i) => (p > 0 ? i : -1)).filter((i) => i >= 0);
    if (effIndices.length !== 9) {
      effIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    }
  } else if (is9) {
    effIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  } else {
    effIndices = Array.from({ length: 18 }, (_, i) => i);
  }

  const parEff = effIndices.map((i) => parArr[i] || 0);
  const metersEff = metersArr.length > 0 ? effIndices.map((i) => metersArr[i] || 0) : [];

  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const frontPar = is9 ? sum(parEff) : sum(parEff.slice(0, 9));
  const backPar = is9 ? 0 : sum(parEff.slice(9));
  const totalPar = frontPar + backPar;
  const frontM = is9 ? sum(metersEff) : sum(metersEff.slice(0, 9));
  const backM = is9 ? 0 : sum(metersEff.slice(9));
  const totalM = frontM + backM;

  // Pré-processa cada ronda — efetiva strokes alinhados aos buracos jogados.
  const roundRows = allRounds.map((rd) => {
    const strokes = (rd.strokes || []).slice();
    const strokesEff = effIndices.map((i) => strokes[i] || 0);
    const front = is9 ? sum(strokesEff) : sum(strokesEff.slice(0, 9));
    const back = is9 ? 0 : sum(strokesEff.slice(9));
    const gross = (rd.gross && rd.gross > 0) ? rd.gross : front + back;
    const toPar = totalPar > 0 && gross > 0 ? gross - totalPar : null;
    return {
      round: rd.round,
      strokesEff,
      front, back, gross, toPar,
      isFocused: rd.round === round,
    };
  });

  // Totais do torneio inteiro (todas as rondas somadas)
  const totalGross = result.totalGross
    || (roundRows.length > 0 && roundRows.every((r) => r.gross > 0)
      ? roundRows.reduce((s, r) => s + r.gross, 0)
      : 0);
  const totalToPar = result.toPar
    ?? (totalGross > 0 && totalPar > 0 && roundRows.length > 0
      ? totalGross - totalPar * roundRows.length
      : null);

  const handleInner = (e: React.MouseEvent) => e.stopPropagation();

  const Sub = ({ gross, base, cls, focused }: { gross: number; base: number; cls: string; focused?: boolean }) => {
    if (base === 0) return <td className={cls + (focused ? " sc-focused" : "")}>{gross > 0 ? gross : "—"}</td>;
    const tp = gross - base;
    return (
      <td className={`${cls} fw-700${focused ? " sc-focused" : ""}`}>
        {gross > 0 ? gross : "—"}
        {gross > 0 && <span className={`sc-topar ${toParClass(tp)}`}>{fmtSign(tp)}</span>}
      </td>
    );
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "var(--overlay-black-50)",
        zIndex: "var(--z-overlay)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={handleInner}
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 18,
          maxWidth: 900,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, color: "var(--text)", fontWeight: 700 }}>{playerName}</h3>
            <div style={{ fontSize: "var(--fs-12)", color: "var(--text-3)", marginTop: 3 }}>
              {tournament.name || tournament.shortName} · {flight.label}
              {roundRows.length > 1 ? ` · ${roundRows.length} rondas` : ` · Ronda ${round}`}
              {tournament.course && <> · <span style={{ fontStyle: "italic" }}>{tournament.course}</span></>}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              fontSize: "var(--fs-18)", fontWeight: 700,
              padding: "4px 12px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-muted)",
              color: "var(--text-2)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >✕</button>
        </div>

        {totalGross > 0 && totalPar > 0 && totalToPar !== null && (
          <div style={{ display: "flex", gap: 16, alignItems: "baseline", marginBottom: 12, padding: "8px 12px", background: "var(--bg-muted)", borderRadius: 6 }}>
            <div>
              <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)", letterSpacing: 0.4, textTransform: "uppercase" }}>Gross total</span>
              <span style={{ fontSize: "var(--fs-24)", fontWeight: 800, marginLeft: 8, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{totalGross}</span>
            </div>
            <div>
              <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)", letterSpacing: 0.4, textTransform: "uppercase" }}>±par</span>
              <span className={`sc-topar ${toParClass(totalToPar)}`} style={{ fontSize: "var(--fs-18)", fontWeight: 700, marginLeft: 8, display: "inline" }}>
                {fmtSign(totalToPar)}
              </span>
            </div>
            <div style={{ marginLeft: "auto", fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
              Par {totalPar}{totalM > 0 && ` · ${totalM}m`}{is9 && " · 9 buracos"}
              {roundRows.length > 1 && ` · ${roundRows.length} rondas`}
            </div>
          </div>
        )}

        <div className="scroll-x">
          <table className="sc-table-modern" data-sc-table="1">
            <thead>
              <tr>
                <th className="hole-header ta-left">Buraco</th>
                {(is9 ? effIndices : effIndices.slice(0, 9)).map((origIdx, i) => (
                  <th key={i} className="hole-header">{is9 ? (origIdx + 1) : (i + 1)}</th>
                ))}
                {!is9 && <th className="hole-header col-out fs-10">Out</th>}
                {!is9 && effIndices.slice(9).map((origIdx, i) => (
                  <th key={`b${i}`} className="hole-header">{origIdx + 1}</th>
                ))}
                {!is9 && <th className="hole-header col-in fs-10">In</th>}
                <th className="hole-header col-total">TOT</th>
              </tr>
            </thead>
            <tbody>
              {metersEff.some((m) => m > 0) && (
                <tr className="meta-row">
                  <td className="row-label fs-10 c-text-3">m</td>
                  {(is9 ? metersEff : metersEff.slice(0, 9)).map((m, i) => (
                    <td key={i} className="fs-10 c-text-3">{m > 0 ? m : "—"}</td>
                  ))}
                  {!is9 && <td className="col-out c-text-3">{frontM}</td>}
                  {!is9 && metersEff.slice(9).map((m, i) => (
                    <td key={`b${i}`} className="fs-10 c-text-3">{m > 0 ? m : "—"}</td>
                  ))}
                  {!is9 && <td className="col-in c-text-3">{backM}</td>}
                  <td className="col-total fs-10 c-text-3">{totalM}</td>
                </tr>
              )}

              <tr className="sep-row">
                <td className="row-label par-label">Par</td>
                {(is9 ? parEff : parEff.slice(0, 9)).map((p, i) => (
                  <td key={i}>{p > 0 ? p : "—"}</td>
                ))}
                {!is9 && <td className="col-out fw-600">{frontPar}</td>}
                {!is9 && parEff.slice(9).map((p, i) => (
                  <td key={`b${i}`}>{p > 0 ? p : "—"}</td>
                ))}
                {!is9 && <td className="col-in fw-600">{backPar}</td>}
                <td className="col-total">{totalPar}</td>
              </tr>

              {/* Uma linha por cada ronda (R1, R2, R3, ...) */}
              {roundRows.map((rr) => {
                const focusedRowStyle: React.CSSProperties | undefined = rr.isFocused
                  ? { background: "var(--bg-muted)" }
                  : undefined;
                return (
                  <tr key={rr.round} style={focusedRowStyle}>
                    <td className="row-label fw-700">
                      R{rr.round}
                    </td>
                    {(is9 ? rr.strokesEff : rr.strokesEff.slice(0, 9)).map((g, i) => {
                      const p = parEff[i];
                      return (
                        <td key={i}>
                          {g > 0 ? <span className={`sc-score ${scClass(g, p || null)}`}>{g}</span> : <span style={{ color: "var(--text-3)" }}>—</span>}
                        </td>
                      );
                    })}
                    {!is9 && <Sub gross={rr.front} base={frontPar} cls="col-out" focused={rr.isFocused} />}
                    {!is9 && rr.strokesEff.slice(9).map((g, i) => {
                      const p = parEff[i + 9];
                      return (
                        <td key={`b${i}`}>
                          {g > 0 ? <span className={`sc-score ${scClass(g, p || null)}`}>{g}</span> : <span style={{ color: "var(--text-3)" }}>—</span>}
                        </td>
                      );
                    })}
                    {!is9 && <Sub gross={rr.back} base={backPar} cls="col-in" focused={rr.isFocused} />}
                    <Sub gross={rr.gross} base={totalPar} cls="col-total" focused={rr.isFocused} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {merged.fallbackSource && (
          <div style={{
            marginTop: 10,
            padding: "6px 10px",
            fontSize: "var(--fs-11)",
            color: "var(--text-3)",
            fontStyle: "italic",
            borderTop: "1px dashed var(--border-light)",
          }}>
            Fonte: {merged.fallbackSource}
          </div>
        )}
      </div>
    </div>
  );
}
