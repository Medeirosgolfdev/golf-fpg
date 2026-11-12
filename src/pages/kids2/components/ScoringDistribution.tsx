/**
 * kids2/components/ScoringDistribution.tsx
 *
 * Distribuição agregada de scores de carreira (todos os buracos jogados em
 * todos os torneios visíveis):
 *
 *   • Barra horizontal stacked com 5 segmentos: Eagle+ / Birdie / Par / Bogey / Duplo+
 *   • Cards por tipo de buraco: Par 3 / Par 4 / Par 5 — média de strokes + nº de buracos jogados
 *
 * Requer scorecards hole-by-hole (result.rounds[].strokes[] + flight.par[]). Torneios
 * sem esses dados são silenciosamente saltados — apenas alimentam o histórico macro.
 */

import { useMemo } from "react";
import type { CanonicalData, Junior } from "../data";
import SectionTitle from "../../../ui/SectionTitle";
import { Fill } from "../../../ui/DataStyle";
import { resultadosDoJunior } from "../juniorCalc";
import { fmtSign } from "../../../utils/format";
import { addDist, emptyDist, parTypeStats, type Cartao } from "../../../utils/analysisStats";

interface Props {
  data: CanonicalData;
  junior: Junior;
  filterTids?: Set<string> | null;
}

/** `cls`: cor do segmento/quadradinho (fundo + texto), em App.css (.k2-sd-*). */
interface Bucket { label: string; count: number; cls: string; }

interface ParBreakdown {
  parValue: number;
  holesPlayed: number;
  totalStrokes: number;
  avgStrokes: number | null;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doublesPlus: number;
}

