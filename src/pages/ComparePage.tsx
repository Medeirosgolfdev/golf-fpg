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

// ── Cor por buraco: gradiente HSL forte dentro do par (curto=claro → longo=escuro)
const PAR_HSL: Record<3 | 4 | 5, { h: number; s: number }> = {
  3: { h: 142, s: 65 },  // verde
  4: { h: 270, s: 55 },  // roxo — distinto de verde, vermelho, azul (birdies) e laranja (eagles)
  5: { h: 355, s: 72 },  // vermelho
};
function holeColor(par: 3 | 4 | 5, t: number): { bg: string; fg: string; border: string } {
  // t: 0 (mais curto do par) → 1 (mais longo)
  // Lightness comprimida (82% → 55%) para que texto escuro seja sempre legível —
  // gradiente é dado também por saturação (45% → 95%) para manter punch visual.
  const { h, s: sMax } = PAR_HSL[par];
  const l = 82 - t * 27;             // 82% (pastel) → 55% (saturado mid)
  const s = 45 + t * (sMax - 45);    // 45% (washed) → sMax (vivo)
  const borderL = Math.max(28, l - 22);
  return {
    bg: `hsl(${h}deg, ${s}%, ${l}%)`,
    fg: "#1c2617",                   // sempre texto escuro — consistente
    border: `hsl(${h}deg, ${sMax}%, ${borderL}%)`,
  };
}

/** Devolve uma lista plana ordenada por número de buraco, com cor já calculada. */
function holesByNumber(tee: Tee): Array<{ hole: number; par: 3|4|5|null; distance: number | null; color: ReturnType<typeof holeColor> | null }> {
  const pars = parBreakdown(tee);
  // Pré-calcular ranking (t 0→1) por par
  const tByHole = new Map<number, { par: 3|4|5; t: number }>();
  for (const p of pars) {
    if (p.count === 0) continue;
    const dists = p.holes.map(h => h.distance ?? 0).filter(d => d > 0);
    const minDist = dists.length > 0 ? Math.min(...dists) : 0;
    const maxDist = dists.length > 0 ? Math.max(...dists) : 0;
    const range = maxDist - minDist;
    for (const h of p.holes) {
      const t = range > 0 && h.distance ? (h.distance - minDist) / range : 0.5;
      tByHole.set(h.hole, { par: p.par, t });
    }
  }
  if (!tee.holes) return [];
  return [...tee.holes]
    .sort((a, b) => a.hole - b.hole)
    .map(h => {
      const info = tByHole.get(h.hole);
      const isValidPar = h.par === 3 || h.par === 4 || h.par === 5;
      return {
        hole: h.hole,
        par: isValidPar ? (h.par as 3 | 4 | 5) : null,
        distance: h.distance,
        color: info ? holeColor(info.par, info.t) : null,
      };
    });
}

function InfoIcon({ title }: { title: string }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 14, height: 14, borderRadius: "50%",
        background: "var(--bg-muted)", color: "var(--text-2)",
        fontSize: 9, fontWeight: 800, marginLeft: 4, cursor: "help",
        fontFamily: "system-ui, sans-serif",
      }}
    >ⓘ</span>
  );
}

