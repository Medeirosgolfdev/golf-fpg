/**
 * ComparePage.tsx — Página /comparar
 *
 * Duas tabs (estilo .tab-under, coerente com FPGPage/BJGTPage/USKIDSPage):
 *   • Campos     — hero completo (KPIs + distribuição de pares) + tabela de similitude
 *                  + comparação lado-a-lado de 2 campos (par 3/4/5, distâncias, buracos)
 *   • Jogadores  — comparação detalhada entre 2-4 jogadores (delega em CompararPage)
 *
 * Estilos via classes existentes em App.css e tokens em tokens.css (sem hex hardcoded).
 *
 * Algoritmo de similitude: 25% distância, 15% par, 60% min(slope, CR).
 * O min força que AMBOS slope E CR sejam parecidos.
 * Cores semânticas: ≥80% verde · ≥60% azul · ≥40% laranja. <40% não aparece.
 *
 * Tabela ordenável por clique no cabeçalho (useState local + SortableHdr).
 */
import { useState, useMemo, lazy, Suspense } from "react";
import { useAppContext } from "../context/AppContext";
import EmptyState from "../ui/EmptyState";
import LoadingState from "../ui/LoadingState";
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../ui/Toolbar";
import SortableHdr from "../ui/SortableHdr";
import type { Course, Tee, Hole } from "../data/types";
import CourseHeroCard, { getParTotal, parBreakdown, PAR_HSL } from "../ui/CourseHeroCard";
import { MultiTeeSDTable } from "../ui/ScoreTable";
import { calcSD, calcPlayingHcp } from "../utils/whsCalc";
import { fmtSD, fmtCR } from "../utils/format";
import { teeHexFromTee as teeHex } from "../utils/teeUtils";
import { textOnColor } from "../utils/teeColors";

const CompararPlayersView = lazy(() => import("./CompararPage"));
const TeeAdvisorView = lazy(() => import("./comparar/TeeAdvisorView"));
const SimuladorPageEmbedded = lazy(() => import("./SimuladorPage"));

const MANUEL_FED = "52884";

// ═══════════════════ Helpers ═══════════════════

function filterCoursesForComparison(courses: Course[]): Course[] {
  return courses.filter(c => {
    const country = c.master.country?.toUpperCase().trim();
    const isPortuguese = !country || country === "PT" || country === "PORTUGAL";
    if (isPortuguese) return true;
    const hasManuelPlayed = c.master._players && Object.keys(c.master._players).some(fed => fed === MANUEL_FED);
    return !!hasManuelPlayed;
  });
}

// ═══════════════════ Similitude ═══════════════════

interface SimilarityScore {
  distance: number;
  par: number;
  slope: number;
  cr: number;
  overall: number;
}

function calculateSimilarity(tee1: Tee | null | undefined, tee2: Tee): SimilarityScore | null {
  if (!tee1) return null;
  const dist1 = tee1.distances?.total ?? 0;
  const dist2 = tee2.distances?.total ?? 0;
  const par1 = getParTotal(tee1);
  const par2 = getParTotal(tee2);
  const slope1 = tee1.ratings?.holes18?.slopeRating ?? 0;
  const slope2 = tee2.ratings?.holes18?.slopeRating ?? 0;
  const cr1 = tee1.ratings?.holes18?.courseRating ?? 0;
  const cr2 = tee2.ratings?.holes18?.courseRating ?? 0;
  if (!slope1 || !slope2 || !cr1 || !cr2 || !dist1 || !dist2) return null;

  const distDiff = Math.abs(dist1 - dist2);
  const parDiff = Math.abs(par1 - par2);
  const slopeDiff = Math.abs(slope1 - slope2);
  const crDiff = Math.abs(cr1 - cr2);

  const distScore = Math.max(0, 100 - distDiff * 0.10);
  const parScore = Math.max(0, 100 - parDiff * 25);
  const slopeScore = Math.max(0, 100 - slopeDiff * (100 / 15));
  const crScore = Math.max(0, 100 - crDiff * (100 / 3));

  const difficultyScore = Math.min(slopeScore, crScore);
  const overall = distScore * 0.25 + parScore * 0.15 + difficultyScore * 0.60;

  return {
    distance: distScore,
    par: parScore,
    slope: slopeScore,
    cr: crScore,
    overall: Math.max(0, Math.min(100, overall)),
  };
}

function simTier(overall: number): "good" | "info" | "warn" | null {
  if (overall >= 80) return "good";
  if (overall >= 60) return "info";
  if (overall >= 40) return "warn";
  return null;
}

function simBadgeStyle(tier: "good" | "info" | "warn"): { color: string; background: string; border: string } {
  switch (tier) {
    case "good": return { color: "var(--color-good-dark)", background: "var(--color-good-alpha)", border: "1px solid var(--color-good)" };
    case "info": return { color: "var(--color-info)", background: "var(--bg-info-strong)", border: "1px solid var(--color-info)" };
    case "warn": return { color: "var(--color-warn-dark)", background: "var(--color-warn-alpha)", border: "1px solid var(--color-warn)" };
  }
}

// ═══════════════════ Tabela de similitude (sortable) ═══════════════════

type SimRow = {
  course: Course;
  tee: Tee;
  sim: SimilarityScore;
  tier: "good" | "info" | "warn";
};

type SimSortKey = "name" | "tee" | "dist" | "par" | "slope" | "cr" | "overall";

function getSortValue(row: SimRow, key: SimSortKey): number | string {
  switch (key) {
    case "name":    return row.course.master.name.toLowerCase();
    case "tee":     return row.tee.teeName.toLowerCase();
    case "dist":    return row.tee.distances?.total ?? -1;
    case "par":     return getParTotal(row.tee);
    case "slope":   return row.tee.ratings?.holes18?.slopeRating ?? -1;
    case "cr":      return row.tee.ratings?.holes18?.courseRating ?? -1;
    case "overall": return row.sim.overall;
  }
}