export default function ScoringDistribution({ data, junior, filterTids }: Props) {
  const stats = useMemo(() => compute(data, junior, filterTids), [data, junior, filterTids]);

  if (stats.totalHoles === 0) return null;

  const total = stats.totalHoles;
  // ⚠ REGRA FIXA (App.css linhas 1004-1024 + CLAUDE.md "Scorecard — semântica de cores"):
  //   Eagle    → --score-eagle + #fff
  //   Birdie   → --score-birdie + #fff
  //   Par      → TRANSPARENTE + var(--text)    (NÃO usar --score-par-seg)
  //   Bogey    → --score-bogey + --score-bogey-fg + border --score-bogey-border
  //   Duplo+   → --score-double + #fff
  const buckets: Bucket[] = [
    { label: "Eagle+",  count: stats.eaglesPlus,  cls: "k2-sd-eagle" },
    { label: "Birdie",  count: stats.birdies,     cls: "k2-sd-birdie" },
    { label: "Par",     count: stats.pars,        cls: "k2-sd-par" },
    { label: "Bogey",   count: stats.bogeys,      cls: "k2-sd-bogey" },
    { label: "Duplo+",  count: stats.doublesPlus, cls: "k2-sd-double" },
  ];

  return (
    <section className="u-mb-4px">
      <SectionTitle right={<span>
        {total} {total === 1 ? "buraco jogado" : "buracos jogados"} · {stats.subParPct}% sub-par
      </span>}>
        Distribuição de scoring
      </SectionTitle>

      {/* Barra stacked. Separadores subtis entre segmentos para distinguir o
          segmento Par (transparente, mostra fundo claro do contentor). */}
      <div className="u-d-flex u-h-26px u-br-radius u-ov-hidden u-bd-1px-solid-border-light u-bg-bg">
        {buckets.map((b, i) => {
          const pct = total > 0 ? (b.count / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <Fill
              key={b.label}
              pct={pct}
              title={`${b.label}: ${b.count} (${pct.toFixed(1)}%)`}
              className={`k2-sd-seg ${b.cls}${pct < 4 ? " u-minw-0" : ""}${i > 0 ? " k2-sd-sep" : ""}`}
            >
              {pct >= 6 ? `${pct.toFixed(0)}%` : ""}
            </Fill>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="u-d-flex u-fwr-wrap u-gap-10px u-mt-6pxx u-fs-fs-10 u-c-text-3">
        {buckets.map((b) => {
          // Para o Par (fundo transparente) o quadradinho da legenda tem borda
          // (.k2-sd-key.k2-sd-par) para continuar legível contra o fundo da página.
          return (
            <span key={b.label} className="u-d-inline-flex u-ai-center u-gap-4px">
              <span className={`k2-sd-key ${b.cls}`} />
              <strong className="u-c-text-2">{b.label}</strong> {b.count}
            </span>
          );
        })}
      </div>

      {/* Breakdown por par-tipo */}
      <div className="u-d-grid u-grid-template-columns-1md9r u-gap-10px u-mt-10px">
        {stats.byPar.map((pb) => (
          <ParCard key={pb.parValue} pb={pb} />
        ))}
      </div>
    </section>
  );
}

function ParCard({ pb }: { pb: ParBreakdown }) {
  const diff = pb.avgStrokes != null ? pb.avgStrokes - pb.parValue : null;
  const diffLabel = diff == null ? "—" : diff === 0 ? "= par" : fmtSign(diff, 2);
  const diffTone =
    diff == null ? "u-c-text-3" :
    diff <= -0.2 ? "u-c-medal-gold-strong" :
    diff <= 0.1 ? "u-c-text-2" :
    diff <= 0.4 ? "u-c-color-warn-dark" :
    "u-c-color-danger-dark";
  return (
    <div className="u-bg-bg-muted u-br-radius u-p-8px-10px">
      <div className="u-d-flex u-ai-baseline u-jc-space-between">
        <span className="u-fs-fs-11 u-fw-700 u-c-text-2">Par {pb.parValue}</span>
        <span className="u-fs-fs-10 u-c-text-3">{pb.holesPlayed}</span>
      </div>
      <div className="u-d-flex u-ai-baseline u-gap-6px u-mt-3px">
        <span className="u-fs-fs-18 u-fw-700 u-c-text">
          {pb.avgStrokes != null ? pb.avgStrokes.toFixed(2) : "—"}
        </span>
        <span className={`u-fs-fs-11 u-fw-700 ${diffTone}`}>
          {diffLabel}
        </span>
      </div>
      {/* Mini breakdown E/B/P/b/d dentro deste par — cores espelham regra do scorecard
          (App.css linhas 1004-1024). Par é neutro (transparente — sem cor própria). */}
      <div className="u-d-flex u-gap-4px u-mt-4px u-fs-fs-9 u-c-text-3">
        {pb.eagles > 0 && <span title="Eagles+"><strong className="u-c-score-eagle">{pb.eagles}</strong>E</span>}
        {pb.birdies > 0 && <span title="Birdies"><strong className="u-c-score-birdie">{pb.birdies}</strong>B</span>}
        {pb.pars > 0 && <span title="Pars"><strong className="u-c-text-2">{pb.pars}</strong>P</span>}
        {pb.bogeys > 0 && <span title="Bogeys"><strong className="u-c-score-bogey-fg">{pb.bogeys}</strong>b</span>}
        {pb.doublesPlus > 0 && <span title="Duplos+"><strong className="u-c-score-double">{pb.doublesPlus}</strong>d</span>}
      </div>
    </div>
  );
}

interface CareerStats {
  totalHoles: number;
  eaglesPlus: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doublesPlus: number;
  subParPct: number;
  byPar: ParBreakdown[];
}

function compute(data: CanonicalData, junior: Junior, filterTids?: Set<string> | null): CareerStats {
  // Os cartões de todas as provas, cada um com o par do seu escalão; as contas
  // (por tipo de buraco e a distribuição) são as de utils/analysisStats.
  const cards: Cartao[] = [];
  for (const { f, r } of resultadosDoJunior(junior, data.tournamentById, filterTids)) {
    if (!r?.rounds || !f.par) continue;
    for (const rd of r.rounds) if (rd.strokes?.length) cards.push({ scores: rd.strokes, par: f.par });
  }
  const tipos = parTypeStats(cards);
  const d = tipos.reduce((acc, t) => addDist(acc, t.dist), emptyDist());
  return {
    totalHoles: d.total, eaglesPlus: d.eagles, birdies: d.birdies, pars: d.pars, bogeys: d.bogeys, doublesPlus: d.dbPlus,
    subParPct: d.total > 0 ? Math.round(((d.eagles + d.birdies) / d.total) * 100) : 0,
    byPar: tipos.map((t): ParBreakdown => ({
      parValue: t.par, holesPlayed: t.holes, totalStrokes: t.strokes, avgStrokes: t.avgStrokes,
      eagles: t.dist.eagles, birdies: t.dist.birdies, pars: t.dist.pars, bogeys: t.dist.bogeys, doublesPlus: t.dist.dbPlus,
    })),
  };
}
