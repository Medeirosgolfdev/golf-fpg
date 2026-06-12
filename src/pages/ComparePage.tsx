/**
 * ComparePage.tsx — Página /comparar
 *
 * Duas tabs (estilo .tab-under, coerente com FPGPage/BJGTPage/USKIDSPage):
 *   • Campos     — hero completo (KPIs + distribuição de pares) + tabela de similitude
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
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../ui/Toolbar";
import SortableHdr from "../ui/SortableHdr";
import type { Course, Tee } from "../data/types";
import CourseHeroCard, { getParTotal } from "../ui/CourseHeroCard";

const CompararPlayersView = lazy(() => import("./CompararPage"));
const TeeAdvisorView = lazy(() => import("./comparar/TeeAdvisorView"));

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
                <td className="r" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{tee.distances?.total ?? "–"}</td>
                <td className="r" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{teePar || "–"}</td>
                <td className="r" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {tee.ratings?.holes18?.slopeRating ? tee.ratings.holes18.slopeRating.toFixed(0) : "–"}
                </td>
                <td className="r" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {tee.ratings?.holes18?.courseRating ? tee.ratings.holes18.courseRating.toFixed(1) : "–"}
                </td>
                <td className="r">
                  <span
                    className="p p-sm"
                    style={{
                      ...simBadgeStyle(tier),
                      fontFamily: "'JetBrains Mono', monospace",
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


// ═══════════════════ Vista principal: comparação de campos ═══════════════════

function CourseComparisonView({ simCourses }: { simCourses: Course[] }) {
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

  const [selectedCourseKey, setSelectedCourseKey] = useState<string>(defaultCourseKey);
  const [selectedTeeId, setSelectedTeeId] = useState<string>("");
  const [pickedRow, setPickedRow] = useState<SimRow | null>(null);

  const selectedCourse = useMemo(
    () => sortedCourses.find(c => c.courseKey === selectedCourseKey),
    [sortedCourses, selectedCourseKey]
  );
  const selectedTee = useMemo(() => {
    if (!selectedCourse) return undefined;
    return selectedCourse.master.tees.find(t => t.teeId === selectedTeeId) ?? selectedCourse.master.tees[0];
  }, [selectedCourse, selectedTeeId]);

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
      <Toolbar>
        <ToolbarTitle>⛳ Campo</ToolbarTitle>
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

      {!selectedCourse || !selectedTee ? (
        <EmptyState icon="👆" message="Selecciona um campo acima para ver comparações." />
      ) : comparisonCourses.length === 0 ? (
        <EmptyState icon="🌍" message="Sem campos elegíveis para comparar." />
      ) : (
        <>
          <HeroCard course={selectedCourse} tee={selectedTee} />
          <div className="card">
            <div className="h-md" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              🎯 Campos Similares
              <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>
                · {similarities.length} resultado{similarities.length === 1 ? "" : "s"} ≥ 40%
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 12 }}>
              Pesos: 25% distância · 15% par · 60% min(slope, CR) · Clica no cabeçalho para ordenar · Clica numa linha para comparar buracos
            </div>
            {similarities.length === 0 ? (
              <EmptyState icon="🔍" message="Sem campos suficientemente parecidos." />
            ) : (
              <SimilarityTable
                rows={similarities}
                pickedKey={pickedRow ? `${pickedRow.course.courseKey}|${pickedRow.tee.teeId}|${pickedRow.tee.sex}|${pickedRow.tee.ratings?.holes18?.slopeRating ?? ""}|${pickedRow.tee.ratings?.holes18?.courseRating ?? ""}` : null}
                onPick={(row) => setPickedRow(prev => prev && prev.tee === row.tee ? null : row)}
              />
            )}
          </div>

          {pickedRow && (
            <div className="card" style={{ borderLeft: "4px solid var(--accent)" }}>
              <div className="h-md" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                <span>🆚 Comparação de buracos</span>
                <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>
                  {selectedCourse.master.name} <span style={{ color: "var(--accent)" }}>·</span> {pickedRow.course.master.name}
                </span>
                <button
                  type="button"
                  onClick={() => setPickedRow(null)}
                  style={{
                    marginLeft: "auto", padding: "4px 10px", fontSize: 11, fontWeight: 600,
                    background: "var(--bg-muted)", border: "1px solid var(--border)",
                    borderRadius: 6, cursor: "pointer", color: "var(--text-2)",
                  }}
                >
                  ✕ Fechar
                </button>
              </div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
                Hero completo do campo comparado — usa o toggle "Por par / Por buraco" para alinhar a vista com o campo principal acima.
              </div>
              <HeroCard course={pickedRow.course} tee={pickedRow.tee} />
            </div>
          )}
        </>
      )}
    </>
  );
}

// ═══════════════════ Página principal ═══════════════════

type Tab = "campos" | "tees" | "jogadores";

export default function ComparePage() {
  const ctx = useAppContext();
  const [activeTab, setActiveTab] = useState<Tab>("campos");

  return (
    <div className="page-full" style={activeTab === "tees" ? { maxWidth: 1200 } : undefined}>
      <Toolbar>
        <ToolbarTitle>⚔️ Comparar</ToolbarTitle>
        <ToolbarMeta>
          {ctx.simCourses.length} campos · {Object.keys(ctx.players).length} jogadores
        </ToolbarMeta>
      </Toolbar>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: 16, flexWrap: "wrap" }}>
        <button
          type="button"
          className={"tab-under" + (activeTab === "campos" ? " active" : "")}
          onClick={() => setActiveTab("campos")}
        >
          ⛳ Campos
        </button>
        <button
          type="button"
          className={"tab-under" + (activeTab === "tees" ? " active" : "")}
          onClick={() => setActiveTab("tees")}
        >
          🟡 Vantagem de Tee
        </button>
        <button
          type="button"
          className={"tab-under" + (activeTab === "jogadores" ? " active" : "")}
          onClick={() => setActiveTab("jogadores")}
        >
          🏌️ Jogadores
        </button>
      </div>

      <Suspense fallback={<EmptyState icon="⏳" message="A carregar…" />}>
        {activeTab === "campos" ? (
          <CourseComparisonView simCourses={ctx.simCourses} />
        ) : activeTab === "tees" ? (
          <TeeAdvisorView simCourses={ctx.simCourses} />
        ) : (
          <CompararPlayersView players={ctx.players} />
        )}
      </Suspense>
    </div>
  );
}
