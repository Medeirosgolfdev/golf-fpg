/**
 * src/pages/jogadores/views/AnalysisView.tsx
 *
 * Vista "Análises": KPIs de SD/gross, histograma vs par, trajectória,
 * recordes, detalhe WHS, simulador de rondas, janela WHS e análise por campo.
 */
import React, { useMemo, useState } from "react";
import type { PlayerPageData, RoundData, HcpInfo } from "../../../data/playerDataLoader";
import { shortDate, fmtSign } from "../../../utils/format";
import { numSafe, meanArr, stdevArr, linearSlope, median } from "../../../utils/mathUtils";
import { sc3m, SC } from "../../../utils/scoreDisplay";
import UiKpiCard from "../../../ui/KpiCard";
import CollapseCard from "../../../ui/CollapseCard";
import EmptyState from "../../../ui/EmptyState";
import { RoundSimulator } from "../../../ui/RoundSimulator";
import { Last20Table } from "../../../ui/Last20Table";
import { CrossAnalysis } from "../../../ui/CrossAnalysis";

export default function AnalysisView({ data }: { data: PlayerPageData }) {
  const [histPeriod, setHistPeriod] = useState(12);
  const [recPeriod, setRecPeriod] = useState(12);
  const [trajPeriod, setTrajPeriod] = useState(12);

  // Flatten all rounds desc
  const allRoundsDesc = useMemo(() => {
    const arr: (RoundData & { course: string })[] = [];
    data.DATA.forEach(c => c.rounds.forEach(r => arr.push({ ...r, course: c.course })));
    arr.sort((a, b) => (b.dateSort || 0) - (a.dateSort || 0));
    return arr;
  }, [data]);

  const rounds18 = useMemo(() => allRoundsDesc.filter(r => r.holeCount === 18 || (r as RoundData & { hc?: number }).hc === 18), [allRoundsDesc]);
  const rounds18g = useMemo(() => rounds18.filter(r => numSafe(r.gross) != null && Number(r.gross) > 50 && Number(r.gross) < 200), [rounds18]);

  // KPIs
  const last5 = rounds18g.slice(0, 5);
  const last20 = rounds18g.slice(0, 20);
  const kpiGross5 = meanArr(last5.map(r => r.gross));
  const kpiGross20 = meanArr(last20.map(r => r.gross));

  // whs20 = last 20 rounds WITH a valid SD (real WHS window — treino rounds count too)
  const whs20 = useMemo(() =>
    allRoundsDesc.filter(r => numSafe(r.sd) != null).slice(0, 20),
    [allRoundsDesc]
  );

  // whsPosMap: scoreId → position 1-20 in the WHS window
  const whsPosMap = useMemo(() => {
    const m = new Map<string, number>();
    whs20.forEach((r, i) => m.set(r.scoreId, i + 1));
    return m;
  }, [whs20]);

  // Display table: all non-training rounds up to (and including) the 20th WHS round + a few extra
  const last20Table = useMemo(() => {
    const nonTraining = allRoundsDesc.filter(r => !r._isTreino);
    // Find index of the 20th WHS round in the full list
    const last20thId = whs20.length === 20 ? whs20[19].scoreId : null;
    const cutoffIdx  = last20thId
      ? nonTraining.findIndex(r => r.scoreId === last20thId)
      : -1;
    const showUntil = Math.max(25, cutoffIdx + 4);
    return nonTraining.slice(0, showUntil);
  }, [allRoundsDesc, whs20]);

  // Best 8 SD in WHS window — Map<scoreId, rank (1-8)>
  const best8 = useMemo(() => {
    const indexed = whs20.map(r => ({ id: r.scoreId, sd: numSafe(r.sd)! }))
      .sort((a, b) => a.sd - b.sd);
    const map = new Map<string, number>();
    indexed.slice(0, 8).forEach((x, rank) => map.set(x.id, rank + 1));
    return map;
  }, [whs20]);

  // Period filter for analysis — only 18-hole rounds with valid gross (consistent with KPI cards)
  function filterByPeriod(months: number): (RoundData & { course: string })[] {
    if (months <= 0) return rounds18g;
    const cutoff = Date.now() - months * 30.44 * 24 * 3600 * 1000;
    return rounds18g.filter(r => r.dateSort >= cutoff);
  }

  // ── Extra KPI calculations ───────────────────────────────────────────────
  const rounds18sd = useMemo(() =>
    rounds18.filter(r => numSafe(r.sd) != null).slice(0, 20), [rounds18]);
  const sdLast5  = useMemo(() => meanArr(rounds18sd.slice(0, 5).map(r => Number(r.sd))), [rounds18sd]);
  const sdLast20 = useMemo(() => meanArr(rounds18sd.map(r => Number(r.sd))), [rounds18sd]);
  const sdSigma  = useMemo(() => stdevArr(rounds18sd.map(r => Number(r.sd))), [rounds18sd]);
  const bestSdRound = useMemo(() => {
    const valid = rounds18.filter(r => numSafe(r.sd) != null);
    if (!valid.length) return null;
    return valid.reduce((best, r) => Number(r.sd) < Number(best.sd) ? r : best);
  }, [rounds18]);
  const sdTrend = useMemo(() => {
    const recent = rounds18sd.slice(0, 10);
    if (recent.length < 3) return null;
    const chronological = [...recent].reverse().map(r => Number(r.sd));
    const slope = linearSlope(chronological);
    return slope != null ? { slope, n: recent.length } : null;
  }, [rounds18sd]);

  return (
    <div className="an-wrap">

      {/* ── KPIs ── */}
      <CollapseCard title="Indicadores" icon="📊" defaultOpen={true}>
        <div className="flex-wrap" style={{ display: "flex", gap: 10 }}>
          <KPICard title="SD Médio · Últ. 5" val={sdLast5?.toFixed(1) ?? null}
            delta={sdLast5 != null && sdLast20 != null ? sdLast5 - sdLast20 : null}
            deltaLabel="vs últ. 20"
            sub={`${Math.min(5, rounds18sd.length)} rondas com SD`}
            tip="Média do Score Diferencial das últimas 5 rondas de 18B. Negativo = a melhorar vs média longa." />
          <KPICard title="SD Médio · Últ. 20" val={sdLast20?.toFixed(1) ?? null}
            sub={`${rounds18sd.length} rondas com SD`}
            tip="Média dos Score Diferenciais das últimas 20 rondas de 18 buracos." />
          <KPICard title="Consistência (σ SD)" val={sdSigma?.toFixed(1) ?? null}
            sub="Desvio padrão do SD"
            tip="Desvio padrão do Score Diferencial. Menor = mais consistente." />
          <KPICard title="Melhor SD (carreira)"
            val={bestSdRound ? Number(bestSdRound.sd).toFixed(1) : null}
            sub={bestSdRound ? `${shortDate(bestSdRound.date)} · ${(bestSdRound as RoundData & { course?: string }).course ?? ""}` : undefined}
            accent="var(--color-good)"
            tip="Melhor Score Diferencial de sempre." />
          <KPICard title="Gross Médio · Últ. 5" val={kpiGross5?.toFixed(1) ?? null}
            delta={kpiGross5 != null && kpiGross20 != null ? kpiGross5 - kpiGross20 : null}
            deltaLabel="vs últ. 20"
            sub={`${last5.length} rondas 18B`} />
          <KPICard title="Tendência SD (últ. 10)"
            val={sdTrend != null ? `${sdTrend.slope > 0 ? "+" : ""}${sdTrend.slope.toFixed(2)}` : null}
            sub={sdTrend ? `por ronda · ${sdTrend.n} rondas analisadas` : "mín. 3 rondas necessárias"}
            accent={sdTrend != null
              ? sdTrend.slope < -0.1 ? "var(--color-good)"
              : sdTrend.slope > 0.1  ? "var(--color-danger)"
              : "var(--text-3)" : undefined}
            tip="Inclinação da regressão linear dos SDs das últimas 10 rondas. Negativo = a melhorar por ronda jogada. Independente do tempo." />
        </div>
      </CollapseCard>

      {/* ── Histogram + Trajectory + Records ── */}
      <CollapseCard title="Distribuição · Trajectória · Recordes" icon="📈" defaultOpen={true}>
        <div className="an-grid3" style={{ marginBottom: 0 }}>
          <HistogramCard rounds={filterByPeriod(histPeriod)} period={histPeriod} setPeriod={setHistPeriod} />
          <TrajectoryCard rounds={filterByPeriod(trajPeriod)} period={trajPeriod} setPeriod={setTrajPeriod} />
          <RecordsCard rounds={filterByPeriod(recPeriod)} period={recPeriod} setPeriod={setRecPeriod} />
        </div>
      </CollapseCard>

      {/* ── WHS Detail ── */}
      <CollapseCard title="Handicap — Detalhe WHS" icon="🏌️" defaultOpen={false}>
        <WHSDetail hcp={data.HCP_INFO} bare />
      </CollapseCard>

      {/* ── Round Simulator (SD + Próxima Ronda combinados) ── */}
      <CollapseCard title="Simulador de Rondas" icon="🎯" defaultOpen={false}>
        <RoundSimulator hcp={data.HCP_INFO} whs20={whs20} playerData={data} bare />
      </CollapseCard>

      {/* ── Last 20 Table ── */}
      <CollapseCard title="Janela WHS — Últimas Rondas" icon="📋" defaultOpen={false}>
        <Last20Table data={data} last20Table={last20Table} best8={best8} whsPosMap={whsPosMap} bare />
      </CollapseCard>

      {/* ── Cross Analysis ── */}
      <CollapseCard title="Análise por Campo" icon="🗺️" defaultOpen={false}>
        <CrossAnalysis data={data} bare />
      </CollapseCard>

    </div>
  );
}

