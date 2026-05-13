/**
 * kids2/components/ScorecardModal.tsx
 *
 * Modal hole-by-hole baseado no padrão KIDSPage/TournScorecard.
 * Suporta 9H e 18H, com metros calculados a partir de yards (×0.9144).
 */

import React from "react";
import type { Tournament, Flight, Result } from "../data";
import { scClass, toParClass } from "../../../utils/scoreDisplay";
import { fmtSign } from "../../../utils/format";

interface Props {
  open: boolean;
  onClose: () => void;
  tournament: Tournament;
  flight: Flight;
  result: Result;
  round: number;
  playerName: string;
}

export default function ScorecardModal({ open, onClose, tournament, flight, result, round, playerName }: Props) {
  if (!open) return null;

  const rd = result.rounds?.find((x) => x.round === round);
  const strokes = (rd?.strokes || []).slice();
  const parArr = (flight.par && flight.par.length > 0 ? flight.par : []).slice();
  const yardsArr = flight.yards && flight.yards.length > 0 ? flight.yards : [];
  const metersArr = yardsArr.length > 0
    ? yardsArr.map((y) => (y && y > 0 ? Math.round(y * 0.9144) : 0))
    : [];

  const holesFromStrokes = strokes.filter((s) => s > 0).length;
  const holesFromPar = parArr.filter((p) => p > 0).length;
  const holes = holesFromPar > 0 ? holesFromPar : (holesFromStrokes <= 9 ? 9 : 18);
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
  const strokesEff = effIndices.map((i) => strokes[i] || 0);
  const metersEff = metersArr.length > 0 ? effIndices.map((i) => metersArr[i] || 0) : [];

  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const frontPar = is9 ? sum(parEff) : sum(parEff.slice(0, 9));
  const backPar = is9 ? 0 : sum(parEff.slice(9));
  const totalPar = frontPar + backPar;
  const frontM = is9 ? sum(metersEff) : sum(metersEff.slice(0, 9));
  const backM = is9 ? 0 : sum(metersEff.slice(9));
  const totalM = frontM + backM;
  const front = is9 ? sum(strokesEff) : sum(strokesEff.slice(0, 9));
  const back = is9 ? 0 : sum(strokesEff.slice(9));
  const total = (rd?.gross && rd.gross > 0) ? rd.gross : front + back;
  const toParTotal = totalPar > 0 ? total - totalPar : null;

  const handleInner = (e: React.MouseEvent) => e.stopPropagation();

  const Sub = ({ gross, base, cls }: { gross: number; base: number; cls: string }) => {
    if (base === 0) return <td className={cls}>{gross > 0 ? gross : "—"}</td>;
    const tp = gross - base;
    return (
      <td className={`${cls} fw-700`}>
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
        background: "rgba(0,0,0,0.5)",
        zIndex: 1000,
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
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>
              {tournament.name || tournament.shortName} · {flight.label} · Ronda {round}
              {tournament.course && <> · <span style={{ fontStyle: "italic" }}>{tournament.course}</span></>}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              fontSize: 18, fontWeight: 700,
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

        {total > 0 && totalPar > 0 && toParTotal !== null && (
          <div style={{ display: "flex", gap: 16, alignItems: "baseline", marginBottom: 12, padding: "8px 12px", background: "var(--bg-muted)", borderRadius: 6 }}>
            <div>
              <span style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: 0.4, textTransform: "uppercase" }}>Gross</span>
              <span style={{ fontSize: 24, fontWeight: 800, marginLeft: 8, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{total}</span>
            </div>
            <div>
              <span style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: 0.4, textTransform: "uppercase" }}>±par</span>
              <span className={`sc-topar ${toParClass(toParTotal)}`} style={{ fontSize: 18, fontWeight: 700, marginLeft: 8, display: "inline" }}>
                {fmtSign(toParTotal)}
              </span>
            </div>
            <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)" }}>
              Par {totalPar}{totalM > 0 && ` · ${totalM}m`}{is9 && " · 9 buracos"}
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

              <tr>
                <td className="row-label fw-700">R{round}</td>
                {(is9 ? strokesEff : strokesEff.slice(0, 9)).map((g, i) => {
                  const p = parEff[i];
                  return (
                    <td key={i}>
                      {g > 0 ? <span className={`sc-score ${scClass(g, p || null)}`}>{g}</span> : <span style={{ color: "var(--text-3)" }}>—</span>}
                    </td>
                  );
                })}
                {!is9 && <Sub gross={front} base={frontPar} cls="col-out" />}
                {!is9 && strokesEff.slice(9).map((g, i) => {
                  const p = parEff[i + 9];
                  return (
                    <td key={`b${i}`}>
                      {g > 0 ? <span className={`sc-score ${scClass(g, p || null)}`}>{g}</span> : <span style={{ color: "var(--text-3)" }}>—</span>}
                    </td>
                  );
                })}
                {!is9 && <Sub gross={back} base={backPar} cls="col-in" />}
                <Sub gross={total} base={totalPar} cls="col-total" />
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: 10, fontSize: 10, color: "var(--text-3)", marginTop: 10, flexWrap: "wrap" }}>
          <Legenda label="Eagle ou melhor" cls="eagle" />
          <Legenda label="Birdie" cls="birdie" />
          <Legenda label="Par" cls="par" />
          <Legenda label="Bogey" cls="bogey" />
          <Legenda label="Double+" cls="double" />
        </div>
      </div>
    </div>
  );
}

function Legenda({ label, cls }: { label: string; cls: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span className={`sc-score sc-score-sm ${cls}`} style={{ display: "inline-flex" }}>•</span>
      {label}
    </span>
  );
}
