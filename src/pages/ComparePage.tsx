/**
 * ComparePage.tsx — Página /comparar
 *
 * Duas tabs (estilo .tab-under, coerente com FPGPage/BJGTPage/USKIDSPage):
 *   • Campos     — hero completo (KPIs + distribuição de pares) + tabela de similitude
 *   • Jogadores  — comparação detalhada entre 2-4 jogadores (delega em CompararPage)
 *
 * Estilos via classes existentes em App.css e tokens em tokens.css (sem hex hardcoded).
 *
 * Algoritmo de similitude (pesos): 25% distância, 15% par, 30% slope, 30% CR.
 * Cores semânticas: ≥80% verde · ≥60% azul · ≥40% laranja. <40% não aparece.
 *
 * Tabela ordenável por clique no cabeçalho (useSort + SortableHdr).
 */
import { useState, useMemo, lazy, Suspense } from "react";
import { useAppContext } from "../context/AppContext";
import EmptyState from "../ui/EmptyState";
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../ui/Toolbar";
import SortableHdr from "../ui/SortableHdr";
import { useSort } from "../hooks/useSort";
import type { Course, Tee } from "../data/types";

const CompararPlayersView = lazy(() => import("./CompararPage"));

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

function getParTotal(tee: Tee | null | undefined): number {
  if (!tee || !Array.isArray(tee.holes)) return 0;
  return tee.holes.reduce((sum, h) => sum + (h.par ?? 0), 0);
}

interface HoleEntry { hole: number; distance: number | null }
interface ParBreakdown {
  par: 3 | 4 | 5;
  count: number;
  avgDistance: number | null;
  totalDistance: number;
  holes: HoleEntry[];
}
function parBreakdown(tee: Tee | null | undefined): ParBreakdown[] {
  if (!tee || !Array.isArray(tee.holes)) return [];
  const out: ParBreakdown[] = [];
  for (const p of [3, 4, 5] as const) {
    const holes = tee.holes
      .filter(h => h.par === p)
      .map(h => ({ hole: h.hole, distance: h.distance }))
      .sort((a, b) => a.hole - b.hole);
    if (holes.length === 0) {
      out.push({ par: p, count: 0, avgDistance: null, totalDistance: 0, holes: [] });
      continue;
    }
    const dists = holes.map(h => h.distance ?? 0).filter(d => d > 0);
    const totalDistance = dists.reduce((a, b) => a + b, 0);
    out.push({
      par: p,
      count: holes.length,
      totalDistance,
      avgDistance: dists.length > 0 ? totalDistance / dists.length : null,
      holes,
    });
  }
  return out;
}

// ── Similitude ──

interface SimilarityScore {
  distance: number;
  par: number;
  slope: number;
  cr: number;
  overall: number;
}

/**
 * Calcula similitude entre dois tees. Escala absoluta de diferenças:
 *   • distância: 1000m de diff → 0 pontos
 *   • par: 4 strokes de diff → 0 pontos
 *   • slope: 15 pontos de diff → 0 pontos
 *   • CR: 3 strokes de diff → 0 pontos
 *
 * Pesos: 25% distância, 15% par, 60% min(slope, CR).
 * O min força que AMBOS slope E CR sejam parecidos — não chega ter um.
 * Sem essa restrição, um campo com slope 128 (vs 139 do Santo da Serra) e CR
 * idêntico passava como 89% similar, o que é falso (slope é difference de
 * dificuldade real). Tees sem slope/CR são excluídos.
 */
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

  // Excluir tees sem rating oficial e sem distância — sem dados não há comparação
  if (!slope1 || !slope2 || !cr1 || !cr2 || !dist1 || !dist2) return null;

  const distDiff = Math.abs(dist1 - dist2);
  const parDiff = Math.abs(par1 - par2);
  const slopeDiff = Math.abs(slope1 - slope2);
  const crDiff = Math.abs(cr1 - cr2);

  const distScore = Math.max(0, 100 - distDiff * 0.10);          // 1000m → 0
  const parScore = Math.max(0, 100 - parDiff * 25);              // 4 strokes → 0
  const slopeScore = Math.max(0, 100 - slopeDiff * (100 / 15));  // 15 → 0
  const crScore = Math.max(0, 100 - crDiff * (100 / 3));         // 3 strokes → 0

  // min(slope, cr) força ambos altos para haver similitude real
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

