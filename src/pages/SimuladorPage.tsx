import { useMemo, useState } from "react";
import type { Course, Tee, Hole } from "../data/types";
import TeeBadge from "../ui/TeeBadge";
import { getTeeHex } from "../utils/teeColors";
import { fmt, fmtCR, norm, titleCase } from "../utils/format";

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

/* ─── Componente: Calculadora rápida (18h e 9h) ─── */

function QuickCalc({
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
  const [mode, setMode] = useState<"score-to-sd" | "sd-to-score">("score-to-sd");
  const [inputVal, setInputVal] = useState("");

  const result = useMemo(() => {
    const v = parseFloat(inputVal.replace(",", "."));
    if (isNaN(v)) return null;

    if (mode === "score-to-sd") {
      const sd = calcSD(v, cr, slope, pcc);

      if (is9h && hi !== null) {
        const exp9 = expectedSD9(hi);
        const sd18 = sd + exp9;
        return {
          label: "SD 18h (WHS 2024)",
          value: fmtSD(sd18),
          detail: `SD 9h = ${sd.toFixed(1)} + Expected 9h (HI ${hi.toFixed(1)}) = ${exp9.toFixed(1)} → SD 18h = ${sd18.toFixed(1)}`,
          extra: `Fórmula: (113/${slope}) × (${v} − ${fmtCR(cr)}${pcc ? ` − ${pcc}` : ""}) = ${sd.toFixed(1)}`,
        };
      }

      return {
        label: is9h ? "SD 9 buracos" : "Score Differential",
        value: fmtSD(sd),
        detail: `(113 / ${slope}) × (${v} − ${fmtCR(cr)}${pcc ? ` − ${pcc}` : ""}) = ${sd.toFixed(1)}`,
        extra: is9h ? "Introduz o HI na toolbar para ver o SD 18h (WHS 2024)" : null,
      };
    } else {
      // SD → Score: em modo 9h queremos o SD 18h final
      if (is9h && hi !== null) {
        const exp9 = expectedSD9(hi);
        const target9hSD = v - exp9;
        const score = calcScore(target9hSD, cr, slope, pcc);
        return {
          label: "Gross Score (9h) necessário",
          value: Math.ceil(score).toString(),
          detail: `SD 18h pretendido ${v.toFixed(1)} − Expected ${exp9.toFixed(1)} = SD 9h ${target9hSD.toFixed(1)} → Score = ${score.toFixed(1)} → ${Math.ceil(score)}`,
          extra: null,
        };
      }

      const score = calcScore(v, cr, slope, pcc);
      return {
        label: "Gross Score necessário",
        value: Math.ceil(score).toString(),
        detail: `${v.toFixed(1)} × (${slope} / 113) + ${fmtCR(cr)}${pcc ? ` + ${pcc}` : ""} = ${score.toFixed(1)} → ${Math.ceil(score)}`,
        extra: null,
      };
    }
  }, [inputVal, mode, cr, slope, pcc, hi, is9h]);

  return (
    <div className="sim-calc">
      <div className="sim-calc-tabs">
        <button
          className={`tab-btn ${mode === "score-to-sd" ? "active" : ""}`}
          onClick={() => { setMode("score-to-sd"); setInputVal(""); }}
        >
          Score → SD
        </button>
        <button
          className={`tab-btn ${mode === "sd-to-score" ? "active" : ""}`}
          onClick={() => { setMode("sd-to-score"); setInputVal(""); }}
        >
          SD → Score
        </button>
      </div>

      <div className="sim-calc-input-row">
        <div className="field">
          <label>
            {mode === "score-to-sd"
              ? is9h ? "Gross Score (9h)" : "Gross Score"
              : is9h ? "SD 18h pretendido" : "SD pretendido"
            }
          </label>
          <input
            className="input sim-calc-input"
            type="text"
            inputMode="decimal"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder={mode === "score-to-sd" ? `ex: ${par}` : "ex: 18,0"}
          />
        </div>

        {result && (
          <div className="sim-calc-result">
            <div className="sim-calc-result-label">{result.label}</div>
            <div className="sim-calc-result-value">{result.value}</div>
            <div className="sim-calc-result-detail">{result.detail}</div>
            {result.extra && (
              <div className="sim-calc-result-extra">{result.extra}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Página Principal ─── */

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
            className="input"
            type="text"
            inputMode="decimal"
            placeholder="ex: 68,4"
            value={value.cr}
            onChange={(e) => onChange({ ...value, cr: e.target.value })}
            style={{ width: 72 }}
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


/* ─── Secção AGS: Scorecard interactivo + Adjusted Gross Score ─── */

const USGA_NDB_LINK = "https://www.usga.org/content/usga/home-page/handicapping/world-handicap-system/topics/net-double-bogey.html";

/**
 * Calcula pancadas recebidas por buraco dado o Course Handicap (100%) e SI.
 * ⚠ Usa-se Course Handicap, NÃO Playing Handicap.
 */
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

function AgsSection({
  hi, holes, cr, slope, par, pcc, is9h, holesMode,
}: {
  hi: number | null;
  holes: Hole[] | null;
  cr: number;
  slope: number;
  par: number;
  pcc: number;
  is9h: boolean;
  holesMode: string;
}) {
  const nHoles = is9h ? 9 : 18;
  const [scores, setScores] = useState<Record<number, string>>({});

  const courseHcp = hi !== null ? Math.round(calcCourseHcp(hi, slope, cr, par)) : null;
  const hasAgs = courseHcp !== null;

  /* Hole data from selected tee */
  const fieldHoles = useMemo(() => {
    if (!holes?.length) return null;
    let subset = holes;
    if (is9h) {
      subset = holesMode === "front9" ? holes.filter(h => h.hole <= 9) : holes.filter(h => h.hole > 9);
    }
    const valid = subset.filter(h => h.par != null && h.si != null);
    return valid.length >= nHoles ? valid.sort((a, b) => a.hole - b.hole) : null;
  }, [holes, is9h, holesMode, nHoles]);

  /* Build hole rows — with strokes when HI available, basic otherwise */
  const holeData = useMemo(() => {
    if (!fieldHoles) return null;
    if (hasAgs) return calcStrokesPerHole(fieldHoles, courseHcp!);
    return fieldHoles.map(h => ({ hole: h.hole, par: h.par!, si: h.si!, strokes: 0, maxScore: 0 }));
  }, [fieldHoles, courseHcp, hasAgs]);

  /* Compute totals */
  const result = useMemo(() => {
    if (!holeData || holeData.length === 0) return null;
    let grossTotal = 0, agsTotal = 0, filledCount = 0;
    const rows = holeData.map(h => {
      const val = parseInt(scores[h.hole] || "", 10);
      const actual = !isNaN(val) && val > 0 ? val : null;
      const adjusted = actual !== null && hasAgs ? Math.min(actual, h.maxScore) : null;
      if (actual !== null) {
        grossTotal += actual;
        if (adjusted !== null) agsTotal += adjusted;
        filledCount++;
      }
      return { ...h, actual, adjusted };
    });
    const allFilled = filledCount === holeData.length && filledCount > 0;
    return {
      rows, filledCount, totalHoles: holeData.length,
      grossTotal: allFilled ? grossTotal : null,
      agsTotal: allFilled && hasAgs ? agsTotal : null,
      sdGross: allFilled ? calcSD(grossTotal, cr, slope, pcc) : null,
      sdAgs: allFilled && hasAgs ? calcSD(agsTotal, cr, slope, pcc) : null,
    };
  }, [holeData, scores, cr, slope, pcc, hasAgs]);

  const setScore = (hole: number, val: string) => setScores(prev => ({ ...prev, [hole]: val }));
  const clearAll = () => setScores({});

  /* ── No hole data → info box only ── */
  if (!fieldHoles) {
    return (
      <div style={{ margin: "14px 0" }}>
        <div className="sim-info-box" style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#92400e" }}>
          <strong>Scorecard / AGS:</strong> O scorecard para introduzir scores por buraco e calcular o SD exacto
          (com Adjusted Gross Score) aparece quando selecionas um campo com dados de Par e Stroke Index.
          {" "}<a href={USGA_NDB_LINK} target="_blank" rel="noopener noreferrer"
            style={{ color: "#92400e", fontWeight: 600, textDecoration: "underline" }}>
            Net Double Bogey — USGA →
          </a>
        </div>
      </div>
    );
  }

  /* ── Render helpers ── */
  const totalPar = holeData!.reduce((s, h) => s + h.par, 0);

  const renderHoleRow = (h: NonNullable<typeof result>["rows"][0]) => {
    const capped = h.actual !== null && hasAgs && h.actual > h.maxScore;
    const vsPar = h.actual != null ? h.actual - h.par : null;
    return (
      <tr key={h.hole} className="sim-row">
        <td className="sim-td" style={{ textAlign: "center", fontWeight: 700 }}>{h.hole}</td>
        <td className="sim-td" style={{ textAlign: "center" }}>{h.par}</td>
        <td className="sim-td" style={{ textAlign: "center", color: "var(--text-3)" }}>{h.si}</td>
        <td className="sim-td" style={{ textAlign: "center", padding: "2px 4px" }}>
          <input type="text" inputMode="numeric"
            value={scores[h.hole] || ""}
            onChange={e => setScore(h.hole, e.target.value.replace(/\D/g, ""))}
            style={{ width: 42, textAlign: "center", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "3px 0", font: "inherit", fontSize: 13 }}
            placeholder="–" />
        </td>
        <td className="sim-td" style={{ textAlign: "center", color: vsPar != null ? (vsPar <= -1 ? "#16a34a" : vsPar === 0 ? "var(--text)" : vsPar <= 2 ? "#b45309" : "#dc2626") : "var(--text-3)" }}>
          {vsPar != null ? (vsPar === 0 ? "E" : vsPar > 0 ? `+${vsPar}` : vsPar) : "–"}
        </td>
        {hasAgs && (
          <>
            <td className="sim-td" style={{ textAlign: "center", color: h.strokes > 0 ? "#2563eb" : "var(--text-3)" }}>
              {h.strokes > 0 ? h.strokes : "·"}
            </td>
            <td className="sim-td" style={{ textAlign: "center", fontWeight: 700, background: "#fffbeb", color: "#92400e" }}>{h.maxScore}</td>
            <td className="sim-td" style={{ textAlign: "center", fontWeight: h.adjusted != null ? 700 : 400, color: capped ? "#dc2626" : h.adjusted != null ? "#16a34a" : "var(--text-3)" }}>
              {h.adjusted != null ? h.adjusted : "–"}
              {capped && <span style={{ fontSize: 9, marginLeft: 2 }}>✂</span>}
            </td>
          </>
        )}
      </tr>
    );
  };

  const renderSubtotal = (label: string, slice: NonNullable<typeof result>["rows"]) => {
    const filled = slice.filter(h => h.actual !== null);
    const allFilled = filled.length === slice.length;
    const subGross = allFilled ? filled.reduce((s, h) => s + h.actual!, 0) : null;
    const subPar = slice.reduce((s, h) => s + h.par, 0);
    const subVsPar = subGross != null ? subGross - subPar : null;
    return (
      <tr className="sim-row-par">
        <td className="sim-td" colSpan={3} style={{ textAlign: "right", fontWeight: 800, fontSize: 11, color: "var(--text-3)" }}>{label}</td>
        <td className="sim-td" style={{ textAlign: "center", fontWeight: 700 }}>{subGross ?? "–"}</td>
        <td className="sim-td" style={{ textAlign: "center", fontWeight: 700, color: "var(--text-3)" }}>
          {subVsPar != null ? (subVsPar === 0 ? "E" : subVsPar > 0 ? `+${subVsPar}` : subVsPar) : "–"}
        </td>
        {hasAgs && (
          <>
            <td className="sim-td" />
            <td className="sim-td" style={{ textAlign: "center", fontWeight: 700, background: "#fffbeb", color: "#92400e" }}>
              {slice.reduce((s, h) => s + h.maxScore, 0)}
            </td>
            <td className="sim-td" style={{ textAlign: "center", fontWeight: 700, color: "#16a34a" }}>
              {allFilled ? filled.reduce((s, h) => s + (h.adjusted ?? h.actual!), 0) : "–"}
            </td>
          </>
        )}
      </tr>
    );
  };

  /* ── Main render ── */
  return (
    <div style={{ margin: "14px 0" }}>
      {/* Título */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 className="sim-section-title" style={{ margin: 0 }}>
          Scorecard {hasAgs ? "— Net Double Bogey / AGS" : "— Score por buraco"}
        </h3>
        {Object.keys(scores).length > 0 && (
          <button className="select" style={{ cursor: "pointer", fontSize: 12 }} onClick={clearAll}>Limpar</button>
        )}
      </div>

      {/* TABELA — SEMPRE VISÍVEL */}
      {result && (
        <div className="sim-table-wrap" style={{ marginTop: 8 }}>
          <table className="sim-table" style={{ minWidth: 0 }}>
            <thead>
              <tr>
                <th className="sim-th" style={{ textAlign: "center" }}>H</th>
                <th className="sim-th" style={{ textAlign: "center" }}>Par</th>
                <th className="sim-th" style={{ textAlign: "center" }}>SI</th>
                <th className="sim-th" style={{ textAlign: "center" }}>Score</th>
                <th className="sim-th" style={{ textAlign: "center" }}>±Par</th>
                {hasAgs && (
                  <>
                    <th className="sim-th" style={{ textAlign: "center", color: "#2563eb" }}>Panc.</th>
                    <th className="sim-th" style={{ textAlign: "center", background: "#fef3c7", color: "#92400e" }}>Máx</th>
                    <th className="sim-th" style={{ textAlign: "center", color: "#16a34a" }}>Ajust.</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, is9h ? nHoles : 9).map(renderHoleRow)}
              {!is9h && result.rows.length >= 9 && renderSubtotal("OUT", result.rows.slice(0, 9))}
              {!is9h && result.rows.slice(9, 18).map(renderHoleRow)}
              {!is9h && result.rows.length >= 18 && renderSubtotal("IN", result.rows.slice(9, 18))}
              {/* TOTAL */}
              <tr style={{ borderTop: "2px solid var(--border)" }}>
                <td className="sim-td" colSpan={2} style={{ textAlign: "right", fontWeight: 900 }}>TOTAL</td>
                <td className="sim-td" style={{ textAlign: "center", fontWeight: 700, color: "var(--text-3)" }}>{totalPar}</td>
                <td className="sim-td" style={{ textAlign: "center", fontWeight: 900 }}>{result.grossTotal ?? "–"}</td>
                <td className="sim-td" style={{ textAlign: "center", fontWeight: 900, color: "var(--text-3)" }}>
                  {result.grossTotal != null ? (() => { const d = result.grossTotal! - totalPar; return d === 0 ? "E" : d > 0 ? `+${d}` : d; })() : "–"}
                </td>
                {hasAgs && (
                  <>
                    <td className="sim-td" />
                    <td className="sim-td" style={{ textAlign: "center", fontWeight: 900, background: "#fef3c7", color: "#92400e" }}>
                      {holeData!.reduce((s, h) => s + h.maxScore, 0)}
                    </td>
                    <td className="sim-td" style={{ textAlign: "center", fontWeight: 900, color: "#16a34a" }}>
                      {result.agsTotal ?? "–"}
                    </td>
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Resultado SD */}
      {result && result.grossTotal !== null && (
        <div className="sim-summary" style={{ marginTop: 10 }}>
          <div className="sim-summary-item">
            <span className="sim-summary-label">Gross</span>
            <span className="sim-summary-value">{result.grossTotal}</span>
            <span className="sim-summary-detail">SD {fmtSD(result.sdGross!)}</span>
          </div>
          {hasAgs && result.agsTotal !== null && (
            <div className="sim-summary-item sim-summary-highlight" style={{ borderColor: "#16a34a" }}>
              <span className="sim-summary-label">Adjusted Gross (AGS)</span>
              <span className="sim-summary-value" style={{ color: "#16a34a" }}>{result.agsTotal}</span>
              <span className="sim-summary-detail">SD {fmtSD(result.sdAgs!)}</span>
            </div>
          )}
          {hasAgs && result.grossTotal !== null && result.agsTotal !== null && result.grossTotal > result.agsTotal && (
            <div className="sim-summary-item">
              <span className="sim-summary-label">Cortadas</span>
              <span className="sim-summary-value" style={{ color: "#dc2626" }}>−{result.grossTotal - result.agsTotal}</span>
              <span className="sim-summary-detail">SD melhora {(result.sdGross! - result.sdAgs!).toFixed(1)}</span>
            </div>
          )}
        </div>
      )}

      {/* Status */}
      {result && result.filledCount > 0 && result.filledCount < result.totalHoles && (
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          {result.filledCount} de {result.totalHoles} buracos. Preenche todos para ver o SD.
        </div>
      )}

      {/* Info AGS — colapsável */}
      {hasAgs && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#92400e" }}>
            ℹ Como funciona o Adjusted Gross Score?
          </summary>
          <div className="sim-info-box" style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#92400e", marginTop: 6 }}>
            O WHS calcula o SD com o <em>Adjusted Gross Score</em>, não com o gross bruto.
            Máximo por buraco = <strong>Net Double Bogey</strong>:
            <code style={{ display: "block", margin: "6px 0", padding: "4px 10px", background: "rgba(146,64,14,0.08)", borderRadius: 6, color: "#92400e" }}>
              Máx = Par + 2 + Pancadas (Course HCP) nesse buraco
            </code>
            <div style={{ margin: "6px 0", padding: "6px 10px", background: "rgba(146,64,14,0.05)", borderRadius: 6, fontSize: "12px", lineHeight: 1.6 }}>
              <div>① <strong>Handicap Index (HI)</strong> — número base do jogador.</div>
              <div style={{ marginTop: 3 }}>② <strong>Course Handicap (CH)</strong> = HI × (Slope ÷ 113) + (CR − Par). Determina pancadas para o Net Double Bogey.</div>
              <div style={{ marginTop: 3 }}>③ <strong>Playing Handicap</strong> = CH × % competição. Para Net Score, <strong>não</strong> para Net Double Bogey.</div>
            </div>
            Pancadas do CH distribuem-se por <strong>Stroke Index (SI)</strong>.
            CH ≤ 18: 1 pancada nos SI mais baixos. CH &gt; 18: 2ª pancada.
            {courseHcp !== null && (
              <div style={{ marginTop: 6 }}>
                HI <strong>{hi!.toFixed(1)}</strong> → CH = <strong>{courseHcp}</strong> ({calcCourseHcp(hi!, slope, cr, par).toFixed(1)}).
                Recebes {courseHcp} pancada{courseHcp !== 1 ? "s" : ""} (SI 1–{Math.min(courseHcp, 18)}
                {courseHcp > 18 && (<>, 2ª SI 1–{courseHcp - 18}</>)}).
              </div>
            )}
            <div style={{ marginTop: 6 }}>
              <a href={USGA_NDB_LINK} target="_blank" rel="noopener noreferrer"
                style={{ color: "#92400e", fontWeight: 600, textDecoration: "underline" }}>
                Net Double Bogey — USGA →
              </a>
            </div>
          </div>
        </details>
      )}

      {/* Info simples sem HI */}
      {!hasAgs && (
        <div className="sim-info-box" style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#92400e", marginTop: 10 }}>
          Preenche o <strong>HI</strong> na toolbar para ver as colunas de <strong>Adjusted Gross Score</strong> (máximo
          Net Double Bogey por buraco, pancadas recebidas e score ajustado).
          {" "}<a href={USGA_NDB_LINK} target="_blank" rel="noopener noreferrer"
            style={{ color: "#92400e", fontWeight: 600, textDecoration: "underline" }}>
            Saber mais (USGA) →
          </a>
        </div>
      )}
    </div>
  );
}

export default function SimuladorPage({ courses }: Props) {
  const [q, setQ] = useState("");
  const [sexFilter, setSexFilter] = useState<SexFilter>("ALL");
  const [holesMode, setHolesMode] = useState<HolesMode>("18");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedTeeId, setSelectedTeeId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pcc, setPcc] = useState(0);
  const [hiInput, setHiInput] = useState("");
  const [allowance, setAllowance] = useState(100);

  /* Manual ratings state */
  const [manual18, setManual18] = useState<ManualRatings>(emptyManual());
  const [manualF9, setManualF9] = useState<ManualRatings>(emptyManual());
  const [manualB9, setManualB9] = useState<ManualRatings>(emptyManual());

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
    if (selectedTeeId) {
      const found = availableTees.find((t) => t.teeId === selectedTeeId);
      if (found) return found;
    }
    return availableTees[0];
  }, [availableTees, selectedTeeId]);

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
          <select className="select" value={holesMode} onChange={(e) => { setHolesMode(e.target.value as HolesMode); setSelectedTeeId(null); }}>
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
            className="input"
            value={hiInput}
            onChange={(e) => setHiInput(e.target.value)}
            placeholder="HI (ex: 15,4)"
            style={{ width: 100 }}
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

      {/* Master-detail */}
      <div className="master-detail">
        {/* Sidebar: lista de campos */}
        <div className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
          {/* Opção manual — sempre visível */}
          <button
            className={`course-item ${isManual ? "active" : ""}`}
            onClick={() => { setSelectedKey(MANUAL_KEY); setSelectedTeeId(null); }}
          >
            <div className="course-item-name">✎ Sem campo (manual)</div>
            <div className="course-item-meta">Introduzir CR/Slope</div>
          </button>
          <div style={{ borderBottom: "1px solid var(--border, #ddd)", margin: "2px 0" }} />

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
                onClick={() => { setSelectedKey(c.courseKey); setSelectedTeeId(null); }}
              >
                <div className="course-item-name">{c.master.name}</div>
                <div className="course-item-meta">
                  {tees.length} tee{tees.length !== 1 ? "s" : ""} c/ ratings
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="muted" style={{ padding: 16 }}>Nenhum campo encontrado</div>
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
                  {/* Resumo */}
                  <div className="sim-summary">
                    <div className="sim-summary-item">
                      <span className="sim-summary-label">Course Rating</span>
                      <span className="sim-summary-value">{fmtCR(teeData.cr)}</span>
                    </div>
                    <div className="sim-summary-item">
                      <span className="sim-summary-label">Slope Rating</span>
                      <span className="sim-summary-value">{teeData.slope}</span>
                    </div>
                    <div className="sim-summary-item">
                      <span className="sim-summary-label">Par</span>
                      <span className="sim-summary-value">{teeData.par}</span>
                    </div>
                    {pcc !== 0 && (
                      <div className="sim-summary-item">
                        <span className="sim-summary-label">PCC</span>
                        <span className="sim-summary-value">{pcc > 0 ? `+${pcc}` : pcc}</span>
                      </div>
                    )}
                    {courseHcp !== null && (
                      <div className="sim-summary-item sim-summary-highlight">
                        <span className="sim-summary-label">Course HCP{is9h ? " (9h)" : ""}</span>
                        <span className="sim-summary-value">{Math.round(courseHcp)}</span>
                        <span className="sim-summary-detail">({courseHcp.toFixed(1)})</span>
                      </div>
                    )}
                    {courseHcp !== null && allowance !== 100 && playingHcp !== null && (
                      <div className="sim-summary-item sim-summary-highlight">
                        <span className="sim-summary-label">Playing HCP ({allowance}%)</span>
                        <span className="sim-summary-value">{Math.round(playingHcp)}</span>
                        <span className="sim-summary-detail">({playingHcp.toFixed(1)})</span>
                      </div>
                    )}
                    {exp9hSD !== null && (
                      <div className="sim-summary-item sim-summary-9h">
                        <span className="sim-summary-label">Expected SD 9h</span>
                        <span className="sim-summary-value">{exp9hSD.toFixed(1)}</span>
                        <span className="sim-summary-detail">WHS 2024 · HI {hi?.toFixed(1)}</span>
                      </div>
                    )}
                  </div>

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

                  <AgsSection hi={hi} holes={null} cr={teeData.cr} slope={teeData.slope} par={teeData.par} pcc={pcc} is9h={is9h} holesMode={holesMode} />

                  <QuickCalc cr={teeData.cr} slope={teeData.slope} par={teeData.par} pcc={pcc} hi={hi} is9h={is9h} />

                  <h3 className="sim-section-title">
                    Tabela Score → SD {is9h ? `(${holesLabel})` : ""}
                  </h3>
                  <SDTable
                    cr={teeData.cr}
                    slope={teeData.slope}
                    par={teeData.par}
                    pcc={pcc}
                    hi={hi}
                    is9h={is9h}
                  />
                </>
              )}
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
                {availableTees.map((t) => {
                  const isActive = selectedTee?.teeId === t.teeId;
                  let crDisp: number | undefined, slDisp: number | undefined;
                  if (is9h) {
                    const r9 = get9hRatings(t, holesMode as "front9" | "back9");
                    crDisp = r9?.cr;
                    slDisp = r9?.slope;
                  } else {
                    crDisp = t.ratings?.holes18?.courseRating;
                    slDisp = t.ratings?.holes18?.slopeRating;
                  }
                  return (
                    <button
                      key={t.teeId}
                      className={`sim-tee-btn ${isActive ? "sim-tee-active" : ""}`}
                      onClick={() => setSelectedTeeId(t.teeId)}
                    >
                      <TeeBadge
                        label={titleCase(t.teeName)}
                        colorHex={teeHex(t)}
                        suffix={t.sex !== "U" ? t.sex : null}
                      />
                      <span className="sim-tee-info">
                        CR {fmtCR(crDisp)} · Sl {slDisp}
                      </span>
                    </button>
                  );
                })}
                {availableTees.length === 0 && (
                  <span className="muted">Sem tees com ratings para este filtro</span>
                )}
              </div>

              {/* Resumo do tee + Playing Handicap */}
              <div className="sim-summary">
                <div className="sim-summary-item">
                  <span className="sim-summary-label">Course Rating</span>
                  <span className="sim-summary-value">{fmtCR(teeData.cr)}</span>
                </div>
                <div className="sim-summary-item">
                  <span className="sim-summary-label">Slope Rating</span>
                  <span className="sim-summary-value">{teeData.slope}</span>
                </div>
                <div className="sim-summary-item">
                  <span className="sim-summary-label">Par</span>
                  <span className="sim-summary-value">{teeData.par}</span>
                </div>
                {pcc !== 0 && (
                  <div className="sim-summary-item">
                    <span className="sim-summary-label">PCC</span>
                    <span className="sim-summary-value">{pcc > 0 ? `+${pcc}` : pcc}</span>
                  </div>
                )}
                {courseHcp !== null && (
                  <div className="sim-summary-item sim-summary-highlight">
                    <span className="sim-summary-label">Course HCP{is9h ? " (9h)" : ""}</span>
                    <span className="sim-summary-value">{Math.round(courseHcp)}</span>
                    <span className="sim-summary-detail">({courseHcp.toFixed(1)})</span>
                  </div>
                )}
                {courseHcp !== null && allowance !== 100 && playingHcp !== null && (
                  <div className="sim-summary-item sim-summary-highlight">
                    <span className="sim-summary-label">Playing HCP ({allowance}%)</span>
                    <span className="sim-summary-value">{Math.round(playingHcp)}</span>
                    <span className="sim-summary-detail">({playingHcp.toFixed(1)})</span>
                  </div>
                )}
                {exp9hSD !== null && (
                  <div className="sim-summary-item sim-summary-9h">
                    <span className="sim-summary-label">Expected SD 9h</span>
                    <span className="sim-summary-value">{exp9hSD.toFixed(1)}</span>
                    <span className="sim-summary-detail">WHS 2024 · HI {hi?.toFixed(1)}</span>
                  </div>
                )}
              </div>

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

              <AgsSection hi={hi} holes={selectedTee?.holes ?? null} cr={teeData.cr} slope={teeData.slope} par={teeData.par} pcc={pcc} is9h={is9h} holesMode={holesMode} />

              {/* Calculadora rápida */}
              <QuickCalc cr={teeData.cr} slope={teeData.slope} par={teeData.par} pcc={pcc} hi={hi} is9h={is9h} />

              {/* Tabela SD */}
              <h3 className="sim-section-title">
                Tabela Score → SD {is9h ? `(${holesLabel})` : ""}
              </h3>
              <SDTable
                cr={teeData.cr}
                slope={teeData.slope}
                par={teeData.par}
                pcc={pcc}
                hi={hi}
                is9h={is9h}
              />
            </>
          ) : selected && !teeData ? (
            <div className="muted" style={{ padding: 24 }}>
              Nenhum tee com Course Rating e Slope disponível para {holesLabel} neste campo/filtro.
            </div>
          ) : (
            <div className="muted" style={{ padding: 24 }}>Seleciona um campo</div>
          )}
        </div>
      </div>
    </div>
  );
}
