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
import InfoIcon from "./InfoIcon";
import SectionTitle from "./SectionTitle";
import { Tint } from "./DataStyle";

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
  // 04/11/2026 (Mariana): o verde e o vermelho confundiam-se com os outros
  // verdes/vermelhos do site (atacar/defender, birdie, ±par) → teal e terracota.
  3: { h: 180, s: 60 },  // teal
  4: { h: 270, s: 55 },  // roxo
  5: { h: 25, s: 75 },   // terracota
};

function holeColor(par: 3 | 4 | 5, t: number): { bg: string; fg: string; border: string } {
  const { h, s: sMax } = PAR_HSL[par];
  const l = 82 - t * 27;
  const s = 45 + t * (sMax - 45);
  const borderL = Math.max(28, l - 22);
  return {
    bg: `hsl(${h}deg, ${s}%, ${l}%)`,
    fg: "var(--text)",
    border: `hsl(${h}deg, ${sMax}%, ${borderL}%)`,
  };
}

/** A cor de cada buraco pelo par e pelo comprimento dentro do par (a mesma da
 *  «Vista do campo») — para outras tabelas pintarem a coluna Par igual
 *  (04/11/2026, Previsão: «temos uma fórmula para colorir os par 3, 4 e 5»). */
export function parHoleColors(tee: Tee): Map<number, { bg: string; fg: string; border: string }> {
  const out = new Map<number, { bg: string; fg: string; border: string }>();
  for (const h of holesByNumber(tee)) if (h.color) out.set(h.hole, h.color);
  return out;
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

/**
 * CourseHeroCard — KPIs + distribuição de pares.
 * Drop-in replacement do HeroCard interno da ComparePage.
 */
/** Número com ícone (Distância, Par, Slope, CR…) — o mesmo na ficha do campo e
 *  na comparação de campos (.haDiagCard). `valueColor` só para cores dos dados. */
export function HeroStat({ icon, tone, value, unit, label, valueColor }: {
  icon: string;
  tone: "info" | "accent" | "warn" | "good";
  value: React.ReactNode;
  unit?: string;
  label: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <div className="haDiagCard">
      <div className={"haDiagIcon is-" + tone}>{icon}</div>
      <div>
        <Tint as="div" className="haDiagVal" fg={valueColor}>
          {value}{unit && value !== "–" && <span className="u-fs-fs-13 u-fw-600 u-c-text-3 u-ml-4px">{unit}</span>}
        </Tint>
        <div className="haDiagLbl u-d-flex u-ai-center">{label}</div>
      </div>
    </div>
  );
}

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
  // CR/Slope não publicados → rótulo «(estimado)» e a origem no ⓘ.
  const estNota = cr != null ? tee.ratings?.holes18?.estimado : undefined;
  const est = estNota ? " (estimado)" : "";
  const estInfo = (info: string) => (estNota ? `${info}\n\nESTIMADO — ${estNota}` : info);

  return (
    <div className="card">
      <SectionTitle as="div" size="lg" icon="⛳" className="u-m-0-0-8px">
        {course.master.name} <span className="muted u-fw-500">· {tee.teeName}</span>
        {course.master.country && <span className="p p-sm p-muted u-ml-6px">{course.master.country}</span>}
      </SectionTitle>

      <div className="haDiag">
        <HeroStat icon="📏" tone="info" value={distance ?? "–"} unit="m" label="Distância total" />
        <HeroStat icon="⛳" tone="accent" value={parTotal || "–"} label={`Par total · ${totalParHoles} buracos`} />
        <HeroStat icon="📐" tone="warn" value={slope != null ? slope.toFixed(0) : "–"} label={<>Slope rating{est}<InfoIcon title={estInfo(SLOPE_INFO)} /></>} />
        <HeroStat icon="🎯" tone="good" value={cr != null ? cr.toFixed(1) : "–"} label={<>Course rating{est}<InfoIcon title={estInfo(CR_INFO)} /></>} />
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
                  className={viewMode === m ? "ha-mode-btn active" : "ha-mode-btn"}
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
                  <Tint as="div" key={p.par} className="haParCard ha-par-card" bd={accentColor}>
                    <Tint as="div" className="ha-par-title" fg={accentColor}>
                      <span>Par {p.par}</span>
                      <span className="muted u-fw-500 u-fs-fs-13">
                        {p.count} buraco{p.count === 1 ? "" : "s"} · {pct}%
                      </span>
                    </Tint>
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
                            <Tint className="p ha-dist-pill" bg={col.bg} fg={col.fg} bd={col.border}>
                              {h.distance != null && h.distance > 0 ? `${h.distance}m` : "—"}
                            </Tint>
                          </span>
                        );
                      })}
                    </div>
                  </Tint>
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
                    <Tint
                      as="div"
                      key={h.hole}
                      className="hole-chip mono"
                      title={`Buraco ${h.hole} · Par ${h.par ?? "?"} · ${h.distance ?? "—"}m`}
                      bg={col?.bg ?? "var(--bg-muted)"} fg={col?.fg ?? "var(--text-3)"} bd={col?.border ?? "var(--border)"}
                    >
                      <span className="u-fs-fs-10 u-fw-700 u-op-0_85">B{h.hole}</span>
                      <span className="u-fs-fs-15 u-fw-800 u-lh-1_1 u-mt-2px">
                        {h.distance != null && h.distance > 0 ? <>{h.distance}<span className="u-fs-fs-10 u-fw-600 u-op-0_85 u-ml-1px">m</span></> : "—"}
                      </span>
                      <span className="u-fs-fs-9 u-fw-600 u-op-0_75 u-mt-1px">
                        par {h.par ?? "?"}
                      </span>
                    </Tint>
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
                      <Tint className="ha-swatch" bg={sample.bg} bd={sample.border} />
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