/** Extrai o valor numérico/string a usar para ordenar uma row por uma key. */
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

/** Direcção default para cada key — números desc, strings asc. */
const DEFAULT_DIR: Record<SimSortKey, "asc" | "desc"> = {
  name: "asc", tee: "asc",
  dist: "desc", par: "desc", slope: "desc", cr: "desc", overall: "desc",
};

function SimilarityTable({ rows }: { rows: SimRow[] }) {
  // useState local — sem indirecção, garante re-render
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
          {sortedRows.map(({ course, tee, sim, tier }) => {
            const teePar = getParTotal(tee);
            return (
              <tr key={`${course.courseKey}||${tee.teeId}`}>
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

function HeroCard({ course, tee }: { course: Course; tee: Tee }) {
  const pars = useMemo(() => parBreakdown(tee), [tee]);
  const totalParHoles = pars.reduce((s, p) => s + p.count, 0);

  const slope = tee.ratings?.holes18?.slopeRating ?? null;
  const cr = tee.ratings?.holes18?.courseRating ?? null;
  const distance = tee.distances?.total ?? null;
  const parTotal = getParTotal(tee);

  return (
    <div className="card">
      <div className="h-md" style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 18 }}>⛳ {course.master.name}</span>
        <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>· {tee.teeName}</span>
        {course.master.country && (
          <span className="p p-sm" style={{ background: "var(--bg-muted)", color: "var(--text-2)" }}>
            {course.master.country}
          </span>
        )}
      </div>

      <div className="haDiag">
        <div className="haDiagCard">
          <div className="haDiagIcon" style={{ background: "var(--bg-info-strong)" }}>📏</div>
          <div>
            <div className="haDiagVal">
              {distance ?? "–"}
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-3)", marginLeft: 4 }}>m</span>
            </div>
            <div className="haDiagLbl">Distância total</div>
          </div>
        </div>
        <div className="haDiagCard">
          <div className="haDiagIcon" style={{ background: "var(--accent-light)" }}>⛳</div>
          <div>
            <div className="haDiagVal">{parTotal || "–"}</div>
            <div className="haDiagLbl">Par total · {totalParHoles} buracos</div>
          </div>
        </div>
        <div className="haDiagCard">
          <div className="haDiagIcon" style={{ background: "var(--bg-warn)" }}>📐</div>
          <div>
            <div className="haDiagVal">{slope != null ? slope.toFixed(0) : "–"}</div>
            <div className="haDiagLbl">Slope rating</div>
          </div>
        </div>
        <div className="haDiagCard">
          <div className="haDiagIcon" style={{ background: "var(--bg-success-strong)" }}>🎯</div>
          <div>
            <div className="haDiagVal">{cr != null ? cr.toFixed(1) : "–"}</div>
            <div className="haDiagLbl">Course rating</div>
          </div>
        </div>
      </div>

      {pars.some(p => p.count > 0) && (
        <>
          <div className="h-xs" style={{ marginTop: 18 }}>Distribuição de pares</div>
          <div className="haParGrid">
            {pars.map(p => {
              const accentColor =
                p.par === 3 ? "var(--color-good)" :
                p.par === 4 ? "var(--color-info)" :
                "var(--text-purple)";
              const pct = totalParHoles > 0 ? Math.round((p.count / totalParHoles) * 100) : 0;
              return (
                <div key={p.par} className="haParCard" style={{ borderLeft: "3px solid " + accentColor, padding: "14px 16px" }}>
                  <div className="haParHead" style={{ color: accentColor, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", fontSize: 16, marginBottom: 8 }}>
                    <span>Par {p.par}</span>
                    {p.count > 0 && (
                      <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>
                        {p.count} buraco{p.count === 1 ? "" : "s"} · {pct}%
                      </span>
                    )}
                  </div>

                  {/* Lista de buracos individuais — pill B# + distância */}
                  {p.count > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {p.holes.map(h => (
                        <span
                          key={h.hole}
                          className="p"
                          style={{
                            background: accentColor,
                            color: "#fff",
                            fontFamily: "'JetBrains Mono', monospace",
                            fontWeight: 700,
                            fontSize: 12,
                            display: "inline-flex",
                            alignItems: "baseline",
                            gap: 4,
                          }}
                        >
                          <span>B{h.hole}</span>
                          <span style={{ fontWeight: 500, opacity: 0.9 }}>
                            {h.distance != null && h.distance > 0 ? `${h.distance}m` : "—"}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Resumo: média e total */}
                  <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" }}>
                    <div>
                      <span className="haParAvg" style={{ color: "var(--text)", fontSize: 24 }}>
                        {p.avgDistance != null ? Math.round(p.avgDistance) + "m" : "—"}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-3)", marginLeft: 6 }}>
                        média
                      </span>
                    </div>
                    {p.totalDistance > 0 && (
                      <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 0 }}>
                        Total <span style={{ fontWeight: 700, color: "var(--text-2)" }}>{p.totalDistance}m</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════ Vista principal: comparação de campos ═══════════════════

function CourseComparisonView({ simCourses }: { simCourses: Course[] }) {
  // Ordem alfabética para o dropdown
  const sortedCourses = useMemo(
    () => [...simCourses].sort((a, b) =>
      a.master.name.localeCompare(b.master.name, "pt", { sensitivity: "base" })
    ),
    [simCourses]
  );

  // Default: Santo da Serra (campo de origem do Manuel — CGSS), senão primeiro alfabético
  const defaultCourseKey = useMemo(() => {
    const sds = sortedCourses.find(c =>
      /santo\s+d[ao]\s+serra/i.test(c.master.name)
    );
    return sds?.courseKey ?? sortedCourses[0]?.courseKey ?? "";
  }, [sortedCourses]);

  const [selectedCourseKey, setSelectedCourseKey] = useState<string>(defaultCourseKey);
  const [selectedTeeId, setSelectedTeeId] = useState<string>("");

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
    const result: SimRow[] = [];
    if (selectedCourse && selectedTee) {
      for (const course of comparisonCourses) {
        if (course.courseKey === selectedCourseKey) continue;
        for (const tee of course.master.tees) {
          const sim = calculateSimilarity(selectedTee, tee);
          if (sim === null) continue;          // tee sem slope/CR — exclui
          const tier = simTier(sim.overall);
          if (tier === null) continue;          // similitude < 40%
          result.push({ course, tee, sim, tier });
        }
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
        <EmptyState icon="🌍" message="Sem campos elegíveis para comparar (só portugueses ou jogados pelo Manuel)." />
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
              Pesos: 25% distância · 15% par · 30% slope · 30% CR · Clica nos cabeçalhos para ordenar
            </div>

            {similarities.length === 0 ? (
              <EmptyState icon="🔍" message="Sem campos suficientemente parecidos (todos &lt; 40%)." />
            ) : (
              <SimilarityTable rows={similarities} />
            )}
          </div>
        </>
      )}
    </>
  );
}

// ═══════════════════ Página principal ═══════════════════

type Tab = "campos" | "jogadores";

export default function ComparePage() {
  const ctx = useAppContext();
  const [activeTab, setActiveTab] = useState<Tab>("campos");

  return (
    <div className="page-full">
      <Toolbar>
        <ToolbarTitle>⚔️ Comparar</ToolbarTitle>
        <ToolbarMeta>
          {ctx.simCourses.length} campos · {Object.keys(ctx.players).length} jogadores
        </ToolbarMeta>
      </Toolbar>

      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid var(--border)",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className={"tab-under" + (activeTab === "campos" ? " active" : "")}
          onClick={() => setActiveTab("campos")}
        >
          ⛳ Campos
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
        ) : (
          <CompararPlayersView players={ctx.players} />
        )}
      </Suspense>
    </div>
  );
}

