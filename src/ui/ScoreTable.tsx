/**
 * src/ui/ScoreTable.tsx
 *
 * Tabelas Score → SD extraídas de SimuladorPage para reuso em ComparePage.
 *
 * Exporta:
 *   - HolesMode        type
 *   - SDTable          tabela simples Score→SD para um tee
 *   - MultiTeeSDTable  tabela Score→SD para todos os tees masculinos lado a lado
 */

import React, { useState, useMemo } from "react";
import type { Tee } from "../data/types";
import { sortTees, filterTees, teeHexFromTee as teeHex } from "../utils/teeUtils";
import { fmt, fmtCR, fmtSD, fmtToPar } from "../utils/format";
import {
  calcSD,
  calcPlayingHcp,
  expectedSD9,
  get9hRatings,
} from "../utils/whsCalc";
import { textOnColor } from "../utils/teeColors";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type HolesMode = "18" | "front9" | "back9";

interface TeeCol {
  teeName: string;
  hex: string;
  cr: number;
  slope: number;
  par: number;
  dist: number | null;
  playingHcp: number | null;
}

// ─── SDTable — Score → SD para um único tee ──────────────────────────────────

export function SDTable({
  cr,
  slope,
  par,
  pcc,
  hi,
  is9h,
}: {
  cr: number;
  slope: number;
  par: number;
  pcc: number;
  hi: number | null;
  is9h: boolean;
}) {
  const rows = useMemo(() => {
    const result: {
      score: number;
      vsPar: number;
      sd9: number;
      sd18: number;
      expected9: number | null;
      netScore: number | null;
    }[] = [];

    const playingHcp =
      hi !== null
        ? Math.round(calcPlayingHcp(is9h ? hi / 2 : hi, slope, cr, par))
        : null;
    const exp9 = hi !== null && is9h ? expectedSD9(hi) : null;

    const minDelta = is9h ? -4 : -8;
    const maxDelta = is9h ? 20 : 36;
    const minScore = is9h ? 25 : 50;

    for (let delta = minDelta; delta <= maxDelta; delta++) {
      const score = par + delta;
      if (score < minScore) continue;
      const sd = calcSD(score, cr, slope, pcc);
      const sd18 = is9h && exp9 !== null ? sd + exp9 : sd;
      const net = playingHcp !== null ? score - playingHcp : null;
      result.push({ score, vsPar: delta, sd9: sd, sd18, expected9: exp9, netScore: net });
    }
    return result;
  }, [cr, slope, par, pcc, hi, is9h]);

  return (
    <div className="sim-scroll-x">
      <table className="dtable">
        <thead>
          <tr>
            <th className="sim-th">Score</th>
            <th className="sim-th">vs Par</th>
            {is9h ? (
              <>
                <th className="sim-th">SD 9h</th>
                {hi !== null && <th className="sim-th">SD 18h</th>}
              </>
            ) : (
              <th className="sim-th">SD</th>
            )}
            {hi !== null && <th className="sim-th">Net</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isEven = r.vsPar === 0;
            const isBogey =
              r.vsPar ===
              Math.round(
                hi !== null
                  ? calcPlayingHcp(is9h ? hi / 2 : hi, slope, cr, par)
                  : 999,
              );
            return (
              <tr
                key={r.score}
                className={[
                  "sim-row",
                  isEven ? "sim-row-par" : "",
                  isBogey ? "sim-row-bogey" : "",
                ].join(" ")}
              >
                <td className="sim-td sim-td-score">{r.score}</td>
                <td className="sim-td c-text-3">
                  {fmtToPar(r.vsPar)}
                </td>
                {is9h ? (
                  <>
                    <td className="sim-td sim-td-sd">{fmtSD(r.sd9)}</td>
                    {hi !== null && (
                      <td className="sim-td sim-td-sd sim-td-sd18">
                        {fmtSD(r.sd18)}
                      </td>
                    )}
                  </>
                ) : (
                  <td className="sim-td sim-td-sd">{fmtSD(r.sd18)}</td>
                )}
                {hi !== null && (
                  <td className="sim-td c-text-2">
                    {r.netScore !== null ? r.netScore : "–"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── MultiTeeSDTable — Score → SD para todos os tees lado a lado ─────────────

export function MultiTeeSDTable({
  tees,
  pcc,
  hi,
  is9h,
  holesMode,
  allowance,
}: {
  tees: Tee[];
  pcc: number;
  hi: number | null;
  is9h: boolean;
  holesMode: HolesMode;
  allowance: number;
}) {
  const [selectedDelta, setSelectedDelta] = useState<number | null>(null);

  const cols: TeeCol[] = useMemo(() => {
    const maleTees = filterTees(tees, "M").length > 0
      ? filterTees(tees, "M")
      : filterTees(tees, "ALL");
    const sorted = sortTees(maleTees);
    const result: TeeCol[] = [];
    for (const t of sorted) {
      let cr: number | undefined,
        slope: number | undefined,
        par: number | undefined;
      if (is9h) {
        const r9 = get9hRatings(t, holesMode as "front9" | "back9");
        if (!r9) continue;
        cr = r9.cr;
        slope = r9.slope;
        par = r9.par ?? 36;
      } else {
        cr = t.ratings?.holes18?.courseRating ?? undefined;
        slope = t.ratings?.holes18?.slopeRating ?? undefined;
        par = t.ratings?.holes18?.par ?? 72;
      }
      if (!cr || !slope) continue;
      const phcp =
        hi !== null
          ? Math.round(
              calcPlayingHcp(
                is9h ? hi / 2 : hi,
                slope,
                cr,
                par,
                allowance / 100,
              ),
            )
          : null;
      const dist = is9h
        ? (holesMode === "front9" ? t.distances?.front9 : t.distances?.back9) ??
          null
        : t.distances?.total ?? null;
      result.push({
        teeName: t.teeName,
        hex: teeHex(t),
        cr,
        slope,
        par,
        dist,
        playingHcp: phcp,
      });
    }
    return result;
  }, [tees, hi, is9h, holesMode, allowance]);

  const exp9 = hi !== null && is9h ? expectedSD9(hi) : null;

  const rows = useMemo(() => {
    if (!cols.length) return [];

    const minDelta = is9h ? -4 : -8;
    const maxDelta = is9h ? 20 : 36;
    const minScore = is9h ? 25 : 50;

    const result: {
      delta: number;
      cells: { score: number; sd: number; sd18: number; net: number | null }[];
    }[] = [];

    for (let delta = minDelta; delta <= maxDelta; delta++) {
      const cells = cols.map((c) => {
        const score = c.par + delta;
        const sd = calcSD(score, c.cr, c.slope, pcc);
        const sd18 = is9h && exp9 !== null ? sd + exp9 : sd;
        const net = c.playingHcp !== null ? score - c.playingHcp : null;
        return { score, sd, sd18, net };
      });
      if (cells.some((c) => c.score < minScore)) continue;
      result.push({ delta, cells });
    }
    return result;
  }, [cols, pcc, is9h, exp9]);

  if (cols.length === 0)
    return (
      <p className="muted" style={{ fontSize: "var(--fs-12)" }}>
        Sem tees com ratings disponíveis.
      </p>
    );

  const hasNet = hi !== null;
  const colCount = hasNet ? 3 : 2; // Score, SD, [Net]
  const ROW1_H = 30;
  const stickyBase: React.CSSProperties = {
    position: "sticky",
    zIndex: "var(--z-float)" as React.CSSProperties["zIndex"],
  };

  return (
    <div className="sim-scroll-x scroll-x" style={{ maxHeight: 480 }}>
      <table className="dtable sim-multi-tee">
        <thead>
          {/* Row 1: tee color headers */}
          <tr>
            <th
              rowSpan={2}
              className="uppercase"
              style={{
                ...stickyBase,
                top: 0,
                verticalAlign: "bottom",
                minWidth: 50,
                background: "var(--bg)",
                borderBottom: "2px solid var(--border)",
                padding: "6px 8px",
                fontSize: "var(--fs-11)",
                fontWeight: 600,
                letterSpacing: "0.04em",
                color: "var(--text-3)",
                textAlign: "center",
              }}
            >
              ±Par
            </th>
            {cols.map((c, i) => (
              <th
                key={i}
                colSpan={colCount}
                style={{
                  ...stickyBase,
                  top: 0,
                  background: c.hex,
                  color: textOnColor(c.hex),
                  textAlign: "center",
                  padding: "5px 8px",
                  fontSize: "var(--fs-11)",
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  borderLeft: i > 0 ? "2px solid var(--border)" : undefined,
                  borderBottom: "none",
                }}
              >
                {c.teeName}
                <span
                  className="op-7 fs-10 fw-400"
                  style={{ marginLeft: 5 }}
                >
                  {c.dist != null && <>{fmt(c.dist)}m · </>}CR {fmtCR(c.cr)} ·
                  SR {c.slope} · Par {c.par}
                </span>
              </th>
            ))}
          </tr>
          {/* Row 2: sub-headers */}
          <tr>
            {cols.map((c, i) => {
              const base: React.CSSProperties = {
                ...stickyBase,
                top: ROW1_H,
                zIndex: "var(--z-raised)" as React.CSSProperties["zIndex"],
                background: "var(--bg)",
                padding: "4px 8px",
                fontSize: "var(--fs-10)",
                fontWeight: 600,
                letterSpacing: "0.04em",
                color: "var(--text-3)",
                textAlign: "right",
                borderBottom: `3px solid ${c.hex}`,
              };
              return (
                <React.Fragment key={i}>
                  <th
                    className="uppercase"
                    style={{
                      ...base,
                      borderLeft:
                        i > 0 ? "2px solid var(--border)" : undefined,
                    }}
                  >
                    Score
                  </th>
                  <th className="uppercase" style={base}>
                    {is9h ? (exp9 !== null ? "SD 18h" : "SD 9h") : "SD"}
                  </th>
                  {hasNet && <th style={base}>Net</th>}
                </React.Fragment>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isPar = r.delta === 0;
            const isSel = selectedDelta === r.delta;
            return (
              <tr
                key={r.delta}
                onClick={() =>
                  setSelectedDelta((prev) =>
                    prev === r.delta ? null : r.delta,
                  )
                }
                style={{
                  cursor: "pointer",
                  background: isSel ? "var(--accent-light)" : undefined,
                  outline: isSel ? "2px solid var(--accent)" : undefined,
                  outlineOffset: -1,
                }}
                className={["sim-row", isPar ? "sim-row-par" : ""].join(" ")}
              >
                {/* ±Par column */}
                <td
                  style={{
                    fontWeight: 700,
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    padding: "5px 8px",
                    fontSize: "var(--fs-12)",
                    borderBottom: "1px solid var(--border-light)",
                    background: isSel
                      ? "var(--accent)"
                      : isPar
                        ? "var(--accent-light)"
                        : undefined,
                    color: isSel
                      ? "var(--bg-card)"
                      : isPar
                        ? "var(--accent)"
                        : undefined,
                  }}
                >
                  {fmtToPar(r.delta)}
                </td>
                {r.cells.map((cell, i) => {
                  const col = cols[i];
                  const tHex = col.hex;
                  const isHcp =
                    col.playingHcp !== null &&
                    r.delta === Math.round(col.playingHcp);
                  const hcpStyle: React.CSSProperties = isHcp
                    ? {
                        background: `${tHex}25`,
                        borderTop: `2px solid ${tHex}`,
                        borderBottom: `2px solid ${tHex}`,
                      }
                    : {};
                  const tdBase: React.CSSProperties = {
                    padding: "5px 8px",
                    borderBottom: "1px solid var(--border-light)",
                    ...hcpStyle,
                  };
                  return (
                    <React.Fragment key={i}>
                      <td
                        style={{
                          ...tdBase,
                          textAlign: "center",
                          fontWeight: isHcp ? 800 : isPar ? 700 : 600,
                          borderLeft:
                            i > 0 ? "2px solid var(--border-light)" : undefined,
                          color: isHcp
                            ? "var(--grey-900)"
                            : isPar
                              ? "var(--accent)"
                              : undefined,
                        }}
                      >
                        {cell.score}
                      </td>
                      <td
                        className="mono"
                        style={{
                          ...tdBase,
                          textAlign: "right",
                          fontSize: "var(--fs-12)",
                          fontWeight: isHcp ? 700 : 600,
                          color: isHcp ? "var(--grey-900)" : undefined,
                        }}
                      >
                        {fmtSD(cell.sd18)}
                      </td>
                      {hasNet && (
                        <td
                          style={{
                            ...tdBase,
                            textAlign: "right",
                            color: isHcp ? "var(--grey-900)" : "var(--text-2)",
                            fontWeight: isHcp ? 700 : 400,
                          }}
                        >
                          {cell.net ?? "–"}
                        </td>
                      )}
                    </React.Fragment>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {is9h && exp9 !== null && (
        <div className="sim-italic-note">
          SD 18h = SD 9h + Expected 9h ({exp9.toFixed(1)}) · Fórmula WHS 2024
        </div>
      )}
    </div>
  );
}
