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

interface Props {
  data: CanonicalData;
  junior: Junior;
  filterTids?: Set<string> | null;
}

interface Bucket { label: string; count: number; bg: string; fg: string; }

interface ParBreakdown {
  parValue: 3 | 4 | 5;
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
    { label: "Eagle+",  count: stats.eaglesPlus,  bg: "var(--score-eagle)",   fg: "#ffffff" },
    { label: "Birdie",  count: stats.birdies,     bg: "var(--score-birdie)",  fg: "#ffffff" },
    { label: "Par",     count: stats.pars,        bg: "transparent",          fg: "var(--text)" },
    { label: "Bogey",   count: stats.bogeys,      bg: "var(--score-bogey)",   fg: "var(--score-bogey-fg)" },
    { label: "Duplo+",  count: stats.doublesPlus, bg: "var(--score-double)",  fg: "#ffffff" },
  ];

  return (
    <section style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "8px 0 10px" }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Distribuição de scoring</h3>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>
          {total} {total === 1 ? "buraco jogado" : "buracos jogados"} · {stats.subParPct}% sub-par
        </span>
      </div>

      {/* Barra stacked. Separadores subtis entre segmentos para distinguir o
          segmento Par (transparente, mostra fundo claro do contentor). */}
      <div style={{
        display: "flex", height: 26,
        borderRadius: 6, overflow: "hidden",
        border: "1px solid var(--border-light)",
        background: "var(--bg)",
      }}>
        {buckets.map((b, i) => {
          const pct = total > 0 ? (b.count / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={b.label}
              title={`${b.label}: ${b.count} (${pct.toFixed(1)}%)`}
              style={{
                width: `${pct}%`,
                background: b.bg,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, color: b.fg,
                fontWeight: 700,
                minWidth: pct < 4 ? 0 : undefined,
                overflow: "hidden",
                borderLeft: i > 0 ? "1px solid var(--border-light)" : undefined,
              }}
            >
              {pct >= 6 ? `${pct.toFixed(0)}%` : ""}
            </div>
          );
        })}
      </div>

      {/* Legenda */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6,
        fontSize: 10, color: "var(--text-3)",
      }}>
        {buckets.map((b) => {
          // Para o Par (fundo transparente) damos uma borda no quadradinho da legenda
          // para que continue legível contra o fundo da página.
          const isTransparent = b.bg === "transparent";
          return (
            <span key={b.label} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{
                width: 9, height: 9,
                borderRadius: b.label === "Bogey" || b.label === "Duplo+" ? 0 : 2,
                background: b.bg,
                border: isTransparent ? "1px solid var(--border)" : undefined,
                display: "inline-block",
              }} />
              <strong style={{ color: "var(--text-2)" }}>{b.label}</strong> {b.count}
            </span>
          );
        })}
      </div>

      {/* Breakdown por par-tipo */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10,
      }}>
        {stats.byPar.map((pb) => (
          <ParCard key={pb.parValue} pb={pb} />
        ))}
      </div>
    </section>
  );
}

