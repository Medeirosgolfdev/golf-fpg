import React, { useCallback, useMemo, useState } from "react";
import type { Course, Tee, Hole } from "../data/types";
import TeeBadge from "../ui/TeeBadge";
import { getTeeHex, textOnColor } from "../utils/teeColors";
import { fmt, fmtCR, norm, titleCase } from "../utils/format";
import { SC } from "../utils/scoreDisplay";
import OverlayExport from "../ui/OverlayExport";
import type { OverlayData } from "../ui/OverlayExport";

type Props = { courses: Course[] };

type SexFilter = "ALL" | "M" | "F";
type HolesMode = "18" | "front9" | "back9";

/* ─── Helpers ─── */

function teeHex(t: Tee): string {
  return getTeeHex(t.teeName, t.scorecardMeta?.teeColor);
}

function sexRank(s: string) {
  if (s === "M") return 0;
  if (s === "F") return 1;
  return 2;
}

function sortTees(tees: Tee[]): Tee[] {
  return [...tees].sort((a, b) => {
    const da = a.distances?.total ?? -1;
    const db = b.distances?.total ?? -1;
    if (db !== da) return db - da;
    const sr = sexRank(a.sex) - sexRank(b.sex);
    if (sr !== 0) return sr;
    return a.teeName.localeCompare(b.teeName, "pt-PT", { sensitivity: "base" });
  });
}

function filterTees(tees: Tee[], sex: SexFilter): Tee[] {
  if (sex === "ALL") return tees;
  return tees.filter((t) => t.sex === sex);
}

/** Score Differential = (113 / Slope) × (Score - CR - PCC) */
function calcSD(score: number, cr: number, slope: number, pcc = 0): number {
  return (113 / slope) * (score - cr - pcc);
}

/** Inverso: Score = SD × (Slope / 113) + CR + PCC */
function calcScore(sd: number, cr: number, slope: number, pcc = 0): number {
  return sd * (slope / 113) + cr + pcc;
}

/** Course Handicap = HI × (Slope / 113) + (CR - Par)
 *  Usado para: distribuição de pancadas por buraco, Net Double Bogey (AGS) */
function calcCourseHcp(hi: number, slope: number, cr: number, par: number): number {
  return hi * (slope / 113) + (cr - par);
}

/** Playing Handicap = Course Handicap × Allowance%
 *  Usado para: cálculo de Net Score em competição (95%, 85%, etc.)
 *  Sem allowance (100%) = Course Handicap */
function calcPlayingHcp(hi: number, slope: number, cr: number, par: number, allowance = 1): number {
  return calcCourseHcp(hi, slope, cr, par) * allowance;
}

/**
 * WHS 2024 – Expected 9-hole Score Differential.
 * Fórmula aproximada extraída dos dados oficiais (okrasa.eu / USGA FAQ):
 *   Expected_9h_SD ≈ HI × 0.52 + 1.2
 *
 * Tabela de referência (HI inteiro → Expected 9h SD):
 *   0→1.2  1→1.7  2→2.2  3→2.8  4→3.3  5→3.8
 *   6→4.3  7→4.8  8→5.4  9→5.9  10→6.4 11→6.9
 *  12→7.4 13→8.0 14→8.5 15→9.0 16→9.5 17→10.0
 *  18→10.6 …
 *
 * Verificação: HI=14, SD_9h=7.2 → SD_18h = 7.2 + 8.5 = 15.7 ✓ (exemplo USGA)
 */
function expectedSD9(hi: number): number {
  // Tabela extraída dos dados oficiais com interpolação linear para HI fracionários
  const table: Record<number, number> = {
    0: 1.2, 1: 1.7, 2: 2.2, 3: 2.8, 4: 3.3, 5: 3.8,
    6: 4.3, 7: 4.8, 8: 5.4, 9: 5.9, 10: 6.4, 11: 6.9,
    12: 7.4, 13: 8.0, 14: 8.5, 15: 9.0, 16: 9.5, 17: 10.0,
    18: 10.6, 19: 11.1, 20: 11.6, 21: 12.2, 22: 12.7, 23: 13.2,
    24: 13.7, 25: 14.2, 26: 14.8, 27: 15.3, 28: 15.8, 29: 16.3,
    30: 16.8, 31: 17.4, 32: 17.9, 33: 18.4, 34: 18.9, 35: 19.4,
    36: 20.0, 37: 20.5, 38: 21.0, 39: 21.5, 40: 22.0,
    41: 22.6, 42: 23.1, 43: 23.6, 44: 24.1, 45: 24.6,
    46: 25.2, 47: 25.7, 48: 26.2, 49: 26.7, 50: 27.2,
    51: 27.8, 52: 28.3, 53: 28.8, 54: 29.3,
  };

  const clamped = Math.min(54, Math.max(0, hi));
  const lo = Math.floor(clamped);
  const loVal = table[lo] ?? (lo * 0.52 + 1.2);
  const hiKey = Math.min(lo + 1, 54);
  const hiVal = table[hiKey] ?? (hiKey * 0.52 + 1.2);
  const frac = clamped - lo;
  return loVal + frac * (hiVal - loVal);
}

/** Formata SD com sinal e 1 casa decimal */
function fmtSD(sd: number): string {
  const sign = sd >= 0 ? "+" : "";
  return `${sign}${sd.toFixed(1)}`;
}

/** Extrai ratings de 9 buracos do tee */
function get9hRatings(tee: Tee, nine: "front9" | "back9") {
  const key = nine === "front9" ? "holes9Front" : "holes9Back";
  const r = tee.ratings?.[key];
  if (!r?.courseRating || !r?.slopeRating) return null;
  return { cr: r.courseRating, slope: r.slopeRating, par: r.par ?? null };
}

/* ─── Componente: Tabela de SD por Score (18h e 9h) ─── */

