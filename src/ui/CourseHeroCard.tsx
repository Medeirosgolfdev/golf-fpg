/**
 * src/ui/CourseHeroCard.tsx
 *
 * Componente partilhado de "hero" do campo — KPIs (distância/par/slope/CR)
 * + distribuição de pares (Por par / Por buraco). Extraído da ComparePage
 * para reuso em /kids2/next-t (tab "O Campo") e potencialmente noutras
 * páginas que precisem de visualizar a anatomia de um campo+tee.
 *
 * PAR_HSL e getParTotal são exportados para reuso; os restantes helpers
 * (parBreakdown, holeColor, holesByNumber) são internos.
 */
import { useMemo, useState } from "react";
import type { Course, Tee } from "../data/types";

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

function holeColor(par: 3 | 4 | 5, t: number): { bg: string; fg: string; border: string } {
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
      className="u-d-inline-flex u-ai-center u-jc-center u-w-14px u-h-14px u-br-50pc u-bg-bg-muted u-c-text-2 u-fs-fs-9 u-fw-800 u-ml-4px u-cur-help u-ff-system-ui-sans-serif"
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
      <div className="h-md u-d-flex u-ai-baseline u-gap-8px u-fwr-wrap">
        <span className="u-fs-fs-18">⛳ {course.master.name}</span>
        <span className="muted u-fs-fs-13 u-fw-500">· {tee.teeName}</span>
        {course.master.country && (
          <span className="p p-sm u-bg-bg-muted u-c-text-2">
            {course.master.country}
          </span>
        )}
      </div>

      <div className="haDiag">
        <div className="haDiagCard">
          <div className="haDiagIcon u-bg-bg-info-strong">📏</div>
          <div>
            <div className="haDiagVal">
              {distance ?? "–"}
              <span className="u-fs-fs-13 u-fw-600 u-c-text-3 u-ml-4px">m</span>
            </div>
            <div className="haDiagLbl">Distância total</div>
          </div>
        </div>
        <div className="haDiagCard">
          <div className="haDiagIcon u-bg-accent-light">⛳</div>
          <div>
            <div className="haDiagVal">{parTotal || "–"}</div>
            <div className="haDiagLbl">Par total · {totalParHoles} buracos</div>
          </div>
        </div>
        <div className="haDiagCard">
          <div className="haDiagIcon u-bg-bg-warn">📐</div>
          <div>
            <div className="haDiagVal">{slope != null ? slope.toFixed(0) : "–"}</div>
            <div className="haDiagLbl u-d-flex u-ai-center">
              Slope rating
              <InfoIcon title={SLOPE_INFO} />
            </div>
          </div>
        </div>
        <div className="haDiagCard">
          <div className="haDiagIcon u-bg-bg-success-strong">🎯</div>
          <div>
            <div className="haDiagVal">{cr != null ? cr.toFixed(1) : "–"}</div>
            <div className="haDiagLbl u-d-flex u-ai-center">
              Course rating
              <InfoIcon title={CR_INFO} />
            </div>
          </div>
        </div>
      </div>

      {totalParHoles > 0 && (
        <>
          <div className="u-d-flex u-ai-center u-gap-8px u-mt-18px u-mb-10px u-fwr-wrap">
            <div className="h-xs u-mb-0">Vista do campo</div>
            <div className="u-d-inline-flex u-gap-2px u-p-2px u-bg-bg-muted u-br-radius-lg">
              {(["par", "buraco"] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  style={{
                    padding: "4px 12px", fontSize: "var(--fs-11)", fontWeight: 700,
                    border: "none", borderRadius: "var(--radius)", cursor: "pointer",
                    background: viewMode === m ? "var(--bg-card)" : "transparent",
                    color: viewMode === m ? "var(--text)" : "var(--text-3)",
                    boxShadow: viewMode === m ? "var(--shadow-sm)" : "none",
                  }}
                >
                  {m === "par" ? "Por par" : "Por buraco"}
                </button>
              ))}
            </div>
            <span className="muted u-fs-fs-11 u-fw-500">
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
                      <span className="muted u-fw-500 u-fs-fs-13">
                        {p.count} buraco{p.count === 1 ? "" : "s"} · {pct}%
                      </span>
                    </div>
                    {p.avgDistance != null && (
                      <div className="u-fs-fs-11 u-c-text-3 u-mb-10px">
                        Média <span className="u-fw-700 u-c-text-2">{Math.round(p.avgDistance)}m</span>
                        {p.totalDistance > 0 && <> · Total <span className="u-fw-700 u-c-text-2">{p.totalDistance}m</span></>}
                      </div>
                    )}
                    <div className="u-d-flex u-fwr-wrap u-gap-10px">
                      {p.holes.map(h => {
                        const col = holeColor(p.par, tFor(h.distance ?? 0));
                        return (
                          <span
                            key={h.hole}
                            className="u-d-inline-flex u-ai-baseline u-gap-4px u-ff-font-mono"
                            title={`Buraco ${h.hole} · ${h.distance ?? "—"}m`}
                          >
                            <span className="u-fs-fs-11 u-fw-700 u-c-text-3">B{h.hole}</span>
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
                      <span className="u-fs-fs-10 u-fw-700 u-op-0_85">B{h.hole}</span>
                      <span className="u-fs-fs-15 u-fw-800 u-lh-1_1 u-mt-2px">
                        {h.distance != null && h.distance > 0 ? <>{h.distance}<span className="u-fs-fs-10 u-fw-600 u-op-0_85 u-ml-1px">m</span></> : "—"}
                      </span>
                      <span className="u-fs-fs-9 u-fw-600 u-op-0_75 u-mt-1px">
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
                  <div className="u-d-flex u-fd-column u-gap-14px">
                    {front9.length > 0 && (
                      <div>
                        <div className="u-d-flex u-jc-space-between u-ai-baseline u-mb-6px u-fs-fs-11 u-c-text-3">
                          <span className="h-xs u-mb-0">Front 9</span>
                          <span>Par {sumPar(front9)} · {sumDist(front9)}m</span>
                        </div>
                        <div className="u-d-flex u-gap-4px">
                          {front9.map(renderHole)}
                        </div>
                      </div>
                    )}
                    {back9.length > 0 && (
                      <div>
                        <div className="u-d-flex u-jc-space-between u-ai-baseline u-mb-6px u-fs-fs-11 u-c-text-3">
                          <span className="h-xs u-mb-0">Back 9</span>
                          <span>Par {sumPar(back9)} · {sumDist(back9)}m</span>
                        </div>
                        <div className="u-d-flex u-gap-4px">
                          {back9.map(renderHole)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="u-d-flex u-gap-16px u-mt-12px u-fwr-wrap u-fs-fs-11 u-c-text-3">
                {([3, 4, 5] as const).map(p => {
                  const sample = holeColor(p, 0.6);
                  return (
                    <span key={p} className="u-d-inline-flex u-ai-center u-gap-6px">
                      <span style={{
                        width: 16, height: 16, borderRadius: "var(--radius-sm)",
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