/* Adaptador fino → delega na definição única ui/KpiCard (UiKpiCard).
   Mantém a assinatura title/val/accent usada na AnalysisView. */
function KPICard({ title, val, sub, delta, deltaLabel, tip, accent }: {
  title: string; val: string | null; sub?: string;
  delta?: number | null; deltaLabel?: string;
  tip?: string; accent?: string;
}) {
  return (
    <UiKpiCard
      label={title}
      value={val ?? <span style={{ color: "var(--text-3)" }}>–</span>}
      sub={sub}
      delta={delta}
      deltaLabel={deltaLabel}
      tip={tip}
      color={accent}
    />
  );
}

/* ─── Period selector (3m/6m/1a/…/total) ─── */
function PeriodSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <select className="br c-text-2 fs-11" style={{ padding: "2px 6px", border: "1px solid var(--border)", background: "var(--bg-card)" }}
      value={value} onChange={e => onChange(Number(e.target.value))}>
      <option value={3}>3 meses</option>
      <option value={6}>6 meses</option>
      <option value={9}>9 meses</option>
      <option value={12}>1 ano</option>
      <option value={24}>2 anos</option>
      <option value={36}>3 anos</option>
      <option value={0}>Total</option>
    </select>
  );
}

/* ─── Histogram ─── */
function HistogramCard({ rounds, period, setPeriod }: {
  rounds: (RoundData & { course: string })[]; period: number; setPeriod: (n: number) => void;
}) {
  const bins = useMemo(() => {
    const defs = [
      { label: "Excepcional (≤0)", min: -999, max: 0, color: "var(--tier-exceptional)" },
      { label: "Bom (+1 a +5)", min: 1, max: 5, color: "var(--tier-good)" },
      { label: "Razoável (+6 a +10)", min: 6, max: 10, color: "var(--tier-fair)" },
      { label: "Difícil (+11 a +15)", min: 11, max: 15, color: "var(--chart-4)" },
      { label: "Fraco (+16 a +20)", min: 16, max: 20, color: "var(--tier-weak)" },
      { label: "Mau (+21 a +25)", min: 21, max: 25, color: "var(--tier-bad)" },
      { label: "Desastroso (>+25)", min: 26, max: 999, color: "var(--color-danger-dark)" },
    ];
    const diffs: number[] = [];
    for (const r of rounds) {
      if (r.gross != null && r.par != null && Number(r.par) > 0) {
        const diff = Number(r.gross) - Number(r.par);
        diffs.push(diff);
      }
    }
    let maxCount = 0;
    const result = defs.map(d => {
      const count = diffs.filter(v => v >= d.min && v <= d.max).length;
      if (count > maxCount) maxCount = count;
      return { ...d, count };
    });
    const avg = meanArr(diffs) ?? 0;
    const med = median(diffs) ?? 0;
    return { bins: result, maxCount, total: diffs.length, avg, median: med };
  }, [rounds]);

  return (
    <div className="card">
      <div className="d-flex justify-between items-center mb-8">
        <div className="h-xs m-0">Desempenho vs Par</div>
        <PeriodSelect value={period} onChange={setPeriod} />
      </div>
      {bins.total === 0 ? <EmptyState size="sm" message="Sem dados" /> :
        <>
          {bins.bins.map(b => (
            <div key={b.label} className="an-hist-row">
              <div className="an-hist-label">{b.label}</div>
              <div className="flex-1">
                <div className="an-hist-bar" style={{
                  width: `${bins.maxCount > 0 ? Math.max(4, (b.count / bins.maxCount) * 100) : 4}%`,
                  background: b.color
                }}>{b.count > 0 ? b.count : ""}</div>
              </div>
            </div>
          ))}
          <div className="muted mt-6 ta-c fs-11">
            {bins.total} rondas · Média: +{bins.avg.toFixed(1)} · Mediana: +{bins.median.toFixed(0)}
          </div>
        </>
      }
    </div>
  );
}