function ParCard({ pb }: { pb: ParBreakdown }) {
  const diff = pb.avgStrokes != null ? pb.avgStrokes - pb.parValue : null;
  const diffLabel = diff == null ? "—" : diff === 0 ? "= par" : diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);
  const diffColor =
    diff == null ? "var(--text-3)" :
    diff <= -0.2 ? "var(--medal-gold-strong)" :
    diff <= 0.1 ? "var(--text-2)" :
    diff <= 0.4 ? "var(--color-warn-dark)" :
    "var(--color-danger-dark)";
  return (
    <div style={{
      background: "var(--bg-muted)",
      borderRadius: 6,
      padding: "8px 10px",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)" }}>Par {pb.parValue}</span>
        <span style={{ fontSize: 10, color: "var(--text-3)" }}>{pb.holesPlayed}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 3 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
          {pb.avgStrokes != null ? pb.avgStrokes.toFixed(2) : "—"}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: diffColor }}>
          {diffLabel}
        </span>
      </div>
      {/* Mini breakdown E/B/P/b/d dentro deste par — cores espelham regra do scorecard
          (App.css linhas 1004-1024). Par é neutro (transparente — sem cor própria). */}
      <div style={{ display: "flex", gap: 4, marginTop: 5, fontSize: 9, color: "var(--text-3)" }}>
        {pb.eagles > 0 && <span title="Eagles+"><strong style={{ color: "var(--score-eagle)" }}>{pb.eagles}</strong>E</span>}
        {pb.birdies > 0 && <span title="Birdies"><strong style={{ color: "var(--score-birdie)" }}>{pb.birdies}</strong>B</span>}
        {pb.pars > 0 && <span title="Pars"><strong style={{ color: "var(--text-2)" }}>{pb.pars}</strong>P</span>}
        {pb.bogeys > 0 && <span title="Bogeys"><strong style={{ color: "var(--score-bogey-fg)" }}>{pb.bogeys}</strong>b</span>}
        {pb.doublesPlus > 0 && <span title="Duplos+"><strong style={{ color: "var(--score-double)" }}>{pb.doublesPlus}</strong>d</span>}
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
  const byPar: Record<3 | 4 | 5, ParBreakdown> = {
    3: { parValue: 3, holesPlayed: 0, totalStrokes: 0, avgStrokes: null, eagles: 0, birdies: 0, pars: 0, bogeys: 0, doublesPlus: 0 },
    4: { parValue: 4, holesPlayed: 0, totalStrokes: 0, avgStrokes: null, eagles: 0, birdies: 0, pars: 0, bogeys: 0, doublesPlus: 0 },
    5: { parValue: 5, holesPlayed: 0, totalStrokes: 0, avgStrokes: null, eagles: 0, birdies: 0, pars: 0, bogeys: 0, doublesPlus: 0 },
  };
  let totalHoles = 0, eaglesPlus = 0, birdies = 0, pars = 0, bogeys = 0, doublesPlus = 0, subPar = 0;

  for (const tid of junior.tournamentIds) {
    if (filterTids && !filterTids.has(tid)) continue;
    const t = data.tournamentById.get(tid);
    if (!t) continue;
    for (const f of t.flights) {
      const r = f.results.find((x) => x.juniorId === junior.id);
      if (!r?.rounds || !f.par) continue;
      for (const rd of r.rounds) {
        if (!rd.strokes || rd.strokes.length === 0) continue;
        for (let i = 0; i < rd.strokes.length; i++) {
          const strokes = rd.strokes[i];
          const par = f.par[i];
          if (!strokes || strokes <= 0 || !par || par <= 0) continue;
          // só Par 3/4/5 (skip ranges anómalos)
          const p = (par === 3 || par === 4 || par === 5) ? (par as 3 | 4 | 5) : null;
          if (!p) continue;
          const diff = strokes - p;
          totalHoles++;
          byPar[p].holesPlayed++;
          byPar[p].totalStrokes += strokes;
          if (diff <= -2) { eaglesPlus++; byPar[p].eagles++; subPar++; }
          else if (diff === -1) { birdies++; byPar[p].birdies++; subPar++; }
          else if (diff === 0) { pars++; byPar[p].pars++; }
          else if (diff === 1) { bogeys++; byPar[p].bogeys++; }
          else { doublesPlus++; byPar[p].doublesPlus++; }
        }
      }
    }
  }

  for (const p of [3, 4, 5] as const) {
    if (byPar[p].holesPlayed > 0) byPar[p].avgStrokes = byPar[p].totalStrokes / byPar[p].holesPlayed;
  }

  return {
    totalHoles, eaglesPlus, birdies, pars, bogeys, doublesPlus,
    subParPct: totalHoles > 0 ? Math.round((subPar / totalHoles) * 100) : 0,
    byPar: [byPar[3], byPar[4], byPar[5]].filter((x) => x.holesPlayed > 0),
  };
}