function SDTable({
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

    const playingHcp = hi !== null ? Math.round(calcPlayingHcp(hi, slope, cr, par)) : null;
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
      result.push({
        score,
        vsPar: delta,
        sd9: sd,
        sd18,
        expected9: exp9,
        netScore: net,
      });
    }
    return result;
  }, [cr, slope, par, pcc, hi, is9h]);

  return (
    <div className="sim-table-wrap">
      <table className="sim-table">
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
            const isBogey = r.vsPar === Math.round(
              hi !== null ? calcPlayingHcp(hi, slope, cr, par) : 999
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
                <td className="sim-td sim-td-vspar">
                  {r.vsPar === 0 ? "E" : r.vsPar > 0 ? `+${r.vsPar}` : r.vsPar}
                </td>
                {is9h ? (
                  <>
                    <td className="sim-td sim-td-sd">{fmtSD(r.sd9)}</td>
                    {hi !== null && (
                      <td className="sim-td sim-td-sd sim-td-sd18">{fmtSD(r.sd18)}</td>
                    )}
                  </>
                ) : (
                  <td className="sim-td sim-td-sd">{fmtSD(r.sd18)}</td>
                )}
                {hi !== null && (
                  <td className="sim-td sim-td-net">
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




/* ─── Componente: Tabela Multi-Tee (todos os tees masculinos lado a lado) ─── */

interface TeeCol {
  teeName: string;
  hex: string;
  cr: number;
  slope: number;
  par: number;
  dist: number | null;
  playingHcp: number | null;
}

function MultiTeeSDTable({
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
    const maleTees = tees.filter(t => t.sex === "M");
    const sorted = sortTees(maleTees);
    const result: TeeCol[] = [];
    for (const t of sorted) {
      let cr: number | undefined, slope: number | undefined, par: number | undefined;
      if (is9h) {
        const r9 = get9hRatings(t, holesMode as "front9" | "back9");
        if (!r9) continue;
        cr = r9.cr; slope = r9.slope; par = r9.par ?? 36;
      } else {
        cr = t.ratings?.holes18?.courseRating ?? undefined;
        slope = t.ratings?.holes18?.slopeRating ?? undefined;
        par = t.ratings?.holes18?.par ?? 72;
      }
      if (!cr || !slope) continue;
      const phcp = hi !== null ? Math.round(calcPlayingHcp(hi, slope, cr, par, allowance / 100)) : null;
      const dist = is9h
        ? (holesMode === "front9" ? t.distances?.front9 : t.distances?.back9) ?? null
        : t.distances?.total ?? null;
      result.push({ teeName: t.teeName, hex: teeHex(t), cr, slope, par, dist, playingHcp: phcp });
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
      const cells = cols.map(c => {
        const score = c.par + delta;
        const sd = calcSD(score, c.cr, c.slope, pcc);
        const sd18 = is9h && exp9 !== null ? sd + exp9 : sd;
        const net = c.playingHcp !== null ? score - c.playingHcp : null;
        return { score, sd, sd18, net };
      });
      // Skip row if any tee produces a score below minimum
      if (cells.some(c => c.score < minScore)) continue;
      result.push({ delta, cells });
    }
    return result;
  }, [cols, pcc, is9h, exp9]);

  if (cols.length < 2) return null;

  const hasNet = hi !== null;
  const colCount = hasNet ? 3 : 2;  // Score, SD, [Net]
  const ROW1_H = 30;
  const stickyBase: React.CSSProperties = { position: "sticky", zIndex: 3 };

  return (
    <div className="sim-table-wrap scroll-x" style={{ maxHeight: 500 }}>
      <table className="sim-table sim-multi-tee" style={{ borderCollapse: "collapse" }}>
        <thead>
          {/* Row 1: tee color headers — sticky top:0 */}
          <tr>
            <th rowSpan={2} style={{
              ...stickyBase,
              top: 0,
              verticalAlign: "bottom",
              minWidth: 50,
              background: "var(--bg)",
              borderBottom: "2px solid var(--border)",
              padding: "6px 8px",
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--text-3)",
              textAlign: "center",
            }}>
              ±Par
            </th>
            {cols.map((c, i) => (
              <th key={i} colSpan={colCount}
                style={{
                  ...stickyBase,
                  top: 0,
                  background: c.hex,
                  color: textOnColor(c.hex),
                  textAlign: "center",
                  padding: "5px 8px",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  borderLeft: i > 0 ? "2px solid var(--border)" : undefined,
                  borderBottom: "none",
                }}>
                {c.teeName}
                <span className="op-7 fs-9 fw-400" style={{ marginLeft: 5 }}>
                  {c.dist != null && <>{fmt(c.dist)}m · </>}CR {fmtCR(c.cr)} · SR {c.slope} · Par {c.par}
                </span>
              </th>
            ))}
          </tr>
          {/* Row 2: sub-headers — sticky top:ROW1_H */}
          <tr>
            {cols.map((c, i) => {
              const base: React.CSSProperties = {
                ...stickyBase,
                top: ROW1_H,
                zIndex: 2,
                background: "var(--bg)",
                padding: "4px 8px",
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-3)",
                textAlign: "right",
                borderBottom: `3px solid ${c.hex}`,
              };
              return (
                <React.Fragment key={i}>
                  <th style={{ ...base, borderLeft: i > 0 ? "2px solid var(--border)" : undefined }}>Score</th>
                  <th style={base}>{is9h ? (exp9 !== null ? "SD 18h" : "SD 9h") : "SD"}</th>
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
              <tr key={r.delta}
                onClick={() => setSelectedDelta(prev => prev === r.delta ? null : r.delta)}
                style={{
                  cursor: "pointer",
                  background: isSel ? "var(--accent-light, #eff6ff)" : undefined,
                  outline: isSel ? "2px solid var(--accent)" : undefined,
                  outlineOffset: -1,
                }}
                className={[
                  "sim-row",
                  isPar ? "sim-row-par" : "",
                ].join(" ")}>
                {/* ±Par column */}
                <td style={{
                  fontWeight: 700,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  padding: "5px 8px",
                  fontSize: 12,
                  borderBottom: "1px solid var(--border-light)",
                  background: isSel ? "var(--accent)" : isPar ? "var(--accent-light)" : undefined,
                  color: isSel ? "#fff" : isPar ? "var(--accent)" : undefined,
                }}>
                  {r.delta === 0 ? "E" : r.delta > 0 ? `+${r.delta}` : r.delta}
                </td>
                {r.cells.map((cell, i) => {
                  const col = cols[i];
                  const tHex = col.hex;
                  const isHcp = col.playingHcp !== null && r.delta === Math.round(col.playingHcp);
                  // HCP highlight: strong tee-colored band
                  const hcpStyle: React.CSSProperties = isHcp ? {
                    background: `${tHex}25`,
                    borderTop: `2px solid ${tHex}`,
                    borderBottom: `2px solid ${tHex}`,
                  } : {};
                  // PAR row: just subtle bold, no colored band
                  const tdBase: React.CSSProperties = {
                    padding: "5px 8px",
                    borderBottom: "1px solid var(--border-light)",
                    ...hcpStyle,
                  };
                  return (
                    <React.Fragment key={i}>
                      <td style={{
                        ...tdBase,
                        textAlign: "center",
                        fontWeight: isHcp ? 800 : isPar ? 700 : 600,
                        borderLeft: i > 0 ? "2px solid var(--border-light)" : undefined,
                        color: isHcp ? "var(--grey-900)" : isPar ? "var(--accent)" : undefined,
                      }}>{cell.score}</td>
                      <td className="mono" style={{
                        ...tdBase,
                        textAlign: "right",
                        fontSize: 12,
                        fontWeight: isHcp ? 700 : 600,
                        color: isHcp ? "var(--grey-900)" : undefined,
                      }}>
                        {fmtSD(cell.sd18)}
                      </td>
                      {hasNet && (
                        <td style={{
                          ...tdBase,
                          textAlign: "right",
                          color: isHcp ? "var(--grey-900)" : "var(--text-2)",
                          fontWeight: isHcp ? 700 : 400,
                        }}>{cell.net ?? "–"}</td>
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


const MANUAL_KEY = "__manual__";

type ManualRatings = { cr: string; slope: string; par: string };
const emptyManual = (): ManualRatings => ({ cr: "", slope: "", par: "" });

function parseManual(m: ManualRatings): { cr: number; slope: number; par: number } | null {
  const cr = parseFloat(m.cr.replace(",", "."));
  const slope = parseFloat(m.slope.replace(",", "."));
  if (isNaN(cr) || isNaN(slope) || slope <= 0) return null;
  const par = parseInt(m.par, 10);
  return { cr, slope, par: isNaN(par) ? (cr > 50 ? 72 : 36) : par };
}

/* ─── Componente: Inputs manuais de ratings ─── */

function ManualInputs({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ManualRatings;
  onChange: (v: ManualRatings) => void;
}) {
  return (
    <div className="sim-manual-group">
      <span className="sim-manual-label">{label}</span>
      <div className="sim-manual-fields">
        <div className="field">
          <label>CR</label>
          <input
            className="input col-w72"
            type="text"
            inputMode="decimal"
            placeholder="ex: 68,4"
            value={value.cr}
            onChange={(e) => onChange({ ...value, cr: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Slope</label>
          <input
            className="input"
            type="text"
            inputMode="numeric"
            placeholder="ex: 128"
            value={value.slope}
            onChange={(e) => onChange({ ...value, slope: e.target.value })}
            style={{ width: 64 }}
          />
        </div>
        <div className="field">
          <label>Par</label>
          <input
            className="input"
            type="text"
            inputMode="numeric"
            placeholder={label.includes("9") ? "36" : "72"}
            value={value.par}
            onChange={(e) => onChange({ ...value, par: e.target.value })}
            style={{ width: 52 }}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Componente: Strip de Handicaps + Ratings + Calc rápida ─── */

function HcpStrip({
  hi, courseHcp, playingHcp, allowance, cr, slope, par, pcc, is9h, exp9hSD,
}: {
  hi: number | null;
  courseHcp: number | null;
  playingHcp: number | null;
  allowance: number;
  cr: number;
  slope: number;
  par: number;
  pcc: number;
  is9h: boolean;
  exp9hSD: number | null;
}) {
  const [calcMode, setCalcMode] = useState<"score-to-sd" | "sd-to-score">("score-to-sd");
  const [calcInput, setCalcInput] = useState("");

  const calcResult = useMemo(() => {
    const v = parseFloat(calcInput.replace(",", "."));
    if (isNaN(v)) return null;
    if (calcMode === "score-to-sd") {
      const sd = calcSD(v, cr, slope, pcc);
      if (is9h && hi !== null) {
        const exp9 = expectedSD9(hi);
        return { value: fmtSD(sd + exp9), detail: `9h: ${sd.toFixed(1)} + ${exp9.toFixed(1)}` };
      }
      return { value: fmtSD(sd), detail: null };
    } else {
      if (is9h && hi !== null) {
        const exp9 = expectedSD9(hi);
        const score = calcScore(v - exp9, cr, slope, pcc);
        return { value: String(Math.ceil(score)), detail: `SD 9h: ${(v - exp9).toFixed(1)}` };
      }
      const score = calcScore(v, cr, slope, pcc);
      return { value: String(Math.ceil(score)), detail: null };
    }
  }, [calcInput, calcMode, cr, slope, pcc, hi, is9h]);

  return (
    <div className="sim-strip">
      {/* HCP cards */}
      {hi !== null && (
        <>
          <div className="sim-strip-cell">
            <span className="sim-strip-label">Handicap Index</span>
            <span className="sim-strip-num">{hi.toFixed(1)}</span>
          </div>
          <div className="sim-strip-cell sim-strip-cell-accent">
            <span className="sim-strip-label">Course HCP{is9h ? " (9h)" : ""}</span>
            <span className="sim-strip-num">{courseHcp !== null ? Math.round(courseHcp) : "–"}</span>
            {courseHcp !== null && <span className="sim-strip-sub">({courseHcp.toFixed(1)})</span>}
          </div>
          <div className="sim-strip-cell sim-strip-cell-accent">
            <span className="sim-strip-label">Playing HCP{allowance !== 100 ? ` (${allowance}%)` : ""}</span>
            <span className="sim-strip-num">{playingHcp !== null ? Math.round(playingHcp) : "–"}</span>
            {playingHcp !== null && <span className="sim-strip-sub">({playingHcp.toFixed(1)})</span>}
          </div>
        </>
      )}

      {/* Ratings */}
      <div className="sim-strip-cell">
        <span className="sim-strip-label">Course Rating</span>
        <span className="sim-strip-num">{fmtCR(cr)}</span>
      </div>
      <div className="sim-strip-cell">
        <span className="sim-strip-label">Slope Rating</span>
        <span className="sim-strip-num">{slope}</span>
      </div>
      <div className="sim-strip-cell">
        <span className="sim-strip-label">Par</span>
        <span className="sim-strip-num">{par}</span>
      </div>
      {pcc !== 0 && (
        <div className="sim-strip-cell">
          <span className="sim-strip-label">PCC</span>
          <span className="sim-strip-num">{pcc > 0 ? `+${pcc}` : pcc}</span>
        </div>
      )}
      {exp9hSD !== null && (
        <div className="sim-strip-cell sim-strip-cell-9h">
          <span className="sim-strip-label">Expected SD 9h</span>
          <span className="sim-strip-num">{exp9hSD.toFixed(1)}</span>
        </div>
      )}

      {/* Inline QuickCalc — Score always left, SD always right */}
      <div className="sim-strip-calc">
        <div className="sim-strip-calc-tabs">
          <button className={`sim-strip-tab${calcMode === "score-to-sd" ? " active" : ""}`}
            onClick={() => { setCalcMode("score-to-sd"); setCalcInput(""); }}>Score → SD</button>
          <button className={`sim-strip-tab${calcMode === "sd-to-score" ? " active" : ""}`}
            onClick={() => { setCalcMode("sd-to-score"); setCalcInput(""); }}>SD → Score</button>
        </div>
        <div className="sim-strip-calc-fields">
          {/* Left: always Gross Score */}
          <div className="sim-strip-calc-field">
            <span className="sim-strip-label">{is9h ? "Gross Score (9h)" : "Gross Score"}</span>
            {calcMode === "score-to-sd" ? (
              <input className="sim-strip-calc-input" type="text" inputMode="decimal"
                value={calcInput} onChange={e => setCalcInput(e.target.value)}
                placeholder={`ex: ${par}`} />
            ) : (
              <span className="sim-strip-calc-output">{calcResult ? calcResult.value : "–"}</span>
            )}
          </div>
          {/* Right: always SD */}
          <div className="sim-strip-calc-field">
            <span className="sim-strip-label">{is9h ? "SD 18h" : "Score Differential"}</span>
            {calcMode === "sd-to-score" ? (
              <input className="sim-strip-calc-input" type="text" inputMode="decimal"
                value={calcInput} onChange={e => setCalcInput(e.target.value)}
                placeholder="ex: 18" />
            ) : (
              <span className="sim-strip-calc-output">{calcResult ? calcResult.value : "–"}</span>
            )}
          </div>
        </div>
        {calcResult?.detail && <span className="sim-strip-sub">{calcResult.detail}</span>}
      </div>
    </div>
  );
}

const USGA_NDB_LINK = "https://www.usga.org/content/usga/home-page/handicapping/world-handicap-system/topics/net-double-bogey.html";

function calcStrokesPerHole(holes: Hole[], ch: number) {
  return holes
    .filter(h => h.par != null && h.si != null)
    .map(h => {
      const si = h.si!;
      let strokes = 0;
      if (si <= Math.min(ch, 18)) strokes++;
      if (ch > 18 && si <= Math.min(ch - 18, 18)) strokes++;
      if (ch > 36 && si <= Math.min(ch - 36, 18)) strokes++;
      return { hole: h.hole, par: h.par!, si, strokes, maxScore: h.par! + 2 + strokes };
    })
    .sort((a, b) => a.hole - b.hole);
}

type OverlayHoleData = { par: number[]; scores: (number | null)[]; si: number[] };

function AgsSection({
  hi, holes, cr, slope, par, pcc, is9h, holesMode, onOverlayData,
}: {
  hi: number | null;
  holes: Hole[] | null;
  cr: number;
  slope: number;
  par: number;
  pcc: number;
  is9h: boolean;
  holesMode: string;
  onOverlayData?: (data: OverlayHoleData | null) => void;
}) {
  const nHoles = is9h ? 9 : 18;
  const [scores, setScores] = useState<Record<number, string>>({});
  const [customPars, setCustomPars] = useState<Record<number, string>>({});
  const [customSIs, setCustomSIs] = useState<Record<number, string>>({});
  const isSynthetic = !holes?.length;

  const courseHcp = hi !== null ? Math.round(calcCourseHcp(hi, slope, cr, par)) : null;
  const hasAgs = courseHcp !== null;

  const fieldHoles = useMemo(() => {
    if (holes?.length) {
      let subset = holes;
      if (is9h) {
        subset = holesMode === "front9" ? holes.filter(h => h.hole <= 9) : holes.filter(h => h.hole > 9);
      }
      const valid = subset.filter(h => h.par != null && h.si != null);
      if (valid.length >= nHoles) return valid.sort((a, b) => a.hole - b.hole);
    }
    /* Sem dados de buracos → gerar sintéticos (editáveis pelo user) */
    const parPer = par / nHoles;
    const defPar = parPer >= 3.5 ? 4 : 3;
    const start = is9h && holesMode === "back9" ? 10 : 1;
    return Array.from({ length: nHoles }, (_, i) => {
      const hole = start + i;
      const cp = parseInt(customPars[hole] || "", 10);
      const cs = parseInt(customSIs[hole] || "", 10);
      return {
        hole,
        par: (!isNaN(cp) && cp >= 3 && cp <= 6 ? cp : defPar) as number,
        si: (!isNaN(cs) && cs >= 1 && cs <= 18 ? cs : i + 1) as number,
        distance: null as number | null,
      };
    }) as Hole[];
  }, [holes, is9h, holesMode, nHoles, par, customPars, customSIs]);

  const holeData = useMemo(() => {
    if (!fieldHoles) return null;
    if (hasAgs) return calcStrokesPerHole(fieldHoles, courseHcp!);
    return fieldHoles.map(h => ({ hole: h.hole, par: h.par!, si: h.si!, strokes: 0, maxScore: 0 }));
  }, [fieldHoles, courseHcp, hasAgs]);

  /* Computed values per hole */
  const computed = useMemo(() => {
    if (!holeData) return null;
    return holeData.map(h => {
      const val = parseInt(scores[h.hole] || "", 10);
      const actual = !isNaN(val) && val > 0 ? val : null;
      const adjusted = actual !== null && hasAgs ? Math.min(actual, h.maxScore) : null;
      const vsPar = actual !== null ? actual - h.par : null;
      return { ...h, actual, adjusted, vsPar };
    });
  }, [holeData, scores, hasAgs]);

  /* Totals */
  const totals = useMemo(() => {
    if (!computed) return null;
    const filled = computed.filter(h => h.actual !== null);
    const allFilled = filled.length === computed.length && filled.length > 0;
    const grossTotal = allFilled ? filled.reduce((s, h) => s + h.actual!, 0) : null;
    const agsTotal = allFilled && hasAgs ? filled.reduce((s, h) => s + h.adjusted!, 0) : null;
    return {
      grossTotal,
      agsTotal,
      sdGross: grossTotal !== null ? calcSD(grossTotal, cr, slope, pcc) : null,
      sdAgs: agsTotal !== null ? calcSD(agsTotal, cr, slope, pcc) : null,
      filled: filled.length,
      total: computed.length,
    };
  }, [computed, cr, slope, pcc, hasAgs]);

  const setScore = (hole: number, val: string) => setScores(prev => ({ ...prev, [hole]: val }));
  const setCustomPar = (hole: number, val: string) => setCustomPars(prev => ({ ...prev, [hole]: val }));
  const setCustomSI = (hole: number, val: string) => setCustomSIs(prev => ({ ...prev, [hole]: val }));
  const clearAll = () => { setScores({}); if (isSynthetic) { setCustomPars({}); setCustomSIs({}); } };

  /* Always report overlay data (par/si/current scores) */
  React.useEffect(() => {
    if (!onOverlayData) return;
    if (!computed) { onOverlayData(null); return; }
    onOverlayData({
      par: computed.map(h => h.par),
      scores: computed.map(h => h.actual),
      si: computed.map(h => h.si),
    });
  }, [computed, onOverlayData]);

  /* No hole data → info only */
  if (!fieldHoles || !computed) {
    return (
      <div className="m-14-0">
        <div className="sim-info-box sim-warn-box">
          <strong>Scorecard / AGS:</strong> O scorecard para introduzir scores por buraco e calcular o SD exacto
          aparece quando selecionas um campo com dados de Par e Stroke Index.
          {" "}<a href={USGA_NDB_LINK} target="_blank" rel="noopener noreferrer"
            className="c-amber-underline">Net Double Bogey — USGA →</a>
        </div>
      </div>
    );
  }

  /* ── Horizontal scorecard helpers ── */
  const is18 = !is9h && computed.length >= 18;
  const front = is18 ? computed.slice(0, 9) : computed;
  const back = is18 ? computed.slice(9, 18) : [];

  const sumPar = (slice: typeof computed) => slice.reduce((s, h) => s + h.par, 0);
  const sumGross = (slice: typeof computed) => {
    const f = slice.filter(h => h.actual !== null);
    return f.length === slice.length ? f.reduce((s, h) => s + h.actual!, 0) : null;
  };
  const sumAdj = (slice: typeof computed) => {
    const f = slice.filter(h => h.adjusted !== null);
    return f.length === slice.length ? f.reduce((s, h) => s + h.adjusted!, 0) : null;
  };
  const sumMax = (slice: typeof computed) => slice.reduce((s, h) => s + h.maxScore, 0);
  const fmtVsPar = (gross: number | null, p: number) => {
    if (gross === null) return "–";
    const d = gross - p;
    return d === 0 ? "E" : d > 0 ? `+${d}` : String(d);
  };

  const totalParAll = sumPar(computed);
  const grossOut = sumGross(front);
  const grossIn = is18 ? sumGross(back) : null;
  const grossTotal = totals?.grossTotal ?? null;
  const adjOut = hasAgs ? sumAdj(front) : null;
  const adjIn = hasAgs && is18 ? sumAdj(back) : null;
  const adjTotal = totals?.agsTotal ?? null;

  return (
    <div className="m-14-0">
      <div className="flex-between-mb6">
        <h3 className="sim-section-title m-0">
          Scorecard {hasAgs ? "— Net Double Bogey / AGS" : ""}
        </h3>
        {Object.keys(scores).length > 0 && (
          <button className="select pointer fs-12" onClick={clearAll}>Limpar</button>
        )}
      </div>

      {/* Results cards — above scorecard */}
      {totals && totals.grossTotal !== null && (
        <div className="sim-results-cards">
          <div className="sim-strip-cell">
            <span className="sim-strip-label">Gross</span>
            <span className="sim-strip-num">{totals.grossTotal}</span>
            <span className="sim-strip-sub">SD {fmtSD(totals.sdGross!)}</span>
          </div>
          {hasAgs && totals.agsTotal !== null && (
            <div className="sim-strip-cell sim-strip-cell-ags">
              <span className="sim-strip-label">Adjusted Gross (AGS)</span>
              <span className="sim-strip-num">{totals.agsTotal}</span>
              <span className="sim-strip-sub">SD {fmtSD(totals.sdAgs!)}</span>
            </div>
          )}
          {hasAgs && totals.grossTotal !== null && totals.agsTotal !== null && totals.grossTotal > totals.agsTotal && (
            <div className="sim-strip-cell sim-strip-cell-cut">
              <span className="sim-strip-label">Cortadas</span>
              <span className="sim-strip-num">−{totals.grossTotal - totals.agsTotal}</span>
              <span className="sim-strip-sub">SD melhora {(totals.sdGross! - totals.sdAgs!).toFixed(1)}</span>
            </div>
          )}
        </div>
      )}
      {totals && totals.filled > 0 && totals.filled < totals.total && (
        <div className="muted mb-8 fs-12">
          {totals.filled} de {totals.total} buracos. Preenche todos para ver o SD.
        </div>
      )}

      <div className="scroll-x">
        <table className="sc-table-modern" data-sc-table="1">
          <thead>
            <tr>
              <th className="hole-header sim-br-sep">Buraco</th>
              {front.map((h, i) => (
                <React.Fragment key={h.hole}>
                  <th className="hole-header">{h.hole}</th>
                  {is18 && i === 8 && <th className="hole-header col-out fs-10">Out</th>}
                </React.Fragment>
              ))}
              {is18 && back.map((h) => (
                <th key={h.hole} className="hole-header">{h.hole}</th>
              ))}
              <th className={`hole-header col-${is18 ? "in" : "total"} fs-10`}>{is18 ? "In" : "TOTAL"}</th>
              {is18 && <th className="hole-header col-total">TOTAL</th>}
            </tr>
          </thead>
          <tbody>
            {/* Par */}
            <tr className="sep-row">
              <td className="row-label par-label">Par</td>
              {front.map((h, i) => (
                <React.Fragment key={h.hole}>
                  <td>{isSynthetic ? (
                    <input type="text" inputMode="numeric"
                      value={customPars[h.hole] ?? String(h.par)}
                      onChange={e => setCustomPar(h.hole, e.target.value.replace(/\D/g, ""))}
                      className="sim-input-accent"
                    />
                  ) : h.par}</td>
                  {is18 && i === 8 && <td className="col-out fw-700">{sumPar(front)}</td>}
                </React.Fragment>
              ))}
              {is18 && back.map((h) => <td key={h.hole}>{isSynthetic ? (
                <input type="text" inputMode="numeric"
                  value={customPars[h.hole] ?? String(h.par)}
                  onChange={e => setCustomPar(h.hole, e.target.value.replace(/\D/g, ""))}
                  className="sim-input-accent"
                />
              ) : h.par}</td>)}
              <td className={`col-${is18 ? "in" : "total"} fw-700`}>{is18 ? sumPar(back) : totalParAll}</td>
              {is18 && <td className="col-total fw-700">{totalParAll}</td>}
            </tr>

            {/* S.I. */}
            <tr className="meta-row">
              <td className="row-label c-muted fs-10 fw-400">S.I.</td>
              {front.map((h, i) => (
                <React.Fragment key={h.hole}>
                  <td>{isSynthetic ? (
                    <input type="text" inputMode="numeric"
                      value={customSIs[h.hole] ?? String(h.si)}
                      onChange={e => setCustomSI(h.hole, e.target.value.replace(/\D/g, ""))}
                      className="sim-input-sm"
                    />
                  ) : h.si}</td>
                  {is18 && i === 8 && <td className="col-out" />}
                </React.Fragment>
              ))}
              {is18 && back.map((h) => <td key={h.hole}>{isSynthetic ? (
                <input type="text" inputMode="numeric"
                  value={customSIs[h.hole] ?? String(h.si)}
                  onChange={e => setCustomSI(h.hole, e.target.value.replace(/\D/g, ""))}
                  className="sim-input-sm"
                />
              ) : h.si}</td>)}
              <td className={`col-${is18 ? "in" : "total"}`} />
              {is18 && <td className="col-total" />}
            </tr>

            {/* Score (inputs) */}
            <tr className="sep-row">
              <td className="row-label fw-700">Score</td>
              {front.map((h, i) => (
                <React.Fragment key={h.hole}>
                  <td className="sim-cell-micro">
                    <input type="text" inputMode="numeric"
                      value={scores[h.hole] || ""}
                      onChange={e => setScore(h.hole, e.target.value.replace(/\D/g, ""))}
                      className="sim-input"
                      placeholder="·" />
                  </td>
                  {is18 && i === 8 && (
                    <td className="col-out fw-700">{grossOut ?? "–"}</td>
                  )}
                </React.Fragment>
              ))}
              {is18 && back.map((h) => (
                <td key={h.hole} className="sim-cell-micro">
                  <input type="text" inputMode="numeric"
                    value={scores[h.hole] || ""}
                    onChange={e => setScore(h.hole, e.target.value.replace(/\D/g, ""))}
                    className="sim-input"
                    placeholder="·" />
                </td>
              ))}
              <td className={`col-${is18 ? "in" : "total"} fw-700`}>{is18 ? (grossIn ?? "–") : (grossTotal ?? "–")}</td>
              {is18 && <td className="col-total fw-900">{grossTotal ?? "–"}</td>}
            </tr>

            {/* ±Par */}
            <tr className="meta-row">
              <td className="row-label c-muted fs-10 fw-400">±Par</td>
              {front.map((h, i) => (
                <React.Fragment key={h.hole}>
                  <td style={{ color: h.vsPar != null ? (h.vsPar < 0 ? SC.good : h.vsPar === 0 ? "var(--grey-500)" : h.vsPar <= 2 ? SC.warn : SC.danger) : "var(--grey-300)", fontWeight: h.vsPar != null ? 600 : 400 }}>
                    {h.vsPar != null ? (h.vsPar === 0 ? "E" : h.vsPar > 0 ? `+${h.vsPar}` : h.vsPar) : ""}
                  </td>
                  {is18 && i === 8 && (
 <td className="col-out fw-600" style={{ color: grossOut != null ? (grossOut - sumPar(front) <= 0 ? SC.good : SC.warn) : "var(--grey-300)" }}>
                      {fmtVsPar(grossOut, sumPar(front))}
                    </td>
                  )}
                </React.Fragment>
              ))}
              {is18 && back.map((h) => (
                <td key={h.hole} style={{ color: h.vsPar != null ? (h.vsPar < 0 ? SC.good : h.vsPar === 0 ? "var(--grey-500)" : h.vsPar <= 2 ? SC.warn : SC.danger) : "var(--grey-300)", fontWeight: h.vsPar != null ? 600 : 400 }}>
                  {h.vsPar != null ? (h.vsPar === 0 ? "E" : h.vsPar > 0 ? `+${h.vsPar}` : h.vsPar) : ""}
                </td>
              ))}
              <td className={`col-${is18 ? "in" : "total"} fw-600`}>
                {is18 ? fmtVsPar(grossIn, sumPar(back)) : fmtVsPar(grossTotal, totalParAll)}
              </td>
              {is18 && <td className="col-total fw-700">{fmtVsPar(grossTotal, totalParAll)}</td>}
            </tr>

            {/* ── AGS rows (only when HI filled) ── */}
            {hasAgs && (
              <>
                {/* Pancadas */}
                <tr className="meta-row">
                  <td className="row-label c-blue-2563-10">Panc.</td>
                  {front.map((h, i) => (
                    <React.Fragment key={h.hole}>
                      <td style={{ color: h.strokes > 0 ? "var(--chart-2)" : "var(--grey-300)", fontWeight: h.strokes > 0 ? 700 : 400 }}>
                        {h.strokes > 0 ? h.strokes : "·"}
                      </td>
                      {is18 && i === 8 && <td className="col-out" />}
                    </React.Fragment>
                  ))}
                  {is18 && back.map((h) => (
                    <td key={h.hole} style={{ color: h.strokes > 0 ? "var(--chart-2)" : "var(--grey-300)", fontWeight: h.strokes > 0 ? 700 : 400 }}>
                      {h.strokes > 0 ? h.strokes : "·"}
                    </td>
                  ))}
                  <td className={`col-${is18 ? "in" : "total"} fw-700 c-blue-2563`}>{courseHcp}</td>
                  {is18 && <td className="col-total fw-700 c-blue-2563">{courseHcp}</td>}
                </tr>

                {/* Máx (Net Double Bogey) */}
                <tr className="sep-row sim-warn-box">
                  <td className="row-label c-amber-11">Máx</td>
                  {front.map((h, i) => (
                    <React.Fragment key={h.hole}>
                      <td className="cb-amber">{h.maxScore}</td>
                      {is18 && i === 8 && <td className="col-out cb-amber">{sumMax(front)}</td>}
                    </React.Fragment>
                  ))}
                  {is18 && back.map((h) => (
                    <td key={h.hole} className="cb-amber">{h.maxScore}</td>
                  ))}
                  <td className={`col-${is18 ? "in" : "total"} cb-amber`}>{is18 ? sumMax(back) : sumMax(computed)}</td>
                  {is18 && <td className="col-total fw-900 c-amber">{sumMax(computed)}</td>}
                </tr>

                {/* Ajustado */}
                <tr>
                  <td className="row-label c-par-ok-11">Ajust.</td>
                  {front.map((h, i) => {
                    const capped = h.actual !== null && h.actual > h.maxScore;
                    return (
                      <React.Fragment key={h.hole}>
                        <td style={{ color: capped ? SC.danger : h.adjusted != null ? SC.good : "var(--grey-300)", fontWeight: h.adjusted != null ? 700 : 400 }}>
                          {h.adjusted != null ? h.adjusted : ""}
                          {capped && <span className="fs-8">✂</span>}
                        </td>
                        {is18 && i === 8 && (
                          <td className="col-out cb-par-ok">{adjOut ?? "–"}</td>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {is18 && back.map((h) => {
                    const capped = h.actual !== null && h.actual > h.maxScore;
                    return (
                      <td key={h.hole} style={{ color: capped ? SC.danger : h.adjusted != null ? SC.good : "var(--grey-300)", fontWeight: h.adjusted != null ? 700 : 400 }}>
                        {h.adjusted != null ? h.adjusted : ""}
                        {capped && <span className="fs-8">✂</span>}
                      </td>
                    );
                  })}
                  <td className={`col-${is18 ? "in" : "total"} cb-par-ok`}>{is18 ? (adjIn ?? "–") : (adjTotal ?? "–")}</td>
                  {is18 && <td className="col-total fw-900 c-par-ok">{adjTotal ?? "–"}</td>}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Info AGS colapsável */}
      {hasAgs && (
        <details className="mt-12">
          <summary className="sim-toggle-link">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
              <circle cx="8" cy="8" r="7" stroke="var(--color-warn-dark)" strokeWidth="1.5" fill="var(--bg-warn)"/>
              <text x="8" y="12" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--color-warn-dark)">i</text>
            </svg>
            Como funciona o Adjusted Gross Score?
          </summary>
          <div className="sim-info-box sim-warn-box mt-6">
            O WHS calcula o SD com o <em>Adjusted Gross Score</em>. Máximo por buraco = <strong>Net Double Bogey</strong>:
            <code className="sim-note-block">
              Máx = Par + 2 + Pancadas (Course HCP) nesse buraco
            </code>
            <div className="sim-note-alt">
              <div>① <strong>Handicap Index (HI)</strong> — número base do jogador.</div>
              <div className="mt-3">② <strong>Course Handicap (CH)</strong> = HI × (Slope ÷ 113) + (CR − Par). Determina pancadas para o Net Double Bogey.</div>
              <div className="mt-3">③ <strong>Playing Handicap</strong> = CH × % competição. Para Net Score, <strong>não</strong> para Net Double Bogey.</div>
            </div>
            {courseHcp !== null && (
              <div className="mt-6">
                HI <strong>{hi!.toFixed(1)}</strong> → CH = <strong>{courseHcp}</strong>.
                Recebes {courseHcp} pancada{courseHcp !== 1 ? "s" : ""} (SI 1–{Math.min(courseHcp, 18)}
                {courseHcp > 18 && (<>, 2ª SI 1–{courseHcp - 18}</>)}).
              </div>
            )}
            {/* Buraco mais difícil / mais fácil */}
            {fieldHoles.length > 0 && (() => {
              const sorted = [...fieldHoles].sort((a, b) => (a.si ?? 99) - (b.si ?? 99));
              const hardest = sorted[0];
              const easiest = sorted[sorted.length - 1];
              if (!hardest || !easiest) return null;
              return (
                <div className="sim-note">
                  <div>⛳ <strong>Buraco mais difícil:</strong> #{hardest.hole} (Par {hardest.par}, SI {hardest.si})</div>
                  <div>🏳 <strong>Buraco mais fácil:</strong> #{easiest.hole} (Par {easiest.par}, SI {easiest.si})</div>
                </div>
              );
            })()}
            <div className="mt-6">
              <a href={USGA_NDB_LINK} target="_blank" rel="noopener noreferrer"
                className="c-amber-underline">Net Double Bogey — USGA →</a>
            </div>
          </div>
        </details>
      )}

    </div>
  );
}

export default function SimuladorPage({ courses }: Props) {
  const [q, setQ] = useState("");
  const [sexFilter, setSexFilter] = useState<SexFilter>("ALL");
  const [holesMode, setHolesMode] = useState<HolesMode>("18");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedTeeIdx, setSelectedTeeIdx] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pcc, setPcc] = useState(0);
  const [hiInput, setHiInput] = useState("");
  const [allowance, setAllowance] = useState(100);

  /* Manual ratings state */
  const [manual18, setManual18] = useState<ManualRatings>(emptyManual());
  const [manualF9, setManualF9] = useState<ManualRatings>(emptyManual());
  const [manualB9, setManualB9] = useState<ManualRatings>(emptyManual());

  /* Overlay export state */
  const [overlayHoleData, setOverlayHoleData] = useState<OverlayHoleData | null>(null);
  const handleOverlayData = useCallback((data: OverlayHoleData | null) => {
    setOverlayHoleData(data);
  }, []);

  const isManual = selectedKey === MANUAL_KEY;

  const hi = useMemo(() => {
    const v = parseFloat(hiInput.replace(",", "."));
    return isNaN(v) ? null : v;
  }, [hiInput]);

  const is9h = holesMode === "front9" || holesMode === "back9";

  /* Filtrar campos */
  const filtered = useMemo(() => {
    const qq = norm(q);
    let list = courses;
    if (qq) {
      list = courses.filter((c) => {
        const name = norm(c.master.name);
        const key = norm(c.courseKey);
        return name.includes(qq) || key.includes(qq);
      });
    }
    return list;
  }, [courses, q]);

  /* Campo selecionado */
  const selected = useMemo(() => {
    if (isManual) return null;
    if (!selectedKey) return filtered[0] ?? null;
    return courses.find((c) => c.courseKey === selectedKey) ?? filtered[0] ?? null;
  }, [courses, filtered, selectedKey, isManual]);

  /* Tees do campo (filtrados por ter ratings para o modo actual) */
  const availableTees = useMemo(() => {
    if (!selected) return [];
    const tees = filterTees(selected.master.tees, sexFilter);
    return sortTees(tees.filter((t) => {
      if (is9h) {
        const r9 = get9hRatings(t, holesMode as "front9" | "back9");
        return r9 !== null;
      }
      return t.ratings?.holes18?.courseRating && t.ratings?.holes18?.slopeRating;
    }));
  }, [selected, sexFilter, holesMode, is9h]);

  /* Tee selecionado */
  const selectedTee = useMemo(() => {
    if (!availableTees.length) return null;
    if (selectedTeeIdx !== null && selectedTeeIdx < availableTees.length) {
      return availableTees[selectedTeeIdx];
    }
    return availableTees[0];
  }, [availableTees, selectedTeeIdx]);

  /* Dados do tee para cálculos (18h ou 9h) — campo selecionado OU manual */
  const teeData = useMemo(() => {
    if (isManual) {
      if (is9h) {
        const src = holesMode === "front9" ? manualF9 : manualB9;
        return parseManual(src);
      }
      return parseManual(manual18);
    }

    if (!selectedTee) return null;

    if (is9h) {
      const r9 = get9hRatings(selectedTee, holesMode as "front9" | "back9");
      if (!r9) return null;
      return { cr: r9.cr, slope: r9.slope, par: r9.par ?? 36 };
    }

    const cr = selectedTee.ratings?.holes18?.courseRating;
    const slope = selectedTee.ratings?.holes18?.slopeRating;
    const par = selectedTee.ratings?.holes18?.par ?? null;
    if (!cr || !slope) return null;
    return { cr, slope, par: par ?? 72 };
  }, [selectedTee, holesMode, is9h, isManual, manual18, manualF9, manualB9]);

  /* Course Handicap (100%) — usado para Net Double Bogey / AGS */
  const courseHcp = useMemo(() => {
    if (!teeData || hi === null) return null;
    return calcCourseHcp(hi, teeData.slope, teeData.cr, teeData.par);
  }, [teeData, hi]);

  /* Playing Handicap = CH × allowance% — usado para Net Score em competição */
  const playingHcp = useMemo(() => {
    if (courseHcp === null) return null;
    return courseHcp * (allowance / 100);
  }, [courseHcp, allowance]);

  /* Expected 9h SD */
  const exp9hSD = useMemo(() => {
    if (!is9h || hi === null) return null;
    return expectedSD9(hi);
  }, [is9h, hi]);

  const holesLabel = holesMode === "front9" ? "Front 9" : holesMode === "back9" ? "Back 9" : "18 buracos";

  /* Overlay export data — disponível sempre que há contexto mínimo */
  const overlayData: OverlayData | null = useMemo(() => {
    // Disponível com campo selecionado OU em modo manual (mesmo sem CR/Slope)
    if (!isManual && !teeData) return null;

    const courseName = isManual ? "Manual" : (selected?.master.name ?? "");
    const teeName = isManual ? "" : (selectedTee ? titleCase(selectedTee.teeName) : "");
    const teeDist = isManual ? null : (selectedTee?.distances?.total ?? null);

    const cr = teeData?.cr ?? 0;
    const slope = teeData?.slope ?? 113;
    const tdPar = teeData?.par ?? (is9h ? 36 : 72);

    // Scores completos para cálculo de SD
    const holeScores = overlayHoleData?.scores ?? null;
    const allFilled = holeScores ? holeScores.every(s => s !== null) : false;
    const grossTotal = allFilled ? (holeScores as number[]).reduce((a, b) => a + b, 0) : null;
    const sd = grossTotal !== null && slope > 0 ? calcSD(grossTotal, cr, slope, pcc) : null;

    return {
      courseName, teeName, teeDist,
      cr, slope,
      par: overlayHoleData?.par ?? [], scores: holeScores ?? [], si: overlayHoleData?.si ?? [],
      hi, courseHcp: courseHcp !== null ? Math.round(courseHcp) : null, sd,
      is9h, hasHoles: !!overlayHoleData,
      player: "", event: "", round: 1, date: "", position: "",
    };
  }, [overlayHoleData, teeData, selected, selectedTee, isManual, hi, courseHcp, pcc, is9h]);

  return (
    <div className="campos-page">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Fechar painel" : "Abrir painel"}
          >
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <input
            className="input"
            value={q}
            onChange={(e) => { setQ(e.target.value); setSelectedKey(null); }}
            placeholder="Nome do campo…"
          />
          <select className="select" value={holesMode} onChange={(e) => { setHolesMode(e.target.value as HolesMode); setSelectedTeeIdx(null); }}>
            <option value="18">18 buracos</option>
            <option value="front9">Front 9</option>
            <option value="back9">Back 9</option>
          </select>
          <select className="select" value={sexFilter} onChange={(e) => setSexFilter(e.target.value as SexFilter)}>
            <option value="ALL">Sexo</option>
            <option value="M">Masculino</option>
            <option value="F">Feminino</option>
          </select>
          <input
            className="input col-w100"
            value={hiInput}
            onChange={(e) => setHiInput(e.target.value)}
            placeholder="HI (ex: 15,4)"
          />
          <select className="select" value={pcc} onChange={(e) => setPcc(Number(e.target.value))}>
            {[-3, -2, -1, 0, 1, 2, 3].map((v) => (
              <option key={v} value={v}>{v === 0 ? "PCC 0" : v > 0 ? `PCC +${v}` : `PCC ${v}`}</option>
            ))}
          </select>
          <select className="select" value={allowance} onChange={(e) => setAllowance(Number(e.target.value))}>
            <option value={100}>100%</option>
            <option value={95}>95%</option>
            <option value={90}>90%</option>
            <option value={85}>85%</option>
            <option value={75}>75%</option>
            <option value={50}>50%</option>
          </select>
        </div>
        <div className="toolbar-right">
          <div className="chip">{filtered.length} campos</div>
          {is9h && <div className="chip">{holesLabel}</div>}
        </div>
      </div>

      {/* Banner: preencher HI */}
      {hi === null && (
        <div className="sim-hi-banner">
          <span className="sim-hi-banner-icon">⚠</span>
          <span>
            Preenche o <strong>Handicap Index (HI)</strong> na toolbar para calcular o
            {" "}<strong>Course Handicap</strong>, <strong>Playing Handicap</strong>,
            e as linhas de <strong>Adjusted Gross Score</strong> (Panc., Máx, Ajust.).
            {" "}<a href="https://www.usga.org/content/usga/home-page/handicapping/world-handicap-system/topics/net-double-bogey.html"
              target="_blank" rel="noopener noreferrer"
              className="c-teal">
              Saber mais (USGA) →
            </a>
          </span>
        </div>
      )}

      {/* Master-detail */}
      <div className="master-detail">
        {/* Sidebar: lista de campos */}
        <div className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
          {/* Opção manual — sempre visível */}
          <button
            className={`course-item ${isManual ? "active" : ""}`}
            onClick={() => { setSelectedKey(MANUAL_KEY); setSelectedTeeIdx(null); }}
          >
            <div className="course-item-name">✎ Sem campo (manual)</div>
            <div className="course-item-meta">Introduzir CR/Slope</div>
          </button>
          <div className="bb-border" />

          {filtered.map((c) => {
            const active = selected?.courseKey === c.courseKey;
            const tees = filterTees(c.master.tees, sexFilter).filter((t) => {
              if (is9h) return get9hRatings(t, holesMode as "front9" | "back9") !== null;
              return t.ratings?.holes18?.courseRating && t.ratings?.holes18?.slopeRating;
            });
            return (
              <button
                key={c.courseKey}
                className={`course-item ${active ? "active" : ""}`}
                onClick={() => { setSelectedKey(c.courseKey); setSelectedTeeIdx(null); }}
              >
                <div className="course-item-name">{c.master.name}</div>
                <div className="course-item-meta">
                  {tees.length} tee{tees.length !== 1 ? "s" : ""} c/ ratings
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="muted p-16">Nenhum campo encontrado</div>
          )}
        </div>

        {/* Detalhe */}
        <div className="course-detail">
          {isManual ? (
            <>
              <div className="detail-header">
                <div>
                  <h2 className="detail-title">✎ Modo Manual</h2>
                  <div className="detail-sub">
                    <span className="muted">Introduz CR e Slope para calcular. Par é opcional.</span>
                  </div>
                </div>
              </div>

              <div className="sim-manual-panel">
                <ManualInputs label="18 buracos" value={manual18} onChange={setManual18} />
                <ManualInputs label="Front 9" value={manualF9} onChange={setManualF9} />
                <ManualInputs label="Back 9" value={manualB9} onChange={setManualB9} />
              </div>

              {!teeData && (
                <div className="sim-info-box">
                  Preenche pelo menos <strong>CR</strong> e <strong>Slope</strong> de{" "}
                  {holesMode === "18" ? "18 buracos" : holesMode === "front9" ? "Front 9" : "Back 9"}{" "}
                  para ver os cálculos.
                </div>
              )}

              {teeData && (
                <>
                  {/* HCP strip + ratings */}
                  <HcpStrip hi={hi} courseHcp={courseHcp} playingHcp={playingHcp} allowance={allowance}
                    cr={teeData.cr} slope={teeData.slope} par={teeData.par} pcc={pcc} is9h={is9h} exp9hSD={exp9hSD} />

                  {is9h && (
                    <div className="sim-info-box">
                      <strong>WHS 2024 — 9 buracos:</strong> O SD de 18 buracos é calculado somando
                      o SD dos 9 buracos jogados com o Expected SD baseado no HI do jogador.
                      Fórmula: <code>SD_18h = SD_9h + Expected_9h(HI)</code>
                      {hi === null && (
                        <span className="sim-info-warn"> ⚠ Preenche o HI na toolbar para ver o SD 18h.</span>
                      )}
                    </div>
                  )}

                  <AgsSection hi={hi} holes={null} cr={teeData.cr} slope={teeData.slope} par={teeData.par} pcc={pcc} is9h={is9h} holesMode={holesMode} onOverlayData={handleOverlayData} />

                  <details className="mt-14">
                    <summary className="sim-section-toggle">
                      Tabela Score → SD {is9h ? `(${holesLabel})` : ""}
                    </summary>
                    <div className="mt-8">
                      <SDTable
                        cr={teeData.cr}
                        slope={teeData.slope}
                        par={teeData.par}
                        pcc={pcc}
                        hi={hi}
                        is9h={is9h}
                      />
                    </div>
                  </details>
                </>
              )}

              {/* Overlay — sempre visível em modo manual */}
              {overlayData && <OverlayExport data={overlayData} />}
            </>
          ) : selected && teeData ? (
            <>
              <div className="detail-header">
                <div>
                  <h2 className="detail-title">{selected.master.name}</h2>
                  <div className="detail-sub">
                    <span className="muted">{selected.courseKey}</span>
                    {is9h && <span className="muted"> · {holesLabel}</span>}
                  </div>
                </div>
              </div>

              {/* Seletor de Tee */}
              <div className="sim-tee-selector">
                {availableTees.map((t, idx) => {
                  const isActive = (selectedTeeIdx !== null ? idx === selectedTeeIdx : idx === 0);
                  let crDisp: number | undefined, slDisp: number | undefined;
                  let distDisp: number | null = null;
                  if (is9h) {
                    const r9 = get9hRatings(t, holesMode as "front9" | "back9");
                    crDisp = r9?.cr;
                    slDisp = r9?.slope;
                    distDisp = (holesMode === "front9" ? t.distances?.front9 : t.distances?.back9) ?? null;
                  } else {
                    crDisp = t.ratings?.holes18?.courseRating;
                    slDisp = t.ratings?.holes18?.slopeRating;
                    distDisp = t.distances?.total ?? null;
                  }
                  return (
                    <button
                      key={`${t.teeId}-${idx}`}
                      className={`sim-tee-btn ${isActive ? "sim-tee-active" : ""}`}
                      onClick={() => setSelectedTeeIdx(idx)}
                    >
                      <TeeBadge
                        label={titleCase(t.teeName)}
                        colorHex={teeHex(t)}
                        suffix={t.sex !== "U" ? t.sex : null}
                      />
                      <span className="sim-tee-info">
                        CR {fmtCR(crDisp)} · Sl {slDisp}{distDisp != null ? ` · ${fmt(distDisp)}m` : ""}
                      </span>
                    </button>
                  );
                })}
                {availableTees.length === 0 && (
                  <span className="muted">Sem tees com ratings para este filtro</span>
                )}
              </div>

              {/* HCP strip + ratings */}
              <HcpStrip hi={hi} courseHcp={courseHcp} playingHcp={playingHcp} allowance={allowance}
                cr={teeData.cr} slope={teeData.slope} par={teeData.par} pcc={pcc} is9h={is9h} exp9hSD={exp9hSD} />

              {/* Info box para 9 buracos */}
              {is9h && (
                <div className="sim-info-box">
                  <strong>WHS 2024 — 9 buracos:</strong> O SD de 18 buracos é calculado somando
                  o SD dos 9 buracos jogados com o Expected SD baseado no HI do jogador.
                  Fórmula: <code>SD_18h = SD_9h + Expected_9h(HI)</code>
                  {hi === null && (
                    <span className="sim-info-warn"> ⚠ Preenche o HI na toolbar para ver o SD 18h.</span>
                  )}
                </div>
              )}

              <AgsSection hi={hi} holes={selectedTee?.holes ?? null} cr={teeData.cr} slope={teeData.slope} par={teeData.par} pcc={pcc} is9h={is9h} holesMode={holesMode} onOverlayData={handleOverlayData} />

              {overlayData && <OverlayExport data={overlayData} />}

              {/* Tabela SD — Multi-Tee (todos os tees masculinos) */}
              <details className="mt-14">
                <summary className="sim-section-toggle">
                  Tabela Score → SD {is9h ? `(${holesLabel})` : ""} — Todos os Tees
                </summary>
                <div className="mt-8">
                  <MultiTeeSDTable
                    tees={selected.master.tees}
                    pcc={pcc}
                    hi={hi}
                    is9h={is9h}
                    holesMode={holesMode}
                    allowance={allowance}
                  />
                </div>
              </details>

              {/* Fallback: tabela single-tee (para o tee selecionado) */}
              <details className="mt-14">
                <summary className="sim-section-toggle">
                  Tabela Score → SD {is9h ? `(${holesLabel})` : ""} — {selectedTee?.teeName ?? "Tee"}
                </summary>
                <div className="mt-8">
                  <SDTable
                    cr={teeData.cr}
                    slope={teeData.slope}
                    par={teeData.par}
                    pcc={pcc}
                    hi={hi}
                    is9h={is9h}
                  />
                </div>
              </details>
            </>
          ) : selected && !teeData ? (
            <div className="muted p-24">
              Nenhum tee com Course Rating e Slope disponível para {holesLabel} neste campo/filtro.
            </div>
          ) : (
            <div className="muted p-24">Seleciona um campo</div>
          )}
        </div>
      </div>
    </div>
  );
}