/* ─── Trajectory ─── */
function TrajectoryCard({ rounds, period, setPeriod }: {
  rounds: (RoundData & { course: string })[]; period: number; setPeriod: (n: number) => void;
}) {
  const stats = useMemo(() => {
    const grosses: number[] = [];
    for (const r of rounds) {
      if (r.gross != null) {
        grosses.push(Number(r.gross));
      }
    }
    if (grosses.length < 3) return null;
    const overall = grosses.reduce((a, b) => a + b, 0) / grosses.length;
    const last5 = grosses.slice(0, Math.min(5, grosses.length));
    const last5avg = last5.reduce((a, b) => a + b, 0) / last5.length;
    const last10 = grosses.slice(0, Math.min(10, grosses.length));
    const last10avg = last10.reduce((a, b) => a + b, 0) / last10.length;
    const diff5 = last5avg - overall;
    const diff10 = last10avg - overall;
    return { overall: overall.toFixed(1), last5: last5avg.toFixed(1), last10: last10avg.toFixed(1), diff5, diff10, n: grosses.length };
  }, [rounds]);

  return (
    <div className="card">
      <div className="d-flex justify-between items-center mb-8">
        <div className="h-xs m-0">Trajectória</div>
        <PeriodSelect value={period} onChange={setPeriod} />
      </div>
      {!stats ? <div className="muted">Poucos dados</div> : (
        <div className="grid-3-tc">
          <div className="bg-detail br-lg jog-cross-pad">
            <div className="muted fs-10">ÚLTIMAS 5</div>
            <div className="kpi-val">{stats.last5}</div>
 <div className="fw-600 fs-11" style={{ color: sc3m(stats.diff5, 1, 1) }}>
              {fmtSign(stats.diff5, 1)}
            </div>
          </div>
          <div className="bg-detail br-lg jog-cross-pad">
            <div className="muted fs-10">ÚLTIMAS 10</div>
            <div className="kpi-val">{stats.last10}</div>
 <div className="fw-600 fs-11" style={{ color: sc3m(stats.diff10, 1, 1) }}>
              {fmtSign(stats.diff10, 1)}
            </div>
          </div>
          <div className="bg-detail br-lg jog-cross-pad">
            <div className="muted fs-10">CARREIRA</div>
            <div className="kpi-val">{stats.overall}</div>
            <div className="muted fs-10">{stats.n} rondas</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Records ─── */
function RecordsCard({ rounds, period, setPeriod }: {
  rounds: (RoundData & { course: string })[]; period: number; setPeriod: (n: number) => void;
}) {
  const records = useMemo(() => {
    const r18 = rounds.filter(r => r.holeCount === 18 && numSafe(r.gross) != null && Number(r.gross) > 50 && Number(r.gross) < 200);
    if (r18.length === 0) return null;
    const byGross = [...r18].sort((a, b) => Number(a.gross) - Number(b.gross));
    const bySd = [...r18].filter(r => r.sd != null).sort((a, b) => Number(a.sd) - Number(b.sd));
    const byStb = [...r18].filter(r => r.stb != null).sort((a, b) => Number(b.stb!) - Number(a.stb!));
    return {
      bestGross: byGross[0],
      bestSd: bySd[0],
      bestStb: byStb[0],
      worstGross: byGross[byGross.length - 1],
    };
  }, [rounds]);

  function RecLine({ label, r, field }: { label: string; r: RoundData & { course: string } | undefined; field: "gross" | "sd" | "stb" }) {
    if (!r) return null;
    const val = field === "gross" ? r.gross : field === "sd" ? r.sd : r.stb;
    return (
      <div className="jog-field-line">
        <span>{label}</span>
        <span><b>{val}</b> <span className="muted">({shortDate(r.date)} · {r.course})</span></span>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="d-flex justify-between items-center mb-8">
        <div className="h-xs m-0">Recordes Pessoais</div>
        <PeriodSelect value={period} onChange={setPeriod} />
      </div>
      {!records ? <EmptyState size="sm" message="Sem dados" /> : (
        <div>
          <RecLine label="🏆 Melhor Gross" r={records.bestGross} field="gross" />
          <RecLine label="📉 Melhor SD" r={records.bestSd} field="sd" />
          <RecLine label="⭐ Melhor Stb" r={records.bestStb} field="stb" />
          <RecLine label="💀 Pior Gross" r={records.worstGross} field="gross" />
        </div>
      )}
    </div>
  );
}

/* ─── WHS Detail ─── */
export function WHSDetail({ hcp, bare }: { hcp: HcpInfo; bare?: boolean }) {
  const Wrap = ({ children }: { children: React.ReactNode }) =>
    bare ? <>{children}</> : <div className="card"><div className="h-xs">Handicap — Detalhe WHS</div>{children}</div>;
  if (hcp.current == null) {
    return <Wrap><EmptyState size="sm" message="Sem dados WHS disponíveis" /></Wrap>;
  }
  return (
    <Wrap>
      <div className="jog-record-grid">
        <UiKpiCard label="Mínimo atingido" value={hcp.lowHcp?.toFixed(1) ?? "–"}
          color="var(--color-good)" accentBorder="var(--color-good)" />
        <UiKpiCard label="Actual" value={hcp.current.toFixed(1)}
          color="var(--chart-2)" accentBorder="var(--chart-2)"
          sub={hcp.lowHcp != null
            ? <span style={{ color: SC.danger, fontWeight: 600 }}>+{(hcp.current - hcp.lowHcp).toFixed(1)} do mínimo</span>
            : undefined} />
        <UiKpiCard label={`Média ${hcp.qtyCalc || 8} melhores`} value={hcp.scoreAvg?.toFixed(1) ?? "–"} />
      </div>
 <div className="fs-11 c-text-3 d-flex" style={{ gap: 14, borderTop: "1px solid var(--bg)", paddingTop: 8 }}>
        {hcp.softCap != null && <span>Soft cap: <b>{hcp.softCap.toFixed(1)}</b></span>}
        {hcp.hardCap != null && <span>Hard cap: <b>{hcp.hardCap.toFixed(1)}</b></span>}
        {hcp.qtyScores != null && hcp.qtyCalc != null && (
          <span>Cálculo: <b>{hcp.qtyCalc}</b> de <b>{hcp.qtyScores}</b> scores
            {hcp.adjustTotal != null && hcp.adjustTotal !== 0 && ` (ajuste: ${hcp.adjustTotal})`}
          </span>
        )}
      </div>
    </Wrap>
  );
}
