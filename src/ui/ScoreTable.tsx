/**
 * src/ui/ScoreTable.tsx
 *
 * Tabelas Score → SD extraídas de SimuladorPage para reuso em comparar/CompararCampos.
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
  scoreDifferential,
} from "../utils/whsCalc";
import { textOnColor } from "../utils/teeColors";
import { Tint } from "./DataStyle";

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
        ? Math.round(calcPlayingHcp(hi, slope, cr, par, 1, is9h))
        : null;
    const exp9 = hi !== null && is9h ? expectedSD9(hi) : null;

    const minDelta = is9h ? -4 : -8;
    const maxDelta = is9h ? 20 : 36;
    const minScore = is9h ? 25 : 50;

    for (let delta = minDelta; delta <= maxDelta; delta++) {
      const score = par + delta;
      if (score < minScore) continue;
      // SD pela biblioteca (utils/whsCalc); em 9 buracos sem HI só há o SD dos 9
      const d = scoreDifferential({ score, cr, slope, pcc, is9: is9h, hi });
      const sd = is9h ? (d?.sd9 ?? calcSD(score, cr, slope, pcc / 2)) : (d?.sd ?? calcSD(score, cr, slope, pcc));
      const sd18 = d?.sd ?? sd;
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
                  ? calcPlayingHcp(hi, slope, cr, par, 1, is9h)
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
              calcPlayingHcp(hi, slope, cr, par, allowance / 100, is9h),
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
        const d = scoreDifferential({ score, cr: c.cr, slope: c.slope, pcc, is9: is9h, hi });
        const sd = is9h
          ? (d?.sd9 ?? calcSD(score, c.cr, c.slope, pcc / 2))
          : (d?.sd ?? calcSD(score, c.cr, c.slope, pcc));
        const sd18 = d?.sd ?? sd;
        const net = c.playingHcp !== null ? score - c.playingHcp : null;
        return { score, sd, sd18, net };
      });
      if (cells.some((c) => c.score < minScore)) continue;
      result.push({ delta, cells });
    }
    return result;
  }, [cols, pcc, is9h, hi]);

  if (cols.length === 0)
    return (
      <p className="muted u-fs-fs-12">
        Sem tees com ratings disponíveis.
      </p>
    );

  const hasNet = hi !== null;
  const colCount = hasNet ? 3 : 2; // Score, SD, [Net]
  // Aspecto nas classes .st-* (App.css); a cor de cada tee vem dos dados (Tint).
  return (
    <div className="sim-scroll-x scroll-x u-maxh-480px">
      <table className="dtable sim-multi-tee">
        <thead>
          {/* Row 1: tee color headers */}
          <tr>
            <th rowSpan={2} className="uppercase st-th-dp">
              ±Par
            </th>
            {cols.map((c, i) => (
              <Tint as="th" key={i} colSpan={colCount}
                className={i > 0 ? "st-th-tee st-sep-l" : "st-th-tee"}
                bg={c.hex} fg={textOnColor(c.hex)}>
                {c.teeName}
                <span className="op-7 fs-10 fw-400 u-ml-4px">
                  {c.dist != null && <>{fmt(c.dist)}m · </>}CR {fmtCR(c.cr)} ·
                  SR {c.slope} · Par {c.par}
                </span>
              </Tint>
            ))}
          </tr>
          {/* Row 2: sub-headers (linha de baixo na cor do tee) */}
          <tr>
            {cols.map((c, i) => (
              <React.Fragment key={i}>
                <Tint as="th" className={i > 0 ? "uppercase st-th-sub st-sep-l" : "uppercase st-th-sub"} bd={c.hex}>
                  Score
                </Tint>
                <Tint as="th" className="uppercase st-th-sub" bd={c.hex}>
                  {is9h ? (exp9 !== null ? "SD 18h" : "SD 9h") : "SD"}
                </Tint>
                {hasNet && <Tint as="th" className="st-th-sub" bd={c.hex}>Net</Tint>}
              </React.Fragment>
            ))}
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
                className={["sim-row st-row", isPar ? "sim-row-par" : "", isSel ? "is-sel" : ""].filter(Boolean).join(" ")}
              >
                {/* ±Par column */}
                <td className={"st-td st-td-dp" + (isSel ? " is-sel" : isPar ? " is-par" : "")}>
                  {fmtToPar(r.delta)}
                </td>
                {r.cells.map((cell, i) => {
                  const col = cols[i];
                  const tHex = col.hex;
                  const isHcp =
                    col.playingHcp !== null &&
                    r.delta === Math.round(col.playingHcp);
                  // Linha do HCP de jogo: fundo e linhas na cor do tee.
                  const hcpBg = isHcp ? `${tHex}25` : null;
                  const hcpBd = isHcp ? tHex : null;
                  const hcpCls = isHcp ? " st-hcp" : "";
                  return (
                    <React.Fragment key={i}>
                      <Tint as="td" bg={hcpBg} bd={hcpBd}
                        className={"st-td st-td-score" + hcpCls + (!isHcp && isPar ? " is-par" : "") + (i > 0 ? " st-sep-l" : "")}>
                        {cell.score}
                      </Tint>
                      <Tint as="td" bg={hcpBg} bd={hcpBd} className={"mono st-td st-td-sd" + hcpCls}>
                        {fmtSD(cell.sd18)}
                      </Tint>
                      {hasNet && (
                        <Tint as="td" bg={hcpBg} bd={hcpBd} className={"st-td st-td-net" + hcpCls}>
                          {cell.net ?? "–"}
                        </Tint>
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
