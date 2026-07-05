/**
 * src/ui/CourseHeroCard.tsx
 *
 * Componente partilhado de "hero" do campo — KPIs (distância/par/slope/CR)
 * + distribuição de pares (Por par / Por buraco). Extraído da ComparePage
 * para reuso em /kids2/next-t (tab "O Campo") e potencialmente noutras
 * páginas que precisem de visualizar a anatomia de um campo+tee.
 *
 * Os helpers (parBreakdown, holeColor, holesByNumber, PAR_HSL) também são
 * exportados para usos pontuais (ex: gerar legenda à parte).
 */
import { useMemo, useState } from "react";
import type { Course, Tee } from "../data/types";

interface HoleEntry { hole: number; distance: number | null }
export interface ParBreakdown {
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

export function getParTotal(tee: Tee | null | undefined): number {
  if (!tee || !Array.isArray(tee.holes)) return 0;
  return tee.holes.reduce((sum, h) => sum + (h.par ?? 0), 0);
}

// Cor por buraco: gradiente HSL forte dentro do par (curto=claro → longo=escuro)
export const PAR_HSL: Record<3 | 4 | 5, { h: number; s: number }> = {
  3: { h: 142, s: 65 },  // verde
  4: { h: 270, s: 55 },  // roxo
  5: { h: 355, s: 72 },  // vermelho
};

export function holeColor(par: 3 | 4 | 5, t: number): { bg: string; fg: string; border: string } {
  const { h, s: sMax } = PAR_HSL[par];
  const l = 82 - t * 27;
  const s = 45 + t * (sMax - 45);
  const borderL = Math.max(28, l - 22);
  return {
    bg: `hsl(${h}deg, ${s}%, ${l}%)`,
    fg: "#1c2617",
    border: `hsl(${h}deg, ${sMax}%, ${borderL}%)`,
  };
}

function holesByNumber(tee: Tee): Array<{ hole: number; par: 3|4|5|null; distance: number | null; color: ReturnType<typeof holeColor> | null }> {
  const pars = parBreakdown(tee);
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
        fontSize: "var(--fs-9)", fontWeight: 800, marginLeft: 4, cursor: "help",
        fontFamily: "system-ui, sans-serif",
      }}
    >ⓘ</span>
  );
}

/**
 * CourseHeroCard — KPIs + distribuição de pares.
 * Drop-in replacement do HeroCard interno da ComparePage.
 */
export default function CourseHeroCard({ course, tee }: { course: Course; tee: Tee }) {
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
        <span style={{ fontSize: "var(--fs-18)" }}>⛳ {course.master.name}</span>
        <span className="muted" style={{ fontSize: "var(--fs-13)", fontWeight: 500 }}>· {tee.teeName}</span>
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
              <span style={{ fontSize: "var(--fs-13)", fontWeight: 600, color: "var(--text-3)", marginLeft: 4 }}>m</span>
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, marginBottom: 10, flexWrap: "wrap" }}>
            <div className="h-xs" style={{ marginBottom: 0 }}>Vista do campo</div>
            <div style={{ display: "inline-flex", gap: 2, padding: 2, background: "var(--bg-muted)", borderRadius: 8 }}>
              {(["par", "buraco"] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  style={{
                    padding: "4px 12px", fontSize: "var(--fs-11)", fontWeight: 700,
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
            <span className="muted" style={{ fontSize: "var(--fs-11)", fontWeight: 500 }}>
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
                  <div key={p.par} className="haParCard" style={{ borderLeft: "3px solid " + accentColor, padding: "12px 16px" }}>
                    <div style={{ color: accentColor, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", fontSize: "var(--fs-16)", fontWeight: 800, marginBottom: 4 }}>
                      <span>Par {p.par}</span>
                      <span className="muted" style={{ fontWeight: 500, fontSize: "var(--fs-13)" }}>
                        {p.count} buraco{p.count === 1 ? "" : "s"} · {pct}%
                      </span>
                    </div>
                    {p.avgDistance != null && (
                      <div style={{ fontSize: "var(--fs-11)", color: "var(--text-3)", marginBottom: 10 }}>
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
                            style={{ display: "inline-flex", alignItems: "baseline", gap: 4, fontFamily: "var(--font-mono)" }}
                            title={`Buraco ${h.hole} · ${h.distance ?? "—"}m`}
                          >
                            <span style={{ fontSize: "var(--fs-11)", fontWeight: 700, color: "var(--text-3)" }}>B{h.hole}</span>
                            <span
                              className="p"
                              style={{
                                background: col.bg,
                                color: col.fg,
                                border: `1px solid ${col.border}`,
                                fontWeight: 700,
                                fontSize: "var(--fs-13)",
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
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      <span style={{ fontSize: "var(--fs-10)", fontWeight: 700, opacity: 0.85 }}>B{h.hole}</span>
                      <span style={{ fontSize: "var(--fs-15)", fontWeight: 800, lineHeight: 1.1, marginTop: 2 }}>
                        {h.distance != null && h.distance > 0 ? <>{h.distance}<span style={{ fontSize: "var(--fs-10)", fontWeight: 600, opacity: 0.85, marginLeft: 1 }}>m</span></> : "—"}
                      </span>
                      <span style={{ fontSize: "var(--fs-9)", fontWeight: 600, opacity: 0.75, marginTop: 1 }}>
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
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
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
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
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
              <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap", fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
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
