/**
 * PerfilJogadorSection — Leitura rápida e comparação visual.
 *
 * Substitui a análise SWOT técnica (σ, SD, +0.73 vs par) por:
 *   1. "Ronda típica" — tradução de métricas abstractas em pancadas por ronda
 *      (ex: Par 3 com média +0.73 × 4 buracos ≈ 2.9 pancadas perdidas/ronda).
 *   2. Comparação visual em barras — Par 3/4/5, pares-ou-melhor, desastres,
 *      regularidade — sempre com legenda em linguagem natural.
 *   3. Leitura narrativa — bullets por jogador, em bom português, sem jargão.
 */

import { firstName } from "../../utils/format";
import { SC } from "../../utils/scoreDisplay";
import type { Slot, AggStats, PlayerStatsDb, PeriodKey } from "./types";
import { COLORS, COLORS_LIGHT, periodLabel } from "./types";

/* ═══════════════════════════════════════════════════════════════════
   Helpers de linguagem natural
   ═══════════════════════════════════════════════════════════════════ */

/** Número em pancadas — "+0,73" → "+0,73" (mantém sinal e vírgula PT). */
const f2 = (v: number, showPlus = true) =>
  (v >= 0 && showPlus ? "+" : "") + v.toFixed(2).replace(".", ",");
const f1 = (v: number, showPlus = true) =>
  (v >= 0 && showPlus ? "+" : "") + v.toFixed(1).replace(".", ",");

/**
 * Qualifica um valor vs par médio em linguagem natural.
 * >1.0 "muito acima do par"; 0.5-1.0 "bem acima"; 0.2-0.5 "ligeiramente acima";
 * 0 a 0.2 "próximo do par"; < 0 "abaixo do par"
 */
function qualVsPar(v: number): string {
  if (v >= 1.0) return "muito acima do par";
  if (v >= 0.5) return "bem acima do par";
  if (v >= 0.2) return "ligeiramente acima do par";
  if (v >= -0.05) return "próximo do par";
  if (v >= -0.3) return "ligeiramente abaixo do par";
  return "abaixo do par";
}

/** Qualifica σ (variabilidade) entre rondas — menor é melhor. */
function qualVariability(sigma: number): { label: string; color: string } {
  if (sigma <= 3.0)  return { label: "muito regular",       color: SC.good };
  if (sigma <= 4.5)  return { label: "bastante regular",    color: SC.good };
  if (sigma <= 6.0)  return { label: "regularidade média",  color: "var(--text-2)" };
  if (sigma <= 8.0)  return { label: "irregular",           color: "var(--color-info)" };
  return { label: "muito irregular", color: SC.danger };
}

/** Traduz formAlert em frase. */
function formText(form: "hot" | "cold" | null | undefined): string | null {
  if (form === "hot")  return "🔥 Em boa forma recente";
  if (form === "cold") return "❄️ Em má forma recente";
  return null;
}

/** Traduz hcpTrend em frase. */
function hcpTrendText(trend: "up" | "stable" | "down" | undefined, delta: number | null | undefined): string | null {
  if (trend === "up")   return `📈 HCP a descer${delta != null ? ` (${delta} em 3 meses)` : ""} — em progressão`;
  if (trend === "down") return `📉 HCP a subir${delta != null ? ` (+${delta} em 3 meses)` : ""} — atenção`;
  return null;
}

/** Projecta média vs par por tipo numa ronda típica (4 Par 3, 10 Par 4, 4 Par 5). */
function typicalRoundImpact(agg: AggStats): { par3: number | null; par4: number | null; par5: number | null; total: number | null } {
  const p3 = agg.byPar[3]?.avgVsPar ?? null;
  const p4 = agg.byPar[4]?.avgVsPar ?? null;
  const p5 = agg.byPar[5]?.avgVsPar ?? null;
  const par3 = p3 != null ? p3 * 4  : null;
  const par4 = p4 != null ? p4 * 10 : null;
  const par5 = p5 != null ? p5 * 4  : null;
  const parts = [par3, par4, par5].filter((v): v is number => v != null);
  const total = parts.length === 3 ? par3! + par4! + par5! : null;
  return { par3, par4, par5, total };
}