const DEFAULT_DIR: Record<SimSortKey, "asc" | "desc"> = {
  name: "asc", tee: "asc",
  dist: "desc", par: "desc", slope: "desc", cr: "desc", overall: "desc",
};

function SimilarityTable({ rows, onPick, pickedKey }: {
  rows: SimRow[];
  onPick?: (row: SimRow) => void;
  pickedKey?: string | null;
}) {
  const [sortKey, setSortKey] = useState<SimSortKey>("overall");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (k: SimSortKey) => {
    if (k === sortKey) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir(DEFAULT_DIR[k]);
    }
  };

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv, "pt") * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="dtable">
        <thead>
          <tr>
            <SortableHdr k="name"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Campo</SortableHdr>
            <SortableHdr k="tee"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Tee</SortableHdr>
            <SortableHdr k="dist"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="r">Dist (m)</SortableHdr>
            <SortableHdr k="par"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="r">Par</SortableHdr>
            <SortableHdr k="slope"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="r">Slope</SortableHdr>
            <SortableHdr k="cr"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="r">CR</SortableHdr>
            <SortableHdr k="overall" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="r">Similitude</SortableHdr>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const { course, tee, sim, tier } = row;
            const teePar = getParTotal(tee);
            const sl = tee.ratings?.holes18?.slopeRating ?? "";
            const crr = tee.ratings?.holes18?.courseRating ?? "";
            const rowKey = `${course.courseKey}|${tee.teeId}|${tee.sex}|${sl}|${crr}`;
            const isPicked = pickedKey === rowKey;
            return (
              <tr
                key={rowKey}
                onClick={() => onPick?.(row)}
                style={{
                  cursor: onPick ? "pointer" : undefined,
                  background: isPicked ? "var(--accent-light)" : undefined,
                  outline: isPicked ? "2px solid var(--accent)" : undefined,
                }}
                title={onPick ? "Click para comparar buracos com este campo" : undefined}
              >
                <td style={{ fontWeight: 700 }}>{course.master.name}</td>
                <td className="muted">{tee.teeName}</td>
                <td className="r" style={{ fontFamily: "var(--font-mono)" }}>{tee.distances?.total ?? "–"}</td>
                <td className="r" style={{ fontFamily: "var(--font-mono)" }}>{teePar || "–"}</td>
                <td className="r" style={{ fontFamily: "var(--font-mono)" }}>
                  {tee.ratings?.holes18?.slopeRating ? tee.ratings.holes18.slopeRating.toFixed(0) : "–"}
                </td>
                <td className="r" style={{ fontFamily: "var(--font-mono)" }}>
                  {tee.ratings?.holes18?.courseRating ? tee.ratings.holes18.courseRating.toFixed(1) : "–"}
                </td>
                <td className="r">
                  <span
                    className="p p-sm"
                    style={{
                      ...simBadgeStyle(tier),
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      minWidth: 52,
                      justifyContent: "center",
                    }}
                    title={`Dist ${sim.distance.toFixed(0)}% · Par ${sim.par.toFixed(0)}% · Slope ${sim.slope.toFixed(0)}% · CR ${sim.cr.toFixed(0)}%`}
                  >
                    {Math.round(sim.overall)}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════ Hero do campo + distribuição de pares ═══════════════════
// Extraído para src/ui/CourseHeroCard.tsx para reuso (também em /kids2/next-t).

function HeroCard({ course, tee }: { course: Course; tee: Tee }) {
  return <CourseHeroCard course={course} tee={tee} />;
}

// ═══════════════════ Comparação lado-a-lado de 2 campos ═══════════════════

/** Mostra delta (B − A) formatado com sinal e cor. */
function Delta({ a, b, decimals = 0, unit = "" }: {
  a: number | null; b: number | null; decimals?: number; unit?: string;
}) {
  if (a === null || b === null) return <span className="muted">–</span>;
  const d = b - a;
  const abs = Math.abs(d);
  const fmt = decimals > 0 ? abs.toFixed(decimals) : String(Math.round(abs));
  if (d === 0) return <span className="muted" style={{ fontFamily: "var(--font-mono)" }}>=</span>;
  const color = d > 0 ? "var(--color-info)" : "var(--color-warn-dark)";
  const sign = d > 0 ? "+" : "−";
  return (
    <span style={{ fontFamily: "var(--font-mono)", color, fontWeight: 700 }}>
      {sign}{fmt}{unit}
    </span>
  );
}

// ═══════════════════ Tabela Score→SD lado a lado (tee A vs tee B) ═══════════

function TwoTeeSDTable({
  courseA, teeA, courseB, teeB, hi, pcc,
}: {
  courseA: Course; teeA: Tee;
  courseB: Course; teeB: Tee;
  hi: number; pcc: number;
}) {
  // Tee mais próximo em dificuldade (CR/Slope) do tee escolhido no outro campo
  const bestMatchA = useMemo(() => {
    const crRef = teeB.ratings?.holes18?.courseRating;
    const slRef = teeB.ratings?.holes18?.slopeRating;
    if (!crRef || !slRef) return null;
    return courseA.master.tees
      .filter(t => t.teeId !== teeA.teeId && t.ratings?.holes18?.courseRating && t.ratings?.holes18?.slopeRating)
      .sort((a, b) => {
        const score = (t: Tee) =>
          Math.abs((t.ratings!.holes18!.courseRating! - crRef) / 3) +
          Math.abs((t.ratings!.holes18!.slopeRating! - slRef) / 15);
        return score(a) - score(b);
      })[0] ?? null;
  }, [courseA, teeA, teeB]);

  const bestMatchB = useMemo(() => {
    const crRef = teeA.ratings?.holes18?.courseRating;
    const slRef = teeA.ratings?.holes18?.slopeRating;
    if (!crRef || !slRef) return null;
    return courseB.master.tees
      .filter(t => t.teeId !== teeB.teeId && t.ratings?.holes18?.courseRating && t.ratings?.holes18?.slopeRating)
      .sort((a, b) => {
        const score = (t: Tee) =>
          Math.abs((t.ratings!.holes18!.courseRating! - crRef) / 3) +
          Math.abs((t.ratings!.holes18!.slopeRating! - slRef) / 15);
        return score(a) - score(b);
      })[0] ?? null;
  }, [courseB, teeA, teeB]);

  // Colunas: [teeA escolhido, bestMatchA?] | [bestMatchB?, teeB escolhido]
  type ColDef = { tee: Tee; cr: number; sl: number; par: number; hex: string; isChosen: boolean };
  const makeCol = (tee: Tee, isChosen: boolean): ColDef | null => {
    const cr = tee.ratings?.holes18?.courseRating;
    const sl = tee.ratings?.holes18?.slopeRating;
    if (!cr || !sl) return null;
    return { tee, cr, sl, par: tee.ratings?.holes18?.par ?? 72, hex: teeHex(tee), isChosen };
  };

  const colsA = [makeCol(teeA, true), bestMatchA ? makeCol(bestMatchA, false) : null]
    .filter(Boolean) as ColDef[];
  const colsB = [bestMatchB ? makeCol(bestMatchB, false) : null, makeCol(teeB, true)]
    .filter(Boolean) as ColDef[];
  const allCols = [...colsA, ...colsB];
  const divIdx = colsA.length; // índice onde começa o grupo B

  if (!allCols.length) {
    return <p className="muted" style={{ fontSize: "var(--fs-12)" }}>Tees sem ratings para calcular.</p>;
  }

  const phcps = allCols.map(c => Math.round(calcPlayingHcp(hi, c.sl, c.cr, c.par)));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const result: { delta: number; sds: number[] }[] = [];
    for (let delta = -8; delta <= 36; delta++) {
      if (allCols.some(c => c.par + delta < 50)) continue;
      result.push({ delta, sds: allCols.map(c => calcSD(c.par + delta, c.cr, c.sl, pcc)) });
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestMatchA?.teeId, bestMatchB?.teeId, teeA.teeId, teeB.teeId, pcc]);

  const ROW1_H = 26;
  const sticky0: React.CSSProperties = { position: "sticky", top: 0, zIndex: 12, background: "var(--bg)" };
  const sticky1: React.CSSProperties = { position: "sticky", top: ROW1_H, zIndex: 11, background: "var(--bg)" };

  return (
    <div className="sim-scroll-x scroll-x" style={{ maxHeight: 520 }}>
      <table className="dtable sim-multi-tee" style={{ fontSize: "var(--fs-12)", tableLayout: "auto", width: "auto" }}>
        <thead>
          {/* Fila 1: nome do campo */}
          <tr>
            <th rowSpan={2} style={{
              ...sticky0,
              textAlign: "center", verticalAlign: "middle",
              padding: "4px 8px", fontSize: "var(--fs-11)", fontWeight: 600,
              color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em",
              borderBottom: "2px solid var(--border)", borderRight: "1px solid var(--border)",
              minWidth: 44, background: "var(--bg-muted)",
            }}>±Par</th>
            {colsA.length > 0 && (
              <th colSpan={colsA.length} style={{
                ...sticky0,
                background: "var(--bg-muted)",
                color: "var(--text-2)",
                textAlign: "center", padding: "4px 8px",
                fontSize: "var(--fs-11)", fontWeight: 700,
                borderBottom: "none",
                borderRight: "2px solid var(--border)",
              }}>
                {courseA.master.name}
              </th>
            )}
            {colsB.length > 0 && (
              <th colSpan={colsB.length} style={{
                ...sticky0,
                background: "var(--bg-muted)",
                color: "var(--text-2)",
                textAlign: "center", padding: "4px 8px",
                fontSize: "var(--fs-11)", fontWeight: 700,
                borderBottom: "none",
              }}>
                {courseB.master.name}
              </th>
            )}
          </tr>
          {/* Fila 2: tee + CR/SR */}
          <tr>
            {allCols.map((c, i) => (
              <th key={i} style={{
                ...sticky1,
                background: "var(--bg-muted)",
                textAlign: "center",
                padding: "4px 8px",
                fontSize: "var(--fs-10)",
                fontWeight: c.isChosen ? 700 : 500,
                borderBottom: "2px solid var(--border)",
                borderLeft: i === divIdx ? "2px solid var(--border)" : undefined,
                whiteSpace: "nowrap",
              }}>
                <span style={{
                  display: "inline-block",
                  background: c.hex, color: textOnColor(c.hex),
                  borderRadius: 4, padding: "1px 8px",
                  fontSize: "var(--fs-10)", fontWeight: 700, marginBottom: 3,
                }}>
                  {c.tee.teeName}{!c.isChosen && " ≈"}
                </span>
                <div style={{ fontWeight: 500, color: "var(--text-3)", fontSize: "var(--fs-9)", marginTop: 1 }}>
                  CR {c.cr.toFixed(1)} · SR {c.sl}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const isPar = r.delta === 0;
            return (
              <tr key={r.delta} className={["sim-row", isPar ? "sim-row-par" : ""].join(" ")}>
                <td style={{
                  textAlign: "center", fontWeight: 700, padding: "4px 8px",
                  borderBottom: "1px solid var(--border-light)",
                  background: isPar ? "var(--accent-light)" : undefined,
                  color: isPar ? "var(--accent)" : undefined,
                }}>
                  {r.delta === 0 ? "E" : r.delta > 0 ? `+${r.delta}` : r.delta}
                </td>
                {allCols.map((c, i) => {
                  const sd = r.sds[i];
                  const isHcp = r.delta === phcps[i];
                  return (
                    <td key={i} className="mono" style={{
                      textAlign: "right", padding: "3px 8px",
                      borderBottom: "1px solid var(--border-light)",
                      borderLeft: i === divIdx ? "2px solid var(--border)" : undefined,
                      fontWeight: isHcp ? 800 : isPar ? 700 : 400,
                      background: isHcp ? c.hex + "28" : isPar ? "var(--accent-light)" : undefined,
                      color: isHcp ? "var(--grey-900)" : isPar ? "var(--accent)" : undefined,
                      borderTop: isHcp ? "2px solid " + c.hex : undefined,
                      borderBottomColor: isHcp ? c.hex : undefined,
                    }}>
                      {fmtSD(sd)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="muted" style={{ fontSize: "var(--fs-11)", marginTop: 6 }}>
        ≈ = tee com CR/Slope mais próximo do tee do outro campo · Linha realçada = playing handicap (HI {hi.toFixed(1)})
      </div>
    </div>
  );
}


// ═══════════════════ Comparação lado-a-lado de 2 campos ═══════════════════

function CourseSideBySide({
  courseA, teeA, courseB, teeB,
}: {
  courseA: Course; teeA: Tee;
  courseB: Course; teeB: Tee;
}) {
  const parTotalA = getParTotal(teeA);
  const parTotalB = getParTotal(teeB);
  const distA = teeA.distances?.total ?? null;
  const distB = teeB.distances?.total ?? null;
  const slopeA = teeA.ratings?.holes18?.slopeRating ?? null;
  const slopeB = teeB.ratings?.holes18?.slopeRating ?? null;
  const crA = teeA.ratings?.holes18?.courseRating ?? null;
  const crB = teeB.ratings?.holes18?.courseRating ?? null;


  // Hole-by-hole colapsável
  const [showHoles, setShowHoles] = useState(false);
  const holeRows = useMemo(() => {
    const holesA = teeA.holes ? [...teeA.holes].sort((a, b) => a.hole - b.hole) : [];
    const holesB = teeB.holes ? [...teeB.holes].sort((a, b) => a.hole - b.hole) : [];
    const map = new Map<number, { a: Hole | null; b: Hole | null }>();
    for (const h of holesA) map.set(h.hole, { a: h, b: null });
    for (const h of holesB) {
      const ex = map.get(h.hole);
      if (ex) ex.b = h; else map.set(h.hole, { a: null, b: h });
    }
    return [...map.entries()].sort(([n1], [n2]) => n1 - n2);
  }, [teeA, teeB]);

  const sameCourse = courseA.courseKey === courseB.courseKey;
  const PAR_COLOR: Record<3 | 4 | 5, string> = {
    3: `hsl(${PAR_HSL[3].h}deg, ${PAR_HSL[3].s}%, 38%)`,
    4: `hsl(${PAR_HSL[4].h}deg, ${PAR_HSL[4].s}%, 45%)`,
    5: `hsl(${PAR_HSL[5].h}deg, ${PAR_HSL[5].s}%, 42%)`,
  };

  return (
    <div className="card" style={{ borderLeft: "4px solid var(--accent)" }}>
      {/* Header */}
      <div className="h-md" style={{ marginBottom: 14 }}>
        🆚 Comparação directa
      </div>

      {/* KPI cards: [A] [Δ] [B] — 3 colunas, 2 linhas cada */}
      {(() => {
        const fmtDelta = (a: number | null, b: number | null, dec = 0) => {
          if (a == null || b == null) return "–";
          const d = a - b;
          return (d > 0 ? "+" : "") + d.toFixed(dec);
        };
        const deltaColor = (a: number | null, b: number | null) => {
          if (a == null || b == null) return "var(--text-3)";
          return a !== b ? "var(--text-1)" : "var(--text-3)";
        };
        const KpiCard = ({ icon, bg, val, unit, lbl }: { icon: string; bg: string; val: string | number; unit?: string; lbl: string }) => (
          <div className="haDiagCard">
            <div className="haDiagIcon" style={{ background: bg }}>{icon}</div>
            <div>
              <div className="haDiagVal">{val}{unit && <span style={{ fontSize: "var(--fs-13)", fontWeight: 600, color: "var(--text-3)", marginLeft: 4 }}>{unit}</span>}</div>
              <div className="haDiagLbl">{lbl}</div>
            </div>
          </div>
        );
        const DeltaCard = ({ label, a, b, dec = 0, unit, icon, iconBg }: { label: string; a: number | null; b: number | null; dec?: number; unit?: string; icon: string; iconBg: string }) => {
          const val = fmtDelta(a, b, dec);
          const col = deltaColor(a, b);
          return (
            <div className="haDiagCard">
              <div className="haDiagIcon" style={{ background: iconBg }}>{icon}</div>
              <div>
                <div className="haDiagVal" style={{ color: col }}>
                  {val}{val !== "–" && unit ? <span style={{ fontSize: "var(--fs-13)", fontWeight: 600, color: "var(--text-3)", marginLeft: 4 }}>{unit}</span> : null}
                </div>
                <div className="haDiagLbl">{label}</div>
              </div>
            </div>
          );
        };
        const CourseHeader = ({ course, tee }: { course: typeof courseA; tee: typeof teeA }) => (
          <div style={{ fontWeight: 700, fontSize: "var(--fs-13)", marginBottom: 8, display: "flex", alignItems: "center", gap: 8, minHeight: 28 }}>
            ⛳ {course.master.name}
            <span style={{ background: teeHex(tee), color: textOnColor(teeHex(tee)), borderRadius: 4, padding: "2px 8px", fontSize: "var(--fs-11)", fontWeight: 700 }}>{tee.teeName}</span>
          </div>
        );
        const renderKpis = (dist: number | null, par: number | null, cr: number | null, slope: number | null) => (
          <div className="haDiag">
            <KpiCard icon="📏" bg="var(--bg-info-strong)" val={dist ?? "–"} unit={dist != null ? "m" : undefined} lbl="Distância total" />
            <KpiCard icon="⛳" bg="var(--accent-light)" val={par || "–"} lbl="Par total · 18H" />
            <KpiCard icon="📐" bg="var(--bg-warn)" val={slope ?? "–"} lbl="Slope" />
            <KpiCard icon="🎯" bg="var(--color-good-alpha)" val={cr != null ? cr.toFixed(1) : "–"} lbl="Course rating" />
          </div>
        );
        const deltas = [
          { label: "Distância", a: distA, b: distB, unit: "m", icon: "📏", iconBg: "var(--bg-info-strong)" },
          { label: "Par", a: parTotalA, b: parTotalB, icon: "⛳", iconBg: "var(--accent-light)" },
          { label: "Slope", a: slopeA, b: slopeB, icon: "📐", iconBg: "var(--bg-warn)" },
          { label: "CR", a: crA, b: crB, dec: 1, icon: "🎯", iconBg: "var(--color-good-alpha)" },
        ] as const;
        return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 0.6fr 1fr", gap: 24, marginBottom: 18, alignItems: "start" }}>
            {/* Campo A */}
            <div>
              <CourseHeader course={courseA} tee={teeA} />
              {renderKpis(distA, parTotalA, crA, slopeA)}
            </div>
            {/* Deltas */}
            <div>
              <div style={{ minHeight: 28, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "var(--fs-10)", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>comparação</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {deltas.map((d, i) => (
                  <DeltaCard key={i} label={d.label} a={d.a} b={d.b} dec={d.dec} unit={d.unit} icon={d.icon} iconBg={d.iconBg} />
                ))}
              </div>
            </div>
            {/* Campo B */}
            <div>
              <CourseHeader course={courseB} tee={teeB} />
              {renderKpis(distB, parTotalB, crB, slopeB)}
            </div>
          </div>
        );
      })()}

      {/* ── Pills emparelhadas por proximidade de distância ── */}
      {(() => {
        const hasHoles = (t: Tee) => (t.holes ?? []).some(h => (h.distance ?? 0) > 0);
        if (!hasHoles(teeA) && !hasHoles(teeB)) return (
          <p className="muted" style={{ fontSize: "var(--fs-12)" }}>
            Dados de buracos não disponíveis para este tee.
          </p>
        );
        const byPar = (t: Tee, par: number) =>
          (t.holes ?? [])
            .filter(h => h.par === par && (h.distance ?? 0) > 0)
            .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

        // Matching de buracos:
        // - mesmo campo: por nº de buraco (B1↔B1, B2↔B2, ...)
        // - campos diferentes: vizinho mais próximo por distância
        // Em ambos os casos, ordena pelo lado A (ou B se só existe B).
        type MatchRow = {a: Hole|null; b: Hole|null; rankA: number; rankB: number};
        const matchHoles = (ha: Hole[], hb: Hole[]): MatchRow[] => {
          let rows: (MatchRow & {sortKey: number})[];
          if (sameCourse) {
            // mesmo campo: emparelhar pelo número do buraco
            const mapB = new Map(hb.map((h, j) => [h.hole, {h, j}]));
            const usedB = new Set<number>();
            const matched: {i: number; bEntry: {h: Hole; j: number} | undefined}[] = ha.map((h, i) => ({
              i, bEntry: mapB.get(h.hole),
            }));
            rows = matched.map(({i, bEntry}) => {
              if (bEntry) usedB.add(bEntry.j);
              return {
                a: ha[i], b: bEntry?.h ?? null,
                rankA: i, rankB: bEntry?.j ?? -1,
                sortKey: ha[i].distance ?? 0,
              };
            });
            // buracos B sem par em A
            hb.forEach((h, j) => {
              if (!usedB.has(j))
                rows.push({ a: null, b: h, rankA: -1, rankB: j, sortKey: h.distance ?? 0 });
            });
          } else {
            // campos diferentes: vizinho mais próximo
            const cands: {i: number; j: number; diff: number}[] = [];
            for (let i = 0; i < ha.length; i++)
              for (let j = 0; j < hb.length; j++)
                cands.push({ i, j, diff: Math.abs((ha[i].distance ?? 0) - (hb[j].distance ?? 0)) });
            cands.sort((x, y) => x.diff - y.diff);
            const usedA = new Set<number>(), usedB = new Set<number>();
            const matched: {i: number; j: number}[] = [];
            for (const c of cands) {
              if (!usedA.has(c.i) && !usedB.has(c.j)) {
                matched.push(c); usedA.add(c.i); usedB.add(c.j);
              }
            }
            rows = [
              ...matched.map(({i, j}) => ({
                a: ha[i], b: hb[j], rankA: i, rankB: j,
                sortKey: ha[i].distance ?? 0,
              })),
              ...ha.map((h, i) => ({h, i})).filter(({i}) => !usedA.has(i))
                .map(({h, i}) => ({a: h, b: null as Hole|null, rankA: i, rankB: -1, sortKey: h.distance ?? 0})),
              ...hb.map((h, j) => ({h, j})).filter(({j}) => !usedB.has(j))
                .map(({h, j}) => ({a: null as Hole|null, b: h, rankA: -1, rankB: j, sortKey: h.distance ?? 0})),
            ];
          }
          // ordenar pelo lado A (ou B se A ausente) → distância crescente
          rows.sort((x, y) => x.sortKey - y.sortKey);
          return rows;
        };

        // pill bg/fg: gradiente claro→escuro pelo rank original dentro do grupo
        const pillStyle = (par: 3|4|5, rank: number, total: number) => {
          const t = total <= 1 ? 0.5 : rank / (total - 1);
          const ph = PAR_HSL[par];
          const l = Math.round(84 - t * 42);
          const bg = `hsl(${ph.h}deg, ${ph.s}%, ${l}%)`;
          const fg = l < 62 ? "#fff" : "#111";
          return { background: bg, color: fg };
        };
        return (
          <div>
            {([3, 4, 5] as const).map(par => {
              const holesA = byPar(teeA, par);
              const holesB = byPar(teeB, par);
              if (holesA.length === 0 && holesB.length === 0) return null;
              const ph = PAR_HSL[par];
              const parAccent = `hsl(${ph.h}deg, ${ph.s}%, 38%)`;
              const pairs = matchHoles(holesA, holesB);
              return (
                <div key={par} style={{ marginBottom: 12 }}>
                  <div style={{
                    fontSize: "var(--fs-11)", fontWeight: 700, color: parAccent,
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    padding: "4px 0", borderBottom: "1px solid var(--border)", marginBottom: 6,
                  }}>
                    Par {par} — A: {holesA.length} · B: {holesB.length}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: sameCourse ? "1fr auto 1fr" : "1fr 1fr", gap: "4px 0" }}>
                    {pairs.map(({a, b, rankA, rankB}, i) => {
                      const psA = a ? pillStyle(par, rankA, holesA.length) : null;
                      const psB = b ? pillStyle(par, rankB, holesB.length) : null;
                      const delta = a && b ? (a.distance ?? 0) - (b.distance ?? 0) : null;
                      return (
                        <>
                          <div key={`a${i}`} style={{ display: "flex", justifyContent: "flex-end", paddingRight: 8 }}>
                            {a && psA ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                                <span style={{ fontSize: "var(--fs-11)", fontWeight: 600, color: "var(--text-2)", fontFamily: "var(--font-mono)" }}>B{a.hole}</span>
                                <span style={{ ...psA, borderRadius: 6, padding: "3px 10px", fontSize: "var(--fs-12)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{a.distance}m</span>
                              </span>
                            ) : (
                              <span className="muted" style={{ fontSize: "var(--fs-12)", padding: "3px 10px" }}>–</span>
                            )}
                          </div>
                          {sameCourse && (
                            <div key={`d${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>
                              {delta !== null ? (
                                <span style={{
                                  fontSize: "var(--fs-10)", fontWeight: 700, fontFamily: "var(--font-mono)",
                                  color: "var(--text-2)",
                                }}>
                                  {delta > 0 ? `+${delta}` : delta}m
                                </span>
                              ) : <span style={{ fontSize: "var(--fs-10)", color: "var(--text-3)" }}>–</span>}
                            </div>
                          )}
                          <div key={`b${i}`} style={{ display: "flex", justifyContent: "flex-start", paddingLeft: 8 }}>
                            {b && psB ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                                <span style={{ ...psB, borderRadius: 6, padding: "3px 10px", fontSize: "var(--fs-12)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{b.distance}m</span>
                                <span style={{ fontSize: "var(--fs-11)", fontWeight: 600, color: "var(--text-2)", fontFamily: "var(--font-mono)" }}>B{b.hole}</span>
                              </span>
                            ) : (
                              <span className="muted" style={{ fontSize: "var(--fs-12)", padding: "3px 10px" }}>–</span>
                            )}
                          </div>
                        </>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Buraco a buraco (colapsável) ── */}
      {holeRows.length >= 9 && (
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={() => setShowHoles(v => !v)}
            style={{
              background: "var(--bg-muted)", border: "1px solid var(--border)",
              borderRadius: 6, padding: "4px 12px", fontSize: "var(--fs-12)",
              fontWeight: 600, cursor: "pointer", color: "var(--text-2)",
            }}
          >
            {showHoles ? "▲ Esconder buraco a buraco" : "▼ Ver buraco a buraco"}
          </button>
          {showHoles && (
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table className="dtable" style={{ minWidth: 480 }}>
                <thead>
                  <tr>
                    <th>B#</th>
                    <th className="r">
                      Par
                      <span style={{
                        display: "inline-block", marginLeft: 6,
                        background: teeHex(teeA), color: textOnColor(teeHex(teeA)),
                        borderRadius: 4, padding: "1px 6px", fontSize: "var(--fs-10)", fontWeight: 700,
                      }}>{teeA.teeName}</span>
                    </th>
                    <th className="r">Dist A (m)</th>
                    <th className="r">
                      Par
                      <span style={{
                        display: "inline-block", marginLeft: 6,
                        background: teeHex(teeB), color: textOnColor(teeHex(teeB)),
                        borderRadius: 4, padding: "1px 6px", fontSize: "var(--fs-10)", fontWeight: 700,
                      }}>{teeB.teeName}</span>
                    </th>
                    <th className="r">Dist B (m)</th>
                    <th className="r">Δ dist</th>
                    <th className="r">Δ par</th>
                  </tr>
                </thead>
                <tbody>
                  {holeRows.map(([holeNum, { a, b }]) => {
                    const parA = a?.par ?? null;
                    const parB = b?.par ?? null;
                    const dA = a?.distance ?? null;
                    const dB = b?.distance ?? null;
                    return (
                      <tr key={holeNum} style={{
                        background: (parA !== null && parB !== null && parA !== parB) ? "var(--bg-warn)" : undefined,
                        fontFamily: "var(--font-mono)",
                      }}>
                        <td style={{ fontWeight: 700 }}>B{holeNum}</td>
                        <td className="r" style={{ color: parA === 3 ? PAR_COLOR[3] : parA === 4 ? PAR_COLOR[4] : parA === 5 ? PAR_COLOR[5] : undefined, fontWeight: 700 }}>{parA ?? "–"}</td>
                        <td className="r">{dA != null && dA > 0 ? dA : "–"}</td>
                        <td className="r" style={{ color: parB === 3 ? PAR_COLOR[3] : parB === 4 ? PAR_COLOR[4] : parB === 5 ? PAR_COLOR[5] : undefined, fontWeight: 700 }}>{parB ?? "–"}</td>
                        <td className="r">{dB != null && dB > 0 ? dB : "–"}</td>
                        <td className="r"><Delta a={dA} b={dB} unit="m" /></td>
                        <td className="r"><Delta a={parA} b={parB} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}// ═══════════════════ Vista principal: comparação de campos ═══════════════════

function CourseComparisonView({ simCourses }: { simCourses: Course[] }) {
  const { players } = useAppContext();
  const sortedCourses = useMemo(
    () => [...simCourses].sort((a, b) =>
      a.master.name.localeCompare(b.master.name, "pt", { sensitivity: "base" })
    ),
    [simCourses]
  );

  const defaultCourseKey = useMemo(() => {
    const sds = sortedCourses.find(c => /santo\s+d[ao]\s+serra/i.test(c.master.name));
    return sds?.courseKey ?? sortedCourses[0]?.courseKey ?? "";
  }, [sortedCourses]);

  // ── Campo A ──
  const [selectedCourseKey, setSelectedCourseKey] = useState<string>(defaultCourseKey);
  const [selectedTeeId, setSelectedTeeId] = useState<string>("");

  // ── Campo B ──
  const [selectedCourseBKey, setSelectedCourseBKey] = useState<string>("");
  const [selectedTeeBId, setSelectedTeeBId] = useState<string>("");

  // ── Simulador inline (HI/PCC) ──
  const manuelHi = players[MANUEL_FED]?.hcp;
  const [hiInput, setHiInput] = useState<string>(manuelHi != null ? String(manuelHi) : "");
  const [pcc, setPcc] = useState<number>(0);
  const hi = hiInput.trim() !== "" ? parseFloat(hiInput.replace(",", ".")) : null;
  const hiValid = hi !== null && !isNaN(hi) && hi >= -4 && hi <= 54;

  const selectedCourse = useMemo(
    () => sortedCourses.find(c => c.courseKey === selectedCourseKey),
    [sortedCourses, selectedCourseKey]
  );
  const selectedTee = useMemo(() => {
    if (!selectedCourse) return undefined;
    return selectedCourse.master.tees.find(t => t.teeId === selectedTeeId) ?? selectedCourse.master.tees[0];
  }, [selectedCourse, selectedTeeId]);

  const selectedCourseB = useMemo(
    () => sortedCourses.find(c => c.courseKey === selectedCourseBKey),
    [sortedCourses, selectedCourseBKey]
  );
  const selectedTeeB = useMemo(() => {
    if (!selectedCourseB) return undefined;
    return selectedCourseB.master.tees.find(t => t.teeId === selectedTeeBId) ?? selectedCourseB.master.tees[0];
  }, [selectedCourseB, selectedTeeBId]);

  const comparisonCourses = useMemo(() => filterCoursesForComparison(simCourses), [simCourses]);

  const similarities = useMemo<SimRow[]>(() => {
    if (!selectedCourse || !selectedTee) return [];
    const uniqueCourses = new Map<string, Course>();
    for (const c of comparisonCourses) {
      if (c.courseKey === selectedCourseKey) continue;
      if (!uniqueCourses.has(c.courseKey)) uniqueCourses.set(c.courseKey, c);
    }
    const result: SimRow[] = [];
    const seenRows = new Set<string>();
    const seenTees = new WeakSet<Tee>();
    for (const course of uniqueCourses.values()) {
      for (const tee of course.master.tees) {
        if (seenTees.has(tee)) continue;
        seenTees.add(tee);
        const sim = calculateSimilarity(selectedTee, tee);
        if (sim === null) continue;
        const tier = simTier(sim.overall);
        if (tier === null) continue;
        const dist = tee.distances?.total ?? 0;
        const slope = tee.ratings?.holes18?.slopeRating ?? 0;
        const cr = tee.ratings?.holes18?.courseRating ?? 0;
        const par = getParTotal(tee);
        const rowKey = `${course.courseKey}|${tee.teeName.trim().toLowerCase()}|${tee.sex}|${dist}|${par}|${slope}|${cr}`;
        if (seenRows.has(rowKey)) continue;
        seenRows.add(rowKey);
        result.push({ course, tee, sim, tier });
      }
    }
    return result;
  }, [comparisonCourses, selectedCourse, selectedTee, selectedCourseKey]);

  if (simCourses.length === 0) {
    return <EmptyState icon="🏌️" message="Sem campos disponíveis para comparar." />;
  }

  return (
    <>
      {/* Toolbar Campo A */}
      <Toolbar>
        <ToolbarTitle>⛳ Campo A</ToolbarTitle>
        <select
          className="select"
          value={selectedCourseKey}
          onChange={e => { setSelectedCourseKey(e.target.value); setSelectedTeeId(""); }}
        >
          {sortedCourses.map(c => (
            <option key={c.courseKey} value={c.courseKey}>{c.master.name}</option>
          ))}
        </select>
        {selectedCourse && selectedCourse.master.tees.length > 0 && (
          <>
            <ToolbarSep />
            <ToolbarMeta>Tee</ToolbarMeta>
            <select
              className="select"
              value={selectedTee?.teeId ?? ""}
              onChange={e => setSelectedTeeId(e.target.value)}
            >
              {selectedCourse.master.tees.map(t => (
                <option key={t.teeId} value={t.teeId}>{t.teeName}</option>
              ))}
            </select>
          </>
        )}
      </Toolbar>

      {/* Toolbar Campo B */}
      <Toolbar>
        <ToolbarTitle>⛳ Campo B</ToolbarTitle>
        <select
          className="select"
          value={selectedCourseBKey}
          onChange={e => { setSelectedCourseBKey(e.target.value); setSelectedTeeBId(""); }}
        >
          <option value="">— nenhum —</option>
          {sortedCourses.map(c => (
            <option key={c.courseKey} value={c.courseKey}>{c.master.name}</option>
          ))}
        </select>
        {selectedCourseB && selectedCourseB.master.tees.length > 0 && (
          <>
            <ToolbarSep />
            <ToolbarMeta>Tee</ToolbarMeta>
            <select
              className="select"
              value={selectedTeeB?.teeId ?? ""}
              onChange={e => setSelectedTeeBId(e.target.value)}
            >
              {selectedCourseB.master.tees.map(t => (
                <option key={t.teeId} value={t.teeId}>{t.teeName}</option>
              ))}
            </select>
          </>
        )}
      </Toolbar>

      {!selectedCourse || !selectedTee ? (
        <EmptyState icon="👆" message="Selecciona um campo acima para ver comparações." />
      ) : comparisonCourses.length === 0 ? (
        <EmptyState icon="🌍" message="Sem campos elegíveis para comparar." />
      ) : (
        <>
          {/* Só Campo A seleccionado — hero card */}
          {!selectedCourseB && (
            <CourseHeroCard course={selectedCourse} tee={selectedTee} />
          )}

          {/* Comparação estrutural */}
          {selectedCourseB && selectedTeeB && (
            <CourseSideBySide
              courseA={selectedCourse} teeA={selectedTee}
              courseB={selectedCourseB} teeB={selectedTeeB}
            />
          )}

          {/* Score→SD — card com controlos integrados */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: "var(--fs-13)" }}>📊 Score → SD</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 4 }}>
                <label style={{ fontSize: "var(--fs-12)", fontWeight: 600, color: "var(--text-2)" }}>HI</label>
                <input
                  type="number" value={hiInput}
                  onChange={e => setHiInput(e.target.value)}
                  placeholder="ex: 9.5" step="0.1" min="-4" max="54"
                  style={{
                    width: 70, padding: "3px 7px", fontSize: "var(--fs-12)",
                    borderRadius: 4, border: "1px solid var(--border)",
                    background: "var(--bg)", color: "var(--text)",
                  }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: "var(--fs-12)", fontWeight: 600, color: "var(--text-2)" }}>PCC</label>
                <select
                  className="select" value={pcc}
                  onChange={e => setPcc(Number(e.target.value))}
                  style={{ minWidth: 60 }}
                >
                  {[-3, -2, -1, 0, 1, 2, 3].map(v => (
                    <option key={v} value={v}>{v > 0 ? `+${v}` : v}</option>
                  ))}
                </select>
              </div>
              {!hiValid && (
                <span className="muted" style={{ fontSize: "var(--fs-11)" }}>Insere o HI para ver a tabela</span>
              )}
            </div>
            {hiValid && hi !== null && selectedCourseB && selectedTeeB && (
              <TwoTeeSDTable
                courseA={selectedCourse} teeA={selectedTee}
                courseB={selectedCourseB} teeB={selectedTeeB}
                hi={hi} pcc={pcc}
              />
            )}
            {hiValid && hi !== null && !selectedCourseB && (
              <MultiTeeSDTable
                tees={selectedCourse.master.tees}
                pcc={pcc} hi={hi} is9h={false} holesMode="18" allowance={100}
              />
            )}
          </div>

          {/* Tabela de similitude */}
          <div className="card">
            <div className="h-md" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              🎯 Campos Similares
              <span className="muted" style={{ fontWeight: 500, fontSize: "var(--fs-12)" }}>
                · {similarities.length} resultado{similarities.length === 1 ? "" : "s"} ≥ 40%
              </span>
            </div>
            <div className="muted" style={{ fontSize: "var(--fs-12)", marginTop: -6, marginBottom: 12 }}>
              Pesos: 25% distância · 15% par · 60% min(slope, CR) · Clica no cabeçalho para ordenar · Clica numa linha para definir Campo B
            </div>
            {similarities.length === 0 ? (
              <EmptyState icon="🔍" message="Sem campos suficientemente parecidos." />
            ) : (
              <SimilarityTable
                rows={similarities}
                pickedKey={selectedCourseBKey && selectedTeeB
                  ? `${selectedCourseBKey}|${selectedTeeB.teeId}|${selectedTeeB.sex}|${selectedTeeB.ratings?.holes18?.slopeRating ?? ""}|${selectedTeeB.ratings?.holes18?.courseRating ?? ""}`
                  : null}
                onPick={row => {
                  setSelectedCourseBKey(prev =>
                    prev === row.course.courseKey && selectedTeeB?.teeId === row.tee.teeId
                      ? ""
                      : row.course.courseKey
                  );
                  setSelectedTeeBId(row.tee.teeId);
                }}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}

// ═══════════════════ Página principal ═══════════════════

type Tab = "campos" | "tees" | "jogadores" | "simulador";

export default function ComparePage() {
  const ctx = useAppContext();
  const [activeTab, setActiveTab] = useState<Tab>("campos");

  return (
    <div className="page-full page-full--wide">
      <Toolbar>
        <ToolbarTitle>⚔️ Comparar</ToolbarTitle>
        <ToolbarMeta>
          {ctx.simCourses.length} campos · {Object.keys(ctx.players).length} jogadores
        </ToolbarMeta>
      </Toolbar>

      <div className="tabbar-under" role="tablist" aria-label="Modo de comparação">
        <button type="button" role="tab" aria-selected={activeTab === "campos"}
          className={"tab-under" + (activeTab === "campos" ? " active" : "")}
          onClick={() => setActiveTab("campos")}>
          ⛳ Campos
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "tees"}
          className={"tab-under" + (activeTab === "tees" ? " active" : "")}
          onClick={() => setActiveTab("tees")}>
          🟡 Vantagem de Tee
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "jogadores"}
          className={"tab-under" + (activeTab === "jogadores" ? " active" : "")}
          onClick={() => setActiveTab("jogadores")}>
          🏌️ Jogadores
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "simulador"}
          className={"tab-under" + (activeTab === "simulador" ? " active" : "")}
          onClick={() => setActiveTab("simulador")}>
          🎯 Simulador
        </button>
      </div>

      <Suspense fallback={<LoadingState message="A carregar…" />}>
        {activeTab === "campos" ? (
          <CourseComparisonView simCourses={ctx.simCourses} />
        ) : activeTab === "tees" ? (
          <TeeAdvisorView simCourses={ctx.simCourses} />
        ) : activeTab === "simulador" ? (
          <SimuladorPageEmbedded />
        ) : (
          <CompararPlayersView players={ctx.players} />
        )}
      </Suspense>
    </div>
  );
}