function HeroCard({ course, tee }: { course: Course; tee: Tee }) {
  const pars = useMemo(() => parBreakdown(tee), [tee]);
  const orderedHoles = useMemo(() => holesByNumber(tee), [tee]);
  const totalParHoles = pars.reduce((s, p) => s + p.count, 0);
  const slope = tee.ratings?.holes18?.slopeRating ?? null;
  const cr = tee.ratings?.holes18?.courseRating ?? null;
  const distance = tee.distances?.total ?? null;
  const parTotal = getParTotal(tee);

  const [viewMode, setViewMode] = useState<"par" | "buraco">("par");

  const SLOPE_INFO = "Slope Rating — dificuldade relativa do campo para um jogador amador. Escala 55-155 (média = 113). Maior = mais difícil para handicaps altos.";
  const CR_INFO = "Course Rating — nº de pancadas esperado para um jogador scratch (hcp 0). Compara com o par: CR > par significa campo abaixo do par esperado em dificuldade.";

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
            <div className="haDiagLbl" style={{ display: "flex", alignItems: "center" }}>
              Slope rating
              <InfoIcon title={SLOPE_INFO} />
            </div>
          </div>
        </div>
        <div className="haDiagCard">
          <div className="haDiagIcon" style={{ background: "var(--bg-success-strong)" }}>🎯</div>
          <div>
            <div className="haDiagVal">{cr != null ? cr.toFixed(1) : "–"}</div>
            <div className="haDiagLbl" style={{ display: "flex", alignItems: "center" }}>
              Course rating
              <InfoIcon title={CR_INFO} />
            </div>
          </div>
        </div>
      </div>

      {totalParHoles > 0 && (
        <>
          {/* Toggle Por par / Por buraco */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, marginBottom: 10, flexWrap: "wrap" }}>
            <div className="h-xs" style={{ marginBottom: 0 }}>Vista do campo</div>
            <div style={{ display: "inline-flex", gap: 2, padding: 2, background: "var(--bg-muted)", borderRadius: 8 }}>
              {(["par", "buraco"] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  style={{
                    padding: "4px 12px", fontSize: 11, fontWeight: 700,
                    border: "none", borderRadius: 6, cursor: "pointer",
                    background: viewMode === m ? "var(--bg-card)" : "transparent",
                    color: viewMode === m ? "var(--text)" : "var(--text-3)",
                    boxShadow: viewMode === m ? "var(--shadow-sm)" : "none",
                  }}
                >
                  {m === "par" ? "Por par" : "Por buraco"}
                </button>
              ))}
            </div>
            <span className="muted" style={{ fontSize: 11, fontWeight: 500 }}>
              {viewMode === "par"
                ? "Distância dentro de cada par (claro → escuro)"
                : "Sequência B1→B18 (cor = par; lightness = comprimento relativo)"}
            </span>
          </div>

          {viewMode === "par" ? (
            <div className="haParGrid">
              {pars.map(p => {
                if (p.count === 0) return null;
                const accentColor =
                  p.par === 3 ? `hsl(${PAR_HSL[3].h}deg, ${PAR_HSL[3].s}%, 38%)` :
                  p.par === 4 ? `hsl(${PAR_HSL[4].h}deg, ${PAR_HSL[4].s}%, 45%)` :
                  `hsl(${PAR_HSL[5].h}deg, ${PAR_HSL[5].s}%, 45%)`;
                const pct = totalParHoles > 0 ? Math.round((p.count / totalParHoles) * 100) : 0;
                const dists = p.holes.map(h => h.distance ?? 0).filter(d => d > 0);
                const minDist = dists.length > 0 ? Math.min(...dists) : 0;
                const maxDist = dists.length > 0 ? Math.max(...dists) : 0;
                const range = maxDist - minDist;
                const tFor = (dist: number) => (range === 0 || !dist) ? 0.5 : (dist - minDist) / range;

                return (
                  <div key={p.par} className="haParCard" style={{ borderLeft: "3px solid " + accentColor, padding: "14px 16px" }}>
                    <div style={{ color: accentColor, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
                      <span>Par {p.par}</span>
                      <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>
                        {p.count} buraco{p.count === 1 ? "" : "s"} · {pct}%
                      </span>
                    </div>
                    {p.avgDistance != null && (
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 10 }}>
                        Média <span style={{ fontWeight: 700, color: "var(--text-2)" }}>{Math.round(p.avgDistance)}m</span>
                        {p.totalDistance > 0 && <> · Total <span style={{ fontWeight: 700, color: "var(--text-2)" }}>{p.totalDistance}m</span></>}
                      </div>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {p.holes.map(h => {
                        const col = holeColor(p.par, tFor(h.distance ?? 0));
                        return (
                          <span
                            key={h.hole}
                            style={{ display: "inline-flex", alignItems: "baseline", gap: 4, fontFamily: "'JetBrains Mono', monospace" }}
                            title={`Buraco ${h.hole} · ${h.distance ?? "—"}m`}
                          >
                            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>B{h.hole}</span>
                            <span
                              className="p"
                              style={{
                                background: col.bg,
                                color: col.fg,
                                border: `1px solid ${col.border}`,
                                fontWeight: 700,
                                fontSize: 13,
                                padding: "3px 9px",
                                minWidth: 50,
                                justifyContent: "center",
                              }}
                            >
                              {h.distance != null && h.distance > 0 ? `${h.distance}m` : "—"}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ═══ Vista Por buraco: F9 e B9 separados em duas linhas ═══ */
            <div>
              {(() => {
                const front9 = orderedHoles.filter(h => h.hole >= 1 && h.hole <= 9);
                const back9  = orderedHoles.filter(h => h.hole >= 10 && h.hole <= 18);
                const renderHole = (h: typeof orderedHoles[0]) => {
                  const col = h.color;
                  return (
                    <div
                      key={h.hole}
                      title={`Buraco ${h.hole} · Par ${h.par ?? "?"} · ${h.distance ?? "—"}m`}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        flex: "1 1 0", minWidth: 52, padding: "6px 4px 8px", borderRadius: 8,
                        background: col?.bg ?? "var(--bg-muted)",
                        color: col?.fg ?? "var(--text-3)",
                        border: `1px solid ${col?.border ?? "var(--border)"}`,
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.85 }}>B{h.hole}</span>
                      <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.1, marginTop: 2 }}>
                        {h.distance != null && h.distance > 0 ? <>{h.distance}<span style={{ fontSize: 10, fontWeight: 600, opacity: 0.85, marginLeft: 1 }}>m</span></> : "—"}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.75, marginTop: 1 }}>
                        par {h.par ?? "?"}
                      </span>
                    </div>
                  );
                };
                const sumDist = (arr: typeof orderedHoles) =>
                  arr.reduce((s, h) => s + (h.distance ?? 0), 0);
                const sumPar = (arr: typeof orderedHoles) =>
                  arr.reduce((s, h) => s + (h.par ?? 0), 0);

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {front9.length > 0 && (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, fontSize: 11, color: "var(--text-3)" }}>
                          <span className="h-xs" style={{ marginBottom: 0 }}>Front 9</span>
                          <span>Par {sumPar(front9)} · {sumDist(front9)}m</span>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          {front9.map(renderHole)}
                        </div>
                      </div>
                    )}
                    {back9.length > 0 && (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, fontSize: 11, color: "var(--text-3)" }}>
                          <span className="h-xs" style={{ marginBottom: 0 }}>Back 9</span>
                          <span>Par {sumPar(back9)} · {sumDist(back9)}m</span>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          {back9.map(renderHole)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* Legenda */}
              <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap", fontSize: 11, color: "var(--text-3)" }}>
                {([3, 4, 5] as const).map(p => {
                  const sample = holeColor(p, 0.6);
                  return (
                    <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: 4,
                        background: sample.bg,
                        border: `1px solid ${sample.border}`,
                      }} />
                      <span>Par {p}</span>
                    </span>
                  );
                })}
                <span className="muted">claro = curto · escuro = longo</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
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