/** Pancadas por ronda (+X) numa frase. */
const roundImpactText = (v: number | null) => {
  if (v == null) return "–";
  if (v > 0) return `perde ≈ ${v.toFixed(1)} pancadas`;
  if (v < 0) return `ganha ${Math.abs(v).toFixed(1)} pancadas`;
  return "neutro";
};

/* ═══════════════════════════════════════════════════════════════════
   Barra comparativa — usada em todos os cards
   ═══════════════════════════════════════════════════════════════════ */

type Row = { s: Slot; agg: AggStats; i: number };

function ComparativeBar({ rows, getValue, dir, format, scaleMin, scaleMax }: {
  rows: Row[];
  getValue: (a: AggStats) => number | null;
  dir: "low" | "high";  // lower is better OR higher is better
  format: (v: number) => string;
  scaleMin?: number;
  scaleMax?: number;
}) {
  const vals = rows.map(r => ({ r, v: getValue(r.agg) }))
    .filter((x): x is { r: Row; v: number } => x.v != null);
  if (vals.length === 0) return null;

  const numericVals = vals.map(x => x.v);
  const minV = scaleMin ?? Math.min(0, ...numericVals);
  const maxV = scaleMax ?? Math.max(...numericVals) * 1.1;
  const range = Math.max(0.0001, maxV - minV);
  const best = dir === "low" ? Math.min(...numericVals) : Math.max(...numericVals);

  return (
    <div className="d-flex flex-col gap-4">
      {vals.map(({ r, v }) => {
        const pct = ((v - minV) / range) * 100;
        const isBest = Math.abs(v - best) < 0.001 && vals.length > 1;
        return (
          <div key={r.i} className="d-flex items-center gap-8">
            <span className="fs-11 fw-700" style={{ minWidth: 72, color: COLORS[r.i] }}>
              {firstName(r.s.player.name)}
            </span>
            <div style={{ flex: 1, position: "relative", height: 18, background: "var(--border-light)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                width: `${Math.max(2, Math.min(100, pct))}%`,
                height: "100%",
                background: COLORS[r.i],
                opacity: 0.85,
              }} />
              {isBest && (
                <span style={{
                  position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
                  fontSize: 10, fontWeight: 800, color: "#fff",
                  textShadow: "0 0 2px rgba(0,0,0,.4)",
                }}>★</span>
              )}
            </div>
            <span className="mono fs-12 fw-700" style={{
              minWidth: 52, textAlign: "right",
              color: isBest ? COLORS[r.i] : "var(--text-2)",
            }}>
              {format(v)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CARD: Ronda típica
   ═══════════════════════════════════════════════════════════════════ */

function RondaTipica({ rows }: { rows: Row[] }) {
  const impacts = rows.map(r => ({ r, imp: typicalRoundImpact(r.agg) }));
  // Melhor = menor soma total (menos pancadas perdidas)
  const totals = impacts.map(x => x.imp.total).filter((v): v is number => v != null);
  const bestTotal = totals.length >= 2 ? Math.min(...totals) : null;

  return (
    <div className="card p-12" style={{ background: "var(--bg-1)" }}>
      <div className="fw-800 fs-14 mb-8">🎯 Numa ronda típica (par 72)</div>
      <div className="muted fs-11 mb-10">
        Projecção de pancadas ganhas/perdidas em 4 Par 3 + 10 Par 4 + 4 Par 5. Lê assim: "Em cada ronda, este jogador perde em média X pancadas nos Par 3, Y nos Par 4, Z nos Par 5."
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(rows.length, 4)}, 1fr)`, gap: 12 }}>
        {impacts.map(({ r, imp }) => {
          const isBest = imp.total != null && bestTotal != null && Math.abs(imp.total - bestTotal) < 0.001;
          return (
            <div key={r.i} style={{
              border: `2px solid ${COLORS[r.i]}`,
              borderRadius: "var(--radius)",
              padding: 12,
              background: isBest ? COLORS_LIGHT[r.i] : undefined,
            }}>
              <div className="d-flex items-center gap-6 mb-8">
                <span className="round" style={{ width: 11, height: 11, background: COLORS[r.i] }} />
                <b style={{ color: COLORS[r.i], fontSize: 13 }}>{firstName(r.s.player.name)}</b>
                {isBest && <span className="fs-10" style={{ color: SC.good, fontWeight: 800 }}>★ melhor</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <RoundImpactRow label="🟢 Par 3"  v={imp.par3}  />
                <RoundImpactRow label="🔵 Par 4"  v={imp.par4}  />
                <RoundImpactRow label="🟣 Par 5"  v={imp.par5}  />
                <div style={{ borderTop: "1px solid var(--border-light)", marginTop: 6, paddingTop: 6 }}>
                  <RoundImpactRow label="Total" v={imp.total} strong />
                </div>
                {imp.total != null && (
                  <div className="fs-11 c-text-3 mt-2">
                    ≈ score típico num par 72: <b>{Math.round(72 + imp.total)}</b>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoundImpactRow({ label, v, strong = false }: { label: string; v: number | null; strong?: boolean }) {
  const sign = v == null ? "" : v > 0 ? "+" : v < 0 ? "" : "";
  const color = v == null ? "var(--text-muted)"
              : v > 0.3 ? SC.danger
              : v > 0   ? "var(--color-info)"
              : v === 0 ? "var(--text-2)"
              : SC.good;
  return (
    <div className="d-flex items-center jc-between gap-6">
      <span className="fs-12" style={{ color: "var(--text-2)", fontWeight: strong ? 800 : 500 }}>{label}</span>
      <span className="mono" style={{
        fontSize: strong ? 14 : 12,
        fontWeight: strong ? 900 : 700,
        color,
      }}>
        {v != null ? `${sign}${v.toFixed(1)}` : "–"}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CARD: Comparações visuais
   ═══════════════════════════════════════════════════════════════════ */

function VisualComparisons({ rows }: { rows: Row[] }) {
  const allHavePars = rows.every(r => r.agg.byPar[3] && r.agg.byPar[4] && r.agg.byPar[5]);
  const totalHoles = rows.map(r => r.agg.scoreDist.total);
  const hasHoleData = totalHoles.every(n => n > 0);

  return (
    <div className="d-flex flex-col gap-14">
      <Block title="🟢 Par 3 — pancadas acima/abaixo do par por buraco" explain="Mais baixo é melhor. Ideal ≈ 0.">
        <ComparativeBar
          rows={rows}
          getValue={a => a.byPar[3]?.avgVsPar ?? null}
          dir="low"
          format={v => `${f2(v)} por buraco`}
          scaleMin={Math.min(-0.3, ...rows.map(r => r.agg.byPar[3]?.avgVsPar ?? 0))}
          scaleMax={Math.max(1.5, ...rows.map(r => r.agg.byPar[3]?.avgVsPar ?? 0))}
        />
      </Block>

      <Block title="🔵 Par 4 — pancadas acima/abaixo do par por buraco">
        <ComparativeBar
          rows={rows}
          getValue={a => a.byPar[4]?.avgVsPar ?? null}
          dir="low"
          format={v => `${f2(v)} por buraco`}
          scaleMin={Math.min(-0.3, ...rows.map(r => r.agg.byPar[4]?.avgVsPar ?? 0))}
          scaleMax={Math.max(1.5, ...rows.map(r => r.agg.byPar[4]?.avgVsPar ?? 0))}
        />
      </Block>

      <Block title="🟣 Par 5 — pancadas acima/abaixo do par por buraco">
        <ComparativeBar
          rows={rows}
          getValue={a => a.byPar[5]?.avgVsPar ?? null}
          dir="low"
          format={v => `${f2(v)} por buraco`}
          scaleMin={Math.min(-0.5, ...rows.map(r => r.agg.byPar[5]?.avgVsPar ?? 0))}
          scaleMax={Math.max(1.5, ...rows.map(r => r.agg.byPar[5]?.avgVsPar ?? 0))}
        />
      </Block>

      {hasHoleData && (
        <Block title="✅ % de buracos em par ou melhor" explain="Mais alto é melhor.">
          <ComparativeBar
            rows={rows}
            getValue={a => a.scoreDist.total > 0 ? a.parOrBetterPct : null}
            dir="high"
            format={v => `${v.toFixed(0)}%`}
            scaleMin={0}
            scaleMax={100}
          />
        </Block>
      )}

      {hasHoleData && (
        <Block title="⚠️ % de buracos com desastres (double bogey ou pior)" explain="Mais baixo é melhor.">
          <ComparativeBar
            rows={rows}
            getValue={a => a.scoreDist.total > 0 ? a.dblOrWorsePct : null}
            dir="low"
            format={v => `${v.toFixed(0)}%`}
            scaleMin={0}
            scaleMax={Math.max(25, ...rows.map(r => r.agg.dblOrWorsePct))}
          />
        </Block>
      )}

      {hasHoleData && (
        <Block title="🐦 % de buracos com birdie" explain="Mais alto é melhor.">
          <ComparativeBar
            rows={rows}
            getValue={a => a.scoreDist.total > 0 ? (a.scoreDist.birdie / a.scoreDist.total * 100) : null}
            dir="high"
            format={v => `${v.toFixed(1)}%`}
            scaleMin={0}
            scaleMax={Math.max(20, ...rows.map(r => (r.agg.scoreDist.total > 0 ? r.agg.scoreDist.birdie / r.agg.scoreDist.total * 100 : 0) + 2))}
          />
        </Block>
      )}

      <Block title="📏 Regularidade — quanta variação há entre rondas" explain="Mais baixo é melhor: rondas mais previsíveis.">
        <ComparativeBar
          rows={rows}
          getValue={a => a.grossStdDev}
          dir="low"
          format={v => {
            const q = qualVariability(v);
            return `${v.toFixed(1)} — ${q.label}`;
          }}
        />
      </Block>
    </div>
  );
}

function Block({ title, explain, children }: { title: string; explain?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="fw-700 fs-12 mb-2">{title}</div>
      {explain && <div className="muted fs-10 mb-6">{explain}</div>}
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CARD: Leitura narrativa por jogador
   ═══════════════════════════════════════════════════════════════════ */

type Reading = {
  strengths: string[];
  weaknesses: string[];
  context: string[];
  conclusion: string;
};

function buildReading(me: Row, others: Row[], statsDb: PlayerStatsDb): Reading {
  const a = me.agg;
  const ps = statsDb[me.s.fed];
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const context: string[] = [];

  // ── Pars: comparar com média do grupo ──
  const parEntries = [3, 4, 5].map(pt => {
    const mine = a.byPar[pt]?.avgVsPar;
    if (mine == null) return null;
    const othersVals = others.map(o => o.agg.byPar[pt]?.avgVsPar).filter((v): v is number => v != null);
    const groupAvg = othersVals.length > 0 ? othersVals.reduce((s, v) => s + v, 0) / othersVals.length : null;
    const delta = groupAvg != null ? mine - groupAvg : null;
    return { pt, mine, groupAvg, delta };
  }).filter((x): x is { pt: number; mine: number; groupAvg: number | null; delta: number | null } => x != null);

  // Par tipo mais forte vs outros
  if (parEntries.length > 0) {
    const withDelta = parEntries.filter((x): x is { pt: number; mine: number; groupAvg: number; delta: number } => x.delta != null);
    if (withDelta.length > 0) {
      const bestRel = withDelta.reduce((a, b) => a.delta < b.delta ? a : b);
      const worstRel = withDelta.reduce((a, b) => a.delta > b.delta ? a : b);
      if (bestRel.delta < -0.05) {
        strengths.push(`Mais forte que o grupo nos <b>Par ${bestRel.pt}</b> (em média ${f2(Math.abs(bestRel.delta))} pancadas melhor por buraco)`);
      } else if (bestRel.delta < 0.1) {
        strengths.push(`Par ${bestRel.pt} é a área onde perde <b>menos terreno</b> para o grupo (${f2(bestRel.delta)} por buraco)`);
      }
      if (worstRel.delta > 0.1) {
        weaknesses.push(`Perde mais que o grupo nos <b>Par ${worstRel.pt}</b> (${f2(worstRel.delta)} pancadas por buraco, ≈ ${(Math.abs(worstRel.delta) * (worstRel.pt === 4 ? 10 : 4)).toFixed(1)} por ronda)`);
      }
    }

    // Frase absoluta do melhor par type pessoal
    const bestAbs = parEntries.reduce((a, b) => a.mine < b.mine ? a : b);
    const worstAbs = parEntries.reduce((a, b) => a.mine > b.mine ? a : b);
    if (Math.abs(bestAbs.mine - worstAbs.mine) >= 0.15) {
      if (bestAbs.mine <= 0) {
        strengths.push(`Joga <b>Par ${bestAbs.pt}</b> muito bem — média de ${f2(bestAbs.mine)} por buraco (abaixo ou igual ao par)`);
      } else {
        strengths.push(`<b>Par ${bestAbs.pt}</b> é o seu tipo de buraco mais confortável (${f2(bestAbs.mine)} por buraco, ${qualVsPar(bestAbs.mine)})`);
      }
      weaknesses.push(`<b>Par ${worstAbs.pt}</b> é onde mais perde — ${f2(worstAbs.mine)} por buraco (${qualVsPar(worstAbs.mine)})`);
    }
  }

  // ── % Par-ou-melhor / Doubles+ ──
  if (a.scoreDist.total > 0 && others.length > 0) {
    const othersPob = others.map(o => o.agg.parOrBetterPct).filter(v => v != null);
    const othersDbl = others.map(o => o.agg.dblOrWorsePct).filter(v => v != null);
    if (othersPob.length > 0) {
      const groupPob = othersPob.reduce((s, v) => s + v, 0) / othersPob.length;
      if (a.parOrBetterPct > groupPob + 3) {
        strengths.push(`Faz par ou melhor em <b>${a.parOrBetterPct.toFixed(0)}%</b> dos buracos (grupo: ${groupPob.toFixed(0)}%)`);
      } else if (a.parOrBetterPct < groupPob - 3) {
        weaknesses.push(`Só faz par ou melhor em <b>${a.parOrBetterPct.toFixed(0)}%</b> dos buracos (grupo: ${groupPob.toFixed(0)}%)`);
      }
    }
    if (othersDbl.length > 0) {
      const groupDbl = othersDbl.reduce((s, v) => s + v, 0) / othersDbl.length;
      if (a.dblOrWorsePct > groupDbl + 3) {
        weaknesses.push(`<b>${a.dblOrWorsePct.toFixed(0)}%</b> dos buracos em double+ (grupo: ${groupDbl.toFixed(0)}%) — muitos desastres`);
      } else if (a.dblOrWorsePct < groupDbl - 2) {
        strengths.push(`Evita desastres — só ${a.dblOrWorsePct.toFixed(0)}% em double+ (grupo: ${groupDbl.toFixed(0)}%)`);
      }
    }
  }

  // ── Regularidade ──
  if (a.grossStdDev != null) {
    const q = qualVariability(a.grossStdDev);
    const othersSig = others.map(o => o.agg.grossStdDev).filter((v): v is number => v != null);
    if (othersSig.length > 0) {
      const groupSig = othersSig.reduce((s, v) => s + v, 0) / othersSig.length;
      if (a.grossStdDev < groupSig - 1.5) {
        strengths.push(`Muito mais <b>regular</b> que o grupo — ${q.label}`);
      } else if (a.grossStdDev > groupSig + 1.5) {
        weaknesses.push(`Muito mais <b>irregular</b> que o grupo — ${q.label} (rondas pouco previsíveis)`);
      }
    } else if (q.label.includes("regular")) {
      strengths.push(`Rondas ${q.label}s entre si`);
    } else if (q.label.includes("irregular")) {
      weaknesses.push(`Rondas ${q.label}s — dificulta expectativas`);
    }
  }

  // ── F9 vs B9 ──
  if (a.f9toParAvg != null && a.b9toParAvg != null) {
    const diff = a.f9toParAvg - a.b9toParAvg;
    if (Math.abs(diff) >= 0.5) {
      if (diff < 0) {
        strengths.push(`Arranca bem — <b>Front 9</b> melhor que Back 9 em ${f1(Math.abs(diff), false)} pancadas`);
      } else {
        strengths.push(`Fecha bem — <b>Back 9</b> melhor que Front 9 em ${f1(Math.abs(diff), false)} pancadas`);
      }
    }
  }

  // ── Contexto (tendência, forma, volume) ──
  const hcpText = hcpTrendText(ps?.hcpTrend, ps?.hcpDelta3m);
  if (hcpText) context.push(hcpText);
  const fText = formText(ps?.formAlert);
  if (fText) context.push(fText);
  if (ps?.roundsLast12m != null) {
    const label = ps.roundsLast12m >= 40 ? "alto volume de jogo"
                : ps.roundsLast12m >= 20 ? "volume razoável"
                : "pouco volume";
    context.push(`${ps.roundsLast12m} rondas nos últimos 12 meses — <b>${label}</b>`);
  }
  if (ps?.currentHcp != null) {
    context.push(`HCP actual: <b>${ps.currentHcp.toFixed(1)}</b>`);
  }
  // Gap potencial-vs-médio
  if (a.best8of20SD != null && a.avgSD != null && a.avgSD - a.best8of20SD >= 1.5) {
    context.push(`Tem potencial para jogar a SD ${a.best8of20SD.toFixed(1)} mas a média actual é ${a.avgSD.toFixed(1)} — espaço claro para subir o nível médio`);
  }

  // Garantias de não-vazio — perfil pessoal ainda dá algo mesmo sem comparação
  if (strengths.length === 0 && parEntries.length > 0) {
    const bestAbs = parEntries.reduce((a, b) => a.mine < b.mine ? a : b);
    strengths.push(`O seu tipo de buraco mais confortável é <b>Par ${bestAbs.pt}</b> (${f2(bestAbs.mine)} por buraco, ${qualVsPar(bestAbs.mine)})`);
  }
  if (weaknesses.length === 0 && parEntries.length > 0) {
    const worstAbs = parEntries.reduce((a, b) => a.mine > b.mine ? a : b);
    weaknesses.push(`Onde mais perde pancadas é nos <b>Par ${worstAbs.pt}</b> (${f2(worstAbs.mine)} por buraco)`);
  }
  if (strengths.length === 0) strengths.push(`Base de ${a.nRounds} rondas disponível para comparação`);
  if (weaknesses.length === 0) weaknesses.push("Sem pontos fracos claros neste período");
  if (context.length === 0) context.push(`${a.nRounds} rondas no período`);

  // Conclusão — frase global
  const me_impact = typicalRoundImpact(a);
  let conclusion = "";
  if (me_impact.total != null) {
    const othersImpacts = others.map(o => typicalRoundImpact(o.agg).total).filter((v): v is number => v != null);
    if (othersImpacts.length > 0) {
      const bestGroup = Math.min(...othersImpacts);
      const gap = me_impact.total - bestGroup;
      if (Math.abs(gap) < 0.5) {
        conclusion = `Score típico muito parecido ao do melhor do grupo (diferença < 1 pancada/ronda).`;
      } else if (gap < 0) {
        conclusion = `Score típico ${Math.abs(gap).toFixed(1)} pancadas/ronda <b>abaixo</b> do melhor do grupo — é o mais consistente em scoring.`;
      } else {
        conclusion = `Score típico ${gap.toFixed(1)} pancadas/ronda <b>acima</b> do melhor do grupo — espaço para apertar.`;
      }
    } else {
      conclusion = `Score típico esperado num par 72: ≈ ${Math.round(72 + me_impact.total)}`;
    }
  }

  return { strengths, weaknesses, context, conclusion };
}

function ReadingCard({ row, reading }: { row: Row; reading: Reading }) {
  return (
    <div style={{
      border: `2px solid ${COLORS[row.i]}`,
      borderRadius: "var(--radius)",
      overflow: "hidden",
    }}>
      <div style={{
        background: COLORS[row.i], padding: "8px 14px",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <span className="fw-800 fs-14" style={{ color: "#fff" }}>{firstName(row.s.player.name)}</span>
        <span className="fs-11" style={{ color: "rgba(255,255,255,.85)" }}>
          HCP {row.s.player.hcp ?? "–"} · {row.s.player.escalao ?? ""}
        </span>
      </div>
      <div style={{ padding: 12 }}>
        <Bulleted title="✅ Pontos fortes" color={SC.good} items={reading.strengths} />
        <Bulleted title="⚠️ A melhorar" color={SC.danger} items={reading.weaknesses} />
        <Bulleted title="🧭 Contexto" color="var(--color-info)" items={reading.context} />
        {reading.conclusion && (
          <div style={{
            marginTop: 10, padding: 8, borderRadius: 6,
            background: COLORS_LIGHT[row.i], color: "var(--text-2)",
            fontSize: 12, lineHeight: 1.5,
          }}
          dangerouslySetInnerHTML={{ __html: `<b>📌 Resumo:</b> ${reading.conclusion}` }}
          />
        )}
      </div>
    </div>
  );
}

function Bulleted({ title, color, items }: { title: string; color: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="uppercase fw-800 fs-10 mb-4" style={{ color, letterSpacing: "0.05em" }}>{title}</div>
      <ul style={{ margin: 0, padding: "0 0 0 18px" }}>
        {items.map((t, i) => (
          <li
            key={i}
            style={{ fontSize: 12, lineHeight: 1.55, color: "var(--text-2)", marginBottom: 3 }}
            dangerouslySetInnerHTML={{ __html: t }}
          />
        ))}
      </ul>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Componente principal
   ═══════════════════════════════════════════════════════════════════ */

export default function PerfilJogadorSection({ slots, allAgg, statsDb, period }: {
  slots: Slot[];
  allAgg: (AggStats | null)[];
  statsDb: PlayerStatsDb;
  period: PeriodKey;
}) {
  const rows: Row[] = slots
    .map((s, i) => ({ s, agg: allAgg[i], i }))
    .filter((x): x is Row => x.agg != null);
  if (rows.length < 2) return null;

  return (
    <div className="card">
      <div className="d-flex items-center gap-10 flex-wrap mb-10">
        <div className="h-md mb-0">📖 Leitura Rápida — Perfil de cada jogador</div>
        <span className="muted fs-11">· período: <b>{periodLabel(period)}</b></span>
      </div>
      <div className="muted fs-12 mb-14">
        Em linguagem natural e sem jargão: onde cada jogador é mais forte, onde perde pancadas, e uma ronda "típica" projectada.
      </div>

      <div className="d-flex flex-col gap-14">
        {/* 1. Ronda típica */}
        <RondaTipica rows={rows} />

        {/* 2. Comparações visuais (barras) */}
        <div className="card p-12" style={{ background: "var(--bg-1)" }}>
          <div className="fw-800 fs-14 mb-8">📊 Comparação a par a par</div>
          <VisualComparisons rows={rows} />
        </div>

        {/* 3. Leitura narrativa por jogador */}
        <div>
          <div className="fw-800 fs-14 mb-8">📝 Leitura individual</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(rows.length, 2)}, 1fr)`, gap: 12 }}>
            {rows.map(r => {
              const others = rows.filter(o => o.i !== r.i);
              const reading = buildReading(r, others, statsDb);
              return <ReadingCard key={r.i} row={r} reading={reading} />;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
